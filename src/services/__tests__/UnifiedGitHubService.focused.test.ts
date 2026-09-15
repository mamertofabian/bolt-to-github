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

describe('UnifiedGitHubService focused GitHub App behavior', () => {
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

  it('fails protected calls with the original actionable GitHub App token error', async () => {
    strategy.getToken.mockRejectedValueOnce(
      new Error('GitHub App authentication expired. Please re-authenticate via bolt2github.com')
    );

    await expect(new UnifiedGitHubService().listRepos()).rejects.toThrow(
      'Please re-authenticate via bolt2github.com'
    );
  });

  it('returns false when a repository is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ message: 'Not Found' }, 404, 'Not Found'))
    );

    await expect(new UnifiedGitHubService().repoExists('octocat', 'missing')).resolves.toBe(false);
  });

  it('does not reinterpret an API failure as a PAT permission problem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ message: 'Service unavailable' }, 503, 'Service Unavailable'))
    );

    await expect(new UnifiedGitHubService().listRepos()).rejects.toThrow(
      'Failed to list repositories: Service Unavailable'
    );
  });

  it('adds cache-busting query and headers when issues are force-refreshed', async () => {
    const fetchMock = vi.fn(async () => response([]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new UnifiedGitHubService().getIssues('octocat', 'bolt-project', 'open', true)
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/api\.github\.com\/repos\/octocat\/bolt-project\/issues\?state=open&_t=\d+$/
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer github-app-token',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        }),
      })
    );
  });

  it('updates only the supplied issue fields', async () => {
    const issue = { id: 10, number: 7, title: 'Updated', state: 'closed' };
    const fetchMock = vi.fn(async () => response(issue));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new UnifiedGitHubService().updateIssue(
        'octocat',
        'bolt-project',
        7,
        'Updated',
        undefined,
        'closed'
      )
    ).resolves.toEqual(issue);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/bolt-project/issues/7',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated', state: 'closed' }),
      })
    );
  });

  it('normalizes generic request endpoints and authenticates them with the App token', async () => {
    const payload = { login: 'octocat' };
    const fetchMock = vi.fn(async () => response(payload));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new UnifiedGitHubService().request('GET', 'user')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer github-app-token' }),
      })
    );
  });

  it('preserves GitHub API errors from the generic request helper', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({}, 401, 'Unauthorized'))
    );

    await expect(new UnifiedGitHubService().request('GET', '/user')).rejects.toThrow(
      'Request failed: Unauthorized'
    );
  });
});
