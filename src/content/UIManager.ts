import type { UploadStatusState } from '$lib/types';
import { SettingsService } from '../services/settings';
import { DownloadService } from '../services/DownloadService';
import { FilePreviewService, type FileChange } from '../services/FilePreviewService';
import type { MessageHandler } from './MessageHandler';
// Remove UploadStatus import since it's now handled by UploadStatusManager
// import UploadStatus from './UploadStatus.svelte';

// Import new types and managers
import type {
  NotificationOptions,
  SvelteComponent,
  ConfirmationOptions,
  ConfirmationResult,
} from './types/UITypes';
import { NotificationManager } from './managers/NotificationManager';
import { UploadStatusManager } from './managers/UploadStatusManager';
import { GitHubButtonManager } from './managers/GitHubButtonManager';
import { DropdownManager } from './managers/DropdownManager';

// Remove the old type definitions since they're now in UITypes
// type SvelteComponent = {
//   $set: (props: Record<string, any>) => void;
//   $destroy: () => void;
// };
//
// interface NotificationOptions {
//   type: 'info' | 'error' | 'success';
//   message: string;
//   duration?: number;
// }

export class UIManager {
  private static instance: UIManager | null = null;
  // Remove uploadButton since it's now in GitHubButtonManager
  // private uploadButton: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  // Remove the old notification component since it's now in NotificationManager
  // private notificationComponent: SvelteComponent | null = null;
  private isGitHubUpload = false;
  private messageHandler: MessageHandler;
  private downloadService: DownloadService;
  private filePreviewService: FilePreviewService;

  // Add the managers
  private notificationManager: NotificationManager;
  private uploadStatusManager: UploadStatusManager;
  private githubButtonManager: GitHubButtonManager;
  private dropdownManager: DropdownManager;

  private constructor(messageHandler: MessageHandler) {
    this.messageHandler = messageHandler;
    this.downloadService = new DownloadService();
    this.filePreviewService = FilePreviewService.getInstance();

    // Initialize NotificationManager
    this.notificationManager = new NotificationManager(messageHandler);

    // Initialize UploadStatusManager with callback for button state management
    this.uploadStatusManager = new UploadStatusManager((status: UploadStatusState) => {
      this.handleUploadStatusChange(status);
    });

    // Initialize GitHubButtonManager with dropdown click callback
    this.githubButtonManager = new GitHubButtonManager(async (button: HTMLButtonElement) => {
      await this.dropdownManager.show(button);
    });

    // Initialize DropdownManager with action callbacks
    this.dropdownManager = new DropdownManager(
      messageHandler,
      () => this.handleGitHubPushAction(), // Push action callback
      () => this.handleShowChangedFiles() // Show changed files callback
    );

    this.initializeUI();
    this.setupMutationObserver();
  }

  static getInstance(messageHandler?: MessageHandler): UIManager {
    if (!UIManager.instance && messageHandler) {
      UIManager.instance = new UIManager(messageHandler);
    } else if (!UIManager.instance) {
      throw new Error('UIManager must be initialized with a MessageHandler first');
    }
    return UIManager.instance;
  }

