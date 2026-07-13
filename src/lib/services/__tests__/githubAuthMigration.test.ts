import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  completeGitHubAppMigration,
  migrateLegacyGitHubAuthentication,
  resolveGitHubAuthMigration,
  type GitHubAppMigrationStatus,
  type GitHubAuthMigrationDecision,
  type LegacyGitHubAuthSnapshot,
} from '../githubAuthMigration';

interface MockStorageArea {
  get: Mock;
  set: Mock;
  remove: Mock;
}

const syncStorage: MockStorageArea = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
};

const localStorage: MockStorageArea = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
};

global.chrome = {
  storage: {
    sync: syncStorage,
    local: localStorage,
  },
} as unknown as typeof chrome;

describe('GitHub App authentication migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncStorage.get.mockResolvedValue({});
    syncStorage.set.mockResolvedValue(undefined);
    syncStorage.remove.mockResolvedValue(undefined);
    localStorage.get.mockResolvedValue({});
    localStorage.set.mockResolvedValue(undefined);
    localStorage.remove.mockResolvedValue(undefined);
  });

  it('legacy PAT becomes migration required and the token is removed', async () => {
    syncStorage.get.mockResolvedValue({ githubToken: 'github_pat_legacy' });
    localStorage.get.mockResolvedValue({ authenticationMethod: 'pat' });
    const operations: string[] = [];
    localStorage.set.mockImplementation(async () => {
      operations.push('marker');
    });
    syncStorage.remove.mockImplementation(async () => {
      operations.push('token');
    });
    localStorage.remove.mockImplementation(async () => {
      operations.push('legacy-method');
    });

    const decision = await migrateLegacyGitHubAuthentication();

    expect(decision.status).toBe('migration_required');
    expect(localStorage.set).toHaveBeenCalledWith({ githubAppMigrationRequired: true });
    expect(syncStorage.remove).toHaveBeenCalledWith('githubToken');
    expect(localStorage.remove).toHaveBeenCalledWith([
      'authenticationMethod',
      'preferredAuthMethod',
      'migrationPromptShown',
      'lastMigrationPrompt',
    ]);
    expect(operations).toEqual(['marker', 'token', 'legacy-method']);
  });

  it('stale PAT beside a connected GitHub App is removed without migration blocking', async () => {
    syncStorage.get.mockResolvedValue({ githubToken: 'stale-classic-token' });
    localStorage.get.mockResolvedValue({
      authenticationMethod: 'github_app',
      githubAppInstallationId: 42,
    });

    const decision = await migrateLegacyGitHubAuthentication();

    expect(decision.status).toBe('completed');
    expect(decision.persistMigrationRequired).toBe(false);
    expect(localStorage.set).not.toHaveBeenCalled();
    expect(syncStorage.remove).toHaveBeenCalledWith('githubToken');
  });

  it('fresh unconfigured storage is not mislabeled as a PAT migration', () => {
    const snapshot: LegacyGitHubAuthSnapshot = {};
    const decision: GitHubAuthMigrationDecision = resolveGitHubAuthMigration(snapshot);
    const expectedStatus: GitHubAppMigrationStatus = 'not_required';

    expect(decision).toEqual({
      status: expectedStatus,
      removeStoredPat: false,
      removeLegacyMethodKeys: false,
      persistMigrationRequired: false,
    });
  });

  it('migration preserves repository owner and every project mapping', async () => {
    const projectSettings = {
      first: { repoName: 'alpha', branch: 'main' },
      second: { repoName: 'beta', branch: 'release' },
    };
    syncStorage.get.mockResolvedValue({
      githubToken: 'legacy-token',
      repoOwner: 'octocat',
      projectSettings,
    });
    localStorage.get.mockResolvedValue({ authenticationMethod: 'pat' });

    await migrateLegacyGitHubAuthentication();

    expect(syncStorage.set).not.toHaveBeenCalled();
    expect(syncStorage.remove).toHaveBeenCalledWith('githubToken');
    expect(syncStorage.remove).not.toHaveBeenCalledWith(
      expect.arrayContaining(['repoOwner', 'projectSettings'])
    );
  });

  it('repeated migration is idempotent', async () => {
    const syncState: Record<string, unknown> = { githubToken: 'legacy-token' };
    const localState: Record<string, unknown> = {
      authenticationMethod: 'pat',
      preferredAuthMethod: 'pat',
    };
    syncStorage.get.mockImplementation(async () => ({ ...syncState }));
    localStorage.get.mockImplementation(async () => ({ ...localState }));
    syncStorage.remove.mockImplementation(async (key: string) => {
      delete syncState[key];
    });
    localStorage.set.mockImplementation(async (values: Record<string, unknown>) => {
      Object.assign(localState, values);
    });
    localStorage.remove.mockImplementation(async (keys: string[]) => {
      keys.forEach((key) => delete localState[key]);
    });

    const firstDecision = await migrateLegacyGitHubAuthentication();

    expect(firstDecision.status).toBe('migration_required');
    expect(syncState).not.toHaveProperty('githubToken');
    expect(localState).toEqual({ githubAppMigrationRequired: true });

    vi.clearAllMocks();

    const secondDecision = await migrateLegacyGitHubAuthentication();

    expect(secondDecision.status).toBe('migration_required');
    expect(localStorage.set).not.toHaveBeenCalled();
    expect(localStorage.remove).not.toHaveBeenCalled();
    expect(syncStorage.remove).not.toHaveBeenCalled();
    expect(resolveGitHubAuthMigration({ migrationRequired: true }).status).toBe(
      'migration_required'
    );
  });

  it('retry repairs a marker-written token-not-yet-removed partial migration', async () => {
    syncStorage.get.mockResolvedValue({ githubToken: 'token-left-after-crash' });
    localStorage.get.mockResolvedValue({ githubAppMigrationRequired: true });

    const decision = await migrateLegacyGitHubAuthentication();

    expect(decision.status).toBe('migration_required');
    expect(localStorage.set).not.toHaveBeenCalled();
    expect(syncStorage.remove).toHaveBeenCalledWith('githubToken');
  });

  it('retry repairs a token-removed local-auth-not-yet-cleaned partial migration', async () => {
    localStorage.get.mockResolvedValue({
      githubAppMigrationRequired: true,
      preferredAuthMethod: 'pat',
      migrationPromptShown: true,
      lastMigrationPrompt: '2025-01-01T00:00:00.000Z',
    });

    const decision = await migrateLegacyGitHubAuthentication();

    expect(decision.status).toBe('migration_required');
    expect(syncStorage.remove).not.toHaveBeenCalled();
    expect(localStorage.remove).toHaveBeenCalledWith([
      'authenticationMethod',
      'preferredAuthMethod',
      'migrationPromptShown',
      'lastMigrationPrompt',
    ]);
  });

  it('completion requires both a live session and installation', async () => {
    await expect(completeGitHubAppMigration(false, true)).resolves.toBe(false);
    await expect(completeGitHubAppMigration(true, false)).resolves.toBe(false);
    expect(localStorage.remove).not.toHaveBeenCalled();

    await expect(completeGitHubAppMigration(true, true)).resolves.toBe(true);
    expect(localStorage.remove).toHaveBeenCalledWith('githubAppMigrationRequired');
  });
});
