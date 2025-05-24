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

// Global fallback debug functions (work even if UIManager hasn't loaded)
if (typeof window !== 'undefined') {
  (window as any).checkBoltToGitHubToken = () => {
    console.log('🔍 Manual token expiration check (fallback method)...');
    const projectRef = 'gapvjcqybzabnrjnxzhg';
    const sessionKey = `sb-${projectRef}-auth-token`;
    const session = localStorage.getItem(sessionKey);

    if (session) {
      try {
        const parsed = JSON.parse(session);
        console.log('📋 Raw token data:', parsed);

        if (parsed.expires_at) {
          const expiresAt = new Date(parsed.expires_at * 1000);
          const now = new Date();
          const timeUntilExpiry = expiresAt.getTime() - now.getTime();
          const timeUntilExpiryMinutes = Math.round(timeUntilExpiry / (1000 * 60));
          const isExpired = timeUntilExpiry <= 0;

          console.log(`🔍 Token info:
  - Expires at: ${expiresAt.toLocaleString()}
  - Time until expiry: ${timeUntilExpiryMinutes} minutes
  - Is expired: ${isExpired}`);

          if (isExpired) {
            console.warn('⚠️ Token is expired! This explains the 403 errors.');
            console.log('💡 Solution: Visit https://bolt2github.com to refresh your session');
          } else if (timeUntilExpiryMinutes < 5) {
            console.warn('⚠️ Token expires very soon! Refresh should trigger automatically.');
          } else {
            console.log('✅ Token is valid and not expiring soon.');
          }
        } else {
          console.log('❌ No expiration info found in token');
        }
      } catch (error) {
        console.error('❌ Failed to parse session:', error);
      }
    } else {
      console.log('❌ No auth token found in localStorage');
      console.log('💡 Make sure you are logged in at https://bolt2github.com');
    }
  };

  console.log('🔧 Fallback token check available: window.checkBoltToGitHubToken()');
}

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

    // Initialize PremiumService
    console.log('🔊 Initializing PremiumService');
    this.premiumService = new PremiumService();

    // Link premium service to push reminder service
    this.pushReminderService.setPremiumService(this.premiumService);

    // Expose debug methods to global scope for debugging
    if (typeof window !== 'undefined') {
      (window as any).debugBoltToGitHub = {
        forceAuthCheck: () => this.forceAuthCheck(),
        getUIManager: () => this,
        getPremiumService: () => this.premiumService,
        checkLocalStorageAuth: () => this.checkLocalStorageAuth(),
        getCurrentTabs: () => this.getCurrentTabs(),
        checkPremiumStatus: () => this.checkPremiumStatus(),
        forcePremiumRefresh: () => this.forcePremiumRefresh(),
        checkTokenExpiration: () => this.checkTokenExpiration(),
        // Add manual token check function that works without UIManager
        manualTokenCheck: () => {
          console.log('🔍 Manual token expiration check...');
          const projectRef = 'gapvjcqybzabnrjnxzhg';
          const sessionKey = `sb-${projectRef}-auth-token`;
          const session = localStorage.getItem(sessionKey);

          if (session) {
            try {
              const parsed = JSON.parse(session);
              if (parsed.expires_at) {
                const expiresAt = new Date(parsed.expires_at * 1000);
                const now = new Date();
                const timeUntilExpiry = expiresAt.getTime() - now.getTime();
                const timeUntilExpiryMinutes = Math.round(timeUntilExpiry / (1000 * 60));
                const isExpired = timeUntilExpiry <= 0;

                console.log(`🔍 Token info:
  - Expires at: ${expiresAt.toLocaleString()}
  - Time until expiry: ${timeUntilExpiryMinutes} minutes
  - Is expired: ${isExpired}`);

                if (isExpired) {
                  console.warn('⚠️ Token is expired! This explains the 403 errors.');
                } else if (timeUntilExpiryMinutes < 5) {
                  console.warn('⚠️ Token expires very soon! Refresh should trigger automatically.');
                } else {
                  console.log('✅ Token is valid and not expiring soon.');
                }
              } else {
                console.log('❌ No expiration info found in token');
              }
            } catch (error) {
              console.error('❌ Failed to parse session:', error);
            }
          } else {
            console.log('❌ No auth token found in localStorage');
          }
        },
        // Check if we're on the right page
        checkPage: () => {
          const url = window.location.href;
          const isBoltPage = url.includes('bolt.new');
          console.log(`🔍 Current page: ${url}`);
          console.log(`📍 Is Bolt page: ${isBoltPage}`);
          console.log(
            `🔧 UIManager initialized: ${typeof (window as any).debugBoltToGitHub?.getUIManager === 'function'}`
          );
          return {
            url,
            isBoltPage,
            uiManagerReady: typeof (window as any).debugBoltToGitHub?.getUIManager === 'function',
          };
        },
      };
      console.log('🐛 Debug tools available: window.debugBoltToGitHub');
      console.log(
        '🔧 Try: window.debugBoltToGitHub.checkPage() and window.debugBoltToGitHub.manualTokenCheck()'
      );
    }

    // Link premium service to file change handler
    this.fileChangeHandler.setPremiumService(this.premiumService);

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
   * Force a Supabase authentication check (for debugging)
   */
  public async forceAuthCheck() {
    console.log('🔐 Triggering manual auth check...');
    try {
      await chrome.runtime.sendMessage({ type: 'FORCE_AUTH_CHECK' });
      this.showNotification({
        type: 'info',
        message: 'Authentication check triggered. Check console for details.',
        duration: 3000,
      });
    } catch (error) {
      console.error('Failed to trigger auth check:', error);
      this.showNotification({
        type: 'error',
        message: 'Failed to trigger authentication check',
        duration: 5000,
      });
    }
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

  /**
   * Get premium service for external access
   */
  public getPremiumService(): PremiumService {
    return this.premiumService;
  }

  /**
   * Check if user has premium access
   */
  public isPremium(): boolean {
    return this.premiumService.isPremium();
  }

  /**
   * Check if user can use a specific premium feature
   */
  public hasFeature(
    feature: keyof import('./services/PremiumService').PremiumStatus['features']
  ): boolean {
    return this.premiumService.hasFeature(feature);
  }

  /**
   * Debug method to check local storage for auth tokens
   */
  public checkLocalStorageAuth() {
    console.log('🔍 Checking localStorage for Supabase auth tokens...');

    // Check project-specific key
    const projectRef = 'gapvjcqybzabnrjnxzhg';
    const sessionKey = `sb-${projectRef}-auth-token`;
    const session = localStorage.getItem(sessionKey);

    console.log(`🔍 Checking key: ${sessionKey}`);
    if (session) {
      console.log('✅ Found session with project-specific key:', session.substring(0, 100) + '...');
      try {
        const parsed = JSON.parse(session);
        console.log('📋 Parsed session data:', {
          access_token: parsed.access_token ? 'Present' : 'Missing',
          expires_at: parsed.expires_at,
          user: parsed.user ? { id: parsed.user.id, email: parsed.user.email } : 'Missing',
        });
      } catch (error) {
        console.error('❌ Failed to parse session:', error);
      }
    } else {
      console.log('❌ No session found with project-specific key');
    }

    // Check fallback key
    const fallbackSession = localStorage.getItem('supabase.auth.token');
    console.log('🔍 Checking fallback key: supabase.auth.token');
    if (fallbackSession) {
      console.log('✅ Found session with fallback key');
    } else {
      console.log('❌ No session found with fallback key');
    }

    // Check all localStorage keys containing 'supabase' or 'auth'
    console.log('🔍 All localStorage keys containing "supabase" or "auth":');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('supabase') || key.includes('auth'))) {
        console.log(`  - ${key}`);
      }
    }
  }

  /**
   * Debug method to check current tab information
   */
  public async getCurrentTabs() {
    console.log('🔍 Checking current tabs for bolt2github.com...');
    try {
      const tabs = await chrome.tabs.query({ url: 'https://bolt2github.com/*' });
      console.log(
        `📋 Found ${tabs.length} bolt2github.com tabs:`,
        tabs.map((tab) => ({ id: tab.id, url: tab.url, active: tab.active }))
      );

      const allTabs = await chrome.tabs.query({});
      const authTabs = allTabs.filter((tab) => tab.url?.includes('bolt2github.com'));
      console.log(
        `📋 All tabs with bolt2github.com: ${authTabs.length}`,
        authTabs.map((tab) => ({ id: tab.id, url: tab.url, active: tab.active }))
      );
    } catch (error) {
      console.error('❌ Error checking tabs:', error);
    }
  }

  /**
   * Debug method to check current premium status
   */
  public checkPremiumStatus() {
    console.log('🔍 Checking current premium status...');

    const premiumStatus = this.premiumService.getStatus();
    console.log('📋 Premium status:', premiumStatus);

    const usageInfo = this.premiumService.getUsageInfo();
    console.log('📊 Usage info:', usageInfo);

    const isPremium = this.premiumService.isPremium();
    console.log(`💎 Is premium: ${isPremium}`);

    // Check stored auth state
    chrome.storage.local.get(['supabaseAuthState', 'premiumStatus']).then((result) => {
      console.log('💾 Stored auth state:', result.supabaseAuthState);
      console.log('💾 Stored premium status:', result.premiumStatus);
    });
  }

  /**
   * Force refresh premium status (for debugging)
   */
  public async forcePremiumRefresh() {
    console.log('🔄 Forcing premium status refresh...');
    try {
      await this.premiumService.checkPremiumStatusFromServer();
      console.log('✅ Premium status refresh completed');
    } catch (error) {
      console.error('❌ Failed to refresh premium status:', error);
    }
  }

  /**
   * Check token expiration info (for debugging)
   */
  public async checkTokenExpiration() {
    console.log('🔍 Checking token expiration...');
    try {
      // Get SupabaseAuthService instance
      const { SupabaseAuthService } = await import('./services/SupabaseAuthService');
      const authService = SupabaseAuthService.getInstance();

      const expiration = await authService.getTokenExpiration();
      if (expiration) {
        const { expiresAt, timeUntilExpiry, isExpired } = expiration;
        const expiresAtDate = new Date(expiresAt!);
        const timeUntilExpiryMinutes = Math.round(timeUntilExpiry! / (1000 * 60));

        console.log(`🔍 Token info:
  - Expires at: ${expiresAtDate.toLocaleString()}
  - Time until expiry: ${timeUntilExpiryMinutes} minutes
  - Is expired: ${isExpired}`);

        if (isExpired) {
          console.warn('⚠️ Token is expired! This explains the 403 errors.');
        } else if (timeUntilExpiryMinutes < 5) {
          console.warn('⚠️ Token expires very soon! Refresh should trigger automatically.');
        } else {
          console.log('✅ Token is valid and not expiring soon.');
        }
      } else {
        console.log('❌ No token expiration info found (user not authenticated?)');
      }
    } catch (error) {
      console.error('❌ Failed to check token expiration:', error);
    }
  }
}
