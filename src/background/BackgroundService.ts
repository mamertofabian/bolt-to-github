import { GitHubService } from '../services/GitHubService';
import type { Message, MessageType, Port, UploadStatusState } from '../lib/types';
import { StateManager } from './StateManager';
import { ZipHandler } from '../services/zipHandler';
import { BackgroundTempRepoManager } from './TempRepoManager';
import { SupabaseAuthService } from '../content/services/SupabaseAuthService';

export class BackgroundService {
  private stateManager: StateManager;
  private zipHandler: ZipHandler | null;
  private ports: Map<number, Port>;
  private githubService: GitHubService | null;
  private tempRepoManager: BackgroundTempRepoManager | null = null;
  private pendingCommitMessage: string;
  private supabaseAuthService: SupabaseAuthService;
  private storageListener:
    | ((changes: { [key: string]: chrome.storage.StorageChange }, namespace: string) => void)
    | null = null;

  constructor() {
    console.log('🚀 Background service initializing...');
    this.stateManager = StateManager.getInstance();
    this.ports = new Map();
    this.githubService = null;
    this.zipHandler = null;
    this.pendingCommitMessage = 'Commit from Bolt to GitHub';
    this.supabaseAuthService = SupabaseAuthService.getInstance();
    this.initialize();
  }

  // this.initializeListeners();
  // this.initializeStorageListener();

  private async initialize(): Promise<void> {
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
    console.log('👂 Background service initialized');
  }

  private async initializeGitHubService(): Promise<GitHubService | null> {
    try {
      const settings = await this.stateManager.getGitHubSettings();

      if (
        settings &&
        settings.gitHubSettings &&
        settings.gitHubSettings.githubToken &&
        settings.gitHubSettings.repoOwner
      ) {
        console.log('✅ Valid settings found, initializing GitHub service', settings);
        this.githubService = new GitHubService(settings.gitHubSettings.githubToken);
      } else {
        console.log('❌ Invalid or incomplete settings');
        this.githubService = null;
      }
    } catch (error) {
      console.error('Failed to initialize GitHub service:', error);
      this.githubService = null;
    }
    return this.githubService;
  }

