import type { GitHubService } from './GitHubService';
import { toBase64 } from '../lib/common';
import { ZipProcessor } from '../lib/zip';
import type { ProcessingStatus, UploadStatusState } from '$lib/types';
import { RateLimitHandler } from './RateLimitHandler';
import { Queue } from '../lib/Queue';
import { GitHubComparisonService } from './GitHubComparisonService';
import { processFilesWithGitignore } from '$lib/fileUtils';
import { pushStatisticsActions } from '../lib/stores';

// ✅ NEW: Enhanced upload result interface
interface UploadResult {
  success: boolean;
  filesUploaded: number;
  totalFiles: number;
  authMethod: string;
  apiCalls: number;
  duration: number;
  rateLimitsUsed?: {
    remaining: number;
    limit: number;
  };
}

export class ZipHandler {
  private githubComparisonService: GitHubComparisonService;

  // ✅ NEW: Enhanced authentication and performance tracking
  private currentAuthStatus: {
    currentAuth: 'pat' | 'github_app' | 'unknown' | null;
    rateLimits?: any;
    canUpgrade?: boolean;
  } | null = null;

  private performanceMetrics: {
    startTime: number;
    apiCallCount: number;
    filesProcessed: number;
    lastRateLimitCheck: number;
  } = {
    startTime: 0,
    apiCallCount: 0,
    filesProcessed: 0,
    lastRateLimitCheck: 0,
  };

  constructor(
    private githubService: GitHubService,
    private sendStatus: (status: UploadStatusState) => void
  ) {
    this.githubComparisonService = GitHubComparisonService.getInstance();
    this.currentAuthStatus = null;
    this.initializeServices();
  }

  // ✅ NEW: Initialize services with authentication tracking
  private async initializeServices(): Promise<void> {
    try {
      await this.githubComparisonService.setGitHubService(this.githubService);
      await this.updateAuthStatus();
    } catch (error) {
      console.warn('Failed to initialize ZipHandler services:', error);
    }
  }

  // ✅ NEW: Update authentication status for better operations
  private async updateAuthStatus(): Promise<void> {
    try {
      this.currentAuthStatus = await this.githubService.getAuthStatus();
      console.log(`🔐 ZipHandler: Auth status updated - ${this.currentAuthStatus.currentAuth}`);
    } catch (error) {
      console.warn('Failed to update auth status:', error);
      this.currentAuthStatus = { currentAuth: 'unknown' };
    }
  }

  // ✅ NEW: Enhanced error message generation
  private getEnhancedErrorMessage(error: unknown, operation: string): string {
    if (error instanceof Error) {
      const message = error.message;
      const authMethod = this.currentAuthStatus?.currentAuth || 'unknown';

      // Check for common GitHub API errors
      if (message.includes('404')) {
        return `Repository not found during ${operation}. Please check if the repository exists and you have access to it.`;
      } else if (message.includes('403')) {
        return `Access denied during ${operation}. Your ${authMethod === 'pat' ? 'Personal Access Token may need additional permissions' : 'GitHub App may need additional permissions'} or the repository may be private.`;
      } else if (message.includes('401')) {
        return `Authentication failed during ${operation}. Please check your GitHub authentication settings.`;
      } else if (message.includes('rate limit')) {
        const rateLimits = this.currentAuthStatus?.rateLimits;
        return `GitHub API rate limit exceeded during ${operation}. ${rateLimits ? `Remaining: ${rateLimits.remaining}/${rateLimits.limit}` : 'Please try again later.'}`;
      } else if (message.includes('timeout')) {
        return `Request timeout during ${operation}. The repository may be very large or GitHub API is experiencing delays.`;
      } else if (message.includes('too large')) {
        return `${message} Consider using ${authMethod === 'pat' ? 'GitHub App authentication for higher limits' : 'smaller files or splitting the upload'}.`;
      }

      return `${operation} failed: ${message}`;
    }

    return `${operation} failed: Unknown error occurred.`;
  }

