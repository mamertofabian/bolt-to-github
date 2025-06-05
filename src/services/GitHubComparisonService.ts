import { GitHubService } from './GitHubService';
import type { FileChange } from './FilePreviewService';
import type { ProjectFiles } from '$lib/types';
import {
  calculateGitBlobHash,
  processFilesWithGitignore,
  normalizeContentForComparison,
  decodeBase64ToUtf8,
} from '$lib/fileUtils';
import { OperationStateManager } from '../content/services/OperationStateManager';

// ✅ NEW: Enhanced comparison result interface
export interface GitHubComparisonResult {
  changes: Map<string, FileChange>;
  repoData: {
    baseTreeSha: string;
    baseSha: string;
    existingFiles: Map<string, string>;
  };
  // ✅ NEW: Enhanced metadata
  metadata: {
    authMethod: 'pat' | 'github_app' | 'unknown';
    rateLimits?: {
      remaining: number;
      limit: number;
      resetAt: Date;
    };
    comparisonId: string;
    completedAt: number;
    performanceMetrics: {
      totalFiles: number;
      apiCalls: number;
      duration: number;
    };
  };
}

// ✅ NEW: Enhanced comparison options
export interface GitHubComparisonOptions {
  repoOwner: string;
  repoName: string;
  targetBranch: string;
  progressCallback?: (message: string, progress: number, metadata?: any) => void;
  includeDeletedFiles?: boolean;
  includePerformanceMetrics?: boolean;
  skipGitignoreProcessing?: boolean;
}

/**
 * Service for comparing local files with GitHub repository files
 * This service extracts the comparison logic from ZipHandler to make it reusable
 */
export class GitHubComparisonService {
  private static instance: GitHubComparisonService | null = null;
  private githubService: GitHubService | null = null;
  private operationStateManager: OperationStateManager;

  // ✅ NEW: Enhanced authentication and performance tracking
  private currentAuthStatus: {
    currentAuth: 'pat' | 'github_app' | 'unknown' | null;
    rateLimits?: any;
    canUpgrade?: boolean;
  } | null = null;

  private performanceMetrics: {
    apiCallCount: number;
    startTime: number;
    lastRateLimitCheck: number;
  } = {
    apiCallCount: 0,
    startTime: 0,
    lastRateLimitCheck: 0,
  };

  private constructor() {
    this.operationStateManager = OperationStateManager.getInstance();
    this.currentAuthStatus = null;
  }

  /**
   * Get the singleton instance of GitHubComparisonService
   */
  public static getInstance(): GitHubComparisonService {
    if (!GitHubComparisonService.instance) {
      GitHubComparisonService.instance = new GitHubComparisonService();
    }
    return GitHubComparisonService.instance;
  }

  /**
   * Set the GitHub service instance and update authentication status
   * @param githubService The GitHub service instance
   */
  public async setGitHubService(githubService: GitHubService): Promise<void> {
    this.githubService = githubService;
    await this.updateAuthStatus();
  }

  // ✅ NEW: Update authentication status for better operations
  private async updateAuthStatus(): Promise<void> {
    if (!this.githubService) {
      this.currentAuthStatus = null;
      return;
    }

    try {
      this.currentAuthStatus = await this.githubService.getAuthStatus();
      console.log(
        `🔐 GitHubComparisonService: Auth status updated - ${this.currentAuthStatus.currentAuth}`
      );
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
        return `Repository or branch not found during ${operation}. Please check if the repository exists and you have access to it.`;
      } else if (message.includes('403')) {
        return `Access denied during ${operation}. Your ${authMethod === 'pat' ? 'Personal Access Token may need additional permissions' : 'GitHub App may need additional permissions'} or the repository may be private.`;
      } else if (message.includes('401')) {
        return `Authentication failed during ${operation}. Please check your GitHub authentication settings.`;
      } else if (message.includes('rate limit')) {
        const rateLimits = this.currentAuthStatus?.rateLimits;
        return `GitHub API rate limit exceeded during ${operation}. ${rateLimits ? `Remaining: ${rateLimits.remaining}/${rateLimits.limit}` : 'Please try again later.'}`;
      } else if (message.includes('timeout')) {
        return `Request timeout during ${operation}. The repository may be very large or GitHub API is experiencing delays.`;
      }

      return `${operation} failed: ${message}`;
    }

