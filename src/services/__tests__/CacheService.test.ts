import { CacheService } from '../CacheService';
import type { IIdleMonitorService } from '../interfaces/IIdleMonitorService';
import { expect, jest, describe, it, beforeEach, afterEach } from '@jest/globals';

/**
 * Mock implementation of IIdleMonitorService that maintains internal state
 */
class MockIdleMonitor implements IIdleMonitorService {
  private currentState: chrome.idle.IdleState = 'active';
  private listeners: Array<(state: chrome.idle.IdleState) => void> = [];

  getCurrentState = jest.fn((): chrome.idle.IdleState => this.currentState);
  isIdle = jest.fn((): boolean => this.currentState === 'idle' || this.currentState === 'locked');

  addListener = jest.fn((callback: (state: chrome.idle.IdleState) => void) => {
    this.listeners.push(callback);
  });

  removeListener = jest.fn((callback: (state: chrome.idle.IdleState) => void) => {
    this.listeners = this.listeners.filter((l) => l !== callback);
  });

  // Helper method to simulate state changes
  simulateStateChange(newState: chrome.idle.IdleState) {
    this.currentState = newState;
    this.listeners.forEach((listener) => listener(newState));
  }
}

/**
 * Controlled implementation of window.requestIdleCallback
 * that doesn't cause infinite loops with Jest timers
 */
class ControlledIdleCallbackManager {
  private idCounter = 1;
  private activeCallbacks = new Map<number, IdleRequestCallback>();

  requestIdleCallback = jest.fn(
    (callback: IdleRequestCallback, options?: IdleRequestOptions): number => {
      const id = this.idCounter++;
      this.activeCallbacks.set(id, callback);
      return id;
    }
  );

  cancelIdleCallback = jest.fn((id: number): void => {
    this.activeCallbacks.delete(id);
  });

