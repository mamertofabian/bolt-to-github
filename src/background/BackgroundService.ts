import { UnifiedGitHubService } from '../services/UnifiedGitHubService';
import type { Message, MessageType, Port, UploadStatusState } from '../lib/types';
import { StateManager } from './StateManager';
import { ZipHandler } from '../services/zipHandler';
import { BackgroundTempRepoManager } from './TempRepoManager';
import { SupabaseAuthService } from '../content/services/SupabaseAuthService';
import { OperationStateManager } from '../content/services/OperationStateManager';
import { createLogger, getLogStorage } from '../lib/utils/logger';
import { UsageTracker } from './UsageTracker';
import { BoltProjectSyncService } from '../services/BoltProjectSyncService';

const logger = createLogger('BackgroundService');

export class BackgroundService {
  private stateManager: StateManager;
  private zipHandler: ZipHandler | null;
  private ports: Map<number, Port>;
  private githubService: UnifiedGitHubService | null;
  private tempRepoManager: BackgroundTempRepoManager | null = null;
  private pendingCommitMessage: string;
  private supabaseAuthService: SupabaseAuthService;
  private operationStateManager: OperationStateManager;
  private usageTracker: UsageTracker;
  private syncService: BoltProjectSyncService;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();
  private authCheckTimeout: NodeJS.Timeout | null = null;
  private storageListener:
    | ((changes: { [key: string]: chrome.storage.StorageChange }, namespace: string) => void)
    | null = null;
  private syncAlarmHandler: ((alarm: chrome.alarms.Alarm) => void) | null = null;

  constructor() {
    logger.info('🚀 Background service initializing...');
    this.stateManager = StateManager.getInstance();
    this.ports = new Map();
    this.githubService = null;
    this.zipHandler = null;
    this.pendingCommitMessage = 'Commit from Bolt to GitHub';
    this.supabaseAuthService = SupabaseAuthService.getInstance();
    this.operationStateManager = OperationStateManager.getInstance();
    this.usageTracker = new UsageTracker();
    this.syncService = new BoltProjectSyncService();
    this.initialize();

    // Track extension lifecycle
    this.trackExtensionStartup();

    // Force initial auth check
    this.authCheckTimeout = setTimeout(() => {
      logger.info('🔐 Forcing initial Supabase auth check...');
      this.supabaseAuthService.forceCheck();
    }, 2000); // Wait 2 seconds after initialization

    // Set up log rotation alarm
    this.setupLogRotation();

    // Set up Chrome alarms (for keep-alive and log rotation)
    this.setupAlarms();

    // Start service worker keep-alive mechanism
    this.startKeepAlive();

    // Set up sync alarm and perform initial sync
    this.setupSyncAlarm();
  }

  private async trackExtensionStartup(): Promise<void> {
    try {
      logger.info('📊 Tracking extension startup...');

      // Check if this is first install or update
      const manifest = chrome.runtime.getManifest();
      const version = manifest.version;

      const result = await chrome.storage.local.get(['lastVersion', 'installDate']);

      if (!result.installDate) {
        // First installation
        await chrome.storage.local.set({
          installDate: Date.now(),
          lastVersion: version,
        });
        await this.sendAnalyticsEvent('extension_installed', { version });
      } else if (result.lastVersion !== version) {
        // Extension updated
        await chrome.storage.local.set({ lastVersion: version });
        await this.sendAnalyticsEvent('extension_updated', { version });
      }
    } catch (error) {
      logger.error('Failed to track extension startup:', error);
    }
  }

  private async sendAnalyticsEvent(
    eventName: string,
    params: Record<string, any> = {}
  ): Promise<void> {
    try {
      // Get or generate client ID
      let clientId = '';
      try {
        const result = await chrome.storage.local.get(['analyticsClientId']);
        if (result.analyticsClientId) {
          clientId = result.analyticsClientId;
        } else {
          clientId = this.generateClientId();
          await chrome.storage.local.set({ analyticsClientId: clientId });
        }
      } catch (error) {
        clientId = this.generateClientId();
      }

      // Check if analytics is enabled
      let enabled = true;
      try {
        const result = await chrome.storage.sync.get(['analyticsEnabled']);
        enabled = result.analyticsEnabled !== false;
      } catch (error) {
        logger.debug('Could not check analytics preference:', error);
      }

      if (!enabled) {
        return;
      }

      // Send to Google Analytics
      const payload = {
        client_id: clientId,
        events: [
          {
            name: eventName,
            params,
          },
        ],
      };

      const url = `https://www.google-analytics.com/mp/collect?measurement_id=G-6J0TXX2XW0&api_secret=SDSrX58bTAmEqVg2awosDA`;

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'no-cors',
      });