    return `${operation} failed: Unknown error occurred.`;
  }

  // ✅ NEW: Enhanced API request wrapper with rate limit tracking
  private async makeGitHubRequest(method: string, path: string, data?: any): Promise<any> {
    if (!this.githubService) {
      throw new Error('GitHub service not set. Call setGitHubService first.');
    }

    try {
      this.performanceMetrics.apiCallCount++;

      // Check rate limits periodically
      const now = Date.now();
      if (now - this.performanceMetrics.lastRateLimitCheck > 30000) {
        // Check every 30 seconds
        this.performanceMetrics.lastRateLimitCheck = now;
        await this.updateAuthStatus();
      }

      const result = await this.githubService.request(method, path, data);
      return result;
    } catch (error) {
      // Update auth status on errors to get latest rate limit info
      await this.updateAuthStatus();
      throw error;
    }
  }

  /**
   * Normalize content for comparison by handling line endings and whitespace
   * @param content The content to normalize
   * @returns Normalized content
   */
  private normalizeContent(content: string): string {
    return normalizeContentForComparison(content);
  }

  // ✅ ENHANCED: Legacy method with automatic GitHubService creation
  /**
   * Compare local files with GitHub repository files (legacy method)
   * @deprecated Use compareWithGitHubAdvanced for better control and features
   */
  public async compareWithGitHub(
    localFiles: ProjectFiles,
    repoOwner: string,
    repoName: string,
    targetBranch: string,
    progressCallback?: (message: string, progress: number) => void
  ): Promise<{
    changes: Map<string, FileChange>;
    repoData: {
      baseTreeSha: string;
      baseSha: string;
      existingFiles: Map<string, string>;
    };
  }> {
    // ✅ NEW: Auto-create optimal GitHubService if not set
    if (!this.githubService) {
      console.log('🔧 Creating optimal GitHubService for comparison...');
      this.githubService = await GitHubService.createWithBestAuth({
        preferGitHubApp: true,
      });

      if (!this.githubService) {
        throw new Error(
          'Failed to create GitHubService. Please ensure GitHub authentication is configured.'
        );
      }

      await this.updateAuthStatus();
    }

    const options: GitHubComparisonOptions = {
      repoOwner,
      repoName,
      targetBranch,
      progressCallback: progressCallback
        ? (message, progress) => progressCallback(message, progress)
        : undefined,
      includeDeletedFiles: true,
      includePerformanceMetrics: false,
    };

    const result = await this.compareWithGitHubAdvanced(localFiles, options);

    // Return legacy format
    return {
      changes: result.changes,
      repoData: result.repoData,
    };
  }

  // ✅ NEW: Advanced comparison method with enhanced features
  /**
   * Compare local files with GitHub repository files using advanced options
   * @param localFiles Map of local file paths to content
   * @param options Comparison configuration options
   * @returns Enhanced comparison result with metadata
   */
  public async compareWithGitHubAdvanced(
    localFiles: ProjectFiles,
    options: GitHubComparisonOptions
  ): Promise<GitHubComparisonResult> {
    const {
      repoOwner,
      repoName,
      targetBranch,
      progressCallback,
      includeDeletedFiles = true,
      includePerformanceMetrics = true,
      skipGitignoreProcessing = false,
    } = options;

    // ✅ NEW: Auto-create optimal GitHubService if not set
    if (!this.githubService) {
      console.log('🔧 Creating optimal GitHubService for comparison...');
      this.githubService = await GitHubService.createWithBestAuth({
        preferGitHubApp: true,
      });

      if (!this.githubService) {
        throw new Error(
          'Failed to create GitHubService. Please ensure GitHub authentication is configured.'
        );
      }

      await this.updateAuthStatus();
    }

    // Generate unique operation ID for this comparison
    const operationId = `comparison-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const comparisonId = operationId;

    // Reset performance metrics
    this.performanceMetrics = {
      apiCallCount: 0,
      startTime: Date.now(),
      lastRateLimitCheck: Date.now(),
    };

    try {
      // Start tracking the comparison operation with auth context
      await this.operationStateManager.startOperation(
        'comparison',
        operationId,
        `Comparing files with GitHub repository: ${repoOwner}/${repoName}`,
        {
          repoOwner,
          repoName,
          targetBranch,
          fileCount: localFiles.size,
          authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
        }
      );

      // ✅ ENHANCED: Progress notification with auth context
      const notifyProgress = (message: string, progress: number) => {
        const enhancedMessage = `[${this.currentAuthStatus?.currentAuth || 'unknown'}] ${message}`;

        if (progressCallback) {
          const metadata = {
            authMethod: this.currentAuthStatus?.currentAuth,
            apiCalls: this.performanceMetrics.apiCallCount,
            rateLimits: this.currentAuthStatus?.rateLimits,
          };
          progressCallback(enhancedMessage, progress, metadata);
        }
      };

      notifyProgress('Fetching repository data...', 10);

      // ✅ ENHANCED: Get repository data with error handling
      let baseRef, baseSha, baseCommit, baseTreeSha;

      try {
        baseRef = await this.makeGitHubRequest(
          'GET',
          `/repos/${repoOwner}/${repoName}/git/refs/heads/${targetBranch}`
        );
        baseSha = baseRef.object.sha;

        baseCommit = await this.makeGitHubRequest(
          'GET',
          `/repos/${repoOwner}/${repoName}/git/commits/${baseSha}`
        );
        baseTreeSha = baseCommit.tree.sha;
      } catch (error) {
        const enhancedError = this.getEnhancedErrorMessage(error, 'repository data fetching');
        throw new Error(enhancedError);
      }

      // Fetch the full tree with content
      notifyProgress('Analyzing repository files...', 30);

      let existingTree;
      try {
        existingTree = await this.makeGitHubRequest(
          'GET',
          `/repos/${repoOwner}/${repoName}/git/trees/${baseTreeSha}?recursive=1`
        );
      } catch (error) {
        const enhancedError = this.getEnhancedErrorMessage(error, 'repository tree analysis');
        throw new Error(enhancedError);
      }

      // Create a map of existing file paths to their SHAs
      const existingFiles = new Map<string, string>();
      if (existingTree.tree) {
        existingTree.tree.forEach((item: { path: string; sha: string; type: string }) => {
          if (item.type === 'blob') {
            existingFiles.set(item.path, item.sha);
          }
        });
      }

      notifyProgress('Comparing files...', 50);

      // Create a map to store file changes
      const changes = new Map<string, FileChange>();

      // Keep track of progress for detailed comparison
      const totalFiles = localFiles.size;
      let processedFiles = 0;

      // ✅ ENHANCED: Process all local files with better error handling
      for (const [originalPath, content] of localFiles.entries()) {
        // Skip directory entries (empty files or paths ending with /)
        if (content === '' || originalPath.endsWith('/')) {
          continue;
        }

        // Normalize path by removing 'project/' prefix if it exists
        const path = originalPath.startsWith('project/') ? originalPath.substring(8) : originalPath;

        try {
          if (!existingFiles.has(path)) {
            // File doesn't exist in GitHub repo - it's new
            changes.set(originalPath, {
              path: originalPath,
              status: 'added',
              content,
              authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
              comparedAt: Date.now(),
            });
          } else {
            // File exists in GitHub repo - check if it's changed
            const normalizedContent = this.normalizeContent(content);
            const contentHash = await calculateGitBlobHash(normalizedContent);

            if (existingFiles.get(path) !== contentHash) {
              // Hashes don't match - fetch the actual GitHub content for proper comparison
              let githubContent = '';
              let isActuallyModified = false;

              try {
                notifyProgress(
                  `Fetching content for ${path}...`,
                  50 + (processedFiles / totalFiles) * 30
                );

                // ✅ ENHANCED: Use enhanced API request wrapper
                const response = await this.makeGitHubRequest(
                  'GET',
                  `/repos/${repoOwner}/${repoName}/contents/${path}?ref=${targetBranch}`
                );

                if (response.content) {
                  // Properly decode UTF-8 content from base64
                  githubContent = decodeBase64ToUtf8(response.content.replace(/\s/g, ''));
                  const normalizedGithubContent = this.normalizeContent(githubContent);

                  // Compare normalized content directly as final check
                  isActuallyModified = normalizedContent !== normalizedGithubContent;
                } else {
                  // If we can't get the content, consider it modified to be safe
                  isActuallyModified = true;
                }
              } catch (error) {
                console.warn(`Failed to fetch GitHub content for ${path}:`, error);
                // If we can't fetch content, consider it modified to be safe
                isActuallyModified = true;
              }

              if (isActuallyModified) {
                // Content has actually changed
                changes.set(originalPath, {
                  path: originalPath,
                  status: 'modified',
                  content,
                  previousContent: githubContent,
                  authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
                  comparedAt: Date.now(),
                });
              } else {
                // Content is actually the same after normalization
                changes.set(originalPath, {
                  path: originalPath,
                  status: 'unchanged',
                  content,
                  previousContent: githubContent,
                  authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
                  comparedAt: Date.now(),
                });
              }
            } else {
              // Hashes match - file is unchanged
              changes.set(originalPath, {
                path: originalPath,
                status: 'unchanged',
                content,
                authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
                comparedAt: Date.now(),
              });
            }
          }
        } catch (error) {
          console.warn(`Error processing file ${originalPath}:`, error);
          // Mark as modified to be safe if we can't determine status
          changes.set(originalPath, {
            path: originalPath,
            status: 'modified',
            content,
            authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
            comparedAt: Date.now(),
          });
        }

        processedFiles++;
      }

      // ✅ ENHANCED: Smart gitignore processing
      let ignoredPaths: Set<string> = new Set();

      if (!skipGitignoreProcessing) {
        try {
          // Create a map with all GitHub paths to test against gitignore
          const allPathsMap = new Map<string, string>();
          for (const path of existingFiles.keys()) {
            allPathsMap.set(path, ''); // Content doesn't matter, just need the path
          }

          // Process with gitignore to get the non-ignored files
          const nonIgnoredFiles = processFilesWithGitignore(allPathsMap);

          // Find which paths were ignored (in existingFiles but not in nonIgnoredFiles)
          ignoredPaths = new Set(
            Array.from(existingFiles.keys()).filter((path) => {
              const normalizedPath = path.startsWith('project/') ? path.slice(8) : path;
              return !nonIgnoredFiles.has(normalizedPath);
            })
          );
        } catch (error) {
          console.error('Error determining ignored files:', error);
        }
      }

      // ✅ ENHANCED: Check for deleted files with better control
      if (includeDeletedFiles) {
        notifyProgress('Checking for deleted files...', 90);

        for (const path of existingFiles.keys()) {
          // Check if the file exists in local files (with or without project/ prefix)
          const normalizedPath = `project/${path}`;

          if (!localFiles.has(path) && !localFiles.has(normalizedPath)) {
            // Skip files that are intentionally ignored by .gitignore
            if (!skipGitignoreProcessing && ignoredPaths.has(path)) {
              continue;
            }

            // Only mark as deleted if the file is not ignored
            changes.set(path, {
              path,
              status: 'deleted',
              content: '',
              authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
              comparedAt: Date.now(),
            });
          }
        }
      }

      notifyProgress('Comparison complete', 100);

      // ✅ NEW: Build enhanced result with metadata
      const duration = Date.now() - this.performanceMetrics.startTime;

      const result: GitHubComparisonResult = {
        changes,
        repoData: {
          baseTreeSha,
          baseSha,
          existingFiles,
        },
        metadata: {
          authMethod: this.currentAuthStatus?.currentAuth || 'unknown',
          rateLimits: this.currentAuthStatus?.rateLimits
            ? {
                remaining: this.currentAuthStatus.rateLimits.remaining,
                limit: this.currentAuthStatus.rateLimits.limit,
                resetAt: new Date(this.currentAuthStatus.rateLimits.resetAt),
              }
            : undefined,
          comparisonId,
          completedAt: Date.now(),
          performanceMetrics: {
            totalFiles: localFiles.size,
            apiCalls: this.performanceMetrics.apiCallCount,
            duration,
          },
        },
      };

      // Mark operation as completed
      await this.operationStateManager.completeOperation(operationId);

      console.log(
        `✅ GitHub comparison completed: ${changes.size} files processed, ${this.performanceMetrics.apiCallCount} API calls, ${duration}ms`
      );

      return result;
    } catch (error) {
      const enhancedError = this.getEnhancedErrorMessage(error, 'file comparison');

      // Mark operation as failed
      await this.operationStateManager.failOperation(
        operationId,
        error instanceof Error ? error : new Error(enhancedError)
      );

      console.error('GitHub comparison failed:', enhancedError);
      throw new Error(enhancedError);
    }
  }

  // ✅ NEW: Get current authentication status for external use
  public getAuthStatus(): {
    currentAuth: 'pat' | 'github_app' | 'unknown' | null;
    rateLimits?: any;
    canUpgrade?: boolean;
  } | null {
    return this.currentAuthStatus;
  }

  // ✅ NEW: Get performance metrics for the last comparison
  public getPerformanceMetrics(): {
    apiCallCount: number;
    duration: number;
    rateLimitsRemaining?: number;
  } {
    return {
      apiCallCount: this.performanceMetrics.apiCallCount,
      duration: Date.now() - this.performanceMetrics.startTime,
      rateLimitsRemaining: this.currentAuthStatus?.rateLimits?.remaining,
    };
  }

  // ✅ NEW: Force authentication status refresh
  public async refreshAuthStatus(): Promise<void> {
    await this.updateAuthStatus();
  }

  // ✅ NEW: Check if service is ready for comparisons
  public isReady(): boolean {
    return this.githubService !== null && this.currentAuthStatus !== null;
  }

  // ✅ NEW: Get optimal GitHubService for external use
  public async ensureGitHubService(): Promise<GitHubService> {
    if (!this.githubService) {
      console.log('🔧 Creating optimal GitHubService for comparison service...');
      this.githubService = await GitHubService.createWithBestAuth({
        preferGitHubApp: true,
      });

      if (!this.githubService) {
        throw new Error(
          'Failed to create GitHubService. Please ensure GitHub authentication is configured.'
        );
      }

      await this.updateAuthStatus();
    }

    return this.githubService;
  }
}
