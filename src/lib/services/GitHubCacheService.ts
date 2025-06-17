import { createLogger } from '../utils/logger';

const logger = createLogger('GitHubCacheService');

/**
 * Enhanced GitHub repository metadata interface
 */
export interface EnhancedGitHubRepo {
  // Basic repo info
  name: string;
  description: string | null;
  private: boolean;
  language: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;

  // Extended metadata for bolt projects
  default_branch: string;
  commit_count?: number;
  latest_commit?: {
    sha: string;
    message: string;
    date: string;
    author: string;
  };
  open_issues_count: number;

  // Cache metadata
  cached_at: string;
  last_refreshed: string;
}

/**
 * Cache entry for GitHub repositories with metadata
 */
export interface GitHubRepoCache {
  repos: EnhancedGitHubRepo[];
  timestamp: number;
  owner: string;
}

/**
 * Service for managing GitHub repository caching with enhanced metadata
 */
export class GitHubCacheService {
  private static readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  private static readonly COMMIT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cache key for repository list
   */
  private static getReposCacheKey(owner: string): string {
    return `github_repos_enhanced_${owner}`;
  }

  /**
   * Get cache key for repository metadata
   */
  private static getRepoMetadataCacheKey(owner: string, repo: string): string {
    return `github_repo_metadata_${owner}_${repo}`;
  }

  /**
   * Check if cache is stale for a given owner
   */
  static async isCacheStale(owner: string): Promise<boolean> {
    try {
      const cacheKey = this.getReposCacheKey(owner);
      const result = await chrome.storage.local.get([cacheKey]);
      const cache: GitHubRepoCache | undefined = result[cacheKey];

      if (!cache || !cache.timestamp) {
        return true;
      }

      const now = Date.now();
      const isStale = now - cache.timestamp > this.CACHE_DURATION;

      logger.info(
        `Cache stale check for ${owner}: ${isStale} (age: ${Math.round((now - cache.timestamp) / 1000)}s)`
      );
      return isStale;
    } catch (error) {
      logger.error('Error checking cache staleness:', error);
      return true;
    }
  }

  /**
   * Get cached repositories for an owner
   */
  static async getCachedRepos(owner: string): Promise<EnhancedGitHubRepo[]> {
    try {
      const cacheKey = this.getReposCacheKey(owner);
      const result = await chrome.storage.local.get([cacheKey]);
      const cache: GitHubRepoCache | undefined = result[cacheKey];

      if (!cache || (await this.isCacheStale(owner))) {
        logger.info(`No valid cache found for ${owner}`);
        return [];
      }

      logger.info(`Loaded ${cache.repos.length} repos from cache for ${owner}`);
      return cache.repos;
    } catch (error) {
      logger.error('Error loading cached repos:', error);
      return [];
    }
  }

  /**
   * Cache repositories for an owner
   */
  static async cacheRepos(owner: string, repos: EnhancedGitHubRepo[]): Promise<void> {
    try {
      const cacheKey = this.getReposCacheKey(owner);
      const cache: GitHubRepoCache = {
        repos,
        timestamp: Date.now(),
        owner,
      };

      await chrome.storage.local.set({ [cacheKey]: cache });
      logger.info(`Cached ${repos.length} repos for ${owner}`);
    } catch (error) {
      logger.error('Error caching repos:', error);
    }
  }

  /**
   * Get cached metadata for a specific repository
   */
  static async getRepoMetadata(owner: string, repo: string): Promise<EnhancedGitHubRepo | null> {
    try {
      // First try to get from the main repos cache
      const repos = await this.getCachedRepos(owner);
      const repoData = repos.find((r) => r.name === repo);

      if (repoData && !(await this.isRepoMetadataStale(owner, repo))) {
        logger.info(`Repo metadata found in cache for ${owner}/${repo}`);
        return repoData;
      }

      // Try individual metadata cache
      const metadataKey = this.getRepoMetadataCacheKey(owner, repo);
      const result = await chrome.storage.local.get([metadataKey]);
      const metadata = result[metadataKey];

      if (metadata && !(await this.isRepoMetadataStale(owner, repo))) {
        logger.info(`Individual repo metadata found for ${owner}/${repo}`);
        return metadata;
      }

      return null;
    } catch (error) {
      logger.error(`Error getting repo metadata for ${owner}/${repo}:`, error);
      return null;
    }
  }

