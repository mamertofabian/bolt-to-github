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
vi.mock('../../services/AnalyticsService');

const mockAlarms = {
  create: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn(),
  onAlarm: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const mockStorage = {
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn(),
  },
  sync: {
    get: vi.fn().mockResolvedValue({}),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const mockRuntime = {
  id: 'test-extension-id',
  reload: vi.fn(),
  onInstalled: { addListener: vi.fn() },
  onConnect: { addListener: vi.fn() },
  onMessage: { addListener: vi.fn() },
  onStartup: { addListener: vi.fn() },
  getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
};

const mockTabs = {
  query: vi.fn().mockResolvedValue([]),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  onUpdated: { addListener: vi.fn() },
  onRemoved: { addListener: vi.fn() },
  onActivated: { addListener: vi.fn() },
};

global.chrome = {
  alarms: mockAlarms,
  storage: mockStorage,
  runtime: mockRuntime,
  tabs: mockTabs,
} as never;

describe('BackgroundService - Extension Reload Behavior', () => {
  let service: BackgroundService;
  let runtimeMessageListener: (
    message: { type: string; data?: { reason?: string } },
    sender: unknown,
    sendResponse: (response: { success: boolean; error?: string }) => void
  ) => boolean | void;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new BackgroundService();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const listenerCall = mockRuntime.onMessage.addListener.mock.calls[0];
    if (!listenerCall?.[0]) {
      throw new Error('Runtime message listener not registered');
    }
    runtimeMessageListener = listenerCall[0];
  });

  afterEach(() => {
    service.destroy();
  });

  describe('when extension reload is requested', () => {
    it('should respond successfully when reload request is processed', async () => {
      const sendResponse = vi.fn();

      runtimeMessageListener(
        { type: 'RELOAD_EXTENSION', data: { reason: 'auth failure' } },
        {},
        sendResponse
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should handle reload request even when reason is missing', async () => {
      const sendResponse = vi.fn();

      runtimeMessageListener({ type: 'RELOAD_EXTENSION', data: {} }, {}, sendResponse);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should handle reload request gracefully when alarm creation fails', async () => {
      mockAlarms.create.mockRejectedValueOnce(new Error('Alarm failed'));
      const sendResponse = vi.fn();

      runtimeMessageListener(
        { type: 'RELOAD_EXTENSION', data: { reason: 'test' } },
        {},
        sendResponse
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should handle reload request gracefully when notification delivery fails', async () => {
      mockTabs.query.mockRejectedValueOnce(new Error('Tabs query failed'));
      const sendResponse = vi.fn();

      runtimeMessageListener(
        { type: 'RELOAD_EXTENSION', data: { reason: 'test' } },
        {},
        sendResponse
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('when self-heal alarm is triggered', () => {
    it('should attempt extension reload when alarm fires', () => {
      const alarmListenerCall = mockAlarms.onAlarm.addListener.mock.calls[0];
      const alarmListener = alarmListenerCall?.[0];

      if (!alarmListener) {
        throw new Error('Alarm listener not registered');
      }

      alarmListener({ name: 'self-heal-reload' });

      expect(mockRuntime.reload).toHaveBeenCalled();
    });

    it('should not reload for unrelated alarms', () => {
      const alarmListenerCall = mockAlarms.onAlarm.addListener.mock.calls[0];
      const alarmListener = alarmListenerCall?.[0];

      if (!alarmListener) {
        throw new Error('Alarm listener not registered');
      }

      mockRuntime.reload.mockClear();

      alarmListener({ name: 'keepAlive' });
      alarmListener({ name: 'logRotation' });

      expect(mockRuntime.reload).not.toHaveBeenCalled();
    });

    it('should handle reload errors without throwing', () => {
      mockRuntime.reload.mockImplementationOnce(() => {
        throw new Error('Reload failed');
      });

      const alarmListenerCall = mockAlarms.onAlarm.addListener.mock.calls[0];
      const alarmListener = alarmListenerCall?.[0];

      if (!alarmListener) {
        throw new Error('Alarm listener not registered');
      }

      expect(() => {
        alarmListener({ name: 'self-heal-reload' });
      }).not.toThrow();
    });
  });
});
