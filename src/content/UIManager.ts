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
import { PremiumService } from './services/PremiumService';
import { WhatsNewManager } from './managers/WhatsNewManager';
import { UIElementFactory } from './infrastructure/UIElementFactory';
import { createLogger } from '$lib/utils/logger';
import { SettingsService } from '../services/settings';

const logger = createLogger('UIManager');

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
  private premiumService: PremiumService;
  private whatsNewManager: WhatsNewManager;

  // Store original history functions for cleanup
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;

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
      () => this.handleShowChangedFiles(), // Show changed files callback
      (feature: string) => this.handleUpgradePrompt(feature) // Upgrade prompt callback
    );

    // Initialize GitHubUploadHandler with state integration
    this.githubUploadHandler = new GitHubUploadHandler(
      messageHandler,
      this.notificationManager,
      this.stateManager
    );

    // Initialize FileChangeHandler
    this.fileChangeHandler = new FileChangeHandler(
      messageHandler,
      this.notificationManager,
      this.uploadStatusManager
    );

    // Initialize PushReminderService
    logger.info('🔊 Initializing PushReminderService');
    this.pushReminderService = new PushReminderService(messageHandler, this.notificationManager);

    // Initialize PremiumService
    logger.info('🔊 Initializing PremiumService');
    this.premiumService = new PremiumService();

    // Initialize WhatsNewManager
    logger.info('🔊 Initializing WhatsNewManager');
    this.whatsNewManager = new WhatsNewManager(this.componentLifecycleManager, {
      createRootContainer: (id: string) =>
        UIElementFactory.createContainer({
          id,
          styles: {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '9999',
          },
        }),
    });

    // Set UIManager reference in PremiumService for component updates
    this.premiumService.setUIManager(this);

    // Link premium service to push reminder service
    this.pushReminderService.setPremiumService(this.premiumService);

    // Link premium service to file change handler
    this.fileChangeHandler.setPremiumService(this.premiumService);

    // Link upload status manager to file change handler
    this.fileChangeHandler.setUploadStatusManager(this.uploadStatusManager);

    // Link premium service to dropdown manager
    this.dropdownManager.setPremiumService(this.premiumService);

    // Set up state change listening for coordination
    this.setupStateCoordination();

    // Set up URL change detection for SPA navigation
    this.setupURLChangeDetection();

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
      logger.info('🔧 UIManager: Resetting singleton instance');
      UIManager.instance.cleanup();
      UIManager.instance = null;
    }
  }

  public showNotification(options: NotificationOptions): void {
    // Delegate to NotificationManager
    this.notificationManager.showNotification(options);
  }

  private async initializeUI() {
    logger.info('🔊 Initializing UI');
    this.uploadStatusManager.initialize();
    // Don't initialize button here - let DOM observer handle it
    // to prevent duplicate buttons during recovery

    // Set current project ID if we're on a project page
    const currentProjectId = this.extractProjectIdFromUrl(window.location.href);
    if (currentProjectId && this.isOnProjectPage()) {
      try {
        await SettingsService.setProjectId(currentProjectId);
        logger.info('🔄 Set initial project ID to:', currentProjectId);
      } catch (error) {
        logger.warn('Failed to set initial project ID:', error);
      }
    }

    // Check and show What's New modal if needed
    await this.whatsNewManager.checkAndShow();
  }

  private startDOMObservation() {
    this.domObserver.start(
      () => {
        // Initialization callback - called when DOM changes are detected
        const button = document.querySelector('[data-github-upload]');
        const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');

        // Enhanced detection: Check if we're on a project page
        const isProjectPage = this.isOnProjectPage();

        logger.info('🔊 DOM change detected:', {
          hasButton: !!button,
          hasContainer: !!buttonContainer,
          isProjectPage,
          currentUrl: window.location.href,
        });

        // Only initialize if:
        // 1. We don't already have a button
        // 2. We have a button container (indicating project UI is loaded)
        // 3. We're actually on a project page
        if (!button && buttonContainer && isProjectPage) {
          logger.info('🔊 Initializing GitHub button for new project');
          this.githubButtonManager.initialize();
        } else if (!button && !buttonContainer && isProjectPage) {
          // Project page detected but container not ready yet - this is normal during page load
          logger.info('🔊 Project page detected, waiting for container to be ready');
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
   * Check if we're currently on a project page (URL contains project ID)
   */
  private isOnProjectPage(): boolean {
    const currentUrl = window.location.href;
    // Match bolt.new/~/projectId pattern
    const projectMatch = currentUrl.match(/bolt\.new\/~\/([^/?#]+)/);
    return !!projectMatch;
  }

  /**
   * Handle the "Show Changed Files" button click
   * Delegates to FileChangeHandler
   */
  public async handleShowChangedFiles() {
    return this.fileChangeHandler.showChangedFiles();
  }

  /**
   * Handle upgrade prompt for premium features
   */
  public async handleUpgradePrompt(feature: string): Promise<void> {
    logger.info('🔊 Handling upgrade prompt for feature:', feature);

    try {
      // Map feature names to upgrade modal types
      let modalType: string;
      switch (feature) {
        case 'file-changes':
          modalType = 'fileChanges';
          break;
        case 'issues':
        case 'quick-issue':
          modalType = 'issues';
          break;
        case 'push-reminders':
          modalType = 'pushReminders';
          break;
        case 'branch-selector':
          modalType = 'branchSelector';
          break;
        default:
          modalType = 'general';
      }

      // Send message to background service to trigger upgrade modal via popup
      chrome.runtime.sendMessage({
        type: 'SHOW_UPGRADE_MODAL',
        feature: modalType,
      });

      logger.info('✅ Upgrade modal request sent for feature:', feature);
    } catch (error) {
      logger.error('❌ Failed to trigger upgrade modal:', error);

      // Fallback: show notification with upgrade button
      this.notificationManager.showUpgradeNotification({
        type: 'info',
        message: `🔒 ${feature === 'issues' ? 'GitHub Issues management' : 'This feature'} is a Pro feature. Upgrade for full access!`,
        duration: 10000,
        upgradeText: 'Upgrade Now',
        onUpgrade: () => {
          try {
            window.open('https://bolt2github.com/upgrade', '_blank');
          } catch (openError) {
            try {
              chrome.tabs.create({ url: 'https://bolt2github.com/upgrade' });
            } catch (tabsError) {
              logger.error('❌ All upgrade URL methods failed:', tabsError);
            }
          }
        },
      });
    }
  }

  /**
   * Show re-authentication modal when session is invalidated
   */
  public showReauthenticationModal(data: {
    message: string;
    actionText: string;
    actionUrl: string;
  }): void {
    logger.info('🔐 Showing re-authentication modal:', data);

    /* Create and show a styled modal notification with action button */
    const modalElement = document.createElement('div');
    modalElement.className = 'bolt-auth-modal-overlay';
    modalElement.innerHTML = `
      <div class="bolt-auth-modal">
        <div class="bolt-auth-modal-header">
          <h3>🔐 Authentication Required</h3>
        </div>
        <div class="bolt-auth-modal-content">
          <p>${data.message}</p>
        </div>
        <div class="bolt-auth-modal-actions">
          <button class="bolt-auth-modal-btn bolt-auth-modal-btn-primary" data-action="signin">
            ${data.actionText}
          </button>
          <button class="bolt-auth-modal-btn bolt-auth-modal-btn-secondary" data-action="dismiss">
            Dismiss
          </button>
        </div>
      </div>
    `;

    /* Add modal styles */
    const styles = document.createElement('style');
    styles.textContent = `
      .bolt-auth-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .bolt-auth-modal {
        background: #1e1e1e;
        border-radius: 12px;
        padding: 24px;
        max-width: 440px;
        margin: 20px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        border: 1px solid #374151;
      }
      .bolt-auth-modal-header h3 {
        margin: 0 0 16px 0;
        color: #f9fafb;
        font-size: 18px;
        font-weight: 600;
      }
      .bolt-auth-modal-content p {
        margin: 0 0 24px 0;
        color: #d1d5db;
        line-height: 1.5;
        font-size: 14px;
      }
      .bolt-auth-modal-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }
      .bolt-auth-modal-btn {
        padding: 10px 20px;
        border-radius: 8px;
        border: 1px solid transparent;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .bolt-auth-modal-btn-primary {
        background: #3b82f6;
        color: white;
        border-color: #3b82f6;
      }
      .bolt-auth-modal-btn-primary:hover {
        background: #2563eb;
        border-color: #2563eb;
      }
      .bolt-auth-modal-btn-secondary {
        background: transparent;
        color: #9ca3af;
        border-color: #4b5563;
      }
      .bolt-auth-modal-btn-secondary:hover {
        background: #374151;
        color: #d1d5db;
      }
    `;

    /* Add event listeners */
    modalElement.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.action === 'signin') {
        window.open(data.actionUrl, '_blank');
        document.body.removeChild(modalElement);
        document.head.removeChild(styles);
      } else if (target.dataset.action === 'dismiss' || target === modalElement) {
        document.body.removeChild(modalElement);
        document.head.removeChild(styles);
      }
    });

    /* Show the modal */
    document.head.appendChild(styles);
    document.body.appendChild(modalElement);
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
    this.whatsNewManager.cleanup();

    // Restore original history functions
    if (this.originalPushState && this.originalReplaceState) {
      history.pushState = this.originalPushState;
      history.replaceState = this.originalReplaceState;
      this.originalPushState = null;
      this.originalReplaceState = null;
    }
  }

  public reinitialize() {
    logger.info('🔊 Reinitializing UI manager');
    this.cleanup();
    this.setupURLChangeDetection();
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

  /**
   * Get premium service for external access
   */
  public getPremiumService(): PremiumService {
    return this.premiumService;
  }

  /**
   * Get WhatsNewManager for external access
   */
  public getWhatsNewManager(): WhatsNewManager {
    return this.whatsNewManager;
  }

  /**
   * Check if user has premium access (for UI display)
   */
  public isPremium(): boolean {
    return this.premiumService.isPremiumSync();
  }

  /**
   * Check if user has premium access (with server validation)
   */
  public async isPremiumValidated(): Promise<boolean> {
    return await this.premiumService.isPremium();
  }

  /**
   * Check if user can use a specific premium feature (for UI display)
   */
  public hasFeature(
    feature: keyof import('./services/PremiumService').PremiumStatus['features']
  ): boolean {
    return this.premiumService.hasFeatureSync(feature);
  }

  /**
   * Check if user can use a specific premium feature (with server validation)
   */
  public async hasFeatureValidated(
    feature: keyof import('./services/PremiumService').PremiumStatus['features']
  ): Promise<boolean> {
    return await this.premiumService.hasFeature(feature);
  }

  /**
   * Update dropdown manager when premium status changes
   */
  public updateDropdownPremiumStatus(): void {
    this.dropdownManager.updatePremiumStatus();
  }

  /**
   * Set up URL change detection for SPA navigation
   * This helps detect when users navigate to/from project pages without page refresh
   */
  private setupURLChangeDetection(): void {
    // Listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', () => {
      this.handleUrlChange().catch((error) => {
        logger.error('Error handling URL change on popstate:', error);
      });
    });

    // Override pushState and replaceState to catch programmatic navigation
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      this.originalPushState!.apply(history, args);
      // Use setTimeout to ensure the URL has changed
      setTimeout(() => {
        this.handleUrlChange().catch((error) => {
          logger.error('Error handling URL change on pushState:', error);
        });
      }, 0);
    };

    history.replaceState = (...args) => {
      this.originalReplaceState!.apply(history, args);
      // Use setTimeout to ensure the URL has changed
      setTimeout(() => {
        this.handleUrlChange().catch((error) => {
          logger.error('Error handling URL change on replaceState:', error);
        });
      }, 0);
    };

    logger.info('🔊 URL change detection set up for SPA navigation');
  }

  /**
   * Handle URL changes and check if we need to initialize the button for a new project
   */
  private async handleUrlChange(): Promise<void> {
    const newUrl = window.location.href;
    const newProjectId = this.extractProjectIdFromUrl(newUrl);
    const isProjectPage = this.isOnProjectPage();

    logger.info('🔊 URL changed:', {
      newUrl,
      newProjectId,
      isProjectPage,
      hasExistingButton: !!document.querySelector('[data-github-upload]'),
    });

    // Update stored project ID if we've navigated to a different project
    if (newProjectId && isProjectPage) {
      try {
        await SettingsService.setProjectId(newProjectId);
        logger.info('🔄 Updated stored project ID to:', newProjectId);
      } catch (error) {
        logger.warn('Failed to update stored project ID:', error);
      }
    }

    // If we're now on a project page and don't have a button, try to initialize
    if (isProjectPage && !document.querySelector('[data-github-upload]')) {
      logger.info('🔊 New project detected via URL change, attempting button initialization');

      // Use a small delay to let the DOM settle after navigation
      setTimeout(() => {
        const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');
        if (buttonContainer && !document.querySelector('[data-github-upload]')) {
          logger.info('🔊 Initializing GitHub button after URL change');
          this.githubButtonManager.initialize();
        }
      }, 250);
    }
    // If we're no longer on a project page and have a button, clean it up
    else if (!isProjectPage && document.querySelector('[data-github-upload]')) {
      logger.info('🔊 Left project page, cleaning up GitHub button');
      const button = document.querySelector('[data-github-upload]');
      if (button) {
        button.remove();
      }
    }
  }

  /**
   * Extract project ID from URL
   */
  private extractProjectIdFromUrl(url: string): string | null {
    const match = url.match(/bolt\.new\/~\/([^/?#]+)/);
    return match ? match[1] : null;
  }
}
