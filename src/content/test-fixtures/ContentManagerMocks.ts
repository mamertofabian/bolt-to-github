/**
 * ContentManagerMocks
 *
 * Test doubles for ContentManager dependencies that accurately reflect real behavior.
 * Designed to minimize mocking while maintaining test control.
 */

import type { Message, MessageType } from '$lib/types';
import type { NotificationOptions } from '../types/UITypes';
import type { EventListenerTracker, TimerTracker } from './ContentManagerTestFixtures';

// Interface for MessageHandler's public API
export interface MessageHandlerInterface {
  updatePort(newPort: chrome.runtime.Port): void;
  sendMessage(type: MessageType, data?: unknown): void;
  sendZipData(data: string, currentProjectId?: string): void;
  sendDebugMessage(message: string): void;
  sendCommitMessage(message: string): void;
  getConnectionStatus(): { connected: boolean; queuedMessages: number };
  clearQueue(): void;
}

/**
 * MockMessageHandler - Test double for MessageHandler
 * Simulates real MessageHandler behavior including connection state and message queuing
 */
export class MockMessageHandler implements MessageHandlerInterface {
  private port: chrome.runtime.Port | null = null;
  private messageQueue: { type: MessageType; data?: unknown }[] = [];
  private isConnected = false;
  private sentMessages: Array<{ type: MessageType; data?: unknown; timestamp: number }> = [];
  private eventListeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  constructor(port: chrome.runtime.Port | null = null) {
    this.port = port;
    this.isConnected = !!port;
  }

  updatePort(newPort: chrome.runtime.Port): void {
    this.port = newPort;
    this.isConnected = true;

    // Process queued messages like real implementation
    const queuedMessages = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queuedMessages) {
      this.sendMessage(message.type, message.data);
    }
  }

  sendMessage(type: MessageType, data?: unknown): void {
    const message = { type, data };

    if (!this.isConnected || !this.port) {
      this.messageQueue.push(message);
      return;
    }

    try {
      this.sentMessages.push({ ...message, timestamp: Date.now() });

      // Simulate potential failures
      if (this.shouldSimulateFailure()) {
        throw new Error('Simulated port.postMessage failure');
      }

      // Trigger any registered listeners
      this.emit('messageSent', message);
    } catch {
      this.isConnected = false;
      this.messageQueue.push(message);
      window.dispatchEvent(
        new CustomEvent('messageHandlerDisconnected', {
          detail: { reason: 'Port connection failed' },
        })
      );
    }
  }

  sendZipData(data: string, currentProjectId?: string): void {
    this.sendMessage('ZIP_DATA', { data, projectId: currentProjectId });
  }

  sendDebugMessage(message: string): void {
    this.sendMessage('DEBUG', { message });
  }

  sendCommitMessage(message: string): void {
    this.sendMessage('SET_COMMIT_MESSAGE', { message });
  }

  getConnectionStatus(): { connected: boolean; queuedMessages: number } {
    return {
      connected: this.isConnected,
      queuedMessages: this.messageQueue.length,
    };
  }

  clearQueue(): void {
    this.messageQueue = [];
  }


  // Test helpers
  simulateDisconnection(): void {
    this.isConnected = false;
    this.port = null;
  }

  setPort(port: chrome.runtime.Port | null): void {
    this.port = port;
    this.isConnected = !!port;
  }

  getSentMessages(): Array<{ type: MessageType; data?: unknown; timestamp: number }> {
    return [...this.sentMessages];
  }

  getQueuedMessages(): Array<{ type: MessageType; data?: unknown }> {
    return [...this.messageQueue];
  }

  private shouldSimulateFailure(): boolean {
    // Can be configured for specific test scenarios
    return false;
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach((listener) => listener(data));
  }
}

interface UploadStatus {
  status?: string;
  progress?: number;
  message?: string;
  timestamp?: number;
}

interface PushReminderService {
  getDebugInfo: () => { enabled: boolean; interval: number };
  updateSettings: (settings: Record<string, unknown>) => Promise<void>;
}

