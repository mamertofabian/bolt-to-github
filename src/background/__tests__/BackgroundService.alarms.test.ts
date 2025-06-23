/* eslint-disable @typescript-eslint/no-explicit-any */
import { BackgroundService } from '../BackgroundService';

// Mock all dependencies
jest.mock('../../services/UnifiedGitHubService');
jest.mock('../../services/zipHandler');
jest.mock('../StateManager', () => ({
  StateManager: {
    getInstance: jest.fn(() => ({
      getGitHubSettings: jest.fn().mockResolvedValue({ gitHubSettings: {} }),
    })),
  },
}));
jest.mock('../TempRepoManager');
jest.mock('../../content/services/SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: jest.fn(() => ({
      forceCheck: jest.fn(),
      getAuthState: jest.fn().mockReturnValue({ isAuthenticated: true }),
      addAuthStateListener: jest.fn(),
      removeAuthStateListener: jest.fn(),
    })),
  },
}));
jest.mock('../../content/services/OperationStateManager', () => ({
  OperationStateManager: {
    getInstance: jest.fn(() => ({})),
  },
}));
const mockLogStorage = {
  getLogs: jest.fn().mockResolvedValue([]),
  rotateLogs: jest.fn(),
};

jest.mock('../../lib/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  getLogStorage: jest.fn(() => mockLogStorage),
}));
jest.mock('../UsageTracker', () => ({
  UsageTracker: jest.fn(() => ({
    initializeUsageData: jest.fn().mockResolvedValue(undefined),
    updateUsageStats: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('../../services/BoltProjectSyncService');

// Mock chrome APIs with enhanced alarm functionality
const mockAlarms = {
  create: jest.fn(),
  clear: jest.fn(),
  clearAll: jest.fn(),
  get: jest.fn(),
  getAll: jest.fn(),
  onAlarm: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
};

const mockStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
  },
  sync: {
    get: jest.fn(),
    set: jest.fn(),
  },
  onChanged: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
};

const mockRuntime = {
  onInstalled: {
    addListener: jest.fn(),
  },
  onConnect: {
    addListener: jest.fn(),
  },
  onMessage: {
    addListener: jest.fn(),
  },
  onStartup: {
    addListener: jest.fn(),
  },
  lastError: null,
};

const mockTabs = {
  get: jest.fn(),
  onUpdated: {
    addListener: jest.fn(),
  },
  onRemoved: {
    addListener: jest.fn(),
  },
  onActivated: {
    addListener: jest.fn(),
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
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup mock returns
    mockStorage.sync.get.mockResolvedValue({});
    mockStorage.local.get.mockResolvedValue({});

    service = new BackgroundService();
  });

  afterEach(() => {
    jest.useRealTimers();
    service.destroy();
  });

  describe('Log Rotation Alarm', () => {
    it('should create log rotation alarm on initialization', async () => {
      await jest.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('logRotation', { periodInMinutes: 180 });
    });

    it('should trigger log rotation on startup event', () => {
      // Clear any previous calls
      mockLogStorage.rotateLogs.mockClear();

      // Get the startup listener
      const startupListener = mockRuntime.onStartup.addListener.mock.calls[0][0];

      // Trigger startup event
      startupListener();

      expect(mockLogStorage.rotateLogs).toHaveBeenCalled();
    });

    it('should trigger log rotation on installed event', async () => {
      // Clear any previous calls
      mockLogStorage.rotateLogs.mockClear();

      // Get the installed listener
      const installedListener = mockRuntime.onInstalled.addListener.mock.calls[0][0];

      // Trigger installed event
      await installedListener({ reason: 'install' });

      expect(mockLogStorage.rotateLogs).toHaveBeenCalled();
    });
  });

  describe('Keep-Alive Alarm', () => {
    it('should create keep-alive alarm on initialization', async () => {
      await jest.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('keepAlive', { periodInMinutes: 1 });
    });

    it('should manage ports for active connections', () => {
      // Verify ports Map exists
      expect((service as any).ports).toBeInstanceOf(Map);

      // Verify initial state
      expect((service as any).ports.size).toBe(0);
    });

    it('should update activity timestamp on keep-alive alarm', () => {
      const mockUpdateLastActivity = jest.spyOn(service as any, 'updateLastActivity');

      // Get the alarm listener
      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      // Trigger keep-alive alarm
      alarmListener({ name: 'keepAlive' });

      expect(mockUpdateLastActivity).toHaveBeenCalled();
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        lastKeepAlive: expect.any(Number),
      });
    });
  });

  describe('Sync Alarm', () => {
    it('should create sync alarm on initialization', async () => {
      await jest.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('bolt-project-sync', { periodInMinutes: 5 });
    });
  });

  describe('Alarm Configuration Verification', () => {
    it('should create all alarms with correct parameters on initialization', async () => {
      await jest.runOnlyPendingTimersAsync();

      // Verify all three alarms are created with exact parameters
      expect(mockAlarms.create).toHaveBeenCalledWith('logRotation', { periodInMinutes: 180 });
      expect(mockAlarms.create).toHaveBeenCalledWith('keepAlive', { periodInMinutes: 1 });
      expect(mockAlarms.create).toHaveBeenCalledWith('bolt-project-sync', { periodInMinutes: 5 });

      // Verify specific alarms were created
      const alarmNames = mockAlarms.create.mock.calls.map((call) => call[0]);
      expect(alarmNames).toContain('logRotation');
      expect(alarmNames).toContain('keepAlive');
      expect(alarmNames).toContain('bolt-project-sync');
    });
  });

  describe('Alarm Event Handling', () => {
    it('should register alarm event listener on initialization', async () => {
      await jest.runOnlyPendingTimersAsync();

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle keep-alive alarm events', () => {
      const mockUpdateLastActivity = jest.spyOn(service as any, 'updateLastActivity');

      // Get the alarm listener
      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      // Trigger keep-alive alarm
      alarmListener({ name: 'keepAlive' });

      expect(mockUpdateLastActivity).toHaveBeenCalled();
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        lastKeepAlive: expect.any(Number),
      });
    });

    it('should handle log rotation alarm events', () => {
      // Clear any previous calls
      mockLogStorage.rotateLogs.mockClear();

      // Get the alarm listener
      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      // Trigger log rotation alarm
      alarmListener({ name: 'logRotation' });

      expect(mockLogStorage.rotateLogs).toHaveBeenCalled();
    });

    it('should handle sync alarm events', () => {
      const mockHandleSyncAlarm = jest
        .spyOn(service as any, 'handleSyncAlarm')
        .mockImplementation();

      // Get the alarm listener
      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      // Trigger sync alarm
      alarmListener({ name: 'bolt-project-sync' });

      expect(mockHandleSyncAlarm).toHaveBeenCalled();
    });

    it('should ignore unknown alarm events', () => {
      const mockUpdateLastActivity = jest.spyOn(service as any, 'updateLastActivity');
      const mockHandleSyncAlarm = jest
        .spyOn(service as any, 'handleSyncAlarm')
        .mockImplementation();

      // Clear any previous calls
      mockLogStorage.rotateLogs.mockClear();

      // Get the alarm listener
      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      // Trigger unknown alarm
      alarmListener({ name: 'unknown-alarm' });

      expect(mockUpdateLastActivity).not.toHaveBeenCalled();
      expect(mockLogStorage.rotateLogs).not.toHaveBeenCalled();
      expect(mockHandleSyncAlarm).not.toHaveBeenCalled();
    });
  });

  describe('Alarm Cleanup', () => {
    it('should remove alarm listeners on service destruction', () => {
      // Initialize service and get the listener
      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
      const alarmListener = mockAlarms.onAlarm.addListener.mock.calls[0][0];
      expect(alarmListener).toBeDefined();

      // Destroy service
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
      jest.spyOn(Date, 'now').mockReturnValue(1000000);
    });

    afterEach(() => {
      (Date.now as jest.Mock).mockRestore();
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

      // Verify we can work with the ports Map
      expect(ports.size).toBe(0);

      // Note: Actual port management is handled by Chrome extension runtime
      // and would require more complex mocking to test the connection handlers
    });
  });
});
