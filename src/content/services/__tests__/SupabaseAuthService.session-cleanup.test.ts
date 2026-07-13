/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Behavioral tests for manifest: preserve-github-app-config-on-reauth
 *
 * Contract under test: transient Supabase session expiry clears only Supabase
 * session artifacts. GitHub App linkage is user/account configuration and must
 * survive re-authentication cleanup. Explicit logout remains the full account
 * switch path and must still clear GitHub App configuration.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

type StorageData = Record<string, unknown>;

const SESSION_KEYS = [
  'supabaseToken',
  'supabaseRefreshToken',
  'supabaseTokenExpiry',
  'supabaseAuthState',
  'refreshTokenIssuedAt',
  'extensionSessionMinted',
  'extensionSessionMintedAt',
];

const GITHUB_APP_KEYS = [
  'githubAppInstallationId',
  'githubAppUsername',
  'githubAppAccessToken',
  'githubAppExpiresAt',
  'githubAppRefreshToken',
  'githubAppRefreshTokenExpiresAt',
  'githubAppUserId',
  'githubAppAvatarUrl',
  'githubAppScopes',
  'github_app_token_12345',
  'github_app_installation_12345',
];

let localStorageData: StorageData = {};

const mockChromeRuntime = {
  id: 'test-extension-id',
  sendMessage: vi.fn().mockResolvedValue({ success: true }),
  reload: vi.fn(),
};

const mockChromeStorage = {
  local: {
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
      if (keys === undefined || keys === null) {
        return { ...localStorageData };
      }

      if (typeof keys === 'string') {
        return { [keys]: localStorageData[keys] };
      }

      if (Array.isArray(keys)) {
        return keys.reduce<StorageData>((result, key) => {
          result[key] = localStorageData[key];
          return result;
        }, {});
      }

      return Object.keys(keys).reduce<StorageData>((result, key) => {
        result[key] = localStorageData[key] ?? keys[key];
        return result;
      }, {});
    }),
    set: vi.fn(async (items: StorageData) => {
      localStorageData = { ...localStorageData, ...items };
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        delete localStorageData[key];
      }
    }),
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
  create: vi.fn().mockResolvedValue({ id: 99 }),
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

global.fetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);

  if (url.includes('/auth/v1/user')) {
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'user-123',
          email: 'user@example.com',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        }),
    } as Response;
  }

  if (url.includes('/rest/v1/rpc/get_subscription_status')) {
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ subscription_status: 'inactive', plan_name: 'free' }]),
    } as Response;
  }

  if (url.includes('/functions/v1/get-github-token')) {
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          type: 'github_app',
          access_token: 'github-app-token',
          installation_id: 12345,
          github_username: 'octocat',
          expires_at: '2024-01-01T01:00:00.000Z',
          scopes: ['contents:write'],
        }),
    } as Response;
  }

  return {
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'unexpected fetch' }),
  } as Response;
});

import { SupabaseAuthService } from '../SupabaseAuthService';

function seedAuthenticatedGitHubAppSession(): void {
  localStorageData = {
    supabaseToken: 'stored-access-token',
    supabaseRefreshToken: 'stored-refresh-token',
    supabaseTokenExpiry: Date.now() + 60 * 60 * 1000,
    supabaseAuthState: {
      isAuthenticated: true,
      user: { id: 'user-123', email: 'user@example.com' },
      subscription: { isActive: false, plan: 'free' },
    },
    refreshTokenIssuedAt: Date.now(),
    extensionSessionMinted: true,
    extensionSessionMintedAt: Date.now(),
    githubAppInstallationId: 12345,
    githubAppUsername: 'octocat',
    githubAppAccessToken: 'github-app-token',
    githubAppExpiresAt: '2024-01-01T01:00:00.000Z',
    githubAppRefreshToken: 'github-refresh-token',
    githubAppRefreshTokenExpiresAt: '2024-02-01T00:00:00.000Z',
    githubAppUserId: 67890,
    githubAppAvatarUrl: 'https://example.com/octocat.png',
    githubAppScopes: ['contents:write'],
    github_app_token_12345: 'cached-installation-token',
    github_app_installation_12345: { installationId: 12345 },
  };
}

async function createSettledService(): Promise<SupabaseAuthService> {
  (SupabaseAuthService as any).instance = null;
  const service = SupabaseAuthService.getInstance();

  await vi.waitFor(() => {
    expect(global.fetch as Mock).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/get-github-token'),
      expect.anything()
    );
  });

  vi.clearAllMocks();
  return service;
}

function removedKeyCalls(): string[] {
  return (mockChromeStorage.local.remove as Mock).mock.calls.flatMap((call: unknown[]) =>
    Array.isArray(call[0]) ? call[0] : [call[0]]
  );
}

describe('SupabaseAuthService - session-only cleanup', () => {
  let authService: SupabaseAuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    seedAuthenticatedGitHubAppSession();
    authService = await createSettledService();
  });

  afterEach(() => {
    authService?.cleanup();
    vi.clearAllMocks();
    localStorageData = {};
  });

  test('clearExpiredSession removes supabase session keys and minted flags', async () => {
    await authService.clearExpiredSession();

    for (const key of SESSION_KEYS) {
      expect(localStorageData[key]).toBeUndefined();
    }

    expect(authService.getAuthState()).toEqual(
      expect.objectContaining({
        isAuthenticated: false,
        user: null,
        subscription: { isActive: false, plan: 'free' },
      })
    );
  });

  test('clearExpiredSession preserves GitHub App keys', async () => {
    const beforeCleanup = Object.fromEntries(
      GITHUB_APP_KEYS.map((key) => [key, localStorageData[key]])
    );

    await authService.clearExpiredSession();

    for (const [key, value] of Object.entries(beforeCleanup)) {
      expect(localStorageData[key]).toEqual(value);
    }

    expect(removedKeyCalls()).not.toContain('githubAppInstallationId');
    expect(removedKeyCalls()).not.toContain('githubAppAccessToken');
  });

  test('re-authentication flow after session expiry keeps GitHub App linkage usable', async () => {
    await (authService as any).triggerReAuthentication('Token verification failed');

    expect(localStorageData.supabaseToken).toBeUndefined();
    expect(localStorageData.extensionSessionMinted).toBeUndefined();
    expect(localStorageData.githubAppInstallationId).toBe(12345);

    const restoredAuthConfig = await chrome.storage.local.get(['githubAppInstallationId']);
    expect(restoredAuthConfig).toEqual({
      githubAppInstallationId: 12345,
    });
  });

  test('explicit logout still clears GitHub App cache', async () => {
    await authService.logout();

    for (const key of SESSION_KEYS) {
      expect(localStorageData[key]).toBeUndefined();
    }

    for (const key of GITHUB_APP_KEYS) {
      expect(localStorageData[key]).toBeUndefined();
    }
  });

  test('session cleanup manages GitHub App metadata without an authentication method selector', async () => {
    await authService.clearExpiredSession();

    expect(localStorageData.githubAppInstallationId).toBe(12345);
    expect(localStorageData).not.toHaveProperty('authenticationMethod');
    expect(removedKeyCalls()).not.toContain('authenticationMethod');
  });
});
