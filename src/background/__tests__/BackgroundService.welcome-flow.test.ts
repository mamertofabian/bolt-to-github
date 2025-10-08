import { type Mock, vi } from 'vitest';
import { BackgroundService } from '../BackgroundService';

vi.mock('../../services/UnifiedGitHubService');
vi.mock('../StateManager', () => ({
  StateManager: {
    getInstance: vi.fn(() => ({
      getGitHubSettings: vi.fn().mockResolvedValue({ gitHubSettings: {} }),
    })),
  },
}));
vi.mock('../../services/zipHandler');
vi.mock('../TempRepoManager');
vi.mock('../UsageTracker', () => ({
  UsageTracker: vi.fn(() => ({
    initializeUsageData: vi.fn().mockResolvedValue(undefined),
    updateUsageStats: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../../services/BoltProjectSyncService');

const mockSupabaseAuthService = {
  forceCheck: vi.fn(),
  getAuthState: vi.fn().mockReturnValue({ isAuthenticated: false }),
  addAuthStateListener: vi.fn(),
  removeAuthStateListener: vi.fn(),
};

vi.mock('../../content/services/SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: vi.fn(() => mockSupabaseAuthService),
  },
}));
vi.mock('../../content/services/OperationStateManager', () => ({
  OperationStateManager: {
    getInstance: vi.fn(() => ({})),
  },
}));
vi.mock('../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  getLogStorage: () => ({
    rotateLogs: vi.fn(),
    getLogs: vi.fn().mockResolvedValue([]),
  }),
}));

function createMockChromeEvent<T extends (...args: unknown[]) => void>(): chrome.events.Event<T> {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
    hasListeners: vi.fn(),
    getRules: vi.fn().mockImplementation((callback) => {
      callback([]);
    }),
    removeRules: vi.fn().mockImplementation((callback) => {
      callback();
    }),
    addRules: vi.fn().mockImplementation((rules, callback) => {
      callback();
    }),
  };
}

