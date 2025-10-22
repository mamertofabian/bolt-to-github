import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubCacheService, type EnhancedGitHubRepo } from '../GitHubCacheService';

describe('GitHubCacheService', () => {
  let mockChrome: {
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
      };
    };
  };

  const TEST_OWNER = 'test-owner';
  const TEST_REPO = 'test-repo';
  const CACHE_DURATION = 10 * 60 * 1000;
  const COMMIT_CACHE_DURATION = 5 * 60 * 1000;

  const mockEnhancedRepo: EnhancedGitHubRepo = {
    name: TEST_REPO,
    description: 'Test repository',
    private: false,
    language: 'TypeScript',
    html_url: `https://github.com/${TEST_OWNER}/${TEST_REPO}`,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    default_branch: 'main',
    commit_count: 42,
    latest_commit: {
      sha: 'abc123',
      message: 'Initial commit',
      date: '2024-01-02T00:00:00Z',
      author: 'Test Author',
    },
    open_issues_count: 3,
    cached_at: '2024-01-02T00:00:00Z',
    last_refreshed: '2024-01-02T00:00:00Z',
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('isCacheStale', () => {
    it('should return false when cache is fresh', async () => {
      const now = Date.now();
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - 5 * 60 * 1000,
          owner: TEST_OWNER,
        },
      });

      const result = await GitHubCacheService.isCacheStale(TEST_OWNER);

      expect(result).toBe(false);
    });

    it('should return true when cache is older than CACHE_DURATION', async () => {
      const now = Date.now();
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - CACHE_DURATION - 1000,
          owner: TEST_OWNER,
        },
      });

      const result = await GitHubCacheService.isCacheStale(TEST_OWNER);

      expect(result).toBe(true);
    });

    it('should return true when cache does not exist', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});

      const result = await GitHubCacheService.isCacheStale(TEST_OWNER);

      expect(result).toBe(true);
    });

    it('should return true when timestamp is invalid', async () => {
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: 0,
          owner: TEST_OWNER,
        },
      });

      const result = await GitHubCacheService.isCacheStale(TEST_OWNER);

      expect(result).toBe(true);
    });

    it('should return true when timestamp is negative', async () => {
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: -100,
          owner: TEST_OWNER,
        },
      });

      const result = await GitHubCacheService.isCacheStale(TEST_OWNER);

      expect(result).toBe(true);
    });

    it('should return true when storage access fails', async () => {
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await GitHubCacheService.isCacheStale(TEST_OWNER);

      expect(result).toBe(true);
    });
  });

  describe('getCachedRepos', () => {
    it('should return cached repositories when cache is fresh', async () => {
      const now = Date.now();
      const repos = [mockEnhancedRepo];
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos,
          timestamp: now - 5 * 60 * 1000,
          owner: TEST_OWNER,
        },
      });

      const result = await GitHubCacheService.getCachedRepos(TEST_OWNER);

      expect(result).toEqual(repos);
    });

    it('should return empty array when cache is stale', async () => {
      const now = Date.now();
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - CACHE_DURATION - 1000,
          owner: TEST_OWNER,
        },
      });

      const result = await GitHubCacheService.getCachedRepos(TEST_OWNER);

      expect(result).toEqual([]);
    });

    it('should return empty array when cache does not exist', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});

      const result = await GitHubCacheService.getCachedRepos(TEST_OWNER);

      expect(result).toEqual([]);
    });

    it('should return empty array when storage access fails', async () => {
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await GitHubCacheService.getCachedRepos(TEST_OWNER);

      expect(result).toEqual([]);
    });
  });

  describe('cacheRepos', () => {
    it('should cache repositories with current timestamp', async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const repos = [mockEnhancedRepo];

      await GitHubCacheService.cacheRepos(TEST_OWNER, repos);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos,
          timestamp: now,
          owner: TEST_OWNER,
        },
      });
    });

    it('should cache empty array', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await GitHubCacheService.cacheRepos(TEST_OWNER, []);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [],
          timestamp: now,
          owner: TEST_OWNER,
        },
      });
    });

    it('should handle storage errors gracefully', async () => {
      mockChrome.storage.local.set.mockRejectedValue(new Error('Storage error'));

      await expect(
        GitHubCacheService.cacheRepos(TEST_OWNER, [mockEnhancedRepo])
      ).resolves.toBeUndefined();
    });

    it('should cache multiple repositories', async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const repos = [
        mockEnhancedRepo,
        { ...mockEnhancedRepo, name: 'repo-2' },
        { ...mockEnhancedRepo, name: 'repo-3' },
      ];

      await GitHubCacheService.cacheRepos(TEST_OWNER, repos);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos,
          timestamp: now,
          owner: TEST_OWNER,
        },
      });
    });
  });

  describe('getRepoMetadata', () => {
    it('should return metadata from main cache when fresh', async () => {
      const now = Date.now();
      const cacheData = {
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - 2 * 60 * 1000,
          owner: TEST_OWNER,
        },
      };

      const metadataCheck = {
        [`github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`]: {
          ...mockEnhancedRepo,
          cached_at: new Date(now - 2 * 60 * 1000).toISOString(),
        },
      };

      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (Array.isArray(keys) && keys[0] === `github_repos_enhanced_${TEST_OWNER}`) {
          return Promise.resolve(cacheData);
        }
        if (Array.isArray(keys) && keys[0] === `github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`) {
          return Promise.resolve(metadataCheck);
        }
        return Promise.resolve({});
      });

      const result = await GitHubCacheService.getRepoMetadata(TEST_OWNER, TEST_REPO);

      expect(result).toEqual(mockEnhancedRepo);
    });

    it('should return metadata from individual cache when main cache is stale', async () => {
      const now = Date.now();
      const staleCacheData = {
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - CACHE_DURATION - 1000,
          owner: TEST_OWNER,
        },
      };

      const individualMetadata = {
        ...mockEnhancedRepo,
        cached_at: new Date(now - 2 * 60 * 1000).toISOString(),
      };

      const metadataCache = {
        [`github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`]: individualMetadata,
      };

      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (Array.isArray(keys) && keys[0] === `github_repos_enhanced_${TEST_OWNER}`) {
          return Promise.resolve(staleCacheData);
        }
        if (Array.isArray(keys) && keys[0] === `github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`) {
          return Promise.resolve(metadataCache);
        }
        return Promise.resolve({});
      });

      const result = await GitHubCacheService.getRepoMetadata(TEST_OWNER, TEST_REPO);

      expect(result).toEqual(individualMetadata);
    });

    it('should return null when repository is not in cache', async () => {
      const now = Date.now();
      const cacheData = {
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [{ ...mockEnhancedRepo, name: 'other-repo' }],
          timestamp: now - 2 * 60 * 1000,
          owner: TEST_OWNER,
        },
      };

      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (Array.isArray(keys) && keys[0] === `github_repos_enhanced_${TEST_OWNER}`) {
          return Promise.resolve(cacheData);
        }
        return Promise.resolve({});
      });

      const result = await GitHubCacheService.getRepoMetadata(TEST_OWNER, TEST_REPO);

      expect(result).toBeNull();
    });

    it('should return null when both caches are stale', async () => {
      const now = Date.now();
      const staleCacheData = {
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - CACHE_DURATION - 1000,
          owner: TEST_OWNER,
        },
      };

      const staleMetadata = {
        [`github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`]: {
          ...mockEnhancedRepo,
          cached_at: new Date(now - COMMIT_CACHE_DURATION - 1000).toISOString(),
        },
      };

      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (Array.isArray(keys) && keys[0] === `github_repos_enhanced_${TEST_OWNER}`) {
          return Promise.resolve(staleCacheData);
        }
        if (Array.isArray(keys) && keys[0] === `github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`) {
          return Promise.resolve(staleMetadata);
        }
        return Promise.resolve({});
      });

      const result = await GitHubCacheService.getRepoMetadata(TEST_OWNER, TEST_REPO);

      expect(result).toBeNull();
    });

    it('should handle storage errors gracefully', async () => {
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await GitHubCacheService.getRepoMetadata(TEST_OWNER, TEST_REPO);

      expect(result).toBeNull();
    });
  });

  describe('cacheRepoMetadata', () => {
    it('should cache individual repository metadata', async () => {
      await GitHubCacheService.cacheRepoMetadata(TEST_OWNER, TEST_REPO, mockEnhancedRepo);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [`github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`]: mockEnhancedRepo,
      });
    });

    it('should update main cache when it exists', async () => {
      const now = Date.now();
      const existingRepos = [mockEnhancedRepo, { ...mockEnhancedRepo, name: 'other-repo' }];
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: existingRepos,
          timestamp: now - 2 * 60 * 1000,
          owner: TEST_OWNER,
        },
      });

      const updatedMetadata = { ...mockEnhancedRepo, description: 'Updated description' };
      await GitHubCacheService.cacheRepoMetadata(TEST_OWNER, TEST_REPO, updatedMetadata);

      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2);
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [`github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`]: updatedMetadata,
      });
    });

    it('should handle storage errors gracefully', async () => {
      mockChrome.storage.local.set.mockRejectedValue(new Error('Storage error'));

      await expect(
        GitHubCacheService.cacheRepoMetadata(TEST_OWNER, TEST_REPO, mockEnhancedRepo)
      ).resolves.toBeUndefined();
    });
  });

  describe('isRepoMetadataStale', () => {
    it('should return false when metadata is fresh', async () => {
      const now = Date.now();
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`]: {
          ...mockEnhancedRepo,
          cached_at: new Date(now - 2 * 60 * 1000).toISOString(),
        },
      });

      const result = await GitHubCacheService.isRepoMetadataStale(TEST_OWNER, TEST_REPO);

      expect(result).toBe(false);
    });

    it('should return true when metadata is older than COMMIT_CACHE_DURATION', async () => {
      const now = Date.now();
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`]: {
          ...mockEnhancedRepo,
          cached_at: new Date(now - COMMIT_CACHE_DURATION - 1000).toISOString(),
        },
      });

      const result = await GitHubCacheService.isRepoMetadataStale(TEST_OWNER, TEST_REPO);

      expect(result).toBe(true);
    });

    it('should return true when metadata does not exist', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});

      const result = await GitHubCacheService.isRepoMetadataStale(TEST_OWNER, TEST_REPO);

      expect(result).toBe(true);
    });

    it('should return true when cached_at is missing', async () => {
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`]: {
          ...mockEnhancedRepo,
          cached_at: undefined,
        },
      });

      const result = await GitHubCacheService.isRepoMetadataStale(TEST_OWNER, TEST_REPO);

      expect(result).toBe(true);
    });

    it('should handle storage errors gracefully', async () => {
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await GitHubCacheService.isRepoMetadataStale(TEST_OWNER, TEST_REPO);

      expect(result).toBe(true);
    });
  });

  describe('createEnhancedRepo', () => {
    it('should create enhanced repo with all provided data', () => {
      const now = new Date();
      vi.setSystemTime(now);

      const apiRepo = {
        name: 'test-repo',
        description: 'Test description',
        private: true,
        language: 'JavaScript',
        html_url: 'https://github.com/test/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        default_branch: 'develop',
        open_issues_count: 5,
      };

      const commitCount = 100;
      const latestCommit = {
        sha: 'xyz789',
        message: 'Latest commit',
        date: '2024-01-03T00:00:00Z',
        author: 'Author Name',
      };

      const result = GitHubCacheService.createEnhancedRepo(apiRepo, commitCount, latestCommit);

      expect(result).toEqual({
        name: 'test-repo',
        description: 'Test description',
        private: true,
        language: 'JavaScript',
        html_url: 'https://github.com/test/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        default_branch: 'develop',
        commit_count: 100,
        latest_commit: latestCommit,
        open_issues_count: 5,
        cached_at: now.toISOString(),
        last_refreshed: now.toISOString(),
      });
    });

    it('should handle missing optional fields with defaults', () => {
      const now = new Date();
      vi.setSystemTime(now);

      const apiRepo = {
        name: 'test-repo',
        private: false,
        html_url: 'https://github.com/test/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const result = GitHubCacheService.createEnhancedRepo(apiRepo);

      expect(result).toEqual({
        name: 'test-repo',
        description: null,
        private: false,
        language: null,
        html_url: 'https://github.com/test/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        default_branch: 'main',
        commit_count: undefined,
        latest_commit: undefined,
        open_issues_count: 0,
        cached_at: now.toISOString(),
        last_refreshed: now.toISOString(),
      });
    });

    it('should handle null description and language', () => {
      const now = new Date();
      vi.setSystemTime(now);

      const apiRepo = {
        name: 'test-repo',
        description: null,
        private: false,
        language: null,
        html_url: 'https://github.com/test/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const result = GitHubCacheService.createEnhancedRepo(apiRepo);

      expect(result.description).toBeNull();
      expect(result.language).toBeNull();
    });

    it('should use "main" as default branch when not provided', () => {
      const apiRepo = {
        name: 'test-repo',
        private: false,
        html_url: 'https://github.com/test/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const result = GitHubCacheService.createEnhancedRepo(apiRepo);

      expect(result.default_branch).toBe('main');
    });
  });

  describe('clearCache', () => {
    it('should remove main cache and individual metadata caches', async () => {
      const allKeys = {
        [`github_repos_enhanced_${TEST_OWNER}`]: {},
        [`github_repo_metadata_${TEST_OWNER}_repo1`]: {},
        [`github_repo_metadata_${TEST_OWNER}_repo2`]: {},
        [`github_repo_metadata_other-owner_repo1`]: {},
      };
      mockChrome.storage.local.get.mockResolvedValue(allKeys);

      await GitHubCacheService.clearCache(TEST_OWNER);

      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        `github_repos_enhanced_${TEST_OWNER}`,
      ]);
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        `github_repo_metadata_${TEST_OWNER}_repo1`,
        `github_repo_metadata_${TEST_OWNER}_repo2`,
      ]);
    });

    it('should only remove main cache if no metadata caches exist', async () => {
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {},
      });

      await GitHubCacheService.clearCache(TEST_OWNER);

      expect(mockChrome.storage.local.remove).toHaveBeenCalledTimes(1);
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        `github_repos_enhanced_${TEST_OWNER}`,
      ]);
    });

    it('should handle storage errors gracefully', async () => {
      mockChrome.storage.local.remove.mockRejectedValue(new Error('Storage error'));

      await expect(GitHubCacheService.clearCache(TEST_OWNER)).resolves.toBeUndefined();
    });

    it('should not remove caches for other owners', async () => {
      const allKeys = {
        [`github_repos_enhanced_${TEST_OWNER}`]: {},
        [`github_repo_metadata_${TEST_OWNER}_repo1`]: {},
        [`github_repos_enhanced_other-owner`]: {},
        [`github_repo_metadata_other-owner_repo1`]: {},
      };
      mockChrome.storage.local.get.mockResolvedValue(allKeys);

      await GitHubCacheService.clearCache(TEST_OWNER);

      const removedKeys = mockChrome.storage.local.remove.mock.calls.flat();
      expect(removedKeys).not.toContain(`github_repos_enhanced_other-owner`);
      expect(removedKeys).not.toContain(`github_repo_metadata_other-owner_repo1`);
    });
  });

  describe('getCacheStats', () => {
    it('should return correct stats for existing cache', async () => {
      const now = Date.now();
      const timestamp = now - 3 * 60 * 1000;
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo, { ...mockEnhancedRepo, name: 'repo2' }],
          timestamp,
          owner: TEST_OWNER,
        },
      });

      const result = await GitHubCacheService.getCacheStats(TEST_OWNER);

      expect(result).toEqual({
        repoCount: 2,
        cacheAge: 180,
        isStale: false,
      });
    });

    it('should return stats indicating stale cache', async () => {
      const now = Date.now();
      const timestamp = now - CACHE_DURATION - 1000;
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp,
          owner: TEST_OWNER,
        },
      });

      const result = await GitHubCacheService.getCacheStats(TEST_OWNER);

      expect(result.isStale).toBe(true);
      expect(result.repoCount).toBe(1);
    });

    it('should return zero stats when cache does not exist', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});

      const result = await GitHubCacheService.getCacheStats(TEST_OWNER);

      expect(result).toEqual({
        repoCount: 0,
        cacheAge: 0,
        isStale: true,
      });
    });

    it('should handle storage errors gracefully', async () => {
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await GitHubCacheService.getCacheStats(TEST_OWNER);

      expect(result).toEqual({
        repoCount: 0,
        cacheAge: 0,
        isStale: true,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle owner with special characters in cache keys', async () => {
      const specialOwner = 'owner-with-special.chars_123';
      const now = Date.now();
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${specialOwner}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - 2 * 60 * 1000,
          owner: specialOwner,
        },
      });

      const result = await GitHubCacheService.getCachedRepos(specialOwner);

      expect(result).toEqual([mockEnhancedRepo]);
    });

    it('should handle empty repository list correctly', async () => {
      const now = Date.now();
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [],
          timestamp: now - 2 * 60 * 1000,
          owner: TEST_OWNER,
        },
      });

      const result = await GitHubCacheService.getCachedRepos(TEST_OWNER);

      expect(result).toEqual([]);
    });

    it('should handle repository without commit data', () => {
      const now = new Date();
      vi.setSystemTime(now);

      const apiRepo = {
        name: 'test-repo',
        private: false,
        html_url: 'https://github.com/test/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const result = GitHubCacheService.createEnhancedRepo(apiRepo);

      expect(result.commit_count).toBeUndefined();
      expect(result.latest_commit).toBeUndefined();
    });

    it('should handle concurrent cache operations', async () => {
      const repos1 = [mockEnhancedRepo];
      const repos2 = [{ ...mockEnhancedRepo, name: 'different-repo' }];

      await Promise.all([
        GitHubCacheService.cacheRepos(TEST_OWNER, repos1),
        GitHubCacheService.cacheRepos(TEST_OWNER, repos2),
      ]);

      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2);
    });

    it('should handle very long owner names', async () => {
      const longOwner = 'a'.repeat(200);
      const now = Date.now();
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${longOwner}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - 2 * 60 * 1000,
          owner: longOwner,
        },
      });

      const result = await GitHubCacheService.getCachedRepos(longOwner);

      expect(result).toEqual([mockEnhancedRepo]);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete cache lifecycle for a repository', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await GitHubCacheService.cacheRepos(TEST_OWNER, [mockEnhancedRepo]);

      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now,
          owner: TEST_OWNER,
        },
      });

      const cachedRepos = await GitHubCacheService.getCachedRepos(TEST_OWNER);
      expect(cachedRepos).toEqual([mockEnhancedRepo]);

      const isStale = await GitHubCacheService.isCacheStale(TEST_OWNER);
      expect(isStale).toBe(false);

      const stats = await GitHubCacheService.getCacheStats(TEST_OWNER);
      expect(stats.repoCount).toBe(1);
      expect(stats.isStale).toBe(false);

      await GitHubCacheService.clearCache(TEST_OWNER);
      expect(mockChrome.storage.local.remove).toHaveBeenCalled();
    });

    it('should update individual metadata and sync with main cache', async () => {
      const now = Date.now();
      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - 2 * 60 * 1000,
          owner: TEST_OWNER,
        },
      });

      const updatedMetadata = {
        ...mockEnhancedRepo,
        description: 'Updated description',
        commit_count: 50,
      };

      await GitHubCacheService.cacheRepoMetadata(TEST_OWNER, TEST_REPO, updatedMetadata);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [`github_repo_metadata_${TEST_OWNER}_${TEST_REPO}`]: updatedMetadata,
      });
    });

    it('should handle cache refresh workflow', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: [mockEnhancedRepo],
          timestamp: now - CACHE_DURATION - 1000,
          owner: TEST_OWNER,
        },
      });

      const isStale = await GitHubCacheService.isCacheStale(TEST_OWNER);
      expect(isStale).toBe(true);

      const freshRepos = [mockEnhancedRepo, { ...mockEnhancedRepo, name: 'new-repo' }];
      await GitHubCacheService.cacheRepos(TEST_OWNER, freshRepos);

      mockChrome.storage.local.get.mockResolvedValue({
        [`github_repos_enhanced_${TEST_OWNER}`]: {
          repos: freshRepos,
          timestamp: now,
          owner: TEST_OWNER,
        },
      });

      const cached = await GitHubCacheService.getCachedRepos(TEST_OWNER);
      expect(cached).toEqual(freshRepos);
    });
  });
});
