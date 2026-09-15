import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedGitHubService } from '../UnifiedGitHubService';

const strategy = vi.hoisted(() => ({
  type: 'github_app' as const,
  getToken: vi.fn(),
  isConfigured: vi.fn(),
  validateAuth: vi.fn(),
  checkPermissions: vi.fn(),
  refreshToken: vi.fn(),
  clearAuth: vi.fn(),
  getUserInfo: vi.fn(),
  needsRenewal: vi.fn(),
  getMetadata: vi.fn(),
  setUserToken: vi.fn(),
}));

vi.mock('../GitHubAppAuthenticationStrategy', () => ({
  GitHubAppAuthenticationStrategy: vi.fn(() => strategy),
}));

function response(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('UnifiedGitHubService App-authenticated smoke coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    strategy.getToken.mockResolvedValue('github-app-token');
    strategy.validateAuth.mockResolvedValue({ isValid: true, type: 'github_app' });
    strategy.needsRenewal.mockResolvedValue(false);
    strategy.refreshToken.mockResolvedValue('refreshed-token');
    strategy.getMetadata.mockResolvedValue({ tokenType: 'github_app' });

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ supabaseToken: 'bolt2github-session' })),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
    });
  });

  it('creates an App-backed service with either default or explicit configuration', async () => {
    await expect(new UnifiedGitHubService().getAuthenticationType()).resolves.toBe('github_app');
    await expect(
      new UnifiedGitHubService({ type: 'github_app' }).getAuthenticationType()
    ).resolves.toBe('github_app');
  });

  it('reads repository information', async () => {
    const repository = {
      id: 1,
      name: 'bolt-project',
      full_name: 'octocat/bolt-project',
      private: false,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(repository))
    );

    await expect(
      new UnifiedGitHubService().getRepoInfo('octocat', 'bolt-project')
    ).resolves.toMatchObject({ name: 'bolt-project', exists: true });
  });

  it('lists repository branches', async () => {
    const branches = [{ name: 'main', commit: { sha: 'abc123' }, protected: false }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(branches))
    );

    await expect(
      new UnifiedGitHubService().listBranches('octocat', 'bolt-project')
    ).resolves.toEqual(branches);
  });

  it('reads one issue', async () => {
    const issue = { id: 10, number: 7, title: 'Sync failed', state: 'open' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(issue))
    );

    await expect(
      new UnifiedGitHubService().getIssue('octocat', 'bolt-project', 7)
    ).resolves.toEqual(issue);
  });

  it('adds an issue comment', async () => {
    const comment = { id: 20, body: 'Resolved in the next build.' };
    const fetchMock = vi.fn(async () => response(comment, 201, 'Created'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new UnifiedGitHubService().addIssueComment(
        'octocat',
        'bolt-project',
        7,
        'Resolved in the next build.'
      )
    ).resolves.toEqual(comment);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/bolt-project/issues/7/comments',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns a visible repository creation error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({}, 422, 'Unprocessable Entity'))
    );

    await expect(new UnifiedGitHubService().createRepo('duplicate')).rejects.toThrow(
      'Failed to create repository: Unprocessable Entity'
    );
  });
});
