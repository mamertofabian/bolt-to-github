import type { IFileChangeHandler } from '../types/HandlerInterfaces';
import type { INotificationManager, IUploadStatusManager } from '../types/ManagerInterfaces';
import type { MessageHandler } from '../MessageHandler';
import { FilePreviewService, type FileChange } from '../../services/FilePreviewService';
import type { PremiumService } from '../services/PremiumService';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('FileChangeHandler');

/**
 * FileChangeHandler handles file change detection, comparison, and display
 * Previously part of UIManager
 */
export class FileChangeHandler implements IFileChangeHandler {
  private messageHandler: MessageHandler;
  private notificationManager: INotificationManager;
  private uploadStatusManager: IUploadStatusManager | null = null;
  private filePreviewService: FilePreviewService;
  private premiumService: PremiumService | null = null;

  constructor(
    messageHandler: MessageHandler,
    notificationManager: INotificationManager,
    uploadStatusManager?: IUploadStatusManager
  ) {
    this.messageHandler = messageHandler;
    this.notificationManager = notificationManager;
    this.uploadStatusManager = uploadStatusManager || null;
    this.filePreviewService = FilePreviewService.getInstance();
  }

  /**
   * Set premium service reference (called by UIManager)
   */
  public setPremiumService(premiumService: PremiumService): void {
    this.premiumService = premiumService;
  }

  /**
   * Set upload status manager reference (called by UIManager)
   */
  public setUploadStatusManager(uploadStatusManager: IUploadStatusManager): void {
    this.uploadStatusManager = uploadStatusManager;
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
    /* Check premium status */
    if (!this.premiumService) {
      logger.warn('PremiumService not available for file changes check');
      this.showPremiumRequiredNotification();
      return;
    }

    /* Validate subscription status with server before allowing feature use */
    const usage = await this.premiumService.canUseFileChanges();
    if (!usage.allowed) {
      this.showPremiumRequiredNotification();
      return;
    }

    /* Track usage for premium users (no-op for premium users) */
    await this.premiumService.useFileChanges();

    try {
      /* Show initial loading status with progress tracking */
      if (this.uploadStatusManager) {
        this.uploadStatusManager.updateStatus({
          status: 'loading',
          message: 'Loading project files...',
          progress: 10,
        });
      } else {
        // Fallback to notification for backward compatibility
        this.notificationManager.showNotification({
          type: 'info',
          message: 'Loading project files...',
          duration: 10000,
        });
      }

      logger.info('Changed Files');
      logger.info('Refreshing and loading project files...');

      /* Load the current project files with a forced refresh (invalidate cache) */
      /* since this is a user-driven action, we always want the latest files */
      const startTime = performance.now();
      await this.filePreviewService.loadProjectFiles(true); /* Pass true to force refresh */
      const loadTime = performance.now() - startTime;
      logger.info(`Files loaded in ${loadTime.toFixed(2)}ms`);

      /* Update to analyzing status */
      if (this.uploadStatusManager) {
        this.uploadStatusManager.updateStatus({
          status: 'analyzing',
          message: 'Comparing files with GitHub repository...',
          progress: 60,
        });
      } else {
        // Fallback to notification for backward compatibility
        this.notificationManager.showNotification({
          type: 'info',
          message: 'Comparing files with GitHub repository...',
          duration: 8000,
        });
      }

      /* Get changed files (with GitHub comparison if possible) */
      const changedFiles = await this.getChangedFilesWithComparison();

      /* Process and display results */
      await this.processAndDisplayChanges(changedFiles);
    } catch (error) {
      logger.error('Error showing changed files:', error);
      if (this.uploadStatusManager) {
        this.uploadStatusManager.updateStatus({
          status: 'error',
          message: `Failed to show changed files: ${error instanceof Error ? error.message : 'Unknown error'}`,
          progress: 100,
        });
      } else {
        // Fallback to notification for backward compatibility
        this.notificationManager.showNotification({
          type: 'error',
          message: `Failed to show changed files: ${error instanceof Error ? error.message : 'Unknown error'}`,
          duration: 5000,
        });
      }
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

      logger.info('Comparing with GitHub repository...');
      logger.info(`Repository: ${repoOwner}/${repoName}, Branch: ${targetBranch}`);

      // Use GitHub comparison
      try {
        // Import UnifiedGitHubService dynamically to avoid circular dependencies
        const { UnifiedGitHubService } = await import('../../services/UnifiedGitHubService');

        // Get authentication method
        const authSettings = await chrome.storage.local.get(['authenticationMethod']);
        const authMethod = authSettings.authenticationMethod || 'pat';

        let githubService: InstanceType<typeof UnifiedGitHubService>;

        if (authMethod === 'github_app') {
          githubService = new UnifiedGitHubService({ type: 'github_app' });
        } else {
          // Create with PAT
          const token = await chrome.storage.sync.get(['githubToken']);
          githubService = new UnifiedGitHubService(token.githubToken);
        }

        // Compare with GitHub
        changedFiles = await this.filePreviewService.compareWithGitHub(
          repoOwner,
          repoName,
          targetBranch,
          githubService
        );

        logger.info('Successfully compared with GitHub repository');
      } catch (githubError) {
        logger.warn(
          'Failed to compare with GitHub, falling back based on error type:',
          githubError
        );

        // Check if this is a 404 error (repository doesn't exist)
        const is404Error =
          githubError instanceof Error &&
          (githubError.message.includes('404') || githubError.message.includes('Not Found'));

        if (is404Error) {
          logger.info('Repository does not exist - treating all files as new for push purposes');
          // For non-existent repositories, get current files and mark them as 'added'
          // This is appropriate for push reminders since the user needs to create the repo
          changedFiles = await this.getChangedFilesForNonExistentRepo();
        } else {
          // For other GitHub errors (network, auth, etc.), fall back to local comparison
          logger.info('GitHub error (not 404) - falling back to local comparison');
          changedFiles = await this.filePreviewService.getChangedFiles();
        }
      }
    } else {
      logger.info('No GitHub settings found - treating all files as new for push purposes');
      // If no GitHub settings are configured, this project has never been associated with GitHub
      // All files should be considered as 'added' since they need to be pushed for the first time
      // This ensures push reminders work correctly for projects that haven't been set up with GitHub yet
      changedFiles = await this.getChangedFilesForNonExistentRepo();
    }

    return changedFiles;
  }

