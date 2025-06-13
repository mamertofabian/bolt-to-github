/**
 * Comprehensive test fixtures for BackgroundService.ts
 *
 * This file provides realistic test data, mock implementations, and helper functions
 * designed to reveal actual usage patterns and potential bugs in BackgroundService.
 */

import type {
  Message,
  MessageType,
  Port,
  UploadStatusState,
  GitHubSettingsInterface,
} from '../../lib/types';

// =============================================================================
// REALISTIC TEST DATA
// =============================================================================

export const TestData = {
  // Authentication configurations
  auth: {
    validPATSettings: {
      gitHubSettings: {
        githubToken: 'ghp_1234567890abcdef1234567890abcdef12345678',
        repoOwner: 'testuser',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat' as const,
      },
    },
    validGitHubAppSettings: {
      gitHubSettings: {
        githubToken: '',
        repoOwner: 'testuser',
        authenticationMethod: 'github_app' as const,
        githubAppInstallationId: 12345678,
        githubAppUsername: 'testuser',
        githubAppAvatarUrl: 'https://github.com/testuser.png',
      },
    },
    invalidSettings: {
      gitHubSettings: {
        githubToken: '',
        repoOwner: '',
        authenticationMethod: 'pat' as const,
      },
    },
    corruptedSettings: null,
  },

  // Project configurations
  projects: {
    validProjectId: 'bolt-project-abc123def456',
    emptyProjectId: '',
    invalidProjectId: 'invalid-project-id!@#$%',
    longProjectId: 'a'.repeat(255),
  },

  // ZIP file data (base64 encoded realistic ZIP)
  zipFiles: {
    // Small valid ZIP with a few files
    smallValidZip:
      'UEsDBAoAAAAAAKtOF1YAAAAAAAAAAAAAAAAADQAAAHNyYy9pbmRleC5qcwpmdW5jdGlvbiBoZWxsbygpIHsKICAgIGNvbnNvbGUubG9nKCdIZWxsbyBXb3JsZCEnKTsKfQoKZXhwb3J0IGRlZmF1bHQgaGVsbG87UEsHCAAAAAAA',
    // Large ZIP (simulated 10MB+)
    largeZip: Buffer.from('a'.repeat(10 * 1024 * 1024)).toString('base64'),
    // Corrupted ZIP data
    corruptedZip: 'invalid-base64-data-!@#$%^&*()',
    // Empty ZIP
    emptyZip: '',
    // Malformed base64
    malformedBase64: 'SGVsbG8gV29ybGQ=InvalidBase64',
  },

  // Commit messages
  commitMessages: {
    default: 'Commit from Bolt to GitHub',
    custom: 'feat: add new authentication system',
    empty: '',
    veryLong: 'a'.repeat(500),
    withSpecialChars: 'fix: resolve issue with "quotes" and \'apostrophes\' & symbols',
    multiline: 'feat: major update\n\n- Added new features\n- Fixed bugs\n- Updated documentation',
  },

  // Chrome extension contexts
  chrome: {
    manifest: {
      version: '1.3.2',
      name: 'Bolt to GitHub',
    },
    storageData: {
      fresh: {},
      withInstallDate: {
        installDate: Date.now() - 86400000, // 1 day ago
        lastVersion: '1.3.1',
      },
      withAnalytics: {
        analyticsClientId: '12345678-1234-4567-8901-123456789012',
        analyticsEnabled: true,
      },
      withDisabledAnalytics: {
        analyticsClientId: '12345678-1234-4567-8901-123456789012',
        analyticsEnabled: false,
      },
    },
    tabs: {
      boltTab: {
        id: 123,
        url: 'https://bolt.new/~/bolt-project-abc123def456',
        active: true,
      },
      nonBoltTab: {
        id: 456,
        url: 'https://example.com',
        active: false,
      },
    },
  },

  // Error scenarios
  errors: {
    networkTimeout: new Error('Network request timed out'),
    githubApiError: new Error('GitHub API Error: Rate limit exceeded'),
    authenticationError: new Error('GitHub authentication failed'),
    zipProcessingError: new Error('Failed to process ZIP file'),
    storageError: new Error('Chrome storage unavailable'),
    contextInvalidated: new Error('Extension context invalidated'),
  },

  // Performance scenarios
  performance: {
    highLatency: 5000, // 5 second delay
    normalLatency: 100, // 100ms delay
    veryHighLatency: 30000, // 30 second delay (timeout scenario)
  },
};