  // ✅ ENHANCED: Enhanced status updates with auth context
  private updateStatus = async (
    status: ProcessingStatus,
    progress: number = 0,
    message: string = ''
  ) => {
    // ✅ NEW: Add auth context to status messages
    const authMethod = this.currentAuthStatus?.currentAuth || 'unknown';
    const enhancedMessage =
      status === 'uploading' && message ? `[${authMethod}] ${message}` : message;

    // Send status update to UI
    console.log(`ZipHandler: Sending status update: ${status}, ${progress}%, ${enhancedMessage}`);

    // Send the status update and ensure it's properly dispatched
    try {
      this.sendStatus({ status, progress, message: enhancedMessage });

      // For important status changes, send a duplicate update after a small delay
      // to ensure it's received and processed by the UI
      if (status === 'uploading' && progress === 0) {
        // Initial upload status - critical to show
        setTimeout(() => {
          this.sendStatus({ status, progress, message: enhancedMessage });
        }, 100);
      } else if (status === 'success' || status === 'error') {
        // Final statuses - critical to show
        setTimeout(() => {
          this.sendStatus({ status, progress, message: enhancedMessage });
        }, 100);
      }
    } catch (error) {
      console.error('Error sending status update:', error);
    }
  };

  // ✅ ENHANCED: Branch management with better error handling
  private ensureBranchExists = async (
    repoOwner: string,
    repoName: string,
    targetBranch: string
  ) => {
    try {
      // Check if branch exists
      let branchExists = true;
      try {
        await this.githubService.request(
          'GET',
          `/repos/${repoOwner}/${repoName}/branches/${targetBranch}`
        );
        this.performanceMetrics.apiCallCount++;
      } catch (_) {
        branchExists = false;
      }

      // If branch doesn't exist, create it from default branch
      if (!branchExists) {
        await this.updateStatus('uploading', 18, `Creating branch ${targetBranch}...`);

        try {
          const defaultBranch = await this.githubService.request(
            'GET',
            `/repos/${repoOwner}/${repoName}/git/refs/heads/main`
          );
          this.performanceMetrics.apiCallCount++;

          await this.githubService.request('POST', `/repos/${repoOwner}/${repoName}/git/refs`, {
            ref: `refs/heads/${targetBranch}`,
            sha: defaultBranch.object.sha,
          });
          this.performanceMetrics.apiCallCount++;
        } catch (error) {
          const enhancedError = this.getEnhancedErrorMessage(error, 'branch creation');
          throw new Error(enhancedError);
        }
      }
    } catch (error) {
      const enhancedError = this.getEnhancedErrorMessage(error, 'branch management');
      throw new Error(enhancedError);
    }
  };

