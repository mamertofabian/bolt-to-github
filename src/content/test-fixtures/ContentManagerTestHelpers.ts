/**
 * ContentManagerTestHelpers
 *
 * Helper functions for ContentManager test setup, teardown, and validation.
 * Provides controlled test environments and utilities for comprehensive testing.
 */

import { ContentManager } from '../ContentManager';
import {
  MockMessageHandler,
  MockUIManager,
  MockPort,
  ResourceTracker,
  type MessageHandlerInterface,
} from './ContentManagerMocks';
import type { MockPortState } from './ContentManagerTestFixtures';
import { MemoryThresholds } from './ContentManagerTestFixtures';

/**
 * Test environment configuration
 */
export interface TestEnvironment {
  contentManager?: ContentManager;
  mockPort?: MockPort;
  mockMessageHandler?: MockMessageHandler;
  mockUIManager?: MockUIManager;
  resourceTracker: ResourceTracker;
  originalChrome: typeof chrome;
  originalWindow: typeof window;
  timers: {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
  };
  cleanup: () => void;
}

/**
 * Creates a controlled test environment for ContentManager testing
 */
export function createTestEnvironment(): TestEnvironment {
  const resourceTracker = new ResourceTracker();

  // Store original values
  const originalChrome = globalThis.chrome;
  const originalWindow = {
    location: globalThis.window?.location,
    addEventListener: globalThis.window?.addEventListener,
    removeEventListener: globalThis.window?.removeEventListener,
    dispatchEvent: globalThis.window?.dispatchEvent,
  };

  // Store original timer functions
  const originalTimers = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };

  // Create tracked timer functions
  const trackedTimers = createTrackedTimers(resourceTracker, originalTimers);

  // Override global timer functions
  (globalThis as typeof globalThis & { setTimeout: typeof setTimeout }).setTimeout =
    trackedTimers.setTimeout;
  (globalThis as typeof globalThis & { clearTimeout: typeof clearTimeout }).clearTimeout =
    trackedTimers.clearTimeout;
  (globalThis as typeof globalThis & { setInterval: typeof setInterval }).setInterval =
    trackedTimers.setInterval;
  (globalThis as typeof globalThis & { clearInterval: typeof clearInterval }).clearInterval =
    trackedTimers.clearInterval;

  const cleanup = () => {
    // Clear all tracked timers
    const activeTimers = resourceTracker.getTimers();
    activeTimers.forEach((timer) => {
      if (timer.type === 'timeout') {
        originalTimers.clearTimeout(timer.id as NodeJS.Timeout);
      } else {
        originalTimers.clearInterval(timer.id as NodeJS.Timeout);
      }
    });

    // Restore original timer functions
    (globalThis as typeof globalThis & { setTimeout: typeof setTimeout }).setTimeout =
      originalTimers.setTimeout;
    (globalThis as typeof globalThis & { clearTimeout: typeof clearTimeout }).clearTimeout =
      originalTimers.clearTimeout;
    (globalThis as typeof globalThis & { setInterval: typeof setInterval }).setInterval =
      originalTimers.setInterval;
    (globalThis as typeof globalThis & { clearInterval: typeof clearInterval }).clearInterval =
      originalTimers.clearInterval;

    // Clear resource tracker
    resourceTracker.clear();

    // Reset UIManager singleton
    MockUIManager.resetInstance();
  };

  return {
    resourceTracker,
    originalChrome,
    originalWindow: originalWindow as typeof window,
    timers: trackedTimers,
    cleanup,
  };
}

/**
 * Creates tracked timer functions for memory leak detection
 */