// =============================================================================
// MESSAGE FIXTURES
// =============================================================================

export const MessageFixtures = {
  // Valid messages
  zipDataMessage: (projectId: string = TestData.projects.validProjectId): Message => ({
    type: 'ZIP_DATA',
    data: {
      data: TestData.zipFiles.smallValidZip,
      projectId,
    },
  }),

  heartbeatMessage: (): Message => ({
    type: 'HEARTBEAT',
  }),

  setCommitMessage: (message: string = TestData.commitMessages.custom): Message => ({
    type: 'SET_COMMIT_MESSAGE',
    data: { message },
  }),

  openSettingsMessage: (): Message => ({
    type: 'OPEN_SETTINGS',
  }),

  importPrivateRepo: (repoName: string = 'private-repo', branch: string = 'main'): Message => ({
    type: 'IMPORT_PRIVATE_REPO',
    data: { repoName, branch },
  }),

  // Edge case messages
  zipDataWithoutProjectId: (): Message => ({
    type: 'ZIP_DATA',
    data: TestData.zipFiles.smallValidZip, // Old format without projectId
  }),

  malformedZipData: (): Message => ({
    type: 'ZIP_DATA',
    data: {
      data: TestData.zipFiles.corruptedZip,
      projectId: TestData.projects.validProjectId,
    },
  }),

  // Runtime messages
  runtimeMessages: {
    pushToGithub: { action: 'PUSH_TO_GITHUB' },
    checkPremiumFeature: { type: 'CHECK_PREMIUM_FEATURE', feature: 'pushReminders' },
    analyticsEvent: {
      type: 'ANALYTICS_EVENT',
      eventType: 'user_action',
      eventData: { action: 'test_action' },
    },
    forceAuthCheck: { type: 'FORCE_AUTH_CHECK' },
    userLogout: { type: 'USER_LOGOUT' },
  },
};

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

export class MockPort implements Port {
  public name: string;
  public sender?: chrome.runtime.MessageSender;
  public onDisconnect: chrome.events.Event<(port: chrome.runtime.Port) => void>;
  public onMessage: chrome.events.Event<(message: any, port: chrome.runtime.Port) => void>;

  private connected = true;
  private messageHandlers: Array<(message: any, port: chrome.runtime.Port) => void> = [];
  private disconnectHandlers: Array<(port: chrome.runtime.Port) => void> = [];

  constructor(name: string, tabId?: number) {
    this.name = name;
    this.sender = tabId
      ? {
          tab: {
            id: tabId,
            index: 0,
            pinned: false,
            highlighted: false,
            windowId: 1,
            active: true,
            incognito: false,
            selected: false,
            discarded: false,
            autoDiscardable: true,
            groupId: -1,
          } as chrome.tabs.Tab,
        }
      : undefined;

    this.onMessage = {
      addListener: (callback: (message: any, port: chrome.runtime.Port) => void) =>
        this.messageHandlers.push(callback),
      removeListener: (callback: (message: any, port: chrome.runtime.Port) => void) => {
        const index = this.messageHandlers.indexOf(callback);
        if (index > -1) this.messageHandlers.splice(index, 1);
      },
      hasListener: (callback: (message: any, port: chrome.runtime.Port) => void) =>
        this.messageHandlers.includes(callback),
      hasListeners: () => this.messageHandlers.length > 0,
    } as any;

    this.onDisconnect = {
      addListener: (callback: (port: chrome.runtime.Port) => void) =>
        this.disconnectHandlers.push(callback),
      removeListener: (callback: (port: chrome.runtime.Port) => void) => {
        const index = this.disconnectHandlers.indexOf(callback);
        if (index > -1) this.disconnectHandlers.splice(index, 1);
      },
      hasListener: (callback: (port: chrome.runtime.Port) => void) =>
        this.disconnectHandlers.includes(callback),
      hasListeners: () => this.disconnectHandlers.length > 0,
    } as any;
  }

