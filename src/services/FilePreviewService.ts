import { DownloadService } from './DownloadService';
import { CacheService } from './CacheService';
import { GitHubComparisonService } from './GitHubComparisonService';
import { GitHubService } from './GitHubService';
import type { ProjectFiles } from '$lib/types';
import { processFilesWithGitignore } from '$lib/fileUtils';

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'unchanged' | 'deleted';
  content: string;
  previousContent?: string;
}

interface DiffResult {
  path: string;
  changes: Array<{
    type: 'added' | 'deleted' | 'unchanged';
    content: string;
    lineNumber: number;
  }>;
}

/**
 * Service for previewing and comparing project files
 */
export class FilePreviewService {
  private static instance: FilePreviewService | null = null;
  private downloadService: DownloadService;
  private cacheService: CacheService;
  private githubComparisonService: GitHubComparisonService;
  private currentFiles: ProjectFiles | null = null;
  private previousFiles: ProjectFiles | null = null;
  private changedFiles: Map<string, FileChange> | null = null;

  private constructor() {
    this.downloadService = new DownloadService();
    this.cacheService = CacheService.getInstance();
    this.githubComparisonService = GitHubComparisonService.getInstance();

    // Register for cache refresh events
    this.cacheService.onCacheRefreshNeeded(this.handleCacheRefresh);
  }

  /**
   * Get the singleton instance of FilePreviewService
   */
  public static getInstance(): FilePreviewService {
    if (!FilePreviewService.instance) {
      FilePreviewService.instance = new FilePreviewService();
    }
    return FilePreviewService.instance;
  }

  /**
   * Handle cache refresh events from the CacheService
   */
  private handleCacheRefresh = (_projectId: string): void => {
    // When cache is refreshed, clear our stored files to force a refresh on next access
    this.currentFiles = null;
    this.previousFiles = null;
    this.changedFiles = null;
  };

  /**
   * Load the current project files, using cache if available
   * @param forceRefresh Whether to force a fresh download
   * @returns Promise resolving to the project files
   */
  public async loadProjectFiles(forceRefresh = false): Promise<ProjectFiles> {
    // If we already have files loaded and not forcing refresh, return them
    if (this.currentFiles && !forceRefresh) {
      return this.currentFiles;
    }

    // Store the previous files before loading new ones (for diff purposes)
    if (this.currentFiles) {
      this.previousFiles = new Map(this.currentFiles);
    }

    // Load files using the DownloadService (which handles caching)
    this.currentFiles = await this.downloadService.getProjectFiles(forceRefresh);

    // Reset changed files since we have new current files
    this.changedFiles = null;

    return this.currentFiles;
  }

  /**
   * Process the project files according to gitignore rules
   * @param forceRefresh Whether to force a fresh download of files
   * @returns Promise resolving to the processed project files
   */
  public async getProcessedFiles(forceRefresh = false): Promise<ProjectFiles> {
    // Load the project files
    const files = await this.loadProjectFiles(forceRefresh);

    // Process the files with gitignore rules
    return processFilesWithGitignore(files);
  }

  /**
   * Get a specific file's content
   * @param path The file path
   * @returns The file content or null if not found
   */
  public async getFileContent(path: string): Promise<string | null> {
    // Make sure files are loaded
    const files = await this.loadProjectFiles();
    return files.get(path) || null;
  }

  /**
   * Identify changed files between current and previous versions
   * @returns Map of file paths to change information
   */
  public async getChangedFiles(): Promise<Map<string, FileChange>> {
    // If we already calculated changes, return them
    if (this.changedFiles) {
      return this.changedFiles;
    }

    // Make sure current files are loaded
    await this.loadProjectFiles();

    // Create a map for the changes
    const changes = new Map<string, FileChange>();

    // If we don't have previous files, this is the first load
    if (!this.previousFiles || !this.currentFiles) {
      // If this is the first time loading files, mark all as unchanged
      // This avoids showing all files as "added" on the first run
      if (this.currentFiles) {
        this.currentFiles.forEach((content, path) => {
          changes.set(path, {
            path,
            status: 'unchanged',
            content,
          });
        });
      }

      this.changedFiles = changes;
      return changes;
    }

    // Check for modified and unchanged files
    this.currentFiles.forEach((content, path) => {
      const previousContent = this.previousFiles?.get(path);

      if (!previousContent) {
        // File is new
        changes.set(path, {
          path,
          status: 'added',
          content,
        });
      } else if (content !== previousContent) {
        // File is modified
        changes.set(path, {
          path,
          status: 'modified',
          content,
          previousContent,
        });
      } else {
        // File is unchanged
        changes.set(path, {
          path,
          status: 'unchanged',
          content,
        });
      }
    });

    // Check for deleted files
    this.previousFiles.forEach((content, path) => {
      if (!this.currentFiles?.has(path)) {
        changes.set(path, {
          path,
          status: 'deleted',
          content: '',
          previousContent: content,
        });
      }
    });

    this.changedFiles = changes;
    return changes;
  }

