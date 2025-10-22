import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  githubSettingsActions,
  githubSettingsStore,
  isAuthenticationValid,
  isSettingsValid,
  type GitHubSettingsState,
} from '../githubSettings';

const mockChromeStorage = {
  sync: {
    get: vi.fn(),
  },
  local: {
    get: vi.fn(),
  },
};

global.chrome = {
  storage: mockChromeStorage,
} as unknown as typeof chrome;

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../services/chromeStorage', () => ({
  ChromeStorageService: {
    saveGitHubSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: vi.fn().mockImplementation(function (this: {
    validateTokenAndUser: (username: string) => Promise<{ isValid: boolean; error?: string }>;
  }) {
    this.validateTokenAndUser = vi.fn().mockResolvedValue({ isValid: true });
    return this;
  }),
}));

describe('githubSettings Store', () => {
  const defaultState: GitHubSettingsState = {
    githubToken: '',
    repoOwner: '',
    repoName: '',
    branch: 'main',
    projectSettings: {},
    isValidatingToken: false,
    isTokenValid: null,
    validationError: null,
    hasInitialSettings: false,
    authenticationMethod: 'github_app',
    githubAppInstallationId: null,
    githubAppUsername: null,
    githubAppAvatarUrl: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    githubSettingsStore.set(defaultState);
    mockChromeStorage.sync.get.mockResolvedValue({});
    mockChromeStorage.local.get.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('store initialization', () => {
    it('should initialize with default state', () => {
      const state = get(githubSettingsStore);
      expect(state).toEqual(defaultState);
    });

    it('should have correct default values', () => {
      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('');
      expect(state.repoOwner).toBe('');
      expect(state.repoName).toBe('');
      expect(state.branch).toBe('main');
      expect(state.projectSettings).toEqual({});
      expect(state.isValidatingToken).toBe(false);
      expect(state.isTokenValid).toBe(null);
      expect(state.validationError).toBe(null);
      expect(state.hasInitialSettings).toBe(false);
      expect(state.authenticationMethod).toBe('github_app');
      expect(state.githubAppInstallationId).toBe(null);
      expect(state.githubAppUsername).toBe(null);
      expect(state.githubAppAvatarUrl).toBe(null);
    });
  });

  describe('derived stores', () => {
    describe('isAuthenticationValid', () => {
      it('should be true for valid GitHub App authentication', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
          repoOwner: 'testuser',
          isValidatingToken: false,
        }));

        expect(get(isAuthenticationValid)).toBe(true);
      });

      it('should be false for GitHub App without installation ID', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'github_app',
          githubAppInstallationId: null,
          repoOwner: 'testuser',
        }));

        expect(get(isAuthenticationValid)).toBe(false);
      });

      it('should be false for GitHub App without repoOwner', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
          repoOwner: '',
        }));

        expect(get(isAuthenticationValid)).toBe(false);
      });

      it('should be true for valid PAT authentication', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'pat',
          githubToken: 'test-token',
          repoOwner: 'testuser',
          isTokenValid: true,
          isValidatingToken: false,
        }));

        expect(get(isAuthenticationValid)).toBe(true);
      });

      it('should be false for PAT without token', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'pat',
          githubToken: '',
          repoOwner: 'testuser',
          isTokenValid: true,
        }));

        expect(get(isAuthenticationValid)).toBe(false);
      });

      it('should be false for PAT with invalid token', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'pat',
          githubToken: 'test-token',
          repoOwner: 'testuser',
          isTokenValid: false,
        }));

        expect(get(isAuthenticationValid)).toBe(false);
      });

      it('should be false when validating token', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'pat',
          githubToken: 'test-token',
          repoOwner: 'testuser',
          isTokenValid: true,
          isValidatingToken: true,
        }));

        expect(get(isAuthenticationValid)).toBe(false);
      });

      it('should be false for PAT without repoOwner', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'pat',
          githubToken: 'test-token',
          repoOwner: '',
          isTokenValid: true,
        }));

        expect(get(isAuthenticationValid)).toBe(false);
      });
    });

    describe('isSettingsValid', () => {
      it('should be true for complete GitHub App settings', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
          repoOwner: 'testuser',
          repoName: 'test-repo',
          branch: 'main',
          isValidatingToken: false,
        }));

        expect(get(isSettingsValid)).toBe(true);
      });

      it('should be true for complete PAT settings', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'pat',
          githubToken: 'test-token',
          isTokenValid: true,
          repoOwner: 'testuser',
          repoName: 'test-repo',
          branch: 'main',
          isValidatingToken: false,
        }));

        expect(get(isSettingsValid)).toBe(true);
      });

      it('should be false without repoOwner', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
          repoOwner: '',
          repoName: 'test-repo',
          branch: 'main',
        }));

        expect(get(isSettingsValid)).toBe(false);
      });

      it('should be false without repoName', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
          repoOwner: 'testuser',
          repoName: '',
          branch: 'main',
        }));

        expect(get(isSettingsValid)).toBe(false);
      });

      it('should be false without branch', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
          repoOwner: 'testuser',
          repoName: 'test-repo',
          branch: '',
        }));

        expect(get(isSettingsValid)).toBe(false);
      });

      it('should be false for GitHub App without installation ID', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'github_app',
          githubAppInstallationId: null,
          repoOwner: 'testuser',
          repoName: 'test-repo',
          branch: 'main',
        }));

        expect(get(isSettingsValid)).toBe(false);
      });

      it('should be false for PAT without valid token', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'pat',
          githubToken: 'test-token',
          isTokenValid: false,
          repoOwner: 'testuser',
          repoName: 'test-repo',
          branch: 'main',
        }));

        expect(get(isSettingsValid)).toBe(false);
      });

      it('should be false when validating token', () => {
        githubSettingsStore.update((state) => ({
          ...state,
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
          repoOwner: 'testuser',
          repoName: 'test-repo',
          branch: 'main',
          isValidatingToken: true,
        }));

        expect(get(isSettingsValid)).toBe(false);
      });
    });
  });

  describe('githubSettingsActions.initialize', () => {
    it('should initialize with PAT from storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        githubToken: 'stored-token',
        repoOwner: 'storeduser',
        projectSettings: { project1: { repoName: 'repo1', branch: 'main' } },
      });
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'pat',
      });

      await githubSettingsActions.initialize();

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('stored-token');
      expect(state.repoOwner).toBe('storeduser');
      expect(state.projectSettings).toEqual({ project1: { repoName: 'repo1', branch: 'main' } });
      expect(state.authenticationMethod).toBe('pat');
      expect(state.hasInitialSettings).toBe(true);
    });

    it('should initialize with GitHub App from storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: 'testuser',
        projectSettings: {},
      });
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
        githubAppInstallationId: 54321,
        githubAppUsername: 'appuser',
        githubAppAvatarUrl: 'https://avatar.url',
      });

      await githubSettingsActions.initialize();

      const state = get(githubSettingsStore);
      expect(state.authenticationMethod).toBe('github_app');
      expect(state.githubAppInstallationId).toBe(54321);
      expect(state.githubAppUsername).toBe('appuser');
      expect(state.githubAppAvatarUrl).toBe('https://avatar.url');
      expect(state.isTokenValid).toBe(true);
    });

    it('should auto-populate repoOwner from GitHub App username', async () => {
      const { ChromeStorageService } = await import('../../services/chromeStorage');

      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: '',
        projectSettings: {},
      });
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
        githubAppInstallationId: 54321,
        githubAppUsername: 'autopopulated',
        githubAppAvatarUrl: 'https://avatar.url',
      });

      await githubSettingsActions.initialize();

      expect(ChromeStorageService.saveGitHubSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          repoOwner: 'autopopulated',
        })
      );

      const state = get(githubSettingsStore);
      expect(state.repoOwner).toBe('autopopulated');
    });

    it('should validate PAT token during initialization', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      mockChromeStorage.sync.get.mockResolvedValue({
        githubToken: 'valid-token',
        repoOwner: 'validuser',
        projectSettings: {},
      });
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'pat',
      });

      await githubSettingsActions.initialize();

      expect(UnifiedGitHubService).toHaveBeenCalledWith('valid-token');
    });

    it('should set token valid for GitHub App with installation ID', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        githubAppUsername: 'appuser',
      });

      await githubSettingsActions.initialize();

      const state = get(githubSettingsStore);
      expect(state.isTokenValid).toBe(true);
    });

    it('should default to PAT when no authentication method stored', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });
      mockChromeStorage.local.get.mockResolvedValue({});

      await githubSettingsActions.initialize();

      const state = get(githubSettingsStore);
      expect(state.authenticationMethod).toBe('pat');
    });

    it('should handle initialization error gracefully', async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error('Storage error'));

      await expect(githubSettingsActions.initialize()).resolves.not.toThrow();
    });

    it('should handle missing projectSettings in storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
      });
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'pat',
      });

      await githubSettingsActions.initialize();

      const state = get(githubSettingsStore);
      expect(state.projectSettings).toEqual({});
    });
  });

  describe('githubSettingsActions.setGitHubToken', () => {
    it('should update token and reset validation state', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        isTokenValid: true,
        validationError: 'old error',
      }));

      githubSettingsActions.setGitHubToken('new-token');

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('new-token');
      expect(state.isTokenValid).toBe(null);
      expect(state.validationError).toBe(null);
    });

    it('should allow setting empty token', () => {
      githubSettingsActions.setGitHubToken('');

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('');
    });

    it('should preserve other state when setting token', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        repoOwner: 'testuser',
        repoName: 'test-repo',
        branch: 'develop',
      }));

      githubSettingsActions.setGitHubToken('test-token');

      const state = get(githubSettingsStore);
      expect(state.repoOwner).toBe('testuser');
      expect(state.repoName).toBe('test-repo');
      expect(state.branch).toBe('develop');
    });
  });

  describe('githubSettingsActions.setRepoOwner', () => {
    it('should update repo owner and reset validation state', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        isTokenValid: true,
        validationError: 'old error',
      }));

      githubSettingsActions.setRepoOwner('newowner');

      const state = get(githubSettingsStore);
      expect(state.repoOwner).toBe('newowner');
      expect(state.isTokenValid).toBe(null);
      expect(state.validationError).toBe(null);
    });

    it('should allow setting empty repo owner', () => {
      githubSettingsActions.setRepoOwner('');

      const state = get(githubSettingsStore);
      expect(state.repoOwner).toBe('');
    });

    it('should preserve other state when setting repo owner', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        githubToken: 'test-token',
        repoName: 'test-repo',
        branch: 'main',
      }));

      githubSettingsActions.setRepoOwner('newowner');

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('test-token');
      expect(state.repoName).toBe('test-repo');
      expect(state.branch).toBe('main');
    });
  });

  describe('githubSettingsActions.setRepoName', () => {
    it('should update repository name', () => {
      githubSettingsActions.setRepoName('new-repo');

      const state = get(githubSettingsStore);
      expect(state.repoName).toBe('new-repo');
    });

    it('should allow setting empty repo name', () => {
      githubSettingsActions.setRepoName('');

      const state = get(githubSettingsStore);
      expect(state.repoName).toBe('');
    });

    it('should preserve other state when setting repo name', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        repoOwner: 'testuser',
        githubToken: 'test-token',
        branch: 'develop',
      }));

      githubSettingsActions.setRepoName('test-repo');

      const state = get(githubSettingsStore);
      expect(state.repoOwner).toBe('testuser');
      expect(state.githubToken).toBe('test-token');
      expect(state.branch).toBe('develop');
    });
  });

  describe('githubSettingsActions.setBranch', () => {
    it('should update branch name', () => {
      githubSettingsActions.setBranch('develop');

      const state = get(githubSettingsStore);
      expect(state.branch).toBe('develop');
    });

    it('should allow setting empty branch', () => {
      githubSettingsActions.setBranch('');

      const state = get(githubSettingsStore);
      expect(state.branch).toBe('');
    });

    it('should preserve other state when setting branch', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        repoOwner: 'testuser',
        repoName: 'test-repo',
        githubToken: 'test-token',
      }));

      githubSettingsActions.setBranch('feature/test');

      const state = get(githubSettingsStore);
      expect(state.repoOwner).toBe('testuser');
      expect(state.repoName).toBe('test-repo');
      expect(state.githubToken).toBe('test-token');
    });
  });

  describe('githubSettingsActions.setProjectSettings', () => {
    it('should add new project settings', () => {
      githubSettingsActions.setProjectSettings('project1', 'repo1', 'main');

      const state = get(githubSettingsStore);
      expect(state.projectSettings.project1).toEqual({
        repoName: 'repo1',
        branch: 'main',
      });
    });

    it('should include project title when provided', () => {
      githubSettingsActions.setProjectSettings('project2', 'repo2', 'develop', 'My Project');

      const state = get(githubSettingsStore);
      expect(state.projectSettings.project2).toEqual({
        repoName: 'repo2',
        branch: 'develop',
        projectTitle: 'My Project',
      });
    });

    it('should update existing project settings', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        projectSettings: {
          project1: { repoName: 'old-repo', branch: 'old-branch' },
        },
      }));

      githubSettingsActions.setProjectSettings('project1', 'new-repo', 'new-branch');

      const state = get(githubSettingsStore);
      expect(state.projectSettings.project1).toEqual({
        repoName: 'new-repo',
        branch: 'new-branch',
      });
    });

    it('should preserve other projects when updating one', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        projectSettings: {
          project1: { repoName: 'repo1', branch: 'main' },
          project2: { repoName: 'repo2', branch: 'develop' },
        },
      }));

      githubSettingsActions.setProjectSettings('project1', 'updated-repo', 'updated-branch');

      const state = get(githubSettingsStore);
      expect(state.projectSettings.project1).toEqual({
        repoName: 'updated-repo',
        branch: 'updated-branch',
      });
      expect(state.projectSettings.project2).toEqual({
        repoName: 'repo2',
        branch: 'develop',
      });
    });
  });

  describe('githubSettingsActions.loadProjectSettings', () => {
    it('should load settings from existing project', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        projectSettings: {
          project1: { repoName: 'stored-repo', branch: 'stored-branch' },
        },
      }));

      githubSettingsActions.loadProjectSettings('project1');

      const state = get(githubSettingsStore);
      expect(state.repoName).toBe('stored-repo');
      expect(state.branch).toBe('stored-branch');
    });

    it('should use project ID as repo name when no settings exist', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        projectSettings: {},
      }));

      githubSettingsActions.loadProjectSettings('new-project');

      const state = get(githubSettingsStore);
      expect(state.repoName).toBe('new-project');
      expect(state.branch).toBe('main');
    });

    it('should default to main branch when no settings exist', () => {
      githubSettingsActions.loadProjectSettings('unknown-project');

      const state = get(githubSettingsStore);
      expect(state.branch).toBe('main');
    });

    it('should preserve other state when loading project settings', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        githubToken: 'test-token',
        repoOwner: 'testuser',
        projectSettings: {
          project1: { repoName: 'repo1', branch: 'develop' },
        },
      }));

      githubSettingsActions.loadProjectSettings('project1');

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('test-token');
      expect(state.repoOwner).toBe('testuser');
    });
  });

  describe('githubSettingsActions.validateToken', () => {
    it('should validate PAT token successfully', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const mockValidate = vi.fn().mockResolvedValue({ isValid: true });
      vi.mocked(UnifiedGitHubService).mockImplementation(function (this: {
        validateTokenAndUser: typeof mockValidate;
      }) {
        this.validateTokenAndUser = mockValidate;
        return this;
      } as never);

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
      }));

      const result = await githubSettingsActions.validateToken('test-token', 'testuser');

      expect(result).toBe(true);
      const state = get(githubSettingsStore);
      expect(state.isTokenValid).toBe(true);
      expect(state.validationError).toBe(null);
      expect(state.isValidatingToken).toBe(false);
    });

    it('should validate PAT token with error', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const mockValidate = vi.fn().mockResolvedValue({ isValid: false, error: 'Invalid token' });
      vi.mocked(UnifiedGitHubService).mockImplementation(function (this: {
        validateTokenAndUser: typeof mockValidate;
      }) {
        this.validateTokenAndUser = mockValidate;
        return this;
      } as never);

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
      }));

      const result = await githubSettingsActions.validateToken('invalid-token', 'testuser');

      expect(result).toBe(false);
      const state = get(githubSettingsStore);
      expect(state.isTokenValid).toBe(false);
      expect(state.validationError).toBe('Invalid token');
      expect(state.isValidatingToken).toBe(false);
    });

    it('should set isValidatingToken to true during validation', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      let validationInProgress = false;
      const mockValidate = vi.fn().mockImplementation(async () => {
        validationInProgress = get(githubSettingsStore).isValidatingToken;
        return { isValid: true };
      });

      vi.mocked(UnifiedGitHubService).mockImplementation(function (this: {
        validateTokenAndUser: typeof mockValidate;
      }) {
        this.validateTokenAndUser = mockValidate;
        return this;
      } as never);

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
      }));

      await githubSettingsActions.validateToken('test-token', 'testuser');

      expect(validationInProgress).toBe(true);
    });

    it('should fail validation when PAT token is empty', async () => {
      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
      }));

      const result = await githubSettingsActions.validateToken('', 'testuser');

      expect(result).toBe(false);
      const state = get(githubSettingsStore);
      expect(state.isTokenValid).toBe(false);
      expect(state.validationError).toBe('GitHub token is required');
    });

    it('should validate GitHub App successfully', async () => {
      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
      }));

      const result = await githubSettingsActions.validateToken('', 'testuser');

      expect(result).toBe(true);
    });

    it('should fail validation when GitHub App installation ID missing', async () => {
      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        githubAppInstallationId: null,
      }));

      const result = await githubSettingsActions.validateToken('', 'testuser');

      expect(result).toBe(false);
      const state = get(githubSettingsStore);
      expect(state.isTokenValid).toBe(false);
      expect(state.validationError).toBe('GitHub App installation not found');
    });

    it('should handle validation error gracefully', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const mockValidate = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.mocked(UnifiedGitHubService).mockImplementation(function (this: {
        validateTokenAndUser: typeof mockValidate;
      }) {
        this.validateTokenAndUser = mockValidate;
        return this;
      } as never);

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
      }));

      const result = await githubSettingsActions.validateToken('test-token', 'testuser');

      expect(result).toBe(false);
      const state = get(githubSettingsStore);
      expect(state.isTokenValid).toBe(false);
      expect(state.validationError).toBe('Validation failed');
    });

    it('should use correct authentication strategy for PAT', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
      }));

      await githubSettingsActions.validateToken('my-token', 'testuser');

      expect(UnifiedGitHubService).toHaveBeenCalledWith('my-token');
    });

    it('should use correct authentication strategy for GitHub App', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        githubAppInstallationId: 54321,
      }));

      await githubSettingsActions.validateToken('', 'testuser');

      expect(UnifiedGitHubService).toHaveBeenCalledWith({ type: 'github_app' });
    });
  });

  describe('githubSettingsActions.saveSettings', () => {
    it('should save valid PAT settings', async () => {
      const { ChromeStorageService } = await import('../../services/chromeStorage');
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const mockValidate = vi.fn().mockResolvedValue({ isValid: true });
      vi.mocked(UnifiedGitHubService).mockImplementation(function (this: {
        validateTokenAndUser: typeof mockValidate;
      }) {
        this.validateTokenAndUser = mockValidate;
        return this;
      } as never);

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
        githubToken: 'valid-token',
        repoOwner: 'testuser',
        projectSettings: { project1: { repoName: 'repo1', branch: 'main' } },
      }));

      const result = await githubSettingsActions.saveSettings();

      expect(result.success).toBe(true);
      expect(ChromeStorageService.saveGitHubSettings).toHaveBeenCalledWith({
        githubToken: 'valid-token',
        repoOwner: 'testuser',
        projectSettings: { project1: { repoName: 'repo1', branch: 'main' } },
        authenticationMethod: 'pat',
        githubAppInstallationId: undefined,
        githubAppUsername: undefined,
        githubAppAvatarUrl: undefined,
      });

      const state = get(githubSettingsStore);
      expect(state.hasInitialSettings).toBe(true);
    });

    it('should save valid GitHub App settings', async () => {
      const { ChromeStorageService } = await import('../../services/chromeStorage');

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        githubAppUsername: 'appuser',
        githubAppAvatarUrl: 'https://avatar.url',
        repoOwner: 'appuser',
        projectSettings: {},
      }));

      const result = await githubSettingsActions.saveSettings();

      expect(result.success).toBe(true);
      expect(ChromeStorageService.saveGitHubSettings).toHaveBeenCalledWith({
        githubToken: '',
        repoOwner: 'appuser',
        projectSettings: {},
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        githubAppUsername: 'appuser',
        githubAppAvatarUrl: 'https://avatar.url',
      });
    });

    it('should fail save when PAT validation fails', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const mockValidate = vi.fn().mockResolvedValue({ isValid: false, error: 'Invalid token' });
      vi.mocked(UnifiedGitHubService).mockImplementation(function (this: {
        validateTokenAndUser: typeof mockValidate;
      }) {
        this.validateTokenAndUser = mockValidate;
        return this;
      } as never);

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
        githubToken: 'invalid-token',
        repoOwner: 'testuser',
        validationError: 'Invalid token',
      }));

      const result = await githubSettingsActions.saveSettings();

      expect(result.success).toBe(false);
      expect(result.error).toContain('token');
    });

    it('should fail save when GitHub App missing installation ID', async () => {
      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        githubAppInstallationId: null,
        repoOwner: 'testuser',
      }));

      const result = await githubSettingsActions.saveSettings();

      expect(result.success).toBe(false);
      expect(result.error).toBe('GitHub App authentication or repository owner missing');
    });

    it('should fail save when GitHub App missing repo owner', async () => {
      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        repoOwner: '',
      }));

      const result = await githubSettingsActions.saveSettings();

      expect(result.success).toBe(false);
      expect(result.error).toBe('GitHub App authentication or repository owner missing');
    });

    it('should handle storage error gracefully', async () => {
      const { ChromeStorageService } = await import('../../services/chromeStorage');
      vi.mocked(ChromeStorageService.saveGitHubSettings).mockRejectedValue(
        new Error('Storage error')
      );

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        repoOwner: 'testuser',
      }));

      const result = await githubSettingsActions.saveSettings();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
    });
  });

  describe('githubSettingsActions.setAuthenticationMethod', () => {
    it('should switch to PAT authentication', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        isTokenValid: true,
        validationError: 'some error',
      }));

      githubSettingsActions.setAuthenticationMethod('pat');

      const state = get(githubSettingsStore);
      expect(state.authenticationMethod).toBe('pat');
      expect(state.isTokenValid).toBe(null);
      expect(state.validationError).toBe(null);
    });

    it('should switch to GitHub App authentication', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
        isTokenValid: false,
        validationError: 'invalid token',
      }));

      githubSettingsActions.setAuthenticationMethod('github_app');

      const state = get(githubSettingsStore);
      expect(state.authenticationMethod).toBe('github_app');
      expect(state.isTokenValid).toBe(null);
      expect(state.validationError).toBe(null);
    });

    it('should preserve other state when switching methods', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        githubToken: 'test-token',
        repoOwner: 'testuser',
        repoName: 'test-repo',
        branch: 'main',
      }));

      githubSettingsActions.setAuthenticationMethod('github_app');

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('test-token');
      expect(state.repoOwner).toBe('testuser');
      expect(state.repoName).toBe('test-repo');
      expect(state.branch).toBe('main');
    });
  });

  describe('githubSettingsActions.setGitHubAppSettings', () => {
    it('should set GitHub App settings', () => {
      githubSettingsActions.setGitHubAppSettings(
        98765,
        'githubappuser',
        'https://avatar.example.com'
      );

      const state = get(githubSettingsStore);
      expect(state.githubAppInstallationId).toBe(98765);
      expect(state.githubAppUsername).toBe('githubappuser');
      expect(state.githubAppAvatarUrl).toBe('https://avatar.example.com');
      expect(state.authenticationMethod).toBe('github_app');
      expect(state.isTokenValid).toBe(true);
    });

    it('should allow setting null values', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        githubAppInstallationId: 12345,
        githubAppUsername: 'olduser',
        githubAppAvatarUrl: 'https://old.avatar.url',
      }));

      githubSettingsActions.setGitHubAppSettings(null, null, null);

      const state = get(githubSettingsStore);
      expect(state.githubAppInstallationId).toBe(null);
      expect(state.githubAppUsername).toBe(null);
      expect(state.githubAppAvatarUrl).toBe(null);
      expect(state.authenticationMethod).toBe('github_app');
      expect(state.isTokenValid).toBe(null);
    });

    it('should set isTokenValid to true when installation ID provided', () => {
      githubSettingsActions.setGitHubAppSettings(55555, 'testuser', 'https://avatar.url');

      const state = get(githubSettingsStore);
      expect(state.isTokenValid).toBe(true);
    });

    it('should set isTokenValid to null when installation ID is null', () => {
      githubSettingsActions.setGitHubAppSettings(null, 'testuser', 'https://avatar.url');

      const state = get(githubSettingsStore);
      expect(state.isTokenValid).toBe(null);
    });
  });

  describe('githubSettingsActions.clearGitHubAppSettings', () => {
    it('should clear all GitHub App settings', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        githubAppUsername: 'appuser',
        githubAppAvatarUrl: 'https://avatar.url',
        isTokenValid: true,
      }));

      githubSettingsActions.clearGitHubAppSettings();

      const state = get(githubSettingsStore);
      expect(state.githubAppInstallationId).toBe(null);
      expect(state.githubAppUsername).toBe(null);
      expect(state.githubAppAvatarUrl).toBe(null);
      expect(state.authenticationMethod).toBe('pat');
      expect(state.isTokenValid).toBe(null);
    });

    it('should preserve other settings when clearing', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        githubToken: 'test-token',
        repoOwner: 'testuser',
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
      }));

      githubSettingsActions.clearGitHubAppSettings();

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('test-token');
      expect(state.repoOwner).toBe('testuser');
      expect(state.repoName).toBe('test-repo');
      expect(state.branch).toBe('main');
    });
  });

  describe('githubSettingsActions.syncGitHubAppFromStorage', () => {
    it('should sync GitHub App settings from storage', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
        githubAppInstallationId: 99999,
        githubAppUsername: 'synceduser',
        githubAppAvatarUrl: 'https://synced.avatar.url',
      });
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      await githubSettingsActions.syncGitHubAppFromStorage();

      const state = get(githubSettingsStore);
      expect(state.githubAppInstallationId).toBe(99999);
      expect(state.githubAppUsername).toBe('synceduser');
      expect(state.githubAppAvatarUrl).toBe('https://synced.avatar.url');
      expect(state.authenticationMethod).toBe('github_app');
    });

    it('should not sync when authentication method is not GitHub App', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'pat',
      });

      githubSettingsStore.update((state) => ({
        ...state,
        githubAppInstallationId: null,
      }));

      await githubSettingsActions.syncGitHubAppFromStorage();

      const state = get(githubSettingsStore);
      expect(state.githubAppInstallationId).toBe(null);
    });

    it('should handle storage error gracefully', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      await expect(githubSettingsActions.syncGitHubAppFromStorage()).resolves.not.toThrow();
    });

    it('should re-initialize after syncing GitHub App settings', async () => {
      const { ChromeStorageService } = await import('../../services/chromeStorage');

      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
        githubAppInstallationId: 88888,
        githubAppUsername: 'reinituser',
      });
      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: '',
        projectSettings: {},
      });

      await githubSettingsActions.syncGitHubAppFromStorage();

      const state = get(githubSettingsStore);
      expect(state.githubAppInstallationId).toBe(88888);
      expect(state.githubAppUsername).toBe('reinituser');
      expect(ChromeStorageService.saveGitHubSettings).toHaveBeenCalled();
    });
  });

  describe('githubSettingsActions.reset', () => {
    it('should reset all settings to initial state', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        githubToken: 'test-token',
        repoOwner: 'testuser',
        repoName: 'test-repo',
        branch: 'develop',
        projectSettings: { project1: { repoName: 'repo1', branch: 'main' } },
        isValidatingToken: true,
        isTokenValid: true,
        validationError: 'error',
        hasInitialSettings: true,
        authenticationMethod: 'pat',
        githubAppInstallationId: 12345,
        githubAppUsername: 'appuser',
        githubAppAvatarUrl: 'https://avatar.url',
      }));

      githubSettingsActions.reset();

      const state = get(githubSettingsStore);
      expect(state).toEqual(defaultState);
    });

    it('should allow resetting multiple times', () => {
      githubSettingsActions.reset();
      githubSettingsActions.reset();

      const state = get(githubSettingsStore);
      expect(state).toEqual(defaultState);
    });
  });

  describe('integration scenarios', () => {
    it('should handle project switching with different settings', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        repoOwner: 'testuser',
        projectSettings: {
          project1: { repoName: 'repo1', branch: 'main' },
          project2: { repoName: 'repo2', branch: 'develop' },
        },
      }));

      githubSettingsActions.loadProjectSettings('project1');
      let state = get(githubSettingsStore);
      expect(state.repoName).toBe('repo1');
      expect(state.branch).toBe('main');

      githubSettingsActions.loadProjectSettings('project2');
      state = get(githubSettingsStore);
      expect(state.repoName).toBe('repo2');
      expect(state.branch).toBe('develop');
    });

    it('should handle authentication method switch preserving data', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        githubToken: 'pat-token',
        repoOwner: 'testuser',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat',
      }));

      githubSettingsActions.setAuthenticationMethod('github_app');
      githubSettingsActions.setGitHubAppSettings(12345, 'testuser', 'https://avatar.url');

      const state = get(githubSettingsStore);
      expect(state.authenticationMethod).toBe('github_app');
      expect(state.repoOwner).toBe('testuser');
      expect(state.repoName).toBe('test-repo');
      expect(state.branch).toBe('main');
      expect(state.githubToken).toBe('pat-token');
    });

    it('should maintain derived store validity during state changes', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'github_app',
        githubAppInstallationId: 98765,
        repoOwner: 'validuser',
        repoName: 'valid-repo',
        branch: 'main',
      }));

      expect(get(isAuthenticationValid)).toBe(true);
      expect(get(isSettingsValid)).toBe(true);

      githubSettingsActions.setRepoName('');

      expect(get(isAuthenticationValid)).toBe(true);
      expect(get(isSettingsValid)).toBe(false);
    });

    it('should handle multiple project settings updates', () => {
      for (let i = 1; i <= 5; i++) {
        githubSettingsActions.setProjectSettings(`project${i}`, `repo${i}`, `branch${i}`);
      }

      const state = get(githubSettingsStore);
      expect(Object.keys(state.projectSettings).length).toBe(5);
      expect(state.projectSettings.project3).toEqual({ repoName: 'repo3', branch: 'branch3' });
    });
  });

  describe('edge cases', () => {
    it('should handle very long token', () => {
      const longToken = 'a'.repeat(1000);
      githubSettingsActions.setGitHubToken(longToken);

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe(longToken);
    });

    it('should handle special characters in repo owner', () => {
      githubSettingsActions.setRepoOwner('user-with_special.chars');

      const state = get(githubSettingsStore);
      expect(state.repoOwner).toBe('user-with_special.chars');
    });

    it('should handle special characters in repo name', () => {
      githubSettingsActions.setRepoName('repo-with_special.chars-123');

      const state = get(githubSettingsStore);
      expect(state.repoName).toBe('repo-with_special.chars-123');
    });

    it('should handle special characters in branch name', () => {
      githubSettingsActions.setBranch('feature/test-branch_v1.0');

      const state = get(githubSettingsStore);
      expect(state.branch).toBe('feature/test-branch_v1.0');
    });

    it('should handle rapid state updates', () => {
      for (let i = 0; i < 100; i++) {
        githubSettingsActions.setRepoName(`repo-${i}`);
      }

      const state = get(githubSettingsStore);
      expect(state.repoName).toBe('repo-99');
    });

    it('should handle concurrent async operations', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const mockValidate = vi.fn().mockResolvedValue({ isValid: true });
      vi.mocked(UnifiedGitHubService).mockImplementation(function (this: {
        validateTokenAndUser: typeof mockValidate;
      }) {
        this.validateTokenAndUser = mockValidate;
        return this;
      } as never);

      githubSettingsStore.update((state) => ({
        ...state,
        authenticationMethod: 'pat',
      }));

      const promises = [
        githubSettingsActions.validateToken('token1', 'user1'),
        githubSettingsActions.validateToken('token2', 'user2'),
        githubSettingsActions.validateToken('token3', 'user3'),
      ];

      const results = await Promise.all(promises);
      expect(results.every((r) => r === true)).toBe(true);
    });

    it('should handle empty project settings object', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        projectSettings: {},
      }));

      githubSettingsActions.loadProjectSettings('nonexistent');

      const state = get(githubSettingsStore);
      expect(state.repoName).toBe('nonexistent');
      expect(state.branch).toBe('main');
    });

    it('should handle null values in Chrome storage gracefully', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        githubToken: null,
        repoOwner: null,
        projectSettings: null,
      });
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: null,
      });

      await githubSettingsActions.initialize();

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('');
      expect(state.repoOwner).toBe('');
      expect(state.projectSettings).toEqual({});
    });

    it('should handle undefined values in Chrome storage gracefully', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({});
      mockChromeStorage.local.get.mockResolvedValue({});

      await githubSettingsActions.initialize();

      const state = get(githubSettingsStore);
      expect(state.githubToken).toBe('');
      expect(state.repoOwner).toBe('');
      expect(state.projectSettings).toEqual({});
    });

    it('should handle malformed project settings', () => {
      githubSettingsStore.update((state) => ({
        ...state,
        projectSettings: {
          malformed: {} as never,
        },
      }));

      githubSettingsActions.loadProjectSettings('malformed');

      const state = get(githubSettingsStore);
      expect(state.repoName).toBe(undefined);
      expect(state.branch).toBe(undefined);
    });
  });
});
