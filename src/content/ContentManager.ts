/* eslint-disable no-console */
import type { Message } from '$lib/types';
import { MessageHandler } from './MessageHandler';
import { UIManager } from './UIManager';

export class ContentManager {
  private uiManager: UIManager | undefined;
  private messageHandler: MessageHandler | undefined;
  private port: chrome.runtime.Port | null = null;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 1000;

  constructor() {
    if (!this.shouldInitialize()) {
      console.log('Not initializing ContentManager - URL does not match bolt.new pattern');
      return;
    }

    try {
      this.initializeConnection();
      this.messageHandler = new MessageHandler(this.port!);
      this.uiManager = UIManager.getInstance(this.messageHandler);
      this.setupEventListeners();

      // Clear any stale stored file changes on initialization
      this.clearStaleStoredChanges();
    } catch (error) {
      console.error('Error initializing ContentManager:', error);
      this.handleInitializationError(error);
    }
  }

  private shouldInitialize(): boolean {
    const currentUrl = window.location.href;
    const match = currentUrl.match(/bolt\.new\/~\/([^/]+)/);
    return !!match;
  }

  private initializeConnection() {
    try {
      this.port = chrome.runtime.connect({ name: 'bolt-content' });
      console.log('🔊 Connected to background service with port:', this.port);

      if (!this.port) {
        throw new Error('Failed to establish connection with background service');
      }

      this.setupPortListeners();
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
    } catch (error) {
      if (this.isExtensionContextInvalidated(error)) {
        console.warn('Extension context invalidated, attempting reconnection...');
        this.handleExtensionContextInvalidated();
      } else {
        console.error('Error initializing connection:', error);
        throw error;
      }
    }
  }

