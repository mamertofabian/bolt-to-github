/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundService } from '../BackgroundService';
import { analytics } from '../../services/AnalyticsService';

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

vi.mock('../../services/AnalyticsService', () => ({
  analytics: {
    trackEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockAlarms = {
  create: vi.fn().mockResolvedValue(undefined),
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
  id: 'test-extension-id',
  reload: vi.fn(),
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
  query: vi.fn(),
  sendMessage: vi.fn(),
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

describe('BackgroundService - Extension Reload Functionality', () => {
  let service: BackgroundService;
  let messageListener: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockStorage.sync.get.mockResolvedValue({});
    mockStorage.local.get.mockResolvedValue({});
    mockTabs.query.mockResolvedValue([]);
    mockTabs.sendMessage.mockResolvedValue(undefined);

    service = new BackgroundService();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const addListenerCalls = mockRuntime.onMessage.addListener.mock.calls;
    if (addListenerCalls.length > 0) {
      messageListener = addListenerCalls[0][0];
    } else {
      throw new Error('No message listener was registered by BackgroundService');
    }
  });

  afterEach(() => {
    service.destroy();
  });

  describe('RELOAD_EXTENSION Message Handler', () => {
    it('should handle RELOAD_EXTENSION message successfully', async () => {
      const sendResponse = vi.fn();
      const message = {
        type: 'RELOAD_EXTENSION',
        data: {
          reason: 'Multiple authentication failures - clearing stale state',
        },
      };

      messageListener(message, {}, sendResponse);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(analytics.trackEvent).toHaveBeenCalledWith({
        category: 'authentication',
        action: 'extension_reload_triggered',
        label: expect.stringContaining('Multiple authentication failures'),
      });

      expect(mockTabs.query).toHaveBeenCalledWith({ url: 'https://bolt.new/*' });

      expect(mockAlarms.create).toHaveBeenCalledWith('self-heal-reload', {
        delayInMinutes: expect.any(Number),
      });

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should send notifications to all bolt.new tabs', async () => {
      const mockTabs_result = [
        { id: 1, url: 'https://bolt.new/project1' },
        { id: 2, url: 'https://bolt.new/project2' },
        { id: 3, url: 'https://bolt.new/' },
      ];

      mockTabs.query.mockResolvedValue(mockTabs_result);
      mockTabs.sendMessage.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      const message = {
        type: 'RELOAD_EXTENSION',
        data: { reason: 'Test reason' },
      };

      messageListener(message, {}, sendResponse);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockTabs.sendMessage).toHaveBeenCalledTimes(3);

      expect(mockTabs.sendMessage).toHaveBeenCalledWith(1, {
        type: 'SHOW_EXTENSION_RELOAD_NOTIFICATION',
        data: {
          message: expect.stringContaining('Extension needs to restart'),
          countdown: 3,
        },
      });
    });

    it('should handle tabs query failure gracefully', async () => {
      mockTabs.query.mockRejectedValue(new Error('Query failed'));

      const sendResponse = vi.fn();
      const message = {
        type: 'RELOAD_EXTENSION',
        data: { reason: 'Test reason' },
      };

      messageListener(message, {}, sendResponse);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockAlarms.create).toHaveBeenCalledWith('self-heal-reload', {
        delayInMinutes: expect.any(Number),
      });

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should handle tab sendMessage failures gracefully', async () => {
      mockTabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockTabs.sendMessage
        .mockRejectedValueOnce(new Error('Tab 1 failed'))
        .mockResolvedValueOnce(undefined);

      const sendResponse = vi.fn();
      const message = {
        type: 'RELOAD_EXTENSION',
        data: { reason: 'Test reason' },
      };

      messageListener(message, {}, sendResponse);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockAlarms.create).toHaveBeenCalledWith('self-heal-reload', {
        delayInMinutes: expect.any(Number),
      });

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should handle alarm creation failure with immediate reload fallback', async () => {
      mockAlarms.create.mockRejectedValueOnce(new Error('Alarm creation failed'));

      const sendResponse = vi.fn();
      const message = {
        type: 'RELOAD_EXTENSION',
        data: { reason: 'Test reason' },
      };

      messageListener(message, {}, sendResponse);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockRuntime.reload).toHaveBeenCalled();

      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      mockAlarms.create.mockResolvedValue(undefined);
    });

    it('should handle complete failure gracefully', async () => {
      mockTabs.query.mockRejectedValueOnce(new Error('Query failed'));
      mockAlarms.create.mockRejectedValueOnce(new Error('Alarm failed'));
      mockRuntime.reload.mockImplementationOnce(() => {
        throw new Error('Reload failed');
      });

      const sendResponse = vi.fn();
      const message = {
        type: 'RELOAD_EXTENSION',
        data: { reason: 'Test reason' },
      };

      messageListener(message, {}, sendResponse);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sendResponse).toHaveBeenCalled();

      mockTabs.query.mockResolvedValue([]);
      mockAlarms.create.mockResolvedValue(undefined);
      mockRuntime.reload.mockReset();
    });

    it('should include reason in analytics tracking', async () => {
      const reasons = [
        'Multiple authentication failures - clearing stale state',
        'Token expired',
        'Service worker restart',
      ];

      for (const reason of reasons) {
        (analytics.trackEvent as any).mockClear();

        const sendResponse = vi.fn();
        const message = {
          type: 'RELOAD_EXTENSION',
          data: { reason },
        };

        messageListener(message, {}, sendResponse);
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(analytics.trackEvent).toHaveBeenCalledWith({
          category: 'authentication',
          action: 'extension_reload_triggered',
          label: expect.stringContaining(reason),
        });
      }
    });

    it('should use correct delay for alarm (3 seconds)', async () => {
      const sendResponse = vi.fn();
      const message = {
        type: 'RELOAD_EXTENSION',
        data: { reason: 'Test reason' },
      };

      messageListener(message, {}, sendResponse);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockAlarms.create).toHaveBeenCalledWith('self-heal-reload', {
        delayInMinutes: 3 / 60,
      });
    });
  });

  describe('Self-Heal Alarm Handler', () => {
    it('should reload extension when self-heal alarm triggers', () => {
      const alarmListenerCall = mockAlarms.onAlarm.addListener.mock.calls[0];
      const alarmListener = alarmListenerCall ? alarmListenerCall[0] : null;

      expect(alarmListener).toBeDefined();

      alarmListener({ name: 'self-heal-reload' });

      expect(mockRuntime.reload).toHaveBeenCalled();
    });

    it('should handle reload errors gracefully', () => {
      mockRuntime.reload.mockImplementation(() => {
        throw new Error('Reload failed');
      });

      const alarmListenerCall = mockAlarms.onAlarm.addListener.mock.calls[0];
      const alarmListener = alarmListenerCall ? alarmListenerCall[0] : null;

      expect(() => {
        alarmListener({ name: 'self-heal-reload' });
      }).not.toThrow();
    });

    it('should ignore other alarm types', () => {
      const alarmListenerCall = mockAlarms.onAlarm.addListener.mock.calls[0];
      const alarmListener = alarmListenerCall ? alarmListenerCall[0] : null;

      mockRuntime.reload.mockClear();

      alarmListener({ name: 'keepAlive' });
      alarmListener({ name: 'logRotation' });
      alarmListener({ name: 'bolt-project-sync' });

      expect(mockRuntime.reload).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing data in reload message', async () => {
      const sendResponse = vi.fn();
      const message: any = {
        type: 'RELOAD_EXTENSION',
        data: {},
      };

      messageListener(message, {}, sendResponse);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(analytics.trackEvent).toHaveBeenCalledWith({
        category: 'authentication',
        action: 'extension_reload_triggered',
        label: expect.stringContaining('unknown'),
      });

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should handle tabs without IDs', async () => {
      mockTabs.query.mockResolvedValue([{ id: 1 }, { id: null }, { id: undefined }, { id: 2 }]);

      const sendResponse = vi.fn();
      const message = {
        type: 'RELOAD_EXTENSION',
        data: { reason: 'Test reason' },
      };

      messageListener(message, {}, sendResponse);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockTabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(1, expect.any(Object));
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(2, expect.any(Object));
    });

    it('should handle empty tabs list', async () => {
      mockTabs.query.mockResolvedValue([]);

      const sendResponse = vi.fn();
      const message = {
        type: 'RELOAD_EXTENSION',
        data: { reason: 'Test reason' },
      };

      messageListener(message, {}, sendResponse);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockTabs.sendMessage).not.toHaveBeenCalled();

      expect(mockAlarms.create).toHaveBeenCalled();
    });
  });

  describe('Integration with Other Message Types', () => {
    it('should not interfere with other message types', async () => {
      const sendResponse = vi.fn();

      const otherMessages = [
        { type: 'GITHUB_SETTINGS_CHANGED' },
        { type: 'UPLOAD_STATUS' },
        { type: 'HEARTBEAT' },
      ];

      for (const msg of otherMessages) {
        mockAlarms.create.mockClear();
        messageListener(msg, {}, sendResponse);
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAlarms.create).not.toHaveBeenCalledWith('self-heal-reload', expect.any(Object));
    });
  });
});
