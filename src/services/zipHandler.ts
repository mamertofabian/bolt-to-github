import type { UnifiedGitHubService } from './UnifiedGitHubService';
import { toBase64 } from '../lib/common';
import { ZipProcessor } from '../lib/zip';
import type { ProcessingStatus, UploadStatusState } from '$lib/types';
import { RateLimitHandler } from './RateLimitHandler';
import { Queue } from '../lib/Queue';
import { GitHubComparisonService } from './GitHubComparisonService';
import { processFilesWithGitignore } from '$lib/fileUtils';
import { pushStatisticsActions } from '../lib/stores';
import { createLogger } from '$lib/utils/logger';
import { ChromeStorageService } from '../lib/services/chromeStorage';
import { ReadmeGeneratorService } from './ReadmeGeneratorService';

const logger = createLogger('ZipHandler');

// Type definitions for GitHub API responses
interface GitHubRef {
  object: {
    sha: string;
  };
}

interface GitHubCommit {
  tree: {
    sha: string;
  };
}

interface GitHubTree {
  sha: string;
}

interface GitHubBlob {
  sha: string;
}

interface GitHubRateLimit {
  resources: {
    core: {
      remaining: number;
      reset: number;
    };
  };
}

export class ZipHandler {
  private githubComparisonService: GitHubComparisonService;

  constructor(
    private githubService: UnifiedGitHubService,
    private sendStatus: (status: UploadStatusState) => void
  ) {
    this.githubComparisonService = GitHubComparisonService.getInstance();
    this.githubComparisonService.setGitHubService(githubService);
  }

  private updateStatus = async (
    status: ProcessingStatus,
    progress: number = 0,
    message: string = ''
  ) => {
    // Send status update to UI
    logger.info(`Sending status update: ${status}, ${progress}%, ${message}`);

    // Send the status update and ensure it's properly dispatched
    try {
      this.sendStatus({ status, progress, message });

      // For important status changes, send a duplicate update after a small delay
      // to ensure it's received and processed by the UI
      if (status === 'uploading' && progress === 0) {
        // Initial upload status - critical to show
        setTimeout(() => {
          this.sendStatus({ status, progress, message });
        }, 100);
      } else if (status === 'success' || status === 'error') {
        // Final statuses - critical to show
        setTimeout(() => {
          this.sendStatus({ status, progress, message });
        }, 100);
      }
    } catch (error) {
      logger.error('Error sending status update:', error);
    }
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
    } catch {
      branchExists = false;
    }

