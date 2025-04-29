import type { ProjectFiles } from '$lib/types';

interface CachedProject {
  files: ProjectFiles;
  timestamp: number;
  projectId: string;
}

/**
 * Service responsible for caching downloaded project files
 * to avoid unnecessary repeated downloads.
 */
export class CacheService {
  private static instance: CacheService | null = null;
  private cache: Map<string, CachedProject> = new Map();
  private maxCacheAge = 5 * 60 * 1000; // 5 minutes default cache lifetime
  private refreshCallbacks: Array<(projectId: string) => void> = [];
  private idleRefreshEnabled = true;
  private idleCallbackId: number | null = null;

  private constructor() {
    // Initialize idle detection for cache refresh
    this.setupIdleDetection();
  }

  /**
   * Get the singleton instance of CacheService
   */
  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Set the maximum age of cached items before they're considered stale
   * @param maxAgeMs Maximum age in milliseconds
   */
  public setMaxCacheAge(maxAgeMs: number): void {
    this.maxCacheAge = maxAgeMs;
  }

  /**
   * Store project files in the cache
   * @param projectId The project identifier
   * @param files Map of filenames to file contents
   */
  public cacheProjectFiles(projectId: string, files: ProjectFiles): void {
    this.cache.set(projectId, {
      files,
      timestamp: Date.now(),
      projectId,
    });
    console.log(`Cached ${files.size} files for project ${projectId}`);
  }

  /**
   * Get cached project files if available and not stale
   * @param projectId The project identifier
   * @returns The cached files or null if not available or stale
   */
  public getCachedProjectFiles(projectId: string): ProjectFiles | null {
    const cached = this.cache.get(projectId);

    if (!cached) {
      console.log(`No cache found for project ${projectId}`);
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > this.maxCacheAge) {
      console.log(`Cache for project ${projectId} is stale (${Math.round(age / 1000)}s old)`);
      return null;
    }

    console.log(`Using cached files for project ${projectId} (${Math.round(age / 1000)}s old)`);
    return cached.files;
  }

  /**
   * Invalidate the cache for a specific project
   * @param projectId The project identifier
   */
  public invalidateCache(projectId: string): void {
    if (this.cache.has(projectId)) {
      this.cache.delete(projectId);
      console.log(`Cache invalidated for project ${projectId}`);
    }
  }

  /**
   * Clear all cached data
   */
  public clearAllCaches(): void {
    this.cache.clear();
    console.log('All caches cleared');
  }

  /**
   * Register a callback to be called when a cache refresh is needed
   * @param callback Function to call with the projectId that needs refreshing
   */
  public onCacheRefreshNeeded(callback: (projectId: string) => void): void {
    this.refreshCallbacks.push(callback);
  }

  /**
   * Remove a previously registered callback
   * @param callback The callback to remove
   */
  public removeRefreshCallback(callback: (projectId: string) => void): void {
    this.refreshCallbacks = this.refreshCallbacks.filter((cb) => cb !== callback);
  }

  /**
   * Enable or disable automatic cache refresh during idle time
   * @param enabled Whether to enable idle refresh
   */
  public setIdleRefreshEnabled(enabled: boolean): void {
    this.idleRefreshEnabled = enabled;

    if (!enabled && this.idleCallbackId !== null) {
      window.cancelIdleCallback(this.idleCallbackId);
      this.idleCallbackId = null;
    } else if (enabled && this.idleCallbackId === null) {
      this.setupIdleDetection();
    }
  }

  /**
   * Set up idle detection to refresh caches when the browser is idle
   */
  private setupIdleDetection(): void {
    // Only proceed if the browser supports idle callbacks
    if (typeof window.requestIdleCallback !== 'function') {
      console.warn('requestIdleCallback not supported, idle cache refresh disabled');
      return;
    }

    const scheduleIdleRefresh = () => {
      this.idleCallbackId = window.requestIdleCallback(
        (deadline) => {
          // Reset the callback ID since this one is now running
          this.idleCallbackId = null;

          if (!this.idleRefreshEnabled) return;

          // Check if we have enough idle time (at least 1 second)
          if (deadline.timeRemaining() > 1000 || deadline.didTimeout) {
            this.refreshStaleCaches();
          }

          // Schedule the next idle check
          scheduleIdleRefresh();
        },
        { timeout: 10000 } // 10 second timeout
      );
    };

    // Start the idle detection cycle
    scheduleIdleRefresh();
  }

  /**
   * Refresh any stale caches during idle time
   */
  private refreshStaleCaches(): void {
    const now = Date.now();
    const staleCaches: string[] = [];

    // Find stale caches
    this.cache.forEach((cached, projectId) => {
      const age = now - cached.timestamp;
      if (age > this.maxCacheAge) {
        staleCaches.push(projectId);
      }
    });

    // Trigger refresh callbacks for stale caches
    if (staleCaches.length > 0) {
      console.log(`Refreshing ${staleCaches.length} stale caches during idle time`);

      for (const projectId of staleCaches) {
        // Notify all registered callbacks
        for (const callback of this.refreshCallbacks) {
          try {
            callback(projectId);
          } catch (error) {
            console.error(`Error in cache refresh callback for project ${projectId}:`, error);
          }
        }
      }
    }
  }
}

// Use TypeScript's built-in types for requestIdleCallback
// This is just a fallback for older TypeScript versions
interface IdleRequestOptions {
  timeout?: number;
}

type IdleRequestCallback = (deadline: IdleDeadline) => void;

declare global {
  interface Window {
    requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback: (handle: number) => void;
  }
}
