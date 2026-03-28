/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

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
  sendMessage: vi.fn().mockResolvedValue(undefined),
  onUpdated: {
    addListener: vi.fn(),
  },
  onActivated: {
    addListener: vi.fn(),
  },
};

const mockChromeAlarms = {
  create: vi.fn(),
  clear: vi.fn().mockResolvedValue(true),
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

// Mock fetch globally
global.fetch = vi.fn();

import { SupabaseAuthService } from '../SupabaseAuthService';

describe('SupabaseAuthService - Auth Recovery (401/403, alarms, listener guards)', () => {
  let authService: SupabaseAuthService;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2024-06-15T12:00:00.000Z') });
    vi.clearAllMocks();

    (SupabaseAuthService as any).instance = null;
    authService = SupabaseAuthService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    authService.cleanup();
  });

  describe('401 handling in verifyTokenAndGetUser', () => {
    test('should attempt token refresh on 401 response', async () => {
      const refreshSpy = vi.spyOn(authService as any, 'refreshStoredToken').mockResolvedValue(null);

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'unauthorized' }),
      });

      const result = await (authService as any).verifyTokenAndGetUser('expired-token');

      expect(result).toBeNull();
      expect(refreshSpy).toHaveBeenCalled();
    });

    test('should retry verification with refreshed token on 401', async () => {
      const refreshSpy = vi
        .spyOn(authService as any, 'refreshStoredToken')
        .mockResolvedValueOnce('fresh-token');

      // First call: 401
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'unauthorized' }),
      });
      // Second call (retry with fresh token): success
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'user-123',
            email: 'test@example.com',
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          }),
      });

      const result = await (authService as any).verifyTokenAndGetUser('expired-token');

      expect(refreshSpy).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result.email).toBe('test@example.com');
    });

    test('should handle session_not_found on 401 by invalidating session', async () => {
      const handleInvalidationSpy = vi
        .spyOn(authService as any, 'handleSessionInvalidation')
        .mockResolvedValue(undefined);

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error_code: 'session_not_found' }),
      });

      const result = await (authService as any).verifyTokenAndGetUser('some-token');

      expect(result).toBeNull();
      expect(handleInvalidationSpy).toHaveBeenCalled();
    });

    test('should attempt refresh on 403 with bad_jwt error', async () => {
      const refreshSpy = vi.spyOn(authService as any, 'refreshStoredToken').mockResolvedValue(null);

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error_code: 'bad_jwt' }),
      });

      await (authService as any).verifyTokenAndGetUser('expired-token');

      expect(refreshSpy).toHaveBeenCalled();
    });

    test('should attempt refresh on 403 with expired message', async () => {
      const refreshSpy = vi.spyOn(authService as any, 'refreshStoredToken').mockResolvedValue(null);

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({ error_description: 'Token has expired, please re-authenticate' }),
      });

      await (authService as any).verifyTokenAndGetUser('expired-token');

      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe('401 handling in getSubscriptionStatus', () => {
    test('should attempt token refresh on 401 response during subscription check', async () => {
      const refreshSpy = vi.spyOn(authService as any, 'refreshStoredToken').mockResolvedValue(null);

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'unauthorized' }),
      });

      const user = { id: 'u1', email: 'a@b.c', created_at: '', updated_at: '' };
      const result = await (authService as any).getSubscriptionStatus('expired-token', user);

      expect(result).toEqual({ isActive: false, plan: 'free' });
      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe('Duplicate listener registration guards', () => {
    test('should only register initial auth detection listeners once', () => {
      const addListenerCalls = mockChromeTabs.onUpdated.addListener.mock.calls.length;

      // Force non-authenticated state
      (authService as any).authState.isAuthenticated = false;
      (authService as any).initialAuthDetectionSetup = false;

      (authService as any).setupInitialAuthDetection();
      const afterFirst = mockChromeTabs.onUpdated.addListener.mock.calls.length;

      (authService as any).setupInitialAuthDetection();
      const afterSecond = mockChromeTabs.onUpdated.addListener.mock.calls.length;

      // Second call should NOT add more listeners
      expect(afterSecond - addListenerCalls).toBe(afterFirst - addListenerCalls);
    });

    test('should only register subscription detection listeners once', () => {
      const addListenerCalls = mockChromeTabs.onUpdated.addListener.mock.calls.length;

      (authService as any).subscriptionDetectionSetup = false;

      (authService as any).setupSubscriptionUpgradeDetection();
      const afterFirst = mockChromeTabs.onUpdated.addListener.mock.calls.length;

      (authService as any).setupSubscriptionUpgradeDetection();
      const afterSecond = mockChromeTabs.onUpdated.addListener.mock.calls.length;

      expect(afterSecond - addListenerCalls).toBe(afterFirst - addListenerCalls);
    });

    test('cleanup should reset listener guards allowing re-registration', () => {
      (authService as any).initialAuthDetectionSetup = true;
      (authService as any).subscriptionDetectionSetup = true;

      authService.cleanup();

      expect((authService as any).initialAuthDetectionSetup).toBe(false);
      expect((authService as any).subscriptionDetectionSetup).toBe(false);
    });
  });

  describe('Chrome alarms for periodic auth checks', () => {
    test('should use chrome.alarms for authenticated mode', () => {
      mockChromeAlarms.create.mockClear();

      (authService as any).authState.isAuthenticated = true;
      (authService as any).authState.subscription = { isActive: false, plan: 'free' };

      (authService as any).startPeriodicChecks();

      expect(mockChromeAlarms.create).toHaveBeenCalledWith('auth-periodic-check', {
        periodInMinutes: expect.any(Number),
      });
    });

    test('should use chrome.alarms for premium mode', () => {
      mockChromeAlarms.create.mockClear();

      (authService as any).authState.isAuthenticated = true;
      (authService as any).authState.subscription = { isActive: true, plan: 'monthly' };

      (authService as any).startPeriodicChecks();

      expect(mockChromeAlarms.create).toHaveBeenCalledWith('auth-periodic-check', {
        periodInMinutes: expect.any(Number),
      });
    });

    test('should use setInterval for unauthenticated short-interval modes', () => {
      mockChromeAlarms.create.mockClear();

      (authService as any).authState.isAuthenticated = false;
      (authService as any).isInitialOnboarding = true;

      (authService as any).startPeriodicChecks();

      // Should NOT create an alarm for short-interval mode
      expect(mockChromeAlarms.create).not.toHaveBeenCalledWith(
        'auth-periodic-check',
        expect.anything()
      );
      // Should have a setInterval active
      expect((authService as any).checkInterval).not.toBeNull();
    });

    test('should clear alarm when switching to short-interval mode', () => {
      mockChromeAlarms.clear.mockClear();

      (authService as any).authState.isAuthenticated = false;
      (authService as any).isInitialOnboarding = false;
      (authService as any).isPostConnectionMode = false;

      (authService as any).startPeriodicChecks();

      expect(mockChromeAlarms.clear).toHaveBeenCalledWith('auth-periodic-check');
    });

    test('cleanup should clear auth alarm', () => {
      mockChromeAlarms.clear.mockClear();

      authService.cleanup();

      expect(mockChromeAlarms.clear).toHaveBeenCalledWith('auth-periodic-check');
    });
  });

  describe('30-day refresh token validation', () => {
    test('should return null when refresh token is older than 30 days', async () => {
      const now = Date.now();
      const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;

      mockChromeStorage.local.get.mockResolvedValueOnce({
        supabaseToken: 'expired-access-token',
        supabaseRefreshToken: 'old-refresh-token',
        supabaseTokenExpiry: now - 1000, // expired
        refreshTokenIssuedAt: thirtyOneDaysAgo,
      });

      const result = await (authService as any).getValidStoredToken();

      expect(result).toBeNull();
      // Should clear tokens
      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith(
        expect.arrayContaining([
          'supabaseToken',
          'supabaseRefreshToken',
          'supabaseTokenExpiry',
          'refreshTokenIssuedAt',
        ])
      );
    });

    test('should attempt refresh when token is within 30-day window', async () => {
      const now = Date.now();
      const twentyDaysAgo = now - 20 * 24 * 60 * 60 * 1000;

      mockChromeStorage.local.get.mockResolvedValueOnce({
        supabaseToken: 'expired-access-token',
        supabaseRefreshToken: 'valid-refresh-token',
        supabaseTokenExpiry: now - 1000, // expired
        refreshTokenIssuedAt: twentyDaysAgo,
      });

      const refreshSpy = vi
        .spyOn(authService as any, 'refreshStoredToken')
        .mockResolvedValue('new-token');

      const result = await (authService as any).getValidStoredToken();

      expect(refreshSpy).toHaveBeenCalled();
      expect(result).toBe('new-token');
    });

    test('should store refreshTokenIssuedAt when storing token data', async () => {
      mockChromeStorage.local.set.mockClear();

      await (authService as any).storeTokenData({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          supabaseToken: 'new-access',
          supabaseRefreshToken: 'new-refresh',
          refreshTokenIssuedAt: expect.any(Number),
        })
      );
    });
  });
});