    // If branch doesn't exist, create it from default branch
    if (!branchExists) {
      await this.updateStatus('uploading', 18, `Creating branch ${targetBranch}...`);
      const defaultBranch = (await this.githubService.request(
        'GET',
        `/repos/${repoOwner}/${repoName}/git/refs/heads/main`
      )) as GitHubRef;
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

      // Create default project settings if they don't exist
      let repoName: string;
      let branch: string;

      if (!projectSettings?.[currentProjectId]) {
        logger.info('Project settings not found, creating default settings for:', currentProjectId);

        // Use thread-safe method to save project settings
        await ChromeStorageService.saveProjectSettings(currentProjectId, currentProjectId, 'main');

        logger.info('Created default project settings for:', currentProjectId);

        // Use the newly created settings
        repoName = currentProjectId;
        branch = 'main';
      } else {
        // Use existing settings
        repoName = projectSettings[currentProjectId].repoName;
        branch = projectSettings[currentProjectId].branch;
      }

      if (!repoOwner || !repoName) {
        throw new Error('Repository details not configured');
      }

      const targetBranch = branch || 'main';

      // Record push attempt
      await pushStatisticsActions.recordPushAttempt(
        currentProjectId,
        repoOwner,
        repoName,
        targetBranch,
        files.size,
        commitMessage
      );

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

      let processedFiles = await processFilesWithGitignore(files);

      // Generate README if necessary
      processedFiles = ReadmeGeneratorService.processFilesWithReadme(processedFiles, repoName);

      await this.updateStatus('uploading', 20, 'Getting repository information...');

      await this.uploadToGitHub(
        processedFiles,
        repoOwner,
        repoName,
        targetBranch,
        commitMessage,
        currentProjectId
      );

      // Success state will auto-hide in the UI component
      // No need to reset to idle state here as it can cause race conditions
      // The UI will handle hiding the notification after a delay
    } catch (error) {
      // Enhanced error handling with authentication failure detection
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check if this is an authentication failure that requires re-authentication
      const isAuthFailure = this.isAuthenticationFailure(errorMessage);

      if (isAuthFailure) {
        // Handle authentication failure with clear messaging and self-healing attempt
        await this.handleAuthenticationFailure(errorMessage);
      } else {
        // Handle general upload failure
        await this.updateStatus('error', 0, `Failed to upload files: ${errorMessage}`);
      }

      // Record push failure
      try {
        const { repoOwner: errorRepoOwner, projectSettings: errorProjectSettings } =
          await chrome.storage.sync.get(['repoOwner', 'projectSettings']);

        if (errorRepoOwner && errorProjectSettings?.[currentProjectId]) {
          await pushStatisticsActions.recordPushFailure(
            currentProjectId,
            errorRepoOwner,
            errorProjectSettings[currentProjectId].repoName,
            errorProjectSettings[currentProjectId].branch || 'main',
            errorMessage
          );
        }
      } catch (trackingError) {
        logger.error('Failed to record push failure:', trackingError);
      }

      throw error;
    }
  };

  private async uploadToGitHub(
    processedFiles: Map<string, string>,
    repoOwner: string,
    repoName: string,
    targetBranch: string,
    commitMessage: string,
    currentProjectId?: string
  ) {
    // Get the current commit SHA for reference
    const baseRef = (await this.githubService.request(
      'GET',
      `/repos/${repoOwner}/${repoName}/git/refs/heads/${targetBranch}`
    )) as GitHubRef;
    const baseSha = baseRef.object.sha;

    const baseCommit = (await this.githubService.request(
      'GET',
      `/repos/${repoOwner}/${repoName}/git/commits/${baseSha}`
    )) as GitHubCommit;
    const baseTreeSha = baseCommit.tree.sha;

    // Use the GitHubComparisonService to determine which files have changed
    await this.updateStatus('uploading', 30, 'Analyzing repository changes...');

    // Create a progress callback for the comparison service
    const progressCallback = (message: string, progress: number) => {
      // Only log, don't update UI status for intermediate steps
      logger.info(`GitHub comparison: ${message} (${progress}%)`);
    };

    // Compare local files with GitHub repository
    const comparisonResult = await this.githubComparisonService.compareWithGitHub(
      processedFiles,
      repoOwner,
      repoName,
      targetBranch,
      progressCallback
    );

    // Get the repository data and changes
    const { changes, repoData } = comparisonResult;
    const { existingFiles } = repoData;

    // Extract changed files (added or modified) from the comparison result
    const changedFiles = new Map<string, string>();
    changes.forEach((fileChange, path) => {
      if (fileChange.status === 'added' || fileChange.status === 'modified') {
        changedFiles.set(path, fileChange.content);
      }
    });

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
    const newTree = (await this.githubService.request(
      'POST',
      `/repos/${repoOwner}/${repoName}/git/trees`,
      {
        base_tree: baseTreeSha,
        tree: treeItems,
      }
    )) as GitHubTree;

    await this.updateStatus('uploading', 80, 'Creating commit...');

    // Create a new commit
    const newCommit = (await this.githubService.request(
      'POST',
      `/repos/${repoOwner}/${repoName}/git/commits`,
      {
        message: commitMessage,
        tree: newTree.sha,
        parents: [baseSha],
      }
    )) as GitHubCommit & { sha: string };

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

    // Record push success
    if (currentProjectId) {
      try {
        await pushStatisticsActions.recordPushSuccess(
          currentProjectId,
          repoOwner,
          repoName,
          targetBranch
        );
      } catch (trackingError) {
        logger.error('Failed to record push success:', trackingError);
      }
    }
  }

  /**
   * Check if an error message indicates an authentication failure
   */
  private isAuthenticationFailure(errorMessage: string): boolean {
    const authFailureIndicators = [
      'Re-authentication required',
      'Failed to get GitHub token',
      'Failed to get GitHub App token',
      'TOKEN_EXPIRED_NO_REFRESH',
      'TOKEN_RENEWAL_FAILED',
      'GitHub App authentication expired',
      'Please re-authenticate',
      'authentication.* expired',
      'invalid.*token',
      'unauthorized',
      'token.*invalid',
      'authentication.*failed',
    ];

    return authFailureIndicators.some((indicator) => new RegExp(indicator, 'i').test(errorMessage));
  }

  /**
   * Handle authentication failure with clear messaging and self-healing attempt
   */
  private async handleAuthenticationFailure(errorMessage: string): Promise<void> {
    logger.warn('🔐 Authentication failure detected:', errorMessage);

    // Show clear authentication failure message with action
    await this.updateStatus(
      'error',
      0,
      'GitHub authentication expired. Please reconnect your GitHub account via bolt2github.com'
    );

    // Attempt self-healing: trigger re-authentication flow
    try {
      await this.triggerReAuthentication();
    } catch (reauthError) {
      logger.error('Failed to trigger re-authentication:', reauthError);
    }
  }

  /**
   * Trigger re-authentication flow
   */
  private async triggerReAuthentication(): Promise<void> {
    try {
      // Import SupabaseAuthService dynamically to avoid circular dependencies
      const { SupabaseAuthService } = await import('../content/services/SupabaseAuthService');
      const authService = SupabaseAuthService.getInstance();

      // Clear any cached authentication state
      await authService.logout();

      // Trigger aggressive detection mode for quicker re-authentication
      authService.enterPostConnectionMode();

      logger.info('🔄 Re-authentication flow triggered');

      // Also send message to background script to open bolt2github.com for re-authentication
      try {
        await chrome.runtime.sendMessage({
          type: 'OPEN_REAUTHENTICATION',
          data: {
            reason: 'Token expired during upload',
            action: 'reconnect_github',
          },
        });
      } catch (messageError) {
        // Background script might not be available, ignore
        logger.warn('Could not send re-authentication message to background:', messageError);
      }
    } catch (error) {
      logger.error('Error in triggerReAuthentication:', error);
      throw error;
    }
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

    // Check rate limit status at the beginning
    const rateLimit = (await this.githubService.request('GET', '/rate_limit')) as GitHubRateLimit;
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
        const newRateLimit = (await this.githubService.request(
          'GET',
          '/rate_limit'
        )) as GitHubRateLimit;
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
        // Strip the 'project/' prefix from file paths
        const normalizedPath = path.startsWith('project/')
          ? path.substring('project/'.length)
          : path;
        await queue.add(async () => {
          let success = false;
          let attempts = 0;
          const maxAttempts = 5;

          while (!success && attempts < maxAttempts) {
            try {
              attempts++;
              await rateLimitHandler.beforeRequest();

              const blobData = (await this.githubService.request(
                'POST',
                `/repos/${repoOwner}/${repoName}/git/blobs`,
                {
                  content: toBase64(content),
                  encoding: 'base64',
                }
              )) as GitHubBlob;

              results.push({
                path: normalizedPath,
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