  // Simulate an idle period and trigger registered callbacks
  simulateIdlePeriod(timeRemaining: number = 2000, didTimeout: boolean = false): void {
    // Make a copy of the callbacks to avoid modification during iteration
    const callbackEntries = Array.from(this.activeCallbacks.entries());

    // Clear the callbacks first to prevent re-registration issues
    this.activeCallbacks.clear();

    // Execute each callback with the specified idle parameters
    callbackEntries.forEach(([id, callback]) => {
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
  let mockDate: ReturnType<typeof jest.spyOn>;
  let fakeNow: number;
  let originalRefreshAllCaches: any;

  beforeEach(() => {
    // Set up a controlled current time
    fakeNow = 1000000;
    mockDate = jest.spyOn(Date, 'now').mockImplementation(() => fakeNow);

    // Create mock services
    mockIdleMonitor = new MockIdleMonitor();
    idleCallbackManager = new ControlledIdleCallbackManager();

    // Create mock window
    mockWindow = {
      requestIdleCallback: idleCallbackManager.requestIdleCallback,
      cancelIdleCallback: idleCallbackManager.cancelIdleCallback,
    };

    // Reset singleton instance
    CacheService.resetInstance();

    // Create a new instance with mocks
    cacheService = CacheService.getInstance(mockIdleMonitor, mockWindow);

    // Store original method for restoration
    originalRefreshAllCaches = (cacheService as any).refreshAllCaches;
  });

  afterEach(() => {
    // Restore original methods
    if (originalRefreshAllCaches) {
      (cacheService as any).refreshAllCaches = originalRefreshAllCaches;
    }

    mockDate.mockRestore();
    jest.clearAllMocks();
  });

  // Helper function to advance time
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

      // Advance time by 6 minutes (default max age is 5 minutes)
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
    let refreshCallback: jest.Mock;
    let refreshAllCachesSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
      // Mock the refreshAllCaches method to avoid auto-refreshing
      refreshAllCachesSpy = jest
        .spyOn(cacheService as any, 'refreshAllCaches')
        .mockImplementation(() => {});

      refreshCallback = jest.fn();
      cacheService.onCacheRefreshNeeded(refreshCallback);
      cacheService.clearAllCaches();
      cacheService.cacheProjectFiles(projectId, files);
      refreshCallback.mockClear();
    });

    afterEach(() => {
      refreshAllCachesSpy.mockRestore();
    });

    it('should not refresh fresh cache during idle time', () => {
      // Cache is still fresh, no time advancement
      mockIdleMonitor.simulateStateChange('idle');
      expect(refreshCallback).not.toHaveBeenCalled();

      // Verify that refreshAllCaches was called but our spy prevented actual refresh
      expect(refreshAllCachesSpy).toHaveBeenCalled();
    });

    it('should refresh stale cache during browser idle time', () => {
      // Restore original implementation for this test
      refreshAllCachesSpy.mockRestore();

      // Now manually spy on refreshCaches to verify it's called with correct args
      const refreshCachesSpy: ReturnType<typeof jest.spyOn> = jest.spyOn(
        cacheService as any,
        'refreshCaches'
      );

      // Advance time by 6 minutes to make cache stale
      advanceTime(6 * 60 * 1000);

      // Simulate browser idle period
      idleCallbackManager.simulateIdlePeriod(2000);

      expect(refreshCachesSpy).toHaveBeenCalled();
      expect(refreshCallback).toHaveBeenCalledWith(projectId);

      refreshCachesSpy.mockRestore();
    });

    it('should not refresh when insufficient idle time', () => {
      // Restore original implementation for this test
      refreshAllCachesSpy.mockRestore();

      // Advance time to make cache stale
      advanceTime(6 * 60 * 1000);

      // Simulate short idle period
      idleCallbackManager.simulateIdlePeriod(500); // Less than 1 second

      expect(refreshCallback).not.toHaveBeenCalled();
    });

    it('should refresh on timeout even with insufficient idle time', () => {
      // Restore original implementation for this test
      refreshAllCachesSpy.mockRestore();

      // Advance time to make cache stale
      advanceTime(6 * 60 * 1000);

      // Simulate timeout with short idle period
      idleCallbackManager.simulateIdlePeriod(500, true);

      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });

    it('should handle transition between idle states', () => {
      // Restore original implementation for this test
      refreshAllCachesSpy.mockRestore();

      // Advance time to make cache stale
      advanceTime(6 * 60 * 1000);

      // Simulate state transitions
      mockIdleMonitor.simulateStateChange('idle');
      expect(refreshCallback).toHaveBeenCalledWith(projectId);

      refreshCallback.mockClear();
      mockIdleMonitor.simulateStateChange('active');
      expect(refreshCallback).not.toHaveBeenCalled();

      mockIdleMonitor.simulateStateChange('locked');
      expect(refreshCallback).toHaveBeenCalledWith(projectId);
    });

    it('should not refresh when idle refresh is disabled', () => {
      // Restore original implementation for this test
      refreshAllCachesSpy.mockRestore();

      // Advance time to make cache stale
      advanceTime(6 * 60 * 1000);

      cacheService.setIdleRefreshEnabled(false);
      mockIdleMonitor.simulateStateChange('idle');

      expect(refreshCallback).not.toHaveBeenCalled();
    });

    it('should handle refresh callback errors gracefully', () => {
      // Restore original implementation for this test
      refreshAllCachesSpy.mockRestore();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const successCallback = jest.fn();

      cacheService.onCacheRefreshNeeded(errorCallback);
      cacheService.onCacheRefreshNeeded(successCallback);

      // Advance time to make cache stale
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
      // Mock the refreshAllCaches method to avoid auto-refreshing
      const refreshAllCachesSpy = jest
        .spyOn(cacheService as any, 'refreshAllCaches')
        .mockImplementation(() => {});

      const callback = jest.fn();
      cacheService.onCacheRefreshNeeded(callback);
      cacheService.cacheProjectFiles('test', new Map());

      // Advance time to make cache stale
      advanceTime(6 * 60 * 1000);

      // Restore original implementation for testing
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