  private setupZipHandler(githubService: GitHubService) {
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

      console.log('📝 New connection from:', port.name, 'tabId:', tabId);
      this.ports.set(tabId, port);

      port.onDisconnect.addListener(() => {
        console.log('🔌 Port disconnected:', tabId);
        this.ports.delete(tabId);
      });

      port.onMessage.addListener(async (message: Message) => {
        console.log('📥 Received port message:', { source: port.name, type: message.type });
        await this.handlePortMessage(tabId, message);
      });
    });

    // Setup runtime message listener for direct messages (not using ports)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📥 Received runtime message:', message);

      if (message.action === 'PUSH_TO_GITHUB') {
        this.handlePushToGitHub();
        sendResponse({ success: true });
      } else if (message.type === 'FILE_CHANGES') {
        console.log('📄 Received file changes, forwarding to popup');
        // Forward file changes to popup
        chrome.runtime.sendMessage(message);
        sendResponse({ success: true });
      } else if (message.type === 'CHECK_PREMIUM_FEATURE') {
        this.handleCheckPremiumFeature(message.feature, sendResponse);
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
        const settingsChanged = ['githubToken', 'repoOwner', 'repoName', 'branch'].some(
          (key) => key in changes
        );

        if (settingsChanged) {
          console.log('🔄 GitHub settings changed, reinitializing GitHub service...');
          const githubService = await this.initializeGitHubService();
          if (githubService) {
            console.log('🔄 GitHub service reinitialized, reinitializing ZipHandler...');
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
    if (!port) return;

    try {
      switch (message.type) {
        case 'ZIP_DATA':
          await this.handleZipData(tabId, message.data);
          break;

        case 'SET_COMMIT_MESSAGE':
          console.log('Setting commit message:', message.data.message);
          if (message.data && message.data.message) {
            this.pendingCommitMessage = message.data.message;
          }
          break;

        case 'OPEN_SETTINGS':
          console.log('Opening settings popup');
          chrome.action.openPopup();
          break;

        case 'OPEN_FILE_CHANGES':
          console.log('Opening file changes popup');
          // Store the file changes in local storage for the popup to retrieve
          await chrome.storage.local.set({
            pendingFileChanges: message.data?.changes || {},
          });
          console.log('Stored file changes in local storage');

          // Open the popup - it will check for pendingFileChanges when it loads
          chrome.action.openPopup();
          break;

        case 'IMPORT_PRIVATE_REPO':
          console.log('🔄 Processing private repo import:', message.data.repoName);
          if (!this.tempRepoManager) {
            throw new Error('Temp repo manager not initialized');
          }
          await this.tempRepoManager.handlePrivateRepoImport(
            message.data.repoName,
            message.data.branch
          );
          console.log(
            `✅ Private repo import completed from branch '${message.data.branch || 'default'}'`
          );
          break;
        case 'DELETE_TEMP_REPO':
          await this.tempRepoManager?.cleanupTempRepos(true);
          console.log('✅ Temp repo cleaned up');
          break;

        case 'DEBUG':
          console.log(`[Content Debug] ${message.message}`);
          break;

        case 'CONTENT_SCRIPT_READY':
          console.log('Content script is ready');
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error(`Error handling message ${message.type}:`, error);
      this.sendResponse(port, {
        type: 'UPLOAD_STATUS',
        status: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      });
    }
  }

  private async handleZipData(tabId: number, base64Data: string): Promise<void> {
    console.log('🔄 Handling ZIP data for tab:', tabId);
    const port = this.ports.get(tabId);
    if (!port) return;

    try {
      if (!this.githubService) {
        throw new Error('GitHub service is not initialized. Please check your GitHub settings.');
      }

      if (!this.zipHandler) {
        throw new Error('Zip handler is not initialized.');
      }

      const projectId = await this.stateManager.getProjectId();
      if (!projectId) {
        throw new Error('Project ID is not set.');
      }

      try {
        // Convert base64 to blob
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/zip' });

        // Process the ZIP file
        await this.withTimeout(
          this.zipHandler.processZipFile(blob, projectId, this.pendingCommitMessage),
          2 * 60 * 1000, // 2 minutes timeout
          'Processing ZIP file timed out'
        );

        // Reset commit message after successful upload
        this.pendingCommitMessage = 'Commit from Bolt to GitHub';

        this.sendResponse(port, {
          type: 'UPLOAD_STATUS',
          status: { status: 'success', message: 'Upload completed successfully', progress: 100 },
        });
      } catch (decodeError) {
        const errorMessage =
          decodeError instanceof Error ? decodeError.message : String(decodeError);
        const isGitHubError = errorMessage.includes('GitHub API Error');

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
      console.error('Error processing ZIP:', error);
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
    message: { type: MessageType; status?: UploadStatusState }
  ): void {
    try {
      port.postMessage(message);
    } catch (error) {
      console.error('Error sending response:', error);
    }
  }

  private async handleCheckPremiumFeature(
    feature: string,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      const premiumFeatures = ['pushReminders', 'branchSelector', 'unlimitedFileChanges'];

      // Check if the feature requires premium
      if (!premiumFeatures.includes(feature)) {
        sendResponse({ hasAccess: true });
        return;
      }

      // Check premium status from Supabase auth service
      const hasAccess = this.supabaseAuthService.isPremium();

      console.log(`🔍 Checking premium feature: ${feature}, hasAccess: ${hasAccess}`);

      sendResponse({ hasAccess });
    } catch (error) {
      console.error('Error checking premium feature:', error);
      sendResponse({ hasAccess: false });
    }
  }

  private async handlePushToGitHub(): Promise<void> {
    console.log('🔄 Handling Push to GitHub action');

    try {
      // Find the active tab with bolt.new URL
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const boltTab = tabs.find((tab) => tab.url?.includes('bolt.new'));

      if (!boltTab || !boltTab.id) {
        console.error('No active Bolt tab found');
        return;
      }

      const tabId = boltTab.id;
      const port = this.ports.get(tabId);

      if (!port) {
        console.error('No connected port for tab:', tabId);
        return;
      }

      // Send a message to the content script to trigger the GitHub push action
      this.sendResponse(port, {
        type: 'PUSH_TO_GITHUB',
      });

      console.log('✅ Push to GitHub message sent to content script');
    } catch (error) {
      console.error('Error handling Push to GitHub action:', error);
    }
  }

  public destroy(): void {
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener);
      this.storageListener = null;
    }
  }
}