describe('BackgroundService - Welcome Flow', () => {
  let service: BackgroundService;
  let mockTabsCreate: Mock;
  let mockStorageSet: Mock;
  let mockStorageGet: Mock;
  let mockRuntimeGetManifest: Mock;

  let storageState: Record<string, unknown> = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    storageState = {};

    mockTabsCreate = vi.fn().mockResolvedValue({ id: 123 });

    mockStorageSet = vi.fn().mockImplementation((data, callback) => {
      Object.assign(storageState, data);
      if (callback) callback();
      return Promise.resolve();
    });

    mockStorageGet = vi.fn().mockImplementation((keys, callback) => {
      const result =
        Array.isArray(keys) || typeof keys === 'string'
          ? Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys])
                .filter((key) => key in storageState)
                .map((key) => [key, storageState[key]])
            )
          : { ...storageState };

      if (callback) callback(result);
      return Promise.resolve(result);
    });

    mockRuntimeGetManifest = vi.fn().mockReturnValue({
      version: '1.3.5',
      name: 'Bolt to GitHub',
    });

    chrome.tabs.create = mockTabsCreate;
    chrome.storage.local.set = mockStorageSet;
    chrome.storage.local.get = mockStorageGet;
    chrome.runtime.getManifest = mockRuntimeGetManifest;
    chrome.storage.onChanged = createMockChromeEvent();

    chrome.runtime.onConnect = createMockChromeEvent();
    chrome.runtime.onStartup = createMockChromeEvent();
    chrome.runtime.onInstalled = createMockChromeEvent();
    chrome.runtime.onMessage = createMockChromeEvent();
    chrome.tabs.onRemoved = createMockChromeEvent();
    chrome.tabs.onUpdated = createMockChromeEvent();
    chrome.tabs.onActivated = createMockChromeEvent();
    chrome.alarms.onAlarm = createMockChromeEvent();
    chrome.alarms.create = vi.fn().mockImplementation((name, alarmInfo, callback) => {
      if (callback) callback();
    });
    chrome.alarms.clear = vi.fn().mockImplementation((name, callback) => {
      if (callback) callback(true);
    });

    service = new BackgroundService();

    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  afterEach(() => {
    if (service) {
      service.destroy();
    }
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('First-Time Installation', () => {
    it('should open welcome page and initialize onboarding data on first install', async () => {
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      await onInstalledHandler({
        reason: 'install',
        previousVersion: undefined,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockTabsCreate).toHaveBeenCalledWith({
        url: 'https://bolt2github.com/welcome?utm_source=extension_install',
      });

      expect(storageState).toMatchObject({
        onboardingCompleted: false,
        installedVersion: '1.3.5',
        completedSteps: [],
        welcomePageViewed: false,
      });

      expect(typeof storageState.installDate).toBe('string');
      expect(new Date(storageState.installDate as string).toISOString()).toBe(
        storageState.installDate
      );

      expect(storageState.lastKnownVersion).toBe('1.3.5');
    });

    it('should not open welcome page on extension update', async () => {
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      await onInstalledHandler({
        reason: 'update',
        previousVersion: '1.3.4',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockTabsCreate).not.toHaveBeenCalled();

      expect(storageState.lastKnownVersion).toBe('1.3.5');
    });

    it('should not open welcome page on browser update', async () => {
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      await onInstalledHandler({
        reason: 'chrome_update',
        previousVersion: undefined,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockTabsCreate).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle tab creation failure gracefully during install', async () => {
      mockTabsCreate.mockRejectedValueOnce(new Error('Popup blocked'));

      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      await expect(
        onInstalledHandler({
          reason: 'install',
          previousVersion: undefined,
        })
      ).resolves.not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(storageState).toMatchObject({
        installDate: expect.any(Number),
        lastVersion: '1.3.5',
      });

      expect(storageState.installedVersion).toBeUndefined();
      expect(storageState.onboardingCompleted).toBeUndefined();
    });

    it('should handle storage failure gracefully during install', async () => {
      mockStorageSet.mockRejectedValueOnce(new Error('Storage quota exceeded'));

      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      await expect(
        onInstalledHandler({
          reason: 'install',
          previousVersion: undefined,
        })
      ).resolves.not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockTabsCreate).toHaveBeenCalled();
    });
  });

  describe('Welcome Page Message Handlers', () => {
    it('should respond with extension status for valid bolt2github.com requests', async () => {
      storageState = {
        installDate: '2024-01-15T10:00:00.000Z',
        onboardingCompleted: false,
        installedVersion: '1.3.5',
        completedSteps: ['step1'],
      };

      mockSupabaseAuthService.getAuthState.mockReturnValueOnce({
        isAuthenticated: true,
        subscription: { isActive: false },
      });

      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      const sendResponse = vi.fn();

      const result = await onMessageHandler(
        { type: 'getExtensionStatus' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      expect(result).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          installed: true,
          version: '1.3.5',
          authenticated: true,
          installDate: '2024-01-15T10:00:00.000Z',
          onboardingCompleted: false,
          installedVersion: '1.3.5',
        },
      });
    });

    it('should update storage when completing onboarding steps', async () => {
      storageState = {
        completedSteps: ['step1'],
      };

      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      const sendResponse = vi.fn();

      const result = await onMessageHandler(
        { type: 'completeOnboardingStep', step: 'authentication' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      expect(result).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(storageState.completedSteps).toEqual(['step1', 'authentication']);

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
      });
    });

    it('should reject invalid onboarding steps', async () => {
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      const sendResponse = vi.fn();

      onMessageHandler(
        { type: 'completeOnboardingStep', step: 'invalid_step' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid onboarding step: invalid_step',
      });
    });

    it('should provide GitHub App auth URL when requested', async () => {
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      const sendResponse = vi.fn();

      onMessageHandler(
        { type: 'initiateGitHubAuth', method: 'github_app' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        authUrl: 'https://github.com/apps/bolt-to-github/installations/new',
        method: 'github_app',
      });
    });

    it('should reject messages from non-bolt2github.com domains', async () => {
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      const sendResponse = vi.fn();

      onMessageHandler(
        { type: 'getExtensionStatus' },
        { url: 'https://malicious-site.com', tab: { id: 123 } },
        sendResponse
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installed: true,
          }),
        })
      );
    });

    it('should reject messages not from tabs', async () => {
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      const sendResponse = vi.fn();

      onMessageHandler(
        { type: 'getExtensionStatus' },
        { url: 'https://bolt2github.com/welcome' },
        sendResponse
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installed: true,
          }),
        })
      );
    });

    it('should reject invalid authentication methods', async () => {
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      const sendResponse = vi.fn();

      onMessageHandler(
        { type: 'initiateGitHubAuth', method: 'invalid_method' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid authentication method: invalid_method',
      });
    });
  });
});
