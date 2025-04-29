import type { IIdleMonitorService } from './interfaces/IIdleMonitorService';
import type { ICacheService } from './interfaces/ICacheService';
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
export class CacheService implements ICacheService {
  private static instance: CacheService | null = null;
  private cache: Map<string, CachedProject> = new Map();
  private maxCacheAge = 5 * 60 * 1000; // 5 minutes default cache lifetime
  private refreshCallbacks: Array<(projectId: string) => void> = [];
  private idleRefreshEnabled = true;
  private idleCallbackId: number | null = null;

  private constructor(
    private idleMonitor: IIdleMonitorService,
    private window: Window = globalThis.window
  ) {
    // Initialize both browser idle detection and user idle detection
    this.setupBrowserIdleDetection();
    this.setupUserIdleDetection();
  }

  public static getInstance(
    idleMonitor: IIdleMonitorService,
    window: Window = globalThis.window
  ): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService(idleMonitor, window);
    }
    return CacheService.instance;
  }

  public setMaxCacheAge(maxAgeMs: number): void {
    this.maxCacheAge = maxAgeMs;
  }

  public cacheProjectFiles(projectId: string, files: ProjectFiles): void {
    this.cache.set(projectId, {
      files,
      timestamp: Date.now(),
      projectId,
    });
    console.log(`Cached ${files.size} files for project ${projectId}`);
  }

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

  public invalidateCache(projectId: string): void {
    if (this.cache.has(projectId)) {
      this.cache.delete(projectId);
      console.log(`Cache invalidated for project ${projectId}`);
    }
  }

  public clearAllCaches(): void {
    this.cache.clear();
    console.log('All caches cleared');
  }

  public onCacheRefreshNeeded(callback: (projectId: string) => void): void {
    this.refreshCallbacks.push(callback);
  }

  public removeRefreshCallback(callback: (projectId: string) => void): void {
    this.refreshCallbacks = this.refreshCallbacks.filter((cb) => cb !== callback);
  }

  public setIdleRefreshEnabled(enabled: boolean): void {
    this.idleRefreshEnabled = enabled;

    if (!enabled) {
      if (this.idleCallbackId !== null) {
        this.window.cancelIdleCallback(this.idleCallbackId);
        this.idleCallbackId = null;
      }
    } else {
      if (this.idleCallbackId === null) {
        this.setupBrowserIdleDetection();
      }
    }
  }

  private setupBrowserIdleDetection(): void {
    // Only proceed if the browser supports idle callbacks
    if (typeof this.window.requestIdleCallback !== 'function') {
      console.warn('requestIdleCallback not supported, browser idle cache refresh disabled');
      return;
    }

    const scheduleIdleRefresh = () => {
      this.idleCallbackId = this.window.requestIdleCallback(
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

  private setupUserIdleDetection(): void {
    this.idleMonitor.addListener((state) => {
      if (state === 'idle' || state === 'locked') {
        console.log('User is idle, refreshing all caches proactively');
        this.refreshAllCaches();
      }
    });
  }

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
      console.log(`Refreshing ${staleCaches.length} stale caches during browser idle time`);
      this.refreshCaches(staleCaches);
    }
  }

  private refreshAllCaches(): void {
    if (!this.idleRefreshEnabled || this.cache.size === 0) return;

    console.log(`Refreshing all ${this.cache.size} caches during user idle time`);
    const allProjectIds = Array.from(this.cache.keys());
    this.refreshCaches(allProjectIds);
  }

  private refreshCaches(projectIds: string[]): void {
    for (const projectId of projectIds) {
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

  // For testing purposes only
  public static resetInstance(): void {
    CacheService.instance = null;
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