      logger.info('📊 Analytics event sent:', eventName, params);
    } catch (error) {
      logger.debug('Analytics event failed (expected in some contexts):', error);
    }
  }

  private generateClientId(): string {
    // Generate a UUID-like client ID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private setupLogRotation(): void {
    // Run rotation on startup
    const logStorage = getLogStorage();
    logStorage.rotateLogs();

    // Set up rotation using JavaScript timer instead of chrome.alarms
    // This avoids requiring new permissions
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

    // Use setInterval for periodic rotation
    setInterval(() => {
      logger.info('Running scheduled log rotation');
      logStorage.rotateLogs();
    }, SIX_HOURS_MS);

    // Also check and rotate logs when the service worker wakes up
    // This handles cases where the interval might be cleared
    chrome.runtime.onStartup.addListener(() => {
      logger.info('Extension started, checking log rotation');
      logStorage.rotateLogs();
    });

    // Check on installation/update
    chrome.runtime.onInstalled.addListener(async (details) => {
      logger.info('Extension installed/updated, checking log rotation');
      logStorage.rotateLogs();
      await this.handleExtensionInstalled(details);
    });
  }

  // this.initializeListeners();
  // this.initializeStorageListener();

  private async initialize(): Promise<void> {
    // Initialize usage tracking asynchronously (non-blocking)
    // We continue even if usage tracking fails to ensure the extension remains functional
    this.usageTracker
      .initializeUsageData()
      .catch((error) => {
        logger.error('Failed to initialize usage tracking, continuing without it:', error);
      })
      .finally(() => {
        // Ensure initialization completion is tracked regardless of success/failure
        logger.debug('Usage tracker initialization attempt completed');
      });

    const githubService = await this.initializeGitHubService();
    this.setupZipHandler(githubService!);
    if (githubService) {
      const settings = await this.stateManager.getGitHubSettings();
      if (settings?.gitHubSettings?.repoOwner) {
        this.tempRepoManager = new BackgroundTempRepoManager(
          githubService,
          settings.gitHubSettings.repoOwner,
          (status) => this.broadcastStatus(status)
        );
      }
    }
    this.setupConnectionHandlers();
    this.setupStorageListener();
    this.startKeepAlive();
    logger.info('👂 Background service initialized');
  }

  private async initializeGitHubService(): Promise<UnifiedGitHubService | null> {
    try {
      const settings = await this.stateManager.getGitHubSettings();
      const localSettings = await chrome.storage.local.get(['authenticationMethod']);

      const authMethod = localSettings.authenticationMethod || 'pat';

      // Track authentication method
      await this.usageTracker.updateUsageStats('auth_method_changed', {
        authMethod:
          authMethod === 'github_app'
            ? 'github-app'
            : settings?.gitHubSettings?.githubToken
              ? 'pat'
              : 'none',
      });

      if (authMethod === 'github_app') {
        // Initialize with GitHub App authentication
        logger.info('✅ GitHub App authentication detected, initializing GitHub App service');
        this.githubService = new UnifiedGitHubService({
          type: 'github_app',
        });
      } else if (
        settings &&
        settings.gitHubSettings &&
        settings.gitHubSettings.githubToken &&
        settings.gitHubSettings.repoOwner
      ) {
        logger.info('✅ PAT authentication detected, initializing PAT service', settings);
        this.githubService = new UnifiedGitHubService(settings.gitHubSettings.githubToken);
      } else {
        logger.warn('❌ No valid authentication configuration found');
        this.githubService = null;
      }
    } catch (error) {
      logger.error('Failed to initialize GitHub service:', error);

      // Track initialization error
      await this.usageTracker.trackError(
        error instanceof Error ? error : new Error('Failed to initialize GitHub service'),
        'github_service_init'
      );

      this.githubService = null;
    }
    return this.githubService;
  }

  private setupZipHandler(githubService: UnifiedGitHubService) {
    this.zipHandler = new ZipHandler(githubService, (status) => this.broadcastStatus(status));
  }

  private broadcastStatus(status: UploadStatusState) {
    for (const [tabId, port] of this.ports) {
      this.sendResponse(port, {
        type: 'UPLOAD_STATUS',
        status,
      });
    }
  }

  private setupConnectionHandlers(): void {
    chrome.runtime.onConnect.addListener((port: Port) => {
      const tabId = port.sender?.tab?.id ?? -1; // Use -1 for popup

      if (!['bolt-content', 'popup'].includes(port.name)) {
        return;
      }

      logger.info('📝 New connection from:', port.name, 'tabId:', tabId);
      this.ports.set(tabId, port);

      port.onDisconnect.addListener(() => {
        logger.info('🔌 Port disconnected:', tabId);
        this.ports.delete(tabId);
      });

      port.onMessage.addListener(async (message: Message) => {
        logger.info('📥 Received port message:', { source: port.name, type: message.type });
        this.updateLastActivity();
        await this.handlePortMessage(tabId, message);
      });
    });

    // Setup runtime message listener for direct messages (not using ports)
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      logger.info('📥 Received runtime message:', message);
      this.updateLastActivity();

      if (message.action === 'PUSH_TO_GITHUB') {
        this.handlePushToGitHub();
        sendResponse({ success: true });
      } else if (message.type === 'FILE_CHANGES') {
        logger.info('📄 Received file changes, forwarding to popup');
        // Forward file changes to popup
        chrome.runtime.sendMessage(message);
        sendResponse({ success: true });
      } else if (message.type === 'CHECK_PREMIUM_FEATURE') {
        this.handleCheckPremiumFeature(message.feature, sendResponse);
        return true; // Will respond asynchronously
      } else if (message.type === 'FORCE_AUTH_CHECK') {
        logger.info('🔐 Forcing auth check via message');
        this.supabaseAuthService.forceCheck();
        sendResponse({ success: true });
      } else if (message.type === 'FORCE_SUBSCRIPTION_REFRESH') {
        logger.info('💰 Forcing subscription refresh via message');
        this.supabaseAuthService.forceSubscriptionRevalidation();
        sendResponse({ success: true });
      } else if (message.type === 'FORCE_POPUP_SYNC') {
        logger.info('🔄 Forcing popup sync via message');
        await this.supabaseAuthService.forceSyncToPopup();
        sendResponse({ success: true });
      } else if (message.type === 'USER_LOGOUT') {
        logger.info('🚪 User logout requested from popup');
        await this.sendAnalyticsEvent('user_action', {
          action: 'user_logout',
          context: 'popup',
        });
        await this.supabaseAuthService.logout();
        sendResponse({ success: true });
      } else if (message.type === 'ANALYTICS_EVENT') {
        logger.info('📊 Received analytics event:', message.eventType, message.eventData);
        this.handleAnalyticsEvent(message.eventType, message.eventData);
        sendResponse({ success: true });
      } else if (message.type === 'SHOW_UPGRADE_MODAL') {
        logger.info('🔊 Received SHOW_UPGRADE_MODAL message:', message.feature);
        await this.sendAnalyticsEvent('user_action', {
          action: 'upgrade_modal_requested',
          feature: message.feature,
          context: 'content_script',
        });
        // Store the upgrade modal context and open popup
        await chrome.storage.local.set({
          popupContext: 'upgrade',
          upgradeModalFeature: message.feature,
        });
        chrome.action.openPopup();
        sendResponse({ success: true });
      } else if (message.type === 'NOTIFY_GITHUB_APP_SYNC') {
        logger.info('📢 Received NOTIFY_GITHUB_APP_SYNC message:', message.data);
        await this.handleGitHubAppSyncNotification(message.data);
        sendResponse({ success: true });
      } else if (
        message.type === 'getExtensionStatus' &&
        sender.tab &&
        this.isValidBolt2GitHubOrigin(sender.url)
      ) {
        // Handle welcome page status request
        this.handleGetExtensionStatus(sendResponse);
        return true; // Will respond asynchronously
      } else if (
        message.type === 'completeOnboardingStep' &&
        sender.tab &&
        this.isValidBolt2GitHubOrigin(sender.url)
      ) {
        // Handle onboarding step completion
        this.handleCompleteOnboardingStep(message.step, sendResponse);
        return true; // Will respond asynchronously
      } else if (
        message.type === 'initiateGitHubAuth' &&
        sender.tab &&
        this.isValidBolt2GitHubOrigin(sender.url)
      ) {
        // Handle GitHub authentication initiation
        this.handleInitiateGitHubAuth(message.method, sendResponse);
        return true; // Will respond asynchronously
      } else if (message.type === 'SYNC_BOLT_PROJECTS') {
        // Handle manual sync trigger
        this.handleManualSync(sendResponse);
        return true; // Will respond asynchronously
      }

      // Return true to indicate we'll send a response asynchronously
      return true;
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.ports.delete(tabId);
    });

    // Handle URL updates for project ID
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (tab.url?.includes('bolt.new/~/')) {
        const projectId = tab.url.match(/bolt\.new\/~\/([^/]+)/)?.[1] || null;
        if (projectId) {
          await this.stateManager.setProjectId(projectId);
        }
      }
    });
  }

  private setupStorageListener(): void {
    // Remove any existing listener
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener);
    }

    // Create new listener and store reference
    this.storageListener = async (changes, namespace) => {
      if (namespace === 'sync') {
        // Check for analytics preference changes
        if ('analyticsEnabled' in changes) {
          logger.info('📊 Analytics preference changed, updating uninstall URL...');
          await this.usageTracker.setUninstallURL();
        }

        const settingsChanged = ['githubToken', 'repoOwner', 'repoName', 'branch'].some(
          (key) => key in changes
        );

        if (settingsChanged) {
          logger.info('🔄 GitHub settings changed, reinitializing GitHub service...');
          const githubService = await this.initializeGitHubService();
          if (githubService) {
            logger.info('🔄 GitHub service reinitialized, reinitializing ZipHandler...');
            this.setupZipHandler(githubService);
          }
        }
      }
    };

    // Add the listener
    chrome.storage.onChanged.addListener(this.storageListener);
  }

  private async handlePortMessage(tabId: number, message: Message): Promise<void> {
    const port = this.ports.get(tabId);
    if (!port) {
      logger.warn('No port found for tabId:', tabId);
      return;
    }

    try {
      // Debug premium user message handling
      if (message.type === 'HEARTBEAT') {
        logger.debug('🔍 HEARTBEAT message received:', {
          type: message.type,
          typeOf: typeof message.type,
          isPremium: this.supabaseAuthService?.isPremium(),
          fullMessage: JSON.stringify(message),
        });
      }

      switch (message.type) {
        case 'ZIP_DATA':
          await this.sendAnalyticsEvent('user_action', {
            action: 'zip_upload_initiated',
            context: 'content_script',
          });
          // Handle both old and new message formats for backward compatibility
          if (typeof message.data === 'string') {
            // Old format: message.data is just the base64 string
            await this.handleZipData(tabId, message.data, null);
          } else {
            // New format: message.data is { data: string, projectId?: string }
            await this.handleZipData(tabId, message.data.data, message.data.projectId);
          }
          break;

        case 'SET_COMMIT_MESSAGE':
          logger.info('Setting commit message:', message.data.message);
          await this.sendAnalyticsEvent('user_action', {
            action: 'commit_message_customized',
            has_custom_message: Boolean(
              message.data?.message && message.data.message !== 'Commit from Bolt to GitHub'
            ),
          });
          if (message.data && message.data.message) {
            this.pendingCommitMessage = message.data.message;
          }
          break;

        case 'OPEN_SETTINGS':
          logger.info('Opening settings popup');
          await this.sendAnalyticsEvent('user_action', {
            action: 'settings_opened',
            context: 'content_script',
          });
          await chrome.storage.local.set({ popupContext: 'settings' });
          logger.info('✅ Storage set: popupContext = settings');

          // Small delay to ensure storage is written before opening popup
          setTimeout(() => {
            chrome.action.openPopup();
            logger.info('✅ Popup opened for settings');
          }, 10);
          break;

        case 'OPEN_HOME':
          logger.info('Opening home/dashboard popup');
          await this.sendAnalyticsEvent('user_action', {
            action: 'dashboard_opened',
            context: 'content_script',
          });
          await chrome.storage.local.set({ popupContext: 'home' });
          logger.info('✅ Storage set: popupContext = home');

          // Small delay to ensure storage is written before opening popup
          setTimeout(() => {
            chrome.action.openPopup();
            logger.info('✅ Popup opened for home/dashboard');
          }, 10);
          break;

        case 'OPEN_ISSUES': {
          logger.info('Opening issues popup');
          await this.sendAnalyticsEvent('user_action', {
            action: 'issues_opened',
            context: 'content_script',
          });
          // Check premium status before allowing access
          const hasIssuesAccess = this.supabaseAuthService.isPremium();
          const context = hasIssuesAccess ? 'issues' : 'home';
          await chrome.storage.local.set({ popupContext: context });
          logger.info(`✅ Storage set: popupContext = ${context}`);

          // Small delay to ensure storage is written before opening popup
          setTimeout(() => {
            chrome.action.openPopup();
            logger.info(`✅ Popup opened for ${context}`);
          }, 10);
          break;
        }

        case 'OPEN_PROJECTS':
          logger.info('Opening projects popup');
          await this.sendAnalyticsEvent('user_action', {
            action: 'projects_opened',
            context: 'content_script',
          });
          await chrome.storage.local.set({ popupContext: 'projects' });
          logger.info('✅ Storage set: popupContext = projects');

          // Small delay to ensure storage is written before opening popup
          setTimeout(() => {
            chrome.action.openPopup();
            logger.info('✅ Popup opened for projects');
          }, 10);
          break;

        case 'OPEN_FILE_CHANGES':
          logger.info('Opening file changes popup');
          await this.sendAnalyticsEvent('user_action', {
            action: 'file_changes_viewed',
            file_count: Object.keys(message.data?.changes || {}).length,
          });
          // Store the file changes in local storage for the popup to retrieve
          await chrome.storage.local.set({
            pendingFileChanges: message.data?.changes || {},
          });
          logger.info('Stored file changes in local storage');

          // Open the popup - it will check for pendingFileChanges when it loads
          chrome.action.openPopup();
          break;

        case 'IMPORT_PRIVATE_REPO':
          logger.info('🔄 Processing private repo import:', message.data.repoName);
          await this.sendAnalyticsEvent('user_action', {
            action: 'private_repo_import_started',
            has_custom_branch: Boolean(message.data.branch),
          });
          if (!this.tempRepoManager) {
            throw new Error('Temp repo manager not initialized');
          }
          await this.tempRepoManager.handlePrivateRepoImport(
            message.data.repoName,
            message.data.branch
          );
          await this.sendAnalyticsEvent('user_action', {
            action: 'private_repo_import_completed',
          });
          logger.info(
            `✅ Private repo import completed from branch '${message.data.branch || 'default'}'`
          );
          break;
        case 'DELETE_TEMP_REPO':
          await this.sendAnalyticsEvent('user_action', {
            action: 'temp_repo_cleanup',
          });
          await this.tempRepoManager?.cleanupTempRepos(true);
          logger.info('✅ Temp repo cleaned up');
          break;

        case 'DEBUG':
          logger.debug(`[Content Debug] ${message.message}`);
          break;

        case 'CONTENT_SCRIPT_READY':
          logger.info('Content script is ready');
          await this.sendAnalyticsEvent('extension_event', {
            action: 'content_script_ready',
            context: 'bolt_page',
          });
          break;

        case 'HEARTBEAT': {
          // Respond to heartbeat to keep connection alive
          const heartbeatResponse = {
            type: 'HEARTBEAT_RESPONSE' as const,
            timestamp: Date.now(),
          };
          logger.info('💓 Sending HEARTBEAT_RESPONSE');
          this.sendResponse(port, heartbeatResponse);
          break;
        }

        default:
          logger.warn(
            'Unknown message type:',
            message.type,
            'Full message:',
            JSON.stringify(message)
          );
      }
    } catch (error: unknown) {
      logger.error(`Error handling message ${message.type}:`, error);

      // Track errors for debugging
      await this.sendAnalyticsEvent('extension_error', {
        error_type: 'port_message_handler',
        message_type: message.type,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      this.sendResponse(port, {
        type: 'UPLOAD_STATUS',
        status: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      });
    }
  }

  private async handleZipData(
    tabId: number,
    base64Data: string,
    currentProjectId?: string | null
  ): Promise<void> {
    logger.info('🔄 Handling ZIP data for tab:', tabId);
    const port = this.ports.get(tabId);
    if (!port) return;

    // Generate unique operation ID for this push
    const operationId = `push-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Start tracking the push operation
    await this.operationStateManager.startOperation(
      'push',
      operationId,
      'GitHub push operation via background service',
      {
        tabId,
        commitMessage: this.pendingCommitMessage,
      }
    );

    const startTime = Date.now();
    let uploadSuccess = false;
    let uploadMetadata: any = {};

    try {
      if (!this.githubService) {
        throw new Error('GitHub service is not initialized. Please check your GitHub settings.');
      }

      if (!this.zipHandler) {
        throw new Error('Zip handler is not initialized.');
      }

      // Use the project ID from the message if provided, otherwise fall back to stored project ID
      let projectId = currentProjectId;
      if (!projectId) {
        projectId = await this.stateManager.getProjectId();
      }

      if (!projectId) {
        throw new Error('Project ID is not set. Make sure you are on a Bolt project page.');
      }

      logger.info(
        '🔍 Using project ID for push:',
        projectId,
        currentProjectId ? '(from URL)' : '(from storage)'
      );

      try {
        // Convert base64 to blob
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/zip' });

        // Track upload start
        uploadMetadata = {
          projectId,
          zipSize: blob.size,
          commitMessage: this.pendingCommitMessage,
        };

        await this.sendAnalyticsEvent('github_upload_started', {
          ...uploadMetadata,
        });

        // Process the ZIP file
        await this.withTimeout(
          this.zipHandler.processZipFile(blob, projectId, this.pendingCommitMessage),
          2 * 60 * 1000, // 2 minutes timeout
          'Processing ZIP file timed out'
        );

        const duration = Date.now() - startTime;
        uploadSuccess = true;

        // Track successful upload
        await this.sendAnalyticsEvent('github_upload_completed', {
          ...uploadMetadata,
          duration,
        });

        // Reset commit message after successful upload
        this.pendingCommitMessage = 'Commit from Bolt to GitHub';

        // Mark operation as completed - push successful
        await this.operationStateManager.completeOperation(operationId);

        // Track successful push
        await this.usageTracker.updateUsageStats('push_completed');

        this.sendResponse(port, {
          type: 'UPLOAD_STATUS',
          status: { status: 'success', message: 'Upload completed successfully', progress: 100 },
        });
      } catch (decodeError) {
        const duration = Date.now() - startTime;
        const errorMessage =
          decodeError instanceof Error ? decodeError.message : String(decodeError);
        const isGitHubError = errorMessage.includes('GitHub API Error');

        // Track upload failure
        await this.sendAnalyticsEvent('github_upload_failed', {
          ...uploadMetadata,
          duration,
          error_type: isGitHubError ? 'github_api' : 'processing',
          error_message: errorMessage,
        });

        await this.sendAnalyticsEvent('extension_error', {
          error_type: 'upload',
          error_message: errorMessage,
          context: 'zip_processing',
        });

        // Mark operation as failed
        await this.operationStateManager.failOperation(
          operationId,
          decodeError instanceof Error ? decodeError : new Error(errorMessage)
        );

        // Track error
        await this.usageTracker.trackError(
          decodeError instanceof Error ? decodeError : new Error(errorMessage),
          'push_failed'
        );

        if (isGitHubError) {
          // Extract the original GitHub error message if available
          const originalMessage =
            (decodeError as any).originalMessage || 'GitHub authentication or API error occurred';

          throw new Error(`GitHub Error: ${originalMessage}`);
        } else {
          throw new Error(
            `Failed to process ZIP data. Please try reloading the page. ` +
              `If the issue persists, please open a GitHub issue.`
          );
        }
      }
    } catch (error) {
      logger.error('Error processing ZIP:', error);

      if (!uploadSuccess) {
        const duration = Date.now() - startTime;
        await this.sendAnalyticsEvent('github_upload_failed', {
          ...uploadMetadata,
          duration,
          error_type: 'general',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        });

        await this.sendAnalyticsEvent('extension_error', {
          error_type: 'upload',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          context: 'general',
        });

        // Mark operation as failed for any outer catch errors
        await this.operationStateManager.failOperation(
          operationId,
          error instanceof Error ? error : new Error('Unknown error occurred')
        );

        // Track error
        await this.usageTracker.trackError(
          error instanceof Error ? error : new Error('Unknown error occurred'),
          'push_failed_outer'
        );
      }

      this.sendResponse(port, {
        type: 'UPLOAD_STATUS',
        status: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      });
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    timeoutMessage: string
  ): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), ms)
    );
    return Promise.race([promise, timeout]);
  }

  private sendResponse(
    port: Port,
    message: { type: MessageType; status?: UploadStatusState; timestamp?: number }
  ): void {
    try {
      port.postMessage(message);
    } catch (error) {
      logger.error('Error sending response:', error);
    }
  }

  private async handleCheckPremiumFeature(
    feature: string,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      const premiumFeatures = ['pushReminders', 'branchSelector', 'viewFileChanges', 'issues'];

      // Check if the feature requires premium
      if (!premiumFeatures.includes(feature)) {
        sendResponse({ hasAccess: true });
        return;
      }

      // Check premium status from Supabase auth service
      const hasAccess = this.supabaseAuthService.isPremium();

      logger.info(`🔍 Checking premium feature: ${feature}, hasAccess: ${hasAccess}`);

      sendResponse({ hasAccess });
    } catch (error) {
      logger.error('Error checking premium feature:', error);
      sendResponse({ hasAccess: false });
    }
  }

  private async handleAnalyticsEvent(eventType: string, eventData: any): Promise<void> {
    try {
      switch (eventType) {
        case 'extension_opened':
          await this.sendAnalyticsEvent('extension_opened', { context: eventData.context });
          break;

        case 'bolt_project_event':
          await this.sendAnalyticsEvent(eventData.eventType, eventData.projectMetadata);
          break;

        case 'extension_event':
          await this.sendAnalyticsEvent(eventData.eventType, eventData.details);
          break;

        case 'user_preference':
          await this.sendAnalyticsEvent(eventData.action, eventData.details);
          break;

        case 'page_view':
          await this.sendAnalyticsEvent('page_view', {
            page: eventData.page,
            ...eventData.metadata,
          });
          break;

        case 'github_operation':
          await this.sendAnalyticsEvent(`github_${eventData.operation}`, {
            success: eventData.success,
            ...eventData.metadata,
          });
          break;

        case 'error':
          await this.sendAnalyticsEvent('extension_error', {
            error_type: eventData.errorType,
            error_message: eventData.error,
            context: eventData.context,
          });
          break;

        default:
          logger.warn('Unknown analytics event type:', eventType);
      }
    } catch (error) {
      logger.error('Failed to handle analytics event:', error);
    }
  }

  private async handlePushToGitHub(): Promise<void> {
    logger.info('🔄 Handling Push to GitHub action');

    try {
      // Find the active tab with bolt.new URL
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const boltTab = tabs.find((tab) => tab.url?.includes('bolt.new'));

      if (!boltTab || !boltTab.id) {
        logger.error('No active Bolt tab found');
        return;
      }

      const tabId = boltTab.id;
      const port = this.ports.get(tabId);

      if (!port) {
        logger.error('No connected port for tab:', tabId);
        return;
      }

      // Send a message to the content script to trigger the GitHub push action
      this.sendResponse(port, {
        type: 'PUSH_TO_GITHUB',
      });

      logger.info('✅ Push to GitHub message sent to content script');
    } catch (error) {
      logger.error('Error handling Push to GitHub action:', error);
    }
  }

  private async handleGitHubAppSyncNotification(data: any): Promise<void> {
    try {
      logger.info('📢 Handling GitHub App sync notification to all bolt.new tabs');

      // Send message to all bolt.new tabs about GitHub App sync
      const tabs = await chrome.tabs.query({ url: 'https://bolt.new/*' });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'GITHUB_APP_SYNCED',
              data,
            })
            .catch(() => {
              // Tab might not have content script injected
            });
        }
      }
      logger.info('📢 Sent GitHub App sync notifications to all bolt.new tabs');
    } catch (error) {
      logger.warn('Failed to send GitHub App sync notification:', error);
    }
  }

  private startKeepAlive(): void {
    // Clear any existing interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    // Use Chrome alarms API for reliable keep-alive
    // Note: Chrome enforces a minimum period of 1 minute for alarms
    chrome.alarms.create('keepAlive', { periodInMinutes: 1 }); // Every 60 seconds (Chrome minimum)

    // Also use a regular interval as backup
    this.keepAliveInterval = setInterval(() => {
      // Check if we have any active connections
      const hasActiveConnections = this.ports.size > 0;
      const timeSinceLastActivity = Date.now() - this.lastActivityTime;

      // Only log if there's something interesting
      if (hasActiveConnections || timeSinceLastActivity < 60000) {
        logger.debug(
          `💓 Keep-alive: ${this.ports.size} active connections, last activity ${Math.round(timeSinceLastActivity / 1000)}s ago`
        );
      }

      // Perform a simple async operation to keep the service worker active
      chrome.storage.local.get(['keepAliveTimestamp'], (result) => {
        chrome.storage.local.set({ keepAliveTimestamp: Date.now() });
      });
    }, 25000); // Every 25 seconds
  }

  private async handleExtensionInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
    try {
      if (details.reason === 'install') {
        logger.info('Extension installed for the first time', {
          version: chrome.runtime.getManifest().version,
        });

        // Open welcome page
        logger.info('Opening welcome page for new installation');
        await chrome.tabs.create({
          url: 'https://bolt2github.com/welcome?utm_source=extension_install',
        });

        // Initialize onboarding data
        const onboardingData = {
          installDate: new Date().toISOString(),
          onboardingCompleted: false,
          installedVersion: chrome.runtime.getManifest().version,
          completedSteps: [] as string[],
          welcomePageViewed: false,
        };

        await chrome.storage.local.set(onboardingData);
        logger.info('Initialized onboarding data', onboardingData);
      }
    } catch (error) {
      logger.error('Error handling extension installation:', error);
    }
  }

  private async handleGetExtensionStatus(sendResponse: (response: any) => void): Promise<void> {
    try {
      // Get onboarding data from storage
      const storageData = await chrome.storage.local.get([
        'installDate',
        'onboardingCompleted',
        'installedVersion',
        'completedSteps',
      ]);

      // Check authentication status
      const authState = await this.supabaseAuthService.getCurrentAuthState();

      const response = {
        success: true,
        data: {
          installed: true,
          version: chrome.runtime.getManifest().version,
          authenticated: authState.isAuthenticated,
          authMethod: authState.authMethod || 'none',
          installDate: storageData.installDate,
          onboardingCompleted: storageData.onboardingCompleted || false,
          installedVersion: storageData.installedVersion,
        },
      };

      logger.info('Sending extension status to welcome page:', response);
      sendResponse(response);
    } catch (error) {
      logger.error('Error getting extension status:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleCompleteOnboardingStep(
    step: string,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      // Validate step parameter
      const validSteps = [
        'authentication',
        'repository_setup',
        'first_upload',
        'tutorial_complete',
      ];
      if (!validSteps.includes(step)) {
        sendResponse({
          success: false,
          error: `Invalid onboarding step: ${step}`,
        });
        return;
      }

      // Get current completed steps
      const storageData = await chrome.storage.local.get(['completedSteps']);
      const completedSteps = storageData.completedSteps || [];

      // Add the new step if not already completed
      if (!completedSteps.includes(step)) {
        completedSteps.push(step);
        await chrome.storage.local.set({ completedSteps });
        logger.info(`Onboarding step completed: ${step}`, { completedSteps });
      }

      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error completing onboarding step:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private isValidBolt2GitHubOrigin(url?: string): boolean {
    if (!url) return false;

    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname === 'bolt2github.com' && parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async handleInitiateGitHubAuth(
    method: string,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      // Validate authentication method
      const validMethods = ['github_app', 'pat'];
      if (!validMethods.includes(method)) {
        sendResponse({
          success: false,
          error: `Invalid authentication method: ${method}`,
        });
        return;
      }

      if (method === 'github_app') {
        // Use the existing GitHub App auth flow
        const authUrl = 'https://github.com/apps/bolt-to-github/installations/new';
        sendResponse({
          success: true,
          authUrl,
          method: 'github_app',
        });
      } else if (method === 'pat') {
        // PAT authentication is handled in the popup
        sendResponse({
          success: true,
          message: 'Please configure PAT in extension popup',
          method: 'pat',
        });
      }
    } catch (error) {
      logger.error('Error initiating GitHub auth:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleManualSync(sendResponse: (response: any) => void): Promise<void> {
    try {
      logger.info('📱 Manual sync triggered via message');

      // Perform outward sync
      await this.syncService.performOutwardSync();

      sendResponse({
        success: true,
        message: 'Sync completed',
      });
    } catch (error) {
      logger.error('Manual sync failed:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      });
    }
  }

  public destroy(): void {
    // Clean up keep-alive interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // Clean up auth check timeout
    if (this.authCheckTimeout) {
      clearTimeout(this.authCheckTimeout);
      this.authCheckTimeout = null;
    }

    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener);
      this.storageListener = null;
    }

    // Clean up sync alarm
    chrome.alarms.clear('bolt-project-sync');

    // Remove sync alarm handler if it exists
    if (this.syncAlarmHandler) {
      chrome.alarms.onAlarm.removeListener(this.syncAlarmHandler);
      this.syncAlarmHandler = null;
    }
  }

  /**
   * Update last activity timestamp
   */
  private updateLastActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Set up Chrome alarms for keep-alive
   */
  private setupAlarms(): void {
    // Store the alarm handler so we can remove it later
    this.syncAlarmHandler = (alarm: chrome.alarms.Alarm) => {
      if (alarm.name === 'keepAlive') {
        // Simple operation to keep service worker active
        this.updateLastActivity();
        chrome.storage.local.set({ lastKeepAlive: Date.now() });
      } else if (alarm.name === 'logRotation') {
        this.rotateOldLogs();
      } else if (alarm.name === 'bolt-project-sync') {
        this.handleSyncAlarm();
      }
    };

    chrome.alarms.onAlarm.addListener(this.syncAlarmHandler);
  }

  /**
   * Set up sync alarm for periodic bolt project syncing
   */
  private setupSyncAlarm(): void {
    // Create sync alarm (every 5 minutes)
    chrome.alarms.create('bolt-project-sync', { periodInMinutes: 5 });

    // Perform initial inward sync on startup (non-blocking)
    setTimeout(() => {
      this.syncService.performInwardSync().catch((error) => {
        logger.error('Initial inward sync failed:', error);
      });
    }, 0);
  }

  /**
   * Handle sync alarm
   */
  private async handleSyncAlarm(): Promise<void> {
    try {
      logger.info('🔄 Sync alarm fired, performing sync...');

      // Perform outward sync
      await this.syncService.performOutwardSync();

      // Perform inward sync
      await this.syncService.performInwardSync();

      logger.info('✅ Sync completed successfully');
    } catch (error) {
      logger.error('Sync failed:', error);
    }
  }

  /**
   * Rotate old logs
   */
  private rotateOldLogs(): void {
    const logStorage = getLogStorage();
    logStorage.rotateLogs();
    logger.info('Log rotation completed');
  }
}
