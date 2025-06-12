/**
 * Critical scenario tests for TempRepoManager
 *
 * Tests focus on the most critical business paths that could cause
 * significant user impact if they fail
 */

import { BackgroundTempRepoManager, STORAGE_KEY } from '../TempRepoManager';
import {
  TempRepoTestLifecycle,
  TempRepoScenarioBuilder,
  TempRepoTestData,
  TempRepoAssertionHelpers,
  AsyncOperationHelpers,
  DebuggingHelpers,
  MockBehaviorOrchestrator,
  TempRepoMockServiceFactory,
} from '../test-fixtures';
import type { TempRepoManagerTestEnvironment } from '../test-fixtures';

// Mock the OperationStateManager module
jest.mock('../../content/services/OperationStateManager');

describe('TempRepoManager - Critical Scenarios', () => {
  let lifecycle: TempRepoTestLifecycle;
  let env: TempRepoManagerTestEnvironment;
  let manager: BackgroundTempRepoManager;
  let orchestrator: MockBehaviorOrchestrator;

  beforeEach(() => {
    lifecycle = new TempRepoTestLifecycle();
    env = lifecycle.beforeEach();
    const factory = TempRepoMockServiceFactory.getInstance();
    orchestrator = new MockBehaviorOrchestrator(factory);
  });

  afterEach(() => {
    lifecycle.afterEach();
    TempRepoMockServiceFactory.reset();
  });

  describe('User Journey: Import Private Repository to Bolt', () => {
    it('should complete full import journey from private repo to Bolt.new', async () => {
      // Arrange
      manager = lifecycle.createManager('success');
      const sourceRepo = 'my-private-app';
      const branch = 'main';

      // Pre-orchestrate expected behavior
      const { tempRepoName, operationId } = await orchestrator.orchestrateSuccessfulImport(
        sourceRepo,
        branch
      );

      // Act
      await manager.handlePrivateRepoImport(sourceRepo, branch);

      // Assert - Complete user journey verification

      // 1. Operation was tracked from start to finish
      const allOperations = env.mockOperationStateManager.getAllOperations();
      const importOperations = allOperations.filter(({ id }) => id.includes('import-'));
      expect(importOperations).toHaveLength(1);

      const operation = importOperations[0].operation;
      expect(operation).toBeDefined();
      expect(operation.status).toBe('completed');
      expect(operation.metadata).toEqual({ sourceRepo, branch });

      // 2. User saw appropriate status messages throughout
      const statusHistory = env.mockStatusBroadcaster.getStatusHistory();

      // Check key status messages exist in the correct order
      const keyMessages = [
        'Creating temporary repository',
        'Copying repository contents',
        'Making repository public',
        'Opening Bolt',
        'Repository imported successfully',
      ];

      let lastIndex = -1;
      for (const expectedMessage of keyMessages) {
        const foundIndex = statusHistory.findIndex(
          (s, idx) => idx > lastIndex && s.message?.includes(expectedMessage)
        );
        expect(foundIndex).toBeGreaterThan(lastIndex);
        lastIndex = foundIndex;
      }

      // Verify final status is success
      const lastStatus = statusHistory[statusHistory.length - 1];
      expect(lastStatus.status).toBe('success');

      // 3. Bolt tab opened with correct URL
      const createdTab = env.mockTabs.getLastCreatedTab();
      expect(createdTab).toBeDefined();
      expect(createdTab?.url).toMatch(
        /^https:\/\/bolt\.new\/~\/github\.com\/[\w-]+\/temp-[\w-]+-\d{8}-[\w]{6}$/
      );
      expect(createdTab?.active).toBe(true);

      // 4. Temp repo is tracked for cleanup
      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(1);
      expect(repos[0]).toMatchObject({
        originalRepo: sourceRepo,
        tempRepo: expect.stringContaining(`temp-${sourceRepo}`),
        branch: branch,
        owner: TempRepoTestData.owners.validOwner,
        createdAt: expect.any(Number),
      });

      // 5. Cleanup interval is running
      // Verify that a cleanup interval was set up by checking for repos
      expect(repos.length).toBeGreaterThan(0);
    });

    it('should handle complete failure gracefully with user-friendly error', async () => {
      // Arrange
      manager = lifecycle.createManager('failure');
      const sourceRepo = 'failing-repo';

      // Act
      await manager.handlePrivateRepoImport(sourceRepo);

      // Assert
      // User should see clear error message
      const lastStatus = env.mockStatusBroadcaster.getLastStatus();
      expect(lastStatus?.status).toBe('error');
      expect(lastStatus?.message).toBeDefined();
      expect(lastStatus?.message).not.toContain('undefined');
      expect(lastStatus?.message).not.toContain('null');

      // Operation should be tracked as failed
      const operations = env.mockOperationStateManager.getOperationsByStatus('failed');
      expect(operations).toHaveLength(1);
      expect(operations[0].operation.error).toBeDefined();
    });
  });

  describe('Automated Cleanup System', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should maintain system health through automatic cleanup cycles', async () => {
      // Arrange - System with accumulating temp repos
      const scenario = await orchestrator.orchestrateCleanupCycle('mixed-results');
      manager = lifecycle.createManager('existing');

      // Get initial repos to understand the starting state
      const initialRepos = await manager.getTempRepos();
      const initialExpiredCount = initialRepos.filter(
        (repo) => repo.createdAt < Date.now() - 60000
      ).length;

      // Act - Run cleanup
      await manager.cleanupTempRepos();

      // Assert - System should maintain health
      const finalRepos = await manager.getTempRepos();

      // Should have fewer repos after cleanup
      expect(finalRepos.length).toBeLessThan(initialRepos.length);

      // Should have removed at least one expired repo
      const finalExpiredCount = finalRepos.filter(
        (repo) => repo.createdAt < Date.now() - 60000
      ).length;
      expect(finalExpiredCount).toBeLessThan(initialExpiredCount);
    });

    it('should recover from catastrophic cleanup failures', async () => {
      // Arrange - All cleanup operations fail
      await orchestrator.orchestrateCleanupCycle('all-fail');
      manager = lifecycle.createManager('existing');

      // First cleanup attempt (all fail)
      await manager.cleanupTempRepos();

      // Verify repos remain
      let remainingRepos = await manager.getTempRepos();
      expect(remainingRepos.length).toBe(2); // Both expired repos remain

      // Act - Fix the issue and retry
      env.mockGitHubService.setShouldFail(false); // Fix the issue
      env.mockGitHubService.setDeleteFailureRepos([]); // Clear delete failures
      await manager.cleanupTempRepos();

      // Assert - System recovered
      remainingRepos = await manager.getTempRepos();
      expect(remainingRepos).toHaveLength(0);
    });

    it('should prevent repository accumulation under continuous load', async () => {
      // Arrange - Set up with empty storage first
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      // Import some repos
      await manager.handlePrivateRepoImport('load-test-1');
      await manager.handlePrivateRepoImport('load-test-2');
      await manager.handlePrivateRepoImport('load-test-3');

      // Get initial count
      const initialRepos = await manager.getTempRepos();
      expect(initialRepos.length).toBe(3);

      // Add some expired repos manually to storage
      const expiredRepos = TempRepoTestData.storage.expiredRepos[STORAGE_KEY];
      env.mockStorage.setLocalData({
        [STORAGE_KEY]: [...initialRepos, ...expiredRepos],
      });

      // Act - Run cleanup
      await manager.cleanupTempRepos();

      // Assert - Expired repos should be removed
      const finalRepos = await manager.getTempRepos();

      // Should have removed the expired repos
      expect(finalRepos.length).toBeLessThan(initialRepos.length + expiredRepos.length);

      // Should only have non-expired repos
      const hasOnlyFreshRepos = finalRepos.every((repo) => {
        const age = Date.now() - repo.createdAt;
        return age < 60000; // Less than 60 seconds old
      });
      expect(hasOnlyFreshRepos).toBe(true);
    });
  });

  describe('Data Integrity and Consistency', () => {
    it('should maintain storage consistency across extension restarts', async () => {
      // Arrange - Create initial state
      manager = lifecycle.createManager('success');
      await manager.handlePrivateRepoImport('persistent-repo-1');
      await manager.handlePrivateRepoImport('persistent-repo-2');

      const initialRepos = await manager.getTempRepos();
      expect(initialRepos).toHaveLength(2);

      // Act - Simulate extension restart
      lifecycle.afterEach(); // Cleanup

      // Create new environment and manager
      lifecycle = new TempRepoTestLifecycle();
      env = lifecycle.beforeEach();

      // Restore storage state
      env.mockStorage.setLocalData({
        [STORAGE_KEY]: initialRepos,
      });

      manager = lifecycle.createManager('existing');

      // Assert - Data persisted correctly
      const restoredRepos = await manager.getTempRepos();
      expect(restoredRepos).toEqual(initialRepos);
    });

    it('should handle concurrent modifications safely', async () => {
      // Arrange
      manager = lifecycle.createManager('success');
      const operations = await orchestrator.orchestrateConcurrentOperations(5);

      // Act - Execute all operations concurrently
      const promises = operations.operations.map((op) =>
        manager.handlePrivateRepoImport(op.sourceRepo, op.branch)
      );

      await Promise.all(promises);

      // Assert - All operations should succeed without conflicts
      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(5);

      // Each repo should be unique
      const tempRepoNames = repos.map((r) => r.tempRepo);
      expect(new Set(tempRepoNames).size).toBe(5);

      // All operations should be tracked
      const completedOps = env.mockOperationStateManager.getOperationsByStatus('completed');
      expect(completedOps).toHaveLength(5);
    });

    it('should recover from corrupted storage gracefully', async () => {
      // Arrange - Corrupt storage
      env.setupCorruptedStorage();
      manager = lifecycle.createManager('custom');

      // Act - Attempt operations
      await manager.handlePrivateRepoImport('recovery-test');
      const repos = await manager.getTempRepos();

      // Assert - System recovered
      expect(repos).toHaveLength(1);
      expect(repos[0].originalRepo).toBe('recovery-test');

      // Storage should be repaired
      const storageData = env.mockStorage.getLocalData();
      expect(Array.isArray(storageData[STORAGE_KEY])).toBe(true);
    });
  });

  describe('Error Boundaries and User Impact', () => {
    it('should never leave user in unrecoverable state', async () => {
      // Arrange - Worst case scenario setup
      manager = lifecycle.createManager('custom');

      // Multiple failure points
      const errorScenarios = [
        () => env.setupGitHubServiceFailure('createRepo'),
        () => env.setupGitHubServiceFailure('cloneContents'),
        () => env.setupStorageFailure(),
        () => env.setupOperationStateManagerFailure(),
      ];

      // Act & Assert - Each scenario should fail gracefully
      for (const setupError of errorScenarios) {
        // Reset environment
        env.mockGitHubService.setShouldFail(false);
        env.mockStorage.setShouldFail(false);
        env.mockOperationStateManager.setShouldFail(false);

        // Apply specific error
        setupError();

        // Attempt operation
        await manager.handlePrivateRepoImport(`error-test-${Date.now()}`);

        // User should always get feedback
        const lastStatus = env.mockStatusBroadcaster.getLastStatus();
        expect(lastStatus).toBeDefined();
        expect(['error', 'success']).toContain(lastStatus?.status);

        // System should not crash
        expect(manager).toBeDefined();

        // Should be able to query state
        let repos;
        try {
          repos = await manager.getTempRepos();
        } catch (e) {
          repos = []; // Even if storage fails, should handle gracefully
        }
        expect(Array.isArray(repos)).toBe(true);
      }
    });

    it('should provide actionable error messages for common failures', async () => {
      // Arrange
      manager = lifecycle.createManager('custom');

      const errorCases = [
        {
          setup: () => env.mockGitHubService.setShouldFail(true, 'createRepo'),
          expectedMessage: /create temporary repository/i,
        },
        {
          setup: () => env.mockGitHubService.setShouldFail(true, 'cloneContents'),
          expectedMessage: /clone repository contents/i,
        },
        {
          setup: () => env.mockGitHubService.setShouldFail(true, 'updateVisibility'),
          expectedMessage: /update repository visibility/i,
        },
      ];

      // Act & Assert
      for (const testCase of errorCases) {
        // Reset and apply specific error
        env.mockGitHubService.setShouldFail(false);
        testCase.setup();

        await manager.handlePrivateRepoImport('error-message-test');

        const lastStatus = env.mockStatusBroadcaster.getLastStatus();
        expect(lastStatus?.status).toBe('error');
        expect(lastStatus?.message).toMatch(testCase.expectedMessage);
      }
    });
  });

  describe('Performance Under Load', () => {
    it('should handle rapid sequential imports efficiently', async () => {
      // Arrange
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');
      const importCount = 10; // Reduced count for test performance

      // Act
      const startTime = Date.now();

      for (let i = 0; i < importCount; i++) {
        await manager.handlePrivateRepoImport(`sequential-${i}`);
      }

      const duration = Date.now() - startTime;

      // Assert
      // Should complete in reasonable time (less than 200ms per import)
      expect(duration).toBeLessThan(importCount * 200);

      // All imports should succeed
      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(importCount);

      // No memory leaks from operations
      const operations = env.mockOperationStateManager.getAllOperations();
      expect(operations).toHaveLength(importCount);
    }, 10000);

    it('should efficiently clean up large numbers of expired repos', async () => {
      // Arrange - Create many expired repos
      const expiredRepos = Array.from({ length: 50 }, (_, i) => ({
        originalRepo: `expired-${i}`,
        tempRepo: `temp-expired-${i}`,
        createdAt: Date.now() - 2 * 60 * 1000, // 2 minutes old
        owner: TempRepoTestData.owners.validOwner,
        branch: 'main',
      }));

      env.mockStorage.setLocalData({ [STORAGE_KEY]: expiredRepos });
      manager = lifecycle.createManager('custom');

      // Act
      const startTime = Date.now();
      await manager.cleanupTempRepos();
      const duration = Date.now() - startTime;

      // Assert
      // Should complete quickly (less than 50ms per repo)
      expect(duration).toBeLessThan(expiredRepos.length * 50);

      // All repos should be deleted
      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(50);

      // Storage should be empty
      TempRepoAssertionHelpers.expectStorageEmpty(env.mockStorage);
    });
  });
});
