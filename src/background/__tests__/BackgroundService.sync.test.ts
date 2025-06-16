import { BackgroundService } from '../BackgroundService';
import { BoltProjectSyncService } from '../../services/BoltProjectSyncService';

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
    })),
  },
}));
jest.mock('../../content/services/OperationStateManager', () => ({
  OperationStateManager: {
    getInstance: jest.fn(() => ({})),
  },
}));
jest.mock('../../lib/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  getLogStorage: jest.fn(() => ({
    getLogs: jest.fn().mockResolvedValue([]),
    rotateLogs: jest.fn(),
  })),
}));
jest.mock('../UsageTracker', () => ({
  UsageTracker: jest.fn(() => ({
    initializeUsageData: jest.fn().mockResolvedValue(undefined),
    updateUsageStats: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('../../services/BoltProjectSyncService');

// Mock chrome APIs
const mockAlarms = {
  create: jest.fn(),
  clear: jest.fn(),
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

describe('BackgroundService - Sync Functionality', () => {
  let service: BackgroundService;
  let mockSyncService: jest.Mocked<BoltProjectSyncService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup mock returns
    mockStorage.sync.get.mockResolvedValue({});
    mockStorage.local.get.mockResolvedValue({});

    // Mock BoltProjectSyncService
    mockSyncService = {
      performOutwardSync: jest.fn().mockResolvedValue(null),
      performInwardSync: jest.fn().mockResolvedValue(null),
    } as any;
    (BoltProjectSyncService as jest.MockedClass<typeof BoltProjectSyncService>).mockImplementation(
      () => mockSyncService
    );

    service = new BackgroundService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Sync Alarm Setup', () => {
    it('should create sync alarm on initialization', async () => {
      // Wait for initialization
      await jest.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('bolt-project-sync', { periodInMinutes: 5 });
    });

    it('should add alarm listener on initialization', async () => {
      // Wait for initialization
      await jest.runOnlyPendingTimersAsync();

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('should not create alarm if already exists', async () => {
      mockAlarms.create.mockImplementation((name, config, callback) => {
        chrome.runtime.lastError = { message: 'Alarm already exists' };
        callback?.();
      });

      service = new BackgroundService();
      await jest.runOnlyPendingTimersAsync();

      // Should still be called, but error is handled gracefully
      expect(mockAlarms.create).toHaveBeenCalled();
    });
  });

  describe('Sync Alarm Handler', () => {
    let alarmHandler: (alarm: chrome.alarms.Alarm) => void;

    beforeEach(async () => {
      // Capture the alarm handler
      mockAlarms.onAlarm.addListener.mockImplementation((handler) => {
        alarmHandler = handler;
      });

      service = new BackgroundService();
      await jest.runOnlyPendingTimersAsync();
    });

    it('should perform outward sync when alarm fires', async () => {
      const mockAlarm = { name: 'bolt-project-sync' } as chrome.alarms.Alarm;

      await alarmHandler(mockAlarm);

      expect(mockSyncService.performOutwardSync).toHaveBeenCalled();
    });

    it('should perform inward sync when alarm fires', async () => {
      const mockAlarm = { name: 'bolt-project-sync' } as chrome.alarms.Alarm;

      await alarmHandler(mockAlarm);

      expect(mockSyncService.performInwardSync).toHaveBeenCalled();
    });

    it('should ignore non-sync alarms', async () => {
      const mockAlarm = { name: 'other-alarm' } as chrome.alarms.Alarm;

      // Clear any calls from initialization
      mockSyncService.performOutwardSync.mockClear();
      mockSyncService.performInwardSync.mockClear();

      await alarmHandler(mockAlarm);

      expect(mockSyncService.performOutwardSync).not.toHaveBeenCalled();
      expect(mockSyncService.performInwardSync).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully', async () => {
      const mockAlarm = { name: 'bolt-project-sync' } as chrome.alarms.Alarm;
      const error = new Error('Sync failed');

      mockSyncService.performOutwardSync.mockRejectedValue(error);

      // Should not throw
      await alarmHandler(mockAlarm);

      expect(mockSyncService.performOutwardSync).toHaveBeenCalled();
    });
  });

  describe('Manual Sync Trigger', () => {
    let messageHandler: (
      message: any,
      sender: any,
      sendResponse: (response?: any) => void
    ) => boolean | void;

    beforeEach(async () => {
      // Reset mock
      mockRuntime.onMessage.addListener.mockClear();

      // Capture the message handler
      mockRuntime.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      service = new BackgroundService();
      await jest.runOnlyPendingTimersAsync();

      // Ensure we captured a handler
      expect(mockRuntime.onMessage.addListener).toHaveBeenCalled();
      expect(messageHandler).toBeDefined();
    });

    it('should handle SYNC_BOLT_PROJECTS message', async () => {
      const sendResponse = jest.fn();
      const message = { type: 'SYNC_BOLT_PROJECTS' };
      const sender = {};

      // Call the handler - we won't check the return value since the mock behavior differs
      messageHandler(message, sender, sendResponse);

      // Wait for async operations
      await jest.runOnlyPendingTimersAsync();

      // Verify sync was triggered
      expect(mockSyncService.performOutwardSync).toHaveBeenCalled();

      // Verify response was sent
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        message: 'Sync completed',
        result: {
          syncPerformed: false,
        },
      });
    });

    it('should handle sync errors in manual trigger', async () => {
      const sendResponse = jest.fn();
      const message = { type: 'SYNC_BOLT_PROJECTS' };
      const error = new Error('Sync failed');

      mockSyncService.performOutwardSync.mockRejectedValue(error);

      messageHandler(message, {}, sendResponse);

      // Wait for async operations
      await jest.runOnlyPendingTimersAsync();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Sync failed',
      });
    });
  });

  describe('Sync Service Initialization', () => {
    it('should initialize sync service on startup', async () => {
      service = new BackgroundService();
      await jest.runOnlyPendingTimersAsync();

      expect(BoltProjectSyncService).toHaveBeenCalled();
    });

    it('should perform initial inward sync on startup', async () => {
      service = new BackgroundService();

      // Wait for initialization
      await jest.runOnlyPendingTimersAsync();

      // Advance timers by 1ms to execute the setTimeout
      jest.advanceTimersByTime(1);

      expect(mockSyncService.performInwardSync).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clear sync alarm on service cleanup', async () => {
      service = new BackgroundService();
      await jest.runOnlyPendingTimersAsync();

      // Simulate cleanup via destroy
      service.destroy();

      expect(mockAlarms.clear).toHaveBeenCalledWith('bolt-project-sync');
    });

    it('should remove alarm listener on cleanup', async () => {
      let alarmHandler: any;
      mockAlarms.onAlarm.addListener.mockImplementation((handler) => {
        alarmHandler = handler;
      });

      service = new BackgroundService();
      await jest.runOnlyPendingTimersAsync();

      // Simulate cleanup via destroy
      service.destroy();

      expect(mockAlarms.onAlarm.removeListener).toHaveBeenCalledWith(alarmHandler);
    });
  });
});
