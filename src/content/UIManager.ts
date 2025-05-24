import type { UploadStatusState } from '$lib/types';
import type { MessageHandler } from './MessageHandler';

// Import new types and managers
import type { NotificationOptions } from './types/UITypes';
import { NotificationManager } from './managers/NotificationManager';
import { UploadStatusManager } from './managers/UploadStatusManager';
import { GitHubButtonManager } from './managers/GitHubButtonManager';
import { DropdownManager } from './managers/DropdownManager';
import { GitHubUploadHandler } from './handlers/GitHubUploadHandler';
import { FileChangeHandler } from './handlers/FileChangeHandler';
import { DOMObserver } from './infrastructure/DOMObserver';
import { ComponentLifecycleManager } from './infrastructure/ComponentLifecycleManager';
import { UIStateManager } from './services/UIStateManager';
import { PushReminderService } from './services/PushReminderService';

export class UIManager {
  private static instance: UIManager | null = null;
  private isGitHubUpload = false;

  // Add centralized state management
  private stateManager: UIStateManager;

  // Add the managers
  private notificationManager: NotificationManager;
  private uploadStatusManager: UploadStatusManager;
  private githubButtonManager: GitHubButtonManager;
  private dropdownManager: DropdownManager;

  // Add the handlers
  private githubUploadHandler: GitHubUploadHandler;
  private fileChangeHandler: FileChangeHandler;

  // Add infrastructure components
  private domObserver: DOMObserver;
  private componentLifecycleManager: ComponentLifecycleManager;

  // Add services
  private pushReminderService: PushReminderService;

  private constructor(messageHandler: MessageHandler) {
    // Initialize centralized state management first
    this.stateManager = new UIStateManager();

    // Initialize infrastructure components
    this.domObserver = new DOMObserver(3, 1000, 500); // maxRetries, retryDelay, observationDelay
    this.componentLifecycleManager = new ComponentLifecycleManager();

    // Initialize NotificationManager with state integration
    this.notificationManager = new NotificationManager(messageHandler, this.stateManager);

    // Initialize UploadStatusManager with state integration
    this.uploadStatusManager = new UploadStatusManager(this.stateManager);

    // Initialize GitHubButtonManager with state integration
    this.githubButtonManager = new GitHubButtonManager(
      this.stateManager,
      async (button: HTMLButtonElement) => {
        await this.dropdownManager.show(button);
      }
    );

    // Initialize DropdownManager with state integration
    this.dropdownManager = new DropdownManager(
      messageHandler,
      this.stateManager,
      () => this.handleGitHubPushAction(), // Push action callback
      () => this.handleShowChangedFiles() // Show changed files callback
    );

    // Initialize GitHubUploadHandler with state integration
    this.githubUploadHandler = new GitHubUploadHandler(
      messageHandler,
      this.notificationManager,
      this.stateManager
    );

    // Initialize FileChangeHandler
    this.fileChangeHandler = new FileChangeHandler(messageHandler, this.notificationManager);

    // Initialize PushReminderService
    console.log('🔊 Initializing PushReminderService');
    this.pushReminderService = new PushReminderService(messageHandler, this.notificationManager);

    // Set up state change listening for coordination
    this.setupStateCoordination();

    this.initializeUI();
    this.startDOMObservation();
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
      console.log('🔧 UIManager: Resetting singleton instance');
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
    this.uploadStatusManager.initialize();
    await this.githubButtonManager.initialize();
  }

  private startDOMObservation() {
    this.domObserver.start(
      () => {
        // Initialization callback - called when DOM changes are detected
        const button = document.querySelector('[data-github-upload]');
        const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');

        if (!button && buttonContainer) {
          this.githubButtonManager.initialize();
        } else if (!buttonContainer) {
          // Still attempt initialization even if container is not found
          this.githubButtonManager.initialize();
        }
      },
      () => {
        // Error callback - called when max retries are reached
        this.showNotification({
          type: 'error',
          message:
            'Failed to initialize GitHub upload button. Please try to refresh the page. If the issue persists, please submit an issue on GitHub.',
          duration: 7000,
        });
      }
    );
  }

  /**
   * Handle the "Show Changed Files" button click
   * Delegates to FileChangeHandler
   */
  public async handleShowChangedFiles() {
    return this.fileChangeHandler.showChangedFiles();
  }