  postMessage(message: any): void {
    if (!this.connected) {
      throw new Error('Port is disconnected');
    }
    // Simulate message delivery
  }

  disconnect(): void {
    this.connected = false;
    this.disconnectHandlers.forEach((handler) => handler(this));
  }

  simulateMessage(message: any): void {
    if (this.connected) {
      this.messageHandlers.forEach((handler) => handler(message, this));
    }
  }
}

export class MockChromeRuntime {
  private messageHandlers: Array<(message: any, sender: any, sendResponse: any) => boolean | void> =
    [];
  private connectHandlers: Array<(port: chrome.runtime.Port) => void> = [];
  private startupHandlers: Array<() => void> = [];
  private installedHandlers: Array<(details: any) => void> = [];

  onMessage = {
    addListener: (callback: any) => this.messageHandlers.push(callback),
    removeListener: (callback: any) => {
      const index = this.messageHandlers.indexOf(callback);
      if (index > -1) this.messageHandlers.splice(index, 1);
    },
  };

  onConnect = {
    addListener: (callback: any) => this.connectHandlers.push(callback),
    removeListener: (callback: any) => {
      const index = this.connectHandlers.indexOf(callback);
      if (index > -1) this.connectHandlers.splice(index, 1);
    },
  };

  onStartup = {
    addListener: (callback: any) => this.startupHandlers.push(callback),
    removeListener: (callback: any) => {
      const index = this.startupHandlers.indexOf(callback);
      if (index > -1) this.startupHandlers.splice(index, 1);
    },
  };

  onInstalled = {
    addListener: (callback: any) => this.installedHandlers.push(callback),
    removeListener: (callback: any) => {
      const index = this.installedHandlers.indexOf(callback);
      if (index > -1) this.installedHandlers.splice(index, 1);
    },
  };

  getManifest = jest.fn(() => TestData.chrome.manifest);
  sendMessage = jest.fn();

  simulateMessage(message: any, sender: any = {}, sendResponse: any = jest.fn()): void {
    this.messageHandlers.forEach((handler) => handler(message, sender, sendResponse));
  }

  simulateConnection(port: MockPort): void {
    this.connectHandlers.forEach((handler) => handler(port));
  }

  simulateStartup(): void {
    this.startupHandlers.forEach((handler) => handler());
  }

  simulateInstalled(details: any = {}): void {
    this.installedHandlers.forEach((handler) => handler(details));
  }
}

export class MockChromeStorage {
  private localData: Record<string, any> = {};
  private syncData: Record<string, any> = {};
  private changeHandlers: Array<(changes: any, namespace: string) => void> = [];

  local = {
    get: jest.fn(async (keys?: string | string[] | null) => {
      if (!keys) return { ...this.localData };
      if (typeof keys === 'string') return { [keys]: this.localData[keys] };
      if (Array.isArray(keys)) {
        const result: Record<string, any> = {};
        keys.forEach((key) => {
          if (key in this.localData) result[key] = this.localData[key];
        });
        return result;
      }
      return {};
    }),
    set: jest.fn(async (items: Record<string, any>) => {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      Object.entries(items).forEach(([key, newValue]) => {
        const oldValue = this.localData[key];
        this.localData[key] = newValue;
        changes[key] = { oldValue, newValue };
      });
      this.triggerChange(changes, 'local');
    }),
  };

  sync = {
    get: jest.fn(async (keys?: string | string[] | null) => {
      if (!keys) return { ...this.syncData };
      if (typeof keys === 'string') return { [keys]: this.syncData[keys] };
      if (Array.isArray(keys)) {
        const result: Record<string, any> = {};
        keys.forEach((key) => {
          if (key in this.syncData) result[key] = this.syncData[key];
        });
        return result;
      }
      return {};
    }),
    set: jest.fn(async (items: Record<string, any>) => {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      Object.entries(items).forEach(([key, newValue]) => {
        const oldValue = this.syncData[key];
        this.syncData[key] = newValue;
        changes[key] = { oldValue, newValue };
      });
      this.triggerChange(changes, 'sync');
    }),
  };

