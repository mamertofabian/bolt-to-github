import type { Message, MessageType } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('chromeMessaging');

// Type definitions for messaging
type MessageResponse = unknown;
type TabMessage = Message | { action: string; [key: string]: unknown };
type PortMessage = Message | { type: string; data?: unknown; [key: string]: unknown };

// Message handlers type
type MessageHandler = (message: Message, sender?: chrome.runtime.MessageSender) => void;
type PortMessageHandler = (message: PortMessage) => void;

// Response interfaces
interface FileChangesResponse {
  success: boolean;
  projectId?: string;
  error?: string;
}

// Chrome Messaging Service
export class ChromeMessagingService {
  private static messageHandlers = new Map<MessageType, MessageHandler[]>();
  private static port: chrome.runtime.Port | null = null;
  private static portHandlers: PortMessageHandler[] = [];

  /**
   * Initialize Chrome runtime port connection
   */
  static initializePort(portName = 'popup'): chrome.runtime.Port {
    try {
      this.port = chrome.runtime.connect({ name: portName });

      // Set up port message listener
      this.port.onMessage.addListener((message: PortMessage) => {
        this.portHandlers.forEach((handler) => {
          try {
            handler(message);
          } catch (error) {
            logger.error('Error in port message handler:', error);
          }
        });
      });

      // Handle port disconnect
      this.port.onDisconnect.addListener(() => {
        logger.info('Chrome runtime port disconnected');
        this.port = null;
      });

      return this.port;
    } catch (error) {
      logger.error('Error initializing Chrome runtime port:', error);
      throw error;
    }
  }

  /**
   * Send message to background script via port
   */
  static sendPortMessage(message: PortMessage): void {
    if (!this.port) {
      logger.warn('No port connection available. Initializing...');
      this.initializePort();
    }

    try {
      this.port?.postMessage(message);
    } catch (error) {
      logger.error('Error sending port message:', error);
      // Try to reinitialize port on error
      this.initializePort();
      this.port?.postMessage(message);
    }
  }

  /**
   * Add handler for port messages
   */
  static addPortMessageHandler(handler: PortMessageHandler): void {
    this.portHandlers.push(handler);
  }

  /**
   * Remove handler for port messages
   */
  static removePortMessageHandler(handler: PortMessageHandler): void {
    const index = this.portHandlers.indexOf(handler);
    if (index > -1) {
      this.portHandlers.splice(index, 1);
    }
  }

  /**
   * Disconnect port
   */
  static disconnectPort(): void {
    if (this.port) {
      try {
        this.port.disconnect();
      } catch (error) {
        logger.error('Error disconnecting port:', error);
      }
      this.port = null;
    }
  }

  /**
   * Send message to content script in active tab
   */
  static async sendMessageToActiveTab(message: TabMessage): Promise<MessageResponse> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        throw new Error('No active tab found');
      }

      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabs[0].id!, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      logger.error('Error sending message to active tab:', error);
      throw error;
    }
  }

  /**
   * Send message to specific tab
   */
  static async sendMessageToTab(tabId: number, message: TabMessage): Promise<MessageResponse> {
    try {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      logger.error(`Error sending message to tab ${tabId}:`, error);
      throw error;
    }
  }

  /**
   * Send message to background script
   */
  static async sendMessageToBackground(message: Message): Promise<MessageResponse> {
    try {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      logger.error('Error sending message to background:', error);
      throw error;
    }
  }

  /**
   * Add message handler for specific message type
   */
  static addMessageHandler(messageType: MessageType, handler: MessageHandler): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType)!.push(handler);
  }

  /**
   * Remove message handler for specific message type
   */
  static removeMessageHandler(messageType: MessageType, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Initialize runtime message listener
   */
  static initializeMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
      const handlers = this.messageHandlers.get(message.type);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(message, sender);
          } catch (error) {
            logger.error(`Error in message handler for ${message.type}:`, error);
          }
        });
      }
      return false; // Don't keep the message channel open
    });
  }

  /**
   * Get current port instance
   */
  static getPort(): chrome.runtime.Port | null {
    return this.port;
  }

  /**
   * Check if port is connected
   */
  static isPortConnected(): boolean {
    return this.port !== null;
  }

  /**
   * Request file changes from content script
   */
  static async requestFileChanges(): Promise<FileChangesResponse> {
    try {
      const response = await this.sendMessageToActiveTab({
        action: 'REQUEST_FILE_CHANGES',
      });

      const typedResponse = response as FileChangesResponse;
      if (typedResponse && typedResponse.success) {
        logger.info('File changes requested successfully:', typedResponse.projectId);
        return typedResponse;
      } else {
        throw new Error('Failed to request file changes');
      }
    } catch (error) {
      logger.error('Error requesting file changes:', error);
      throw error;
    }
  }

  /**
   * Delete temporary repository
   */
  static sendDeleteTempRepoMessage(owner: string, repo: string): void {
    this.sendPortMessage({
      type: 'DELETE_TEMP_REPO',
      data: { owner, repo },
    });
  }

  /**
   * Send message to open issues modal
   */
  static sendOpenIssuesMessage(): void {
    this.sendPortMessage({
      type: 'OPEN_ISSUES',
    });
  }

  /**
   * Send message to open projects tab
   */
  static sendOpenProjectsMessage(): void {
    this.sendPortMessage({
      type: 'OPEN_PROJECTS',
    });
  }

  /**
   * Cleanup all handlers and connections
   */
  static cleanup(): void {
    this.messageHandlers.clear();
    this.portHandlers.length = 0;
    this.disconnectPort();
  }
}
