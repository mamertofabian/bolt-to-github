import { GitHubService } from './GitHubService';
import type { FileChange } from './FilePreviewService';
import type { ProjectFiles } from '$lib/types';

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
          content
        });
      } else {
        // File exists in GitHub repo - check if it's changed
        const contentHash = await this.calculateGitBlobHash(content);
        if (existingFiles.get(path) !== contentHash) {
          // Content has changed
          changes.set(originalPath, {
            path: originalPath,
            status: 'modified',
            content
          });
        } else {
          // File is unchanged
          changes.set(originalPath, {
            path: originalPath,
            status: 'unchanged',
            content
          });
        }
      }
    }

    // Check for deleted files (files in GitHub but not in local files)
    for (const path of existingFiles.keys()) {
      // Check if the file exists in local files (with or without project/ prefix)
      const normalizedPath = `project/${path}`;
      if (!localFiles.has(path) && !localFiles.has(normalizedPath)) {
        changes.set(path, {
          path,
          status: 'deleted',
          content: ''
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
        existingFiles
      }
    };
  }

  /**
   * Calculate the Git blob hash for a string content
   * GitHub calculates blob SHA using the format: "blob " + content.length + "\0" + content
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

    // Convert to hex string
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
