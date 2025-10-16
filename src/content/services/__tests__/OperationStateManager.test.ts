import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationStateManager } from '../OperationStateManager';

describe('OperationStateManager', () => {
  let manager: OperationStateManager;
  let mockChrome: typeof chrome;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00.000Z') });

    const storageChangeListener = vi.fn();
    mockChrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
        onChanged: {
          addListener: storageChangeListener,
          removeListener: vi.fn(),
          hasListener: vi.fn().mockReturnValue(false),
        },
      },
    } as unknown as typeof chrome;

    vi.stubGlobal('chrome', mockChrome);

    (OperationStateManager as unknown as { instance: OperationStateManager | null }).instance =
      null;
    manager = OperationStateManager.getInstance();
  });

  afterEach(async () => {
    await manager.cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('Singleton Pattern', () => {
    it('returns the same instance across multiple calls', () => {
      const instance1 = OperationStateManager.getInstance();
      const instance2 = OperationStateManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Operation Lifecycle', () => {
    it('starts an operation successfully', async () => {
      await manager.startOperation('push', 'op-1', 'Test push');

      expect(manager.isOperationOngoing('op-1')).toBe(true);

      const operations = manager.getOngoingOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0].id).toBe('op-1');
      expect(operations[0].type).toBe('push');
      expect(operations[0].description).toBe('Test push');
    });

    it('includes metadata when starting an operation', async () => {
      const metadata = { repo: 'test/repo', branch: 'main' };
      await manager.startOperation('push', 'op-1', 'Test push', metadata);

      const operations = manager.getOngoingOperations();
      expect(operations[0].metadata).toEqual(metadata);
    });

    it('completes an operation successfully', async () => {
      await manager.startOperation('push', 'op-1');
      await manager.completeOperation('op-1');

      expect(manager.isOperationOngoing('op-1')).toBe(false);
      expect(manager.getOngoingOperations()).toHaveLength(0);
    });

    it('marks an operation as failed', async () => {
      const error = new Error('Test error');
      await manager.startOperation('push', 'op-1');
      await manager.failOperation('op-1', error);

      expect(manager.isOperationOngoing('op-1')).toBe(false);
      expect(manager.getOngoingOperations()).toHaveLength(0);
    });

    it('handles completing a non-existent operation gracefully', async () => {
      await manager.completeOperation('non-existent');

      expect(manager.getOngoingOperations()).toHaveLength(0);
    });

    it('handles failing a non-existent operation gracefully', async () => {
      await manager.failOperation('non-existent');

      expect(manager.getOngoingOperations()).toHaveLength(0);
    });
  });

  describe('Operation Types', () => {
    it('tracks push operations', async () => {
      await manager.startOperation('push', 'push-1');

      expect(manager.hasOngoingOperations(['push'])).toBe(true);
      expect(manager.hasOngoingOperations(['import'])).toBe(false);
    });

    it('tracks import operations', async () => {
      await manager.startOperation('import', 'import-1');

      expect(manager.hasOngoingOperations(['import'])).toBe(true);
      expect(manager.hasOngoingOperations(['push'])).toBe(false);
    });

    it('tracks clone operations', async () => {
      await manager.startOperation('clone', 'clone-1');

      expect(manager.hasOngoingOperations(['clone'])).toBe(true);
    });

    it('tracks sync operations', async () => {
      await manager.startOperation('sync', 'sync-1');

      expect(manager.hasOngoingOperations(['sync'])).toBe(true);
    });

    it('tracks comparison operations', async () => {
      await manager.startOperation('comparison', 'comp-1');

      expect(manager.hasOngoingOperations(['comparison'])).toBe(true);
    });

    it('tracks auth operations', async () => {
      await manager.startOperation('auth', 'auth-1');

      expect(manager.hasOngoingOperations(['auth'])).toBe(true);
    });

    it('tracks api operations', async () => {
      await manager.startOperation('api', 'api-1');

      expect(manager.hasOngoingOperations(['api'])).toBe(true);
    });

    it('tracks multiple operation types', async () => {
      await manager.startOperation('push', 'push-1');
      await manager.startOperation('import', 'import-1');
      await manager.startOperation('clone', 'clone-1');

      expect(manager.hasOngoingOperations(['push', 'import'])).toBe(true);
      expect(manager.hasOngoingOperations(['push'])).toBe(true);
      expect(manager.hasOngoingOperations(['sync'])).toBe(false);

      const operations = manager.getOngoingOperations();
      expect(operations).toHaveLength(3);
    });
  });

  describe('Operation Queries', () => {
    beforeEach(async () => {
      await manager.startOperation('push', 'push-1');
      await manager.startOperation('push', 'push-2');
      await manager.startOperation('import', 'import-1');
      await manager.startOperation('clone', 'clone-1');
    });

    it('checks if any operations are ongoing', () => {
      expect(manager.hasOngoingOperations()).toBe(true);
    });

    it('checks for specific operation types', () => {
      expect(manager.hasOngoingOperations(['push'])).toBe(true);
      expect(manager.hasOngoingOperations(['import'])).toBe(true);
      expect(manager.hasOngoingOperations(['sync'])).toBe(false);
    });

    it('checks for multiple operation types', () => {
      expect(manager.hasOngoingOperations(['push', 'import'])).toBe(true);
      expect(manager.hasOngoingOperations(['sync', 'comparison'])).toBe(false);
    });

    it('gets all ongoing operations', () => {
      const operations = manager.getOngoingOperations();

      expect(operations).toHaveLength(4);
      expect(operations.map((op) => op.id)).toEqual(
        expect.arrayContaining(['push-1', 'push-2', 'import-1', 'clone-1'])
      );
    });

    it('gets operations by type', () => {
      const pushOps = manager.getOngoingOperationsByType(['push']);
      const importOps = manager.getOngoingOperationsByType(['import']);
      const syncOps = manager.getOngoingOperationsByType(['sync']);

      expect(pushOps).toHaveLength(2);
      expect(importOps).toHaveLength(1);
      expect(syncOps).toHaveLength(0);

      expect(pushOps.map((op) => op.id)).toEqual(expect.arrayContaining(['push-1', 'push-2']));
      expect(importOps[0].id).toBe('import-1');
    });

    it('gets operations by multiple types', () => {
      const ops = manager.getOngoingOperationsByType(['push', 'clone']);

      expect(ops).toHaveLength(3);
      expect(ops.map((op) => op.id)).toEqual(
        expect.arrayContaining(['push-1', 'push-2', 'clone-1'])
      );
    });

    it('checks if specific operation is ongoing', () => {
      expect(manager.isOperationOngoing('push-1')).toBe(true);
      expect(manager.isOperationOngoing('import-1')).toBe(true);
      expect(manager.isOperationOngoing('non-existent')).toBe(false);
    });

    it('returns empty array when no operations match type', () => {
      const ops = manager.getOngoingOperationsByType(['sync', 'comparison']);

      expect(ops).toEqual([]);
    });
  });

  describe('Operation Timeout', () => {
    it('auto-completes operation after timeout', async () => {
      await manager.startOperation('push', 'op-1');

      expect(manager.isOperationOngoing('op-1')).toBe(true);

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(manager.isOperationOngoing('op-1')).toBe(false);
    });

    it('does not timeout if operation completes before timeout', async () => {
      await manager.startOperation('push', 'op-1');
      await manager.completeOperation('op-1');

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(manager.isOperationOngoing('op-1')).toBe(false);
    });

    it('clears timeout when operation fails', async () => {
      await manager.startOperation('push', 'op-1');
      await manager.failOperation('op-1');

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(manager.isOperationOngoing('op-1')).toBe(false);
    });

    it('handles multiple operations with different timeouts', async () => {
      await manager.startOperation('push', 'op-1');

      vi.advanceTimersByTime(2 * 60 * 1000);

      await manager.startOperation('push', 'op-2');

      vi.advanceTimersByTime(3 * 60 * 1000);

      expect(manager.isOperationOngoing('op-1')).toBe(false);
      expect(manager.isOperationOngoing('op-2')).toBe(true);
    });
  });

  describe('Event Listeners', () => {
    it('triggers operationStarted event', async () => {
      const listener = vi.fn();
      manager.addEventListener('operationStarted', listener);

      const operation = {
        type: 'push' as const,
        id: 'op-1',
        description: 'Test',
        metadata: { test: true },
      };
      await manager.startOperation(
        operation.type,
        operation.id,
        operation.description,
        operation.metadata
      );

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: operation.type,
          id: operation.id,
          description: operation.description,
          metadata: operation.metadata,
        })
      );
    });

    it('triggers operationCompleted event', async () => {
      const listener = vi.fn();
      manager.addEventListener('operationCompleted', listener);

      await manager.startOperation('push', 'op-1');
      await manager.completeOperation('op-1');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('op-1');
    });

    it('triggers operationFailed event', async () => {
      const listener = vi.fn();
      const error = new Error('Test error');
      manager.addEventListener('operationFailed', listener);

      await manager.startOperation('push', 'op-1');
      await manager.failOperation('op-1', error);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('op-1', error);
    });

    it('removes event listener', async () => {
      const listener = vi.fn();
      manager.addEventListener('operationStarted', listener);
      manager.removeEventListener('operationStarted');

      await manager.startOperation('push', 'op-1');

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not trigger events for non-existent operations', async () => {
      const completedListener = vi.fn();
      const failedListener = vi.fn();
      manager.addEventListener('operationCompleted', completedListener);
      manager.addEventListener('operationFailed', failedListener);

      await manager.completeOperation('non-existent');
      await manager.failOperation('non-existent');

      expect(completedListener).not.toHaveBeenCalled();
      expect(failedListener).not.toHaveBeenCalled();
    });
  });

  describe('Cross-Context Storage Synchronization', () => {
    it('saves state to storage when operation starts', async () => {
      await manager.startOperation('push', 'op-1', 'Test');

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          operationState: expect.objectContaining({
            operations: expect.arrayContaining([
              expect.objectContaining({
                type: 'push',
                id: 'op-1',
                description: 'Test',
              }),
            ]),
          }),
        })
      );
    });

    it('saves state to storage when operation completes', async () => {
      await manager.startOperation('push', 'op-1');
      vi.clearAllMocks();

      await manager.completeOperation('op-1');

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          operationState: expect.objectContaining({
            operations: [],
          }),
        })
      );
    });

    it('saves state to storage when operation fails', async () => {
      await manager.startOperation('push', 'op-1');
      vi.clearAllMocks();

      await manager.failOperation('op-1');

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          operationState: expect.objectContaining({
            operations: [],
          }),
        })
      );
    });

    it('loads initial state from storage', async () => {
      const storedState = {
        operationState: {
          operations: [
            {
              type: 'push' as const,
              id: 'stored-op',
              startTime: Date.now(),
              description: 'Stored operation',
            },
          ],
          lastUpdated: Date.now(),
          context: 'content',
        },
      };

      mockChrome.storage.local.get = vi.fn().mockResolvedValue(storedState);

      const newManager = OperationStateManager.getInstance();
      await newManager.forceRefreshFromStorage();

      expect(newManager.isOperationOngoing('stored-op')).toBe(true);

      await newManager.cleanup();
    });

    it('handles storage errors gracefully when saving', async () => {
      mockChrome.storage.local.set = vi.fn().mockRejectedValue(new Error('Storage error'));

      await expect(manager.startOperation('push', 'op-1')).resolves.not.toThrow();

      expect(manager.isOperationOngoing('op-1')).toBe(true);
    });

    it('handles storage errors gracefully when loading', async () => {
      mockChrome.storage.local.get = vi.fn().mockRejectedValue(new Error('Storage error'));

      await expect(manager.forceRefreshFromStorage()).resolves.not.toThrow();
    });

    it('handles invalid storage data gracefully', async () => {
      const invalidData = { operationState: 'invalid' };
      mockChrome.storage.local.get = vi.fn().mockResolvedValue(invalidData);

      await expect(manager.forceRefreshFromStorage()).resolves.not.toThrow();
    });

    it('handles missing operations array in storage data', async () => {
      const invalidData = { operationState: { context: 'test' } };
      mockChrome.storage.local.get = vi.fn().mockResolvedValue(invalidData);

      await expect(manager.forceRefreshFromStorage()).resolves.not.toThrow();
    });
  });

  describe('Storage Sync with Timeouts', () => {
    it('sets up timeout for synced operations', async () => {
      const storedState = {
        operationState: {
          operations: [
            {
              type: 'push' as const,
              id: 'synced-op',
              startTime: Date.now(),
            },
          ],
        },
      };

      mockChrome.storage.local.get = vi.fn().mockResolvedValue(storedState);

      const newManager = OperationStateManager.getInstance();
      await newManager.forceRefreshFromStorage();

      expect(newManager.isOperationOngoing('synced-op')).toBe(true);

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(newManager.isOperationOngoing('synced-op')).toBe(false);

      await newManager.cleanup();
    });

    it('auto-completes already timed-out operations from storage', async () => {
      const oldTimestamp = Date.now() - 10 * 60 * 1000;
      const storedState = {
        operationState: {
          operations: [
            {
              type: 'push' as const,
              id: 'old-op',
              startTime: oldTimestamp,
            },
          ],
        },
      };

      mockChrome.storage.local.get = vi.fn().mockResolvedValue(storedState);

      const newManager = OperationStateManager.getInstance();
      await newManager.forceRefreshFromStorage();

      expect(newManager.isOperationOngoing('old-op')).toBe(false);

      await newManager.cleanup();
    });
  });

  describe('Debug Information', () => {
    it('provides debug info', async () => {
      await manager.startOperation('push', 'op-1', 'Test operation', { repo: 'test/repo' });

      const debugInfo = manager.getDebugInfo();

      expect(debugInfo).toMatchObject({
        context: expect.any(String),
        operationsCount: 1,
        operations: expect.arrayContaining([
          expect.objectContaining({
            type: 'push',
            id: 'op-1',
            description: 'Test operation',
            durationMs: expect.any(Number),
            startTime: expect.any(String),
          }),
        ]),
        timeouts: 1,
      });
    });

    it('includes operation duration in debug info', async () => {
      await manager.startOperation('push', 'op-1');

      vi.advanceTimersByTime(1000);

      const debugInfo = manager.getDebugInfo() as {
        operations: Array<{ durationMs: number }>;
      };
      const operation = debugInfo.operations[0];

      expect(operation.durationMs).toBeGreaterThanOrEqual(1000);
    });

    it('formats startTime as ISO string in debug info', async () => {
      await manager.startOperation('push', 'op-1');

      const debugInfo = manager.getDebugInfo() as {
        operations: Array<{ startTime: string }>;
      };
      const operation = debugInfo.operations[0];

      expect(operation.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Cleanup', () => {
    it('clears all operations on cleanup', async () => {
      await manager.startOperation('push', 'op-1');
      await manager.startOperation('import', 'op-2');

      await manager.cleanup();

      expect(manager.getOngoingOperations()).toHaveLength(0);
    });

    it('removes all listeners on cleanup', async () => {
      const listener = vi.fn();
      manager.addEventListener('operationStarted', listener);

      await manager.cleanup();
      await manager.startOperation('push', 'op-1');

      expect(listener).not.toHaveBeenCalled();
    });

    it('clears storage on cleanup', async () => {
      await manager.cleanup();

      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith(['operationState']);
    });

    it('handles storage errors during cleanup gracefully', async () => {
      mockChrome.storage.local.remove = vi.fn().mockRejectedValue(new Error('Storage error'));

      await expect(manager.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Clear All Operations', () => {
    it('force clears all operations', async () => {
      await manager.startOperation('push', 'op-1');
      await manager.startOperation('import', 'op-2');

      await manager.clearAllOperations();

      expect(manager.getOngoingOperations()).toHaveLength(0);
    });

    it('clears storage when clearing operations', async () => {
      await manager.clearAllOperations();

      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith(['operationState']);
    });
  });

  describe('Edge Cases', () => {
    it('handles starting same operation ID twice', async () => {
      await manager.startOperation('push', 'op-1', 'First');
      await manager.startOperation('push', 'op-1', 'Second');

      const operations = manager.getOngoingOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0].description).toBe('Second');
    });

    it('handles empty operations array', () => {
      expect(manager.hasOngoingOperations()).toBe(false);
      expect(manager.getOngoingOperations()).toEqual([]);
      expect(manager.getOngoingOperationsByType(['push'])).toEqual([]);
    });

    it('handles undefined description and metadata', async () => {
      await manager.startOperation('push', 'op-1');

      const operations = manager.getOngoingOperations();
      expect(operations[0].description).toBeUndefined();
      expect(operations[0].metadata).toBeUndefined();
    });

    it('handles error without message', async () => {
      const errorListener = vi.fn();
      manager.addEventListener('operationFailed', errorListener);

      await manager.startOperation('push', 'op-1');
      await manager.failOperation('op-1', undefined);

      expect(errorListener).toHaveBeenCalledWith('op-1', undefined);
    });

    it('handles rapid operation start and complete cycles', async () => {
      for (let i = 0; i < 10; i++) {
        await manager.startOperation('push', `op-${i}`);
        await manager.completeOperation(`op-${i}`);
      }

      expect(manager.getOngoingOperations()).toHaveLength(0);
    });

    it('handles concurrent operations', async () => {
      await Promise.all([
        manager.startOperation('push', 'op-1'),
        manager.startOperation('import', 'op-2'),
        manager.startOperation('clone', 'op-3'),
      ]);

      expect(manager.getOngoingOperations()).toHaveLength(3);

      await Promise.all([
        manager.completeOperation('op-1'),
        manager.completeOperation('op-2'),
        manager.completeOperation('op-3'),
      ]);

      expect(manager.getOngoingOperations()).toHaveLength(0);
    });
  });

  describe('Context Detection', () => {
    it('detects context during initialization', () => {
      const debugInfo = manager.getDebugInfo();

      expect(debugInfo).toHaveProperty('context');
      expect(typeof (debugInfo as { context: string }).context).toBe('string');
    });

    it('includes context in storage data', async () => {
      await manager.startOperation('push', 'op-1');

      const setCall = vi.mocked(mockChrome.storage.local.set).mock.calls[0][0];

      expect(setCall).toHaveProperty('operationState.context');
    });
  });

  describe('Integration Scenarios', () => {
    it('handles complete push workflow', async () => {
      const startedListener = vi.fn();
      const completedListener = vi.fn();

      manager.addEventListener('operationStarted', startedListener);
      manager.addEventListener('operationCompleted', completedListener);

      await manager.startOperation('push', 'push-123', 'Pushing to GitHub', {
        repo: 'test/repo',
        branch: 'main',
      });

      expect(manager.hasOngoingOperations(['push'])).toBe(true);
      expect(startedListener).toHaveBeenCalled();

      vi.advanceTimersByTime(2000);

      await manager.completeOperation('push-123');

      expect(manager.hasOngoingOperations()).toBe(false);
      expect(completedListener).toHaveBeenCalledWith('push-123');
    });

    it('handles failed import workflow', async () => {
      const failedListener = vi.fn();
      manager.addEventListener('operationFailed', failedListener);

      await manager.startOperation('import', 'import-456', 'Importing repository');

      expect(manager.hasOngoingOperations(['import'])).toBe(true);

      const error = new Error('Network error');
      await manager.failOperation('import-456', error);

      expect(manager.hasOngoingOperations()).toBe(false);
      expect(failedListener).toHaveBeenCalledWith('import-456', error);
    });

    it('handles multiple simultaneous operations of different types', async () => {
      await manager.startOperation('push', 'push-1', 'Push to repo A');
      await manager.startOperation('clone', 'clone-1', 'Clone repo B');
      await manager.startOperation('import', 'import-1', 'Import repo C');

      expect(manager.getOngoingOperations()).toHaveLength(3);
      expect(manager.hasOngoingOperations(['push'])).toBe(true);
      expect(manager.hasOngoingOperations(['clone'])).toBe(true);
      expect(manager.hasOngoingOperations(['import'])).toBe(true);

      await manager.completeOperation('clone-1');

      expect(manager.getOngoingOperations()).toHaveLength(2);
      expect(manager.hasOngoingOperations(['clone'])).toBe(false);
      expect(manager.hasOngoingOperations(['push', 'import'])).toBe(true);
    });

    it('syncs state across context boundary simulation', async () => {
      await manager.startOperation('push', 'sync-op-1');

      const storageData = vi.mocked(mockChrome.storage.local.set).mock.calls[0][0];

      const newManager = OperationStateManager.getInstance();

      mockChrome.storage.local.get = vi.fn().mockResolvedValue(storageData);
      await newManager.forceRefreshFromStorage();

      expect(newManager.isOperationOngoing('sync-op-1')).toBe(true);

      await newManager.cleanup();
    });
  });
});
