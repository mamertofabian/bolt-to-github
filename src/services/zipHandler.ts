import type { GitHubService } from './GitHubService';
import { toBase64 } from '../lib/common';
import { ZipProcessor } from '../lib/zip';
import ignore from 'ignore';
import type { ProcessingStatus, UploadStatusState } from '$lib/types';
import { RateLimitHandler } from './RateLimitHandler';
import { Queue } from '../lib/Queue';

export class ZipHandler {
  constructor(
    private githubService: GitHubService,
    private sendStatus: (status: UploadStatusState) => void
  ) {}

  private updateStatus = async (
    status: ProcessingStatus,
    progress: number = 0,
    message: string = ''
  ) => {
    // Send status update to UI
    this.sendStatus({ status, progress, message });
  };

  private ensureBranchExists = async (
    repoOwner: string,
    repoName: string,
    targetBranch: string
  ) => {
    // Check if branch exists
    let branchExists = true;
    try {
      await this.githubService.request(
        'GET',
        `/repos/${repoOwner}/${repoName}/branches/${targetBranch}`
      );
    } catch (_) {
      branchExists = false;
    }

    // If branch doesn't exist, create it from default branch
    if (!branchExists) {
      await this.updateStatus('uploading', 18, `Creating branch ${targetBranch}...`);
      const defaultBranch = await this.githubService.request(
        'GET',
        `/repos/${repoOwner}/${repoName}/git/refs/heads/main`
      );
      await this.githubService.request('POST', `/repos/${repoOwner}/${repoName}/git/refs`, {
        ref: `refs/heads/${targetBranch}`,
        sha: defaultBranch.object.sha,
      });
    }
  };

