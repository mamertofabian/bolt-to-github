/**
 * Chrome Extension API Mocks for Vitest Tests
 *
 * This file provides mock implementations of Chrome Extension APIs
 * that are needed for testing extension functionality.
 */

import { vi } from 'vitest';

global.chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onConnect: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn(),
    getURL: vi.fn((path) => `chrome-extension://test/${path}`),
    getManifest: vi.fn(() => ({ version: '1.0.0', name: 'Test Extension' })),
    lastError: null,
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    getCurrent: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onActivated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    setTitle: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
    insertCSS: vi.fn(),
    removeCSS: vi.fn(),
  },
  permissions: {
    request: vi.fn().mockResolvedValue(true),
    contains: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    clearAll: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

// Mock chrome.runtime.sendMessage to return a Promise
global.chrome.runtime.sendMessage = vi.fn().mockImplementation((message, callback) => {
  if (callback) {
    // Callback style
    setTimeout(() => callback({}), 0);
  } else {
    // Promise style
    return Promise.resolve({});
  }
});

// Mock chrome.tabs.sendMessage similar to runtime.sendMessage
global.chrome.tabs.sendMessage = vi.fn().mockImplementation((tabId, message, callback) => {
  if (callback) {
    setTimeout(() => callback({}), 0);
  } else {
    return Promise.resolve({});
  }
});
