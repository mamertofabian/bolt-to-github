import type { GitHubSettingsInterface, ProjectSettings, PushStatistics } from '$lib/types';
import type { FileChange } from '../../../services/FilePreviewService';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ChromeStorageService, STORAGE_KEYS } from '../chromeStorage';

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

interface MockChromeStorage {
  sync: {
    get: Mock;
    set: Mock;
    remove: Mock;
    clear: Mock;
  };
  local: {
    get: Mock;
    set: Mock;
    remove: Mock;
    clear: Mock;
  };
  onChanged: {
    addListener: Mock;
    removeListener: Mock;
  };
}

const mockChromeStorage: MockChromeStorage = {
  sync: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

global.chrome = {
  storage: mockChromeStorage,
  runtime: {
    lastError: undefined,
  },
} as unknown as typeof chrome;

describe('ChromeStorageService - Comprehensive Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = undefined;
    mockChromeStorage.sync.get.mockResolvedValue({});
    mockChromeStorage.sync.set.mockResolvedValue(undefined);
    mockChromeStorage.sync.remove.mockResolvedValue(undefined);
    mockChromeStorage.sync.clear.mockResolvedValue(undefined);
    mockChromeStorage.local.get.mockResolvedValue({});
    mockChromeStorage.local.set.mockResolvedValue(undefined);
    mockChromeStorage.local.remove.mockResolvedValue(undefined);
    mockChromeStorage.local.clear.mockResolvedValue(undefined);
  });

  describe('STORAGE_KEYS constant', () => {
    it('should export all required storage keys', () => {
      expect(STORAGE_KEYS.GITHUB_TOKEN).toBe('githubToken');
      expect(STORAGE_KEYS.REPO_OWNER).toBe('repoOwner');
      expect(STORAGE_KEYS.PROJECT_SETTINGS).toBe('projectSettings');
      expect(STORAGE_KEYS.PROJECT_ID).toBe('projectId');
      expect(STORAGE_KEYS.PENDING_FILE_CHANGES).toBe('pendingFileChanges');
      expect(STORAGE_KEYS.STORED_FILE_CHANGES).toBe('storedFileChanges');
      expect(STORAGE_KEYS.PUSH_STATISTICS).toBe('pushStatistics');
      expect(STORAGE_KEYS.AUTHENTICATION_METHOD).toBe('authenticationMethod');
      expect(STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID).toBe('githubAppInstallationId');
      expect(STORAGE_KEYS.GITHUB_APP_ACCESS_TOKEN).toBe('githubAppAccessToken');
      expect(STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN).toBe('githubAppRefreshToken');
      expect(STORAGE_KEYS.GITHUB_APP_EXPIRES_AT).toBe('githubAppExpiresAt');
      expect(STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN_EXPIRES_AT).toBe(
        'githubAppRefreshTokenExpiresAt'
      );
      expect(STORAGE_KEYS.GITHUB_APP_USERNAME).toBe('githubAppUsername');
      expect(STORAGE_KEYS.GITHUB_APP_USER_ID).toBe('githubAppUserId');
      expect(STORAGE_KEYS.GITHUB_APP_AVATAR_URL).toBe('githubAppAvatarUrl');
      expect(STORAGE_KEYS.GITHUB_APP_SCOPES).toBe('githubAppScopes');
      expect(STORAGE_KEYS.MIGRATION_PROMPT_SHOWN).toBe('migrationPromptShown');
      expect(STORAGE_KEYS.LAST_MIGRATION_PROMPT).toBe('lastMigrationPrompt');
    });
  });

  describe('getGitHubSettings', () => {
    it('should retrieve GitHub settings from both sync and local storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: { project1: { repoName: 'repo1', branch: 'main' } },
      });

      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        githubAppUsername: 'test-user',
        githubAppAvatarUrl: 'https://avatar.url',
      });

      const result = await ChromeStorageService.getGitHubSettings();

      expect(result).toEqual({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: { project1: { repoName: 'repo1', branch: 'main' } },
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        githubAppUsername: 'test-user',
        githubAppAvatarUrl: 'https://avatar.url',
      });

      expect(mockChromeStorage.sync.get).toHaveBeenCalledWith([
        STORAGE_KEYS.GITHUB_TOKEN,
        STORAGE_KEYS.REPO_OWNER,
        STORAGE_KEYS.PROJECT_SETTINGS,
      ]);

      expect(mockChromeStorage.local.get).toHaveBeenCalledWith([
        STORAGE_KEYS.AUTHENTICATION_METHOD,
        STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID,
        STORAGE_KEYS.GITHUB_APP_USERNAME,
        STORAGE_KEYS.GITHUB_APP_AVATAR_URL,
      ]);
    });

    it('should return default values when storage is empty', async () => {
      const result = await ChromeStorageService.getGitHubSettings();

      expect(result).toEqual({
        githubToken: '',
        repoOwner: '',
        projectSettings: {},
        authenticationMethod: 'pat',
      });
    });

    it('should return default values on storage error', async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.getGitHubSettings();

      expect(result).toEqual({
        githubToken: '',
        repoOwner: '',
        projectSettings: {},
        authenticationMethod: 'pat',
      });
    });

    it('should handle partial data from storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        githubToken: 'token-only',
      });

      const result = await ChromeStorageService.getGitHubSettings();

      expect(result.githubToken).toBe('token-only');
      expect(result.repoOwner).toBe('');
      expect(result.projectSettings).toEqual({});
      expect(result.authenticationMethod).toBe('pat');
    });
  });

  describe('saveGitHubSettings', () => {
    it('should save PAT authentication settings to sync storage', async () => {
      const settings: GitHubSettingsInterface = {
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: { project1: { repoName: 'repo1', branch: 'main' } },
        authenticationMethod: 'pat',
      };

      await ChromeStorageService.saveGitHubSettings(settings);

      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: { project1: { repoName: 'repo1', branch: 'main' } },
      });
    });

    it('should save GitHub App settings to both sync and local storage', async () => {
      const settings: GitHubSettingsInterface = {
        githubToken: '',
        repoOwner: 'app-owner',
        projectSettings: {},
        authenticationMethod: 'github_app',
        githubAppInstallationId: 54321,
        githubAppUsername: 'app-user',
        githubAppAvatarUrl: 'https://app.avatar',
      };

      await ChromeStorageService.saveGitHubSettings(settings);

      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        githubToken: '',
        repoOwner: 'app-owner',
        projectSettings: {},
      });

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        authenticationMethod: 'github_app',
        githubAppInstallationId: 54321,
        githubAppUsername: 'app-user',
        githubAppAvatarUrl: 'https://app.avatar',
      });
    });

    it('should save authentication method even when using PAT', async () => {
      const settings: GitHubSettingsInterface = {
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: {},
        authenticationMethod: 'pat',
      };

      await ChromeStorageService.saveGitHubSettings(settings);

      expect(mockChromeStorage.sync.set).toHaveBeenCalled();
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        authenticationMethod: 'pat',
      });
    });

    it('should throw error on storage failure', async () => {
      const settings: GitHubSettingsInterface = {
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: {},
        authenticationMethod: 'pat',
      };

      mockChromeStorage.sync.set.mockRejectedValue(new Error('Write failed'));

      await expect(ChromeStorageService.saveGitHubSettings(settings)).rejects.toThrow(
        'Write failed'
      );
    });
  });

  describe('getProjectSettings', () => {
    it('should retrieve project settings for a specific project', async () => {
      const projectSettings: ProjectSettings = {
        'project-1': { repoName: 'repo1', branch: 'main', projectTitle: 'Project 1' },
        'project-2': { repoName: 'repo2', branch: 'dev' },
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings,
      });

      const result = await ChromeStorageService.getProjectSettings('project-1');

      expect(result).toEqual({
        repoName: 'repo1',
        branch: 'main',
        projectTitle: 'Project 1',
      });
    });

    it('should return null if project settings not found', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      const result = await ChromeStorageService.getProjectSettings('non-existent');

      expect(result).toBeNull();
    });

    it('should return null on storage error', async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.getProjectSettings('project-1');

      expect(result).toBeNull();
    });
  });

  describe('getCurrentProjectId', () => {
    it('should retrieve current project ID from sync storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectId: 'current-project-id',
      });

      const result = await ChromeStorageService.getCurrentProjectId();

      expect(result).toBe('current-project-id');
      expect(mockChromeStorage.sync.get).toHaveBeenCalledWith(STORAGE_KEYS.PROJECT_ID);
    });

    it('should return null if no current project ID is stored', async () => {
      const result = await ChromeStorageService.getCurrentProjectId();

      expect(result).toBeNull();
    });

    it('should return null on storage error', async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.getCurrentProjectId();

      expect(result).toBeNull();
    });
  });

  describe('saveCurrentProjectId', () => {
    it('should save current project ID to sync storage', async () => {
      await ChromeStorageService.saveCurrentProjectId('new-project-id');

      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        projectId: 'new-project-id',
      });
    });

    it('should throw error on storage failure', async () => {
      mockChromeStorage.sync.set.mockRejectedValue(new Error('Write failed'));

      await expect(ChromeStorageService.saveCurrentProjectId('project-id')).rejects.toThrow(
        'Write failed'
      );
    });
  });

  describe('getPendingFileChanges', () => {
    it('should retrieve pending file changes from local storage', async () => {
      const fileChanges: Record<string, FileChange> = {
        'file1.ts': {
          path: 'file1.ts',
          status: 'added',
          content: 'content1',
        },
        'file2.ts': {
          path: 'file2.ts',
          status: 'modified',
          content: 'content2',
        },
      };

      mockChromeStorage.local.get.mockResolvedValue({
        pendingFileChanges: fileChanges,
      });

      const result = await ChromeStorageService.getPendingFileChanges();

      expect(result).toEqual(fileChanges);
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(STORAGE_KEYS.PENDING_FILE_CHANGES);
    });

    it('should return null if no pending changes exist', async () => {
      const result = await ChromeStorageService.getPendingFileChanges();

      expect(result).toBeNull();
    });

    it('should return null on storage error', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.getPendingFileChanges();

      expect(result).toBeNull();
    });
  });

  describe('savePendingFileChanges', () => {
    it('should save pending file changes to local storage', async () => {
      const fileChanges: Record<string, FileChange> = {
        'file1.ts': {
          path: 'file1.ts',
          status: 'added',
          content: 'content1',
        },
      };

      await ChromeStorageService.savePendingFileChanges(fileChanges);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        pendingFileChanges: fileChanges,
      });
    });

    it('should throw error on storage failure', async () => {
      mockChromeStorage.local.set.mockRejectedValue(new Error('Write failed'));

      await expect(ChromeStorageService.savePendingFileChanges({})).rejects.toThrow('Write failed');
    });
  });

  describe('clearPendingFileChanges', () => {
    it('should remove pending file changes from local storage', async () => {
      await ChromeStorageService.clearPendingFileChanges();

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith(
        STORAGE_KEYS.PENDING_FILE_CHANGES
      );
    });

    it('should throw error on removal failure', async () => {
      mockChromeStorage.local.remove.mockRejectedValue(new Error('Remove failed'));

      await expect(ChromeStorageService.clearPendingFileChanges()).rejects.toThrow('Remove failed');
    });
  });

  describe('getStoredFileChanges', () => {
    it('should retrieve stored file changes without projectId', async () => {
      const fileChanges: Record<string, FileChange> = {
        'file1.ts': {
          path: 'file1.ts',
          status: 'added',
          content: 'content1',
        },
      };

      mockChromeStorage.local.get.mockResolvedValue({
        storedFileChanges: fileChanges,
      });

      const result = await ChromeStorageService.getStoredFileChanges();

      expect(result).toEqual(fileChanges);
    });

    it('should retrieve stored file changes with projectId', async () => {
      const fileChangesData = {
        projectId: 'project-123',
        changes: {
          'file1.ts': {
            path: 'file1.ts',
            status: 'modified',
            content: 'content',
          },
        },
      };

      mockChromeStorage.local.get.mockResolvedValue({
        storedFileChanges: fileChangesData,
      });

      const result = await ChromeStorageService.getStoredFileChanges();

      expect(result).toEqual(fileChangesData);
    });

    it('should return null if no stored changes exist', async () => {
      const result = await ChromeStorageService.getStoredFileChanges();

      expect(result).toBeNull();
    });

    it('should return null on storage error', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.getStoredFileChanges();

      expect(result).toBeNull();
    });
  });

  describe('saveStoredFileChanges', () => {
    it('should save file changes without projectId', async () => {
      const fileChanges: Record<string, FileChange> = {
        'file1.ts': {
          path: 'file1.ts',
          status: 'added',
          content: 'content1',
        },
      };

      await ChromeStorageService.saveStoredFileChanges(fileChanges);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        storedFileChanges: fileChanges,
      });
    });

    it('should save file changes with projectId', async () => {
      const fileChanges: Record<string, FileChange> = {
        'file1.ts': {
          path: 'file1.ts',
          status: 'modified',
          content: 'content',
        },
      };

      await ChromeStorageService.saveStoredFileChanges(fileChanges, 'project-456');

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        storedFileChanges: {
          projectId: 'project-456',
          changes: fileChanges,
        },
      });
    });

    it('should throw error on storage failure', async () => {
      mockChromeStorage.local.set.mockRejectedValue(new Error('Write failed'));

      await expect(ChromeStorageService.saveStoredFileChanges({})).rejects.toThrow('Write failed');
    });
  });

  describe('clearStoredFileChanges', () => {
    it('should remove stored file changes from local storage', async () => {
      await ChromeStorageService.clearStoredFileChanges();

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith(STORAGE_KEYS.STORED_FILE_CHANGES);
    });

    it('should throw error on removal failure', async () => {
      mockChromeStorage.local.remove.mockRejectedValue(new Error('Remove failed'));

      await expect(ChromeStorageService.clearStoredFileChanges()).rejects.toThrow('Remove failed');
    });
  });

  describe('getPushStatistics', () => {
    it('should retrieve push statistics from local storage', async () => {
      const statistics: PushStatistics = {
        totalAttempts: 10,
        totalSuccesses: 8,
        totalFailures: 2,
        records: [
          {
            timestamp: 1704067200000,
            success: true,
            projectId: 'project-1',
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            branch: 'main',
            filesCount: 5,
            commitMessage: 'Test commit',
          },
        ],
      };

      mockChromeStorage.local.get.mockResolvedValue({
        pushStatistics: statistics,
      });

      const result = await ChromeStorageService.getPushStatistics();

      expect(result).toEqual(statistics);
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(STORAGE_KEYS.PUSH_STATISTICS);
    });

    it('should return default statistics if none exist', async () => {
      const result = await ChromeStorageService.getPushStatistics();

      expect(result).toEqual({
        totalAttempts: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        records: [],
      });
    });

    it('should return default statistics on storage error', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.getPushStatistics();

      expect(result).toEqual({
        totalAttempts: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        records: [],
      });
    });
  });

  describe('savePushStatistics', () => {
    it('should save push statistics to local storage', async () => {
      const statistics: PushStatistics = {
        totalAttempts: 15,
        totalSuccesses: 12,
        totalFailures: 3,
        records: [],
      };

      await ChromeStorageService.savePushStatistics(statistics);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        pushStatistics: statistics,
      });
    });

    it('should throw error on storage failure', async () => {
      mockChromeStorage.local.set.mockRejectedValue(new Error('Write failed'));

      await expect(
        ChromeStorageService.savePushStatistics({
          totalAttempts: 0,
          totalSuccesses: 0,
          totalFailures: 0,
          records: [],
        })
      ).rejects.toThrow('Write failed');
    });
  });

  describe('clearPushStatistics', () => {
    it('should remove push statistics from local storage', async () => {
      await ChromeStorageService.clearPushStatistics();

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith(STORAGE_KEYS.PUSH_STATISTICS);
    });

    it('should throw error on removal failure', async () => {
      mockChromeStorage.local.remove.mockRejectedValue(new Error('Remove failed'));

      await expect(ChromeStorageService.clearPushStatistics()).rejects.toThrow('Remove failed');
    });
  });

  describe('getAuthenticationMethod', () => {
    it('should retrieve authentication method from local storage', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
      });

      const result = await ChromeStorageService.getAuthenticationMethod();

      expect(result).toBe('github_app');
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(STORAGE_KEYS.AUTHENTICATION_METHOD);
    });

    it('should return "pat" as default when not set', async () => {
      const result = await ChromeStorageService.getAuthenticationMethod();

      expect(result).toBe('pat');
    });

    it('should return "pat" on storage error', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.getAuthenticationMethod();

      expect(result).toBe('pat');
    });
  });

  describe('setAuthenticationMethod', () => {
    it('should save authentication method to local storage', async () => {
      await ChromeStorageService.setAuthenticationMethod('github_app');

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        authenticationMethod: 'github_app',
      });
    });

    it('should save PAT authentication method', async () => {
      await ChromeStorageService.setAuthenticationMethod('pat');

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        authenticationMethod: 'pat',
      });
    });

    it('should throw error on storage failure', async () => {
      mockChromeStorage.local.set.mockRejectedValue(new Error('Write failed'));

      await expect(ChromeStorageService.setAuthenticationMethod('pat')).rejects.toThrow(
        'Write failed'
      );
    });
  });

  describe('hasMultipleAuthMethods', () => {
    it('should return true for both methods when both PAT and GitHub App are configured', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        githubToken: 'test-token',
      });

      mockChromeStorage.local.get.mockResolvedValue({
        githubAppInstallationId: 12345,
      });

      const result = await ChromeStorageService.hasMultipleAuthMethods();

      expect(result).toEqual({
        hasPAT: true,
        hasGitHubApp: true,
        hasMultiple: true,
      });
    });

    it('should return false for hasMultiple when only PAT is configured', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        githubToken: 'test-token',
      });

      const result = await ChromeStorageService.hasMultipleAuthMethods();

      expect(result).toEqual({
        hasPAT: true,
        hasGitHubApp: false,
        hasMultiple: false,
      });
    });

    it('should return false for hasMultiple when only GitHub App is configured', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        githubAppInstallationId: 12345,
      });

      const result = await ChromeStorageService.hasMultipleAuthMethods();

      expect(result).toEqual({
        hasPAT: false,
        hasGitHubApp: true,
        hasMultiple: false,
      });
    });

    it('should return false for all when no auth methods configured', async () => {
      const result = await ChromeStorageService.hasMultipleAuthMethods();

      expect(result).toEqual({
        hasPAT: false,
        hasGitHubApp: false,
        hasMultiple: false,
      });
    });

    it('should return all false on storage error', async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.hasMultipleAuthMethods();

      expect(result).toEqual({
        hasPAT: false,
        hasGitHubApp: false,
        hasMultiple: false,
      });
    });
  });

  describe('getGitHubAppConfig', () => {
    it('should retrieve complete GitHub App configuration', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        githubAppInstallationId: 12345,
        githubAppAccessToken: 'access-token',
        githubAppRefreshToken: 'refresh-token',
        githubAppExpiresAt: '2024-12-31T23:59:59Z',
        githubAppRefreshTokenExpiresAt: '2025-12-31T23:59:59Z',
        githubAppUsername: 'testuser',
        githubAppUserId: 67890,
        githubAppAvatarUrl: 'https://avatar.url',
        githubAppScopes: ['repo', 'user'],
      });

      const result = await ChromeStorageService.getGitHubAppConfig();

      expect(result).toEqual({
        installationId: 12345,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2024-12-31T23:59:59Z',
        refreshTokenExpiresAt: '2025-12-31T23:59:59Z',
        username: 'testuser',
        userId: 67890,
        avatarUrl: 'https://avatar.url',
        scopes: ['repo', 'user'],
      });
    });

    it('should return empty object when no config exists', async () => {
      const result = await ChromeStorageService.getGitHubAppConfig();

      expect(result).toEqual({});
    });

    it('should handle partial configuration', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        githubAppInstallationId: 54321,
        githubAppUsername: 'partial-user',
      });

      const result = await ChromeStorageService.getGitHubAppConfig();

      expect(result).toEqual({
        installationId: 54321,
        username: 'partial-user',
      });
    });

    it('should return empty object on storage error', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.getGitHubAppConfig();

      expect(result).toEqual({});
    });
  });

  describe('saveGitHubAppConfig', () => {
    it('should save complete GitHub App configuration', async () => {
      const config = {
        installationId: 12345,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2024-12-31T23:59:59Z',
        refreshTokenExpiresAt: '2025-12-31T23:59:59Z',
        username: 'testuser',
        userId: 67890,
        avatarUrl: 'https://avatar.url',
        scopes: ['repo', 'user'],
      };

      await ChromeStorageService.saveGitHubAppConfig(config);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        githubAppInstallationId: 12345,
        githubAppAccessToken: 'access-token',
        githubAppRefreshToken: 'refresh-token',
        githubAppExpiresAt: '2024-12-31T23:59:59Z',
        githubAppRefreshTokenExpiresAt: '2025-12-31T23:59:59Z',
        githubAppUsername: 'testuser',
        githubAppUserId: 67890,
        githubAppAvatarUrl: 'https://avatar.url',
        githubAppScopes: ['repo', 'user'],
      });
    });

    it('should save partial configuration', async () => {
      const config = {
        installationId: 12345,
        username: 'testuser',
      };

      await ChromeStorageService.saveGitHubAppConfig(config);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        githubAppInstallationId: 12345,
        githubAppUsername: 'testuser',
      });
    });

    it('should not save anything when config is empty', async () => {
      await ChromeStorageService.saveGitHubAppConfig({});

      expect(mockChromeStorage.local.set).not.toHaveBeenCalled();
    });

    it('should throw error on storage failure', async () => {
      mockChromeStorage.local.set.mockRejectedValue(new Error('Write failed'));

      await expect(
        ChromeStorageService.saveGitHubAppConfig({ installationId: 123 })
      ).rejects.toThrow('Write failed');
    });
  });

  describe('clearGitHubAppConfig', () => {
    it('should remove all GitHub App configuration keys', async () => {
      await ChromeStorageService.clearGitHubAppConfig();

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith([
        STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID,
        STORAGE_KEYS.GITHUB_APP_ACCESS_TOKEN,
        STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN,
        STORAGE_KEYS.GITHUB_APP_EXPIRES_AT,
        STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN_EXPIRES_AT,
        STORAGE_KEYS.GITHUB_APP_USERNAME,
        STORAGE_KEYS.GITHUB_APP_USER_ID,
        STORAGE_KEYS.GITHUB_APP_AVATAR_URL,
        STORAGE_KEYS.GITHUB_APP_SCOPES,
      ]);
    });

    it('should throw error on removal failure', async () => {
      mockChromeStorage.local.remove.mockRejectedValue(new Error('Remove failed'));

      await expect(ChromeStorageService.clearGitHubAppConfig()).rejects.toThrow('Remove failed');
    });
  });

  describe('getMigrationPromptStatus', () => {
    it('should retrieve migration prompt status with timestamp', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        migrationPromptShown: true,
        lastMigrationPrompt: '2024-01-01T00:00:00Z',
      });

      const result = await ChromeStorageService.getMigrationPromptStatus();

      expect(result).toEqual({
        shown: true,
        lastPrompt: '2024-01-01T00:00:00Z',
      });
    });

    it('should return default status when not set', async () => {
      const result = await ChromeStorageService.getMigrationPromptStatus();

      expect(result).toEqual({
        shown: false,
      });
    });

    it('should handle shown flag without timestamp', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        migrationPromptShown: true,
      });

      const result = await ChromeStorageService.getMigrationPromptStatus();

      expect(result).toEqual({
        shown: true,
        lastPrompt: undefined,
      });
    });

    it('should return default status on storage error', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.getMigrationPromptStatus();

      expect(result).toEqual({
        shown: false,
      });
    });
  });

  describe('markMigrationPromptShown', () => {
    it('should mark migration prompt as shown with timestamp', async () => {
      const beforeCall = Date.now();

      await ChromeStorageService.markMigrationPromptShown();

      const afterCall = Date.now();

      expect(mockChromeStorage.local.set).toHaveBeenCalled();

      const callArgs = mockChromeStorage.local.set.mock.calls[0]?.[0];
      expect(callArgs).toHaveProperty('migrationPromptShown', true);
      expect(callArgs).toHaveProperty('lastMigrationPrompt');

      const timestamp = new Date(callArgs.lastMigrationPrompt as string).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(timestamp).toBeLessThanOrEqual(afterCall);
    });

    it('should throw error on storage failure', async () => {
      mockChromeStorage.local.set.mockRejectedValue(new Error('Write failed'));

      await expect(ChromeStorageService.markMigrationPromptShown()).rejects.toThrow('Write failed');
    });
  });

  describe('resetMigrationPromptStatus', () => {
    it('should remove migration prompt status keys', async () => {
      await ChromeStorageService.resetMigrationPromptStatus();

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith([
        STORAGE_KEYS.MIGRATION_PROMPT_SHOWN,
        STORAGE_KEYS.LAST_MIGRATION_PROMPT,
      ]);
    });

    it('should throw error on removal failure', async () => {
      mockChromeStorage.local.remove.mockRejectedValue(new Error('Remove failed'));

      await expect(ChromeStorageService.resetMigrationPromptStatus()).rejects.toThrow(
        'Remove failed'
      );
    });
  });

  describe('saveProjectSettingsWithMetadata', () => {
    it('should save project settings with full metadata', async () => {
      const projectId = 'project-123';
      const metadata = {
        is_private: true,
        language: 'TypeScript',
        description: 'Test project',
        commit_count: 42,
        latest_commit_date: '2024-01-15T10:30:00Z',
        latest_commit_message: 'Latest commit',
        latest_commit_sha: 'abc123',
        latest_commit_author: 'testuser',
        open_issues_count: 5,
        github_updated_at: '2024-01-20T12:00:00Z',
        default_branch: 'main',
        github_repo_url: 'https://github.com/test/repo',
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      await ChromeStorageService.saveProjectSettingsWithMetadata(
        projectId,
        'test-repo',
        'main',
        'Test Project',
        metadata
      );

      const savedCall = mockChromeStorage.sync.set.mock.calls[0]?.[0];
      const savedProject = savedCall?.projectSettings?.[projectId];

      expect(savedProject).toMatchObject({
        repoName: 'test-repo',
        branch: 'main',
        projectTitle: 'Test Project',
        ...metadata,
      });

      expect(savedProject).toHaveProperty('metadata_last_updated');
      const timestamp = new Date(savedProject.metadata_last_updated as string).getTime();
      expect(timestamp).toBeGreaterThan(0);
    });

    it('should save project settings without metadata', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      await ChromeStorageService.saveProjectSettingsWithMetadata(
        'project-456',
        'simple-repo',
        'dev',
        'Simple Project'
      );

      const savedCall = mockChromeStorage.sync.set.mock.calls[0]?.[0];
      expect(savedCall?.projectSettings?.['project-456']).toEqual({
        repoName: 'simple-repo',
        branch: 'dev',
        projectTitle: 'Simple Project',
      });
    });

    it('should save timestamp for race condition detection in local storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      await ChromeStorageService.saveProjectSettingsWithMetadata(
        'project-789',
        'repo',
        'main',
        'Project',
        { is_private: false }
      );

      expect(mockChromeStorage.local.set).toHaveBeenCalled();
      const localCall = mockChromeStorage.local.set.mock.calls[0]?.[0];
      expect(localCall?.lastSettingsUpdate).toMatchObject({
        projectId: 'project-789',
        repoName: 'repo',
        branch: 'main',
        projectTitle: 'Project',
        metadata_updated: true,
      });
      expect(localCall?.lastSettingsUpdate).toHaveProperty('timestamp');
    });
  });

  describe('updateProjectMetadata', () => {
    it('should update existing project metadata', async () => {
      const projectId = 'existing-project';
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          [projectId]: {
            repoName: 'test-repo',
            branch: 'main',
            projectTitle: 'Test',
          },
        },
      });

      const metadata = {
        is_private: true,
        language: 'JavaScript',
        commit_count: 10,
      };

      await ChromeStorageService.updateProjectMetadata(projectId, metadata);

      const savedCall = mockChromeStorage.sync.set.mock.calls[0]?.[0];
      const updatedProject = savedCall?.projectSettings?.[projectId];

      expect(updatedProject).toMatchObject({
        repoName: 'test-repo',
        branch: 'main',
        projectTitle: 'Test',
        ...metadata,
      });
      expect(updatedProject).toHaveProperty('metadata_last_updated');
    });

    it('should not modify storage if project does not exist', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      await ChromeStorageService.updateProjectMetadata('non-existent', { is_private: true });

      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });
  });

  describe('getProjectSettingsWithMetadata', () => {
    it('should retrieve project settings with metadata', async () => {
      const projectSettings = {
        'project-with-metadata': {
          repoName: 'repo',
          branch: 'main',
          is_private: true,
          language: 'TypeScript',
          metadata_last_updated: '2024-01-01T00:00:00Z',
        },
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings,
      });

      const result =
        await ChromeStorageService.getProjectSettingsWithMetadata('project-with-metadata');

      expect(result).toEqual(projectSettings['project-with-metadata']);
    });

    it('should return null if project not found', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      const result = await ChromeStorageService.getProjectSettingsWithMetadata('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('get', () => {
    it('should retrieve data from sync storage by default', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        testKey: 'testValue',
      });

      const result = await ChromeStorageService.get('testKey');

      expect(result).toEqual({ testKey: 'testValue' });
      expect(mockChromeStorage.sync.get).toHaveBeenCalledWith('testKey');
    });

    it('should retrieve data from local storage when specified', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        localKey: 'localValue',
      });

      const result = await ChromeStorageService.get('localKey', true);

      expect(result).toEqual({ localKey: 'localValue' });
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith('localKey');
    });

    it('should retrieve multiple keys', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        key1: 'value1',
        key2: 'value2',
      });

      const result = await ChromeStorageService.get(['key1', 'key2']);

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('should return empty object on error', async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error('Storage error'));

      const result = await ChromeStorageService.get('errorKey');

      expect(result).toEqual({});
    });
  });

  describe('set', () => {
    it('should save data to sync storage by default', async () => {
      const data = { testKey: 'testValue' };

      await ChromeStorageService.set(data);

      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith(data);
    });

    it('should save data to local storage when specified', async () => {
      const data = { localKey: 'localValue' };

      await ChromeStorageService.set(data, true);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith(data);
    });

    it('should throw error on storage failure', async () => {
      mockChromeStorage.sync.set.mockRejectedValue(new Error('Write failed'));

      await expect(ChromeStorageService.set({ key: 'value' })).rejects.toThrow('Write failed');
    });
  });

  describe('remove', () => {
    it('should remove data from sync storage by default', async () => {
      await ChromeStorageService.remove('testKey');

      expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith('testKey');
    });

    it('should remove data from local storage when specified', async () => {
      await ChromeStorageService.remove('localKey', true);

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith('localKey');
    });

    it('should remove multiple keys', async () => {
      await ChromeStorageService.remove(['key1', 'key2']);

      expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith(['key1', 'key2']);
    });

    it('should throw error on removal failure', async () => {
      mockChromeStorage.sync.remove.mockRejectedValue(new Error('Remove failed'));

      await expect(ChromeStorageService.remove('key')).rejects.toThrow('Remove failed');
    });
  });

  describe('clear', () => {
    it('should clear sync storage by default', async () => {
      await ChromeStorageService.clear();

      expect(mockChromeStorage.sync.clear).toHaveBeenCalled();
    });

    it('should clear local storage when specified', async () => {
      await ChromeStorageService.clear(true);

      expect(mockChromeStorage.local.clear).toHaveBeenCalled();
    });

    it('should throw error on clear failure', async () => {
      mockChromeStorage.sync.clear.mockRejectedValue(new Error('Clear failed'));

      await expect(ChromeStorageService.clear()).rejects.toThrow('Clear failed');
    });
  });

  describe('removeStorageListeners', () => {
    it('should remove previously added storage listener', () => {
      const mockCallback = vi.fn();

      ChromeStorageService.setupStorageListener(mockCallback);
      ChromeStorageService.removeStorageListeners();

      expect(mockChromeStorage.onChanged.removeListener).toHaveBeenCalled();
    });

    it('should not throw error when no listener exists', () => {
      expect(() => ChromeStorageService.removeStorageListeners()).not.toThrow();
    });
  });
});
