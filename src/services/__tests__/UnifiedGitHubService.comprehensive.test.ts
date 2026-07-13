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

describe('UnifiedGitHubService GitHub App API facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    strategy.getToken.mockResolvedValue('github-app-installation-token');
    strategy.isConfigured.mockResolvedValue(true);
    strategy.validateAuth.mockResolvedValue({
      isValid: true,
      userInfo: { login: 'octocat', id: 1, avatar_url: 'https://example.com/avatar.png' },
      scopes: ['contents:write', 'issues:write'],
      type: 'github_app',
    });
    strategy.checkPermissions.mockResolvedValue({
      isValid: true,
      permissions: { allRepos: true, admin: false, contents: true },
    });
    strategy.refreshToken.mockResolvedValue('refreshed-installation-token');
    strategy.getUserInfo.mockResolvedValue({
      login: 'octocat',
      id: 1,
      avatar_url: 'https://example.com/avatar.png',
    });
    strategy.needsRenewal.mockResolvedValue(false);
    strategy.getMetadata.mockResolvedValue({ tokenType: 'github_app', installationId: 12345 });

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

  it('validates the live GitHub App connection and returns user details', async () => {
    const service = new UnifiedGitHubService();

    await expect(service.validateTokenAndUser('octocat')).resolves.toEqual({
      isValid: true,
      userInfo: { login: 'octocat', id: 1, avatar_url: 'https://example.com/avatar.png' },
      scopes: ['contents:write', 'issues:write'],
    });
    expect(strategy.validateAuth).toHaveBeenCalledWith('octocat');
    expect(strategy.setUserToken).toHaveBeenCalledWith('bolt2github-session');
  });

  it('preserves an actionable GitHub App validation failure', async () => {
    strategy.validateAuth.mockResolvedValueOnce({
      isValid: false,
      error: 'GitHub App installation not found',
    });
    const service = new UnifiedGitHubService({ type: 'github_app' });

    await expect(service.validateTokenAndUser('octocat')).resolves.toEqual({
      isValid: false,
      error: 'GitHub App installation not found',
    });
  });

  it('lists repositories with the GitHub App installation token', async () => {
    const repositories = [{ id: 1, name: 'bolt-project', full_name: 'octocat/bolt-project' }];
    const fetchMock = vi.fn(async () => response(repositories));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new UnifiedGitHubService().listRepos()).resolves.toEqual(repositories);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user/repos?sort=updated&per_page=100',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer github-app-installation-token',
        }),
      })
    );
  });

  it('creates a repository through the App-authenticated user endpoint', async () => {
    const repository = { id: 2, name: 'new-project', private: true };
    const fetchMock = vi.fn(async () => response(repository, 201, 'Created'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new UnifiedGitHubService().createRepo('new-project', true, 'Created from Bolt')
    ).resolves.toEqual(repository);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user/repos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'new-project',
          private: true,
          description: 'Created from Bolt',
          auto_init: false,
        }),
      })
    );
  });

  it('pushes files with App authentication and preserves branch and sha', async () => {
    const result = { content: { sha: 'new-sha' }, commit: { sha: 'commit-sha' } };
    const fetchMock = vi.fn(async () => response(result, 201, 'Created'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new UnifiedGitHubService().pushFile(
        'octocat',
        'bolt-project',
        'src/main.ts',
        'export const ready = true;',
        'Update source',
        'develop',
        'old-sha'
      )
    ).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/bolt-project/contents/src/main.ts',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          message: 'Update source',
          content: btoa('export const ready = true;'),
          branch: 'develop',
          sha: 'old-sha',
        }),
      })
    );
  });

  it('loads and creates issues with the installation token', async () => {
    const issue = { id: 10, number: 7, title: 'App-authenticated issue', state: 'open' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([issue]))
      .mockResolvedValueOnce(response(issue, 201, 'Created'));
    vi.stubGlobal('fetch', fetchMock);
    const service = new UnifiedGitHubService();

    await expect(service.getIssues('octocat', 'bolt-project')).resolves.toEqual([issue]);
    await expect(
      service.createIssue('octocat', 'bolt-project', {
        title: issue.title,
        body: 'Details',
        labels: ['bug'],
      })
    ).resolves.toEqual(issue);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/octocat/bolt-project/issues',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('submits feedback through the same GitHub App issue path', async () => {
    const issue = { id: 11, number: 8, title: '[BUG] User Feedback', state: 'open' };
    const fetchMock = vi.fn(async () => response(issue, 201, 'Created'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new UnifiedGitHubService().submitFeedback({
        category: 'bug',
        message: 'The sync button stopped responding.',
        metadata: { browserInfo: 'Chrome', extensionVersion: '1.3.22' },
      })
    ).resolves.toEqual(issue);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/mamertofabian/bolt-to-github/issues',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('The sync button stopped responding.'),
      })
    );
  });

  it('exposes GitHub App renewal and metadata operations without a strategy selector', async () => {
    const service = new UnifiedGitHubService();

    await expect(service.getAuthenticationType()).resolves.toBe('github_app');
    await expect(service.needsRenewal()).resolves.toBe(false);
    await expect(service.refreshAuth()).resolves.toBe('refreshed-installation-token');
    await expect(service.getAuthMetadata()).resolves.toEqual({
      tokenType: 'github_app',
      installationId: 12345,
    });
  });
});