  // Method to explicitly initialize with MessageHandler
  static initialize(messageHandler: MessageHandler): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager(messageHandler);
    }
    return UIManager.instance;
  }

  // Reset instance (useful for testing or cleanup)
  static resetInstance(): void {
    if (UIManager.instance) {
      UIManager.instance.cleanup();
      UIManager.instance = null;
    }
  }

  public showNotification(options: NotificationOptions): void {
    // Delegate to NotificationManager
    this.notificationManager.showNotification(options);
  }

  private async initializeUI() {
    console.log('🔊 Initializing UI');
    // Use UploadStatusManager instead of direct initialization
    this.uploadStatusManager.initialize();
    // Use GitHubButtonManager instead of direct initialization
    await this.githubButtonManager.initialize();
  }

  private setupMutationObserver() {
    let timeoutId: number;
    let retryCount = 0;
    const maxRetries = 3;

    const attemptInitialization = () => {
      const button = document.querySelector('[data-github-upload]');
      const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');

      if (!button && buttonContainer) {
        this.githubButtonManager.initialize();
        retryCount = 0; // Reset count on success
      } else if (!buttonContainer && retryCount < maxRetries) {
        retryCount++;
        timeoutId = window.setTimeout(attemptInitialization, 1000); // 1 second between retries
      } else if (retryCount >= maxRetries) {
        this.showNotification({
          type: 'error',
          message:
            'Failed to initialize GitHub upload button. Please try to refresh the page. If the issue persists, please submit an issue on GitHub.',
          duration: 7000,
        });
        retryCount = 0; // Reset for future attempts
      }
    };

    this.observer = new MutationObserver(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(attemptInitialization, 500);
    });

    // Wait for document.body to be available
    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      // If body isn't available, wait for it
      document.addEventListener('DOMContentLoaded', () => {
        this.observer?.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
    }
  }

  /**
   * Handle the "Show Changed Files" button click
   * This will download the project files (or use cache) and show changed files in the console
   */
  public async handleShowChangedFiles() {
    try {
      // Show notification that we're refreshing and loading files
      this.showNotification({
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
          const { GitHubService } = await import('../services/GitHubService');

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

      // Count files by status
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

      // Log summary
      console.log('Change Summary:');
      console.log(`- Total files: ${changedFiles.size}`);
      console.log(`- Added: ${addedCount}`);
      console.log(`- Modified: ${modifiedCount}`);
      console.log(`- Unchanged: ${unchangedCount}`);
      console.log(`- Deleted: ${deletedCount}`);

      // Log details of changed files (added and modified)
      if (addedCount > 0 || modifiedCount > 0) {
        console.log('\nChanged Files:');
        changedFiles.forEach((file, path) => {
          if (file.status === 'added' || file.status === 'modified') {
            console.log(`${file.status === 'added' ? '➕' : '✏️'} ${path}`);
          }
        });
      }

      // Log deleted files if any
      if (deletedCount > 0) {
        console.log('\nDeleted Files:');
        changedFiles.forEach((file, path) => {
          if (file.status === 'deleted') {
            console.log(`❌ ${path}`);
          }
        });
      }

      console.groupEnd();

      // Show notification with summary
      this.showNotification({
        type: 'success',
        message: `Found ${addedCount + modifiedCount} changed files. Opening file changes view...`,
        duration: 5000,
      });

      // Send file changes to popup for display
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
    } catch (error) {
      console.error('Error showing changed files:', error);
      this.showNotification({
        type: 'error',
        message: `Failed to show changed files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });
    }
  }

  /**
   * Handle upload status changes - callback from UploadStatusManager
   * This manages the button state when upload status changes
   */
  private handleUploadStatusChange(status: UploadStatusState): void {
    // Reset GitHub button when upload is complete
    if (status.status !== 'uploading' && this.isGitHubUpload) {
      this.isGitHubUpload = false;
      this.githubButtonManager.resetState();
    }
  }

  public async handleGitHubPushAction() {
    console.log('🔊 Handling GitHub push action');

    const settings = await SettingsService.getGitHubSettings();
    if (!settings.isSettingsValid) {
      this.notificationManager.showSettingsNotification();
      return;
    }

    const { confirmed, commitMessage } = await this.notificationManager.showConfirmationDialog({
      title: 'Confirm GitHub Upload',
      message: `Are you sure you want to upload this project to GitHub? <br />
        <span class="font-mono">${settings.gitHubSettings?.projectSettings?.repoName || 'N/A'} / ${settings.gitHubSettings?.projectSettings?.branch || 'N/A'}</span>`,
      confirmText: 'Upload',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    try {
      // Update button state to processing
      this.githubButtonManager.setProcessingState();

      this.isGitHubUpload = true;
      this.messageHandler.sendCommitMessage(commitMessage || 'Commit from Bolt to GitHub');

      // Update status to show we're downloading
      this.updateUploadStatus({
        status: 'uploading',
        progress: 5,
        message: 'Downloading project files...',
      });

      try {
        // Use the DownloadService to get the project files (using cache if available)
        const blob = await this.downloadService.downloadProjectZip();

        // Convert blob to base64 and send to background script
        const base64data = await this.downloadService.blobToBase64(blob);
        if (base64data) {
          this.messageHandler.sendZipData(base64data);
        } else {
          throw new Error('Failed to convert ZIP file to base64');
        }
      } catch (error) {
        // If download fails, try to use cached files as fallback
        console.warn('Download failed, trying to use cached files:', error);
        this.updateUploadStatus({
          status: 'uploading',
          progress: 5,
          message: 'Using cached project files...',
        });

        // Get cached project files and convert to base64
        const files = await this.downloadService.getProjectFiles(false);
        if (files && files.size > 0) {
          // We need to convert the files back to a ZIP format
          // This will be handled by the background script
          this.messageHandler.sendMessage('USE_CACHED_FILES', { files: Object.fromEntries(files) });
        } else {
          throw new Error('No cached files available and download failed');
        }
      }
    } catch (error) {
      console.error('Error during GitHub upload:', error);
      this.showNotification({
        type: 'error',
        message: `Failed to download project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });

      // Reset button state
      this.githubButtonManager.updateState(true);
      this.isGitHubUpload = false;
    }
  }

  public cleanup() {
    this.observer?.disconnect();

    // Use managers' cleanup methods
    this.githubButtonManager.cleanup();
    this.dropdownManager.cleanup();
    this.notificationManager.cleanup();
    this.uploadStatusManager.cleanup();
  }

  public reinitialize() {
    console.log('🔊 Reinitializing UI manager');
    this.cleanup();
    this.initializeUI();
  }

  public updateUploadStatus(status: UploadStatusState) {
    // Delegate to UploadStatusManager
    this.uploadStatusManager.updateStatus(status);
  }

  public updateButtonState(isValid: boolean) {
    // Delegate to GitHubButtonManager
    this.githubButtonManager.updateState(isValid);
  }
}
