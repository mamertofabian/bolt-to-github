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
vi.mock('../../content/services/SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: vi.fn(() => ({
      forceCheck: vi.fn(),
      getAuthState: vi.fn().mockReturnValue({ isAuthenticated: true }),
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
};

const mockTabs = {
  get: vi.fn(),
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

global.chrome = {
  alarms: mockAlarms,
  storage: mockStorage,
  runtime: mockRuntime,
  tabs: mockTabs,
} as any;

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

  describe('Log Rotation Alarm', () => {
    it('should create log rotation alarm on initialization', async () => {
      await vi.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('logRotation', { periodInMinutes: 60 });
    });

    it('should trigger log rotation on startup event', () => {
      mockLogStorage.rotateLogs.mockClear();

      const startupListener = mockRuntime.onStartup.addListener.mock.calls[0][0];

      startupListener();

      expect(mockLogStorage.rotateLogs).toHaveBeenCalled();
    });

    it('should trigger log rotation on installed event', async () => {
      mockLogStorage.rotateLogs.mockClear();

      const installedListener = mockRuntime.onInstalled.addListener.mock.calls[0][0];

      await installedListener({ reason: 'install' });

      expect(mockLogStorage.rotateLogs).toHaveBeenCalled();
    });
  });

  describe('Keep-Alive Alarm', () => {
    it('should create keep-alive alarm on initialization', async () => {
      await vi.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('keepAlive', { periodInMinutes: 1 });
    });

    it('should manage ports for active connections', () => {
      expect((service as any).ports).toBeInstanceOf(Map);

      expect((service as any).ports.size).toBe(0);
    });

    it('should update activity timestamp on keep-alive alarm', () => {
      const mockUpdateLastActivity = vi.spyOn(service as any, 'updateLastActivity');

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      alarmListener({ name: 'keepAlive' });

      expect(mockUpdateLastActivity).toHaveBeenCalled();
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        lastKeepAlive: expect.any(Number),
      });
    });
  });

  describe('Sync Alarm', () => {
    it('should create sync alarm on initialization', async () => {
      await vi.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('bolt-project-sync', { periodInMinutes: 5 });
    });
  });

  describe('Alarm Configuration Verification', () => {
    it('should create all alarms with correct parameters on initialization', async () => {
      await vi.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('logRotation', { periodInMinutes: 60 });
      expect(mockAlarms.create).toHaveBeenCalledWith('keepAlive', { periodInMinutes: 1 });
      expect(mockAlarms.create).toHaveBeenCalledWith('bolt-project-sync', { periodInMinutes: 5 });

      const alarmNames = mockAlarms.create.mock.calls.map((call) => call[0]);
      expect(alarmNames).toContain('logRotation');
      expect(alarmNames).toContain('keepAlive');
      expect(alarmNames).toContain('bolt-project-sync');
    });
  });

  describe('Alarm Event Handling', () => {
    it('should register alarm event listener on initialization', async () => {
      await vi.runOnlyPendingTimersAsync();

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle keep-alive alarm events', () => {
      const mockUpdateLastActivity = vi.spyOn(service as any, 'updateLastActivity');

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      alarmListener({ name: 'keepAlive' });

      expect(mockUpdateLastActivity).toHaveBeenCalled();
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        lastKeepAlive: expect.any(Number),
      });
    });

    it('should handle log rotation alarm events', () => {
      mockLogStorage.rotateLogs.mockClear();

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      alarmListener({ name: 'logRotation' });

      expect(mockLogStorage.rotateLogs).toHaveBeenCalled();
    });

    it('should handle sync alarm events', () => {
      const mockHandleSyncAlarm = vi
        .spyOn(service as any, 'handleSyncAlarm')
        .mockImplementation(() => {});

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      alarmListener({ name: 'bolt-project-sync' });

      expect(mockHandleSyncAlarm).toHaveBeenCalled();
    });

    it('should ignore unknown alarm events', () => {
      const mockUpdateLastActivity = vi.spyOn(service as any, 'updateLastActivity');
      const mockHandleSyncAlarm = vi
        .spyOn(service as any, 'handleSyncAlarm')
        .mockImplementation(() => {});

      mockLogStorage.rotateLogs.mockClear();

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      alarmListener({ name: 'unknown-alarm' });

      expect(mockUpdateLastActivity).not.toHaveBeenCalled();
      expect(mockLogStorage.rotateLogs).not.toHaveBeenCalled();
      expect(mockHandleSyncAlarm).not.toHaveBeenCalled();
    });
  });

  describe('Alarm Cleanup', () => {
    it('should remove alarm listeners on service destruction', () => {
      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      service.destroy();

      expect(mockAlarms.onAlarm.removeListener).toHaveBeenCalledWith(alarmListener);
    });

    it('should clear sync alarm on service destruction', () => {
      service.destroy();

      expect(mockAlarms.clear).toHaveBeenCalledWith('bolt-project-sync');
    });
  });

  describe('Keep-Alive Activity Tracking', () => {
    beforeEach(() => {
      vi.spyOn(Date, 'now').mockReturnValue(1000000);
    });

    afterEach(() => {
      (Date.now as any).mockRestore();
    });

    it('should track last activity timestamp', () => {
      (service as any).updateLastActivity();

      expect((service as any).lastActivityTime).toBe(1000000);
    });

    it('should store keep-alive timestamp in chrome storage', () => {
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0]?.[0];
      expect(alarmListener).toBeDefined();

      alarmListener({ name: 'keepAlive' });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        lastKeepAlive: 1000000,
      });
    });
  });

  describe('Connection Management', () => {
    it('should initialize with empty ports map', () => {
      expect((service as any).ports).toBeInstanceOf(Map);
      expect((service as any).ports.size).toBe(0);
    });

    it('should manage port connections', () => {
      const ports = (service as any).ports;

      expect(ports.size).toBe(0);
    });
  });
});
