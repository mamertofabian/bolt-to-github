import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedGitHubService } from '../UnifiedGitHubService';
import type { IAuthenticationStrategy } from '../interfaces/IAuthenticationStrategy';

const factoryMocks = vi.hoisted(() => {
  const patStrategy = { type: 'pat' } as IAuthenticationStrategy;
  const githubAppStrategy = { type: 'github_app' } as IAuthenticationStrategy;

  return {
    patStrategy,
    githubAppStrategy,
    createGitHubAppStrategy: vi.fn(() => githubAppStrategy),
    createStrategy: vi.fn(() => patStrategy),
  };
});

vi.mock('../AuthenticationStrategyFactory', () => ({
  AuthenticationStrategyFactory: {
    getInstance: vi.fn(() => ({
      createGitHubAppStrategy: factoryMocks.createGitHubAppStrategy,
      createStrategy: factoryMocks.createStrategy,
    })),
  },
}));

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
      },
    },
  });
}

async function autoDetectedAuthenticationType(): Promise<'pat' | 'github_app'> {
  const service = new UnifiedGitHubService({ type: 'pat' });
  await Promise.resolve();
  await Promise.resolve();
  return service.getAuthenticationType();
}

async function explicitGitHubAppAuthenticationType(): Promise<'pat' | 'github_app'> {
  const service = new UnifiedGitHubService({ type: 'github_app' });
  return service.getAuthenticationType();
}

describe('UnifiedGitHubService authentication selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps PAT selected when a Supabase session exists without a GitHub App installation', async () => {
    installStorage({
      supabaseToken: 'supabase-session-token',
      authenticationMethod: 'pat',
    });

    await expect(autoDetectedAuthenticationType()).resolves.toBe('pat');
  });

  it('keeps explicit PAT selected when a GitHub App installation also exists', async () => {
    installStorage({
      supabaseToken: 'supabase-session-token',
      authenticationMethod: 'pat',
      githubAppInstallationId: 12345,
    });

    await expect(autoDetectedAuthenticationType()).resolves.toBe('pat');
  });

  it('selects GitHub App only when method and installation configuration agree', async () => {
    installStorage({
      supabaseToken: 'supabase-session-token',
      authenticationMethod: 'github_app',
      githubAppInstallationId: 12345,
    });

    await expect(autoDetectedAuthenticationType()).resolves.toBe('github_app');
  });

  it('explicit GitHub App configuration never falls back to PAT', async () => {
    installStorage({
      supabaseToken: 'supabase-session-token',
      authenticationMethod: 'github_app',
    });

    await expect(explicitGitHubAppAuthenticationType()).resolves.toBe('github_app');
    expect(factoryMocks.createStrategy).not.toHaveBeenCalledWith('pat');
  });
});
