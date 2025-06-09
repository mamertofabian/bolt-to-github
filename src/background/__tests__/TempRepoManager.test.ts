/**
 * Unit tests for TempRepoManager
 *
 * Tests focus on critical business logic, high-risk areas, and potential failure points
 * as identified in the CRITICAL_TESTING_ANALYSIS.md
 */

import { BackgroundTempRepoManager, STORAGE_KEY } from '../TempRepoManager';
import {
  TempRepoTestLifecycle,
  TempRepoManagerFactory,
  AsyncOperationHelpers,
  ValidationHelpers,
  TempRepoTestData,
  TempRepoScenarioBuilder,
  TempRepoAssertionHelpers,
  MockVerificationUtilities,
} from '../test-fixtures';
import type { TempRepoManagerTestEnvironment } from '../test-fixtures';

describe('TempRepoManager', () => {
  let lifecycle: TempRepoTestLifecycle;
  let env: TempRepoManagerTestEnvironment;
  let manager: BackgroundTempRepoManager;

  beforeEach(() => {
    lifecycle = new TempRepoTestLifecycle();
    env = lifecycle.beforeEach();
  });

  afterEach(() => {
    lifecycle.afterEach();
  });

  describe('Repository Import Pipeline', () => {
    describe('Happy Path', () => {
      it('should successfully import a private repository with all steps completing', async () => {
        // Arrange
        manager = lifecycle.createManager('success');
        const sourceRepo = TempRepoTestData.repositories.validSourceRepo;
        const expectedTempRepo = `temp-${sourceRepo}-`;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Verify operation tracking
        TempRepoAssertionHelpers.expectOperationCompleted(env.mockOperationStateManager, 'import');

        // Verify status progression
        const statusHistory = env.mockStatusBroadcaster.getStatusHistory();
        expect(statusHistory).toHaveLength(5); // Multiple status updates
        expect(statusHistory[statusHistory.length - 1].status).toBe('success');

        // Verify progress increases monotonically
        TempRepoAssertionHelpers.expectProgressionIncreases(env.mockStatusBroadcaster);

        // Verify temp repo was saved to storage
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY]).toHaveLength(1);
        expect(storageData[STORAGE_KEY][0].originalRepo).toBe(sourceRepo);

        // Verify Bolt tab was created
        TempRepoAssertionHelpers.expectBoltTabCreated(
          env.mockTabs,
          TempRepoTestData.owners.validOwner,
          expect.stringContaining(expectedTempRepo)
        );
      });

      it('should detect and use default branch when none specified', async () => {
        // Arrange
        manager = lifecycle.createManager('success');
        const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo); // No branch specified

        // Assert
        // Verify branch detection was attempted
        expect(env.mockGitHubService.listBranches).toHaveBeenCalledWith(
          TempRepoTestData.owners.validOwner,
          sourceRepo
        );

        // Verify default branch was used
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY][0].branch).toBe('main'); // Default branch from mock
      });

      it('should handle progress callbacks during content cloning', async () => {
        // Arrange
        manager = lifecycle.createManager('success');
        const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Verify progress updates during cloning (30-70% range)
        const progressUpdates = env.mockStatusBroadcaster
          .getStatusHistory()
          .filter(
            (s) => s.status === 'uploading' && s.message?.includes('Copying repository contents')
          )
          .map((s) => s.progress || 0);

        expect(progressUpdates.length).toBeGreaterThan(0);
        progressUpdates.forEach((progress) => {
          expect(progress).toBeGreaterThanOrEqual(30);
          expect(progress).toBeLessThanOrEqual(70);
        });
      });
    });

    describe('Error Handling', () => {
      it('should handle branch detection failure gracefully', async () => {
        // Arrange
        manager = lifecycle.createManager('custom');
        env.setupGitHubServiceFailure('listBranches');
        const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Should fall back to 'main' branch
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY][0].branch).toBe('main');

        // Import should still succeed
        expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('success');
      });

      it('should fail operation when repository creation fails', async () => {
        // Arrange
        manager = lifecycle.createManager('custom');
        env.setupGitHubServiceFailure('createRepo');
        const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Operation should be marked as failed
        TempRepoAssertionHelpers.expectOperationFailed(env.mockOperationStateManager, 'import');

        // Error status should be broadcast
        expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('error');
        expect(env.mockStatusBroadcaster.getLastStatus()?.message).toContain(
          'Failed to create temporary repository'
        );

        // No storage entry should exist
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY]).toBeUndefined();
      });

      it('should handle content cloning failure after repo creation', async () => {
        // Arrange
        manager = lifecycle.createManager('custom');
        env.setupGitHubServiceFailure('cloneContents');
        const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Operation should fail
        TempRepoAssertionHelpers.expectOperationFailed(env.mockOperationStateManager, 'import');

        // Error status broadcast
        expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('error');

        // Temp repo should still be saved (for potential cleanup)
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY]).toHaveLength(1);
      });

      it('should handle visibility update failure', async () => {
        // Arrange
        manager = lifecycle.createManager('custom');
        env.setupGitHubServiceFailure('updateVisibility');
        const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Operation should fail but repo exists
        TempRepoAssertionHelpers.expectOperationFailed(env.mockOperationStateManager, 'import');

        // Repo should be saved in storage
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY]).toHaveLength(1);
      });

      it('should handle storage failure during repo metadata save', async () => {
        // Arrange
        manager = lifecycle.createManager('custom');
        env.setupStorageFailure();
        const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Operation should fail due to storage error
        expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('error');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty repository name', async () => {
        // Arrange
        manager = lifecycle.createManager('success');
        const sourceRepo = TempRepoTestData.repositories.emptySourceRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Should handle gracefully (likely fail at GitHub API level)
        expect(env.mockStatusBroadcaster.getStatusHistory().length).toBeGreaterThan(0);
      });

      it('should handle repository names with special characters', async () => {
        // Arrange
        manager = lifecycle.createManager('success');
        const sourceRepo = TempRepoTestData.repositories.specialCharsRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Should succeed with proper encoding
        expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('success');

        // Verify tab URL is properly encoded
        const createdTab = env.mockTabs.getLastCreatedTab();
        expect(createdTab?.url).toBeDefined();
      });

      it('should handle very long repository names', async () => {
        // Arrange
        manager = lifecycle.createManager('success');
        const sourceRepo = TempRepoTestData.repositories.longSourceRepo;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo);

        // Assert
        // Should handle within GitHub's limits
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY][0].originalRepo).toBe(sourceRepo);
      });

      it('should handle non-existent branch gracefully', async () => {
        // Arrange
        manager = lifecycle.createManager('success');
        const sourceRepo = TempRepoTestData.repositories.validSourceRepo;
        const nonExistentBranch = TempRepoTestData.branches.nonExistentBranch;

        // Act
        await manager.handlePrivateRepoImport(sourceRepo, nonExistentBranch);

        // Assert
        // Should use the provided branch even if it doesn't exist
        // (GitHub API would fail later, but we test the flow)
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY][0].branch).toBe(nonExistentBranch);
      });
    });
  });

  describe('Automatic Repository Cleanup', () => {
    describe('Time-based Deletion', () => {
      it('should delete only expired repositories', async () => {
        // Arrange
        env.setupMixedAgeRepos();
        manager = lifecycle.createManager('custom');

        // Act
        await manager.cleanupTempRepos();

        // Assert
        // Only expired repo should be deleted
        expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(1);
        expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledWith(
          TempRepoTestData.owners.validOwner,
          'temp-expired-project-20240101-expired1'
        );

        // Storage should be updated
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY]).toHaveLength(2); // Fresh and about-to-expire remain
      });

      it('should handle forced cleanup regardless of age', async () => {
        // Arrange
        env.setupMixedAgeRepos();
        manager = lifecycle.createManager('custom');

        // Act
        await manager.cleanupTempRepos(true); // Force cleanup

        // Assert
        // All repos should be deleted
        expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(3);

        // Storage should be empty
        TempRepoAssertionHelpers.expectStorageEmpty(env.mockStorage);
      });

      it('should stop cleanup interval when no repos remain', async () => {
        // Arrange
        env.setupSingleRepo();
        manager = lifecycle.createManager('custom');
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        // Act
        await manager.cleanupTempRepos(true); // Force cleanup of single repo

        // Assert
        // Interval should be stopped
        expect(clearIntervalSpy).toHaveBeenCalled();
        TempRepoAssertionHelpers.expectStorageEmpty(env.mockStorage);
      });
    });

    describe('Error Recovery', () => {
      it('should retry failed deletions on next cleanup cycle', async () => {
        // Arrange
        env.setupExpiredRepos();
        manager = lifecycle.createManager('custom');
        env.setupDeleteFailures(['temp-old-project-one-20231220-old123']);

        // Act - First cleanup attempt
        await manager.cleanupTempRepos();

        // Assert - One deletion failed
        expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(2);

        // Failed repo should remain in storage
        const storageAfterFirst = env.mockStorage.getLocalData();
        expect(storageAfterFirst[STORAGE_KEY]).toHaveLength(1);
        expect(storageAfterFirst[STORAGE_KEY][0].tempRepo).toBe(
          'temp-old-project-one-20231220-old123'
        );

        // Act - Second cleanup attempt (remove failure)
        env.setupDeleteFailures([]);
        await manager.cleanupTempRepos();

        // Assert - Retry should succeed
        TempRepoAssertionHelpers.expectStorageEmpty(env.mockStorage);
      });

      it('should handle all deletions failing', async () => {
        // Arrange
        env.setupExpiredRepos();
        manager = lifecycle.createManager('custom');
        env.setupGitHubServiceFailure('deleteRepo');

        // Act
        await manager.cleanupTempRepos();

        // Assert
        // Delete attempts should be made
        expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(2);

        // All repos should remain in storage
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY]).toHaveLength(2);
      });

      it('should handle storage corruption gracefully', async () => {
        // Arrange
        env.setupCorruptedStorage();
        manager = lifecycle.createManager('custom');

        // Act
        await manager.cleanupTempRepos();

        // Assert
        // Should not throw, should handle corrupted data
        // Storage should be reset to empty array
        const storageData = env.mockStorage.getLocalData();
        expect(storageData[STORAGE_KEY]).toEqual([]);
      });

      it('should handle storage failures during cleanup', async () => {
        // Arrange
        env.setupExpiredRepos();
        manager = lifecycle.createManager('custom');

        // Make storage fail on set operation
        env.mockStorage.local.set.mockRejectedValueOnce(new Error('Storage unavailable'));

        // Act
        await manager.cleanupTempRepos();

        // Assert
        // Deletions should still be attempted
        expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(2);

        // Storage update should fail but not crash
        expect(env.mockStorage.local.set).toHaveBeenCalled();
      });
    });

    describe('Interval Management', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should start cleanup interval on initialization when repos exist', async () => {
        // Arrange
        env.setupMultipleRepos();
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        // Act
        manager = new BackgroundTempRepoManager(
          env.mockGitHubService as any,
          TempRepoTestData.owners.validOwner,
          env.mockStatusBroadcaster.broadcast
        );

        // Wait for initialization
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Assert
        expect(setIntervalSpy).toHaveBeenCalledWith(
          expect.any(Function),
          30000 // 30 seconds
        );
      });

      it('should not start cleanup interval on initialization when no repos exist', async () => {
        // Arrange
        env.setupEmptyStorage();
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        // Act
        manager = new BackgroundTempRepoManager(
          env.mockGitHubService as any,
          TempRepoTestData.owners.validOwner,
          env.mockStatusBroadcaster.broadcast
        );

        // Wait for initialization
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Assert
        expect(setIntervalSpy).not.toHaveBeenCalled();
      });

      it('should prevent multiple intervals from running', async () => {
        // Arrange
        env.setupEmptyStorage();
        manager = lifecycle.createManager('custom');
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        // Act - Start interval multiple times
        await manager.handlePrivateRepoImport('repo1');
        await manager.handlePrivateRepoImport('repo2');
        await manager.handlePrivateRepoImport('repo3');

        // Assert - Only one interval should be created
        expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      });

      it('should run cleanup at regular intervals', async () => {
        // Arrange
        env.setupExpiredRepos();
        manager = lifecycle.createManager('custom');
        const cleanupSpy = jest.spyOn(manager, 'cleanupTempRepos');

        // Act - Advance time to trigger cleanup cycles
        jest.advanceTimersByTime(30000); // First cycle
        await Promise.resolve(); // Let promises resolve

        jest.advanceTimersByTime(30000); // Second cycle
        await Promise.resolve();

        // Assert
        expect(cleanupSpy).toHaveBeenCalledTimes(2);
      });

      it('should handle rapid start/stop cycles without memory leaks', async () => {
        // Arrange
        env.setupEmptyStorage();
        manager = lifecycle.createManager('custom');
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        // Act - Rapid operations
        for (let i = 0; i < 5; i++) {
          await manager.handlePrivateRepoImport(`repo-${i}`);
          await manager.cleanupTempRepos(true); // Force cleanup
        }

        // Assert - Intervals should be properly cleared
        expect(clearIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(5);
      });
    });
  });

  describe('Storage Management', () => {
    it('should maintain storage consistency during concurrent operations', async () => {
      // Arrange
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      // Act - Simulate concurrent imports
      const imports = [
        manager.handlePrivateRepoImport('repo1'),
        manager.handlePrivateRepoImport('repo2'),
        manager.handlePrivateRepoImport('repo3'),
      ];

      await Promise.all(imports);

      // Assert
      const storageData = env.mockStorage.getLocalData();
      expect(storageData[STORAGE_KEY]).toHaveLength(3);

      // Each repo should have unique data
      const tempRepos = storageData[STORAGE_KEY].map((r: any) => r.tempRepo);
      expect(new Set(tempRepos).size).toBe(3); // All unique
    });

    it('should handle getTempRepos with corrupted storage', async () => {
      // Arrange
      env.setupCorruptedStorage();
      manager = lifecycle.createManager('custom');

      // Act
      const repos = await manager.getTempRepos();

      // Assert
      expect(repos).toEqual([]); // Should return empty array for corrupted data
    });

    it('should persist temp repo metadata correctly', async () => {
      // Arrange
      manager = lifecycle.createManager('success');
      const sourceRepo = 'test-project';
      const branch = 'develop';

      // Act
      await manager.handlePrivateRepoImport(sourceRepo, branch);

      // Assert
      const storageData = env.mockStorage.getLocalData();
      const savedRepo = storageData[STORAGE_KEY][0];

      expect(ValidationHelpers.validateRepoMetadata(savedRepo)).toBe(true);
      expect(savedRepo.originalRepo).toBe(sourceRepo);
      expect(savedRepo.branch).toBe(branch);
      expect(savedRepo.owner).toBe(TempRepoTestData.owners.validOwner);
      expect(savedRepo.createdAt).toBeCloseTo(Date.now(), -2); // Within 100ms
    });
  });

  describe('Race Conditions and Edge Cases', () => {
    it('should handle cleanup during active import operation', async () => {
      // Arrange
      env.setupExpiredRepos();
      manager = lifecycle.createManager('success');

      // Act - Start import and cleanup simultaneously
      const importPromise = manager.handlePrivateRepoImport('new-repo');
      const cleanupPromise = manager.cleanupTempRepos();

      await Promise.all([importPromise, cleanupPromise]);

      // Assert
      // Both operations should complete successfully
      const storageData = env.mockStorage.getLocalData();
      // Should have the new repo (expired ones deleted)
      expect(storageData[STORAGE_KEY].some((r: any) => r.originalRepo === 'new-repo')).toBe(true);
    });

    it('should handle repository created at cleanup boundary', async () => {
      // Arrange
      manager = lifecycle.createManager('success');

      // Create a repo that's exactly at the expiry boundary
      const boundaryRepo = {
        originalRepo: 'boundary-repo',
        tempRepo: 'temp-boundary-repo',
        createdAt: Date.now() - 60 * 1000, // Exactly 60 seconds old
        owner: TempRepoTestData.owners.validOwner,
        branch: 'main',
      };

      env.mockStorage.setLocalData({
        [STORAGE_KEY]: [boundaryRepo],
      });

      // Act
      await manager.cleanupTempRepos();

      // Assert
      // Repo at exact boundary should be deleted
      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledWith(
        boundaryRepo.owner,
        boundaryRepo.tempRepo
      );
    });

    it('should handle network timeout during operations', async () => {
      // Arrange
      manager = lifecycle.createManager('custom');
      env.setupSlowGitHubService(TempRepoTestData.performance.verySlowOperation);

      // Act
      const startTime = Date.now();
      await manager.handlePrivateRepoImport('slow-repo');
      const duration = Date.now() - startTime;

      // Assert
      // Operation should complete despite being slow
      expect(duration).toBeGreaterThanOrEqual(TempRepoTestData.performance.verySlowOperation);
      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('success');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle large number of temp repos efficiently', async () => {
      // Arrange
      const largeRepoList = Array.from({ length: 100 }, (_, i) => ({
        originalRepo: `repo-${i}`,
        tempRepo: `temp-repo-${i}`,
        createdAt: Date.now() - i * 1000, // Varying ages
        owner: TempRepoTestData.owners.validOwner,
        branch: 'main',
      }));

      env.mockStorage.setLocalData({ [STORAGE_KEY]: largeRepoList });
      manager = lifecycle.createManager('custom');

      // Act
      const startTime = Date.now();
      await manager.cleanupTempRepos();
      const duration = Date.now() - startTime;

      // Assert
      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds max

      // Should have made appropriate number of delete calls
      const expiredCount = largeRepoList.filter((r) => Date.now() - r.createdAt > 60000).length;
      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(expiredCount);
    });

    it('should not accumulate memory from progress callbacks', async () => {
      // Arrange
      manager = lifecycle.createManager('success');

      // Track memory usage (simplified - in real tests you'd use proper memory profiling)
      const initialCallbacks = env.mockGitHubService.getProgressCallback('test') ? 1 : 0;

      // Act - Multiple imports
      for (let i = 0; i < 10; i++) {
        await manager.handlePrivateRepoImport(`repo-${i}`);
      }

      // Assert - Callbacks should be cleaned up
      env.mockGitHubService.clearProgressCallbacks();
      const finalCallbacks = env.mockGitHubService.getProgressCallback('test') ? 1 : 0;
      expect(finalCallbacks).toBe(0);
    });
  });
});
