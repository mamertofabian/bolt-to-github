import { DownloadService } from './DownloadService';
import { CacheService } from './CacheService';
import { GitHubComparisonService } from './GitHubComparisonService';
import { GitHubService } from './GitHubService';
import { IdleMonitorService } from './IdleMonitorService';
import type { ProjectFiles } from '$lib/types';
import { processFilesWithGitignore } from '$lib/fileUtils';

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'unchanged' | 'deleted';
  content: string;
  previousContent?: string;
  // ✅ NEW: Enhanced metadata for better tracking
  authMethod?: 'pat' | 'github_app' | 'unknown';
  comparedAt?: number;
}

export interface DiffResult {
  path: string;
  changes: Array<{
    type: 'added' | 'deleted' | 'unchanged';
    content: string;
    lineNumber: number;
  }>;
  isContextual?: boolean;
  totalLines?: number;
  // ✅ NEW: Enhanced diff metadata
  authMethod?: 'pat' | 'github_app' | 'unknown';
  generatedAt?: number;
}

// ✅ NEW: Enhanced comparison options
export interface GitHubComparisonOptions {
  repoOwner: string;
  repoName: string;
  targetBranch: string;
  githubService?: GitHubService;
  authMethod?: 'pat' | 'github_app' | 'auto';
  progressCallback?: (message: string, progress: number) => void;
  includeMetadata?: boolean;
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

  // ✅ NEW: Enhanced authentication tracking
  private lastGitHubService: GitHubService | null = null;
  private lastAuthStatus: {
    currentAuth: 'pat' | 'github_app' | 'unknown' | null;
    rateLimits?: any;
    canUpgrade?: boolean;
  } | null = null;

  private constructor() {
    this.downloadService = new DownloadService();

    try {
      // Get idle monitor service, but handle cases where it might not be available
      this.cacheService = CacheService.getInstance(IdleMonitorService.getInstance());
    } catch (error) {
      console.warn('Error initializing idle monitor or cache service:', error);
      // Create cache service with null idle monitor as fallback
      this.cacheService = CacheService.getInstance(null as any);
    }

    this.githubComparisonService = GitHubComparisonService.getInstance();
    this.lastGitHubService = null;
    this.lastAuthStatus = null;

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

    // ✅ NEW: Clear GitHub service cache as well
    this.lastGitHubService = null;
    this.lastAuthStatus = null;
  };

  // ✅ NEW: Update authentication status for better error handling
  private async updateAuthStatus(githubService?: GitHubService): Promise<void> {
    if (!githubService) return;

    try {
      this.lastAuthStatus = await githubService.getAuthStatus();
      this.lastGitHubService = githubService;
      console.log(
        `🔐 FilePreviewService: Auth status updated - ${this.lastAuthStatus?.currentAuth}`
      );
    } catch (error) {
      console.warn('Failed to update auth status:', error);
      this.lastAuthStatus = { currentAuth: 'unknown' };
    }
  }