  /**
   * Get changed files for a non-existent repository
   * Marks all current files as 'added' since they need to be pushed to create the repo
   */
  private async getChangedFilesForNonExistentRepo(): Promise<Map<string, FileChange>> {
    // Load current project files
    await this.filePreviewService.loadProjectFiles();

    // Get processed files (applying gitignore rules)
    const processedFiles = await this.filePreviewService.getProcessedFiles();

    const changes = new Map<string, FileChange>();

    // Mark all files as 'added' since the repository doesn't exist
    processedFiles.forEach((content, path) => {
      // Skip directory entries (empty files or paths ending with /)
      if (content === '' || path.endsWith('/')) {
        return;
      }

      changes.set(path, {
        path,
        status: 'added',
        content,
      });
    });

    logger.info(`Marked ${changes.size} files as 'added' for non-existent repository`);
    return changes;
  }

  /**
   * Process and display the changed files
   */
  private async processAndDisplayChanges(changedFiles: Map<string, FileChange>): Promise<void> {
    // Count files by status
    const counts = this.countFilesByStatus(changedFiles);

    // Log summary and details
    this.logChangeSummary(counts, changedFiles);

    // Send file changes to popup and store in local storage
    await this.sendAndStoreChanges(changedFiles);

    // Show completion status with file count
    const totalChanges = counts.addedCount + counts.modifiedCount;
    if (this.uploadStatusManager) {
      this.uploadStatusManager.updateStatus({
        status: 'complete',
        message: `Found ${totalChanges} changed files. Opening file changes view...`,
        progress: 100,
      });
    } else {
      // Fallback to notification for backward compatibility
      this.notificationManager.showNotification({
        type: 'success',
        message: `Found ${totalChanges} changed files. Opening file changes view...`,
        duration: 5000,
      });
    }
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
    logger.info('Change Summary:');
    logger.info(`- Total files: ${changedFiles.size}`);
    logger.info(`- Added: ${counts.addedCount}`);
    logger.info(`- Modified: ${counts.modifiedCount}`);
    logger.info(`- Unchanged: ${counts.unchangedCount}`);
    logger.info(`- Deleted: ${counts.deletedCount}`);

    // Log details of changed files (added and modified)
    if (counts.addedCount > 0 || counts.modifiedCount > 0) {
      logger.info('\nChanged Files:');
      changedFiles.forEach((file, path) => {
        if (file.status === 'added' || file.status === 'modified') {
          logger.info(`${file.status === 'added' ? '➕' : '✏️'} ${path}`);
        }
      });
    }

    // Log deleted files if any
    if (counts.deletedCount > 0) {
      logger.info('\nDeleted Files:');
      changedFiles.forEach((file, path) => {
        if (file.status === 'deleted') {
          logger.info(`❌ ${path}`);
        }
      });
    }
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
        storedFileChanges: {
          projectId,
          changes: changesObject,
          timestamp: Date.now(),
          url: window.location.href, // Store URL to detect navigation changes
        },
      });
      logger.info('File changes stored in local storage for future retrieval with timestamp');
    } catch (storageError) {
      logger.error('Failed to store file changes in local storage:', storageError);
    }
  }

  /**
   * Show premium required notification for file changes feature
   */
  private showPremiumRequiredNotification(): void {
    this.notificationManager.showUpgradeNotification({
      type: 'info',
      message:
        '🔒 File changes comparison is a Pro feature. Upgrade to view detailed file changes and comparisons!',
      duration: 10000,
      upgradeText: 'Upgrade Now',
      onUpgrade: () => {
        logger.info('🔊 Upgrade button clicked for file changes feature');

        // Primary approach: try to open upgrade URL directly
        try {
          logger.info('🔊 Opening upgrade URL...');
          window.open('https://bolt2github.com/upgrade', '_blank');
          logger.info('✅ Upgrade URL opened successfully');
        } catch (openError) {
          logger.error('❌ Could not open upgrade URL:', openError);

          // Fallback: try Chrome extension URLs if direct URL fails
          try {
            logger.info('🔊 Trying Chrome tabs API fallback...');
            chrome.tabs.create({ url: 'https://bolt2github.com/upgrade' });
            logger.info('✅ Chrome tabs API worked');
          } catch (tabsError) {
            logger.error('❌ Chrome tabs API also failed:', tabsError);
          }
        }
      },
    });
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
