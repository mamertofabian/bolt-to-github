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

const mockLogStorage = {
  getLogs: vi.fn().mockResolvedValue([]),
  rotateLogs: vi.fn(),
};

vi.mock('../../lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  getLogStorage: vi.fn(() => mockLogStorage),
}));

vi.mock('../UsageTracker', () => ({
  UsageTracker: vi.fn(() => ({
    initializeUsageData: vi.fn().mockResolvedValue(undefined),
    updateUsageStats: vi.fn().mockResolvedValue(undefined),
    setUninstallURL: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../services/BoltProjectSyncService');

const mockAlarms = {
  create: vi.fn(),
  clear: vi.fn(),
  clearAll: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(),
  onAlarm: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
  sync: {
    get: vi.fn(),
    set: vi.fn(),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const mockRuntime = {
  onInstalled: {
    addListener: vi.fn(),
  },
  onConnect: {
    addListener: vi.fn(),
  },
  onMessage: {
    addListener: vi.fn(),
  },
  onStartup: {
    addListener: vi.fn(),
  },
  lastError: null,
  getManifest: vi.fn(() => ({ version: '1.0.0' })),
};

const mockTabs = {
  get: vi.fn(),
  query: vi.fn().mockResolvedValue([]),
  onUpdated: {
    addListener: vi.fn(),
  },
  onRemoved: {
    addListener: vi.fn(),
  },
  onActivated: {
    addListener: vi.fn(),
  },
};

const mockAction = {
  openPopup: vi.fn(),
};

global.chrome = {
  alarms: mockAlarms,
  storage: mockStorage,
  runtime: mockRuntime,
  tabs: mockTabs,
  action: mockAction,
} as never;

describe('BackgroundService - Alarms Functionality', () => {
  let service: BackgroundService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockStorage.sync.get.mockResolvedValue({});
    mockStorage.local.get.mockResolvedValue({});

    service = new BackgroundService();
  });

  afterEach(() => {
    vi.useRealTimers();
    service.destroy();
  });

  describe('Alarm Registration', () => {
    it('should register all required alarms on initialization', async () => {
      await vi.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('logRotation', { periodInMinutes: 60 });
      expect(mockAlarms.create).toHaveBeenCalledWith('keepAlive', { periodInMinutes: 1 });
      expect(mockAlarms.create).toHaveBeenCalledWith('bolt-project-sync', { periodInMinutes: 5 });
    });

    it('should register alarm event listener', async () => {
      await vi.runOnlyPendingTimersAsync();

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Log Rotation Behavior', () => {
    it('should rotate logs when extension starts up', () => {
      const startupListener = mockRuntime.onStartup.addListener.mock.calls[0][0];

      startupListener();

      expect(mockLogStorage.rotateLogs).toHaveBeenCalled();
    });

    it('should rotate logs when extension is installed', async () => {
      const installedListener = mockRuntime.onInstalled.addListener.mock.calls[0][0];

      await installedListener({ reason: 'install' });

      expect(mockLogStorage.rotateLogs).toHaveBeenCalled();
    });

    it('should rotate logs when logRotation alarm fires', () => {
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];

      alarmListener({ name: 'logRotation' });

      expect(mockLogStorage.rotateLogs).toHaveBeenCalled();
    });
  });

  describe('Keep-Alive Behavior', () => {
    it('should update storage when keep-alive alarm fires', () => {
      vi.setSystemTime(1000000);
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];

      alarmListener({ name: 'keepAlive' });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        lastKeepAlive: 1000000,
      });
    });
  });

  describe('Alarm Cleanup on Destruction', () => {
    it('should remove alarm listener when service is destroyed', () => {
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];

      service.destroy();

      expect(mockAlarms.onAlarm.removeListener).toHaveBeenCalledWith(alarmListener);
    });

    it('should clear sync alarm when service is destroyed', () => {
      service.destroy();

      expect(mockAlarms.clear).toHaveBeenCalledWith('bolt-project-sync');
    });
  });

  describe('Alarm Event Routing', () => {
    it('should handle known alarm types correctly', () => {
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];

      mockLogStorage.rotateLogs.mockClear();
      mockStorage.local.set.mockClear();

      alarmListener({ name: 'logRotation' });
      expect(mockLogStorage.rotateLogs).toHaveBeenCalledTimes(1);

      alarmListener({ name: 'keepAlive' });
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        lastKeepAlive: expect.any(Number),
      });
    });

    it('should not crash on unknown alarm types', () => {
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];

      mockLogStorage.rotateLogs.mockClear();
      mockStorage.local.set.mockClear();

      expect(() => {
        alarmListener({ name: 'unknown-alarm' });
      }).not.toThrow();

      expect(mockLogStorage.rotateLogs).not.toHaveBeenCalled();
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });
  });
});