  // ✅ NEW: Enhanced error message generation
  private getEnhancedErrorMessage(error: unknown, operation: string): string {
    if (error instanceof Error) {
      const message = error.message;
      const authMethod = this.lastAuthStatus?.currentAuth || 'unknown';

      // Check for common GitHub API errors
      if (message.includes('404')) {
        return `Repository not found during ${operation}. Please check if the repository exists and you have access to it.`;
      } else if (message.includes('403')) {
        return `Access denied during ${operation}. Your ${authMethod === 'pat' ? 'Personal Access Token may need additional permissions' : 'GitHub App may need additional permissions'} or the repository may be private.`;
      } else if (message.includes('401')) {
        return `Authentication failed during ${operation}. Please check your GitHub authentication settings.`;
      } else if (message.includes('rate limit')) {
        const rateLimits = this.lastAuthStatus?.rateLimits;
        return `GitHub API rate limit exceeded during ${operation}. ${rateLimits ? `Remaining: ${rateLimits.remaining}/${rateLimits.limit}` : 'Please try again later.'}`;
      }

      return `${operation} failed: ${message}`;
    }

    return `${operation} failed: Unknown error occurred.`;
  }

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
    const timestamp = Date.now();
    const authMethod = this.lastAuthStatus?.currentAuth || 'unknown';

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
            authMethod,
            comparedAt: timestamp,
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
          authMethod,
          comparedAt: timestamp,
        });
      } else if (content !== previousContent) {
        // File is modified
        changes.set(path, {
          path,
          status: 'modified',
          content,
          previousContent,
          authMethod,
          comparedAt: timestamp,
        });
      } else {
        // File is unchanged
        changes.set(path, {
          path,
          status: 'unchanged',
          content,
          authMethod,
          comparedAt: timestamp,
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
          authMethod,
          comparedAt: timestamp,
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

    if (!fileChange) {
      return null;
    }

    const timestamp = Date.now();
    const authMethod = this.lastAuthStatus?.currentAuth || 'unknown';

    // For unchanged files, show content with unchanged type
    if (fileChange.status === 'unchanged') {
      const lines = fileChange.content.split('\n');
      return {
        path,
        changes: lines.map((content, index) => ({
          type: 'unchanged',
          content,
          lineNumber: index + 1,
        })),
        authMethod,
        generatedAt: timestamp,
      };
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
        authMethod,
        generatedAt: timestamp,
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
        authMethod,
        generatedAt: timestamp,
      };
    }

    // For modified files, compare line by line
    if (fileChange.status === 'modified' && fileChange.previousContent) {
      const diff = this.calculateLineDiffInternal(
        path,
        fileChange.previousContent,
        fileChange.content
      );
      return {
        ...diff,
        authMethod,
        generatedAt: timestamp,
      };
    }

    return null;
  }

  /**
   * Calculate a simple line-by-line diff between two file versions (public version)
   * @param path The file path
   * @param oldContent The old file content
   * @param newContent The new file content
   * @param contextLines Number of surrounding lines to show (0 = show all lines)
   * @returns Diff result showing line changes
   */
  public calculateLineDiff(
    path: string,
    oldContent: string,
    newContent: string,
    contextLines: number = 0
  ): DiffResult {
    const fullDiff = this.calculateLineDiffInternal(path, oldContent, newContent);

    if (contextLines <= 0) {
      return {
        ...fullDiff,
        authMethod: this.lastAuthStatus?.currentAuth || 'unknown',
        generatedAt: Date.now(),
      };
    }

    const contextualDiff = this.createContextualDiff(fullDiff, contextLines);
    return {
      ...contextualDiff,
      authMethod: this.lastAuthStatus?.currentAuth || 'unknown',
      generatedAt: Date.now(),
    };
  }

  /**
   * Create a contextual diff showing only changed lines with surrounding context
   * @param fullDiff The complete diff result
   * @param contextLines Number of context lines to show around changes
   * @returns Contextual diff result
   */
  private createContextualDiff(fullDiff: DiffResult, contextLines: number): DiffResult {
    const changes = fullDiff.changes;
    if (changes.length === 0) {
      return fullDiff;
    }

    // Find ranges of changed lines (added/deleted)
    const changedRanges: Array<{ start: number; end: number }> = [];
    let currentRange: { start: number; end: number } | null = null;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (change.type === 'added' || change.type === 'deleted') {
        if (!currentRange) {
          currentRange = { start: i, end: i };
        } else {
          currentRange.end = i;
        }
      } else {
        // Unchanged line - end current range if exists
        if (currentRange) {
          changedRanges.push(currentRange);
          currentRange = null;
        }
      }
    }

    // Add final range if it exists
    if (currentRange) {
      changedRanges.push(currentRange);
    }

    if (changedRanges.length === 0) {
      // No changes, show just the first few lines for context
      return {
        ...fullDiff,
        changes: changes.slice(0, Math.min(contextLines * 2, changes.length)),
        isContextual: true,
        totalLines: changes.length,
      };
    }

    // Expand ranges to include context lines and merge overlapping ranges
    const expandedRanges: Array<{ start: number; end: number }> = [];

    for (const range of changedRanges) {
      const expandedStart = Math.max(0, range.start - contextLines);
      const expandedEnd = Math.min(changes.length - 1, range.end + contextLines);

      // Check if this range overlaps with the previous one
      if (expandedRanges.length > 0) {
        const lastRange = expandedRanges[expandedRanges.length - 1];
        if (expandedStart <= lastRange.end + 1) {
          // Merge with previous range
          lastRange.end = expandedEnd;
          continue;
        }
      }

      expandedRanges.push({ start: expandedStart, end: expandedEnd });
    }

    // Extract lines for each range
    const contextualChanges: DiffResult['changes'] = [];

    for (let rangeIndex = 0; rangeIndex < expandedRanges.length; rangeIndex++) {
      const range = expandedRanges[rangeIndex];

      // Add separator if not the first range
      if (rangeIndex > 0) {
        const skippedLines = range.start - expandedRanges[rangeIndex - 1].end - 1;
        if (skippedLines > 0) {
          contextualChanges.push({
            type: 'unchanged',
            content: `... (${skippedLines} lines skipped) ...`,
            lineNumber: -1, // Special marker for skipped lines
          });
        }
      }

      // Add lines from this range
      for (let i = range.start; i <= range.end; i++) {
        contextualChanges.push(changes[i]);
      }
    }

    return {
      ...fullDiff,
      changes: contextualChanges,
      isContextual: true,
      totalLines: changes.length,
    };
  }

  /**
   * Calculate a simple line-by-line diff between two file versions
   * @param path The file path
   * @param oldContent The old file content
   * @param newContent The new file content
   * @returns Diff result showing line changes
   */
  private calculateLineDiffInternal(
    path: string,
    oldContent: string,
    newContent: string
  ): DiffResult {
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
    try {
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
    } catch (error) {
      const errorMessage = this.getEnhancedErrorMessage(error, 'file preview creation');
      container.innerHTML = `<div class="error">${errorMessage}</div>`;
    }
  }

  /**
   * Create a UI element to display a file diff
   * @param path The file path to show diff for
   * @param container The container element to append the diff to
   * @returns Promise resolving when the diff is created
   */
  public async createFileDiff(path: string, container: HTMLElement): Promise<void> {
    try {
      // Get the file diff
      const diff = await this.getFileDiff(path);

      if (!diff) {
        container.innerHTML = `<div class="info">No changes in file: ${path}</div>`;
        return;
      }

      // Create a diff container
      const diffContainer = document.createElement('div');
      diffContainer.className = 'diff-container';

      // Add file header with metadata
      const header = document.createElement('div');
      header.className = 'diff-header';
      header.innerHTML = `
        <span class="diff-file-path">${path}</span>
        ${diff.authMethod ? `<span class="diff-auth-method" title="Generated using ${diff.authMethod} authentication">${diff.authMethod}</span>` : ''}
        ${diff.generatedAt ? `<span class="diff-timestamp" title="Generated at ${new Date(diff.generatedAt).toISOString()}">${new Date(diff.generatedAt).toLocaleTimeString()}</span>` : ''}
      `;
      diffContainer.appendChild(header);

      // Add contextual info if available
      if (diff.isContextual && diff.totalLines) {
        const contextInfo = document.createElement('div');
        contextInfo.className = 'diff-context-info';
        contextInfo.textContent = `Showing ${diff.changes.length} of ${diff.totalLines} lines (contextual view)`;
        diffContainer.appendChild(contextInfo);
      }

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
        lineNumber.textContent = change.lineNumber === -1 ? '...' : String(change.lineNumber);
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
    } catch (error) {
      const errorMessage = this.getEnhancedErrorMessage(error, 'file diff creation');
      container.innerHTML = `<div class="error">${errorMessage}</div>`;
    }
  }

  // ✅ ENHANCED: Improved compareWithGitHub with new GitHubService architecture
  /**
   * Compare current files with GitHub repository files (legacy method)
   * @deprecated Use compareWithGitHubAdvanced for better control and features
   */
  public async compareWithGitHub(
    repoOwner: string,
    repoName: string,
    targetBranch: string,
    githubService?: GitHubService
  ): Promise<Map<string, FileChange>> {
    const options: GitHubComparisonOptions = {
      repoOwner,
      repoName,
      targetBranch,
      githubService,
      authMethod: 'auto',
      includeMetadata: true,
    };

    return this.compareWithGitHubAdvanced(options);
  }

  // ✅ NEW: Advanced GitHub comparison with enhanced options
  /**
   * Compare current files with GitHub repository files using advanced options
   * @param options GitHub comparison configuration options
   * @returns Map of file paths to change information
   */
  public async compareWithGitHubAdvanced(
    options: GitHubComparisonOptions
  ): Promise<Map<string, FileChange>> {
    const {
      repoOwner,
      repoName,
      targetBranch,
      githubService,
      authMethod = 'auto',
      progressCallback,
      includeMetadata = true,
    } = options;

    try {
      // Get processed files (applying gitignore rules)
      const processedFiles = await this.getProcessedFiles();

      if (!processedFiles || processedFiles.size === 0) {
        throw new Error('No files loaded or all files were ignored by gitignore rules.');
      }

      // ✅ ENHANCED: Create or use optimal GitHubService
      let serviceToUse = githubService;

      if (!serviceToUse) {
        // ✅ NEW: Create GitHubService with optimal authentication
        console.log('🔧 Creating optimal GitHubService for comparison...');

        if (authMethod === 'auto') {
          serviceToUse = await GitHubService.createWithBestAuth({
            preferGitHubApp: true,
          });
        } else if (authMethod === 'github_app') {
          serviceToUse = await GitHubService.createForNewUser();
        } else if (authMethod === 'pat') {
          // For PAT, we'd need the token from storage or settings
          throw new Error(
            'PAT authentication requires providing a GitHubService instance with valid PAT token'
          );
        }

        if (!serviceToUse) {
          throw new Error(`Failed to create GitHubService with ${authMethod} authentication`);
        }
      }

      // ✅ NEW: Update authentication status
      await this.updateAuthStatus(serviceToUse);

      console.log(
        `🔍 Comparing with GitHub using ${this.lastAuthStatus?.currentAuth || 'unknown'} authentication`
      );

      // Set the GitHub service on the comparison service
      this.githubComparisonService.setGitHubService(serviceToUse);

      // ✅ ENHANCED: Create enhanced progress callback
      const enhancedProgressCallback = (message: string, progress: number) => {
        const enhancedMessage = `[${this.lastAuthStatus?.currentAuth || 'unknown'}] ${message}`;

        // Call user's progress callback if provided
        if (progressCallback) {
          progressCallback(enhancedMessage, progress);
        }

        // Only log progress info in development environment
        if (process.env.NODE_ENV === 'development') {
          console.log(`GitHub comparison: ${enhancedMessage} (${progress}%)`);
        }
      };

      // Use the GitHub comparison service to compare files
      const result = await this.githubComparisonService.compareWithGitHub(
        processedFiles,
        repoOwner,
        repoName,
        targetBranch,
        enhancedProgressCallback
      );

      // ✅ ENHANCED: Add authentication metadata to results if requested
      if (includeMetadata) {
        const enhancedChanges = new Map<string, FileChange>();
        const timestamp = Date.now();
        const authMethod = this.lastAuthStatus?.currentAuth || 'unknown';

        result.changes.forEach((change, path) => {
          enhancedChanges.set(path, {
            ...change,
            authMethod,
            comparedAt: timestamp,
          });
        });

        return enhancedChanges;
      }

      // Return just the changes map
      return result.changes;
    } catch (error) {
      const enhancedError = this.getEnhancedErrorMessage(error, 'GitHub comparison');
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
    return this.lastAuthStatus;
  }

  // ✅ NEW: Get optimal GitHubService for external use
  public async getOptimalGitHubService(): Promise<GitHubService | null> {
    try {
      const service = await GitHubService.createWithBestAuth({
        preferGitHubApp: true,
      });

      if (service) {
        await this.updateAuthStatus(service);
      }

      return service;
    } catch (error) {
      console.error('Failed to create optimal GitHubService:', error);
      return null;
    }
  }

  // ✅ NEW: Force authentication status refresh
  public async refreshAuthStatus(githubService?: GitHubService): Promise<void> {
    if (githubService) {
      await this.updateAuthStatus(githubService);
    } else if (this.lastGitHubService) {
      await this.updateAuthStatus(this.lastGitHubService);
    }
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

    // ✅ NEW: Clear GitHub service references
    this.lastGitHubService = null;
    this.lastAuthStatus = null;
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