  // ✅ ENHANCED: Main processing method with comprehensive improvements
  public processZipFile = async (
    blob: Blob,
    currentProjectId: string | null,
    commitMessage: string
  ): Promise<UploadResult> => {
    // Reset performance metrics
    this.performanceMetrics = {
      startTime: Date.now(),
      apiCallCount: 0,
      filesProcessed: 0,
      lastRateLimitCheck: Date.now(),
    };

    // ✅ ENHANCED: Size validation with auth-aware messaging
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
    if (blob.size > MAX_FILE_SIZE) {
      const authMethod = this.currentAuthStatus?.currentAuth || 'unknown';
      const enhancedMessage = `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB. ${
        authMethod === 'pat' ? 'Consider upgrading to GitHub App for better performance.' : ''
      }`;
      await this.updateStatus('error', 0, enhancedMessage);
      throw new Error(enhancedMessage);
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

    // ✅ NEW: Update auth status before processing
    await this.updateAuthStatus();

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
        console.log('Project settings not found, creating default settings for:', currentProjectId);

        // Create a mutable copy of the project settings
        const updatedProjectSettings = projectSettings ? { ...projectSettings } : {};

        // Use the project ID as the repo name with a default branch of 'main'
        updatedProjectSettings[currentProjectId] = { repoName: currentProjectId, branch: 'main' };

        // Save the updated settings
        await chrome.storage.sync.set({ projectSettings: updatedProjectSettings });

        console.log('Created default project settings:', updatedProjectSettings[currentProjectId]);

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

      // ✅ ENHANCED: Record push attempt with auth context
      await pushStatisticsActions.recordPushAttempt(
        currentProjectId,
        repoOwner,
        repoName,
        targetBranch,
        files.size,
        commitMessage
      );

      await this.updateStatus('uploading', 15, 'Checking repository...');

      // ✅ ENHANCED: Repository operations with error handling
      try {
        await this.githubService.ensureRepoExists(repoOwner, repoName);
        this.performanceMetrics.apiCallCount++;
      } catch (error) {
        const enhancedError = this.getEnhancedErrorMessage(error, 'repository verification');
        throw new Error(enhancedError);
      }

      // Check if repo is empty and needs initialization
      try {
        const isEmpty = await this.githubService.isRepoEmpty(repoOwner, repoName);
        this.performanceMetrics.apiCallCount++;

        if (isEmpty) {
          await this.updateStatus('uploading', 18, 'Initializing empty repository...');
          await this.githubService.initializeEmptyRepo(repoOwner, repoName, targetBranch);
          this.performanceMetrics.apiCallCount++;
        }
      } catch (error) {
        const enhancedError = this.getEnhancedErrorMessage(error, 'repository initialization');
        throw new Error(enhancedError);
      }

      await this.ensureBranchExists(repoOwner, repoName, targetBranch);

      const processedFiles = await processFilesWithGitignore(files);

      await this.updateStatus('uploading', 20, 'Getting repository information...');

      const uploadResult = await this.uploadToGitHub(
        processedFiles,
        repoOwner,
        repoName,
        targetBranch,
        commitMessage,
        currentProjectId
      );

      // ✅ NEW: Return comprehensive upload result
      return {
        success: true,
        filesUploaded: uploadResult.filesUploaded,
        totalFiles: processedFiles.size,
        authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
        apiCalls: this.performanceMetrics.apiCallCount,
        duration: Date.now() - this.performanceMetrics.startTime,
        rateLimitsUsed: this.currentAuthStatus?.rateLimits
          ? {
              remaining: this.currentAuthStatus.rateLimits.remaining,
              limit: this.currentAuthStatus.rateLimits.limit,
            }
          : undefined,
      };
    } catch (error) {
      // ✅ ENHANCED: Error handling with auth context
      const enhancedError = this.getEnhancedErrorMessage(error, 'file upload');
      await this.updateStatus('error', 0, enhancedError);

      // Record push failure with enhanced context
      try {
        const { repoOwner: errorRepoOwner, projectSettings: errorProjectSettings } =
          await chrome.storage.sync.get(['repoOwner', 'projectSettings']);

        if (errorRepoOwner && errorProjectSettings?.[currentProjectId]) {
          await pushStatisticsActions.recordPushFailure(
            currentProjectId,
            errorRepoOwner,
            errorProjectSettings[currentProjectId].repoName,
            errorProjectSettings[currentProjectId].branch || 'main',
            enhancedError
          );
        }
      } catch (trackingError) {
        console.error('Failed to record push failure:', trackingError);
      }

      throw new Error(enhancedError);
    }
  };

