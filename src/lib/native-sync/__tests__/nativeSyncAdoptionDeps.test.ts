import { describe, it, expect, vi } from 'vitest';
import {
  buildAdoptionDeps,
  sanitizeRepoListEntries,
  type NativeSyncGitHubService,
  type NativeSyncAdoptionEnvironment,
  type RepoListSanitizeResult,
} from '../nativeSyncAdoptionDeps';
import type { GitHubRepoListEntry, ProjectSettingsGateway } from '../nativeSyncGateways';
import { NativeSyncJourneyStore } from '../../services/NativeSyncJourneyStore';
import { NativeSyncHandoffStore } from '../../services/NativeSyncHandoffStore';

/** Shared in-memory storage usable as both journey and handoff record storage. */
function inMemoryStorage() {
  let data: Record<string, unknown> = {};
  return {
    read: async (): Promise<Record<string, unknown>> => data,
    write: async (records: Record<string, unknown>): Promise<void> => {
      data = records;
    },
  };
}

function makeEnv(
  overrides: {
    listRepos?: NativeSyncGitHubService['listRepos'];
    repoExists?: NativeSyncGitHubService['repoExists'];
    listBranches?: NativeSyncGitHubService['listBranches'];
    projectSettings?: ProjectSettingsGateway;
    journeyStore?: NativeSyncJourneyStore;
    handoffStore?: NativeSyncHandoffStore;
  } = {}
): NativeSyncAdoptionEnvironment {
  const gitHubService: NativeSyncGitHubService = {
    listRepos: overrides.listRepos ?? (async () => []),
    repoExists: overrides.repoExists ?? (async () => true),
    listBranches: overrides.listBranches ?? (async () => []),
  };
  const projectSettings: ProjectSettingsGateway = overrides.projectSettings ?? {
    getProjectTitle: async () => undefined,
    saveProjectSettings: async () => {},
  };
  return {
    gitHubService,
    projectSettings,
    journeyStore: overrides.journeyStore ?? new NativeSyncJourneyStore(inMemoryStorage()),
    handoffStore: overrides.handoffStore ?? new NativeSyncHandoffStore(inMemoryStorage()),
  };
}

describe('sanitizeRepoListEntries', () => {
  it('sanitizeRepoListEntries keeps entries with a parseable created_at and drops the rest by name', () => {
    const entries: GitHubRepoListEntry[] = [
      { name: 'good', created_at: '2026-07-20T00:00:00.000Z' },
      { name: 'bad', created_at: 'not-a-date' },
    ];

    const result: RepoListSanitizeResult = sanitizeRepoListEntries(entries);

    expect(result.valid.map((entry) => entry.name)).toEqual(['good']);
    expect(result.dropped).toContain('bad');
  });

  it('sanitizeRepoListEntries keeps every entry and drops none when all created_at values parse', () => {
    const entries: GitHubRepoListEntry[] = [
      { name: 'alpha', created_at: '2026-07-18T00:00:00.000Z' },
      { name: 'beta', created_at: '2026-07-20T00:00:00.000Z' },
    ];

    const result = sanitizeRepoListEntries(entries);

    expect(result.valid.map((entry) => entry.name)).toEqual(['alpha', 'beta']);
    expect(result.dropped).toEqual([]);
  });
});

describe('buildAdoptionDeps', () => {
  it('buildAdoptionDeps produces a candidate source that excludes entries with an unparseable created_at', async () => {
    const env = makeEnv({
      listRepos: async () => [
        { name: 'good', created_at: '2026-07-20T00:00:00.000Z' },
        { name: 'bad', created_at: 'not-a-date' },
      ],
    });

    const deps = buildAdoptionDeps(env);
    const candidates = await deps.candidateSource.listOwnerRepositories('octocat');

    expect(candidates.map((candidate) => candidate.name)).toEqual(['good']);
    expect(candidates[0].createdAt).toBe(Date.parse('2026-07-20T00:00:00.000Z'));
  });

  it('buildAdoptionDeps wires a live-access verifier that reflects the injected GitHub service', async () => {
    const env = makeEnv({
      repoExists: async () => true,
      listBranches: async () => [{ name: 'main' }],
    });

    const deps = buildAdoptionDeps(env);

    expect(await deps.verifyRepositoryAccess('octocat', 'bolt-new', 'main')).toBe(true);
    expect(await deps.verifyRepositoryAccess('octocat', 'bolt-new', 'dev')).toBe(false);
  });

  it('buildAdoptionDeps wires a mapping writer that persists through the injected project settings gateway', async () => {
    const saveProjectSettings = vi.fn(async () => {});
    const env = makeEnv({
      projectSettings: {
        getProjectTitle: async () => 'Kept Title',
        saveProjectSettings,
      },
    });

    const deps = buildAdoptionDeps(env);
    await deps.mappingWriter.setProjectMapping('project-1', 'bolt-new', 'main');

    expect(saveProjectSettings.mock.calls[0]).toEqual([
      'project-1',
      'bolt-new',
      'main',
      'Kept Title',
    ]);
  });

  it('buildAdoptionDeps passes the injected journey and handoff stores through to the coordinator deps', () => {
    const journeyStore = new NativeSyncJourneyStore(inMemoryStorage());
    const handoffStore = new NativeSyncHandoffStore(inMemoryStorage());
    const env = makeEnv({ journeyStore, handoffStore });

    const deps = buildAdoptionDeps(env);

    expect(deps.journeyStore).toBe(journeyStore);
    expect(deps.handoffStore).toBe(handoffStore);
  });
});
