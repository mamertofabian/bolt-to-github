/**
 * Chrome API mock helpers for App.svelte tests
 *
 * This module provides enhanced Chrome API mocks specifically tailored
 * for testing App.svelte functionality.
 */

import { vi } from 'vitest';

/**
 * Create a complete Chrome API mock for App.svelte tests
 */
export function createAppChromeMocks() {
  const storageLocal = new Map<string, unknown>();
  const storageSync = new Map<string, unknown>();
  const runtimeListeners = new Set<(message: unknown) => void>();

  return {
    runtime: {
      onMessage: {
        addListener: vi.fn((callback: (message: unknown) => void) => {
          runtimeListeners.add(callback);
        }),
        removeListener: vi.fn((callback: (message: unknown) => void) => {
          runtimeListeners.delete(callback);
        }),
        // Helper to trigger messages
        trigger: (message: unknown) => {
          runtimeListeners.forEach((cb) => cb(message));
        },
      },
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
    storage: {
      local: {
        get: vi.fn((keys: string | string[] | Record<string, unknown>) => {
          if (typeof keys === 'string') {
            return Promise.resolve({ [keys]: storageLocal.get(keys) });
          } else if (Array.isArray(keys)) {
            const result: Record<string, unknown> = {};
            keys.forEach((key) => {
              const value = storageLocal.get(key);
              if (value !== undefined) result[key] = value;
            });
            return Promise.resolve(result);
          } else {
            const result: Record<string, unknown> = {};
            Object.keys(keys).forEach((key) => {
              const value = storageLocal.get(key);
              result[key] = value !== undefined ? value : keys[key];
            });
            return Promise.resolve(result);
          }
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.entries(items).forEach(([key, value]) => {
            storageLocal.set(key, value);
          });
          return Promise.resolve();
        }),
        remove: vi.fn((keys: string | string[]) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach((key) => storageLocal.delete(key));
          return Promise.resolve();
        }),
        clear: vi.fn(() => {
          storageLocal.clear();
          return Promise.resolve();
        }),
      },
      sync: {
        get: vi.fn((keys: string | string[] | Record<string, unknown>) => {
          if (typeof keys === 'string') {
            return Promise.resolve({ [keys]: storageSync.get(keys) });
          } else if (Array.isArray(keys)) {
            const result: Record<string, unknown> = {};
            keys.forEach((key) => {
              const value = storageSync.get(key);
              if (value !== undefined) result[key] = value;
            });
            return Promise.resolve(result);
          } else {
            const result: Record<string, unknown> = {};
            Object.keys(keys).forEach((key) => {
              const value = storageSync.get(key);
              result[key] = value !== undefined ? value : keys[key];
            });
            return Promise.resolve(result);
          }
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.entries(items).forEach(([key, value]) => {
            storageSync.set(key, value);
          });
          return Promise.resolve();
        }),
        remove: vi.fn((keys: string | string[]) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach((key) => storageSync.delete(key));
          return Promise.resolve();
        }),
      },
    },
    tabs: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    // Helpers to manipulate storage in tests
    _setLocalStorage: (key: string, value: unknown) => storageLocal.set(key, value),
    _setSyncStorage: (key: string, value: unknown) => storageSync.set(key, value),
    _getLocalStorage: (key: string) => storageLocal.get(key),
    _getSyncStorage: (key: string) => storageSync.get(key),
    _clearLocalStorage: () => storageLocal.clear(),
    _clearSyncStorage: () => storageSync.clear(),
    _triggerRuntimeMessage: (message: unknown) => {
      runtimeListeners.forEach((cb) => cb(message));
    },
  };
}

/**
 * Mock ChromeMessagingService for App.svelte tests
 */
export function createMockChromeMessagingService() {
  const portMessageHandlers = new Set<(message: unknown) => void>();

  return {
    addPortMessageHandler: vi.fn((handler: (message: unknown) => void) => {
      portMessageHandlers.add(handler);
    }),
    removePortMessageHandler: vi.fn((handler: (message: unknown) => void) => {
      portMessageHandlers.delete(handler);
    }),
    sendDeleteTempRepoMessage: vi.fn(),
    cleanup: vi.fn(),
    // Helper to trigger port messages
    _triggerPortMessage: (message: unknown) => {
      portMessageHandlers.forEach((handler) => handler(message));
    },
  };
}

/**
 * Mock SubscriptionService for App.svelte tests
 */
export function createMockSubscriptionService() {
  return {
    getSubscriptionStatus: vi.fn().mockResolvedValue({ subscribed: false }),
    incrementInteractionCount: vi.fn().mockResolvedValue(undefined),
    shouldShowSubscriptionPrompt: vi.fn().mockResolvedValue(false),
    updateLastPromptDate: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Setup window mocks for App.svelte
 */
export function setupWindowMocks() {
  const eventListeners = new Map<string, Set<EventListener>>();

  const windowMock = {
    addEventListener: vi.fn((event: string, callback: EventListener) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
      }
      eventListeners.get(event)!.add(callback);
    }),
    removeEventListener: vi.fn((event: string, callback: EventListener) => {
      eventListeners.get(event)?.delete(callback);
    }),
    close: vi.fn(),
    // Helper to trigger events
    _triggerEvent: (event: string, detail?: unknown) => {
      const customEvent = new CustomEvent(event, { detail });
      eventListeners.get(event)?.forEach((callback) => callback(customEvent));
    },
    _getEventListeners: (event: string) => eventListeners.get(event) || new Set(),
  };

  return windowMock;
}

/**
 * Mock document for App.svelte tests
 */
export function createDocumentMock() {
  const documentElement = {
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      contains: vi.fn().mockReturnValue(false),
      toggle: vi.fn(),
    },
  };

  return {
    documentElement,
  };
}
