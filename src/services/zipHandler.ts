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
    console.log('📊 Updating status:', { status, progress, message });
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
    } catch (error) {
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

      console.log('🗜️ Processing ZIP file...');
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
      console.log('📋 Repository details:', { repoOwner, repoName, targetBranch });

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

      await this.updateStatus(
        'success',
        100,
        `Successfully uploaded ${processedFiles.size} files to GitHub`
      );

      // Clear the status after a delay
      setTimeout(() => {
        this.updateStatus('idle', 0, '');
      }, 5000);
    } catch (error) {
      console.error('❌ Error uploading files:', error);
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
        console.log(`📁 Skipping entry: ${path}`);
        continue;
      }

      const normalizedPath = path.startsWith('project/') ? path.slice(8) : path;

      if (ig.ignores(normalizedPath)) {
        console.log(`🚫 Ignoring file: ${normalizedPath}`);
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

    await this.updateStatus('uploading', 30, 'Creating file blobs...');

    // Create blobs for all files
    const treeItems = await this.createBlobs(processedFiles, repoOwner, repoName);

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
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async createBlobs(
    files: Map<string, string>,
    repoOwner: string,
    repoName: string
  ): Promise<Array<{ path: string; mode: string; type: string; sha: string }>> {
    const results: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    const totalFiles = files.size;
    let completedFiles = 0;

    const rateLimitHandler = new RateLimitHandler();
    const rateLimit = await this.githubService.request('GET', '/rate_limit');
    const remainingRequests = rateLimit.resources.core.remaining;
    const resetTime = rateLimit.resources.core.reset;

    if (remainingRequests < 10) {
      const now = Math.floor(Date.now() / 1000);
      const waitTime = resetTime - now;

      // If reset is happening soon (within 2 minutes), wait for it
      if (waitTime <= 120) {
        console.log(`Waiting ${waitTime} seconds for rate limit reset...`);
        await rateLimitHandler.sleep(waitTime * 1000);
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

    const queue = new Queue(1); // Using a queue for serial execution

    // Reset rate limit handler counter before starting batch
    rateLimitHandler.resetRequestCount();

    let fileCount = 0;
    for (const [path, content] of files.entries()) {
      await queue.add(async () => {
        let success = false;
        while (!success) {
          try {
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

            // Reset request counter every 10 files to maintain burst behavior
            fileCount++;
            if (fileCount % 10 === 0) {
              rateLimitHandler.resetRequestCount();
            }

            completedFiles++;
            await this.updateStatus(
              'uploading',
              20 + Math.floor((completedFiles / totalFiles) * 60),
              `Uploading files (${completedFiles}/${totalFiles})...`
            );
          } catch (error) {
            if (error instanceof Response && error.status === 403) {
              await rateLimitHandler.handleRateLimit(error);
              // Retry the current file by decrementing the loop counter
              completedFiles--;
            } else {
              throw error;
            }
          }
        }
      });
    }

    return results;
  }
}