interface PremiumService {
  updatePremiumStatusFromAuth: (data: Record<string, unknown>) => Promise<void>;
}

/**
 * MockUIManager - Test double for UIManager
 * Tracks UI interactions and state changes
 */
export class MockUIManager {
  private static instance: MockUIManager | null = null;
  private notifications: Array<NotificationOptions & { timestamp: number }> = [];
  private uploadStatuses: Array<UploadStatus> = [];
  private buttonStates: Array<{ isValid: boolean; timestamp: number }> = [];
  private cleanupCalled = false;
  private showChangedFilesCalls = 0;
  private reauthenticationModalShown = false;
  private snoozeRemindersCalled = false;

  constructor(private messageHandler: MessageHandlerInterface) {}

  static getInstance(messageHandler: MessageHandlerInterface): MockUIManager {
    if (!MockUIManager.instance) {
      MockUIManager.instance = new MockUIManager(messageHandler);
    }
    return MockUIManager.instance;
  }

  static initialize(messageHandler: MessageHandlerInterface): MockUIManager {
    MockUIManager.instance = new MockUIManager(messageHandler);
    return MockUIManager.instance;
  }

  static resetInstance(): void {
    MockUIManager.instance = null;
  }

  showNotification(options: NotificationOptions): void {
    this.notifications.push({ ...options, timestamp: Date.now() });
  }

  updateUploadStatus(status: UploadStatus): void {
    this.uploadStatuses.push({ ...status, timestamp: Date.now() });
  }

  updateButtonState(isValid: boolean): void {
    this.buttonStates.push({ isValid, timestamp: Date.now() });
  }

