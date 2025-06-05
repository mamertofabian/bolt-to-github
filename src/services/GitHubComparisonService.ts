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

/**
 * Service for comparing local files with GitHub repository files
 * This service extracts the comparison logic from ZipHandler to make it reusable
 */
export class GitHubComparisonService {
  private static instance: GitHubComparisonService | null = null;
  private githubService: GitHubService | null = null;
  private operationStateManager: OperationStateManager;

  private constructor() {
    this.operationStateManager = OperationStateManager.getInstance();
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
   * Set the GitHub service instance
   * @param githubService The GitHub service instance
   */
  public setGitHubService(githubService: GitHubService): void {
    this.githubService = githubService;
  }

  /**
   * Normalize content for comparison by handling line endings and whitespace
   * @param content The content to normalize
   * @returns Normalized content
   */
  private normalizeContent(content: string): string {
    return normalizeContentForComparison(content);
  }

  /**
   * Compare local files with GitHub repository files
   * @param localFiles Map of local file paths to content
   * @param repoOwner GitHub repository owner
   * @param repoName GitHub repository name
   * @param targetBranch GitHub repository branch
   * @param progressCallback Optional callback for progress updates
   * @returns Map of file paths to change information and repository data
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
    // ✅ NEW: Auto-create optimized GitHubService if none is set
    if (!this.githubService) {
      try {
        console.log('🔄 Creating optimized GitHub service for file comparison...');

        // ✅ Use factory method with automatic best-auth selection
        this.githubService = await GitHubService.createWithBestAuth({
          preferGitHubApp: true,
        });

        console.log(
          `✅ GitHub service created with ${this.githubService.getApiClientType()} for comparison`
        );
      } catch (error) {
        console.error('Failed to create GitHub service for comparison:', error);
        throw new Error(
          'Unable to initialize GitHub service for file comparison. Please check your GitHub authentication settings.'
        );
      }
    }

    // Generate unique operation ID for this comparison
    const operationId = `comparison-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    try {
      // Start tracking the comparison operation
      await this.operationStateManager.startOperation(
        'comparison',
        operationId,
        `Comparing files with GitHub repository: ${repoOwner}/${repoName}`,
        { repoOwner, repoName, targetBranch, fileCount: localFiles.size }
      );

      // Notify progress if callback provided
      const notifyProgress = (message: string, progress: number) => {
        if (progressCallback) {
          progressCallback(message, progress);
        }
      };

      notifyProgress('Fetching repository data...', 10);

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
      notifyProgress('Analyzing repository files...', 30);
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

      notifyProgress('Comparing files...', 50);

      // Create a map to store file changes
      const changes = new Map<string, FileChange>();

      // Keep track of progress for detailed comparison
      const totalFiles = localFiles.size;
      let processedFiles = 0;

      // Process all local files to determine their status
      for (const [originalPath, content] of localFiles.entries()) {
        // Skip directory entries (empty files or paths ending with /)
        if (content === '' || originalPath.endsWith('/')) {
          continue;
        }

        // Normalize path by removing 'project/' prefix if it exists
        const path = originalPath.startsWith('project/') ? originalPath.substring(8) : originalPath;

        if (!existingFiles.has(path)) {
          // File doesn't exist in GitHub repo - it's new
          changes.set(originalPath, {
            path: originalPath,
            status: 'added',
            content,
          });
        } else {
          // File exists in GitHub repo - check if it's changed
          const normalizedContent = this.normalizeContent(content);
          const contentHash = await calculateGitBlobHash(normalizedContent);

          if (existingFiles.get(path) !== contentHash) {
            // Hashes don't match - but let's fetch the actual GitHub content for proper comparison
            let githubContent = '';
            let isActuallyModified = false;

            try {
              notifyProgress(
                `Fetching content for ${path}...`,
                50 + (processedFiles / totalFiles) * 30
              );

              // Use the FileService through GitHubService to fetch the actual content
              const response = await this.githubService.request(
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
                previousContent: githubContent, // Now we have the actual GitHub content
              });
            } else {
              // Content is actually the same after normalization - hash difference was due to encoding/line ending differences
              changes.set(originalPath, {
                path: originalPath,
                status: 'unchanged',
                content,
                previousContent: githubContent,
              });
            }
          } else {
            // Hashes match - file is unchanged
            changes.set(originalPath, {
              path: originalPath,
              status: 'unchanged',
              content,
            });
          }
        }

        processedFiles++;
      }

      // Get files that would be ignored by .gitignore
      let ignoredPaths: Set<string> = new Set();

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

      notifyProgress('Checking for deleted files...', 90);

      // Check for deleted files (files in GitHub but not in local files)
      for (const path of existingFiles.keys()) {
        // Check if the file exists in local files (with or without project/ prefix)
        const normalizedPath = `project/${path}`;

        if (!localFiles.has(path) && !localFiles.has(normalizedPath)) {
          // Skip files that are intentionally ignored by .gitignore
          if (ignoredPaths.has(path)) {
            continue;
          }

          // Only mark as deleted if the file is not ignored
          changes.set(path, {
            path,
            status: 'deleted',
            content: '',
          });
        }
      }

      notifyProgress('Comparison complete', 100);

      // Return both the changes and repository data
      const result = {
        changes,
        repoData: {
          baseTreeSha,
          baseSha,
          existingFiles,
        },
      };

      // Mark operation as completed
      await this.operationStateManager.completeOperation(operationId);

      return result;
    } catch (error) {
      // Mark operation as failed
      await this.operationStateManager.failOperation(
        operationId,
        error instanceof Error ? error : new Error('Comparison failed')
      );
      throw error;
    }
  }
}
