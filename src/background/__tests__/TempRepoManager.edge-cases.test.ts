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

    it('should handle cleanup operations correctly', async () => {
      // Arrange - Set up repos with mixed ages
      env.setupMixedAgeRepos();
      manager = lifecycle.createManager('existing');

      const initialRepos = await manager.getTempRepos();
      const expiredCount = initialRepos.filter((r) => Date.now() - r.createdAt > 60000).length;
      const freshCount = initialRepos.filter((r) => Date.now() - r.createdAt < 60000).length;

      // Act - Run cleanup
      await manager.cleanupTempRepos();

      // Assert - Only expired repos should be removed
      const finalRepos = await manager.getTempRepos();
      expect(finalRepos).toHaveLength(freshCount);
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

    it('should handle multiple storage operations correctly', async () => {
      // Arrange
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      // Act - Sequential operations (realistic for Chrome extensions)
      const repoCount = 5;
      for (let i = 0; i < repoCount; i++) {
        await manager.handlePrivateRepoImport(`storage-test-${i}`);
      }

      // Assert - All operations should complete successfully
      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(repoCount);

      // Verify all repos were saved correctly
      for (let i = 0; i < repoCount; i++) {
        expect(repos.some((r) => r.originalRepo === `storage-test-${i}`)).toBe(true);
      }
    });
  });

  describe('Normal Usage Testing', () => {
    it('should handle sequential operations', async () => {
      // Arrange - Test realistic sequential usage pattern
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      // Act - Simple sequential operations (realistic user behavior)
      await manager.handlePrivateRepoImport('project-1');
      await manager.handlePrivateRepoImport('project-2');

      // Assert - Both operations should succeed
      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(2);

      // Verify both repos were saved correctly
      const repoNames = repos.map((r) => r.originalRepo);
      expect(repoNames).toContain('project-1');
      expect(repoNames).toContain('project-2');
    });

    it('should handle normal cleanup operations', async () => {
      // Arrange - Setup with a few repos (realistic scenario)
      const testRepos = [
        {
          originalRepo: 'old-project',
          tempRepo: 'temp-old-project',
          createdAt: Date.now() - 2 * 60 * 1000, // 2 minutes old (expired)
          owner: TempRepoTestData.owners.validOwner,
          branch: 'main',
        },
        {
          originalRepo: 'new-project',
          tempRepo: 'temp-new-project',
          createdAt: Date.now() - 30 * 1000, // 30 seconds old (not expired)
          owner: TempRepoTestData.owners.validOwner,
          branch: 'main',
        },
      ];

      env.mockStorage.setLocalData({ [STORAGE_KEY]: testRepos });
      manager = lifecycle.createManager('custom');

      // Act - Run cleanup
      await manager.cleanupTempRepos();

      // Assert - Should delete only expired repo
      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledWith(
        TempRepoTestData.owners.validOwner,
        'temp-old-project'
      );
      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(1);

      // Verify storage state
      const remainingRepos = await manager.getTempRepos();
      expect(remainingRepos).toHaveLength(1);
      expect(remainingRepos[0].originalRepo).toBe('new-project');
    });

    it('should handle typical user workflow', async () => {
      // Arrange - Start with empty storage
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      // Act - Typical user workflow: import, then cleanup
      await manager.handlePrivateRepoImport('user-project');

      // Verify repo was created
      let repos = await manager.getTempRepos();
      expect(repos).toHaveLength(1);

      // Force cleanup (simulates user closing browser after work)
      await manager.cleanupTempRepos(true);

      // Assert - Should be cleaned up
      repos = await manager.getTempRepos();
      expect(repos).toHaveLength(0);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from service failures', async () => {
      // Arrange
      env.setupEmptyStorage();
      manager = lifecycle.createManager('custom');

      // Simulate a simple failure then recovery
      env.setupGitHubServiceFailure('all');

      // Attempt operation (will fail)
      await manager.handlePrivateRepoImport('failed-operation');

      // Verify failure
      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('error');

      // Clear failure and try again
      env.mockGitHubService.setShouldFail(false);

      // Act - Attempt recovery
      await manager.handlePrivateRepoImport('recovery-test');

      // Assert - Should recover and succeed
      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('success');

      const repos = await manager.getTempRepos();
      expect(repos.some((r) => r.originalRepo === 'recovery-test')).toBe(true);
    });

    it('should handle network errors gracefully', async () => {
      // Arrange - Test network failure scenario
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      // Setup network failure
      env.setupGitHubServiceFailure('createRepo');

      // Act - Attempt operation that will fail
      await manager.handlePrivateRepoImport('network-test');

      // Assert - Should fail gracefully with error status
      const lastStatus = env.mockStatusBroadcaster.getLastStatus();
      expect(lastStatus?.status).toBe('error');
      expect(lastStatus?.message).toBeDefined();

      // No repo should be created
      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(0);
    });
  });

  describe('Resource Management', () => {
    it('should handle basic cleanup operations', async () => {
      // Arrange - Test simple cleanup
      manager = lifecycle.createManager('success');

      // Act - Import then cleanup
      await manager.handlePrivateRepoImport('test-repo');

      // Verify repo was created
      let repos = await manager.getTempRepos();
      expect(repos).toHaveLength(1);

      // Cleanup
      await manager.cleanupTempRepos(true);

      // Assert - Should be cleaned up
      repos = await manager.getTempRepos();
      expect(repos).toHaveLength(0);
    });

    it('should handle operation failures gracefully', async () => {
      // Arrange
      manager = lifecycle.createManager('success');

      // Make operations fail
      env.mockOperationStateManager.startOperation = jest.fn(async () => {
        throw new Error('Operation tracking failed');
      });

      // Act - Attempt operation that will fail
      await manager.handlePrivateRepoImport('failing-operation');

      // Assert - Should handle failure gracefully
      const lastStatus = env.mockStatusBroadcaster.getLastStatus();
      expect(lastStatus?.status).toBe('error');

      // Should still be able to query state
      const repos = await manager.getTempRepos();
      expect(Array.isArray(repos)).toBe(true);
    });
  });
});
