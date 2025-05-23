import type { IFileChangeHandler } from '../types/HandlerInterfaces';
import type { INotificationManager } from '../types/ManagerInterfaces';
import type { MessageHandler } from '../MessageHandler';
import { FilePreviewService, type FileChange } from '../../services/FilePreviewService';

/**
 * FileChangeHandler handles file change detection, comparison, and display
 * Previously part of UIManager
 */
export class FileChangeHandler implements IFileChangeHandler {
  private messageHandler: MessageHandler;
  private notificationManager: INotificationManager;
  private filePreviewService: FilePreviewService;

  constructor(messageHandler: MessageHandler, notificationManager: INotificationManager) {
    this.messageHandler = messageHandler;
    this.notificationManager = notificationManager;
    this.filePreviewService = FilePreviewService.getInstance();
  }

  /**
   * Load project files with optional cache refresh
   * Provides direct access to the file loading functionality
   */
  public async loadProjectFiles(forceRefresh?: boolean): Promise<void> {
    await this.filePreviewService.loadProjectFiles(forceRefresh);
  }

  /**
   * Show changed files with comparison and display
   * Replaces the previous handleShowChangedFiles method from UIManager
   */
  public async showChangedFiles(): Promise<void> {
    try {
      // Show notification that we're refreshing and loading files
      this.notificationManager.showNotification({
        type: 'info',
        message: 'Refreshing and loading project files...',
        duration: 3000,
      });

      console.group('Changed Files');
      console.log('Refreshing and loading project files...');

      // Load the current project files with a forced refresh (invalidate cache)
      // since this is a user-driven action, we always want the latest files
      const startTime = performance.now();
      await this.filePreviewService.loadProjectFiles(true); // Pass true to force refresh
      const loadTime = performance.now() - startTime;
      console.log(`Files loaded in ${loadTime.toFixed(2)}ms`);

      // Get changed files (with GitHub comparison if possible)
      const changedFiles = await this.getChangedFilesWithComparison();

      // Process and display results
      await this.processAndDisplayChanges(changedFiles);
    } catch (error) {
      console.error('Error showing changed files:', error);
      this.notificationManager.showNotification({
        type: 'error',
        message: `Failed to show changed files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });
    }
  }

  /**
   * Get changed files with GitHub comparison if available
   */
  private async getChangedFilesWithComparison(): Promise<Map<string, FileChange>> {
    // Get settings to determine if we should compare with GitHub
    const { repoOwner, projectSettings } = await chrome.storage.sync.get([
      'repoOwner',
      'projectSettings',
    ]);

    // Get the current project ID from the URL
    const projectId = window.location.pathname.split('/').pop() || '';

    let changedFiles: Map<string, FileChange>;

    // Check if GitHub comparison is possible
    if (repoOwner && projectSettings?.[projectId]) {
      const { repoName, branch } = projectSettings[projectId];
      const targetBranch = branch || 'main';

      console.log('Comparing with GitHub repository...');
      console.log(`Repository: ${repoOwner}/${repoName}, Branch: ${targetBranch}`);

      // Use GitHub comparison
      try {
        // Import GitHubService dynamically to avoid circular dependencies
        const { GitHubService } = await import('../../services/GitHubService');

        // Create a new instance of GitHubService
        const token = await chrome.storage.sync.get(['githubToken']);
        const githubService = new GitHubService(token.githubToken);

        // Compare with GitHub
        changedFiles = await this.filePreviewService.compareWithGitHub(
          repoOwner,
          repoName,
          targetBranch,
          githubService
        );

        console.log('Successfully compared with GitHub repository');
      } catch (githubError) {
        console.warn(
          'Failed to compare with GitHub, falling back to local comparison:',
          githubError
        );
        // Fall back to local comparison
        changedFiles = await this.filePreviewService.getChangedFiles();
      }
    } else {
      console.log('No GitHub settings found, using local comparison only');
      // Use local comparison only
      changedFiles = await this.filePreviewService.getChangedFiles();
    }

    return changedFiles;
  }

  /**
   * Process and display the changed files
   */
  private async processAndDisplayChanges(changedFiles: Map<string, FileChange>): Promise<void> {
    // Count files by status
    const counts = this.countFilesByStatus(changedFiles);

    // Log summary and details
    this.logChangeSummary(counts, changedFiles);

    // Show notification with summary
    this.notificationManager.showNotification({
      type: 'success',
      message: `Found ${counts.addedCount + counts.modifiedCount} changed files. Opening file changes view...`,
      duration: 5000,
    });

    // Send file changes to popup and store in local storage
    await this.sendAndStoreChanges(changedFiles);
  }

  /**
   * Count files by status
   */
  private countFilesByStatus(changedFiles: Map<string, FileChange>): {
    addedCount: number;
    modifiedCount: number;
    unchangedCount: number;
    deletedCount: number;
  } {
    let addedCount = 0;
    let modifiedCount = 0;
    let unchangedCount = 0;
    let deletedCount = 0;

    changedFiles.forEach((file) => {
      switch (file.status) {
        case 'added':
          addedCount++;
          break;
        case 'modified':
          modifiedCount++;
          break;
        case 'unchanged':
          unchangedCount++;
          break;
        case 'deleted':
          deletedCount++;
          break;
      }
    });

    return { addedCount, modifiedCount, unchangedCount, deletedCount };
  }

  /**
   * Log change summary and details to console
   */
  private logChangeSummary(
    counts: {
      addedCount: number;
      modifiedCount: number;
      unchangedCount: number;
      deletedCount: number;
    },
    changedFiles: Map<string, FileChange>
  ): void {
    // Log summary
    console.log('Change Summary:');
    console.log(`- Total files: ${changedFiles.size}`);
    console.log(`- Added: ${counts.addedCount}`);
    console.log(`- Modified: ${counts.modifiedCount}`);
    console.log(`- Unchanged: ${counts.unchangedCount}`);
    console.log(`- Deleted: ${counts.deletedCount}`);

    // Log details of changed files (added and modified)
    if (counts.addedCount > 0 || counts.modifiedCount > 0) {
      console.log('\nChanged Files:');
      changedFiles.forEach((file, path) => {
        if (file.status === 'added' || file.status === 'modified') {
          console.log(`${file.status === 'added' ? '➕' : '✏️'} ${path}`);
        }
      });
    }

    // Log deleted files if any
    if (counts.deletedCount > 0) {
      console.log('\nDeleted Files:');
      changedFiles.forEach((file, path) => {
        if (file.status === 'deleted') {
          console.log(`❌ ${path}`);
        }
      });
    }

    console.groupEnd();
  }

  /**
   * Send file changes to popup and store in local storage
   */
  private async sendAndStoreChanges(changedFiles: Map<string, FileChange>): Promise<void> {
    // Get the current project ID from the URL
    const projectId = window.location.pathname.split('/').pop() || '';

    // Convert Map to object for message passing
    const changesObject: Record<string, FileChange> = {};
    changedFiles.forEach((value, key) => {
      changesObject[key] = value;
    });

    // Send message to open the popup with file changes
    this.messageHandler.sendMessage('OPEN_FILE_CHANGES', {
      changes: changesObject,
      projectId, // Include the projectId to identify which project these changes belong to
    });

    // Also store the changes in local storage for future retrieval
    try {
      await chrome.storage.local.set({
        storedFileChanges: { projectId, changes: changesObject },
      });
      console.log('File changes stored in local storage for future retrieval');
    } catch (storageError) {
      console.error('Failed to store file changes in local storage:', storageError);
    }
  }

  /**
   * Get the current project ID from the URL
   */
  public getCurrentProjectId(): string {
    return window.location.pathname.split('/').pop() || '';
  }

  /**
   * Get changed files without showing the UI
   * Useful for programmatic access to file changes
   */
  public async getChangedFiles(forceRefresh: boolean = false): Promise<Map<string, FileChange>> {
    if (forceRefresh) {
      await this.filePreviewService.loadProjectFiles(true);
    }
    return this.getChangedFilesWithComparison();
  }
}
