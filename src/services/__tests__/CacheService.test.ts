import type { Mock, MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from '../CacheService';
import type { IIdleMonitorService } from '../interfaces/IIdleMonitorService';

const FIXED_TIME = 1000000;

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

interface MockWindow {
  requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback: (id: number) => void;
}

describe('CacheService', () => {
  let mockIdleMonitor: MockIdleMonitor;
  let idleCallbackManager: ControlledIdleCallbackManager;
  let cacheService: CacheService;
  let mockWindow: MockWindow;
  let mockDate: ReturnType<typeof vi.spyOn>;
  let currentTime: number;

  beforeEach(() => {
    currentTime = FIXED_TIME;
    mockDate = vi
      .spyOn(Date, 'now')
      .mockImplementation(() => currentTime) as unknown as MockInstance;

    mockIdleMonitor = new MockIdleMonitor();
    idleCallbackManager = new ControlledIdleCallbackManager();

    mockWindow = {
      requestIdleCallback: idleCallbackManager.requestIdleCallback,
      cancelIdleCallback: idleCallbackManager.cancelIdleCallback,
    };

    CacheService.resetInstance();

    cacheService = CacheService.getInstance(mockIdleMonitor, mockWindow as unknown as Window);
  });

  afterEach(() => {
    mockDate.mockRestore();
    vi.clearAllMocks();
  });

  const advanceTime = (ms: number) => {
    currentTime += ms;
  };

  describe('initialization', () => {
    it('should set up idle detection on initialization', () => {
      expect(mockIdleMonitor.addListener).toHaveBeenCalled();
      expect(idleCallbackManager.requestIdleCallback).toHaveBeenCalled();
    });

    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = CacheService.getInstance(mockIdleMonitor, mockWindow as unknown as Window);
      const instance2 = CacheService.getInstance(mockIdleMonitor, mockWindow as unknown as Window);
      expect(instance1).toBe(instance2);
    });
  });

  describe('caching operations', () => {
    const projectId = 'test-project';
    const files = new Map([
      ['test.txt', 'content'],
      ['app.js', 'console.log("hello")'],
    ]);

    it('should store and retrieve files from cache with correct data', () => {
      cacheService.cacheProjectFiles(projectId, files);
      const cached = cacheService.getCachedProjectFiles(projectId);

      expect(cached).not.toBeNull();
      expect(cached).toEqual(files);
      expect(cached?.size).toBe(2);
      expect(cached?.get('test.txt')).toBe('content');
      expect(cached?.get('app.js')).toBe('console.log("hello")');
    });

    it('should return null for non-existent cache', () => {
      const cached = cacheService.getCachedProjectFiles('non-existent');
      expect(cached).toBeNull();
    });

    it('should return null for stale cache after max age exceeded', () => {
      cacheService.cacheProjectFiles(projectId, files);

      const cachedBeforeStale = cacheService.getCachedProjectFiles(projectId);
      expect(cachedBeforeStale).not.toBeNull();

      advanceTime(6 * 60 * 1000);

      const cachedAfterStale = cacheService.getCachedProjectFiles(projectId);
      expect(cachedAfterStale).toBeNull();
    });

    it('should respect custom max cache age', () => {
      const customMaxAge = 2 * 60 * 1000;
      cacheService.setMaxCacheAge(customMaxAge);
      cacheService.cacheProjectFiles(projectId, files);

      advanceTime(customMaxAge - 1000);
      expect(cacheService.getCachedProjectFiles(projectId)).not.toBeNull();

      advanceTime(1001);
      expect(cacheService.getCachedProjectFiles(projectId)).toBeNull();
    });

    it('should invalidate specific cache without affecting others', () => {
      const otherProjectId = 'other-project';
      const otherFiles = new Map([['other.txt', 'other content']]);

      cacheService.cacheProjectFiles(projectId, files);
      cacheService.cacheProjectFiles(otherProjectId, otherFiles);

      cacheService.invalidateCache(projectId);

      expect(cacheService.getCachedProjectFiles(projectId)).toBeNull();
      expect(cacheService.getCachedProjectFiles(otherProjectId)).toEqual(otherFiles);
    });

    it('should clear all caches at once', () => {
      cacheService.cacheProjectFiles(projectId, files);
      cacheService.cacheProjectFiles('other-project', files);
      cacheService.cacheProjectFiles('third-project', files);

      cacheService.clearAllCaches();

      expect(cacheService.getCachedProjectFiles(projectId)).toBeNull();
      expect(cacheService.getCachedProjectFiles('other-project')).toBeNull();
      expect(cacheService.getCachedProjectFiles('third-project')).toBeNull();
    });

    it('should handle multiple files with different content', () => {
      const multipleFiles = new Map([
        ['index.html', '<html></html>'],
        ['style.css', 'body { margin: 0; }'],
        ['script.js', 'alert("test");'],
        ['data.json', '{"key":"value"}'],
      ]);

      cacheService.cacheProjectFiles(projectId, multipleFiles);
      const cached = cacheService.getCachedProjectFiles(projectId);

      expect(cached?.size).toBe(4);
      expect(cached?.get('index.html')).toBe('<html></html>');
      expect(cached?.get('style.css')).toBe('body { margin: 0; }');
      expect(cached?.get('script.js')).toBe('alert("test");');
      expect(cached?.get('data.json')).toBe('{"key":"value"}');
    });

    it('should handle empty file maps', () => {
      const emptyFiles = new Map();
      cacheService.cacheProjectFiles(projectId, emptyFiles);

      const cached = cacheService.getCachedProjectFiles(projectId);
      expect(cached).not.toBeNull();
      expect(cached?.size).toBe(0);
    });
  });

  describe('idle refresh behavior', () => {
    const projectId = 'test-project';
    const files = new Map([['test.txt', 'content']]);
    let refreshCallback: Mock;

    beforeEach(() => {
      refreshCallback = vi.fn();
      cacheService.onCacheRefreshNeeded(refreshCallback);
      cacheService.clearAllCaches();
      cacheService.cacheProjectFiles(projectId, files);
      refreshCallback.mockClear();
    });

    it('should not trigger refresh callbacks for fresh cache during user idle', () => {
      mockIdleMonitor.simulateStateChange('idle');

      expect(refreshCallback).toHaveBeenCalledTimes(1);
      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });

    it('should trigger refresh callbacks for stale cache during browser idle time', () => {
      advanceTime(6 * 60 * 1000);

      idleCallbackManager.simulateIdlePeriod(2000);

      expect(refreshCallback).toHaveBeenCalledTimes(1);
      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });

    it('should not trigger refresh callbacks when insufficient idle time available', () => {
      advanceTime(6 * 60 * 1000);

      idleCallbackManager.simulateIdlePeriod(500);

      expect(refreshCallback).not.toHaveBeenCalled();
    });

    it('should trigger refresh on timeout even with insufficient idle time', () => {
      advanceTime(6 * 60 * 1000);

      idleCallbackManager.simulateIdlePeriod(500, true);

      expect(refreshCallback).toHaveBeenCalledTimes(1);
      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });

    it('should trigger refresh callbacks when user becomes idle', () => {
      advanceTime(6 * 60 * 1000);

      mockIdleMonitor.simulateStateChange('idle');

      expect(refreshCallback).toHaveBeenCalledTimes(1);
      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });

    it('should trigger refresh callbacks when user locks screen', () => {
      advanceTime(6 * 60 * 1000);

      mockIdleMonitor.simulateStateChange('locked');

      expect(refreshCallback).toHaveBeenCalledTimes(1);
      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });

    it('should not trigger refresh callbacks when user becomes active', () => {
      advanceTime(6 * 60 * 1000);

      mockIdleMonitor.simulateStateChange('active');

      expect(refreshCallback).not.toHaveBeenCalled();
    });

    it('should not trigger refresh callbacks when idle refresh is disabled', () => {
      advanceTime(6 * 60 * 1000);

      cacheService.setIdleRefreshEnabled(false);
      mockIdleMonitor.simulateStateChange('idle');

      expect(refreshCallback).not.toHaveBeenCalled();
    });

    it('should continue executing remaining callbacks when one callback throws error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const successCallback1 = vi.fn();
      const successCallback2 = vi.fn();

      cacheService.onCacheRefreshNeeded(errorCallback);
      cacheService.onCacheRefreshNeeded(successCallback1);
      cacheService.onCacheRefreshNeeded(successCallback2);

      advanceTime(6 * 60 * 1000);
      mockIdleMonitor.simulateStateChange('idle');

      expect(errorCallback).toHaveBeenCalledWith(projectId);
      expect(successCallback1).toHaveBeenCalledWith(projectId);
      expect(successCallback2).toHaveBeenCalledWith(projectId);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should trigger refresh callbacks for all cached projects during user idle', () => {
      const project2 = 'project-2';
      const project3 = 'project-3';

      cacheService.cacheProjectFiles(project2, new Map([['file2.txt', 'content2']]));
      cacheService.cacheProjectFiles(project3, new Map([['file3.txt', 'content3']]));

      refreshCallback.mockClear();

      mockIdleMonitor.simulateStateChange('idle');

      expect(refreshCallback).toHaveBeenCalledTimes(3);
      expect(refreshCallback).toHaveBeenCalledWith(projectId);
      expect(refreshCallback).toHaveBeenCalledWith(project2);
      expect(refreshCallback).toHaveBeenCalledWith(project3);
    });

    it('should only trigger refresh for stale caches during browser idle', () => {
      advanceTime(6 * 60 * 1000);

      const freshProject = 'fresh-project';
      cacheService.cacheProjectFiles(freshProject, new Map([['fresh.txt', 'content']]));

      refreshCallback.mockClear();

      idleCallbackManager.simulateIdlePeriod(2000);

      expect(refreshCallback).toHaveBeenCalledTimes(1);
      expect(refreshCallback).toHaveBeenCalledWith(projectId);
      expect(refreshCallback).not.toHaveBeenCalledWith(freshProject);
    });

    it('should re-enable idle refresh after being disabled', () => {
      cacheService.setIdleRefreshEnabled(false);
      cacheService.setIdleRefreshEnabled(true);

      advanceTime(6 * 60 * 1000);
      mockIdleMonitor.simulateStateChange('idle');

      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });
  });

  describe('callback management', () => {
    it('should register and execute refresh callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      cacheService.onCacheRefreshNeeded(callback1);
      cacheService.onCacheRefreshNeeded(callback2);

      cacheService.cacheProjectFiles('test', new Map());
      advanceTime(6 * 60 * 1000);

      mockIdleMonitor.simulateStateChange('idle');

      expect(callback1).toHaveBeenCalledWith('test');
      expect(callback2).toHaveBeenCalledWith('test');
    });

    it('should not execute callbacks after they are removed', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      cacheService.onCacheRefreshNeeded(callback1);
      cacheService.onCacheRefreshNeeded(callback2);

      cacheService.cacheProjectFiles('test', new Map());
      advanceTime(6 * 60 * 1000);

      cacheService.removeRefreshCallback(callback1);

      mockIdleMonitor.simulateStateChange('idle');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith('test');
    });

    it('should handle removing non-existent callback gracefully', () => {
      const callback = vi.fn();

      cacheService.removeRefreshCallback(callback);

      cacheService.cacheProjectFiles('test', new Map());
      advanceTime(6 * 60 * 1000);
      mockIdleMonitor.simulateStateChange('idle');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should execute multiple callbacks in order of registration', () => {
      const executionOrder: number[] = [];
      const callback1 = vi.fn(() => executionOrder.push(1));
      const callback2 = vi.fn(() => executionOrder.push(2));
      const callback3 = vi.fn(() => executionOrder.push(3));

      cacheService.onCacheRefreshNeeded(callback1);
      cacheService.onCacheRefreshNeeded(callback2);
      cacheService.onCacheRefreshNeeded(callback3);

      cacheService.cacheProjectFiles('test', new Map());
      advanceTime(6 * 60 * 1000);

      mockIdleMonitor.simulateStateChange('idle');

      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });
});
