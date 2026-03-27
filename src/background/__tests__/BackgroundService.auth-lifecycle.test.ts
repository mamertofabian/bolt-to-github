/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundService } from '../BackgroundService';

vi.mock('../../services/UnifiedGitHubService');
vi.mock('../../services/zipHandler');
vi.mock('../StateManager', () => ({
  StateManager: {
    getInstance: vi.fn(() => ({
      getGitHubSettings: vi.fn().mockResolvedValue({ gitHubSettings: {} }),
    })),
  },
}));
vi.mock('../TempRepoManager');

const mockForceCheck = vi.fn();

vi.mock('../../content/services/SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: vi.fn(() => ({
      forceCheck: mockForceCheck,
      getAuthState: vi.fn().mockReturnValue({ isAuthenticated: true }),
      addAuthStateListener: vi.fn(),
      removeAuthStateListener: vi.fn(),
      isPremium: vi.fn().mockReturnValue(false),
    })),
  },
}));
vi.mock('../../content/services/OperationStateManager', () => ({
  OperationStateManager: {
    getInstance: vi.fn(() => ({})),
  },
}));
vi.mock('../../lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  getLogStorage: vi.fn(() => ({
    getLogs: vi.fn().mockResolvedValue([]),
    rotateLogs: vi.fn(),
  })),
}));
vi.mock('../UsageTracker', () => ({
  UsageTracker: vi.fn(() => ({
    initializeUsageData: vi.fn().mockResolvedValue(undefined),
    updateUsageStats: vi.fn().mockResolvedValue(undefined),
    trackError: vi.fn().mockResolvedValue(undefined),
    setUninstallURL: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../WindowManager', () => ({
  WindowManager: {
    getInstance: vi.fn(() => ({
      openPopupWindow: vi.fn(),
      closePopupWindow: vi.fn(),
    })),
  },
}));

const mockPerformOutwardSync = vi.fn().mockResolvedValue(null);
const mockPerformInwardSync = vi.fn().mockResolvedValue(null);

vi.mock('../../services/BoltProjectSyncService', () => ({
  BoltProjectSyncService: vi.fn(() => ({
    performOutwardSync: mockPerformOutwardSync,
    performInwardSync: mockPerformInwardSync,
  })),
}));

const createChromeAPIMock = () => {
  const alarmListeners: ((alarm: chrome.alarms.Alarm) => void)[] = [];

  return {
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: {
        addListener: vi.fn((handler) => alarmListeners.push(handler)),
        removeListener: vi.fn((handler) => {
          const index = alarmListeners.indexOf(handler);
          if (index !== -1) alarmListeners.splice(index, 1);
        }),
      },
      _triggerAlarm: (alarm: chrome.alarms.Alarm) => {
        alarmListeners.forEach((listener) => listener(alarm));
      },
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      sync: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onConnect: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      lastError: null,
      getManifest: vi.fn(() => ({ version: '1.0.0' })),
      sendMessage: vi.fn(),
      reload: vi.fn(),
    },
    tabs: {
      get: vi.fn(),
      onUpdated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() },
      query: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      sendMessage: vi.fn(),
    },
    action: {
      openPopup: vi.fn(),
    },
  };
};

describe('BackgroundService - Auth Lifecycle Recovery', () => {
  let chromeMock: ReturnType<typeof createChromeAPIMock>;
  let service: BackgroundService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    chromeMock = createChromeAPIMock();
    global.chrome = chromeMock as any;

    service = new BackgroundService();
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  describe('syncInProgress timeout auto-reset', () => {
    it('should reset stuck syncInProgress flag after SYNC_TIMEOUT_MS', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      // Simulate a stuck sync: set flag + old timestamp
      (service as any).syncInProgress = true;
      (service as any).syncStartedAt = Date.now() - 6 * 60 * 1000; // 6 minutes ago

      mockPerformInwardSync.mockClear();
      mockPerformInwardSync.mockResolvedValue(null);

      // This should detect the stale flag and reset it, then proceed
      await (service as any).safePerformInwardSync('test');

      expect(mockPerformInwardSync).toHaveBeenCalled();
    });

    it('should not reset syncInProgress if within timeout', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      // Simulate an ongoing sync that's only 1 minute old
      (service as any).syncInProgress = true;
      (service as any).syncStartedAt = Date.now() - 60 * 1000; // 1 minute ago

      mockPerformInwardSync.mockClear();

      await (service as any).safePerformInwardSync('test');

      // Should skip because sync is still in progress (within timeout)
      expect(mockPerformInwardSync).not.toHaveBeenCalled();
    });

    it('should reset syncStartedAt after sync completes', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockPerformInwardSync.mockClear();
      mockPerformInwardSync.mockResolvedValue(null);

      await (service as any).safePerformInwardSync('test');

      expect((service as any).syncInProgress).toBe(false);
      expect((service as any).syncStartedAt).toBe(0);
    });

    it('should reset syncStartedAt even if sync fails', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockPerformInwardSync.mockClear();
      mockPerformInwardSync.mockRejectedValue(new Error('Sync error'));

      await (service as any).safePerformInwardSync('test');

      expect((service as any).syncInProgress).toBe(false);
      expect((service as any).syncStartedAt).toBe(0);
    });
  });

  describe('auth-periodic-check alarm handler', () => {
    it('should call supabaseAuthService.forceCheck when auth alarm fires', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockForceCheck.mockClear();

      chromeMock.alarms._triggerAlarm({
        name: 'auth-periodic-check',
      } as chrome.alarms.Alarm);

      await vi.advanceTimersByTimeAsync(100);

      expect(mockForceCheck).toHaveBeenCalled();
    });

    it('should not call forceCheck for unrelated alarms', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockForceCheck.mockClear();

      chromeMock.alarms._triggerAlarm({ name: 'keepAlive' } as chrome.alarms.Alarm);

      await vi.advanceTimersByTimeAsync(100);

      // forceCheck should NOT have been called by keepAlive alarm
      // (it may have been called during initialization, but we cleared the mock)
      expect(mockForceCheck).not.toHaveBeenCalled();
    });
  });
});