  onChanged = {
    addListener: (callback: any) => this.changeHandlers.push(callback),
    removeListener: (callback: any) => {
      const index = this.changeHandlers.indexOf(callback);
      if (index > -1) this.changeHandlers.splice(index, 1);
    },
  };

  private triggerChange(
    changes: Record<string, chrome.storage.StorageChange>,
    namespace: string
  ): void {
    this.changeHandlers.forEach((handler) => handler(changes, namespace));
  }

  // Test helpers
  setLocalData(data: Record<string, any>): void {
    this.localData = { ...data };
  }

  setSyncData(data: Record<string, any>): void {
    this.syncData = { ...data };
  }

  reset(): void {
    this.localData = {};
    this.syncData = {};
  }
}

export class MockChromeTabs {
  private tabs: chrome.tabs.Tab[] = [];
  private updateHandlers: Array<(tabId: number, changeInfo: any, tab: chrome.tabs.Tab) => void> =
    [];
  private removeHandlers: Array<(tabId: number, removeInfo: any) => void> = [];

  query = jest.fn(async (queryInfo: chrome.tabs.QueryInfo) => {
    return this.tabs.filter((tab) => {
      if (queryInfo.active !== undefined && tab.active !== queryInfo.active) return false;
      if (queryInfo.url) {
        const urlPattern = Array.isArray(queryInfo.url) ? queryInfo.url[0] : queryInfo.url;
        if (!tab.url?.includes(urlPattern.replace('*', ''))) return false;
      }
      return true;
    });
  });

  sendMessage = jest.fn();

  onUpdated = {
    addListener: (callback: any) => this.updateHandlers.push(callback),
    removeListener: (callback: any) => {
      const index = this.updateHandlers.indexOf(callback);
      if (index > -1) this.updateHandlers.splice(index, 1);
    },
  };

  onRemoved = {
    addListener: (callback: any) => this.removeHandlers.push(callback),
    removeListener: (callback: any) => {
      const index = this.removeHandlers.indexOf(callback);
      if (index > -1) this.removeHandlers.splice(index, 1);
    },
  };

  // Test helpers
  setTabs(tabs: chrome.tabs.Tab[]): void {
    this.tabs = tabs;
  }

  simulateTabUpdate(tabId: number, changeInfo: any, tab: chrome.tabs.Tab): void {
    this.updateHandlers.forEach((handler) => handler(tabId, changeInfo, tab));
  }

  simulateTabRemoved(tabId: number): void {
    this.removeHandlers.forEach((handler) => handler(tabId, {}));
  }
}

// =============================================================================
// TEST ENVIRONMENT SETUP
// =============================================================================

export class BackgroundServiceTestEnvironment {
  public mockChrome: {
    runtime: MockChromeRuntime;
    storage: MockChromeStorage;
    tabs: MockChromeTabs;
    action: any;
    alarms: any;
  };

  private originalChrome: any;
  private originalFetch: any;

  constructor() {
    this.mockChrome = {
      runtime: new MockChromeRuntime(),
      storage: new MockChromeStorage(),
      tabs: new MockChromeTabs(),
      action: {
        openPopup: jest.fn(),
      },
      alarms: {
        create: jest.fn(),
        clear: jest.fn(),
        onAlarm: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
      },
    };
  }

  setup(): void {
    // Store original implementations
    this.originalChrome = (global as any).chrome;
    this.originalFetch = global.fetch;

    // Mock Chrome APIs
    (global as any).chrome = this.mockChrome;

    // Mock fetch for analytics
    global.fetch = jest.fn();

    // Mock crypto for client ID generation
    (global as any).crypto = {
      randomUUID: jest.fn(() => '12345678-1234-4567-8901-123456789012'),
    };
  }

  teardown(): void {
    // Restore original implementations
    (global as any).chrome = this.originalChrome;
    global.fetch = this.originalFetch;
    delete (global as any).crypto;

    // Reset all mocks
    jest.clearAllMocks();
    this.mockChrome.storage.reset();
  }

