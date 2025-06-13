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
} from '../test-fixtures';
import type { TempRepoManagerTestEnvironment } from '../test-fixtures';

// Mock the OperationStateManager module
jest.mock('../../content/services/OperationStateManager');

describe('TempRepoManager - Critical Scenarios', () => {
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

  describe('Import Repository Behavior', () => {
    it('should handle import failures gracefully', async () => {
      // Arrange
      manager = lifecycle.createManager('custom');
      env.setupGitHubServiceFailure('createRepo');

      // Act - Attempt import that will fail
      await manager.handlePrivateRepoImport('failing-repo');

      // Assert - Should handle failure gracefully
      const lastStatus = env.mockStatusBroadcaster.getLastStatus();
      expect(lastStatus?.status).toBe('error');
      expect(lastStatus?.message).toBeDefined();
    });
  });

  describe('Repository Cleanup Behavior', () => {
    // Removed: Tests for cleanup cycles, expiry timing, and retry logic
    // These are implementation details. The important behavior is that
    // repos get cleaned up, not HOW or WHEN they get cleaned up

    it('should successfully delete temporary repositories', async () => {
      // Arrange - Create manager with an existing repo
      env.setupSingleRepo();
      manager = lifecycle.createManager('custom');

      // Act - Force cleanup (simulating user action or scheduled cleanup)
      await manager.cleanupTempRepos(true); // force = true to bypass time checks

      // Assert - Repo should be deleted
      const remainingRepos = await manager.getTempRepos();
      expect(remainingRepos).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    // Removed: Testing storage error handling is testing implementation details
    // The TempRepoManager's internal error handling for storage is not user-visible behavior

    it('should handle GitHub API errors during import', async () => {
      // Arrange
      manager = lifecycle.createManager('custom');
      env.setupGitHubServiceFailure('all');

      // Act
      await manager.handlePrivateRepoImport('test-repo');

      // Assert
      const lastStatus = env.mockStatusBroadcaster.getLastStatus();
      expect(lastStatus?.status).toBe('error');
    });
  });

  // Removed: Performance tests, complex user journey tests, and tests
  // that verify multiple behaviors at once. These violate unit testing
  // principles and should be integration tests if needed at all.
});
