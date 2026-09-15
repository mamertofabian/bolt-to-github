import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeStorageService } from '../../services/chromeStorage';
import {
  githubSettingsActions,
  githubSettingsStore,
  isAuthenticationValid,
  isSettingsValid,
  type GitHubSettingsState,
} from '../githubSettings';
import { UnifiedGitHubService } from '../../../services/UnifiedGitHubService';

const mockChromeStorage = {
  sync: { get: vi.fn() },
  local: { get: vi.fn() },
};

global.chrome = { storage: mockChromeStorage } as unknown as typeof chrome;

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../services/chromeStorage', () => ({
  ChromeStorageService: { saveGitHubSettings: vi.fn().mockResolvedValue(undefined) },
}));

const mockValidate = vi.fn().mockResolvedValue({ isValid: true });
vi.mock('../../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: vi.fn().mockImplementation(function (this: {
    validateTokenAndUser: typeof mockValidate;
  }) {
    this.validateTokenAndUser = mockValidate;
    return this;
  }),
}));

const defaultState: GitHubSettingsState = {
  repoOwner: '',
  repoName: '',
  branch: 'main',
  projectSettings: {},
  isValidatingToken: false,
  isTokenValid: null,
  validationError: null,
  hasInitialSettings: false,
  githubAppInstallationId: null,
  githubAppUsername: null,
  githubAppAvatarUrl: null,
};

