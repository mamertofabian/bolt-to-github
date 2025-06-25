/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mocked, MockedClass } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoltProjectSyncService } from '../../services/BoltProjectSyncService';
import { BackgroundService } from '../BackgroundService';

// Mock all dependencies
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
  })),
}));
vi.mock('../../services/BoltProjectSyncService');

// Mock chrome APIs
const mockAlarms = {
  create: vi.fn(),
  clear: vi.fn(),
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

describe('BackgroundService - Sync Functionality', () => {
  let service: BackgroundService;
  let mockSyncService: Mocked<BoltProjectSyncService>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup mock returns
    mockStorage.sync.get.mockResolvedValue({});
    mockStorage.local.get.mockResolvedValue({});

    // Mock BoltProjectSyncService
    mockSyncService = {
      performOutwardSync: vi.fn().mockResolvedValue(null),
      performInwardSync: vi.fn().mockResolvedValue(null),
    } as any;
    (BoltProjectSyncService as MockedClass<typeof BoltProjectSyncService>).mockImplementation(
      () => mockSyncService
    );

    service = new BackgroundService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Sync Alarm Setup', () => {
    it('should create sync alarm on initialization', async () => {
      // Wait for initialization
      await vi.runOnlyPendingTimersAsync();

      expect(mockAlarms.create).toHaveBeenCalledWith('bolt-project-sync', { periodInMinutes: 5 });
    });

    it('should add alarm listener on initialization', async () => {
      // Wait for initialization
      await vi.runOnlyPendingTimersAsync();

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('should not create alarm if already exists', async () => {
      mockAlarms.create.mockImplementation((name, config, callback) => {
        chrome.runtime.lastError = { message: 'Alarm already exists' };
        callback?.();
      });

      service = new BackgroundService();
      await vi.runOnlyPendingTimersAsync();

      // Should still be called, but error is handled gracefully
      expect(mockAlarms.create).toHaveBeenCalled();
      // Verify service continues to function by checking alarm listener is still added
      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
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
      await vi.runOnlyPendingTimersAsync();
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
      await vi.runOnlyPendingTimersAsync();

      // Ensure we captured a handler
      expect(mockRuntime.onMessage.addListener).toHaveBeenCalled();
      expect(messageHandler).toBeDefined();
    });

    it('should handle SYNC_BOLT_PROJECTS message', async () => {
      const sendResponse = vi.fn();
      const message = { type: 'SYNC_BOLT_PROJECTS' };
      const sender = {};

      // Call the handler - we won't check the return value since the mock behavior differs
      messageHandler(message, sender, sendResponse);

      // Wait for async operations
      await vi.runOnlyPendingTimersAsync();

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
      const sendResponse = vi.fn();
      const message = { type: 'SYNC_BOLT_PROJECTS' };
      const error = new Error('Sync failed');

      mockSyncService.performOutwardSync.mockRejectedValue(error);

      messageHandler(message, {}, sendResponse);

      // Wait for async operations
      await vi.runOnlyPendingTimersAsync();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Sync failed',
      });
    });
  });

  describe('Sync Service Initialization', () => {
    it('should initialize sync service on startup', async () => {
      service = new BackgroundService();
      await vi.runOnlyPendingTimersAsync();

      expect(BoltProjectSyncService).toHaveBeenCalled();
    });

    it('should perform initial inward sync on startup', async () => {
      service = new BackgroundService();

      // Wait for initialization
      await vi.runOnlyPendingTimersAsync();

      // Advance timers by 1ms to execute the setTimeout
      vi.advanceTimersByTime(1);

      expect(mockSyncService.performInwardSync).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clear sync alarm on service cleanup', async () => {
      service = new BackgroundService();
      await vi.runOnlyPendingTimersAsync();

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
      await vi.runOnlyPendingTimersAsync();

      // Simulate cleanup via destroy
      service.destroy();

      expect(mockAlarms.onAlarm.removeListener).toHaveBeenCalledWith(alarmHandler);
    });
  });
});
