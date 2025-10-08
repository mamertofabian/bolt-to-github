import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { ProjectSettingsMigrationService } from '../ProjectSettingsMigrationService';
import { ChromeStorageService } from '../chromeStorage';
import { GitHubCacheService } from '../GitHubCacheService';
import { UnifiedGitHubService } from '../../../services/UnifiedGitHubService';
import type { GitHubSettingsInterface } from '../../types';

vi.mock('../chromeStorage');
vi.mock('../GitHubCacheService');
vi.mock('../../../services/UnifiedGitHubService');

describe('ProjectSettingsMigrationService', () => {
  let mockChrome: {
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
      };
    };
  };

  beforeEach(() => {
    mockChrome = {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
    };

    global.chrome = mockChrome as unknown as typeof chrome;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('needsMigration', () => {
    it('should return true when migration version is 0', async () => {
      mockChrome.storage.local.get.mockResolvedValue({ projectSettings_migration_version: 0 });

      const result = await ProjectSettingsMigrationService.needsMigration();

      expect(result).toBe(true);
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith([
        'projectSettings_migration_version',
      ]);
    });

    it('should return true when no migration version exists', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});

      const result = await ProjectSettingsMigrationService.needsMigration();

      expect(result).toBe(true);
    });

    it('should return false when migration is up to date', async () => {
      mockChrome.storage.local.get.mockResolvedValue({ projectSettings_migration_version: 1 });

      const result = await ProjectSettingsMigrationService.needsMigration();

      expect(result).toBe(false);
    });

    it('should return true on storage error', async () => {
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await ProjectSettingsMigrationService.needsMigration();

      expect(result).toBe(true);
    });
  });

  describe('getMigrationStats', () => {
    it('should return correct statistics for projects with and without metadata', async () => {
      const mockGitHubSettings = {
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
          'project-4': {
            repoName: 'repo4',
            branch: 'main',
          },
        },
      };

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        mockGitHubSettings as GitHubSettingsInterface
      );

      const stats = await ProjectSettingsMigrationService.getMigrationStats();

      expect(stats).toEqual({
        totalProjects: 4,
        projectsWithMetadata: 2,
        projectsNeedingMigration: 2,
      });
    });

    it('should handle empty projectSettings', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: {},
      } as GitHubSettingsInterface);

      const stats = await ProjectSettingsMigrationService.getMigrationStats();

      expect(stats).toEqual({
        totalProjects: 0,
        projectsWithMetadata: 0,
        projectsNeedingMigration: 0,
      });
    });

    it('should handle undefined projectSettings', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
      } as GitHubSettingsInterface);

      const stats = await ProjectSettingsMigrationService.getMigrationStats();

      expect(stats).toEqual({
        totalProjects: 0,
        projectsWithMetadata: 0,
        projectsNeedingMigration: 0,
      });
    });

    it('should return zero stats on error', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockRejectedValue(
        new Error('Storage error')
      );

      const stats = await ProjectSettingsMigrationService.getMigrationStats();

      expect(stats).toEqual({
        totalProjects: 0,
        projectsWithMetadata: 0,
        projectsNeedingMigration: 0,
      });
    });
  });

  describe('migrateProjectSettings', () => {
    const mockGitHubSettings = {
      repoOwner: 'test-owner',
      githubToken: 'test-token',
      projectSettings: {
        'project-1': {
          repoName: 'repo1',
          branch: 'main',
        },
        'project-2': {
          repoName: 'repo2',
          branch: 'develop',
        },
      },
    };

    const mockRepoData = {
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
    };

    beforeEach(() => {
      mockChrome.storage.local.get.mockResolvedValue({
        authenticationMethod: 'pat',
      });

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        mockGitHubSettings as GitHubSettingsInterface
      );
      vi.mocked(GitHubCacheService.getRepoMetadata).mockResolvedValue(mockRepoData);
      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(false);
      vi.mocked(ChromeStorageService.updateProjectMetadata).mockResolvedValue();
      mockChrome.storage.local.set.mockResolvedValue(undefined);
    });

    it('should successfully migrate all projects', async () => {
      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toEqual([]);

      expect(ChromeStorageService.updateProjectMetadata).toHaveBeenCalledTimes(2);
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          projectSettings_migration_version: 1,
          migration_completed_at: expect.any(String),
        })
      );
    });

    it('should call progress callback with correct values', async () => {
      const progressCallback = vi.fn();

      await ProjectSettingsMigrationService.migrateProjectSettings(progressCallback);

      expect(progressCallback).toHaveBeenCalledWith({
        completed: 0,
        total: 2,
        currentProject: 'repo1',
      });

      expect(progressCallback).toHaveBeenCalledWith({
        completed: 1,
        total: 2,
        currentProject: 'repo2',
      });

      expect(progressCallback).toHaveBeenCalledWith({
        completed: 2,
        total: 2,
        currentProject: 'Migration completed',
      });
    });

    it('should skip projects that already have metadata', async () => {
      const settingsWithMetadata = {
        ...mockGitHubSettings,
        projectSettings: {
          'project-1': {
            repoName: 'repo1',
            branch: 'main',
            metadata_last_updated: '2024-01-01T00:00:00Z',
          },
        },
      };

      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        settingsWithMetadata as GitHubSettingsInterface
      );

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(0);
      expect(ChromeStorageService.updateProjectMetadata).not.toHaveBeenCalled();
    });

    it('should fetch fresh data when cache is stale', async () => {
      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(true);

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
        ...mockRepoData,
        description: 'Fresh data',
        cached_at: '2024-01-15T00:00:00Z',
        last_refreshed: '2024-01-15T00:00:00Z',
      });
      vi.mocked(GitHubCacheService.cacheRepoMetadata).mockResolvedValue();

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(mockGitHubService.getRepoInfo).toHaveBeenCalled();
      expect(mockGitHubService.getCommitCount).toHaveBeenCalled();
      expect(GitHubCacheService.createEnhancedRepo).toHaveBeenCalled();
      expect(GitHubCacheService.cacheRepoMetadata).toHaveBeenCalled();
    });

    it('should use GitHub App authentication when configured', async () => {
      mockChrome.storage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
      });

      await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(UnifiedGitHubService).toHaveBeenCalledWith({ type: 'github_app' });
    });

    it('should handle repositories that do not exist', async () => {
      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(true);

      const mockGitHubService = {
        getRepoInfo: vi.fn().mockResolvedValue({
          exists: false,
        }),
      };

      vi.mocked(UnifiedGitHubService).mockImplementation(
        () => mockGitHubService as unknown as UnifiedGitHubService
      );

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(0);
      expect(ChromeStorageService.updateProjectMetadata).not.toHaveBeenCalled();
    });

    it('should handle commit count fetch errors gracefully', async () => {
      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(true);

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
      vi.mocked(GitHubCacheService.createEnhancedRepo).mockReturnValue({
        ...mockRepoData,
        cached_at: '2024-01-15T00:00:00Z',
        last_refreshed: '2024-01-15T00:00:00Z',
      });
      vi.mocked(GitHubCacheService.cacheRepoMetadata).mockResolvedValue();

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(2);
      expect(GitHubCacheService.createEnhancedRepo).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        expect.any(Object)
      );
    });

    it('should handle latest commit fetch errors gracefully', async () => {
      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(true);

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
        getCommitCount: vi.fn().mockResolvedValue(50),
        request: vi.fn().mockRejectedValue(new Error('Commit fetch error')),
      };

      vi.mocked(UnifiedGitHubService).mockImplementation(
        () => mockGitHubService as unknown as UnifiedGitHubService
      );
      vi.mocked(GitHubCacheService.createEnhancedRepo).mockReturnValue(mockRepoData);
      vi.mocked(GitHubCacheService.cacheRepoMetadata).mockResolvedValue();

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(2);
      expect(GitHubCacheService.createEnhancedRepo).toHaveBeenCalledWith(
        expect.any(Object),
        50,
        undefined
      );
    });

    it('should handle individual project migration failures', async () => {
      vi.mocked(ChromeStorageService.updateProjectMetadata)
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Update failed'));

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(false);
      expect(result.migratedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to migrate project project-2');
    });

    it('should throw error when no repository owner is configured', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: '',
        projectSettings: {},
      } as GitHubSettingsInterface);

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('No repository owner configured');
    });

    it('should handle complete migration failure', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockRejectedValue(
        new Error('Complete failure')
      );

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(false);
      expect(result.migratedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors[0]).toContain('Complete failure');
    });

    it('should add delay between project migrations', async () => {
      vi.useFakeTimers();

      const promise = ProjectSettingsMigrationService.migrateProjectSettings();

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      await promise;

      vi.useRealTimers();

      expect(ChromeStorageService.updateProjectMetadata).toHaveBeenCalledTimes(2);
    });

    it('should update all project metadata fields correctly', async () => {
      await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(ChromeStorageService.updateProjectMetadata).toHaveBeenCalledWith('project-1', {
        is_private: mockRepoData.private,
        language: mockRepoData.language,
        description: mockRepoData.description,
        commit_count: mockRepoData.commit_count,
        latest_commit_date: mockRepoData.latest_commit?.date,
        latest_commit_message: mockRepoData.latest_commit?.message,
        latest_commit_sha: mockRepoData.latest_commit?.sha,
        latest_commit_author: mockRepoData.latest_commit?.author,
        open_issues_count: mockRepoData.open_issues_count,
        github_updated_at: mockRepoData.updated_at,
        default_branch: mockRepoData.default_branch,
        github_repo_url: mockRepoData.html_url,
      });
    });
  });

  describe('migrateSingleProject', () => {
    const mockProjectSettings = {
      repoName: 'test-repo',
      branch: 'main',
    };

    beforeEach(() => {
      vi.mocked(ChromeStorageService.syncProjectWithGitHubCache).mockResolvedValue();
    });

    it('should migrate a single project successfully', async () => {
      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue(
        mockProjectSettings
      );

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

    it('should return false when project is not found', async () => {
      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue(null);

      const mockGitHubService = {} as UnifiedGitHubService;
      const result = await ProjectSettingsMigrationService.migrateSingleProject(
        'nonexistent',
        'test-owner',
        mockGitHubService
      );

      expect(result).toBe(false);
      expect(ChromeStorageService.syncProjectWithGitHubCache).not.toHaveBeenCalled();
    });

    it('should return true when project already has metadata', async () => {
      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue({
        ...mockProjectSettings,
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

    it('should return false on sync failure', async () => {
      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue(
        mockProjectSettings
      );
      vi.mocked(ChromeStorageService.syncProjectWithGitHubCache).mockRejectedValue(
        new Error('Sync failed')
      );

      const mockGitHubService = {} as UnifiedGitHubService;
      const result = await ProjectSettingsMigrationService.migrateSingleProject(
        'project-1',
        'test-owner',
        mockGitHubService
      );

      expect(result).toBe(false);
    });

    it('should handle errors during project retrieval', async () => {
      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockRejectedValue(
        new Error('Retrieval failed')
      );

      const mockGitHubService = {} as UnifiedGitHubService;
      const result = await ProjectSettingsMigrationService.migrateSingleProject(
        'project-1',
        'test-owner',
        mockGitHubService
      );

      expect(result).toBe(false);
    });
  });

  describe('resetMigrationStatus', () => {
    it('should remove migration keys from storage', async () => {
      mockChrome.storage.local.remove.mockResolvedValue(undefined);

      await ProjectSettingsMigrationService.resetMigrationStatus();

      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        'projectSettings_migration_version',
        'migration_completed_at',
      ]);
    });

    it('should handle removal errors gracefully', async () => {
      mockChrome.storage.local.remove.mockRejectedValue(new Error('Removal failed'));

      await expect(ProjectSettingsMigrationService.resetMigrationStatus()).resolves.toBeUndefined();
    });
  });

  describe('projectNeedsMigration', () => {
    it('should return true when project has no metadata', async () => {
      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue({
        repoName: 'test-repo',
        branch: 'main',
      });

      const result = await ProjectSettingsMigrationService.projectNeedsMigration('project-1');

      expect(result).toBe(true);
    });

    it('should return false when project has metadata', async () => {
      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue({
        repoName: 'test-repo',
        branch: 'main',
        metadata_last_updated: '2024-01-01T00:00:00Z',
      });

      const result = await ProjectSettingsMigrationService.projectNeedsMigration('project-1');

      expect(result).toBe(false);
    });

    it('should return true when project is null', async () => {
      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue(null);

      const result = await ProjectSettingsMigrationService.projectNeedsMigration('project-1');

      expect(result).toBe(true);
    });

    it('should return true on error', async () => {
      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockRejectedValue(
        new Error('Check failed')
      );

      const result = await ProjectSettingsMigrationService.projectNeedsMigration('project-1');

      expect(result).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should handle full migration workflow', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});

      const needsMigration = await ProjectSettingsMigrationService.needsMigration();
      expect(needsMigration).toBe(true);

      const stats = await ProjectSettingsMigrationService.getMigrationStats();
      expect(stats.totalProjects).toBeGreaterThanOrEqual(0);

      mockChrome.storage.local.remove.mockResolvedValue(undefined);
      await ProjectSettingsMigrationService.resetMigrationStatus();

      expect(mockChrome.storage.local.remove).toHaveBeenCalled();
    });

    it('should verify project-specific migration after bulk migration', async () => {
      const mockGitHubSettings = {
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: {
          'project-1': {
            repoName: 'repo1',
            branch: 'main',
          },
        },
      };

      mockChrome.storage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        mockGitHubSettings as GitHubSettingsInterface
      );
      vi.mocked(GitHubCacheService.getRepoMetadata).mockResolvedValue({
        name: 'repo1',
        private: false,
        description: 'Test',
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
      mockChrome.storage.local.set.mockResolvedValue(undefined);

      const migrationResult = await ProjectSettingsMigrationService.migrateProjectSettings();
      expect(migrationResult.success).toBe(true);

      vi.mocked(ChromeStorageService.getProjectSettingsWithMetadata).mockResolvedValue({
        repoName: 'repo1',
        branch: 'main',
      });

      const needsMigration =
        await ProjectSettingsMigrationService.projectNeedsMigration('project-1');
      expect(needsMigration).toBe(true);
    });

    it('should handle migration with mixed project states', async () => {
      const mockGitHubSettings = {
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: {
          'project-1': {
            repoName: 'repo1',
            branch: 'main',
            metadata_last_updated: '2024-01-01T00:00:00Z',
          },
          'project-2': {
            repoName: 'repo2',
            branch: 'main',
          },
          'project-3': {
            repoName: 'repo3',
            branch: 'main',
          },
        },
      };

      mockChrome.storage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        mockGitHubSettings as GitHubSettingsInterface
      );
      vi.mocked(GitHubCacheService.getRepoMetadata).mockResolvedValue({
        name: 'repo2',
        private: false,
        description: 'Test',
        language: 'TypeScript',
        html_url: 'https://github.com/test-owner/repo2',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        default_branch: 'main',
        open_issues_count: 5,
        commit_count: 42,
        cached_at: '2024-01-15T00:00:00Z',
        last_refreshed: '2024-01-15T00:00:00Z',
      });
      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(false);
      vi.mocked(ChromeStorageService.updateProjectMetadata).mockResolvedValue();
      mockChrome.storage.local.set.mockResolvedValue(undefined);

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(2);
      expect(ChromeStorageService.updateProjectMetadata).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty commit response from API', async () => {
      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(true);

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
        getCommitCount: vi.fn().mockResolvedValue(0),
        request: vi.fn().mockResolvedValue([]),
      };

      mockChrome.storage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: {
          'project-1': { repoName: 'repo1', branch: 'main' },
        },
      } as GitHubSettingsInterface);
      vi.mocked(UnifiedGitHubService).mockImplementation(
        () => mockGitHubService as unknown as UnifiedGitHubService
      );
      vi.mocked(GitHubCacheService.createEnhancedRepo).mockReturnValue({
        name: 'repo1',
        private: false,
        description: 'Test',
        language: 'TypeScript',
        html_url: 'https://github.com/test-owner/repo1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        default_branch: 'main',
        open_issues_count: 5,
        commit_count: 0,
        cached_at: '2024-01-15T00:00:00Z',
        last_refreshed: '2024-01-15T00:00:00Z',
      });
      vi.mocked(GitHubCacheService.cacheRepoMetadata).mockResolvedValue();
      vi.mocked(ChromeStorageService.updateProjectMetadata).mockResolvedValue();
      mockChrome.storage.local.set.mockResolvedValue(undefined);

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(GitHubCacheService.createEnhancedRepo).toHaveBeenCalledWith(
        expect.any(Object),
        0,
        undefined
      );
    });

    it('should handle projects with undefined optional fields', async () => {
      vi.mocked(GitHubCacheService.getRepoMetadata).mockResolvedValue({
        name: 'repo1',
        private: false,
        description: null,
        language: null,
        html_url: 'https://github.com/test-owner/repo1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        default_branch: 'main',
        open_issues_count: 0,
        cached_at: '2024-01-15T00:00:00Z',
        last_refreshed: '2024-01-15T00:00:00Z',
      });
      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(false);

      mockChrome.storage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: {
          'project-1': { repoName: 'repo1', branch: 'main' },
        },
      } as GitHubSettingsInterface);
      vi.mocked(ChromeStorageService.updateProjectMetadata).mockResolvedValue();
      mockChrome.storage.local.set.mockResolvedValue(undefined);

      const result = await ProjectSettingsMigrationService.migrateProjectSettings();

      expect(result.success).toBe(true);
      expect(ChromeStorageService.updateProjectMetadata).toHaveBeenCalledWith('project-1', {
        is_private: false,
        language: undefined,
        description: undefined,
        commit_count: undefined,
        latest_commit_date: undefined,
        latest_commit_message: undefined,
        latest_commit_sha: undefined,
        latest_commit_author: undefined,
        open_issues_count: 0,
        github_updated_at: '2024-01-15T00:00:00Z',
        default_branch: 'main',
        github_repo_url: 'https://github.com/test-owner/repo1',
      });
    });

    it('should handle very large project counts', async () => {
      const largeProjectSettings: Record<string, { repoName: string; branch: string }> = {};
      for (let i = 0; i < 100; i++) {
        largeProjectSettings[`project-${i}`] = {
          repoName: `repo${i}`,
          branch: 'main',
        };
      }

      mockChrome.storage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        projectSettings: largeProjectSettings,
      } as GitHubSettingsInterface);
      vi.mocked(GitHubCacheService.getRepoMetadata).mockResolvedValue({
        name: 'repo1',
        private: false,
        description: null,
        language: null,
        html_url: 'https://github.com/test-owner/repo1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        default_branch: 'main',
        open_issues_count: 0,
        cached_at: '2024-01-15T00:00:00Z',
        last_refreshed: '2024-01-15T00:00:00Z',
      });
      vi.mocked(GitHubCacheService.isRepoMetadataStale).mockResolvedValue(false);
      vi.mocked(ChromeStorageService.updateProjectMetadata).mockResolvedValue();
      mockChrome.storage.local.set.mockResolvedValue(undefined);

      vi.useFakeTimers();
      const promise = ProjectSettingsMigrationService.migrateProjectSettings();

      for (let i = 0; i < 100; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(100);
    });
  });
});