  /**
   * Cache metadata for a specific repository
   */
  static async cacheRepoMetadata(
    owner: string,
    repo: string,
    metadata: EnhancedGitHubRepo
  ): Promise<void> {
    try {
      const metadataKey = this.getRepoMetadataCacheKey(owner, repo);
      await chrome.storage.local.set({ [metadataKey]: metadata });

      // Also update the main repos cache if it exists
      const repos = await this.getCachedRepos(owner);
      if (repos.length > 0) {
        const updatedRepos = repos.map((r) => (r.name === repo ? metadata : r));
        await this.cacheRepos(owner, updatedRepos);
      }

      logger.info(`Cached metadata for ${owner}/${repo}`);
    } catch (error) {
      logger.error(`Error caching metadata for ${owner}/${repo}:`, error);
    }
  }

  /**
   * Check if repository metadata is stale
   */
  static async isRepoMetadataStale(owner: string, repo: string): Promise<boolean> {
    try {
      const metadataKey = this.getRepoMetadataCacheKey(owner, repo);
      const result = await chrome.storage.local.get([metadataKey]);
      const metadata = result[metadataKey];

      if (!metadata || !metadata.cached_at) {
        return true;
      }

      const now = Date.now();
      const cachedAt = new Date(metadata.cached_at).getTime();
      const isStale = now - cachedAt > this.COMMIT_CACHE_DURATION;

      return isStale;
    } catch (error) {
      logger.error(`Error checking metadata staleness for ${owner}/${repo}:`, error);
      return true;
    }
  }

  /**
   * Convert basic GitHub API repo response to enhanced repo metadata
   */
  static createEnhancedRepo(
    apiRepo: {
      name: string;
      description?: string | null;
      private: boolean;
      language?: string | null;
      html_url: string;
      created_at: string;
      updated_at: string;
      default_branch?: string;
      open_issues_count?: number;
    },
    commitCount?: number,
    latestCommit?: {
      sha: string;
      message: string;
      date: string;
      author: string;
    }
  ): EnhancedGitHubRepo {
    const now = new Date().toISOString();

    return {
      name: apiRepo.name,
      description: apiRepo.description ?? null,
      private: apiRepo.private,
      language: apiRepo.language ?? null,
      html_url: apiRepo.html_url,
      created_at: apiRepo.created_at,
      updated_at: apiRepo.updated_at,
      default_branch: apiRepo.default_branch || 'main',
      commit_count: commitCount,
      latest_commit: latestCommit,
      open_issues_count: apiRepo.open_issues_count || 0,
      cached_at: now,
      last_refreshed: now,
    };
  }

  /**
   * Clear all cached data for an owner
   */
  static async clearCache(owner: string): Promise<void> {
    try {
      const cacheKey = this.getReposCacheKey(owner);
      await chrome.storage.local.remove([cacheKey]);

      // Clear individual repo metadata caches
      const allKeys = await chrome.storage.local.get();
      const metadataKeys = Object.keys(allKeys || {}).filter((key) =>
        key.startsWith(`github_repo_metadata_${owner}_`)
      );

      if (metadataKeys.length > 0) {
        await chrome.storage.local.remove(metadataKeys);
      }

      logger.info(`Cleared cache for ${owner}`);
    } catch (error) {
      logger.error(`Error clearing cache for ${owner}:`, error);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  static async getCacheStats(owner: string): Promise<{
    repoCount: number;
    cacheAge: number;
    isStale: boolean;
  }> {
    try {
      const cacheKey = this.getReposCacheKey(owner);
      const result = await chrome.storage.local.get([cacheKey]);
      const cache: GitHubRepoCache | undefined = result[cacheKey];

      if (!cache) {
        return { repoCount: 0, cacheAge: 0, isStale: true };
      }

      const cacheAge = Date.now() - cache.timestamp;
      const isStale = await this.isCacheStale(owner);

      return {
        repoCount: cache.repos.length,
        cacheAge: Math.round(cacheAge / 1000), // in seconds
        isStale,
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return { repoCount: 0, cacheAge: 0, isStale: true };
    }
  }
}
