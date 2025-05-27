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
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  constructor() {
    if (!this.shouldInitialize()) {
      console.log('Not initializing ContentManager - URL does not match bolt.new pattern');
      return;
    }

    try {
      this.initializeConnection();

      if (!this.port) {
        throw new Error('Failed to establish port connection');
      }

      this.messageHandler = new MessageHandler(this.port);
      this.uiManager = UIManager.getInstance(this.messageHandler);
      this.setupEventListeners();
      this.startHeartbeat();

      // Clear any stale stored file changes on initialization
      this.clearStaleStoredChanges();

      console.log('🎉 ContentManager initialized successfully with MessageHandler');
      console.log('💡 Press Ctrl+Shift+D to test notification systems');
    } catch (error) {
      console.error('Error initializing ContentManager:', error);
      this.handleInitializationError(error);
    }
  }

  private shouldInitialize(): boolean {
    const currentUrl = window.location.href;
    // Initialize on any bolt.new page, not just project pages
    // The URL change detection will handle project-specific logic
    return currentUrl.includes('bolt.new');
  }

  private initializeConnection() {
    try {
      // Check if chrome runtime is available
      if (!chrome.runtime?.id) {
        throw new Error('Chrome runtime not available - extension context invalidated');
      }

      this.port = chrome.runtime.connect({ name: 'bolt-content' });
      console.log('🔊 Connected to background service with port:', this.port);

      if (!this.port) {
        throw new Error('Failed to establish connection with background service');
      }

      this.setupPortListeners();
      this.isReconnecting = false;
      this.reconnectAttempts = 0;

      // Clear any existing reconnect timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
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
      this.scheduleReconnection();
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

      // Check if this is true extension context invalidation vs normal disconnect
      const contextInvalidated = this.isExtensionContextInvalidated(error) || !chrome.runtime?.id;

      if (contextInvalidated) {
        console.log('🔴 Extension context invalidation detected');
        this.handleExtensionContextInvalidated();
      } else {
        console.log('🟡 Normal port disconnect, attempting reconnection');
        this.scheduleReconnection();
      }
    });
  }

  private isExtensionContextInvalidated(error: any): boolean {
    // Check for various extension context invalidation patterns
    if (!error?.message && !chrome.runtime?.id) {
      return true;
    }

    if (!error?.message) return false;

    const invalidationPatterns = [
      'Extension context invalidated',
      'Extension context was invalidated',
      'Could not establish connection',
      'Receiving end does not exist',
      'The message port closed before a response was received',
      'chrome-extension://invalid/',
      'net::ERR_FAILED',
    ];

    return invalidationPatterns.some((pattern) => error.message.includes(pattern));
  }

  private handleExtensionContextInvalidated(): void {
    console.log('Extension context invalidated, attempting recovery...');

    // Show notification before cleanup (while UIManager still exists)
    this.notifyUserOfExtensionReload();

    // Clean up current state
    this.cleanup();

    // Attempt to reinitialize after a short delay
    setTimeout(() => {
      if (!this.isDestroyed) {
        console.log('🔄 Attempting to reinitialize after context invalidation...');
        this.attemptRecovery();
      }
    }, 2000); // Wait 2 seconds before attempting recovery
  }

  private attemptRecovery(): void {
    try {
      // Check if Chrome runtime is available for recovery
      if (!chrome.runtime?.id) {
        console.warn('🔄 Recovery failed: Chrome runtime still not available');
        // Try again in 5 seconds
        setTimeout(() => {
          if (!this.isDestroyed) {
            console.log('🔄 Retrying recovery...');
            this.attemptRecovery();
          }
        }, 5000);
        return;
      }

      console.log('✅ Chrome runtime available, attempting full reinitialization...');

      // Reset the destroyed flag since we're recovering
      this.isDestroyed = false;

      // Try to reinitialize everything
      this.initializeConnection();

      if (!this.port) {
        throw new Error('Failed to establish port connection during recovery');
      }

      // Recreate MessageHandler with new port
      this.messageHandler = new MessageHandler(this.port);

      // Recreate UIManager
      this.uiManager = UIManager.getInstance(this.messageHandler);
      console.log('🔧 Recovery: Recreated UIManager after context invalidation');

      // Re-setup event listeners
      this.setupEventListeners();
      this.startHeartbeat();

      // Clear any stale stored file changes
      this.clearStaleStoredChanges();

      this.messageHandler.sendMessage('CONTENT_SCRIPT_READY');

      console.log('🎉 Recovery successful! GitHub button should be restored.');
    } catch (error) {
      console.error('❌ Recovery failed:', error);

      // If recovery fails, try again in 10 seconds (up to 3 attempts)
      if (this.reconnectAttempts < 3) {
        this.reconnectAttempts++;
        console.log(`🔄 Scheduling recovery retry ${this.reconnectAttempts}/3 in 10 seconds...`);
        setTimeout(() => {
          if (!this.isDestroyed) {
            this.attemptRecovery();
          }
        }, 10000);
      } else {
        console.error('💀 Recovery failed after 3 attempts. Extension needs manual refresh.');
        this.notifyUserOfError();
      }
    }
  }

  private scheduleReconnection(): void {
    if (
      this.isDestroyed ||
      this.isReconnecting ||
      this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS
    ) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    console.log(
      `Attempting reconnection (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`
    );

    // Clear any existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(
      () => {
        this.reconnect();
      },
      this.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1)
    ); // Exponential backoff
  }

  private reconnect(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      // Check if extension context is still invalid
      if (!chrome.runtime?.id) {
        console.warn('Extension context still invalid, scheduling another reconnection...');
        this.scheduleReconnection();
        return;
      }

      this.initializeConnection();
      if (this.port) {
        // Update the message handler with the new port
        this.messageHandler?.updatePort(this.port);

        // Re-setup event listeners (they might have been cleaned up)
        this.setupEventListeners();

        // Restart heartbeat
        this.startHeartbeat();

        // Check connection status
        const connectionStatus = this.messageHandler?.getConnectionStatus();
        console.log('Successfully reconnected - MessageHandler status:', connectionStatus);
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
      this.scheduleReconnection();
    }
  }

  private startHeartbeat(): void {
    // Clear existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Send periodic heartbeat to detect connection issues early
    this.heartbeatInterval = setInterval(() => {
      if (this.port && chrome.runtime?.id) {
        try {
          const heartbeatMessage = { type: 'HEARTBEAT' as const };
          console.debug('💓 Sending heartbeat:', JSON.stringify(heartbeatMessage));
          this.port.postMessage(heartbeatMessage);
        } catch (error) {
          console.warn('Heartbeat failed, connection may be broken:', error);
          this.scheduleReconnection();
        }
      } else {
        console.warn('No port or runtime available during heartbeat');
        this.scheduleReconnection();
      }

      // Also check MessageHandler health
      this.checkMessageHandlerHealth();
    }, 30000); // Every 30 seconds
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
    this.isDestroyed = true;

    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clean up port
    if (this.port) {
      try {
        this.port.disconnect();
      } catch (error) {
        // Ignore disconnect errors during cleanup
      }
      this.port = null;
    }

    this.isReconnecting = false;
    // Don't reset reconnectAttempts here - recovery process may need it
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

    // Add debug listener for testing notifications
    window.addEventListener('keydown', (event) => {
      // Ctrl+Shift+D = Test Notifications
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        this.debugNotifications();
        event.preventDefault();
      }
    });

    // Listen for MessageHandler connection issues
    window.addEventListener('messageHandlerDisconnected', ((event: CustomEvent) => {
      console.warn('🔌 MessageHandler reported connection issue:', event.detail);
      if (!this.isReconnecting && !this.isDestroyed) {
        console.log('🔄 Initiating immediate reconnection due to MessageHandler issue');
        this.scheduleReconnection();
      }
    }) as EventListener);

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

          if (message.type === 'SHOW_SUBSCRIPTION_DOWNGRADE') {
            console.log('📨 Received SHOW_SUBSCRIPTION_DOWNGRADE message:', message.data);
            /* Show subscription downgrade notification via UIManager */
            if (this.uiManager) {
              this.uiManager.showNotification({
                type: 'info',
                message: `⚠️ ${message.data.message} Click here to renew: ${message.data.actionUrl}`,
                duration: 15000,
              });
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
      case 'HEARTBEAT_RESPONSE':
        // Heartbeat response received - connection is healthy
        console.debug('💓 Heartbeat response received');
        break;
      default:
        console.warn('Unhandled message type:', message.type);
    }
  }

  public checkMessageHandlerHealth(): void {
    if (!this.messageHandler) {
      console.warn('🔌 MessageHandler is not available');
      return;
    }

    const status = this.messageHandler.getConnectionStatus();
    // Only log health check if there are issues or queued messages
    if (!status.connected || status.queuedMessages > 0) {
      console.log('🔍 MessageHandler health check:', status);
    }

    if (!status.connected && status.queuedMessages > 0) {
      console.warn(
        `🔌 MessageHandler disconnected with ${status.queuedMessages} queued messages, triggering reconnection`
      );
      if (!this.isReconnecting && !this.isDestroyed) {
        this.scheduleReconnection();
      }
    }
  }

  public reinitialize(): void {
    console.log('🔊 Reinitializing content script');
    try {
      this.cleanup();
      this.initializeConnection();

      if (!this.port) {
        throw new Error('Failed to establish port connection during reinitialize');
      }

      // Recreate MessageHandler with new port
      this.messageHandler = new MessageHandler(this.port);

      // Recreate UIManager since cleanup destroyed the previous instance
      this.uiManager = UIManager.initialize(this.messageHandler);
      console.log('🔧 ContentManager: Recreated UIManager after cleanup');

      // Re-setup event listeners
      this.setupEventListeners();
      this.startHeartbeat();

      this.messageHandler.sendMessage('CONTENT_SCRIPT_READY');
    } catch (error) {
      console.error('Error reinitializing content script:', error);
      this.handleInitializationError(error);
    }
  }

  /**
   * Debug method to test notification systems
   * Triggered by Ctrl+Shift+D
   */
  private debugNotifications(): void {
    console.log('🔧 Debug: Testing notification systems...');

    if (!this.uiManager) {
      console.error('🔧 Debug: UIManager not available');
      return;
    }

    // Test regular notification
    console.log('🔧 Debug: Testing regular notification...');
    this.uiManager.showNotification({
      type: 'info',
      message: '🔧 Debug: Regular notification test',
      duration: 3000,
    });

    // Test upload status notification
    setTimeout(() => {
      console.log('🔧 Debug: Testing upload status notification...');
      this.uiManager?.updateUploadStatus({
        status: 'uploading',
        progress: 50,
        message: '🔧 Debug: Upload status test',
      });
    }, 1000);

    // Test success notification
    setTimeout(() => {
      console.log('🔧 Debug: Testing success notification...');
      this.uiManager?.showNotification({
        type: 'success',
        message: '🔧 Debug: Success notification test',
        duration: 3000,
      });
    }, 2000);

    // Test upload completion
    setTimeout(() => {
      console.log('🔧 Debug: Testing upload completion...');
      this.uiManager?.updateUploadStatus({
        status: 'success',
        progress: 100,
        message: '🔧 Debug: Upload complete test',
      });
    }, 4000);

    // Check DOM for notification containers
    setTimeout(() => {
      console.log('🔧 Debug: Checking DOM for notification containers...');
      const notificationContainers = document.querySelectorAll(
        '[id*="bolt-to-github-notification-container"]'
      );
      const uploadContainers = document.querySelectorAll('#bolt-to-github-upload-status-container');

      console.log('🔧 Debug: Found notification containers:', notificationContainers.length);
      console.log('🔧 Debug: Found upload containers:', uploadContainers.length);

      notificationContainers.forEach((container, index) => {
        const rect = container.getBoundingClientRect();
        console.log(`🔧 Debug: Notification container ${index}:`, {
          id: container.id,
          visible: rect.width > 0 && rect.height > 0,
          position: { top: rect.top, right: rect.right, width: rect.width, height: rect.height },
          zIndex: (container as HTMLElement).style.zIndex,
          display: (container as HTMLElement).style.display,
        });
      });

      uploadContainers.forEach((container, index) => {
        const rect = container.getBoundingClientRect();
        console.log(`🔧 Debug: Upload container ${index}:`, {
          id: container.id,
          visible: rect.width > 0 && rect.height > 0,
          position: { top: rect.top, right: rect.right, width: rect.width, height: rect.height },
          zIndex: (container as HTMLElement).style.zIndex,
          display: (container as HTMLElement).style.display,
        });
      });
    }, 5000);
  }
}
