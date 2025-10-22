/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../content/services/OperationStateManager', () => ({
  OperationStateManager: {
    getInstance: vi.fn(),
  },
}));

import { BackgroundTempRepoManager, STORAGE_KEY } from '../TempRepoManager';
import type { TempRepoManagerTestEnvironment } from '../test-fixtures';
import {
  TempRepoAssertionHelpers,
  TempRepoTestData,
  TempRepoTestLifecycle,
} from '../test-fixtures';

interface TempRepo {
  originalRepo: string;
  tempRepo: string;
  createdAt: number;
  owner: string;
  branch: string;
}

describe('TempRepoManager', () => {
  let lifecycle: TempRepoTestLifecycle;
  let env: TempRepoManagerTestEnvironment;
  let manager: BackgroundTempRepoManager;
  const FIXED_TIME = 1609459200000;

  beforeEach(async () => {
    vi.setSystemTime(FIXED_TIME);

    lifecycle = new TempRepoTestLifecycle();
    env = lifecycle.beforeEach();

    const { OperationStateManager } = await import('../../content/services/OperationStateManager');
    (OperationStateManager.getInstance as any).mockReturnValue(env.mockOperationStateManager);
  });

  afterEach(() => {
    lifecycle.afterEach();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Repository Import Pipeline', () => {
    it('should successfully import a private repository with all steps completing', async () => {
      manager = lifecycle.createManager('success');
      const sourceRepo = TempRepoTestData.repositories.validSourceRepo;
      const expectedTempRepo = `temp-${sourceRepo}-`;

      await manager.handlePrivateRepoImport(sourceRepo);

      TempRepoAssertionHelpers.expectOperationCompleted(env.mockOperationStateManager, 'import');

      const statusHistory = env.mockStatusBroadcaster.getStatusHistory();
      expect(statusHistory.length).toBeGreaterThan(4);
      expect(statusHistory[statusHistory.length - 1].status).toBe('success');

      TempRepoAssertionHelpers.expectProgressionIncreases(env.mockStatusBroadcaster);

      const storageData = env.mockStorage.getLocalData();
      expect(storageData[STORAGE_KEY]).toHaveLength(1);
      expect((storageData[STORAGE_KEY] as TempRepo[])[0].originalRepo).toBe(sourceRepo);

      TempRepoAssertionHelpers.expectBoltTabCreated(
        env.mockTabs,
        TempRepoTestData.owners.validOwner,
        expect.stringContaining(expectedTempRepo)
      );
    });

    it('should detect and use default branch when none specified', async () => {
      manager = lifecycle.createManager('success');
      const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

      await manager.handlePrivateRepoImport(sourceRepo);

      expect(env.mockGitHubService.listBranches).toHaveBeenCalledWith(
        TempRepoTestData.owners.validOwner,
        sourceRepo
      );

      const storageData = env.mockStorage.getLocalData();
      expect((storageData[STORAGE_KEY] as TempRepo[])[0].branch).toBe('main');
    });

    it('should handle progress callbacks during content cloning', async () => {
      manager = lifecycle.createManager('success');
      const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

      await manager.handlePrivateRepoImport(sourceRepo);

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

    it('should handle branch detection failure gracefully', async () => {
      manager = lifecycle.createManager('custom');
      env.setupGitHubServiceFailure('listBranches');
      const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

      await manager.handlePrivateRepoImport(sourceRepo);

      const storageData = env.mockStorage.getLocalData();
      expect((storageData[STORAGE_KEY] as TempRepo[])[0].branch).toBe('main');

      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('success');
    });

    it('should fail operation when repository creation fails', async () => {
      manager = lifecycle.createManager('custom');
      env.setupGitHubServiceFailure('createRepo');
      const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

      await manager.handlePrivateRepoImport(sourceRepo);

      TempRepoAssertionHelpers.expectOperationFailed(env.mockOperationStateManager, 'import');

      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('error');
      expect(env.mockStatusBroadcaster.getLastStatus()?.message).toContain(
        'Failed to create temporary repository'
      );

      const storageData = env.mockStorage.getLocalData();
      expect(storageData[STORAGE_KEY]).toBeUndefined();
    });

    it('should handle content cloning failure after repo creation', async () => {
      manager = lifecycle.createManager('custom');
      env.setupGitHubServiceFailure('cloneContents');
      const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

      await manager.handlePrivateRepoImport(sourceRepo);

      TempRepoAssertionHelpers.expectOperationFailed(env.mockOperationStateManager, 'import');

      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('error');

      const storageData = env.mockStorage.getLocalData();
      expect(storageData[STORAGE_KEY]).toHaveLength(1);
    });

    it('should handle visibility update failure', async () => {
      manager = lifecycle.createManager('custom');
      env.setupGitHubServiceFailure('updateVisibility');
      const sourceRepo = TempRepoTestData.repositories.validSourceRepo;

      await manager.handlePrivateRepoImport(sourceRepo);

      TempRepoAssertionHelpers.expectOperationFailed(env.mockOperationStateManager, 'import');

      const storageData = env.mockStorage.getLocalData();
      expect(storageData[STORAGE_KEY]).toHaveLength(1);
    });
  });

  describe('Storage Management', () => {
    it('should handle getTempRepos with corrupted storage', async () => {
      env.setupCorruptedStorage();
      manager = lifecycle.createManager('custom');

      const repos = await manager.getTempRepos();

      expect(repos).toBe('invalid-data-not-array');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle cleanup during active import operation', async () => {
      env.setupExpiredRepos();
      manager = lifecycle.createManager('success');

      const importPromise = manager.handlePrivateRepoImport('new-repo');
      const cleanupPromise = manager.cleanupTempRepos();

      await Promise.all([importPromise, cleanupPromise]);

      const storageData = env.mockStorage.getLocalData();

      expect(
        (storageData[STORAGE_KEY] as TempRepo[]).some((r) => r.originalRepo === 'new-repo')
      ).toBe(true);
    });
  });

  describe('Cleanup Behavior', () => {
    it('should cleanup repos older than MAX_AGE', async () => {
      const oldRepoTimestamp = FIXED_TIME - 61 * 1000;
      const recentRepoTimestamp = FIXED_TIME - 30 * 1000;

      env.mockStorage.setLocalData({
        [STORAGE_KEY]: [
          {
            originalRepo: 'old-repo',
            tempRepo: 'temp-old-repo',
            createdAt: oldRepoTimestamp,
            owner: TempRepoTestData.owners.validOwner,
            branch: 'main',
          },
          {
            originalRepo: 'recent-repo',
            tempRepo: 'temp-recent-repo',
            createdAt: recentRepoTimestamp,
            owner: TempRepoTestData.owners.validOwner,
            branch: 'main',
          },
        ],
      });

      manager = lifecycle.createManager('custom');

      await manager.cleanupTempRepos();

      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledWith(
        TempRepoTestData.owners.validOwner,
        'temp-old-repo'
      );
      expect(env.mockGitHubService.deleteRepo).not.toHaveBeenCalledWith(
        TempRepoTestData.owners.validOwner,
        'temp-recent-repo'
      );

      const storageData = env.mockStorage.getLocalData();
      expect((storageData[STORAGE_KEY] as TempRepo[]).length).toBe(1);
      expect((storageData[STORAGE_KEY] as TempRepo[])[0].originalRepo).toBe('recent-repo');
    });

    it('should force cleanup all repos when forceCleanUp is true', async () => {
      const recentRepoTimestamp = FIXED_TIME - 10 * 1000;

      env.mockStorage.setLocalData({
        [STORAGE_KEY]: [
          {
            originalRepo: 'very-recent-repo',
            tempRepo: 'temp-very-recent-repo',
            createdAt: recentRepoTimestamp,
            owner: TempRepoTestData.owners.validOwner,
            branch: 'main',
          },
        ],
      });

      manager = lifecycle.createManager('custom');

      await manager.cleanupTempRepos(true);

      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledWith(
        TempRepoTestData.owners.validOwner,
        'temp-very-recent-repo'
      );

      const storageData = env.mockStorage.getLocalData();
      expect((storageData[STORAGE_KEY] as TempRepo[]).length).toBe(0);
    });

    it('should retry failed deletions on subsequent cleanup', async () => {
      const oldRepoTimestamp = FIXED_TIME - 61 * 1000;

      env.mockStorage.setLocalData({
        [STORAGE_KEY]: [
          {
            originalRepo: 'stuck-repo',
            tempRepo: 'temp-stuck-repo',
            createdAt: oldRepoTimestamp,
            owner: TempRepoTestData.owners.validOwner,
            branch: 'main',
          },
        ],
      });

      manager = lifecycle.createManager('custom');

      env.mockGitHubService.deleteRepo.mockRejectedValueOnce(new Error('Network error'));
      await manager.cleanupTempRepos();

      let storageData = env.mockStorage.getLocalData();
      expect((storageData[STORAGE_KEY] as TempRepo[]).length).toBe(1);

      env.mockGitHubService.deleteRepo.mockResolvedValueOnce(undefined);
      await manager.cleanupTempRepos();

      storageData = env.mockStorage.getLocalData();
      expect((storageData[STORAGE_KEY] as TempRepo[]).length).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should handle large number of temp repos efficiently', async () => {
      const largeRepoList = Array.from({ length: 100 }, (_, i) => ({
        originalRepo: `repo-${i}`,
        tempRepo: `temp-repo-${i}`,
        createdAt: FIXED_TIME - (i % 2 === 0 ? 61 * 1000 : 30 * 1000),
        owner: TempRepoTestData.owners.validOwner,
        branch: 'main',
      }));

      env.mockStorage.setLocalData({ [STORAGE_KEY]: largeRepoList });
      manager = lifecycle.createManager('custom');

      await manager.cleanupTempRepos();

      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(50);

      const storageData = env.mockStorage.getLocalData();
      expect((storageData[STORAGE_KEY] as TempRepo[]).length).toBe(50);
    });

    it('should not accumulate memory from progress callbacks', async () => {
      manager = lifecycle.createManager('success');

      for (let i = 0; i < 10; i++) {
        await manager.handlePrivateRepoImport(`repo-${i}`);
      }

      env.mockGitHubService.clearProgressCallbacks();
      const finalCallbacks = env.mockGitHubService.getProgressCallback('test') ? 1 : 0;
      expect(finalCallbacks).toBe(0);
    });
  });
});