  private setupPortListeners(): void {
    if (!this.port) {
      console.error('Port is not initialized');
      this.handleDisconnection();
      return;
    }

    this.port.onMessage.addListener((message: Message) => {
      try {
        this.handleBackgroundMessage(message);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    this.port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      console.log('Port disconnected:', error?.message || 'No error message');

      if (this.isExtensionContextInvalidated(error)) {
        this.handleExtensionContextInvalidated();
      } else {
        this.handleDisconnection();
      }
    });
  }
  private isExtensionContextInvalidated(error: any): boolean {
    return (
      error?.message?.includes('Extension context invalidated') ||
      error?.message?.includes('Extension context was invalidated')
    );
  }

  private handleExtensionContextInvalidated(): void {
    console.log('Extension context invalidated, cleaning up...');
    this.cleanup();
    this.notifyUserOfExtensionReload();
  }

  private handleDisconnection(): void {
    if (this.isReconnecting || this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    console.log(
      `Attempting reconnection (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`
    );
    setTimeout(() => this.reconnect(), this.RECONNECT_DELAY);
  }

  private reconnect(): void {
    try {
      this.initializeConnection();
      if (this.port) {
        this.messageHandler?.updatePort(this.port);
        this.setupEventListeners();
        console.log('Successfully reconnected');
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
      this.handleDisconnection();
    }
  }

  private handleInitializationError(error: any): void {
    console.error('Initialization error:', error);
    this.notifyUserOfError();
  }

  private notifyUserOfExtensionReload(): void {
    this.uiManager?.showNotification({
      type: 'info',
      message:
        'Bolt to GitHub extension has been updated or reloaded. Please refresh the page to continue.',
      duration: 10000,
    });
  }

  private notifyUserOfError(): void {
    this.uiManager?.showNotification({
      type: 'error',
      message:
        'There was an error connecting to the Bolt to GitHub extension. Please refresh the page or reinstall the extension.',
      duration: 10000,
    });
  }

  private cleanup(): void {
    this.port = null;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.uiManager?.cleanup();

    // Reset UIManager singleton to ensure clean recreation
    UIManager.resetInstance();
    this.uiManager = undefined; // Clear reference to cleaned up UIManager
  }

  /**
   * Clear stale stored file changes on initialization
   */
  private async clearStaleStoredChanges(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['storedFileChanges']);
      const storedData = result.storedFileChanges;

      if (!storedData) {
        return;
      }

      const currentUrl = window.location.href;
      const currentProjectId = window.location.pathname.split('/').pop() || '';

      // Clear if URL changed or project ID changed
      if (storedData.url !== currentUrl || storedData.projectId !== currentProjectId) {
        await chrome.storage.local.remove(['storedFileChanges']);
        console.log('Cleared stale stored file changes due to navigation');
      }
    } catch (error) {
      console.warn('Error checking/clearing stale stored changes:', error);
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('unload', () => {
      this.cleanup();
    });

    window.addEventListener('focus', () => {
      if (!this.port && !this.isReconnecting) {
        this.reconnect();
      }
    });

    // Handle extension updates
    chrome.runtime.onConnect.addListener(() => {
      this.reinitialize();
    });

    // Listen for direct messages from the popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Handle legacy file changes requests
      if (message.action === 'REQUEST_FILE_CHANGES') {
        console.log('Received request for file changes from popup');
        const projectId = window.location.pathname.split('/').pop() || '';
        console.log('Current project ID:', projectId);
        this.uiManager?.handleShowChangedFiles();
        sendResponse({ success: true, projectId });
        return;
      }

      if (message.action === 'REFRESH_FILE_CHANGES') {
        console.log('Received refresh file changes request from popup');
        const projectId = window.location.pathname.split('/').pop() || '';
        console.log('Refreshing file changes for project ID:', projectId);

        this.uiManager
          ?.handleShowChangedFiles()
          .then(() => {
            sendResponse({ success: true, projectId });
          })
          .catch((error) => {
            console.error('Error refreshing file changes:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              projectId,
            });
          });
        return true; // Keep channel open for async response
      }

      // Handle new message types with async support
      (async () => {
        try {
          if (message.type === 'REFRESH_FILE_CHANGES') {
            await this.uiManager?.handleShowChangedFiles();
            sendResponse({ success: true });
            return;
          }

          if (message.type === 'GET_PUSH_REMINDER_DEBUG') {
            const reminderService = this.uiManager?.getPushReminderService();
            if (reminderService) {
              const debugInfo = reminderService.getDebugInfo();
              sendResponse(debugInfo);
            } else {
              sendResponse({ error: 'Push reminder service not available' });
            }
            return;
          }

          if (message.type === 'UPDATE_PUSH_REMINDER_SETTINGS') {
            const reminderService = this.uiManager?.getPushReminderService();
            if (reminderService) {
              await reminderService.updateSettings(message.settings);
              sendResponse({ success: true });
            } else {
              sendResponse({ error: 'Push reminder service not available' });
            }
            return;
          }

          if (message.type === 'SNOOZE_PUSH_REMINDERS') {
            if (this.uiManager) {
              this.uiManager.snoozePushReminders();
              sendResponse({ success: true });
            } else {
              sendResponse({ error: 'UI manager not available' });
            }
            return;
          }

          if (message.type === 'UPDATE_PREMIUM_STATUS') {
            console.log('📨 Received UPDATE_PREMIUM_STATUS message from background:', message.data);
            // Forward to premium service through UIManager
            if (this.uiManager) {
              const premiumService = this.uiManager.getPremiumService();
              if (premiumService) {
                await premiumService.updatePremiumStatusFromAuth(message.data);
                console.log('✅ Premium status updated successfully');
                sendResponse({ success: true });
              } else {
                console.warn('❌ Premium service not available');
                sendResponse({ error: 'Premium service not available' });
              }
            } else {
              console.warn('❌ UI manager not available');
              sendResponse({ error: 'UI manager not available' });
            }
            return;
          }
          if (message.type === 'SHOW_REAUTHENTICATION_MODAL') {
            console.log('📨 Received SHOW_REAUTHENTICATION_MODAL message:', message.data);
            /* Show re-authentication modal via UIManager */
            if (this.uiManager) {
              this.uiManager.showReauthenticationModal(message.data);
              sendResponse({ success: true });
            } else {
              console.warn('❌ UI manager not available');
              sendResponse({ error: 'UI manager not available' });
            }
            return;
          }
        } catch (error) {
          console.error('Error handling message:', error);
          sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
      })();

      return true; // Keep the message channel open for async response
    });
  }

  private handleBackgroundMessage(message: Message): void {
    switch (message.type) {
      case 'UPLOAD_STATUS':
        this.uiManager?.updateUploadStatus(message.status!);
        break;
      case 'GITHUB_SETTINGS_CHANGED':
        console.log('🔊 Received GitHub settings changed:', message.data.isValid);
        this.uiManager?.updateButtonState(message.data.isValid);
        break;
      case 'PUSH_TO_GITHUB':
        console.log('🔊 Received Push to GitHub message');
        this.uiManager?.handleGitHubPushAction();
        break;
      default:
        console.warn('Unhandled message type:', message.type);
    }
  }

  public reinitialize(): void {
    console.log('🔊 Reinitializing content script');
    try {
      this.cleanup();
      this.initializeConnection();

      // Recreate UIManager since cleanup destroyed the previous instance
      if (this.messageHandler) {
        this.uiManager = UIManager.initialize(this.messageHandler);
        console.log('🔧 ContentManager: Recreated UIManager after cleanup');
      }

      this.messageHandler?.sendMessage('CONTENT_SCRIPT_READY');
    } catch (error) {
      console.error('Error reinitializing content script:', error);
      this.handleInitializationError(error);
    }
  }
}