  async handleGitHubPushAction(): Promise<void> {
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async handleShowChangedFiles(): Promise<void> {
    this.showChangedFilesCalls++;
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  cleanup(): void {
    this.cleanupCalled = true;
    this.notifications = [];
    this.uploadStatuses = [];
    this.buttonStates = [];
  }

  getPushReminderService(): PushReminderService {
    return {
      getDebugInfo: () => ({ enabled: true, interval: 300000 }),
      updateSettings: async (_settings: Record<string, unknown>) => {
        await Promise.resolve();
      },
    };
  }

  getPremiumService(): PremiumService {
    return {
      updatePremiumStatusFromAuth: async (_data: Record<string, unknown>) => {
        await Promise.resolve();
      },
    };
  }

  showReauthenticationModal(_data: Record<string, unknown>): void {
    this.reauthenticationModalShown = true;
  }

  snoozePushReminders(): void {
    this.snoozeRemindersCalled = true;
  }

  // Test helpers
  getNotifications(): Array<NotificationOptions & { timestamp: number }> {
    return [...this.notifications];
  }

  getUploadStatuses(): Array<UploadStatus> {
    return [...this.uploadStatuses];
  }

  getButtonStates(): Array<{ isValid: boolean; timestamp: number }> {
    return [...this.buttonStates];
  }

  wasCleanupCalled(): boolean {
    return this.cleanupCalled;
  }

  getShowChangedFilesCalls(): number {
    return this.showChangedFilesCalls;
  }

  wasReauthenticationModalShown(): boolean {
    return this.reauthenticationModalShown;
  }

  wasSnoozePushRemindersCalled(): boolean {
    return this.snoozeRemindersCalled;
  }
}

interface MessageSent {
  message: unknown;
  timestamp: number;
}

/**
 * MockPort - Test double for chrome.runtime.Port
 * Simulates port behavior including connection state and message passing
 */
export class MockPort implements chrome.runtime.Port {
  name: string;
  onDisconnect: chrome.events.Event<() => void>;
  onMessage: chrome.events.Event<(message: unknown) => void>;
  private disconnectListeners: Array<() => void> = [];
  private messageListeners: Array<(message: unknown) => void> = [];
  private connected = true;
  private disconnectError: chrome.runtime.LastError | null = null;
  private messagesSent: MessageSent[] = [];

  constructor(name: string) {
    this.name = name;

    // Create mock event objects
    this.onDisconnect = {
      addListener: (callback: () => void) => {
        this.disconnectListeners.push(callback);
      },
      removeListener: (callback: () => void) => {
        const index = this.disconnectListeners.indexOf(callback);
        if (index >= 0) {
          this.disconnectListeners.splice(index, 1);
        }
      },
      hasListener: (callback: () => void) => {
        return this.disconnectListeners.includes(callback);
      },
    } as chrome.events.Event<() => void>;

    this.onMessage = {
      addListener: (callback: (message: unknown) => void) => {
        this.messageListeners.push(callback);
      },
      removeListener: (callback: (message: unknown) => void) => {
        const index = this.messageListeners.indexOf(callback);
        if (index >= 0) {
          this.messageListeners.splice(index, 1);
        }
      },
      hasListener: (callback: (message: unknown) => void) => {
        return this.messageListeners.includes(callback);
      },
    } as chrome.events.Event<(message: unknown) => void>;
  }

  postMessage(message: unknown): void {
    if (!this.connected) {
      throw new Error('Attempting to use a disconnected port object');
    }
    this.messagesSent.push({ message, timestamp: Date.now() });
  }

  disconnect(): void {
    this.connected = false;
  }

  // Test helpers
  simulateDisconnect(error?: chrome.runtime.LastError | null): void {
    this.connected = false;
    this.disconnectError = error || null;

    // Set chrome.runtime.lastError for the disconnect event
    // In tests, the lastError should persist for the test environment to use
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      (chrome.runtime as typeof chrome.runtime & { lastError?: chrome.runtime.LastError }).lastError =
        this.disconnectError || null;

      this.disconnectListeners.forEach((listener) => listener());
      
      // Note: We don't restore lastError here, let the test environment manage it
    } else {
      // If chrome is not available, just call the listeners
      this.disconnectListeners.forEach((listener) => listener());
    }
  }

  simulateMessage(message: Message): void {
    this.messageListeners.forEach((listener) => listener(message));
  }

  isConnected(): boolean {
    return this.connected;
  }

  getMessagesSent(): MessageSent[] {
    return [...this.messagesSent];
  }

  getListenerCount(): { disconnect: number; message: number } {
    return {
      disconnect: this.disconnectListeners.length,
      message: this.messageListeners.length,
    };
  }
}

/**
 * ResourceTracker - Tracks resources for memory leak detection
 */
export class ResourceTracker {
  private eventListeners: EventListenerTracker[] = [];
  private timers: TimerTracker[] = [];
  private customEventListeners: Map<EventTarget, Map<string, EventListener[]>> = new Map();

  trackEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.eventListeners.push({ target, type, listener, options });
  }

  trackTimer(
    id: NodeJS.Timeout | number,
    type: 'timeout' | 'interval',
    callback: (...args: unknown[]) => void,
    delay: number
  ): void {
    this.timers.push({
      id,
      type,
      callback,
      delay,
      createdAt: Date.now(),
    });
  }

  removeTimer(id: NodeJS.Timeout | number): void {
    const index = this.timers.findIndex((t) => t.id === id);
    if (index >= 0) {
      this.timers.splice(index, 1);
    }
  }

  getActiveResources(): {
    eventListeners: number;
    timers: number;
    intervals: number;
    timeouts: number;
  } {
    return {
      eventListeners: this.eventListeners.length,
      timers: this.timers.length,
      intervals: this.timers.filter((t) => t.type === 'interval').length,
      timeouts: this.timers.filter((t) => t.type === 'timeout').length,
    };
  }

  clear(): void {
    this.eventListeners = [];
    this.timers = [];
    this.customEventListeners.clear();
  }

  getTimers(): TimerTracker[] {
    return [...this.timers];
  }

  getEventListeners(): EventListenerTracker[] {
    return [...this.eventListeners];
  }
}
