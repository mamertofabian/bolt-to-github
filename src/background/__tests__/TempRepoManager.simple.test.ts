/**
 * Simple test to debug import issues
 */

import { BackgroundTempRepoManager, STORAGE_KEY } from '../TempRepoManager';
import { TempRepoTestLifecycle } from '../test-fixtures';
import type { TempRepoManagerTestEnvironment } from '../test-fixtures';

describe('TempRepoManager - Simple Test', () => {
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

  it('should create a manager instance', () => {
    manager = lifecycle.createManager('success');
    expect(manager).toBeDefined();
    expect(manager).toBeInstanceOf(BackgroundTempRepoManager);
  });

  it('should handle basic import', async () => {
    manager = lifecycle.createManager('success');

    // This should work without hanging
    await manager.handlePrivateRepoImport('test-repo');

    // Verify success
    expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('success');
  });
});
