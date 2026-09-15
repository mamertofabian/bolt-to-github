import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedGitHubService } from '../UnifiedGitHubService';
import type { AuthenticationConfig, AuthenticationType } from '../types/authentication';

function installStorage(values: Record<string, unknown>): void {
  const get = vi.fn(async (keys: string | string[]) => {
    if (typeof keys === 'string') {
      return keys in values ? { [keys]: values[keys] } : {};
    }

    return Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]]));
  });

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get,
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('UnifiedGitHubService GitHub App-only authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installStorage({});
  });

  it('UnifiedGitHubService always selects GitHub App authentication', async () => {
    const expectedType: AuthenticationType = 'github_app';
    const authConfig: AuthenticationConfig = {
      type: expectedType,
      githubAppConfig: { installationId: 12345 },
    };

    const configuredService = new UnifiedGitHubService(authConfig);
    const defaultService = new UnifiedGitHubService();

    await expect(configuredService.getAuthenticationType()).resolves.toBe(expectedType);
    await expect(defaultService.getAuthenticationType()).resolves.toBe(expectedType);
    expect(authConfig.githubAppConfig?.installationId).toBe(12345);
    expect(() => new UnifiedGitHubService('legacy-personal-access-token' as never)).toThrowError(
      /GitHub App/i
    );
  });

  it('missing live GitHub App credentials fail visibly without PAT fallback', async () => {
    const service = new UnifiedGitHubService({ type: 'github_app' });

    await expect(service.listRepos()).rejects.toThrow(
      /No user token available.*authenticate with bolt2github\.com/i
    );
  });

  it('account changes retain identity-isolated GitHub App token acquisition', async () => {
    const storage: Record<string, unknown> = { supabaseToken: 'account-a-session' };
    installStorage(storage);

    const edgeAuthorizations: string[] = [];
    const githubAuthorizations: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const authorization = new Headers(init?.headers).get('Authorization') ?? '';

        if (url.includes('/functions/v1/get-github-token')) {
          edgeAuthorizations.push(authorization);
          const account = authorization.includes('account-a') ? 'a' : 'b';
          return jsonResponse({
            access_token: `github-${account}-token`,
            github_username: `account-${account}`,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            scopes: ['repo'],
            type: 'github_app',
            renewed: false,
          });
        }

        githubAuthorizations.push(authorization);
        return jsonResponse([]);
      })
    );

    const accountAService = new UnifiedGitHubService({ type: 'github_app' });
    await expect(accountAService.getAuthenticationType()).resolves.toBe('github_app');
    const accountARequest = accountAService.listRepos();

    storage.supabaseToken = 'account-b-session';
    const accountBService = new UnifiedGitHubService({ type: 'github_app' });
    await expect(accountBService.getAuthenticationType()).resolves.toBe('github_app');
    const accountBRequest = accountBService.listRepos();

    await expect(Promise.all([accountARequest, accountBRequest])).resolves.toEqual([[], []]);
    expect(new Set(edgeAuthorizations)).toEqual(
      new Set(['Bearer account-a-session', 'Bearer account-b-session'])
    );
    expect(new Set(githubAuthorizations)).toEqual(
      new Set(['Bearer github-a-token', 'Bearer github-b-token'])
    );
  });

  it('concurrent facade instances share one GitHub App token acquisition per identity', async () => {
    installStorage({ supabaseToken: 'shared-account-session' });
    let tokenRequests = 0;
    let repositoryRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/functions/v1/get-github-token')) {
          tokenRequests += 1;
          return jsonResponse({
            access_token: 'shared-github-token',
            github_username: 'shared-account',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            scopes: ['repo'],
            type: 'github_app',
            renewed: false,
          });
        }

        repositoryRequests += 1;
        return jsonResponse([]);
      })
    );

    const services = Array.from(
      { length: 100 },
      () => new UnifiedGitHubService({ type: 'github_app' })
    );

    await expect(Promise.all(services.map((service) => service.listRepos()))).resolves.toEqual(
      Array.from({ length: 100 }, () => [])
    );
    expect(tokenRequests).toBe(1);
    expect(repositoryRequests).toBe(100);
  });

  it('stale facade fails visibly after the Bolt2GitHub identity changes', async () => {
    const storage: Record<string, unknown> = { supabaseToken: 'stale-account-a-session' };
    installStorage(storage);
    const githubAuthorizations: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const authorization = new Headers(init?.headers).get('Authorization') ?? '';
        if (url.includes('/functions/v1/get-github-token')) {
          const account = authorization.includes('account-a') ? 'a' : 'b';
          return jsonResponse({
            access_token: `stale-github-${account}-token`,
            github_username: `account-${account}`,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            scopes: ['repo'],
            type: 'github_app',
            renewed: false,
          });
        }

        githubAuthorizations.push(authorization);
        return jsonResponse([]);
      })
    );

    const accountAService = new UnifiedGitHubService();
    await expect(accountAService.listRepos()).resolves.toEqual([]);

    storage.supabaseToken = 'stale-account-b-session';
    const accountBService = new UnifiedGitHubService();
    await expect(accountBService.listRepos()).resolves.toEqual([]);
    await expect(accountAService.listRepos()).rejects.toThrow(/Bolt2GitHub account changed/i);
    expect(githubAuthorizations).toEqual([
      'Bearer stale-github-a-token',
      'Bearer stale-github-b-token',
    ]);
  });

  it('signed-out facade cannot reuse a previously cached account token', async () => {
    const storage: Record<string, unknown> = { supabaseToken: 'logout-account-session' };
    installStorage(storage);
    let tokenRequests = 0;
    let repositoryRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/functions/v1/get-github-token')) {
          tokenRequests += 1;
          return jsonResponse({
            access_token: 'logout-github-token',
            github_username: 'logout-account',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            scopes: ['repo'],
            type: 'github_app',
            renewed: false,
          });
        }

        repositoryRequests += 1;
        return jsonResponse([]);
      })
    );

    await expect(new UnifiedGitHubService().listRepos()).resolves.toEqual([]);
    delete storage.supabaseToken;

    await expect(new UnifiedGitHubService().listRepos()).rejects.toThrow(
      /No user token available.*authenticate with bolt2github\.com/i
    );
    expect(tokenRequests).toBe(1);
    expect(repositoryRequests).toBe(1);
  });

  it('explicit GitHub App configuration never falls back to PAT', async () => {
    installStorage({ supabaseToken: 'supabase-session-token' });
    const service = new UnifiedGitHubService({ type: 'github_app' });

    await expect(service.getAuthenticationType()).resolves.toBe('github_app');
  });
});
