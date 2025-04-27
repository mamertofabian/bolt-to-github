import { GitHubService } from './GitHubService';
import type { FileChange } from './FilePreviewService';
import type { ProjectFiles } from '$lib/types';
import { calculateGitBlobHash, processFilesWithGitignore } from '$lib/fileUtils';

/**
 * Service for comparing local files with GitHub repository files
 * This service extracts the comparison logic from ZipHandler to make it reusable
 */
export class GitHubComparisonService {
  private static instance: GitHubComparisonService | null = null;
  private githubService: GitHubService | null = null;

  private constructor() {}

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
    if (!this.githubService) {
      throw new Error('GitHub service not set. Call setGitHubService first.');
    }

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
        const contentHash = await calculateGitBlobHash(content);
        if (existingFiles.get(path) !== contentHash) {
          // Content has changed
          changes.set(originalPath, {
            path: originalPath,
            status: 'modified',
            content,
          });
        } else {
          // File is unchanged
          changes.set(originalPath, {
            path: originalPath,
            status: 'unchanged',
            content,
          });
        }
      }
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
      const nonIgnoredFiles = await processFilesWithGitignore(allPathsMap);
      
      // Find which paths were ignored (in existingFiles but not in nonIgnoredFiles)
      ignoredPaths = new Set(
        Array.from(existingFiles.keys()).filter(path => {
          const normalizedPath = path.startsWith('project/') ? path.slice(8) : path;
          return !nonIgnoredFiles.has(normalizedPath);
        })
      );
    } catch (error) {
      console.error('Error determining ignored files:', error);
    }

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
    return {
      changes,
      repoData: {
        baseTreeSha,
        baseSha,
        existingFiles,
      },
    };
  }
}