  /**
   * Get a simple line-by-line diff between two file versions
   * @param path The file path
   * @returns Diff result showing line changes
   */
  public async getFileDiff(path: string): Promise<DiffResult | null> {
    // Make sure changes are calculated
    const changes = await this.getChangedFiles();
    const fileChange = changes.get(path);

    if (!fileChange || fileChange.status === 'unchanged') {
      return null;
    }

    // For added files, all lines are new
    if (fileChange.status === 'added') {
      const lines = fileChange.content.split('\n');
      return {
        path,
        changes: lines.map((content, index) => ({
          type: 'added',
          content,
          lineNumber: index + 1,
        })),
      };
    }

    // For deleted files, all lines are deleted
    if (fileChange.status === 'deleted' && fileChange.previousContent) {
      const lines = fileChange.previousContent.split('\n');
      return {
        path,
        changes: lines.map((content, index) => ({
          type: 'deleted',
          content,
          lineNumber: index + 1,
        })),
      };
    }

    // For modified files, compare line by line
    if (fileChange.status === 'modified' && fileChange.previousContent) {
      return this.calculateLineDiff(path, fileChange.previousContent, fileChange.content);
    }

    return null;
  }

  /**
   * Calculate a simple line-by-line diff between two file versions
   * @param path The file path
   * @param oldContent The old file content
   * @param newContent The new file content
   * @returns Diff result showing line changes
   */
  private calculateLineDiff(path: string, oldContent: string, newContent: string): DiffResult {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const changes: DiffResult['changes'] = [];

    // Use a simple longest common subsequence algorithm for diff
    const lcsMatrix = this.buildLCSMatrix(oldLines, newLines);
    this.backtrackLCS(lcsMatrix, oldLines, newLines, oldLines.length, newLines.length, changes);

    // Sort changes by line number
    changes.sort((a, b) => a.lineNumber - b.lineNumber);

    return {
      path,
      changes,
    };
  }

