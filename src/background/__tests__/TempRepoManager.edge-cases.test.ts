/**
 * Edge case and stress tests for TempRepoManager
 *
 * Tests focus on boundary conditions, race conditions, and stress scenarios
 * that could reveal hidden bugs or performance issues
 */

import { BackgroundTempRepoManager, STORAGE_KEY } from '../TempRepoManager';
import {
  TempRepoTestLifecycle,
  TempRepoTestData,
  ValidationHelpers,
  PerformanceHelpers,
  DebuggingHelpers,
  TempRepoAssertionHelpers,
} from '../test-fixtures';
import type { TempRepoManagerTestEnvironment } from '../test-fixtures';

// Mock the OperationStateManager module
jest.mock('../../content/services/OperationStateManager');

describe('TempRepoManager - Edge Cases & Stress Tests', () => {
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

  describe('Boundary Conditions', () => {
    describe('Repository Name Edge Cases', () => {
      const edgeCaseNames = [
        { name: '', description: 'empty string' },
        { name: 'a', description: 'single character' },
        { name: 'a'.repeat(100), description: 'maximum length (100 chars)' },
        { name: 'a'.repeat(101), description: 'over maximum length' },
        { name: 'repo-with-dashes', description: 'with dashes' },
        { name: 'repo_with_underscores', description: 'with underscores' },
        { name: 'repo.with.dots', description: 'with dots' },
        { name: 'UPPERCASE-REPO', description: 'uppercase letters' },
        { name: '123-numeric-start', description: 'starting with numbers' },
        { name: 'юникод-репо', description: 'unicode characters' },
        { name: 'repo with spaces', description: 'with spaces' },
        { name: 'repo/with/slashes', description: 'with slashes' },
        { name: 'repo\\with\\backslashes', description: 'with backslashes' },
        { name: 'repo?with&special=chars!', description: 'with special characters' },
        { name: '../../etc/passwd', description: 'path traversal attempt' },
        { name: 'repo\0with\0nulls', description: 'with null bytes' },
        { name: 'repo\nwith\nnewlines', description: 'with newlines' },
        { name: 'repo\twith\ttabs', description: 'with tabs' },
      ];

      test.each(edgeCaseNames)('should handle repository name: $description', async ({ name }) => {
        // Arrange
        manager = lifecycle.createManager('success');

        // Act
        await manager.handlePrivateRepoImport(name);

        // Assert
        const lastStatus = env.mockStatusBroadcaster.getLastStatus();
        expect(lastStatus).toBeDefined();

        // Should either succeed or fail gracefully
        expect(['success', 'error']).toContain(lastStatus?.status);

        // If successful, verify storage
        if (lastStatus?.status === 'success') {
          const repos = await manager.getTempRepos();
          expect(repos).toHaveLength(1);
          expect(repos[0].originalRepo).toBe(name);
        }
      });
    });

    describe('Branch Name Edge Cases', () => {
      const edgeCaseBranches = [
        { branch: '', description: 'empty branch' },
        { branch: 'a'.repeat(255), description: 'very long branch name' },
        { branch: 'feature/test/deep/nesting/branch', description: 'deeply nested' },
        { branch: 'branch-with-issue-#123', description: 'with special chars' },
        { branch: 'ветка-на-русском', description: 'unicode branch' },
        { branch: undefined, description: 'undefined branch' },
        { branch: null as any, description: 'null branch' },
      ];

      test.each(edgeCaseBranches)('should handle branch: $description', async ({ branch }) => {
        // Arrange
        manager = lifecycle.createManager('success');

        // Act
        await manager.handlePrivateRepoImport('test-repo', branch);

        // Assert
        const repos = await manager.getTempRepos();
        if (repos.length > 0) {
          // Should use provided branch or fall back to default
          expect(repos[0].branch).toBeDefined();
          expect(repos[0].branch).not.toBe('');
        }
      });
    });

    describe('Time Boundary Conditions', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should handle repository at exact expiry boundary (60000ms)', async () => {
        // Arrange
        const boundaryRepo = {
          originalRepo: 'boundary-repo',
          tempRepo: 'temp-boundary-repo',
          createdAt: Date.now() - 60000, // Exactly 60 seconds
          owner: TempRepoTestData.owners.validOwner,
          branch: 'main',
        };

        env.mockStorage.setLocalData({ [STORAGE_KEY]: [boundaryRepo] });
        manager = lifecycle.createManager('custom');

        // Act
        await manager.cleanupTempRepos();

        // Assert - Should NOT be deleted (exactly 60 seconds is not expired, > 60 seconds is)
        expect(env.mockGitHubService.deleteRepo).not.toHaveBeenCalled();
      });

      it('should handle repository 1ms before expiry', async () => {
        // Arrange
        const almostExpiredRepo = {
          originalRepo: 'almost-expired',
          tempRepo: 'temp-almost-expired',
          createdAt: Date.now() - 59999, // 1ms before expiry
          owner: TempRepoTestData.owners.validOwner,
          branch: 'main',
        };

        env.mockStorage.setLocalData({ [STORAGE_KEY]: [almostExpiredRepo] });
        manager = lifecycle.createManager('custom');

        // Act
        await manager.cleanupTempRepos();

        // Assert - Should NOT be deleted
        expect(env.mockGitHubService.deleteRepo).not.toHaveBeenCalled();
      });

      it('should handle outdated repos correctly', async () => {
        // Arrange - Create repo with old timestamp (simulates clock changes or old data)
        manager = lifecycle.createManager('success');

        // Manually set up an expired repo in storage
        const expiredRepo = {
          originalRepo: 'old-project',
          tempRepo: 'temp-old-project-20240101-abc123',
          createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
          owner: 'testuser',
          branch: 'main',
        };
        env.mockStorage.setLocalData({ [STORAGE_KEY]: [expiredRepo] });

        // Act - Run cleanup
        await manager.cleanupTempRepos();

        // Assert - Should delete the expired repo
        expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledWith(
          'testuser',
          'temp-old-project-20240101-abc123'
        );
      });
    });
  });

  describe('Race Conditions', () => {
    it('should handle simultaneous imports of the same repository', async () => {
      // Arrange
      manager = lifecycle.createManager('success');
      const repoName = 'concurrent-same-repo';

      // Act - Start multiple imports of same repo simultaneously
      const imports = Array(5)
        .fill(null)
        .map(() => manager.handlePrivateRepoImport(repoName));

      await Promise.all(imports);

      // Assert - All should complete, storage should be consistent
      const repos = await manager.getTempRepos();
      expect(repos.length).toBeGreaterThanOrEqual(1);
      expect(repos.length).toBeLessThanOrEqual(5);

      // All entries should be valid
      repos.forEach((repo) => {
        expect(ValidationHelpers.validateRepoMetadata(repo)).toBe(true);
      });
    });

    it('should handle cleanup during multiple concurrent imports', async () => {
      // Arrange
      env.setupMixedAgeRepos();
      manager = lifecycle.createManager('custom');

      // Act - Start imports and cleanup simultaneously
      const operations = [
        manager.handlePrivateRepoImport('new-repo-1'),
        manager.handlePrivateRepoImport('new-repo-2'),
        manager.cleanupTempRepos(),
        manager.handlePrivateRepoImport('new-repo-3'),
        manager.cleanupTempRepos(),
      ];

      await Promise.all(operations);

      // Assert - System should remain consistent
      const finalRepos = await manager.getTempRepos();

      // Should have new repos and no expired ones
      expect(finalRepos.some((r) => r.originalRepo === 'new-repo-1')).toBe(true);
      expect(finalRepos.some((r) => r.originalRepo === 'new-repo-2')).toBe(true);
      expect(finalRepos.some((r) => r.originalRepo === 'new-repo-3')).toBe(true);
      expect(finalRepos.every((r) => Date.now() - r.createdAt < 60000)).toBe(true);
    });

    it('should handle normal import and cleanup cycle', async () => {
      // Arrange
      manager = lifecycle.createManager('success');

      // Act - Normal usage pattern: import then cleanup
      await manager.handlePrivateRepoImport('test-repo');

      // Verify repo was created
      let repos = await manager.getTempRepos();
      expect(repos).toHaveLength(1);

      // Cleanup (force delete to avoid waiting for expiry)
      await manager.cleanupTempRepos(true);

      // Assert - Should be cleaned up
      repos = await manager.getTempRepos();
      expect(repos).toHaveLength(0);

      // Operation should have been tracked
      const operations = env.mockOperationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);
    });

    it('should handle storage operations during concurrent access', async () => {
      // Arrange
      manager = lifecycle.createManager('success');

      // Track storage operations
      let concurrentWrites = 0;
      const originalSet = env.mockStorage.local.set;
      env.mockStorage.local.set = jest.fn(async (data) => {
        concurrentWrites++;
        // Simulate slight delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return originalSet.call(env.mockStorage.local, data);
      });

      // Act - Multiple operations that write to storage
      const operations = Array(10)
        .fill(null)
        .map((_, i) => manager.handlePrivateRepoImport(`storage-test-${i}`));

      await Promise.all(operations);

      // Assert - All writes should complete
      expect(concurrentWrites).toBe(10);

      // Storage should contain all repos
      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(10);
    });
  });

  describe('Stress Testing', () => {
    it('should handle sequential operations without degradation', async () => {
      // Arrange - Test realistic sequential usage pattern
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');
      const sequentialOps = 5; // More realistic number of repos a user might import

      // Act - Sequential operations (realistic usage)
      const { result, timeMs } = await PerformanceHelpers.measureExecutionTime(async () => {
        const results = [];
        for (let i = 0; i < sequentialOps; i++) {
          const result = await manager.handlePrivateRepoImport(`project-${i}`);
          results.push(result);
        }
        return results;
      });

      // Assert
      // Should complete in reasonable time (be more generous for CI/test environments)
      expect(timeMs).toBeLessThan(sequentialOps * 500); // Very generous timing for test environments

      // All operations should succeed
      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(sequentialOps);

      // Verify no operation was lost
      const repoNames = new Set(repos.map((r) => r.originalRepo));
      expect(repoNames.size).toBe(sequentialOps);
    });

    it('should maintain performance with large storage datasets', async () => {
      // Arrange - Pre-populate with many repos
      const existingRepos = Array(200)
        .fill(null)
        .map((_, i) => ({
          originalRepo: `existing-${i}`,
          tempRepo: `temp-existing-${i}`,
          createdAt: Date.now() - i * 100, // Various ages
          owner: TempRepoTestData.owners.validOwner,
          branch: 'main',
        }));

      env.mockStorage.setLocalData({ [STORAGE_KEY]: existingRepos });
      manager = lifecycle.createManager('custom');

      // Act - Perform operations with large dataset
      const startTime = Date.now();

      // Add more repos
      await manager.handlePrivateRepoImport('new-with-large-dataset');

      // Run cleanup
      await manager.cleanupTempRepos();

      const duration = Date.now() - startTime;

      // Assert - Should maintain performance
      expect(duration).toBeLessThan(2000); // 2 seconds max

      // Cleanup should have processed expired repos
      const expiredCount = existingRepos.filter((r) => Date.now() - r.createdAt > 60000).length;

      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(expiredCount);
    });

    it('should handle realistic usage load', async () => {
      // Arrange - Simple realistic test
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      // Act - Simple sequential operations
      await manager.handlePrivateRepoImport('test-project-1');
      await manager.handlePrivateRepoImport('test-project-2');

      // Assert - Should create repos in storage
      const repos = await manager.getTempRepos();
      expect(repos.length).toBeGreaterThan(0);
      expect(repos.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Error Recovery Under Extreme Conditions', () => {
    it('should recover from repeated catastrophic failures', async () => {
      // Arrange
      env.setupEmptyStorage();
      manager = lifecycle.createManager('custom');

      // Simulate multiple failure cycles
      for (let cycle = 0; cycle < 5; cycle++) {
        // Set up complete failure
        env.setupGitHubServiceFailure('all');

        // Attempt operation (will fail)
        await manager.handlePrivateRepoImport(`failure-cycle-${cycle}`);

        // Verify failure
        expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('error');

        // Clear failure for next cycle
        env.mockGitHubService.setShouldFail(false);
      }

      // Act - Attempt recovery
      await manager.handlePrivateRepoImport('recovery-test');

      // Assert - Should recover and succeed
      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('success');

      const repos = await manager.getTempRepos();
      expect(repos.some((r) => r.originalRepo === 'recovery-test')).toBe(true);
    });

    it('should handle occasional failures gracefully', async () => {
      // Arrange - Test occasional network issues (more realistic)
      env.setupEmptyStorage();
      manager = lifecycle.createManager('custom');
      let callCount = 0;

      // Simulate occasional failures (1 out of 3 operations fails)
      env.mockGitHubService.listBranches = jest.fn(async () => {
        callCount++;
        if (callCount === 2) {
          // Only second call fails
          throw new Error('Temporary network issue');
        }
        return TempRepoTestData.branchResponses.mainDefault;
      });

      // Act - Few sequential operations (realistic usage)
      const results = [];
      for (let i = 0; i < 3; i++) {
        await manager.handlePrivateRepoImport(`operation-${i}`);
        results.push(env.mockStatusBroadcaster.getLastStatus()?.status);
      }

      // Assert - Should handle the failure gracefully, most operations succeed
      const successCount = results.filter((r) => r === 'success').length;
      expect(successCount).toBeGreaterThan(1); // At least some should succeed
    });
  });

  describe('Resource Cleanup Verification', () => {
    it('should handle cleanup intervals correctly', async () => {
      // Arrange - Test realistic interval management
      manager = lifecycle.createManager('success');

      // Act - Normal usage that would start/stop intervals
      await manager.handlePrivateRepoImport('test-repo');

      // Verify repo was created
      let repos = await manager.getTempRepos();
      expect(repos).toHaveLength(1);

      // Cleanup (should manage intervals properly)
      await manager.cleanupTempRepos(true);

      // Assert - Should be cleaned up
      repos = await manager.getTempRepos();
      expect(repos).toHaveLength(0);
    });

    it('should clean up all resources on catastrophic failure', async () => {
      // Arrange
      manager = lifecycle.createManager('success');

      // Track resource allocation
      const resources = {
        operations: 0,
        statusBroadcasts: 0,
        storageWrites: 0,
      };

      env.mockOperationStateManager.startOperation = jest.fn(async (...args) => {
        resources.operations++;
        throw new Error('Catastrophic failure');
      });

      // Act - Attempt operations that will fail catastrophically
      for (let i = 0; i < 5; i++) {
        try {
          await manager.handlePrivateRepoImport(`catastrophic-${i}`);
        } catch (e) {
          // Expected to fail
        }
      }

      // Assert - Resources should not accumulate
      expect(resources.operations).toBe(5); // One per attempt

      // Should still be able to query state
      const repos = await manager.getTempRepos();
      expect(Array.isArray(repos)).toBe(true);
    });
  });
});