describe('githubSettings Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubSettingsStore.set(defaultState);
    mockChromeStorage.sync.get.mockResolvedValue({});
    mockChromeStorage.local.get.mockResolvedValue({});
    vi.mocked(ChromeStorageService.saveGitHubSettings).mockResolvedValue(undefined);
    mockValidate.mockResolvedValue({ isValid: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts with repository and GitHub App state only', () => {
    expect(get(githubSettingsStore)).toEqual(defaultState);
    expect(get(githubSettingsStore)).not.toHaveProperty('githubToken');
    expect(get(githubSettingsStore)).not.toHaveProperty('authenticationMethod');
  });

  it('legacy PAT initialization never constructs or validates a token-backed GitHub service', async () => {
    mockChromeStorage.sync.get.mockResolvedValue({
      githubToken: 'legacy-token-must-be-ignored',
      repoOwner: 'octocat',
      projectSettings: {},
    });
    mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });

    await githubSettingsActions.initialize();

    expect(UnifiedGitHubService).not.toHaveBeenCalled();
    expect(mockValidate).not.toHaveBeenCalled();
    expect(get(githubSettingsStore)).not.toHaveProperty('githubToken');
    expect(get(githubSettingsStore)).not.toHaveProperty('authenticationMethod');
  });

  it('settings initialize from GitHub App metadata without reading a PAT', async () => {
    mockChromeStorage.sync.get.mockResolvedValue({
      githubToken: 'legacy-token-must-be-ignored',
      repoOwner: 'octocat',
      projectSettings: { bolt: { repoName: 'bolt-repo', branch: 'main' } },
    });
    mockChromeStorage.local.get.mockResolvedValue({
      authenticationMethod: 'pat',
      githubAppInstallationId: 12345,
      githubAppUsername: 'octocat',
    });

    await githubSettingsActions.initialize();

    expect(mockChromeStorage.sync.get).toHaveBeenCalledWith(['repoOwner', 'projectSettings']);
    expect(mockChromeStorage.local.get).toHaveBeenCalledWith([
      'githubAppInstallationId',
      'githubAppUsername',
      'githubAppAvatarUrl',
    ]);
    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({
        repoOwner: 'octocat',
        githubAppInstallationId: 12345,
        githubAppUsername: 'octocat',
        hasInitialSettings: true,
        isTokenValid: true,
      })
    );
    expect(get(githubSettingsStore)).not.toHaveProperty('githubToken');
    expect(get(githubSettingsStore)).not.toHaveProperty('authenticationMethod');
  });

  it('stale App username without installation preserves repository settings', async () => {
    mockChromeStorage.sync.get.mockResolvedValue({
      repoOwner: 'preserved-owner',
      projectSettings: { bolt: { repoName: 'preserved-repo', branch: 'dev' } },
    });
    mockChromeStorage.local.get.mockResolvedValue({ githubAppUsername: 'stale-username' });

    await githubSettingsActions.initialize();

    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({
        repoOwner: 'preserved-owner',
        projectSettings: { bolt: { repoName: 'preserved-repo', branch: 'dev' } },
        githubAppInstallationId: null,
        githubAppUsername: null,
        hasInitialSettings: false,
      })
    );
    expect(ChromeStorageService.saveGitHubSettings).not.toHaveBeenCalled();
  });

  it('settings validity requires installation metadata and live connection state', () => {
    githubSettingsStore.set({
      ...defaultState,
      repoOwner: 'octocat',
      repoName: 'bolt-repo',
      githubAppInstallationId: 12345,
      isTokenValid: false,
    });
    expect(get(isAuthenticationValid)).toBe(false);
    expect(get(isSettingsValid)).toBe(false);

    githubSettingsStore.update((state) => ({ ...state, isTokenValid: true }));
    expect(get(isAuthenticationValid)).toBe(true);
    expect(get(isSettingsValid)).toBe(true);

    githubSettingsStore.update((state) => ({ ...state, isValidatingToken: true }));
    expect(get(isAuthenticationValid)).toBe(false);
    expect(get(isSettingsValid)).toBe(false);
  });

  it('migration-required state preserves repository and project settings', async () => {
    mockChromeStorage.sync.get.mockResolvedValue({
      githubToken: 'legacy-token-must-be-ignored',
      repoOwner: 'preserved-owner',
      projectSettings: { bolt: { repoName: 'preserved-repo', branch: 'dev' } },
    });
    mockChromeStorage.local.get.mockResolvedValue({
      authenticationMethod: 'pat',
      githubAppMigrationRequired: true,
    });

    await githubSettingsActions.initialize();

    const state = get(githubSettingsStore);
    expect(state.repoOwner).toBe('preserved-owner');
    expect(state.projectSettings.bolt).toEqual({ repoName: 'preserved-repo', branch: 'dev' });
    expect(state).not.toHaveProperty('githubToken');
    expect(state).not.toHaveProperty('authenticationMethod');
    expect(ChromeStorageService.saveGitHubSettings).not.toHaveBeenCalled();
  });

  it('uses the App username as repository owner and persists the mapping', async () => {
    mockChromeStorage.sync.get.mockResolvedValue({ repoOwner: '', projectSettings: {} });
    mockChromeStorage.local.get.mockResolvedValue({
      githubAppInstallationId: 12345,
      githubAppUsername: 'octocat',
      githubAppAvatarUrl: 'avatar',
    });

    await githubSettingsActions.initialize();

    expect(ChromeStorageService.saveGitHubSettings).toHaveBeenCalledWith({
      repoOwner: 'octocat',
      projectSettings: {},
      githubAppInstallationId: 12345,
      githubAppUsername: 'octocat',
      githubAppAvatarUrl: 'avatar',
    });
  });

  it('handles missing or failed storage as disconnected state', async () => {
    await expect(githubSettingsActions.initialize()).resolves.toBeUndefined();
    expect(get(githubSettingsStore)).toEqual(defaultState);

    mockChromeStorage.sync.get.mockRejectedValue(new Error('storage unavailable'));
    await expect(githubSettingsActions.initialize()).resolves.toBeUndefined();
    expect(get(githubSettingsStore)).toEqual(defaultState);
  });

  it('updates repository identity and project mappings', () => {
    githubSettingsActions.setRepoOwner('octocat');
    githubSettingsActions.setRepoName('bolt-repo');
    githubSettingsActions.setBranch('dev');
    githubSettingsActions.setProjectSettings('bolt', 'bolt-repo', 'dev', 'Bolt Project');

    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({
        repoOwner: 'octocat',
        repoName: 'bolt-repo',
        branch: 'dev',
        projectSettings: {
          bolt: { repoName: 'bolt-repo', branch: 'dev', projectTitle: 'Bolt Project' },
        },
      })
    );
  });

  it('loads an existing project mapping or creates a safe default', () => {
    githubSettingsStore.update((state) => ({
      ...state,
      projectSettings: { bolt: { repoName: 'bolt-repo', branch: 'dev' } },
    }));

    githubSettingsActions.loadProjectSettings('bolt');
    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({ repoName: 'bolt-repo', branch: 'dev' })
    );

    githubSettingsActions.loadProjectSettings('new-project');
    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({ repoName: 'new-project', branch: 'main' })
    );
  });

  it('rejects App validation without installation metadata', async () => {
    await expect(githubSettingsActions.validateGitHubApp('octocat')).resolves.toBe(false);
    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({
        isTokenValid: false,
        validationError: 'GitHub App installation not found',
      })
    );
    expect(UnifiedGitHubService).not.toHaveBeenCalled();
  });

  it('GitHub App validation constructs only the App-backed unified service', async () => {
    githubSettingsStore.update((state) => ({ ...state, githubAppInstallationId: 12345 }));

    await expect(githubSettingsActions.validateGitHubApp('octocat')).resolves.toBe(true);

    expect(UnifiedGitHubService).toHaveBeenCalledWith({ type: 'github_app' });
    expect(mockValidate).toHaveBeenCalledWith('octocat');
    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({ isTokenValid: true, isValidatingToken: false })
    );
  });

  it('keeps App validation errors visible', async () => {
    githubSettingsStore.update((state) => ({ ...state, githubAppInstallationId: 12345 }));
    mockValidate.mockResolvedValue({ isValid: false, error: 'installation unavailable' });

    await expect(githubSettingsActions.validateGitHubApp('octocat')).resolves.toBe(false);
    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({
        isTokenValid: false,
        validationError: 'installation unavailable',
        isValidatingToken: false,
      })
    );
  });

  it('requires installation metadata and owner before save', async () => {
    await expect(githubSettingsActions.saveSettings()).resolves.toEqual({
      success: false,
      error: 'GitHub App authentication or repository owner missing',
    });
    expect(ChromeStorageService.saveGitHubSettings).not.toHaveBeenCalled();
  });

  it('legacy PAT settings cannot be saved after GitHub App-only strategy retirement', async () => {
    githubSettingsStore.set({
      ...defaultState,
      repoOwner: 'legacy-owner',
      githubToken: 'legacy-token',
      authenticationMethod: 'pat',
    } as unknown as GitHubSettingsState);

    await expect(githubSettingsActions.saveSettings()).resolves.toEqual({
      success: false,
      error: 'GitHub App authentication or repository owner missing',
    });
    expect(ChromeStorageService.saveGitHubSettings).not.toHaveBeenCalled();
  });

  it('saves only repository and GitHub App settings', async () => {
    githubSettingsStore.set({
      ...defaultState,
      repoOwner: 'octocat',
      projectSettings: { bolt: { repoName: 'bolt-repo', branch: 'main' } },
      githubAppInstallationId: 12345,
      githubAppUsername: 'octocat',
      githubAppAvatarUrl: 'avatar',
      isTokenValid: true,
    });

    await expect(githubSettingsActions.saveSettings()).resolves.toEqual({ success: true });
    expect(ChromeStorageService.saveGitHubSettings).toHaveBeenCalledWith({
      repoOwner: 'octocat',
      projectSettings: { bolt: { repoName: 'bolt-repo', branch: 'main' } },
      githubAppInstallationId: 12345,
      githubAppUsername: 'octocat',
      githubAppAvatarUrl: 'avatar',
    });
    expect(get(githubSettingsStore).hasInitialSettings).toBe(true);
  });

  it('returns a visible storage error when save fails', async () => {
    githubSettingsStore.set({
      ...defaultState,
      repoOwner: 'octocat',
      githubAppInstallationId: 12345,
    });
    vi.mocked(ChromeStorageService.saveGitHubSettings).mockRejectedValue(
      new Error('storage unavailable')
    );

    await expect(githubSettingsActions.saveSettings()).resolves.toEqual({
      success: false,
      error: 'storage unavailable',
    });
  });

  it('sets and clears GitHub App metadata', () => {
    githubSettingsActions.setGitHubAppSettings(12345, 'octocat', 'avatar');
    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({
        githubAppInstallationId: 12345,
        githubAppUsername: 'octocat',
        githubAppAvatarUrl: 'avatar',
        isTokenValid: true,
      })
    );

    githubSettingsActions.clearGitHubAppSettings();
    expect(get(githubSettingsStore)).toEqual(
      expect.objectContaining({
        githubAppInstallationId: null,
        githubAppUsername: null,
        githubAppAvatarUrl: null,
        isTokenValid: null,
      })
    );
  });

  it('syncs App metadata without an authentication selector', async () => {
    mockChromeStorage.local.get
      .mockResolvedValueOnce({
        githubAppInstallationId: 12345,
        githubAppUsername: 'octocat',
        githubAppAvatarUrl: 'avatar',
      })
      .mockResolvedValueOnce({
        githubAppInstallationId: 12345,
        githubAppUsername: 'octocat',
        githubAppAvatarUrl: 'avatar',
      });

    await githubSettingsActions.syncGitHubAppFromStorage();

    expect(mockChromeStorage.local.get).toHaveBeenNthCalledWith(1, [
      'githubAppInstallationId',
      'githubAppUsername',
      'githubAppAvatarUrl',
    ]);
    expect(get(githubSettingsStore).githubAppInstallationId).toBe(12345);
  });

  it('resets all App and repository state', () => {
    githubSettingsActions.setGitHubAppSettings(12345, 'octocat', 'avatar');
    githubSettingsActions.setRepoOwner('octocat');
    githubSettingsActions.reset();
    expect(get(githubSettingsStore)).toEqual(defaultState);
  });
});
