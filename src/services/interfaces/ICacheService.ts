import type { ProjectFiles } from '$lib/types';

/**
 * Interface for cache service
 * Provides a standardized way to cache and manage project files
 */
export interface ICacheService {
  /**
   * Set the maximum age of cached items before they're considered stale
   * @param maxAgeMs Maximum age in milliseconds
   */
  setMaxCacheAge(maxAgeMs: number): void;

  /**
   * Store project files in the cache
   * @param projectId The project identifier
   * @param files Map of filenames to file contents
   */
  cacheProjectFiles(projectId: string, files: ProjectFiles): void;

  /**
   * Get cached project files if available and not stale
   * @param projectId The project identifier
   * @returns The cached files or null if not available or stale
   */
  getCachedProjectFiles(projectId: string): ProjectFiles | null;

  /**
   * Invalidate the cache for a specific project
   * @param projectId The project identifier
   */
  invalidateCache(projectId: string): void;

  /**
   * Clear all cached data
   */
  clearAllCaches(): void;

  /**
   * Register a callback to be called when a cache refresh is needed
   * @param callback Function to call with the projectId that needs refreshing
   */
  onCacheRefreshNeeded(callback: (projectId: string) => void): void;

  /**
   * Remove a previously registered callback
   * @param callback The callback to remove
   */
  removeRefreshCallback(callback: (projectId: string) => void): void;

  /**
   * Enable or disable automatic cache refresh during idle time
   * @param enabled Whether to enable idle refresh
   */
  setIdleRefreshEnabled(enabled: boolean): void;
}
