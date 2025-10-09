import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSettingsMigrationService } from '../ProjectSettingsMigrationService';
import type { GitHubSettingsInterface } from '../../types';
import type { UnifiedGitHubService } from '../../../services/UnifiedGitHubService';

const mockChromeStorage = {
  sync: {
    get: vi.fn(),
  },
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
};

interface ChromeNamespace {
  storage: typeof mockChromeStorage;
}

interface GlobalWithChrome {
  chrome: ChromeNamespace;
}

(global as unknown as GlobalWithChrome).chrome = {
  storage: mockChromeStorage,
};

vi.mock('../chromeStorage', () => ({
  ChromeStorageService: {
    getGitHubSettings: vi.fn(),
    updateProjectMetadata: vi.fn(),
    getProjectSettingsWithMetadata: vi.fn(),
    syncProjectWithGitHubCache: vi.fn(),
  },
}));

vi.mock('../GitHubCacheService', () => ({
  GitHubCacheService: {
    getRepoMetadata: vi.fn(),
    isRepoMetadataStale: vi.fn(),
    createEnhancedRepo: vi.fn(),
    cacheRepoMetadata: vi.fn(),
  },
}));

vi.mock('../../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: vi.fn(),
}));

describe('ProjectSettingsMigrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Migration detection', () => {
    it('should detect when migration needed with version 0', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        projectSettings_migration_version: 0,
      });

      const needsMigration = await ProjectSettingsMigrationService.needsMigration();

      expect(needsMigration).toBe(true);
    });

    it('should detect when migration needed with no version', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});

      const needsMigration = await ProjectSettingsMigrationService.needsMigration();

      expect(needsMigration).toBe(true);
    });

    it('should detect when migration not needed', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        projectSettings_migration_version: 1,
      });

      const needsMigration = await ProjectSettingsMigrationService.needsMigration();

      expect(needsMigration).toBe(false);
    });

    it('should default to needing migration on errors', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const needsMigration = await ProjectSettingsMigrationService.needsMigration();

      expect(needsMigration).toBe(true);
    });
  });

  describe('Migration statistics', () => {
    it('should calculate correct stats for projects with and without metadata', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: {
          'project-1': {
            repoName: 'repo1',
            branch: 'main',
            metadata_last_updated: '2024-01-01T00:00:00Z',
          },
          'project-2': {
            repoName: 'repo2',
            branch: 'main',
            metadata_last_updated: '2024-01-02T00:00:00Z',
          },
          'project-3': {
            repoName: 'repo3',
            branch: 'main',
          },
        },
      } as GitHubSettingsInterface);

      const stats = await ProjectSettingsMigrationService.getMigrationStats();

      expect(stats.totalProjects).toBe(3);
      expect(stats.projectsWithMetadata).toBe(2);
      expect(stats.projectsNeedingMigration).toBe(1);
    });

    it('should handle empty project settings', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: {},
      } as GitHubSettingsInterface);

      const stats = await ProjectSettingsMigrationService.getMigrationStats();

      expect(stats.totalProjects).toBe(0);
      expect(stats.projectsWithMetadata).toBe(0);
      expect(stats.projectsNeedingMigration).toBe(0);
    });

    it('should return zero stats on errors', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getGitHubSettings).mockRejectedValue(
        new Error('Storage error')
      );

      const stats = await ProjectSettingsMigrationService.getMigrationStats();

      expect(stats.totalProjects).toBe(0);
    });
  });

  describe('Migration execution', () => {
    beforeEach(async () => {
      const { ChromeStorageService } = await import('../chromeStorage');
      const { GitHubCacheService } = await import('../GitHubCacheService');

      mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });
      mockChromeStorage.local.set.mockResolvedValue(undefined);

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: {
          'project-1': { repoName: 'repo1', branch: 'main' },
        },
      } as GitHubSettingsInterface);

      vi.mocked(GitHubCacheService.getRepoMetadata).mockResolvedValue({
        name: 'repo1',
        private: false,
        description: 'Test repository',
        language: 'TypeScript',
        html_url: 'https://github.com/test-owner/repo1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        default_branch: 'main',
        open_issues_count: 5,
        commit_count: 42,
        latest_commit: {
          sha: 'abc123',
          message: 'Test commit',
          date: '2024-01-15T00:00:00Z',
          author: 'Test Author',
        },
        cached_at: '2024-01-15T00:00:00Z',
        last_refreshed: '2024-01-15T00:00:00Z',
      });

      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(false);
      vi.mocked(ChromeStorageService.updateProjectMetadata).mockResolvedValue();
    });

    it('should successfully migrate projects and set version', async () => {
      const promise = ProjectSettingsMigrationService.migrateProjectSettings();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(1);
      expect(result.failedCount).toBe(0);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          projectSettings_migration_version: 1,
          migration_completed_at: expect.any(String),
        })
      );
    });

    it('should invoke progress callback with correct values', async () => {
      const progressCallback = vi.fn();

      const promise = ProjectSettingsMigrationService.migrateProjectSettings(progressCallback);
      await vi.runAllTimersAsync();
      await promise;

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          completed: 0,
          total: 1,
          currentProject: 'repo1',
        })
      );

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          completed: 1,
          total: 1,
          currentProject: 'Migration completed',
        })
      );
    });

    it('should skip projects with existing metadata', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: {
          'project-1': {
            repoName: 'repo1',
            branch: 'main',
            metadata_last_updated: '2024-01-01T00:00:00Z',
          },
        },
      } as GitHubSettingsInterface);

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(0);
    });

    it('should handle missing repository owner gracefully', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: '',
        projectSettings: {},
      } as GitHubSettingsInterface);

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('No repository owner configured');
    });

    it('should handle individual project failures without stopping', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: {
          'project-1': { repoName: 'repo1', branch: 'main' },
          'project-2': { repoName: 'repo2', branch: 'main' },
        },
      } as GitHubSettingsInterface);

      vi.mocked(ChromeStorageService.updateProjectMetadata)
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Update failed'));

      const promise = ProjectSettingsMigrationService.migrateProjectSettings();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.migratedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should add delay between migrations', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: {
          'project-1': { repoName: 'repo1', branch: 'main' },
          'project-2': { repoName: 'repo2', branch: 'main' },
        },
      } as GitHubSettingsInterface);

      const promise = ProjectSettingsMigrationService.migrateProjectSettings();

      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.migratedCount).toBe(2);
    });
  });

  describe('Cache refresh behavior', () => {
    beforeEach(async () => {
      const { ChromeStorageService } = await import('../chromeStorage');
      const { GitHubCacheService } = await import('../GitHubCacheService');
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });
      mockChromeStorage.local.set.mockResolvedValue(undefined);

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: {
          'project-1': { repoName: 'repo1', branch: 'main' },
        },
      } as GitHubSettingsInterface);

      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(true);
      vi.mocked(ChromeStorageService.updateProjectMetadata).mockResolvedValue();

      const mockGitHubService = {
        getRepoInfo: vi.fn().mockResolvedValue({
          exists: true,
          private: false,
          description: 'Fresh data',
          language: 'JavaScript',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
          default_branch: 'main',
          open_issues_count: 10,
        }),
        getCommitCount: vi.fn().mockResolvedValue(50),
        request: vi.fn().mockResolvedValue([
          {
            sha: 'xyz789',
            commit: {
              message: 'Latest commit',
              committer: { date: '2024-01-15T12:00:00Z' },
              author: { name: 'New Author' },
            },
          },
        ]),
      };

      vi.mocked(UnifiedGitHubService).mockImplementation(
        () => mockGitHubService as unknown as UnifiedGitHubService
      );

      vi.mocked(GitHubCacheService.createEnhancedRepo).mockReturnValue({
        name: 'repo1',
        private: false,
        description: 'Fresh data',
        language: 'JavaScript',
        html_url: 'https://github.com/test-owner/repo1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        default_branch: 'main',
        open_issues_count: 10,
        commit_count: 50,
        latest_commit: {
          sha: 'xyz789',
          message: 'Latest commit',
          date: '2024-01-15T12:00:00Z',
          author: 'New Author',
        },
        cached_at: '2024-01-15T00:00:00Z',
        last_refreshed: '2024-01-15T00:00:00Z',
      });

      vi.mocked(GitHubCacheService.cacheRepoMetadata).mockResolvedValue();
    });

    it('should fetch fresh data when cache is stale', async () => {
      const { GitHubCacheService } = await import('../GitHubCacheService');

      const promise = ProjectSettingsMigrationService.migrateProjectSettings();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(GitHubCacheService.createEnhancedRepo).toHaveBeenCalled();
      expect(GitHubCacheService.cacheRepoMetadata).toHaveBeenCalled();
    });

    it('should use GitHub App authentication when configured', async () => {
      mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'github_app' });

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      const promise = ProjectSettingsMigrationService.migrateProjectSettings();
      await vi.runAllTimersAsync();
      await promise;

      expect(UnifiedGitHubService).toHaveBeenCalledWith({ type: 'github_app' });
    });

    it('should handle non-existent repositories gracefully', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      const mockGitHubService = {
        getRepoInfo: vi.fn().mockResolvedValue({ exists: false }),
      };

      vi.mocked(UnifiedGitHubService).mockImplementation(
        () => mockGitHubService as unknown as UnifiedGitHubService
      );

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(0);
    });

    it('should handle commit fetch errors gracefully', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const { GitHubCacheService } = await import('../GitHubCacheService');

      const mockGitHubService = {
        getRepoInfo: vi.fn().mockResolvedValue({
          exists: true,
          private: false,
          description: 'Test',
          language: 'TypeScript',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
          default_branch: 'main',
          open_issues_count: 5,
        }),
        getCommitCount: vi.fn().mockRejectedValue(new Error('Commit count error')),
        request: vi.fn().mockResolvedValue([
          {
            sha: 'abc123',
            commit: {
              message: 'Test commit',
              committer: { date: '2024-01-15T00:00:00Z' },
              author: { name: 'Test Author' },
            },
          },
        ]),
      };

      vi.mocked(UnifiedGitHubService).mockImplementation(
        () => mockGitHubService as unknown as UnifiedGitHubService
      );

      const promise = ProjectSettingsMigrationService.migrateProjectSettings();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(GitHubCacheService.createEnhancedRepo).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        expect.any(Object)
      );
    });
  });

  describe('Single project migration', () => {
    it('should migrate a single project successfully', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue({
        repoName: 'test-repo',
        branch: 'main',
      });

      vi.mocked(ChromeStorageService.syncProjectWithGitHubCache).mockResolvedValue();

      const mockGitHubService = {} as UnifiedGitHubService;
      const result = await ProjectSettingsMigrationService.migrateSingleProject(
        'project-1',
        'test-owner',
        mockGitHubService
      );

      expect(result).toBe(true);
      expect(ChromeStorageService.syncProjectWithGitHubCache).toHaveBeenCalledWith(
        'project-1',
        'test-owner',
        'test-repo'
      );
    });

    it('should return false when project not found', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue(null);

      const mockGitHubService = {} as UnifiedGitHubService;
      const result = await ProjectSettingsMigrationService.migrateSingleProject(
        'nonexistent',
        'test-owner',
        mockGitHubService
      );

      expect(result).toBe(false);
    });

    it('should skip project with existing metadata', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue({
        repoName: 'test-repo',
        branch: 'main',
        metadata_last_updated: '2024-01-01T00:00:00Z',
      });

      const mockGitHubService = {} as UnifiedGitHubService;
      const result = await ProjectSettingsMigrationService.migrateSingleProject(
        'project-1',
        'test-owner',
        mockGitHubService
      );

      expect(result).toBe(true);
      expect(ChromeStorageService.syncProjectWithGitHubCache).not.toHaveBeenCalled();
    });
  });

  describe('Migration status reset', () => {
    it('should remove migration keys from storage', async () => {
      mockChromeStorage.local.remove.mockResolvedValue(undefined);

      await ProjectSettingsMigrationService.resetMigrationStatus();

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith([
        'projectSettings_migration_version',
        'migration_completed_at',
      ]);
    });

    it('should handle removal errors gracefully', async () => {
      mockChromeStorage.local.remove.mockRejectedValue(new Error('Removal failed'));

      await expect(ProjectSettingsMigrationService.resetMigrationStatus()).resolves.toBeUndefined();
    });
  });

  describe('Project-level migration check', () => {
    it('should detect when project needs migration', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue({
        repoName: 'test-repo',
        branch: 'main',
      });

      const result = await ProjectSettingsMigrationService.projectNeedsMigration('project-1');

      expect(result).toBe(true);
    });

    it('should detect when project does not need migration', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue({
        repoName: 'test-repo',
        branch: 'main',
        metadata_last_updated: '2024-01-01T00:00:00Z',
      });

      const result = await ProjectSettingsMigrationService.projectNeedsMigration('project-1');

      expect(result).toBe(false);
    });

    it('should return true for null project', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue(null);

      const result = await ProjectSettingsMigrationService.projectNeedsMigration('project-1');

      expect(result).toBe(true);
    });

    it('should default to needing migration on errors', async () => {
      const { ChromeStorageService } = await import('../chromeStorage');

      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockRejectedValue(
        new Error('Check failed')
      );

      const result = await ProjectSettingsMigrationService.projectNeedsMigration('project-1');

      expect(result).toBe(true);
    });
  });
});