  // Helper methods for test scenarios
  setupValidPATAuth(): void {
    this.mockChrome.storage.setSyncData(TestData.auth.validPATSettings);
    this.mockChrome.storage.setLocalData({ authenticationMethod: 'pat' });
  }

  setupValidGitHubAppAuth(): void {
    this.mockChrome.storage.setSyncData(TestData.auth.validGitHubAppSettings);
    this.mockChrome.storage.setLocalData({ authenticationMethod: 'github_app' });
  }

  setupInvalidAuth(): void {
    this.mockChrome.storage.setSyncData(TestData.auth.invalidSettings);
  }

  setupNetworkFailure(): void {
    (global.fetch as jest.Mock).mockRejectedValue(TestData.errors.networkTimeout);
  }

  setupSlowNetwork(delay: number = TestData.performance.highLatency): void {
    (global.fetch as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), delay))
    );
  }

  simulatePortConnection(name: string, tabId?: number): MockPort {
    const port = new MockPort(name, tabId);
    this.mockChrome.runtime.simulateConnection(port);
    return port;
  }

  simulateTabNavigation(tabId: number, url: string): void {
    const tab: chrome.tabs.Tab = {
      id: tabId,
      url,
      active: true,
      highlighted: false,
      pinned: false,
      selected: false,
      incognito: false,
      width: 1200,
      height: 800,
      index: 0,
      windowId: 1,
      discarded: false,
      autoDiscardable: false,
      groupId: -1,
    };

    this.mockChrome.tabs.simulateTabUpdate(tabId, { url }, tab);
  }
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

export const AssertionHelpers = {
  expectAnalyticsEvent(eventName: string, params?: any): void {
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('google-analytics.com'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(eventName),
      })
    );

    if (params) {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(JSON.stringify(params)),
        })
      );
    }
  },

  expectPortMessage(port: MockPort, messageType: MessageType): void {
    // This would be implemented based on your mocking strategy
    // You might want to track sent messages in MockPort
  },

  expectStorageWrite(storage: MockChromeStorage, key: string, value: any): void {
    expect(storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ [key]: value }));
  },
};

// =============================================================================
// SCENARIO BUILDERS
// =============================================================================

export const ScenarioBuilder = {
  // Fresh extension install
  freshInstall(env: BackgroundServiceTestEnvironment): void {
    env.mockChrome.storage.setLocalData({});
    env.mockChrome.storage.setSyncData({});
  },

  // Extension update scenario
  updateFromPreviousVersion(
    env: BackgroundServiceTestEnvironment,
    fromVersion: string = '1.3.1'
  ): void {
    env.mockChrome.storage.setLocalData({
      installDate: Date.now() - 86400000, // 1 day ago
      lastVersion: fromVersion,
      analyticsClientId: '12345678-1234-4567-8901-123456789012',
    });
  },

  // Multiple active bolt.new tabs
  multipleBoltTabs(env: BackgroundServiceTestEnvironment): MockPort[] {
    const ports = [
      env.simulatePortConnection('bolt-content', 123),
      env.simulatePortConnection('bolt-content', 456),
      env.simulatePortConnection('bolt-content', 789),
    ];

    const createFullTab = (baseTab: any, overrides: any): chrome.tabs.Tab => ({
      ...baseTab,
      index: 0,
      pinned: false,
      highlighted: false,
      windowId: 1,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
      ...overrides,
    });

    env.mockChrome.tabs.setTabs([
      createFullTab(TestData.chrome.tabs.boltTab, { id: 123 }),
      createFullTab(TestData.chrome.tabs.boltTab, { id: 456, url: 'https://bolt.new/~/project-2' }),
      createFullTab(TestData.chrome.tabs.boltTab, { id: 789, url: 'https://bolt.new/~/project-3' }),
    ]);

    return ports;
  },

  // High-stress scenario with many concurrent operations
  highStressScenario(env: BackgroundServiceTestEnvironment): void {
    // Multiple connections
    for (let i = 0; i < 10; i++) {
      env.simulatePortConnection('bolt-content', 100 + i);
    }

    // Rapid storage changes
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        env.mockChrome.storage.local.set({ [`rapid_change_${i}`]: Date.now() });
      }, i * 10);
    }
  },
};