  // ✅ ENHANCED: Upload method with advanced GitHub comparison
  private async uploadToGitHub(
    processedFiles: Map<string, string>,
    repoOwner: string,
    repoName: string,
    targetBranch: string,
    commitMessage: string,
    currentProjectId?: string
  ): Promise<{ filesUploaded: number }> {
    try {
      // ✅ ENHANCED: Get repository data with error handling
      const baseRef = await this.githubService.request(
        'GET',
        `/repos/${repoOwner}/${repoName}/git/refs/heads/${targetBranch}`
      );
      this.performanceMetrics.apiCallCount++;
      const baseSha = baseRef.object.sha;

      const baseCommit = await this.githubService.request(
        'GET',
        `/repos/${repoOwner}/${repoName}/git/commits/${baseSha}`
      );
      this.performanceMetrics.apiCallCount++;
      const baseTreeSha = baseCommit.tree.sha;

      // ✅ ENHANCED: Use advanced GitHub comparison with auth context
      await this.updateStatus('uploading', 30, 'Analyzing repository changes...');

      // Create enhanced progress callback with auth context
      const progressCallback = (message: string, progress: number, metadata?: any) => {
        const authInfo = metadata?.authMethod ? `[${metadata.authMethod}]` : '';
        const apiInfo = metadata?.apiCalls ? ` (${metadata.apiCalls} API calls)` : '';
        console.log(`${authInfo} GitHub comparison: ${message} (${progress}%)${apiInfo}`);
      };

      // ✅ NEW: Use advanced comparison method
      const comparisonResult = await this.githubComparisonService.compareWithGitHubAdvanced(
        processedFiles,
        {
          repoOwner,
          repoName,
          targetBranch,
          progressCallback,
          includeDeletedFiles: true,
          includePerformanceMetrics: true,
        }
      );

      // ✅ NEW: Add comparison API calls to our metrics
      this.performanceMetrics.apiCallCount += comparisonResult.metadata.performanceMetrics.apiCalls;

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
        return { filesUploaded: 0 };
      }

      await this.updateStatus(
        'uploading',
        40,
        `Creating ${changedFiles.size} file blobs (of ${processedFiles.size} total files)...`
      );

      // ✅ ENHANCED: Create blobs with better error handling
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

      // ✅ ENHANCED: Tree and commit creation with error handling
      try {
        // Create a new tree
        const newTree = await this.githubService.request(
          'POST',
          `/repos/${repoOwner}/${repoName}/git/trees`,
          {
            base_tree: baseTreeSha,
            tree: treeItems,
          }
        );
        this.performanceMetrics.apiCallCount++;

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
        this.performanceMetrics.apiCallCount++;

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
        this.performanceMetrics.apiCallCount++;

        const duration = Date.now() - this.performanceMetrics.startTime;
        await this.updateStatus(
          'success',
          100,
          `Successfully uploaded ${changedFiles.size} files to GitHub (${duration}ms, ${this.performanceMetrics.apiCallCount} API calls)`
        );

        // ✅ ENHANCED: Record push success with metrics
        if (currentProjectId) {
          await pushStatisticsActions.recordPushSuccess(
            currentProjectId,
            repoOwner,
            repoName,
            targetBranch
          );
        }

        return { filesUploaded: changedFiles.size };
      } catch (error) {
        const enhancedError = this.getEnhancedErrorMessage(error, 'commit creation');
        throw new Error(enhancedError);
      }
    } catch (error) {
      const enhancedError = this.getEnhancedErrorMessage(error, 'GitHub upload');
      throw new Error(enhancedError);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ✅ ENHANCED: Blob creation with advanced rate limit handling and auth awareness
  private async createBlobs(
    files: Map<string, string>,
    repoOwner: string,
    repoName: string
  ): Promise<Array<{ path: string; mode: string; type: string; sha: string }>> {
    const results: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    const totalFiles = files.size;
    let completedFiles = 0;

    // ✅ ENHANCED: Check rate limit status with auth awareness
    try {
      const rateLimit = await this.githubService.request('GET', '/rate_limit');
      this.performanceMetrics.apiCallCount++;

      const remainingRequests = rateLimit.resources.core.remaining;
      const resetTime = rateLimit.resources.core.reset;
      const now = Math.floor(Date.now() / 1000);
      const waitTime = resetTime - now;

      const authMethod = this.currentAuthStatus?.currentAuth || 'unknown';
      const rateLimitInfo = `${remainingRequests}/${rateLimit.resources.core.limit} (${authMethod})`;

      // ✅ ENHANCED: Auth-aware rate limit warnings
      if (remainingRequests < files.size + 10) {
        const upgradeHint =
          authMethod === 'pat' ? ' Consider upgrading to GitHub App for 5x higher limits.' : '';
        await this.updateStatus(
          'uploading',
          40,
          `Rate limit warning: ${rateLimitInfo} requests remaining of ${files.size} needed${upgradeHint}`
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
          this.performanceMetrics.apiCallCount++;
          if (newRateLimit.resources.core.remaining < 10) {
            throw new Error('Insufficient API rate limit remaining even after waiting for reset');
          }
        } else {
          const upgradeHint =
            authMethod === 'pat'
              ? ' Consider upgrading to GitHub App for much higher rate limits.'
              : '';
          throw new Error(
            `Insufficient API rate limit remaining. Reset in ${Math.ceil(waitTime / 60)} minutes${upgradeHint}`
          );
        }
      }
    } catch (error) {
      const enhancedError = this.getEnhancedErrorMessage(error, 'rate limit check');
      throw new Error(enhancedError);
    }

    // Create an enhanced rate limit handler with exponential backoff
    const rateLimitHandler = new RateLimitHandler();
    const queue = new Queue(1); // Using a queue for serial execution with concurrency of 1

    // Reset rate limit handler counter before starting batch
    rateLimitHandler.resetRequestCount();

    // ✅ ENHANCED: Adaptive batch sizing based on auth method
    const authMethod = this.currentAuthStatus?.currentAuth || 'unknown';
    const MAX_BATCH_SIZE = authMethod === 'github_app' ? 50 : 30; // GitHub App can handle larger batches
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

    // ✅ ENHANCED: Process each batch with auth-aware timing
    for (let batchIndex = 0; batchIndex < fileBatches.length; batchIndex++) {
      const batch = fileBatches[batchIndex];
      const batchNumber = batchIndex + 1;

      await this.updateStatus(
        'uploading',
        40 + Math.floor((batchIndex / fileBatches.length) * 30),
        `Processing batch ${batchNumber}/${fileBatches.length} (${batch.size} files)...`
      );

      // ✅ ENHANCED: Auth-aware batch delays
      if (batchIndex > 0) {
        const batchDelay = authMethod === 'github_app' ? 500 : 1000; // GitHub App can be faster
        await this.sleep(batchDelay);
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

              const blobData = await this.githubService.request(
                'POST',
                `/repos/${repoOwner}/${repoName}/git/blobs`,
                {
                  content: toBase64(content),
                  encoding: 'base64',
                }
              );
              this.performanceMetrics.apiCallCount++;

              results.push({
                path: normalizedPath,
                mode: '100644',
                type: 'blob',
                sha: blobData.sha,
              });

              success = true;
              rateLimitHandler.resetRetryCount();

              // ✅ ENHANCED: Auth-aware request pacing
              fileCount++;
              if (fileCount % (authMethod === 'github_app' ? 10 : 5) === 0) {
                rateLimitHandler.resetRequestCount();
                const pauseTime = authMethod === 'github_app' ? 200 : 500;
                await this.sleep(pauseTime);
              }

              completedFiles++;
              this.performanceMetrics.filesProcessed = completedFiles;

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

              // ✅ ENHANCED: Smart rate limit handling with auth context
              if (
                (errorObj instanceof Response && errorObj.status === 403) ||
                (errorObj.response && errorObj.response.status === 403) ||
                (typeof errorObj.message === 'string' &&
                  (errorObj.message.includes('rate limit') ||
                    errorObj.message.includes('secondary rate limits')))
              ) {
                // ✅ ENHANCED: Auth-aware backoff timing
                const baseDelay = authMethod === 'github_app' ? 500 : 1000;
                const maxDelay = authMethod === 'github_app' ? 30000 : 60000;
                const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), maxDelay);

                const upgradeHint =
                  authMethod === 'pat'
                    ? ' Consider upgrading to GitHub App for better rate limits.'
                    : '';

                await this.updateStatus(
                  'uploading',
                  40 + Math.floor((completedFiles / totalFiles) * 30),
                  `Rate limit hit. Waiting ${Math.ceil(delay / 1000)}s before retry...${upgradeHint}`
                );

                await this.sleep(delay);

                if (errorObj instanceof Response) {
                  await rateLimitHandler.handleRateLimit(errorObj);
                } else {
                  await this.sleep(2000 * attempts);
                }
              } else if (attempts < maxAttempts) {
                // For non-rate limit errors, retry with increasing delay
                const delay = 1000 * attempts;
                await this.sleep(delay);
              } else {
                // Final failure after multiple attempts
                const enhancedError = this.getEnhancedErrorMessage(errorObj, `uploading ${path}`);
                await this.updateStatus('error', 40, enhancedError);
                throw new Error(enhancedError);
              }
            }
          }
        });
      }
    }

    console.log(
      `✅ Blob creation completed: ${results.length} files, ${this.performanceMetrics.apiCallCount} API calls, auth: ${authMethod}`
    );

    return results;
  }

  // ✅ NEW: Get current upload performance metrics
  public getPerformanceMetrics(): {
    apiCallCount: number;
    filesProcessed: number;
    duration: number;
    authMethod: string;
    rateLimitsRemaining?: number;
  } {
    return {
      apiCallCount: this.performanceMetrics.apiCallCount,
      filesProcessed: this.performanceMetrics.filesProcessed,
      duration: Date.now() - this.performanceMetrics.startTime,
      authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
      rateLimitsRemaining: this.currentAuthStatus?.rateLimits?.remaining,
    };
  }

  // ✅ NEW: Get current authentication status
  public getAuthStatus(): {
    currentAuth: 'pat' | 'github_app' | 'unknown' | null;
    rateLimits?: any;
    canUpgrade?: boolean;
  } | null {
    return this.currentAuthStatus;
  }

  // ✅ NEW: Force authentication status refresh
  public async refreshAuthStatus(): Promise<void> {
    await this.updateAuthStatus();
  }
}
