/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';
import { BackgroundTempRepoManager, STORAGE_KEY } from '../TempRepoManager';
import type { TempRepoManagerTestEnvironment } from '../test-fixtures';
import { TempRepoTestData, TempRepoTestLifecycle, ValidationHelpers } from '../test-fixtures';

vi.mock('../../content/services/OperationStateManager', () => ({
  OperationStateManager: {
    getInstance: vi.fn(),
  },
}));

describe('TempRepoManager - Edge Cases & Stress Tests', () => {
  let lifecycle: TempRepoTestLifecycle;
  let env: TempRepoManagerTestEnvironment;
  let manager: BackgroundTempRepoManager;

  beforeEach(async () => {
    lifecycle = new TempRepoTestLifecycle();
    env = lifecycle.beforeEach();

    const { OperationStateManager } = await import('../../content/services/OperationStateManager');
    (OperationStateManager.getInstance as any).mockReturnValue(env.mockOperationStateManager);
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
        manager = lifecycle.createManager('success');

        await manager.handlePrivateRepoImport(name);

        const lastStatus = env.mockStatusBroadcaster.getLastStatus();
        expect(lastStatus).toBeDefined();

        expect(['success', 'error']).toContain(lastStatus?.status);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { branch: null as any, description: 'null branch' },
      ];

      test.each(edgeCaseBranches)('should handle branch: $description', async ({ branch }) => {
        manager = lifecycle.createManager('success');

        await manager.handlePrivateRepoImport('test-repo', branch);

        const repos = await manager.getTempRepos();
        if (repos.length > 0) {
          expect(repos[0].branch).toBeDefined();
          expect(repos[0].branch).not.toBe('');
        }
      });
    });

    describe('Time Boundary Conditions', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should handle repository at exact expiry boundary (60000ms)', async () => {
        const boundaryRepo = {
          originalRepo: 'boundary-repo',
          tempRepo: 'temp-boundary-repo',
          createdAt: Date.now() - 60000,
          owner: TempRepoTestData.owners.validOwner,
          branch: 'main',
        };

        env.mockStorage.setLocalData({ [STORAGE_KEY]: [boundaryRepo] });
        manager = lifecycle.createManager('custom');

        await manager.cleanupTempRepos();

        expect(env.mockGitHubService.deleteRepo).not.toHaveBeenCalled();
      });

      it('should handle repository 1ms before expiry', async () => {
        const almostExpiredRepo = {
          originalRepo: 'almost-expired',
          tempRepo: 'temp-almost-expired',
          createdAt: Date.now() - 59999,
          owner: TempRepoTestData.owners.validOwner,
          branch: 'main',
        };

        env.mockStorage.setLocalData({ [STORAGE_KEY]: [almostExpiredRepo] });
        manager = lifecycle.createManager('custom');

        await manager.cleanupTempRepos();

        expect(env.mockGitHubService.deleteRepo).not.toHaveBeenCalled();
      });

      it('should handle outdated repos correctly', async () => {
        manager = lifecycle.createManager('success');

        const expiredRepo = {
          originalRepo: 'old-project',
          tempRepo: 'temp-old-project-20240101-abc123',
          createdAt: Date.now() - 2 * 60 * 60 * 1000,
          owner: 'testuser',
          branch: 'main',
        };
        env.mockStorage.setLocalData({ [STORAGE_KEY]: [expiredRepo] });

        await manager.cleanupTempRepos();

        expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledWith(
          'testuser',
          'temp-old-project-20240101-abc123'
        );
      });
    });
  });

  describe('Race Conditions', () => {
    it('should handle simultaneous imports of the same repository', async () => {
      manager = lifecycle.createManager('success');
      const repoName = 'concurrent-same-repo';

      const imports = Array(5)
        .fill(null)
        .map(() => manager.handlePrivateRepoImport(repoName));

      await Promise.all(imports);

      const repos = await manager.getTempRepos();
      expect(repos.length).toBeGreaterThanOrEqual(1);
      expect(repos.length).toBeLessThanOrEqual(5);

      repos.forEach((repo) => {
        expect(
          ValidationHelpers.validateRepoMetadata(repo as unknown as Record<string, unknown>)
        ).toBe(true);
      });
    });

    it('should handle cleanup operations correctly', async () => {
      env.setupMixedAgeRepos();
      manager = lifecycle.createManager('existing');

      const initialRepos = await manager.getTempRepos();
      const freshCount = initialRepos.filter((r) => Date.now() - r.createdAt < 60000).length;

      await manager.cleanupTempRepos();

      const finalRepos = await manager.getTempRepos();
      expect(finalRepos).toHaveLength(freshCount);
      expect(finalRepos.every((r) => Date.now() - r.createdAt < 60000)).toBe(true);
    });

    it('should handle normal import and cleanup cycle', async () => {
      manager = lifecycle.createManager('success');

      await manager.handlePrivateRepoImport('test-repo');

      let repos = await manager.getTempRepos();
      expect(repos).toHaveLength(1);

      await manager.cleanupTempRepos(true);

      repos = await manager.getTempRepos();
      expect(repos).toHaveLength(0);

      const operations = env.mockOperationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);
    });

    it('should handle multiple storage operations correctly', async () => {
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      const repoCount = 5;
      for (let i = 0; i < repoCount; i++) {
        await manager.handlePrivateRepoImport(`storage-test-${i}`);
      }

      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(repoCount);

      for (let i = 0; i < repoCount; i++) {
        expect(repos.some((r) => r.originalRepo === `storage-test-${i}`)).toBe(true);
      }
    });
  });

  describe('Normal Usage Testing', () => {
    it('should handle sequential operations', async () => {
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      await manager.handlePrivateRepoImport('project-1');
      await manager.handlePrivateRepoImport('project-2');

      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(2);

      const repoNames = repos.map((r) => r.originalRepo);
      expect(repoNames).toContain('project-1');
      expect(repoNames).toContain('project-2');
    });

    it('should handle normal cleanup operations', async () => {
      const testRepos = [
        {
          originalRepo: 'old-project',
          tempRepo: 'temp-old-project',
          createdAt: Date.now() - 2 * 60 * 1000,
          owner: TempRepoTestData.owners.validOwner,
          branch: 'main',
        },
        {
          originalRepo: 'new-project',
          tempRepo: 'temp-new-project',
          createdAt: Date.now() - 30 * 1000,
          owner: TempRepoTestData.owners.validOwner,
          branch: 'main',
        },
      ];

      env.mockStorage.setLocalData({ [STORAGE_KEY]: testRepos });
      manager = lifecycle.createManager('custom');

      await manager.cleanupTempRepos();

      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledWith(
        TempRepoTestData.owners.validOwner,
        'temp-old-project'
      );
      expect(env.mockGitHubService.deleteRepo).toHaveBeenCalledTimes(1);

      const remainingRepos = await manager.getTempRepos();
      expect(remainingRepos).toHaveLength(1);
      expect(remainingRepos[0].originalRepo).toBe('new-project');
    });

    it('should handle typical user workflow', async () => {
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      await manager.handlePrivateRepoImport('user-project');

      let repos = await manager.getTempRepos();
      expect(repos).toHaveLength(1);

      await manager.cleanupTempRepos(true);

      repos = await manager.getTempRepos();
      expect(repos).toHaveLength(0);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from service failures', async () => {
      env.setupEmptyStorage();
      manager = lifecycle.createManager('custom');

      env.setupGitHubServiceFailure('all');

      await manager.handlePrivateRepoImport('failed-operation');

      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('error');

      env.mockGitHubService.setShouldFail(false);

      await manager.handlePrivateRepoImport('recovery-test');

      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('success');

      const repos = await manager.getTempRepos();
      expect(repos.some((r) => r.originalRepo === 'recovery-test')).toBe(true);
    });

    it('should handle network errors gracefully', async () => {
      env.setupEmptyStorage();
      manager = lifecycle.createManager('success');

      env.setupGitHubServiceFailure('createRepo');

      await manager.handlePrivateRepoImport('network-test');

      const lastStatus = env.mockStatusBroadcaster.getLastStatus();
      expect(lastStatus?.status).toBe('error');
      expect(lastStatus?.message).toBeDefined();

      const repos = await manager.getTempRepos();
      expect(repos).toHaveLength(0);
    });
  });

  describe('Resource Management', () => {
    it('should handle basic cleanup operations', async () => {
      manager = lifecycle.createManager('success');

      await manager.handlePrivateRepoImport('test-repo');

      let repos = await manager.getTempRepos();
      expect(repos).toHaveLength(1);

      await manager.cleanupTempRepos(true);

      repos = await manager.getTempRepos();
      expect(repos).toHaveLength(0);
    });

    it('should handle operation failures gracefully', async () => {
      manager = lifecycle.createManager('success');

      env.mockOperationStateManager.startOperation = vi.fn(
        async (
          _type: string,
          _operationId: string,
          _description: string,
          _metadata?: Record<string, unknown>
        ): Promise<void> => {
          throw new Error('Operation tracking failed');
        }
      );

      await manager.handlePrivateRepoImport('failing-operation');

      const lastStatus = env.mockStatusBroadcaster.getLastStatus();
      expect(lastStatus?.status).toBe('error');

      const repos = await manager.getTempRepos();
      expect(Array.isArray(repos)).toBe(true);
    });
  });
});
