/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mock, MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from '../CacheService';
import type { IIdleMonitorService } from '../interfaces/IIdleMonitorService';

class MockIdleMonitor implements IIdleMonitorService {
  private currentState: chrome.idle.IdleState = 'active';
  private listeners: Array<(state: chrome.idle.IdleState) => void> = [];

  getCurrentState = vi.fn((): chrome.idle.IdleState => this.currentState);
  isIdle = vi.fn((): boolean => this.currentState === 'idle' || this.currentState === 'locked');

  addListener = vi.fn((callback: (state: chrome.idle.IdleState) => void) => {
    this.listeners.push(callback);
  });

  removeListener = vi.fn((callback: (state: chrome.idle.IdleState) => void) => {
    this.listeners = this.listeners.filter((l) => l !== callback);
  });

  simulateStateChange(newState: chrome.idle.IdleState) {
    this.currentState = newState;
    this.listeners.forEach((listener) => listener(newState));
  }
}

class ControlledIdleCallbackManager {
  private idCounter = 1;
  private activeCallbacks = new Map<number, IdleRequestCallback>();

  requestIdleCallback = vi.fn(
    (callback: IdleRequestCallback, _options?: IdleRequestOptions): number => {
      const id = this.idCounter++;
      this.activeCallbacks.set(id, callback);
      return id;
    }
  );

  cancelIdleCallback = vi.fn((id: number): void => {
    this.activeCallbacks.delete(id);
  });

  simulateIdlePeriod(timeRemaining: number = 2000, didTimeout: boolean = false): void {
    const callbackEntries = Array.from(this.activeCallbacks.entries());

    this.activeCallbacks.clear();

    callbackEntries.forEach(([, callback]) => {
      callback({
        timeRemaining: () => timeRemaining,
        didTimeout,
      });
    });
  }
}