  /**
   * Build a matrix for the longest common subsequence algorithm
   * @param oldLines Array of lines from the old file
   * @param newLines Array of lines from the new file
   * @returns 2D matrix for LCS calculation
   */
  private buildLCSMatrix(oldLines: string[], newLines: string[]): number[][] {
    const matrix: number[][] = Array(oldLines.length + 1)
      .fill(0)
      .map(() => Array(newLines.length + 1).fill(0));

    for (let i = 1; i <= oldLines.length; i++) {
      for (let j = 1; j <= newLines.length; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1] + 1;
        } else {
          matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
        }
      }
    }

    return matrix;
  }

  /**
   * Backtrack through the LCS matrix to build the diff
   * @param matrix The LCS matrix
   * @param oldLines Array of lines from the old file
   * @param newLines Array of lines from the new file
   * @param i Current row in the matrix
   * @param j Current column in the matrix
   * @param changes Array to store the resulting changes
   */
  private backtrackLCS(
    matrix: number[][],
    oldLines: string[],
    newLines: string[],
    i: number,
    j: number,
    changes: DiffResult['changes']
  ): void {
    if (i === 0 && j === 0) {
      return;
    }

    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      // Line is unchanged
      this.backtrackLCS(matrix, oldLines, newLines, i - 1, j - 1, changes);
      changes.push({
        type: 'unchanged',
        content: newLines[j - 1],
        lineNumber: j,
      });
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      // Line is added
      this.backtrackLCS(matrix, oldLines, newLines, i, j - 1, changes);
      changes.push({
        type: 'added',
        content: newLines[j - 1],
        lineNumber: j,
      });
    } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
      // Line is deleted
      this.backtrackLCS(matrix, oldLines, newLines, i - 1, j, changes);
      changes.push({
        type: 'deleted',
        content: oldLines[i - 1],
        lineNumber: i,
      });
    }
  }

  /**
   * Create a UI element to display a file preview
   * @param path The file path to preview
   * @param container The container element to append the preview to
   * @returns Promise resolving when the preview is created
   */
  public async createFilePreview(path: string, container: HTMLElement): Promise<void> {
    // Get the file content
    const content = await this.getFileContent(path);

    if (!content) {
      container.innerHTML = `<div class="error">File not found: ${path}</div>`;
      return;
    }

    // Create a pre element with the file content
    const pre = document.createElement('pre');
    pre.className = 'file-preview';

    // Add syntax highlighting based on file extension
    const extension = path.split('.').pop()?.toLowerCase();
    pre.classList.add(`language-${extension || 'text'}`);

    // Create code element
    const code = document.createElement('code');
    code.textContent = content;
    pre.appendChild(code);

    // Clear container and append preview
    container.innerHTML = '';
    container.appendChild(pre);

    // Apply syntax highlighting if Prism is available
    if (typeof window.Prism !== 'undefined') {
      window.Prism.highlightElement(code);
    }
  }

  /**
   * Create a UI element to display a file diff
   * @param path The file path to show diff for
   * @param container The container element to append the diff to
   * @returns Promise resolving when the diff is created
   */
  public async createFileDiff(path: string, container: HTMLElement): Promise<void> {
    // Get the file diff
    const diff = await this.getFileDiff(path);

    if (!diff) {
      container.innerHTML = `<div class="info">No changes in file: ${path}</div>`;
      return;
    }

    // Create a diff container
    const diffContainer = document.createElement('div');
    diffContainer.className = 'diff-container';

    // Add file header
    const header = document.createElement('div');
    header.className = 'diff-header';
    header.textContent = path;
    diffContainer.appendChild(header);

    // Create line-by-line diff
    const diffContent = document.createElement('div');
    diffContent.className = 'diff-content';

    // Add each line with appropriate styling
    diff.changes.forEach((change) => {
      const line = document.createElement('div');
      line.className = `diff-line diff-${change.type}`;

      // Add line number
      const lineNumber = document.createElement('span');
      lineNumber.className = 'diff-line-number';
      lineNumber.textContent = String(change.lineNumber);
      line.appendChild(lineNumber);

      // Add line prefix (+ for added, - for deleted, space for unchanged)
      const prefix = document.createElement('span');
      prefix.className = 'diff-line-prefix';
      prefix.textContent = change.type === 'added' ? '+' : change.type === 'deleted' ? '-' : ' ';
      line.appendChild(prefix);

      // Add line content
      const content = document.createElement('span');
      content.className = 'diff-line-content';
      content.textContent = change.content;
      line.appendChild(content);

      diffContent.appendChild(line);
    });

    diffContainer.appendChild(diffContent);

    // Clear container and append diff
    container.innerHTML = '';
    container.appendChild(diffContainer);
  }

  /**
   * Compare current files with GitHub repository files
   * @param repoOwner GitHub repository owner
   * @param repoName GitHub repository name
   * @param targetBranch GitHub repository branch
   * @param githubService Optional GitHubService instance to use
   * @returns Map of file paths to change information
   */
  public async compareWithGitHub(
    repoOwner: string,
    repoName: string,
    targetBranch: string,
    githubService?: GitHubService
  ): Promise<Map<string, FileChange>> {
    // Get processed files (applying gitignore rules)
    const processedFiles = await this.getProcessedFiles();

    if (!processedFiles || processedFiles.size === 0) {
      throw new Error('No files loaded or all files were ignored by gitignore rules.');
    }

    // If a GitHub service is provided, set it on the comparison service
    if (githubService) {
      this.githubComparisonService.setGitHubService(githubService);
    }

    // Create a progress callback for the comparison service
    const progressCallback = (message: string, progress: number) => {
      // Only log progress info in development environment
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log(`GitHub comparison: ${message} (${progress}%)`);
      }
    };

    // Use the GitHub comparison service to compare files
    const result = await this.githubComparisonService.compareWithGitHub(
      processedFiles,
      repoOwner,
      repoName,
      targetBranch,
      progressCallback
    );

    // Return just the changes map
    return result.changes;
  }

  /**
   * Clean up resources when the service is no longer needed
   */
  public cleanup(): void {
    // Remove cache refresh callback
    this.cacheService.removeRefreshCallback(this.handleCacheRefresh);

    // Clear stored files
    this.currentFiles = null;
    this.previousFiles = null;
    this.changedFiles = null;
  }
}

// Add Prism type for syntax highlighting
declare global {
  interface Window {
    Prism?: {
      highlightElement: (element: HTMLElement) => void;
    };
  }
}
