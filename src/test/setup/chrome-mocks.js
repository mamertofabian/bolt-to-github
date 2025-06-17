/**
 * Chrome Extension API Mocks for Jest Tests
 *
 * This file provides mock implementations of Chrome Extension APIs
 * that are needed for testing extension functionality.
 */

/* eslint-env jest */

global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onStartup: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onConnect: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    sendMessage: jest.fn(),
    getURL: jest.fn((path) => `chrome-extension://test/${path}`),
    getManifest: jest.fn(() => ({ version: '1.0.0', name: 'Test Extension' })),
    lastError: null,
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    getCurrent: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onActivated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    setTitle: jest.fn(),
  },
  scripting: {
    executeScript: jest.fn(),
    insertCSS: jest.fn(),
    removeCSS: jest.fn(),
  },
  permissions: {
    request: jest.fn().mockResolvedValue(true),
    contains: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    clearAll: jest.fn(),
    get: jest.fn(),
    getAll: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
};

// Mock chrome.runtime.sendMessage to return a Promise
global.chrome.runtime.sendMessage = jest.fn().mockImplementation((message, callback) => {
  if (callback) {
    // Callback style
    setTimeout(() => callback({}), 0);
  } else {
    // Promise style
    return Promise.resolve({});
  }
});

// Mock chrome.tabs.sendMessage similar to runtime.sendMessage
global.chrome.tabs.sendMessage = jest.fn().mockImplementation((tabId, message, callback) => {
  if (callback) {
    setTimeout(() => callback({}), 0);
  } else {
    return Promise.resolve({});
  }
});

// Mock chrome.alarms API
global.chrome.alarms = {
  create: jest.fn(),
  clear: jest.fn(),
  onAlarm: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
};