describe('CacheService', () => {
  let mockIdleMonitor: MockIdleMonitor;
  let idleCallbackManager: ControlledIdleCallbackManager;
  let cacheService: CacheService;
  let mockWindow: any;
  let mockDate: ReturnType<typeof vi.spyOn>;
  let fakeNow: number;
  let originalRefreshAllCaches: any;

  beforeEach(() => {
    fakeNow = 1000000;
    mockDate = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow) as unknown as MockInstance;

    mockIdleMonitor = new MockIdleMonitor();
    idleCallbackManager = new ControlledIdleCallbackManager();

    mockWindow = {
      requestIdleCallback: idleCallbackManager.requestIdleCallback,
      cancelIdleCallback: idleCallbackManager.cancelIdleCallback,
    };

    CacheService.resetInstance();

    cacheService = CacheService.getInstance(mockIdleMonitor, mockWindow);

    originalRefreshAllCaches = (cacheService as any).refreshAllCaches;
  });

  afterEach(() => {
    if (originalRefreshAllCaches) {
      (cacheService as any).refreshAllCaches = originalRefreshAllCaches;
    }

    mockDate.mockRestore();
    vi.clearAllMocks();
  });

  const advanceTime = (ms: number) => {
    fakeNow += ms;
  };

  describe('initialization', () => {
    it('should set up idle detection on initialization', () => {
      expect(mockIdleMonitor.addListener).toHaveBeenCalled();
      expect(idleCallbackManager.requestIdleCallback).toHaveBeenCalled();
    });

    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = CacheService.getInstance(mockIdleMonitor, mockWindow);
      const instance2 = CacheService.getInstance(mockIdleMonitor, mockWindow);
      expect(instance1).toBe(instance2);
    });
  });

  describe('caching operations', () => {
    const projectId = 'test-project';
    const files = new Map([['test.txt', 'content']]);

    it('should store and retrieve files from cache', () => {
      cacheService.cacheProjectFiles(projectId, files);
      const cached = cacheService.getCachedProjectFiles(projectId);
      expect(cached).toEqual(files);
    });

    it('should return null for non-existent cache', () => {
      const cached = cacheService.getCachedProjectFiles('non-existent');
      expect(cached).toBeNull();
    });

    it('should return null for stale cache', () => {
      cacheService.cacheProjectFiles(projectId, files);

      advanceTime(6 * 60 * 1000);

      const cached = cacheService.getCachedProjectFiles(projectId);
      expect(cached).toBeNull();
    });

    it('should invalidate specific cache', () => {
      cacheService.cacheProjectFiles(projectId, files);
      cacheService.invalidateCache(projectId);
      const cached = cacheService.getCachedProjectFiles(projectId);
      expect(cached).toBeNull();
    });

    it('should clear all caches', () => {
      cacheService.cacheProjectFiles(projectId, files);
      cacheService.cacheProjectFiles('other-project', files);
      cacheService.clearAllCaches();
      expect(cacheService.getCachedProjectFiles(projectId)).toBeNull();
      expect(cacheService.getCachedProjectFiles('other-project')).toBeNull();
    });
  });

  describe('idle refresh behavior', () => {
    const projectId = 'test-project';
    const files = new Map([['test.txt', 'content']]);
    let refreshCallback: Mock;
    let refreshAllCachesSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      refreshAllCachesSpy = vi
        .spyOn(cacheService as any, 'refreshAllCaches')
        .mockImplementation(() => {});

      refreshCallback = vi.fn();
      cacheService.onCacheRefreshNeeded(refreshCallback);
      cacheService.clearAllCaches();
      cacheService.cacheProjectFiles(projectId, files);
      refreshCallback.mockClear();
    });

    afterEach(() => {
      refreshAllCachesSpy.mockRestore();
    });

    it('should not refresh fresh cache during idle time', () => {
      mockIdleMonitor.simulateStateChange('idle');
      expect(refreshCallback).not.toHaveBeenCalled();

      expect(refreshAllCachesSpy).toHaveBeenCalled();
    });

    it('should refresh stale cache during browser idle time', () => {
      refreshAllCachesSpy.mockRestore();

      const refreshCachesSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(
        cacheService as any,
        'refreshCaches'
      );

      advanceTime(6 * 60 * 1000);

      idleCallbackManager.simulateIdlePeriod(2000);

      expect(refreshCachesSpy).toHaveBeenCalled();
      expect(refreshCallback).toHaveBeenCalledWith(projectId);

      refreshCachesSpy.mockRestore();
    });

    it('should not refresh when insufficient idle time', () => {
      refreshAllCachesSpy.mockRestore();

      advanceTime(6 * 60 * 1000);

      idleCallbackManager.simulateIdlePeriod(500);

      expect(refreshCallback).not.toHaveBeenCalled();
    });

    it('should refresh on timeout even with insufficient idle time', () => {
      refreshAllCachesSpy.mockRestore();

      advanceTime(6 * 60 * 1000);

      idleCallbackManager.simulateIdlePeriod(500, true);

      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });

    it('should handle transition between idle states', () => {
      refreshAllCachesSpy.mockRestore();

      advanceTime(6 * 60 * 1000);

      mockIdleMonitor.simulateStateChange('idle');
      expect(refreshCallback).toHaveBeenCalledWith(projectId);

      refreshCallback.mockClear();
      mockIdleMonitor.simulateStateChange('active');
      expect(refreshCallback).not.toHaveBeenCalled();

      mockIdleMonitor.simulateStateChange('locked');
      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });

    it('should not refresh when idle refresh is disabled', () => {
      refreshAllCachesSpy.mockRestore();

      advanceTime(6 * 60 * 1000);

      cacheService.setIdleRefreshEnabled(false);
      mockIdleMonitor.simulateStateChange('idle');

      expect(refreshCallback).not.toHaveBeenCalled();
    });

    it('should handle refresh callback errors gracefully', () => {
      refreshAllCachesSpy.mockRestore();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const successCallback = vi.fn();

      cacheService.onCacheRefreshNeeded(errorCallback);
      cacheService.onCacheRefreshNeeded(successCallback);

      advanceTime(6 * 60 * 1000);

      mockIdleMonitor.simulateStateChange('idle');

      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('callback management', () => {
    it('should add and remove refresh callbacks', () => {
      const refreshAllCachesSpy = vi
        .spyOn(cacheService as any, 'refreshAllCaches')
        .mockImplementation(() => {});

      const callback = vi.fn();
      cacheService.onCacheRefreshNeeded(callback);
      cacheService.cacheProjectFiles('test', new Map());

      advanceTime(6 * 60 * 1000);

      refreshAllCachesSpy.mockRestore();

      mockIdleMonitor.simulateStateChange('idle');
      expect(callback).toHaveBeenCalled();

      callback.mockClear();
      cacheService.removeRefreshCallback(callback);
      mockIdleMonitor.simulateStateChange('idle');
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
