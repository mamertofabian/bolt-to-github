/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// Mock chrome API
const mockChromeRuntime = {
  id: 'test-extension-id',
  sendMessage: vi.fn().mockResolvedValue({ success: true }),
  reload: vi.fn(),
};

const mockChromeStorage = {
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
  sync: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const mockChromeTabs = {
  query: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  sendMessage: vi.fn(),
  get: vi.fn(),
  onUpdated: {
    addListener: vi.fn(),
  },
  onActivated: {
    addListener: vi.fn(),
  },
};

const mockChromeAlarms = {
  create: vi.fn(),
  clear: vi.fn(),
  onAlarm: {
    addListener: vi.fn(),
  },
};

const mockChromeScripting = {
  executeScript: vi.fn().mockResolvedValue([]),
};

global.chrome = {
  runtime: mockChromeRuntime,
  storage: mockChromeStorage,
  tabs: mockChromeTabs,
  alarms: mockChromeAlarms,
  scripting: mockChromeScripting,
} as any;

// Import after mocking
import { SupabaseAuthService } from '../SupabaseAuthService';

describe('SupabaseAuthService - Extension Reload Logic', () => {
  let authService: SupabaseAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton instance before each test
    (SupabaseAuthService as any).instance = null;
    authService = SupabaseAuthService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
    authService.cleanup();
  });

  describe('Reload Tracking', () => {
    test('should initialize with zero consecutive auth failures', () => {
      // Access private property for testing
      const failures = (authService as any).consecutiveAuthFailures;
      expect(failures).toBe(0);
    });

    test('should track consecutive auth failures', async () => {
      // Simulate auth failure by calling triggerReAuthentication multiple times
      // Mock the methods to prevent actual side effects
      vi.spyOn(authService as any, 'logout').mockResolvedValue(undefined);
      vi.spyOn(authService as any, 'showReauthenticationModal').mockResolvedValue(undefined);

      // First failure
      await (authService as any).triggerReAuthentication('Test failure 1');
      expect((authService as any).consecutiveAuthFailures).toBe(1);

      // Second failure
      await (authService as any).triggerReAuthentication('Test failure 2');
      expect((authService as any).consecutiveAuthFailures).toBe(2);

      // Third failure
      await (authService as any).triggerReAuthentication('Test failure 3');
      expect((authService as any).consecutiveAuthFailures).toBe(3);
    });

    test('should request extension reload after MAX_AUTH_FAILURES_BEFORE_RELOAD', async () => {
      // Mock methods
      vi.spyOn(authService as any, 'logout').mockResolvedValue(undefined);
      vi.spyOn(authService as any, 'showReauthenticationModal').mockResolvedValue(undefined);
      const requestReloadSpy = vi.spyOn(authService as any, 'requestExtensionReload');

      // Trigger auth failures up to threshold
      const maxFailures = (authService as any).MAX_AUTH_FAILURES_BEFORE_RELOAD;

      for (let i = 0; i < maxFailures; i++) {
        await (authService as any).triggerReAuthentication(`Test failure ${i + 1}`);
      }

      // Should have called requestExtensionReload
      expect(requestReloadSpy).toHaveBeenCalledOnce();
    });

    test('should reset consecutive failures on successful authentication', async () => {
      // Simulate failures first
      vi.spyOn(authService as any, 'logout').mockResolvedValue(undefined);
      vi.spyOn(authService as any, 'showReauthenticationModal').mockResolvedValue(undefined);

      await (authService as any).triggerReAuthentication('Test failure');
      expect((authService as any).consecutiveAuthFailures).toBe(1);

      // Simulate successful auth by updating auth state
      (authService as any).updateAuthState({
        isAuthenticated: true,
        user: { id: 'test-user', email: 'test@example.com' },
        subscription: { isActive: false, plan: 'free' },
      });

      // Failures should be reset
      expect((authService as any).consecutiveAuthFailures).toBe(0);
    });
  });

  describe('Extension Reload Request', () => {
    test('should send RELOAD_EXTENSION message to background', async () => {
      const sendMessageSpy = mockChromeRuntime.sendMessage as Mock;

      await (authService as any).requestExtensionReload();

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: 'RELOAD_EXTENSION',
        data: {
          reason: 'Multiple authentication failures - clearing stale state',
        },
      });
    });

    test('should record last reload timestamp', async () => {
      const beforeReload = Date.now();
      await (authService as any).requestExtensionReload();
      const afterReload = Date.now();

      const lastReload = (authService as any).lastReloadTimestamp;

      expect(lastReload).toBeGreaterThanOrEqual(beforeReload);
      expect(lastReload).toBeLessThanOrEqual(afterReload);
    });

    test('should prevent reload loops by enforcing minimum time between reloads', async () => {
      const sendMessageSpy = mockChromeRuntime.sendMessage as Mock;

      // Clear any messages from initialization
      sendMessageSpy.mockClear();

      // First reload should work
      await (authService as any).requestExtensionReload();

      // Check that RELOAD_EXTENSION message was sent
      const reloadCalls = sendMessageSpy.mock.calls.filter(
        (call) => call[0]?.type === 'RELOAD_EXTENSION'
      );
      expect(reloadCalls.length).toBe(1);

      sendMessageSpy.mockClear();

      // Immediate second reload should be prevented
      await (authService as any).requestExtensionReload();

      // Check that no RELOAD_EXTENSION message was sent
      const secondReloadCalls = sendMessageSpy.mock.calls.filter(
        (call) => call[0]?.type === 'RELOAD_EXTENSION'
      );
      expect(secondReloadCalls.length).toBe(0);
    });

    test('should allow reload after minimum time has passed', async () => {
      const sendMessageSpy = mockChromeRuntime.sendMessage as Mock;

      // First reload
      await (authService as any).requestExtensionReload();
      expect(sendMessageSpy).toHaveBeenCalledTimes(1);

      sendMessageSpy.mockClear();

      // Set last reload to 6 minutes ago (beyond the 5 minute minimum)
      const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
      (authService as any).lastReloadTimestamp = sixMinutesAgo;

      // Second reload should now be allowed
      await (authService as any).requestExtensionReload();
      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    });

    test('should handle sendMessage errors gracefully', async () => {
      const sendMessageSpy = mockChromeRuntime.sendMessage as Mock;
      sendMessageSpy.mockRejectedValueOnce(new Error('Message failed'));

      // Should not throw
      await expect((authService as any).requestExtensionReload()).resolves.not.toThrow();
    });
  });

  describe('Integration with triggerReAuthentication', () => {
    test('should not trigger reload on first auth failure', async () => {
      vi.spyOn(authService as any, 'logout').mockResolvedValue(undefined);
      vi.spyOn(authService as any, 'showReauthenticationModal').mockResolvedValue(undefined);
      const requestReloadSpy = vi.spyOn(authService as any, 'requestExtensionReload');

      await (authService as any).triggerReAuthentication('First failure');

      expect(requestReloadSpy).not.toHaveBeenCalled();
    });

    test('should trigger reload only after threshold is reached', async () => {
      vi.spyOn(authService as any, 'logout').mockResolvedValue(undefined);
      vi.spyOn(authService as any, 'showReauthenticationModal').mockResolvedValue(undefined);
      const requestReloadSpy = vi.spyOn(authService as any, 'requestExtensionReload');

      const maxFailures = (authService as any).MAX_AUTH_FAILURES_BEFORE_RELOAD;

      // Trigger failures just below threshold
      for (let i = 0; i < maxFailures - 1; i++) {
        await (authService as any).triggerReAuthentication(`Failure ${i + 1}`);
      }

      expect(requestReloadSpy).not.toHaveBeenCalled();

      // One more should trigger reload
      await (authService as any).triggerReAuthentication(`Failure ${maxFailures}`);

      expect(requestReloadSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Cleanup', () => {
    test('should reset failure counter on cleanup', () => {
      // Set some failures
      (authService as any).consecutiveAuthFailures = 5;

      authService.cleanup();

      expect((authService as any).consecutiveAuthFailures).toBe(0);
    });

    test('should preserve reload timestamp on cleanup', () => {
      const timestamp = Date.now();
      (authService as any).lastReloadTimestamp = timestamp;

      authService.cleanup();

      // Timestamp should NOT be reset (to prevent reload loops)
      expect((authService as any).lastReloadTimestamp).toBe(timestamp);
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid successive failures correctly', async () => {
      vi.spyOn(authService as any, 'logout').mockResolvedValue(undefined);
      vi.spyOn(authService as any, 'showReauthenticationModal').mockResolvedValue(undefined);
      const requestReloadSpy = vi.spyOn(authService as any, 'requestExtensionReload');

      const maxFailures = (authService as any).MAX_AUTH_FAILURES_BEFORE_RELOAD;

      // Trigger multiple failures rapidly
      const promises = [];
      for (let i = 0; i < maxFailures + 2; i++) {
        promises.push((authService as any).triggerReAuthentication(`Rapid failure ${i + 1}`));
      }

      await Promise.all(promises);

      // Should only request reload once despite multiple failures beyond threshold
      expect(requestReloadSpy).toHaveBeenCalledTimes(1);
    });

    test('should not count failures after reload is requested', async () => {
      vi.spyOn(authService as any, 'logout').mockResolvedValue(undefined);
      vi.spyOn(authService as any, 'showReauthenticationModal').mockResolvedValue(undefined);
      vi.spyOn(authService as any, 'requestExtensionReload');

      const maxFailures = (authService as any).MAX_AUTH_FAILURES_BEFORE_RELOAD;

      // Reach threshold
      for (let i = 0; i < maxFailures; i++) {
        await (authService as any).triggerReAuthentication(`Failure ${i + 1}`);
      }

      const failuresAfterReload = (authService as any).consecutiveAuthFailures;

      // More failures after reload should not increment counter further
      await (authService as any).triggerReAuthentication('Post-reload failure');

      expect((authService as any).consecutiveAuthFailures).toBe(failuresAfterReload);
    });
  });
});