  public processZipFile = async (
    blob: Blob,
    currentProjectId: string | null,
    commitMessage: string
  ) => {
    // Add size validation (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
    if (blob.size > MAX_FILE_SIZE) {
      await this.updateStatus(
        'error',
        0,
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      );
      throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    if (!this.githubService) {
      await this.updateStatus(
        'error',
        0,
        'GitHub service not initialized. Please set your GitHub token.'
      );
      throw new Error('GitHub service not initialized. Please set your GitHub token.');
    }

    if (!currentProjectId) {
      await this.updateStatus(
        'error',
        0,
        'Project ID not found. Make sure you are on a Bolt project page.'
      );
      throw new Error('Project ID not found. Make sure you are on a Bolt project page.');
    }

    try {
      await this.updateStatus('uploading', 0, 'Processing ZIP file...');

      // Start processing the ZIP file
      const files = await ZipProcessor.processZipBlob(blob);

      await this.updateStatus('uploading', 10, 'Preparing files...');

      const { repoOwner, projectSettings } = await chrome.storage.sync.get([
        'repoOwner',
        'projectSettings',
      ]);

      if (!projectSettings?.[currentProjectId]) {
        throw new Error('Project settings not found for this project');
      }

      const repoName = projectSettings[currentProjectId].repoName;
      const branch = projectSettings[currentProjectId].branch;

      if (!repoOwner || !repoName) {
        throw new Error('Repository details not configured');
      }

      const targetBranch = branch || 'main';
      // Repository details identified

      await this.updateStatus('uploading', 15, 'Checking repository...');
      await this.githubService.ensureRepoExists(repoOwner, repoName);

      // Check if repo is empty and needs initialization
      const isEmpty = await this.githubService.isRepoEmpty(repoOwner, repoName);
      if (isEmpty) {
        await this.updateStatus('uploading', 18, 'Initializing empty repository...');
        await this.githubService.initializeEmptyRepo(repoOwner, repoName, targetBranch);
      }

      await this.ensureBranchExists(repoOwner, repoName, targetBranch);

      const processedFiles = await this.processFilesWithGitignore(files);

      await this.updateStatus('uploading', 20, 'Getting repository information...');

      await this.uploadToGitHub(processedFiles, repoOwner, repoName, targetBranch, commitMessage);

      // Clear the status after a delay
      setTimeout(() => {
        this.updateStatus('idle', 0, '');
      }, 5000);
    } catch (error) {
      // Error handling
      await this.updateStatus(
        'error',
        0,
        `Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  };

  private async processFilesWithGitignore(
    files: Map<string, string>
  ): Promise<Map<string, string>> {
    const processedFiles = new Map<string, string>();
    const ig = ignore();

    // Check for .gitignore and initialize ignore patterns
    const gitignoreContent = files.get('.gitignore') || files.get('project/.gitignore');
    if (gitignoreContent) {
      ig.add(gitignoreContent.split('\n'));
    } else {
      // Default ignore patterns for common directories when no .gitignore exists
      ig.add([
        'node_modules/',
        'dist/',
        'build/',
        '.DS_Store',
        'coverage/',
        '.env',
        '.env.local',
        '.env.*.local',
        '*.log',
        'npm-debug.log*',
        'yarn-debug.log*',
        'yarn-error.log*',
        '.idea/',
        '.vscode/',
        '*.suo',
        '*.ntvs*',
        '*.njsproj',
        '*.sln',
        '*.sw?',
        '.next/',
        'out/',
        '.nuxt/',
        '.cache/',
        '.temp/',
        'tmp/',
      ]);
    }

    for (const [path, content] of files.entries()) {
      if (path.endsWith('/') || !content.trim()) {
        // Skip directory entries and empty files
        continue;
      }

      const normalizedPath = path.startsWith('project/') ? path.slice(8) : path;

      if (ig.ignores(normalizedPath)) {
        // Skip files that match .gitignore patterns
        continue;
      }

      processedFiles.set(normalizedPath, content);
    }

    return processedFiles;
  }

  private async uploadToGitHub(
    processedFiles: Map<string, string>,
    repoOwner: string,
    repoName: string,
    targetBranch: string,
    commitMessage: string
  ) {
    // Get the current commit SHA
    const baseRef = await this.githubService.request(
      'GET',
      `/repos/${repoOwner}/${repoName}/git/refs/heads/${targetBranch}`
    );
    const baseSha = baseRef.object.sha;

    const baseCommit = await this.githubService.request(
      'GET',
      `/repos/${repoOwner}/${repoName}/git/commits/${baseSha}`
    );
    const baseTreeSha = baseCommit.tree.sha;

    // Fetch the full tree with content
    await this.updateStatus('uploading', 30, 'Analyzing repository changes...');
    const existingTree = await this.githubService.request(
      'GET',
      `/repos/${repoOwner}/${repoName}/git/trees/${baseTreeSha}?recursive=1`
    );

    // Create a map of existing file paths to their SHAs
    const existingFiles = new Map<string, string>();
    if (existingTree.tree) {
      existingTree.tree.forEach((item: { path: string; sha: string; type: string }) => {
        if (item.type === 'blob') {
          existingFiles.set(item.path, item.sha);
        }
      });
    }

    // Determine which files have changed
    const changedFiles = new Map<string, string>();
    for (const [path, content] of processedFiles.entries()) {
      // If file doesn't exist in repo, it's changed
      if (!existingFiles.has(path)) {
        changedFiles.set(path, content);
      } else {
        // For existing files, compare content hash
        const contentHash = await this.calculateGitBlobHash(content);
        if (existingFiles.get(path) !== contentHash) {
          changedFiles.set(path, content);
        }
      }
    }

    // If no files have changed, skip the commit process
    if (changedFiles.size === 0) {
      await this.updateStatus(
        'success',
        100,
        'No changes detected. Repository is already up to date.'
      );
      return;
    }
    await this.updateStatus(
      'uploading',
      40,
      `Creating ${changedFiles.size} file blobs (of ${processedFiles.size} total files)...`
    );

    // Only create blobs for changed files
    const newTreeItems = await this.createBlobs(changedFiles, repoOwner, repoName);

    // Add unchanged files to the tree with their existing SHAs
    const treeItems = [...newTreeItems];
    for (const [path, sha] of existingFiles.entries()) {
      // Only add if the file still exists in our processed files and hasn't changed
      if (processedFiles.has(path) && !changedFiles.has(path)) {
        treeItems.push({
          path,
          mode: '100644',
          type: 'blob',
          sha,
        });
      }
    }

    await this.updateStatus('uploading', 70, 'Creating tree...');

    // Create a new tree
    const newTree = await this.githubService.request(
      'POST',
      `/repos/${repoOwner}/${repoName}/git/trees`,
      {
        base_tree: baseTreeSha,
        tree: treeItems,
      }
    );

    await this.updateStatus('uploading', 80, 'Creating commit...');

    // Create a new commit
    const newCommit = await this.githubService.request(
      'POST',
      `/repos/${repoOwner}/${repoName}/git/commits`,
      {
        message: commitMessage,
        tree: newTree.sha,
        parents: [baseSha],
      }
    );

    await this.updateStatus('uploading', 90, 'Updating branch...');

    // Update the reference
    await this.githubService.request(
      'PATCH',
      `/repos/${repoOwner}/${repoName}/git/refs/heads/${targetBranch}`,
      {
        sha: newCommit.sha,
        force: false,
      }
    );

    await this.updateStatus(
      'success',
      100,
      `Successfully uploaded ${changedFiles.size} files to GitHub`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate the Git blob hash for a string content
   * GitHub calculates blob SHA using the format: "blob " + content.length + "\0" + content
   *
   * Optimized for better performance with:
   * 1. Pre-allocated buffer to avoid multiple array creations
   * 2. Single TextEncoder instance
   * 3. More efficient hex string generation
   */
  private async calculateGitBlobHash(content: string): Promise<string> {
    const encoder = new TextEncoder();

    // Prepare the prefix string once
    const prefixStr = `blob ${content.length}\0`;

    // Calculate total buffer size needed up front
    const totalLength = new TextEncoder().encode(prefixStr + content).length;

    // Encode directly into a single buffer
    let bytes: Uint8Array;

    // Modern browsers support encodeInto for better performance
    if (typeof encoder.encodeInto === 'function') {
      bytes = new Uint8Array(totalLength);
      const prefixResult = encoder.encodeInto(prefixStr, bytes);
      if (prefixResult && typeof prefixResult.written === 'number') {
        encoder.encodeInto(content, bytes.subarray(prefixResult.written));
      }
    } else {
      // Fallback for browsers without encodeInto
      const prefixBytes = encoder.encode(prefixStr);
      const contentBytes = encoder.encode(content);

      bytes = new Uint8Array(prefixBytes.length + contentBytes.length);
      bytes.set(prefixBytes);
      bytes.set(contentBytes, prefixBytes.length);
    }

    // Calculate SHA-1 hash
    const hashBuffer = await crypto.subtle.digest('SHA-1', bytes);

    // Convert to hex string using the imported utility function
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private async createBlobs(
    files: Map<string, string>,
    repoOwner: string,
    repoName: string
  ): Promise<Array<{ path: string; mode: string; type: string; sha: string }>> {
    const results: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    const totalFiles = files.size;
    let completedFiles = 0;

    // Check rate limit status at the beginning
    const rateLimit = await this.githubService.request('GET', '/rate_limit');
    const remainingRequests = rateLimit.resources.core.remaining;
    const resetTime = rateLimit.resources.core.reset;
    const now = Math.floor(Date.now() / 1000);
    const waitTime = resetTime - now;

    // Monitor rate limit info internally

    // Warn if rate limit is low
    if (remainingRequests < files.size + 10) {
      await this.updateStatus(
        'uploading',
        40,
        `Rate limit warning: ${remainingRequests} requests remaining of ${files.size} needed`
      );
    }

    // If very low on remaining requests, wait for reset if it's soon
    if (remainingRequests < 10) {
      // If reset is happening soon (within 5 minutes), wait for it
      if (waitTime <= 300) {
        await this.updateStatus(
          'uploading',
          40,
          `Waiting ${Math.ceil(waitTime)} seconds for rate limit reset...`
        );
        await this.sleep(waitTime * 1000);
        // Recheck rate limit after waiting
        const newRateLimit = await this.githubService.request('GET', '/rate_limit');
        if (newRateLimit.resources.core.remaining < 10) {
          throw new Error('Insufficient API rate limit remaining even after waiting for reset');
        }
      } else {
        throw new Error(
          `Insufficient API rate limit remaining. Reset in ${Math.ceil(waitTime / 60)} minutes`
        );
      }
    }

    // Create an enhanced rate limit handler with exponential backoff
    const rateLimitHandler = new RateLimitHandler();
    const queue = new Queue(1); // Using a queue for serial execution with concurrency of 1

    // Reset rate limit handler counter before starting batch
    rateLimitHandler.resetRequestCount();

    // Process files in batches of max 30 files to avoid overwhelming GitHub
    const MAX_BATCH_SIZE = 30;
    const fileBatches: Array<Map<string, string>> = [];

    // Split files into batches
    let currentBatch = new Map<string, string>();
    let currentBatchSize = 0;

    for (const [path, content] of files.entries()) {
      currentBatch.set(path, content);
      currentBatchSize++;

      if (currentBatchSize >= MAX_BATCH_SIZE) {
        fileBatches.push(currentBatch);
        currentBatch = new Map<string, string>();
        currentBatchSize = 0;
      }
    }

    // Add the last batch if it has any files
    if (currentBatchSize > 0) {
      fileBatches.push(currentBatch);
    }

    // Process each batch with a pause between batches
    for (let batchIndex = 0; batchIndex < fileBatches.length; batchIndex++) {
      const batch = fileBatches[batchIndex];
      const batchNumber = batchIndex + 1;

      await this.updateStatus(
        'uploading',
        40 + Math.floor((batchIndex / fileBatches.length) * 30),
        `Processing batch ${batchNumber}/${fileBatches.length} (${batch.size} files)...`
      );

      // Add a pause between batches to avoid rate limits
      if (batchIndex > 0) {
        await this.sleep(1000); // 1 second pause between batches
      }

      let fileCount = 0;
      for (const [path, content] of batch.entries()) {
        await queue.add(async () => {
          let success = false;
          let attempts = 0;
          const maxAttempts = 5;

          while (!success && attempts < maxAttempts) {
            try {
              attempts++;
              await rateLimitHandler.beforeRequest();

              const blobData = await this.githubService.request(
                'POST',
                `/repos/${repoOwner}/${repoName}/git/blobs`,
                {
                  content: toBase64(content),
                  encoding: 'base64',
                }
              );

              results.push({
                path,
                mode: '100644',
                type: 'blob',
                sha: blobData.sha,
              });

              success = true;
              rateLimitHandler.resetRetryCount();

              // Reset request counter periodically to maintain burst behavior
              fileCount++;
              if (fileCount % 5 === 0) {
                rateLimitHandler.resetRequestCount();
                await this.sleep(500); // Brief pause every 5 files
              }

              completedFiles++;
              if (completedFiles % 5 === 0 || completedFiles === totalFiles) {
                await this.updateStatus(
                  'uploading',
                  40 + Math.floor((completedFiles / totalFiles) * 30),
                  `Uploading files (${completedFiles}/${totalFiles})...`
                );
              }
            } catch (error) {
              const errorObj = error as Error & {
                status?: number;
                response?: { status: number };
                message: string;
              };

              // Handle rate limit errors (HTTP 403 with specific message)
              if (
                (errorObj instanceof Response && errorObj.status === 403) ||
                (errorObj.response && errorObj.response.status === 403) ||
                (typeof errorObj.message === 'string' &&
                  (errorObj.message.includes('rate limit') ||
                    errorObj.message.includes('secondary rate limits')))
              ) {
                // Calculate exponential backoff time
                const baseDelay = 1000; // Start with 1 second
                const maxDelay = 60000; // Max 1 minute
                const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), maxDelay);

                // Log handled in status update
                await this.updateStatus(
                  'uploading',
                  40 + Math.floor((completedFiles / totalFiles) * 30),
                  `Rate limit hit. Waiting ${Math.ceil(delay / 1000)}s before retry...`
                );

                await this.sleep(delay);
                // Handle rate limit with appropriate parameter type
                if (errorObj instanceof Response) {
                  await rateLimitHandler.handleRateLimit(errorObj);
                } else {
                  // For other error types, just wait using our own sleep method
                  await this.sleep(2000 * attempts);
                }

                // Don't increment completedFiles as we're retrying
              } else if (attempts < maxAttempts) {
                // For non-rate limit errors, retry a few times with increasing delay
                const delay = 1000 * attempts;
                // Log handled in status update
                await this.sleep(delay);
              } else {
                // Final failure after multiple attempts
                await this.updateStatus(
                  'error',
                  40,
                  `Failed to upload ${path} after ${maxAttempts} attempts`
                );
                throw errorObj;
              }
            }
          }
        });
      }
    }

    return results;
  }
}
