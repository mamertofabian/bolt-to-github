/**
 * ContentManagerTestFixtures
 *
 * Provides realistic test data and scenarios for ContentManager testing.
 * Covers normal operations, edge cases, and error conditions.
 */

import type { Message, UploadStatusState } from '$lib/types';

// Chrome runtime error messages that indicate different failure modes
export const ChromeRuntimeErrors = {
  CONTEXT_INVALIDATED: 'Extension context invalidated',
  CONTEXT_WAS_INVALIDATED: 'Extension context was invalidated',
  INVALID_EXTENSION: 'chrome-extension://invalid/',
  NETWORK_ERROR: 'net::ERR_FAILED',
  CONNECTION_FAILED: 'Could not establish connection',
  RECEIVING_END_MISSING: 'Receiving end does not exist',
  PORT_CLOSED: 'The message port closed before a response was received',
  NO_ERROR: null,
} as const;

// Test URLs for different scenarios
export const TestUrls = {
  BOLT_NEW_PROJECT: 'https://bolt.new/project/abc123',
  BOLT_NEW_HOME: 'https://bolt.new/',
  NON_BOLT_SITE: 'https://github.com/',
  BOLT_NEW_WITH_PARAMS: 'https://bolt.new/project/xyz789?tab=code',
  BOLT_NEW_DIFFERENT_PROJECT: 'https://bolt.new/project/def456',
} as const;

// Test project IDs
export const TestProjectIds = {
  PROJECT_A: 'abc123',
  PROJECT_B: 'xyz789',
  PROJECT_C: 'def456',
  EMPTY: '',
} as const;

// Test messages for various scenarios
export const TestMessages: Record<string, Message> = {
  HEARTBEAT: {
    type: 'HEARTBEAT',
  },
  HEARTBEAT_RESPONSE: {
    type: 'HEARTBEAT_RESPONSE',
  },
  CONTENT_SCRIPT_READY: {
    type: 'CONTENT_SCRIPT_READY',
  },
  UPLOAD_STATUS_UPLOADING: {
    type: 'UPLOAD_STATUS',
    status: {
      status: 'uploading',
      progress: 50,
      message: 'Uploading files to GitHub...',
    } as UploadStatusState,
  },
  UPLOAD_STATUS_SUCCESS: {
    type: 'UPLOAD_STATUS',
    status: {
      status: 'success',
      progress: 100,
      message: 'Successfully uploaded to GitHub!',
    } as UploadStatusState,
  },
  UPLOAD_STATUS_ERROR: {
    type: 'UPLOAD_STATUS',
    status: {
      status: 'error',
      message: 'Failed to upload: Network error',
    } as UploadStatusState,
  },
  GITHUB_SETTINGS_VALID: {
    type: 'GITHUB_SETTINGS_CHANGED',
    data: { isValid: true },
  },
  GITHUB_SETTINGS_INVALID: {
    type: 'GITHUB_SETTINGS_CHANGED',
    data: { isValid: false },
  },
  PUSH_TO_GITHUB: {
    type: 'PUSH_TO_GITHUB',
  },
  ZIP_DATA: {
    type: 'ZIP_DATA',
    data: {
      data: 'base64encodeddata',
      projectId: 'abc123',
    },
  },
};

// Storage data scenarios
export const TestStorageData = {
  EMPTY: {},
  STALE_FILE_CHANGES: {
    storedFileChanges: {
      url: TestUrls.BOLT_NEW_PROJECT,
      projectId: TestProjectIds.PROJECT_A,
      files: ['file1.js', 'file2.ts'],
      timestamp: Date.now() - 3600000, // 1 hour ago
    },
  },
  DIFFERENT_PROJECT_CHANGES: {
    storedFileChanges: {
      url: TestUrls.BOLT_NEW_DIFFERENT_PROJECT,
      projectId: TestProjectIds.PROJECT_C,
      files: ['main.py', 'config.json'],
      timestamp: Date.now(),
    },
  },
  PREMIUM_STATUS: {
    premiumStatus: {
      isPremium: true,
      expiresAt: Date.now() + 86400000, // 1 day from now
    },
  },
  PUSH_REMINDER_SETTINGS: {
    pushReminderSettings: {
      enabled: true,
      interval: 300000, // 5 minutes
      lastReminder: Date.now() - 600000, // 10 minutes ago
    },
  },
};

