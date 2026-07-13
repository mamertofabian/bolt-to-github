import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkGitHubAppStatus,
  getGitHubAppInfo,
  refreshGitHubAppToken,
  syncGitHubAppFromWebApp,
} from '../githubAppSync';
import * as githubAppSync from '../githubAppSync';
import { BackgroundAuthClient } from '../../services/BackgroundAuthClient';
import { ChromeStorageService } from '../../services/chromeStorage';

vi.mock('../../services/chromeStorage');
vi.mock('../../services/BackgroundAuthClient', () => ({ BackgroundAuthClient: vi.fn() }));

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z');

type MockBackgroundAuthClient = {
  getAuthState: ReturnType<typeof vi.fn>;
  syncGitHubApp: ReturnType<typeof vi.fn>;
};

function createAuthClient(overrides: Partial<MockBackgroundAuthClient> = {}) {
  const authClient: MockBackgroundAuthClient = {
    getAuthState: vi.fn().mockResolvedValue({ isAuthenticated: true }),
    syncGitHubApp: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  vi.mocked(BackgroundAuthClient).mockImplementation(() => authClient as never);
  return authClient;
}

describe('githubAppSync utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BackgroundAuthClient).mockReset();
    vi.useFakeTimers({ now: FIXED_TIME });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('GitHub App status derives from installation metadata without reading authenticationMethod', async () => {
    vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
      installationId: 12345,
      username: 'octocat',
    });

    await expect(checkGitHubAppStatus()).resolves.toEqual({
      isConfigured: true,
      username: 'octocat',
      avatarUrl: undefined,
      installationId: 12345,
    });
    expect(ChromeStorageService).not.toHaveProperty('getAuthenticationMethod');
  });

  it('GitHub App info never returns PAT on success or failure', async () => {
    vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValueOnce({
      installationId: 12345,
      username: 'octocat',
    });
    const connected = await getGitHubAppInfo();
    expect(connected).toEqual(expect.objectContaining({ isConfigured: true, username: 'octocat' }));
    expect(connected).not.toHaveProperty('authMethod');

    vi.mocked(ChromeStorageService.getGitHubAppConfig).mockRejectedValueOnce(
      new Error('storage unavailable')
    );
    await expect(getGitHubAppInfo()).resolves.toEqual({ isConfigured: false });
  });

  it('sync and refresh failures remain visible after method switching is removed', async () => {
    expect(githubAppSync).not.toHaveProperty('switchToGitHubApp');
    createAuthClient({ syncGitHubApp: vi.fn().mockRejectedValue(new Error('sync unavailable')) });

    await expect(syncGitHubAppFromWebApp()).resolves.toEqual({
      success: false,
      hasGitHubApp: false,
      message: 'sync unavailable',
    });
    await expect(refreshGitHubAppToken()).resolves.toEqual({
      success: false,
      message: 'sync unavailable',
    });
  });

  describe('syncGitHubAppFromWebApp', () => {
    it('requires a Bolt2GitHub session', async () => {
      createAuthClient({ getAuthState: vi.fn().mockResolvedValue({ isAuthenticated: false }) });

      await expect(syncGitHubAppFromWebApp()).resolves.toEqual({
        success: false,
        hasGitHubApp: false,
        message: 'Please authenticate with bolt2github.com first',
      });
    });

    it('reports a failed sync', async () => {
      createAuthClient({ syncGitHubApp: vi.fn().mockResolvedValue(false) });

      await expect(syncGitHubAppFromWebApp()).resolves.toEqual({
        success: false,
        hasGitHubApp: false,
        message: 'Failed to sync GitHub App. Please check your authentication.',
      });
    });

    it('reports a connected installation', async () => {
      createAuthClient();
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
      });

      await expect(syncGitHubAppFromWebApp()).resolves.toEqual({
        success: true,
        hasGitHubApp: true,
        message: 'GitHub App synced successfully!',
      });
    });

    it('keeps a missing installation visible', async () => {
      createAuthClient();
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({});

      await expect(syncGitHubAppFromWebApp()).resolves.toEqual({
        success: true,
        hasGitHubApp: false,
        message:
          'No GitHub App installation found. Please connect GitHub App on bolt2github.com first.',
      });
    });

    it('uses a visible fallback for non-Error failures', async () => {
      createAuthClient({ syncGitHubApp: vi.fn().mockRejectedValue('failure') });
      await expect(syncGitHubAppFromWebApp()).resolves.toEqual({
        success: false,
        hasGitHubApp: false,
        message: 'Unknown error occurred',
      });
    });
  });

  describe('checkGitHubAppStatus', () => {
    it('returns not configured without an installation', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({ username: 'octocat' });
      await expect(checkGitHubAppStatus()).resolves.toEqual({
        isConfigured: false,
        username: 'octocat',
        avatarUrl: undefined,
        installationId: undefined,
      });
    });

    it('returns a visible safe state on storage failure', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockRejectedValue(new Error('storage'));
      await expect(checkGitHubAppStatus()).resolves.toEqual({ isConfigured: false });
    });
  });

  describe('refreshGitHubAppToken', () => {
    it('clears the cached installation token before syncing', async () => {
      const authClient = createAuthClient();
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockResolvedValue(undefined);

      await expect(refreshGitHubAppToken()).resolves.toEqual({
        success: true,
        message: 'GitHub App token refreshed successfully!',
      });
      expect(ChromeStorageService.saveGitHubAppConfig).toHaveBeenCalledWith({
        accessToken: undefined,
      });
      expect(authClient.syncGitHubApp).toHaveBeenCalledOnce();
    });

    it('reports a sync that returns no installation', async () => {
      createAuthClient({ syncGitHubApp: vi.fn().mockResolvedValue(false) });
      await expect(refreshGitHubAppToken()).resolves.toEqual({
        success: false,
        message: 'Failed to refresh GitHub App token. Please re-authenticate.',
      });
    });
  });

  describe('getGitHubAppInfo', () => {
    it('returns connection metadata and a healthy expiry', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'octocat',
        avatarUrl: 'avatar',
        expiresAt: new Date(FIXED_TIME.getTime() + 60 * 60 * 1000).toISOString(),
        scopes: ['repo'],
      });

      await expect(getGitHubAppInfo()).resolves.toEqual({
        isConfigured: true,
        username: 'octocat',
        avatarUrl: 'avatar',
        expiresAt: '2024-01-01T01:00:00.000Z',
        scopes: ['repo'],
        needsRefresh: false,
      });
    });

    it('marks near-expiry and expired tokens for refresh', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        expiresAt: new Date(FIXED_TIME.getTime() + 4 * 60 * 1000).toISOString(),
      });
      await expect(getGitHubAppInfo()).resolves.toEqual(
        expect.objectContaining({ needsRefresh: true })
      );

      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        expiresAt: new Date(FIXED_TIME.getTime() - 1000).toISOString(),
      });
      await expect(getGitHubAppInfo()).resolves.toEqual(
        expect.objectContaining({ needsRefresh: true })
      );
    });
  });
});
