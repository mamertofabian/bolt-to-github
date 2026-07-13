/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type StorageData = Record<string, unknown>;

let localData: StorageData = {};

const localStorageMock = {
  get: vi.fn(async (keys?: string | string[]) => {
    const requested = typeof keys === 'string' ? [keys] : (keys ?? Object.keys(localData));
    return requested.reduce<StorageData>((result, key) => {
      result[key] = localData[key];
      return result;
    }, {});
  }),
  set: vi.fn(async (items: StorageData) => Object.assign(localData, items)),
  remove: vi.fn(async (keys: string | string[]) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) {
      delete localData[key];
    }
  }),
};

global.chrome = {
  runtime: { id: 'test-extension', sendMessage: vi.fn().mockResolvedValue({ success: true }) },
  storage: {
    local: localStorageMock,
    sync: { get: vi.fn(async () => ({})), set: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: { query: vi.fn(async () => []), sendMessage: vi.fn(), create: vi.fn() },
  alarms: { create: vi.fn(), clear: vi.fn(async () => true) },
} as any;

import { SupabaseAuthService } from '../SupabaseAuthService';

const githubAppKeys = [
  'githubAppInstallationId',
  'githubAppUsername',
  'githubAppAccessToken',
  'githubAppExpiresAt',
  'githubAppRefreshToken',
  'githubAppRefreshTokenExpiresAt',
  'githubAppUserId',
  'githubAppAvatarUrl',
  'githubAppScopes',
];

function seedStaleConnection(): void {
  localData = {
    supabaseToken: 'supabase-token',
    supabaseTokenExpiry: Date.now() + 60 * 60 * 1000,
    extensionSessionMinted: true,
    githubAppInstallationId: 12345,
    githubAppUsername: 'old-user',
    githubAppAccessToken: 'stale-token',
    githubAppExpiresAt: '2099-01-01T00:00:00.000Z',
  };
}

function service(): SupabaseAuthService {
  (SupabaseAuthService as any).instance = null;
  return SupabaseAuthService.getInstance();
}

function expectGitHubAppStateCleared(): void {
  for (const key of githubAppKeys) {
    expect(localData[key]).toBeUndefined();
  }
}

describe('SupabaseAuthService live GitHub connection reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStaleConnection();
  });

  it('authoritative NO_GITHUB_APP clears stale GitHub App configuration and returns false', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'NO_GITHUB_APP', error: 'No integration found' }), {
          status: 404,
        })
    ) as any;

    await expect(service().syncGitHubApp()).resolves.toBe(false);
    expectGitHubAppStateCleared();
  });

  it('authoritative missing-installation response clears stale GitHub App configuration and returns false', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'GITHUB_APP_INSTALLATION_MISSING',
            error: 'GitHub App installation is missing',
          }),
          { status: 409 }
        )
    ) as any;

    await expect(service().syncGitHubApp()).resolves.toBe(false);
    expectGitHubAppStateCleared();
  });

  it('live GitHub App response persists stable identity and returns true', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ id: 7, avatar_url: 'avatar' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          type: 'github_app',
          access_token: 'fresh-token',
          installation_id: 67890,
          github_username: 'current-user',
          expires_at: '2099-01-01T00:00:00.000Z',
          scopes: ['repo'],
        }),
        { status: 200 }
      );
    }) as any;

    await expect(service().syncGitHubApp()).resolves.toBe(true);
    expect(localData.githubAppInstallationId).toBe(67890);
    expect(localData.githubAppUsername).toBe('current-user');
    expect(localData).not.toHaveProperty('authenticationMethod');
  });

  it('GitHub App sync stores installation metadata without an authentication method selector', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ id: 7, avatar_url: 'avatar' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          type: 'github_app',
          access_token: 'fresh-token',
          installation_id: 67890,
          github_username: 'current-user',
          expires_at: '2099-01-01T00:00:00.000Z',
          scopes: ['repo'],
        }),
        { status: 200 }
      );
    }) as any;

    await expect(service().syncGitHubApp()).resolves.toBe(true);

    expect(localData.githubAppInstallationId).toBe(67890);
    expect(localData.githubAppUsername).toBe('current-user');
    expect(localData).not.toHaveProperty('authenticationMethod');
  });

  it('transient GitHub verification failure rejects without clearing stored connection state', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Temporary outage' }), { status: 503 })
    ) as any;

    await expect(service().syncGitHubApp()).rejects.toThrow('Temporary outage');
    expect(localData.githubAppInstallationId).toBe(12345);
    expect(localData.githubAppUsername).toBe('old-user');
  });

  it('malformed successful response rejects without clearing stored connection state', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'github_app',
            access_token: 'unverifiable-token',
            installation_id: 'not-a-stable-installation-id',
          }),
          { status: 200 }
        )
    ) as any;

    await expect(service().syncGitHubApp()).rejects.toThrow('missing or invalid installation_id');
    expect(localData.githubAppInstallationId).toBe(12345);
    expect(localData.githubAppUsername).toBe('old-user');
  });
});