  /**
   * Handle upload status changes - now managed through UIStateManager
   * This method is called by state change listeners
   */
  private handleUploadStatusChange(newState: any, previousState: any): void {
    const status = newState.uploadStatus;
    const buttonState = newState.buttonState;

    // Handle specific loading states
    if (buttonState.loadingState && buttonState.isProcessing) {
      switch (buttonState.loadingState) {
        case 'detecting-changes':
          this.githubButtonManager.setDetectingChangesState();
          break;
        case 'pushing':
          this.githubButtonManager.setPushingState();
          break;
        case 'custom':
          if (buttonState.loadingText) {
            this.githubButtonManager.setLoadingState(buttonState.loadingText);
          }
          break;
      }
    } else if (!buttonState.isProcessing && !buttonState.loadingState) {
      // Reset button state when not processing and no loading state
      this.githubButtonManager.resetState();
    } else if (buttonState.isProcessing && !buttonState.loadingState) {
      // Use legacy processing state for backward compatibility
      this.githubButtonManager.setProcessingState();
    }

    // Reset GitHub button when upload is complete
    if (status.status !== 'uploading' && this.isGitHubUpload) {
      this.isGitHubUpload = false;

      // Reset push reminder state when upload completes successfully
      if (status.status === 'success') {
        this.pushReminderService.resetReminderState();
      }
    }

    // Update isGitHubUpload flag based on upload status
    if (status.status === 'uploading') {
      this.isGitHubUpload = true;
    }
  }

  /**
   * Handle GitHub push action
   * Delegates to GitHubUploadHandler
   */
  public async handleGitHubPushAction() {
    // Skip change detection for direct GitHub button clicks
    // The upload process itself has intelligent hash-based change detection
    return this.githubUploadHandler.handleGitHubPush(true, true);
  }

  public cleanup() {
    // Stop DOM observation
    this.domObserver.stop();

    // Cleanup all components through ComponentLifecycleManager
    this.componentLifecycleManager.cleanupAll();

    // Use managers' cleanup methods
    this.githubButtonManager.cleanup();
    this.dropdownManager.cleanup();
    this.notificationManager.cleanup();
    this.uploadStatusManager.cleanup();

    // Cleanup services
    this.pushReminderService.cleanup();
  }

  public reinitialize() {
    console.log('🔊 Reinitializing UI manager');
    this.cleanup();
    this.initializeUI();
    this.startDOMObservation();
  }

  public updateUploadStatus(status: UploadStatusState) {
    // Delegate to UploadStatusManager
    this.uploadStatusManager.updateStatus(status);
  }

  public updateButtonState(isValid: boolean) {
    // Delegate to GitHubButtonManager
    this.githubButtonManager.updateState(isValid);
  }

  /**
   * Set up state coordination between components
   */
  private setupStateCoordination(): void {
    // Listen to state changes for coordination
    this.stateManager.addListener((newState, previousState) => {
      this.handleUploadStatusChange(newState, previousState);
    });

    // Mark components as initialized
    this.stateManager.setComponentInitialized('notificationInitialized', true);
    this.stateManager.setComponentInitialized('uploadStatusInitialized', true);
  }

  /**
   * Get push reminder service for external control
   */
  public getPushReminderService(): PushReminderService {
    return this.pushReminderService;
  }

  /**
   * Enable push reminders
   */
  public enablePushReminders(): void {
    this.pushReminderService.enable();
  }

  /**
   * Disable push reminders
   */
  public disablePushReminders(): void {
    this.pushReminderService.disable();
  }

  /**
   * Snooze push reminders for the configured interval
   */
  public snoozePushReminders(): void {
    this.pushReminderService.snoozeReminders();
  }

  /**
   * Enable debug mode for push reminders (faster testing)
   */
  public enablePushReminderDebugMode(): void {
    this.pushReminderService.enableDebugMode();
  }

  /**
   * Disable debug mode for push reminders
   */
  public disablePushReminderDebugMode(): void {
    this.pushReminderService.disableDebugMode();
  }

  /**
   * Force a push reminder check (for testing)
   */
  public async forceReminderCheck(): Promise<void> {
    return this.pushReminderService.forceReminderCheck();
  }

  /**
   * Force show a push reminder (for testing)
   */
  public async forceShowReminder(): Promise<void> {
    return this.pushReminderService.forceShowReminder();
  }

  /**
   * Force a scheduled reminder check (for testing)
   */
  public async forceScheduledReminderCheck(): Promise<void> {
    return this.pushReminderService.forceScheduledReminderCheck();
  }

  /**
   * Force show a scheduled reminder (for testing)
   */
  public async forceShowScheduledReminder(): Promise<void> {
    return this.pushReminderService.forceShowScheduledReminder();
  }
}
