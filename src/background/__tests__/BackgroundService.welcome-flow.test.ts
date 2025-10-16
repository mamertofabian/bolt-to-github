import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
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
vi.mock('../../content/services/SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: vi.fn(() => ({
      forceCheck: vi.fn(),
      getAuthState: vi.fn().mockReturnValue({ isAuthenticated: false }),
      addAuthStateListener: vi.fn(),
      removeAuthStateListener: vi.fn(),
    })),
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

function createMockChromeEvent<T extends (...args: unknown[]) => void>() {
  const listeners: T[] = [];
  return {
    addListener: vi.fn((handler: T) => listeners.push(handler)),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
    hasListeners: vi.fn(),
    getRules: vi.fn(),
    removeRules: vi.fn(),
    addRules: vi.fn(),
    _getListeners: () => listeners,
  };
}

describe('BackgroundService - Welcome Flow Behavior', () => {
  let service: BackgroundService;
  let storageData: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    storageData = {};

    chrome.storage.local.set = vi.fn((data) => {
      Object.assign(storageData, data);
      return Promise.resolve();
    });

    chrome.storage.local.get = vi.fn((keys) => {
      if (Array.isArray(keys)) {
        return Promise.resolve(Object.fromEntries(keys.map((key) => [key, storageData[key]])));
      }
      return Promise.resolve({ ...storageData });
    });

    chrome.storage.onChanged = createMockChromeEvent();
    chrome.tabs.create = vi.fn().mockResolvedValue({ id: 123 });
    chrome.tabs.get = vi.fn().mockResolvedValue({ id: 123, url: 'https://bolt.new' });
    chrome.tabs.onActivated = createMockChromeEvent();
    chrome.tabs.onRemoved = createMockChromeEvent();
    chrome.tabs.onUpdated = createMockChromeEvent();

    chrome.runtime.getManifest = vi.fn().mockReturnValue({
      version: '1.3.5',
      name: 'Bolt to GitHub',
    });
    chrome.runtime.onConnect = createMockChromeEvent();
    chrome.runtime.onStartup = createMockChromeEvent();
    chrome.runtime.onInstalled = createMockChromeEvent();
    chrome.runtime.onMessage = createMockChromeEvent();

    chrome.alarms = {
      create: vi.fn(() => Promise.resolve()) as unknown as typeof chrome.alarms.create,
      clear: vi.fn(() => Promise.resolve(true)) as unknown as typeof chrome.alarms.clear,
      onAlarm: createMockChromeEvent(),
      get: vi.fn(() =>
        Promise.resolve({} as chrome.alarms.Alarm)
      ) as unknown as typeof chrome.alarms.get,
      getAll: vi.fn(() => Promise.resolve([])),
      clearAll: vi.fn(() => Promise.resolve(true)) as unknown as typeof chrome.alarms.clearAll,
    };

    service = new BackgroundService();
  });

  afterEach(() => {
    if (service) {
      service.destroy();
    }
    vi.clearAllTimers();
  });

  describe('Installation Flow', () => {
    it('should open welcome page and initialize onboarding state on first install', async () => {
      const installHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      await installHandler({ reason: 'install' });
      await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalled());

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('bolt2github.com/welcome'),
      });

      expect(storageData).toMatchObject({
        onboardingCompleted: false,
        completedSteps: [],
      });
      expect(storageData.installDate).toBeDefined();
    });

    it('should not open welcome page on extension update', async () => {
      storageData = { installDate: Date.now(), lastVersion: '1.3.4' };

      const installHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];
      await installHandler({ reason: 'update', previousVersion: '1.3.4' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully during installation', async () => {
      chrome.storage.local.set = vi.fn().mockRejectedValue(new Error('Storage quota exceeded'));

      const installHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      await expect(installHandler({ reason: 'install' })).resolves.not.toThrow();
    });

    it('should track version changes on update', async () => {
      const installHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      await installHandler({ reason: 'update', previousVersion: '1.3.4' });
      await vi.waitFor(() => expect(storageData.lastKnownVersion).toBe('1.3.5'));

      expect(storageData.lastKnownVersion).toBe('1.3.5');
    });
  });
});