// Port state scenarios
export interface MockPortState {
  name: string;
  connected: boolean;
  disconnectError?: chrome.runtime.LastError | null;
  willDisconnectAfter?: number; // milliseconds
  messageQueue?: Message[];
}

export const TestPortStates: Record<string, MockPortState> = {
  CONNECTED: {
    name: 'bolt-content',
    connected: true,
  },
  DISCONNECTED_NORMAL: {
    name: 'bolt-content',
    connected: false,
    disconnectError: null,
  },
  DISCONNECTED_CONTEXT_INVALIDATED: {
    name: 'bolt-content',
    connected: false,
    disconnectError: { message: ChromeRuntimeErrors.CONTEXT_INVALIDATED },
  },
  DISCONNECTED_SERVICE_WORKER: {
    name: 'bolt-content',
    connected: false,
    disconnectError: { message: ChromeRuntimeErrors.CONNECTION_FAILED },
  },
  WILL_DISCONNECT_SOON: {
    name: 'bolt-content',
    connected: true,
    willDisconnectAfter: 1000, // Disconnect after 1 second
  },
  WITH_QUEUED_MESSAGES: {
    name: 'bolt-content',
    connected: true,
    messageQueue: [TestMessages.UPLOAD_STATUS_UPLOADING, TestMessages.GITHUB_SETTINGS_VALID],
  },
};

// Timing configurations for different test scenarios
export const TestTimings = {
  IMMEDIATE: 0,
  FAST_DISCONNECT: 100,
  NORMAL_DISCONNECT: 1000,
  RECONNECT_DELAY: 1000,
  HEARTBEAT_INTERVAL: 30000,
  RECOVERY_TIMEOUT: 30000,
  QUICK_SUCCESSIVE_THRESHOLD: 3000,
  MAX_TEST_DURATION: 60000,
} as const;

// Memory leak detection thresholds
export const MemoryThresholds = {
  MAX_TIMERS: 10,
  MAX_EVENT_LISTENERS: 20,
  MAX_MESSAGE_QUEUE_SIZE: 100,
  MAX_RECONNECT_ATTEMPTS: 5,
} as const;

// UI notification scenarios
export const TestNotifications = {
  EXTENSION_RELOAD: {
    type: 'info' as const,
    message:
      'Bolt to GitHub extension has been updated or reloaded. Please refresh the page to continue.',
    duration: 10000,
  },
  CONNECTION_ERROR: {
    type: 'error' as const,
    message:
      'There was an error connecting to the Bolt to GitHub extension. Please refresh the page or reinstall the extension.',
    duration: 10000,
  },
  CONTEXT_INVALIDATION: {
    type: 'warning' as const,
    message:
      'Extension connection lost. Please manually refresh the page when convenient to restore GitHub features.',
    duration: null, // No auto-dismiss
  },
};

// DOM elements for testing
export const TestDOMElements = {
  NOTIFICATION_CONTAINER_ID: 'bolt-to-github-notification-container',
  UPLOAD_STATUS_CONTAINER_ID: 'bolt-to-github-upload-status-container',
  CONTEXT_INVALIDATION_NOTICE_ID: 'bolt-github-context-invalidation-notice',
  GITHUB_BUTTON_SELECTOR: '[data-bolt-github-button]',
  DROPDOWN_CONTAINER_SELECTOR: '[data-bolt-github-dropdown]',
};

// Event listener tracking for memory leak detection
export interface EventListenerTracker {
  target: EventTarget;
  type: string;
  listener: EventListener;
  options?: boolean | AddEventListenerOptions;
}

// Timer tracking for cleanup validation
export interface TimerTracker {
  id: NodeJS.Timeout | number;
  type: 'timeout' | 'interval';
  callback: (...args: unknown[]) => void;
  delay: number;
  createdAt: number;
}