function createTrackedTimers(
  tracker: ResourceTracker,
  originalTimers: TestEnvironment['timers']
): TestEnvironment['timers'] {
  return {
    setTimeout: ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
      const id = originalTimers.setTimeout(
        (...args: unknown[]) => {
          tracker.removeTimer(id);
          callback(...args);
        },
        delay,
        ...args
      );
      tracker.trackTimer(id, 'timeout', callback, delay || 0);
      return id;
    }) as typeof setTimeout,

    clearTimeout: ((id: NodeJS.Timeout) => {
      tracker.removeTimer(id);
      return originalTimers.clearTimeout(id);
    }) as typeof clearTimeout,

    setInterval: ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
      const id = originalTimers.setInterval(callback, delay, ...args);
      tracker.trackTimer(id, 'interval', callback, delay || 0);
      return id;
    }) as typeof setInterval,

    clearInterval: ((id: NodeJS.Timeout) => {
      tracker.removeTimer(id);
      return originalTimers.clearInterval(id);
    }) as typeof clearInterval,
  };
}

/**
 * Sets up Chrome extension API mocks
 */
export function setupChromeAPIMocks(
  env: TestEnvironment,
  config: {
    hasRuntimeId?: boolean;
    storageData?: Record<string, unknown>;
    onMessageListeners?: Array<
      (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => void
    >;
    lastError?: chrome.runtime.LastError | null;
  }
): void {
  const messageListeners: Array<
    (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => void
  > = config.onMessageListeners || [];

  const mockChrome = {
    runtime: {
      id: config.hasRuntimeId !== false ? 'test-extension-id' : undefined,
      lastError: config.lastError !== undefined ? config.lastError : null,
      connect: jest.fn((info?: chrome.runtime.ConnectInfo) => {
        const port = new MockPort(info?.name || 'bolt-content');
        env.mockPort = port;
        return port;
      }),
      onMessage: {
        addListener: jest.fn((listener) => {
          messageListeners.push(listener);
        }),
        removeListener: jest.fn(),
        hasListener: jest.fn(() => false),
        // Add dispatch method for testing
        dispatch: jest.fn(
          (
            message: unknown,
            sender?: chrome.runtime.MessageSender,
            sendResponse?: (response?: unknown) => void
          ) => {
            const mockSender = sender || {};
            const mockSendResponse = sendResponse || (() => {});
            messageListeners.forEach((listener) => {
              try {
                listener(message, mockSender, mockSendResponse);
              } catch (error) {
                console.error('Error in message listener:', error);
              }
            });
          }
        ),
      },
      onConnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(() => false),
      },
    },

    storage: {
      local: {
        get: jest.fn(async (keys) => {
          if (!keys) return config.storageData || {};
          if (typeof keys === 'string') {
            return { [keys]: (config.storageData || {})[keys] };
          }
          if (Array.isArray(keys)) {
            const result: Record<string, unknown> = {};
            keys.forEach((key) => {
              if (config.storageData && key in config.storageData) {
                result[key] = config.storageData[key];
              }
            });
            return result;
          }
          return {};
        }),
        set: jest.fn(async () => {}),
        remove: jest.fn(async () => {}),
      },
    },
  };

  (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome =
    mockChrome as unknown as typeof chrome;
}

/**
 * Sets up window/document mocks
 */
export function setupWindowMocks(url: string = 'https://bolt.new/project/abc123'): void {
  Object.defineProperty(window, 'location', {
    value: {
      href: url,
      pathname: new URL(url).pathname,
      host: new URL(url).host,
      hostname: new URL(url).hostname,
      protocol: new URL(url).protocol,
      search: new URL(url).search,
      hash: new URL(url).hash,
    },
    writable: true,
    configurable: true,
  });

  // Mock document.body if not available
  if (!document.body) {
    try {
      const body = document.createElement('body');
      Object.defineProperty(document, 'body', {
        value: body,
        writable: true,
        configurable: true,
      });
    } catch (error) {
      // If we can't set document.body, create a mock
      const mockBody = {
        appendChild: jest.fn(),
        removeChild: jest.fn(),
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(() => []),
        getBoundingClientRect: jest.fn(() => ({
          width: 0,
          height: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        })),
        contains: jest.fn(() => false),
      };
      Object.defineProperty(document, 'body', {
        value: mockBody,
        writable: true,
        configurable: true,
      });
    }
  }
}

/**
 * Simulates port state changes
 */
export async function simulatePortState(env: TestEnvironment, state: MockPortState): Promise<void> {
  if (!env.mockPort) {
    throw new Error('Mock port not initialized');
  }

  if (!state.connected) {
    env.mockPort.simulateDisconnect(state.disconnectError as chrome.runtime.LastError);
  }

  if (state.willDisconnectAfter) {
    await wait(state.willDisconnectAfter);
    env.mockPort.simulateDisconnect(state.disconnectError as chrome.runtime.LastError);
  }

  if (state.messageQueue) {
    for (const message of state.messageQueue) {
      env.mockPort.simulateMessage(message);
    }
  }
}

/**
 * Waits for ContentManager to reach a specific state
 */
export async function waitForState(
  contentManager: ContentManager,
  predicate: () => boolean,
  timeout: number = 5000
): Promise<void> {
  const startTime = Date.now();

  while (!predicate()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for state');
    }
    await wait(100);
  }
}

/**
 * Utility to wait for a specified time
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates that ContentManager properly cleaned up resources
 */
export function validateCleanup(env: TestEnvironment): {
  valid: boolean;
  issues: string[];
} {
  const resources = env.resourceTracker.getActiveResources();
  const issues: string[] = [];

  if (resources.timers > MemoryThresholds.MAX_TIMERS) {
    issues.push(`Too many active timers: ${resources.timers}`);
  }

  if (resources.intervals > 0) {
    issues.push(`Active intervals not cleared: ${resources.intervals}`);
  }

  if (resources.eventListeners > MemoryThresholds.MAX_EVENT_LISTENERS) {
    issues.push(`Too many event listeners: ${resources.eventListeners}`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Gets the current state of ContentManager for assertions
 */
export function getContentManagerState(contentManager: ContentManager): {
  isDestroyed: boolean;
  isReconnecting: boolean;
  isInRecovery: boolean;
  reconnectAttempts: number;
  hasPort: boolean;
  hasMessageHandler: boolean;
  hasUIManager: boolean;
} {
  const manager = contentManager as unknown as {
    isDestroyed?: boolean;
    isReconnecting?: boolean;
    isInRecovery?: boolean;
    reconnectAttempts?: number;
    port?: unknown;
    messageHandler?: unknown;
    uiManager?: unknown;
  };

  return {
    isDestroyed: manager.isDestroyed || false,
    isReconnecting: manager.isReconnecting || false,
    isInRecovery: manager.isInRecovery || false,
    reconnectAttempts: manager.reconnectAttempts || 0,
    hasPort: !!manager.port,
    hasMessageHandler: !!manager.messageHandler,
    hasUIManager: !!manager.uiManager,
  };
}

/**
 * Simulates user actions like keyboard shortcuts
 */
export function simulateUserAction(action: 'debug_notifications' | 'debug_recovery'): void {
  const event = new KeyboardEvent('keydown', {
    ctrlKey: true,
    shiftKey: true,
    key: action === 'debug_notifications' ? 'D' : 'R',
    bubbles: true,
    cancelable: true,
  });

  window.dispatchEvent(event);
}

/**
 * Creates a spy on ContentManager methods for testing
 */
export function spyOnContentManager(
  contentManager: ContentManager,
  methodName: string
): jest.SpyInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jest.spyOn(contentManager as any, methodName);
}

/**
 * Validates message flow between components
 */
export function validateMessageFlow(
  env: TestEnvironment,
  expectedMessages: Array<{ type: string; data?: unknown }>
): boolean {
  if (!env.mockMessageHandler) return false;

  const sentMessages = env.mockMessageHandler.getSentMessages();

  if (sentMessages.length !== expectedMessages.length) return false;

  return expectedMessages.every((expected, index) => {
    const sent = sentMessages[index];
    return (
      sent.type === expected.type && JSON.stringify(sent.data) === JSON.stringify(expected.data)
    );
  });
}

/**
 * Monitors performance metrics during test execution
 */
export class PerformanceMonitor {
  private startTime = 0;
  private metrics: Map<string, number> = new Map();

  start(): void {
    this.startTime = performance.now();
  }

  mark(name: string): void {
    this.metrics.set(name, performance.now() - this.startTime);
  }

  getMetrics(): Record<string, number> {
    const result: Record<string, number> = {};
    this.metrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
