/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResponse } from '../../lib/types';
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
vi.mock('../../content/services/SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: vi.fn(() => ({
      forceCheck: vi.fn(),
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

const mockPerformOutwardSync = vi.fn();
const mockPerformInwardSync = vi.fn();

vi.mock('../../services/BoltProjectSyncService', () => ({
  BoltProjectSyncService: vi.fn(() => ({
    performOutwardSync: mockPerformOutwardSync,
    performInwardSync: mockPerformInwardSync,
  })),
}));

const createChromeAPIMock = () => {
  const alarmListeners: ((alarm: chrome.alarms.Alarm) => void)[] = [];
  const messageListeners: ((message: any, sender: any, sendResponse: any) => boolean | void)[] = [];

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
      onMessage: {
        addListener: vi.fn((handler) => messageListeners.push(handler)),
        removeListener: vi.fn(),
      },
      onStartup: { addListener: vi.fn() },
      lastError: null,
      getManifest: vi.fn(() => ({ version: '1.0.0' })),
      sendMessage: vi.fn(),
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

    _sendMessage: (message: any, sender: any = {}) => {
      const sendResponse = vi.fn();
      messageListeners.forEach((listener) => listener(message, sender, sendResponse));
      return sendResponse;
    },
  };
};

describe('BackgroundService - Sync Functionality', () => {
  let chromeMock: ReturnType<typeof createChromeAPIMock>;
  let service: BackgroundService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockPerformOutwardSync.mockResolvedValue(null);
    mockPerformInwardSync.mockResolvedValue(null);

    chromeMock = createChromeAPIMock();
    global.chrome = chromeMock as any;

    service = new BackgroundService();
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  describe('Periodic Sync Behavior', () => {
    it('should perform both outward and inward sync when periodic alarm fires', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockPerformOutwardSync.mockClear();
      mockPerformInwardSync.mockClear();

      chromeMock.alarms._triggerAlarm({ name: 'bolt-project-sync' } as chrome.alarms.Alarm);

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockPerformOutwardSync).toHaveBeenCalledTimes(1);
      expect(mockPerformInwardSync).toHaveBeenCalledTimes(1);
    });

    it('should continue with inward sync even if outward sync fails', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockPerformOutwardSync.mockClear();
      mockPerformInwardSync.mockClear();

      mockPerformOutwardSync.mockRejectedValue(new Error('Network error'));

      chromeMock.alarms._triggerAlarm({ name: 'bolt-project-sync' } as chrome.alarms.Alarm);

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockPerformOutwardSync).toHaveBeenCalled();
      expect(mockPerformInwardSync).toHaveBeenCalled();
    });

    it('should not trigger sync for unrelated alarms', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockPerformOutwardSync.mockClear();
      mockPerformInwardSync.mockClear();

      chromeMock.alarms._triggerAlarm({ name: 'keepAlive' } as chrome.alarms.Alarm);

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockPerformOutwardSync).not.toHaveBeenCalled();
      expect(mockPerformInwardSync).not.toHaveBeenCalled();
    });
  });

  describe('Manual Sync Trigger', () => {
    it('should perform outward sync when manual sync is requested', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockPerformOutwardSync.mockClear();
      mockPerformInwardSync.mockClear();

      const mockSyncResult: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [],
        deletedProjects: [],
      };
      mockPerformOutwardSync.mockResolvedValue(mockSyncResult);

      const sendResponse = chromeMock._sendMessage({ type: 'SYNC_BOLT_PROJECTS' });

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockPerformOutwardSync).toHaveBeenCalled();

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Sync completed',
          result: expect.objectContaining({
            syncPerformed: true,
          }),
        })
      );
    });

    it('should report sync failure when manual sync fails', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockPerformOutwardSync.mockRejectedValue(new Error('Sync failed'));

      const sendResponse = chromeMock._sendMessage({ type: 'SYNC_BOLT_PROJECTS' });

      await vi.advanceTimersByTimeAsync(1000);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Sync failed',
        })
      );
    });
  });

  describe('Initial Sync on Startup', () => {
    it('should perform inward sync shortly after initialization', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockPerformInwardSync).toHaveBeenCalled();
    });

    it('should skip concurrent sync operations', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      mockPerformInwardSync.mockClear();

      let resolveSync: () => void;
      const slowSync = new Promise<null>((resolve) => {
        resolveSync = () => resolve(null);
      });
      mockPerformInwardSync.mockReturnValue(slowSync);

      chromeMock.alarms._triggerAlarm({ name: 'bolt-project-sync' } as chrome.alarms.Alarm);

      await vi.advanceTimersByTimeAsync(100);

      chromeMock.alarms._triggerAlarm({ name: 'bolt-project-sync' } as chrome.alarms.Alarm);

      await vi.advanceTimersByTimeAsync(100);

      expect(mockPerformInwardSync).toHaveBeenCalledTimes(1);

      resolveSync!();
      await vi.advanceTimersByTimeAsync(100);
    });
  });

  describe('Cleanup Behavior', () => {
    it('should stop sync operations when service is destroyed', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      service.destroy();

      mockPerformOutwardSync.mockClear();
      mockPerformInwardSync.mockClear();

      chromeMock.alarms._triggerAlarm({ name: 'bolt-project-sync' } as chrome.alarms.Alarm);

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockPerformOutwardSync).not.toHaveBeenCalled();
      expect(mockPerformInwardSync).not.toHaveBeenCalled();
    });

    it('should clear sync alarm when destroyed', async () => {
      await vi.advanceTimersByTimeAsync(5000);

      service.destroy();

      expect(chromeMock.alarms.clear).toHaveBeenCalledWith('bolt-project-sync');
    });
  });
});
