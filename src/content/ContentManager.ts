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
      if (message.action === 'REQUEST_FILE_CHANGES') {
        console.log('Received request for file changes from popup');
        // Get the current project ID from the URL
        const projectId = window.location.pathname.split('/').pop() || '';
        console.log('Current project ID:', projectId);

        // Trigger the file changes calculation and display with the current project ID
        this.uiManager?.handleShowChangedFiles();
        // Acknowledge receipt
        sendResponse({ success: true, projectId });
      } else if (message.action === 'REFRESH_FILE_CHANGES') {
        console.log('Received refresh file changes request from popup');
        // Get the current project ID from the URL
        const projectId = window.location.pathname.split('/').pop() || '';
        console.log('Refreshing file changes for project ID:', projectId);

        // Trigger the file changes calculation with forced refresh
        // This will automatically send the updated changes back to the popup
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
      }
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
      this.uiManager?.reinitialize();
      this.messageHandler?.sendMessage('CONTENT_SCRIPT_READY');
    } catch (error) {
      console.error('Error reinitializing content script:', error);
      this.handleInitializationError(error);
    }
  }
}
