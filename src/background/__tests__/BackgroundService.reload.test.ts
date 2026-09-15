import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundService } from '../BackgroundService';

const mockForceCheck = vi.fn().mockResolvedValue(undefined);
const mockForceSubscriptionRevalidation = vi.fn().mockResolvedValue(true);
const mockForceSyncToPopup = vi.fn().mockResolvedValue(undefined);
const mockGetAuthState = vi.fn().mockReturnValue({ isAuthenticated: true });
const mockSyncGitHubApp = vi.fn().mockResolvedValue(true);

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
      forceCheck: mockForceCheck,
      forceSubscriptionRevalidation: mockForceSubscriptionRevalidation,
      forceSyncToPopup: mockForceSyncToPopup,
      getAuthState: mockGetAuthState,
      addAuthStateListener: vi.fn(),
      removeAuthStateListener: vi.fn(),
      enterPostConnectionMode: vi.fn(),
      syncGitHubApp: mockSyncGitHubApp,
      validateSubscriptionStatus: vi.fn().mockResolvedValue(true),
      logout: vi.fn().mockResolvedValue(undefined),
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

const mockAction = {
  openPopup: vi.fn().mockResolvedValue(undefined),
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
  action: mockAction,
} as never;

describe('BackgroundService - Extension Reload Behavior', () => {
  let service: BackgroundService;
  let runtimeMessageListener: (
    message: { type: string; action?: string; feature?: string; data?: { reason?: string } },
    sender: unknown,
    sendResponse: (response: { success: boolean; error?: string }) => void
  ) => boolean | void;
  let runtimeConnectListener: (port: {
    name: string;
    sender?: { tab?: { id?: number } };
    postMessage: ReturnType<typeof vi.fn>;
    onDisconnect: { addListener: ReturnType<typeof vi.fn> };
    onMessage: { addListener: ReturnType<typeof vi.fn> };
  }) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockForceCheck.mockResolvedValue(undefined);
    mockForceSubscriptionRevalidation.mockResolvedValue(true);
    mockForceSyncToPopup.mockResolvedValue(undefined);
    mockGetAuthState.mockReturnValue({ isAuthenticated: true });
    mockSyncGitHubApp.mockResolvedValue(true);
    mockAction.openPopup.mockResolvedValue(undefined);
    service = new BackgroundService();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const listenerCall = mockRuntime.onMessage.addListener.mock.calls[0];
    if (!listenerCall?.[0]) {
      throw new Error('Runtime message listener not registered');
    }
    runtimeMessageListener = listenerCall[0];

    const connectListenerCall = mockRuntime.onConnect.addListener.mock.calls[0];
    if (!connectListenerCall?.[0]) {
      throw new Error('Runtime connect listener not registered');
    }
    runtimeConnectListener = connectListenerCall[0];
    mockGetAuthState.mockClear();
    mockSyncGitHubApp.mockClear();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('when extension reload is requested', () => {
    it('should respond successfully when reload request is processed', async () => {
      const sendResponse = vi.fn();

      const returnValue = runtimeMessageListener(
        { type: 'RELOAD_EXTENSION', data: { reason: 'auth failure' } },
        {},
        sendResponse
      );

      expect(returnValue).toBe(true);

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

      const returnValue = runtimeMessageListener(
        { type: 'RELOAD_EXTENSION', data: { reason: 'test' } },
        {},
        sendResponse
      );

      expect(returnValue).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('background reload requests notify bolt tabs while scheduling the self-heal alarm', async () => {
      mockTabs.query.mockResolvedValueOnce([{ id: 7, url: 'https://bolt.new/~/test-project' }]);
      const sendResponse = vi.fn();

      const returnValue = runtimeMessageListener(
        { type: 'RELOAD_EXTENSION', data: { reason: 'auth failure' } },
        {},
        sendResponse
      );

      expect(returnValue).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockTabs.query).toHaveBeenCalledWith({ url: 'https://bolt.new/*' });
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(7, {
        type: 'SHOW_EXTENSION_RELOAD_NOTIFICATION',
        data: {
          message: 'Extension needs to restart to fix authentication. Restarting in 3 seconds...',
          countdown: 3,
        },
      });
      expect(mockAlarms.create).toHaveBeenCalledWith('self-heal-reload', {
        delayInMinutes: 3 / 60,
      });
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('runtime listener returns literal true synchronously for async response branches', () => {
      const sendResponse = vi.fn();

      const reloadReturnValue = runtimeMessageListener(
        { type: 'RELOAD_EXTENSION', data: { reason: 'auth failure' } },
        {},
        sendResponse
      );
      const forceAuthCheckReturnValue = runtimeMessageListener(
        { type: 'FORCE_AUTH_CHECK' },
        {},
        sendResponse
      );
      const forceSubscriptionRefreshReturnValue = runtimeMessageListener(
        { type: 'FORCE_SUBSCRIPTION_REFRESH' },
        {},
        sendResponse
      );
      const unmatchedReturnValue = runtimeMessageListener(
        { type: 'UNKNOWN_RUNTIME_MESSAGE' },
        {},
        sendResponse
      );

      expect(reloadReturnValue).toBe(true);
      expect(forceAuthCheckReturnValue).toBe(true);
      expect(forceSubscriptionRefreshReturnValue).toBe(true);
      expect(unmatchedReturnValue).toBe(false);
    });

    it('runtime listener sends failure response when async branch rejects', async () => {
      mockForceSyncToPopup.mockRejectedValueOnce(new Error('Popup sync failed'));
      mockForceCheck.mockRejectedValueOnce(new Error('Auth check failed'));
      mockForceSubscriptionRevalidation.mockRejectedValueOnce(
        new Error('Subscription refresh failed')
      );
      mockAction.openPopup.mockRejectedValueOnce(new Error('Popup open failed'));
      const sendResponse = vi.fn();

      const popupSyncReturnValue = runtimeMessageListener(
        { type: 'FORCE_POPUP_SYNC' },
        {},
        sendResponse
      );
      const authCheckReturnValue = runtimeMessageListener(
        { type: 'FORCE_AUTH_CHECK' },
        {},
        sendResponse
      );
      const subscriptionRefreshReturnValue = runtimeMessageListener(
        { type: 'FORCE_SUBSCRIPTION_REFRESH' },
        {},
        sendResponse
      );
      const upgradeModalReturnValue = runtimeMessageListener(
        { type: 'SHOW_UPGRADE_MODAL', feature: 'issues' },
        {},
        sendResponse
      );

      expect(popupSyncReturnValue).toBe(true);
      expect(authCheckReturnValue).toBe(true);
      expect(subscriptionRefreshReturnValue).toBe(true);
      expect(upgradeModalReturnValue).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Popup sync failed',
      });
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Auth check failed',
      });
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Subscription refresh failed',
      });
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Popup open failed',
      });
    });

    it('runtime listener delegates background auth router messages through one listener', async () => {
      const sendResponse = vi.fn();

      const returnValue = runtimeMessageListener({ type: 'GET_AUTH_STATE' }, {}, sendResponse);

      expect(returnValue).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRuntime.onMessage.addListener).toHaveBeenCalledTimes(1);
      expect(mockGetAuthState).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        authState: { isAuthenticated: true },
      });
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

  describe('when Push to GitHub is requested', () => {
    it('disconnected runtime push returns an error before dispatching to the Bolt tab', async () => {
      mockSyncGitHubApp.mockResolvedValueOnce(false);
      const postMessage = vi.fn();
      runtimeConnectListener({
        name: 'bolt-content',
        sender: { tab: { id: 7 } },
        postMessage,
        onDisconnect: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
      });
      const sendResponse = vi.fn();

      const returnValue = runtimeMessageListener(
        { action: 'PUSH_TO_GITHUB', type: '' },
        {},
        sendResponse
      );

      expect(returnValue).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Connect GitHub at bolt2github.com before using GitHub features.',
      });
      expect(mockTabs.query).not.toHaveBeenCalled();
      expect(postMessage).not.toHaveBeenCalled();
    });

    it('push message responds with failure when no active Bolt tab exists', async () => {
      mockTabs.query.mockResolvedValueOnce([{ id: 7, url: 'https://example.com/' }]);
      const sendResponse = vi.fn();

      const returnValue = runtimeMessageListener(
        { action: 'PUSH_TO_GITHUB', type: '' },
        {},
        sendResponse
      );

      expect(returnValue).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No active Bolt tab found',
      });
    });

    it('push message responds with failure when the Bolt tab has no connected port', async () => {
      mockTabs.query.mockResolvedValueOnce([{ id: 7, url: 'https://bolt.new/~/test-project' }]);
      const sendResponse = vi.fn();

      const returnValue = runtimeMessageListener(
        { action: 'PUSH_TO_GITHUB', type: '' },
        {},
        sendResponse
      );

      expect(returnValue).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No connected Bolt content script',
      });
    });

    it('push message responds successfully after dispatching to a connected Bolt port', async () => {
      mockTabs.query.mockResolvedValueOnce([{ id: 7, url: 'https://bolt.new/~/test-project' }]);
      const postMessage = vi.fn();
      runtimeConnectListener({
        name: 'bolt-content',
        sender: { tab: { id: 7 } },
        postMessage,
        onDisconnect: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
      });
      const sendResponse = vi.fn();

      const returnValue = runtimeMessageListener(
        { action: 'PUSH_TO_GITHUB', type: '' },
        {},
        sendResponse
      );

      expect(returnValue).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(postMessage).toHaveBeenCalledWith({ type: 'PUSH_TO_GITHUB' });
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });
});
