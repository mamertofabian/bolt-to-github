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
import { GitHubUploadHandler } from './handlers/GitHubUploadHandler';
import { FileChangeHandler } from './handlers/FileChangeHandler';

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

  // Add the handlers
  private githubUploadHandler: GitHubUploadHandler;
  private fileChangeHandler: FileChangeHandler;

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

    // Initialize GitHubUploadHandler
    this.githubUploadHandler = new GitHubUploadHandler(
      messageHandler,
      this.notificationManager,
      (isProcessing: boolean) => {
        // Handle button state changes
        if (isProcessing) {
          this.githubButtonManager.setProcessingState();
          this.isGitHubUpload = true;
        } else {
          this.githubButtonManager.updateState(true);
          this.isGitHubUpload = false;
        }
      },
      (status: UploadStatusState) => {
        // Handle upload status updates
        this.updateUploadStatus(status);
      }
    );

    // Initialize FileChangeHandler
    this.fileChangeHandler = new FileChangeHandler(messageHandler, this.notificationManager);

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
   * Delegates to FileChangeHandler
   */
  public async handleShowChangedFiles() {
    return this.fileChangeHandler.showChangedFiles();
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

  /**
   * Handle GitHub push action
   * Delegates to GitHubUploadHandler
   */
  public async handleGitHubPushAction() {
    return this.githubUploadHandler.handleGitHubPush();
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
