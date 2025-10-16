import { vi } from 'vitest';
import { BackgroundTempRepoManager } from '../TempRepoManager';
import type { TempRepoManagerTestEnvironment } from '../test-fixtures';
import { TempRepoTestLifecycle } from '../test-fixtures';

vi.mock('../../content/services/OperationStateManager');

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
      manager = lifecycle.createManager('custom');
      env.setupGitHubServiceFailure('createRepo');

      await manager.handlePrivateRepoImport('failing-repo');

      const lastStatus = env.mockStatusBroadcaster.getLastStatus();
      expect(lastStatus?.status).toBe('error');
      expect(lastStatus?.message).toBeDefined();
    });
  });

  describe('Repository Cleanup Behavior', () => {
    it('should successfully delete temporary repositories', async () => {
      env.setupSingleRepo();
      manager = lifecycle.createManager('custom');

      await manager.cleanupTempRepos(true);

      const remainingRepos = await manager.getTempRepos();
      expect(remainingRepos).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle GitHub API errors during import', async () => {
      manager = lifecycle.createManager('custom');
      env.setupGitHubServiceFailure('all');

      await manager.handlePrivateRepoImport('test-repo');

      const lastStatus = env.mockStatusBroadcaster.getLastStatus();
      expect(lastStatus?.status).toBe('error');
    });
  });
});
