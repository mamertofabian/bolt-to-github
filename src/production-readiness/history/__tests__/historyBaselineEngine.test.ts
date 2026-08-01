import { describe, expect, it, vi } from 'vitest';
import type { ComparisonSummary, ReadinessSnapshot } from '../../domain';
import { loadPrsFixture } from '../../test-fixtures/prsFixtures';
import {
  buildHistoryBaseline,
  type HistoryBaselineInput,
  type HistoryBaselineLabel,
  type HistoryBaselineResult,
  type HistorySource,
  type PrsCommitHistoryRecord,
  type PrsHistoryBaseline,
  type PrsHotspotFile,
  type PrsHistorySample,
} from '../historyBaselineEngine';
import { calculateMedian, calculatePercentileRank, detectHistoryHotspots } from '../historyStats';
import {
  fetchPrsCommitHistory,
  type GitHubHistoryReader,
  type GitHubHistoryRequest,
  type GitHubHistoryResult,
} from '../../github/githubHistoryAdapter';
import {
  loadPriorPrsSnapshots,
  savePrsSnapshotSummary,
  type PriorSnapshotLoadResult,
  type PrsSnapshotStorage,
} from '../../snapshots/priorSnapshotStore';

const currentComparison: ComparisonSummary = {
  changedFiles: 8,
  addedFiles: 4,
  deletedFiles: 1,
  renamedFiles: 0,
  addedLines: 120,
  deletedLines: 30,
  binaryFilesChanged: 0,
  sensitiveFilesChanged: 0,
  packageManifestChanged: false,
  lockfileChanged: false,
  envExampleChanged: false,
  routeSurfaceChanged: false,
};

function sample(
  id: string,
  changedFiles: number,
  overrides: Partial<PrsHistorySample> = {}
): PrsHistorySample {
  return {
    id,
    source: 'prior_snapshot',
    recordedAt: `2026-07-${String(Number(id.replace(/\D/gu, '')) + 1).padStart(2, '0')}T00:00:00.000Z`,
    changedFiles,
    addedFiles: changedFiles,
    deletedFiles: 0,
    addedLines: changedFiles * 10,
    deletedLines: 0,
    sensitiveFilesChanged: 0,
    changedPaths: [],
    sensitivePaths: [],
    ...overrides,
  };
}

function commit(id: string, changedFiles: number, isB2gCommit: boolean): PrsCommitHistoryRecord {
  return {
    ...sample(id, changedFiles, { source: isB2gCommit ? 'b2g_commit' : 'github_commit' }),
    sha: `sha-${id}`,
    subject: `Commit ${id}`,
    isB2gCommit,
  };
}

function engineInput(overrides: Partial<Parameters<typeof buildHistoryBaseline>[0]> = {}) {
  return {
    current: currentComparison,
    currentChangedPaths: [],
    currentSensitivePaths: [],
    currentSourceFilesChanged: undefined,
    currentSourceLinesChanged: undefined,
    currentDependencyCount: undefined,
    priorSnapshots: [],
    githubCommits: [],
    ...overrides,
  };
}

const typedSource: HistorySource = 'prior_snapshot';
const typedLabel: HistoryBaselineLabel = 'normal_range';
const typedInput: HistoryBaselineInput = engineInput();
void typedSource;
void typedLabel;
void typedInput;

describe('Production Readiness Snapshot history baseline engine', () => {
  it('calculates median percentile and source-prioritized baselines', () => {
    expect(calculateMedian([100, 2, 8, 4, 6])).toBe(6);
    expect(calculateMedian([4, 2, 8, 6])).toBe(5);
    expect(calculateMedian([])).toBeNull();
    expect(calculatePercentileRank(6, [2, 4, 6, 8])).toBe(75);
    expect(calculatePercentileRank(6, [])).toBeNull();

    const priorSnapshots = [4, 6, 8, 10, 100].map((value, index) => sample(`s${index}`, value));
    const githubCommits = [3, 5, 7, 9, 11].map((value, index) => commit(`c${index}`, value, true));
    const result: HistoryBaselineResult = buildHistoryBaseline(
      engineInput({
        current: { ...currentComparison, changedFiles: 25 },
        priorSnapshots,
        githubCommits,
      })
    );
    const baseline: PrsHistoryBaseline | null = result.baseline;
    expect(baseline).toBe(result.baseline);

    expect(result.baseline).toMatchObject({
      source: 'prior_snapshot',
      sampleCount: 5,
      medianChangedFiles: 8,
      medianLineChanges: 80,
      changedFilesPercentile: 80,
      lineChangesPercentile: 80,
      label: 'larger_than_usual',
    });
    expect(result.signals.map((signal) => signal.id)).toEqual(['history-change-larger-than-usual']);

    const ignoresMalformedUnusedCommits = buildHistoryBaseline(
      engineInput({
        priorSnapshots,
        githubCommits: [{} as PrsCommitHistoryRecord],
      })
    );
    expect(ignoresMalformedUnusedCommits.baseline?.source).toBe('prior_snapshot');

    const b2gFallback = buildHistoryBaseline(engineInput({ priorSnapshots: [], githubCommits }));
    expect(b2gFallback.baseline?.source).toBe('b2g_commit');

    const validB2gWithMalformedRegular = buildHistoryBaseline(
      engineInput({
        githubCommits: [...githubCommits, {} as PrsCommitHistoryRecord],
      })
    );
    expect(validB2gWithMalformedRegular.baseline?.source).toBe('b2g_commit');

    const recentFallback = buildHistoryBaseline(
      engineInput({
        githubCommits: [3, 5, 7, 9, 11].map((value, index) => commit(`r${index}`, value, false)),
      })
    );
    expect(recentFallback.baseline?.source).toBe('github_commit');

    expect(() =>
      buildHistoryBaseline(
        engineInput({
          priorSnapshots: Array.from({ length: 5 }, () => sample('duplicate', 5)),
        })
      )
    ).toThrow(/duplicate history sample identity/u);
  });

  it('reports insufficient history as limitations not trend claims', () => {
    const empty = buildHistoryBaseline(engineInput());
    expect(empty.baseline).toBeNull();
    expect(empty.signals).toEqual([]);
    expect(empty.limitations).toEqual([
      'Not enough export history yet to judge whether this change is unusual.',
    ]);

    const exactFallbackBoundary = buildHistoryBaseline(
      engineInput({
        current: { ...currentComparison, changedFiles: 100 },
        currentSourceFilesChanged: 30,
      })
    );
    expect(exactFallbackBoundary.signals).toEqual([]);

    const fallback = buildHistoryBaseline(
      engineInput({
        current: { ...currentComparison, changedFiles: 100 },
        currentSourceFilesChanged: 31,
      })
    );
    expect(fallback.baseline).toBeNull();
    expect(fallback.signals.map((signal) => signal.id)).toEqual(['history-fallback-large-change']);
    expect(fallback.signals[0]).toMatchObject({
      category: 'change_history',
      severity: 'medium',
      deterministic: true,
    });
    expect(fallback.signals[0].message).not.toMatch(/usual|median|histor/iu);
  });

  it('identifies hotspot files and repeated sensitive churn', () => {
    const samples = [
      sample('s0', 4, {
        changedPaths: ['src/App.tsx', 'src/App.tsx', 'src/auth/session.ts'],
        sensitivePaths: ['src/auth/session.ts'],
      }),
      sample('s1', 5, {
        changedPaths: ['src/App.tsx', 'src/auth/session.ts'],
        sensitivePaths: ['src/auth/session.ts'],
      }),
      sample('s2', 6, {
        changedPaths: ['src/App.tsx', 'src/auth/session.ts'],
        sensitivePaths: ['src/auth/session.ts'],
      }),
      sample('s3', 7),
      sample('s4', 8),
    ];

    const hotspots: PrsHotspotFile[] = detectHistoryHotspots(samples);
    expect(hotspots).toEqual([
      { path: 'src/App.tsx', changeCount: 3, sensitiveChangeCount: 0 },
      { path: 'src/auth/session.ts', changeCount: 3, sensitiveChangeCount: 3 },
    ]);

    const result = buildHistoryBaseline(
      engineInput({
        priorSnapshots: samples,
        currentChangedPaths: ['src/auth/session.ts', 'src/App.tsx'],
        currentSensitivePaths: ['src/auth/session.ts'],
      })
    );
    expect(result.signals.map((signal) => signal.id)).toEqual([
      'history-hotspot-churn',
      'history-sensitive-churn',
    ]);
    expect(result.signals[1].evidence).toEqual([
      {
        kind: 'metric',
        label: 'Sensitive path changed across recent history',
        path: 'src/auth/session.ts',
        before: 3,
        after: 4,
      },
    ]);
  });

  it('emits large export and dependency drift signals only at documented boundaries', () => {
    const history = [0, 1, 2, 3, 4].map((index) =>
      sample(`s${index}`, 5, {
        addedLines: 80,
        deletedLines: 20,
        dependencyCount: 10 + index,
      })
    );
    const exactBoundary = buildHistoryBaseline(
      engineInput({
        current: { ...currentComparison, changedFiles: 15, addedLines: 240, deletedLines: 60 },
        currentDependencyCount: 14,
        priorSnapshots: history,
      })
    );
    expect(exactBoundary.signals.map((signal) => signal.id)).toEqual([
      'history-largest-recent-export',
    ]);

    const larger = buildHistoryBaseline(
      engineInput({
        current: { ...currentComparison, changedFiles: 16, addedLines: 301, deletedLines: 0 },
        currentDependencyCount: 15,
        priorSnapshots: history,
      })
    );
    expect(larger.signals.map((signal) => signal.id)).toEqual([
      'history-change-larger-than-usual',
      'history-dependency-growth',
      'history-largest-recent-export',
    ]);

    const lineOnly = buildHistoryBaseline(
      engineInput({
        current: { ...currentComparison, changedFiles: 5, addedLines: 501, deletedLines: 0 },
        priorSnapshots: history,
      })
    );
    expect(lineOnly.signals.map((signal) => signal.id)).toEqual([
      'history-change-larger-than-usual',
    ]);
    expect(lineOnly.signals[0].evidence).toEqual([
      {
        kind: 'metric',
        label: 'Changed lines compared with median',
        before: 100,
        after: 501,
      },
    ]);

    const critical = buildHistoryBaseline(
      engineInput({
        current: {
          ...currentComparison,
          changedFiles: 31,
          addedLines: 400,
          deletedLines: 100,
          sensitiveFilesChanged: 1,
        },
        priorSnapshots: history,
      })
    );
    expect(critical.signals.map((signal) => signal.id)).toEqual([
      'history-largest-recent-export',
      'history-unusually-large-change',
    ]);
    expect(critical.baseline?.label).toBe('unusually_large');
  });

  it('fetches bounded GitHub history and exposes unavailable history limitations', async () => {
    const readGitHubMock = vi.fn(async (endpoint: string): Promise<unknown> => {
      if (endpoint.includes('/commits?')) {
        return [
          {
            sha: 'b2g-sha',
            commit: {
              message: '[B2G] Export\nprivate commit body',
              committer: { date: '2026-07-02T00:00:00.000Z' },
              author: { email: 'private@example.com' },
            },
          },
          {
            sha: 'regular-sha',
            commit: {
              message: 'Regular change',
              committer: { date: '2026-07-01T00:00:00.000Z' },
            },
          },
        ] as never;
      }
      if (endpoint.includes('/b2g-sha?')) {
        return {
          stats: { additions: 40, deletions: 10 },
          files: [
            { filename: 'src/App.tsx', status: 'modified' },
            { filename: 'src/auth/session.ts', status: 'added' },
          ],
        } as never;
      }
      return {
        stats: { additions: 5, deletions: 2 },
        files: [{ filename: 'README.md', status: 'modified' }],
      } as never;
    });

    const readGitHub = readGitHubMock as GitHubHistoryReader;
    const request: GitHubHistoryRequest = {
      owner: 'codefrost-dev',
      repo: 'sample',
      baseRef: 'main',
      maxCommits: 2,
      readGitHub,
      isSensitivePath: (path) => path.includes('/auth/'),
    };
    const result: GitHubHistoryResult = await fetchPrsCommitHistory(request);

    expect(readGitHubMock.mock.calls[0][0]).toBe(
      '/repos/codefrost-dev/sample/commits?sha=main&per_page=2'
    );
    expect(result.limitations).toEqual([]);
    expect(result.records.map((record) => record.sha)).toEqual(['regular-sha', 'b2g-sha']);
    expect(result.records[1]).toMatchObject({
      subject: '[B2G] Export',
      isB2gCommit: true,
      changedFiles: 2,
      addedFiles: 1,
      addedLines: 40,
      deletedLines: 10,
      sensitiveFilesChanged: 1,
      changedPaths: ['src/App.tsx', 'src/auth/session.ts'],
      sensitivePaths: ['src/auth/session.ts'],
    });
    expect(JSON.stringify(result)).not.toContain('private commit body');
    expect(JSON.stringify(result)).not.toContain('private@example.com');

    const paginatedReaderMock = vi.fn(async (endpoint: string): Promise<unknown> => {
      if (endpoint.includes('/commits?')) {
        return [
          {
            sha: 'large-sha',
            commit: {
              message: 'Large commit',
              committer: { date: '2026-07-03T00:00:00.000Z' },
            },
          },
        ];
      }
      if (endpoint.endsWith('page=1')) {
        return {
          stats: { additions: 200, deletions: 10 },
          files: Array.from({ length: 100 }, (_, index) => ({
            filename: `src/file-${String(index).padStart(3, '0')}.ts`,
            status: 'modified',
          })),
        };
      }
      return {
        stats: { additions: 200, deletions: 10 },
        files: [{ filename: 'src/final.ts', status: 'added' }],
      };
    });
    const paginated = await fetchPrsCommitHistory({
      owner: 'codefrost-dev',
      repo: 'sample',
      baseRef: 'main',
      maxCommits: 1,
      readGitHub: paginatedReaderMock as GitHubHistoryReader,
    });
    expect(paginated.records[0]).toMatchObject({ changedFiles: 101, addedFiles: 1 });
    expect(paginatedReaderMock.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      '/repos/codefrost-dev/sample/commits?sha=main&per_page=1',
      '/repos/codefrost-dev/sample/commits/large-sha?per_page=100&page=1',
      '/repos/codefrost-dev/sample/commits/large-sha?per_page=100&page=2',
    ]);

    const duplicateReader: GitHubHistoryReader = async (endpoint) => {
      if (endpoint.includes('/commits?')) {
        return [
          {
            sha: 'duplicate-sha',
            commit: { message: 'First', committer: { date: '2026-07-01T00:00:00.000Z' } },
          },
          {
            sha: 'duplicate-sha',
            commit: { message: 'Duplicate', committer: { date: '2026-07-02T00:00:00.000Z' } },
          },
        ] as never;
      }
      return {
        stats: { additions: 1, deletions: 0 },
        files: [{ filename: 'src/file.ts', status: 'modified' }],
      } as never;
    };
    const duplicateCommits = await fetchPrsCommitHistory({
      owner: 'codefrost-dev',
      repo: 'sample',
      baseRef: 'main',
      maxCommits: 2,
      readGitHub: duplicateReader,
    });
    expect(duplicateCommits.records.map((record) => record.sha)).toEqual(['duplicate-sha']);
    expect(duplicateCommits.limitations[0].message).toContain('duplicate commit metadata');

    const oversizedPathReader: GitHubHistoryReader = async (endpoint) => {
      if (endpoint.includes('/commits?')) {
        return [
          {
            sha: 'bounded-sha',
            commit: { message: 'Bounded', committer: { date: '2026-07-01T00:00:00.000Z' } },
          },
        ] as never;
      }
      return {
        stats: { additions: 1, deletions: 0 },
        files: [{ filename: `src/${'x'.repeat(1_001)}.ts`, status: 'modified' }],
      } as never;
    };
    const oversizedPath = await fetchPrsCommitHistory({
      owner: 'codefrost-dev',
      repo: 'sample',
      baseRef: 'main',
      maxCommits: 1,
      readGitHub: oversizedPathReader,
    });
    expect(oversizedPath.records).toEqual([]);
    expect(oversizedPath.limitations[0].message).toContain('could not be read');

    const oversizedMetadata = await fetchPrsCommitHistory({
      owner: 'codefrost-dev',
      repo: 'sample',
      baseRef: 'main',
      maxCommits: 2,
      readGitHub: (async (endpoint: string) => {
        if (!endpoint.includes('/commits?')) throw new Error('detail should not be requested');
        return [
          {
            sha: 's'.repeat(101),
            commit: { message: 'Long SHA', committer: { date: '2026-07-01T00:00:00.000Z' } },
          },
          {
            sha: 'valid-sha',
            commit: {
              message: 'Long date',
              committer: { date: `2026-07-01T00:00:00.000Z${' '.repeat(51)}` },
            },
          },
        ];
      }) as GitHubHistoryReader,
    });
    expect(oversizedMetadata.records).toEqual([]);
    expect(oversizedMetadata.limitations).toHaveLength(2);

    let detailReads = 0;
    const partialRateLimitReader: GitHubHistoryReader = async (endpoint) => {
      if (endpoint.includes('/commits?')) {
        return [
          {
            sha: 'completed-sha',
            commit: { message: 'Completed', committer: { date: '2026-07-01T00:00:00.000Z' } },
          },
          {
            sha: 'limited-sha',
            commit: { message: 'Limited', committer: { date: '2026-07-02T00:00:00.000Z' } },
          },
        ] as never;
      }
      detailReads += 1;
      if (detailReads === 2) {
        throw Object.assign(new Error('rate limit exceeded'), { status: 403 });
      }
      return {
        stats: { additions: 5, deletions: 0 },
        files: [{ filename: 'src/completed.ts', status: 'modified' }],
      } as never;
    };
    const partiallyAvailable = await fetchPrsCommitHistory({
      owner: 'codefrost-dev',
      repo: 'sample',
      baseRef: 'main',
      maxCommits: 2,
      readGitHub: partialRateLimitReader,
    });
    expect(partiallyAvailable.records.map((record) => record.sha)).toEqual(['completed-sha']);
    expect(partiallyAvailable.limitations).toEqual([
      {
        source: 'rate_limit',
        message: 'GitHub API rate limit stopped history collection for codefrost-dev/sample.',
        confidenceImpact: 'medium',
      },
    ]);

    let forbiddenReads = 0;
    const opaqueForbiddenReader: GitHubHistoryReader = async (endpoint) => {
      if (endpoint.includes('/commits?')) {
        return [
          {
            sha: 'allowed-sha',
            commit: { message: 'Allowed', committer: { date: '2026-07-01T00:00:00.000Z' } },
          },
          {
            sha: 'forbidden-sha',
            commit: { message: 'Forbidden', committer: { date: '2026-07-02T00:00:00.000Z' } },
          },
          {
            sha: 'must-not-run',
            commit: { message: 'Skipped', committer: { date: '2026-07-03T00:00:00.000Z' } },
          },
        ] as never;
      }
      forbiddenReads += 1;
      if (forbiddenReads === 2) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }
      return {
        stats: { additions: 1, deletions: 0 },
        files: [{ filename: 'src/allowed.ts', status: 'modified' }],
      } as never;
    };
    const forbidden = await fetchPrsCommitHistory({
      owner: 'codefrost-dev',
      repo: 'sample',
      baseRef: 'main',
      maxCommits: 3,
      readGitHub: opaqueForbiddenReader,
    });
    expect(forbiddenReads).toBe(2);
    expect(forbidden.records.map((record) => record.sha)).toEqual(['allowed-sha']);
    expect(forbidden.limitations).toEqual([
      {
        source: 'history',
        message: 'GitHub denied further history collection for codefrost-dev/sample.',
        confidenceImpact: 'medium',
      },
    ]);

    const rateLimitedReader: GitHubHistoryReader = async () => {
      throw Object.assign(new Error('rate limit exceeded'), { status: 403 });
    };
    const unavailable = await fetchPrsCommitHistory({
      owner: 'codefrost-dev',
      repo: 'sample',
      baseRef: 'main',
      maxCommits: 10,
      readGitHub: rateLimitedReader,
    });
    expect(unavailable.records).toEqual([]);
    expect(unavailable.limitations).toEqual([
      {
        source: 'rate_limit',
        message: 'GitHub API rate limit prevented history collection for codefrost-dev/sample.',
        confidenceImpact: 'medium',
      },
    ]);

    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchPrsCommitHistory({
        owner: 'codefrost-dev',
        repo: 'sample',
        baseRef: 'main',
        maxCommits: 10,
        readGitHub,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('stores bounded metadata-only prior snapshot summaries', async () => {
    const values = new Map<string, unknown>();
    const storage: PrsSnapshotStorage = {
      get: async (key) => values.get(key),
      set: async (key, value) => {
        values.set(key, value);
      },
    };

    for (let index = 0; index < 31; index++) {
      const snapshot: ReadinessSnapshot = structuredClone(
        loadPrsFixture('auth-env-change').goldenSnapshot!
      );
      snapshot.generatedAt = `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`;
      snapshot.candidate.id = `snapshot-${index}`;
      snapshot.signals[1].evidence[0].after = 'must-never-be-persisted';
      snapshot.signals[0].evidence.push({
        kind: 'dependency',
        label: `changed-dependency-${index}`,
      });
      await savePrsSnapshotSummary(snapshot, storage);
    }

    const loaded: PriorSnapshotLoadResult = await loadPriorPrsSnapshots(
      { owner: 'codefrost-dev', name: 'sample-bolt-project' },
      storage
    );
    expect(loaded.limitations).toEqual([]);
    expect(loaded.samples).toHaveLength(30);
    expect(loaded.samples[0].id).toBe('snapshot-1');
    expect(loaded.samples.at(-1)?.id).toBe('snapshot-30');
    expect(loaded.samples.at(-1)).toMatchObject({
      source: 'prior_snapshot',
      changedFiles: 1,
      addedFiles: 1,
      sensitiveFilesChanged: 2,
      changedPaths: ['.env.example', 'src/lib/auth.ts'],
      sensitivePaths: ['.env.example', 'src/lib/auth.ts'],
    });
    expect(loaded.samples.at(-1)?.dependencyCount).toBeUndefined();
    const storedTrend = buildHistoryBaseline(
      engineInput({
        priorSnapshots: loaded.samples.slice(-5),
        currentDependencyCount: 100,
      })
    );
    expect(storedTrend.signals.map((signal) => signal.id)).not.toContain(
      'history-dependency-growth'
    );
    expect(JSON.stringify([...values.values()])).not.toContain('must-never-be-persisted');

    const dottedSnapshot: ReadinessSnapshot = structuredClone(
      loadPrsFixture('auth-env-change').goldenSnapshot!
    );
    dottedSnapshot.repository.name = 'sample.project.js';
    await savePrsSnapshotSummary(dottedSnapshot, storage);
    const dotted = await loadPriorPrsSnapshots(
      { owner: 'codefrost-dev', name: 'sample.project.js' },
      storage
    );
    expect(dotted.samples).toHaveLength(1);

    const poisonedStorage: PrsSnapshotStorage = {
      get: async () => [
        {
          ...loaded.samples[0],
          rawSource: 'private raw source',
          authorEmail: 'private@example.com',
          secretValue: 'top-secret',
        },
      ],
      set: async () => undefined,
    };
    const projected = await loadPriorPrsSnapshots(
      { owner: 'codefrost-dev', name: 'sample-bolt-project' },
      poisonedStorage
    );
    expect(projected.samples).toHaveLength(1);
    expect(JSON.stringify(projected)).not.toMatch(/private raw source|private@example|top-secret/u);

    const overLimitStorage: PrsSnapshotStorage = {
      get: async () => [
        {
          ...loaded.samples[0],
          changedPaths: Array.from({ length: 501 }, (_, index) => `src/file-${index}.ts`),
        },
      ],
      set: async () => undefined,
    };
    const overLimit = await loadPriorPrsSnapshots(
      { owner: 'codefrost-dev', name: 'sample-bolt-project' },
      overLimitStorage
    );
    expect(overLimit.samples).toEqual([]);
    expect(overLimit.limitations[0]).toContain('invalid and was ignored');

    const duplicateStorage: PrsSnapshotStorage = {
      get: async () => [loaded.samples[0], loaded.samples[0]],
      set: async () => undefined,
    };
    const duplicateSnapshots = await loadPriorPrsSnapshots(
      { owner: 'codefrost-dev', name: 'sample-bolt-project' },
      duplicateStorage
    );
    expect(duplicateSnapshots.samples).toEqual([]);
    expect(duplicateSnapshots.limitations[0]).toContain('invalid and was ignored');

    const oversizedStorage: PrsSnapshotStorage = {
      get: async () => Array.from({ length: 31 }, () => loaded.samples[0]),
      set: async () => undefined,
    };
    const oversized = await loadPriorPrsSnapshots(
      { owner: 'codefrost-dev', name: 'sample-bolt-project' },
      oversizedStorage
    );
    expect(oversized.samples).toEqual([]);
    expect(oversized.limitations[0]).toContain('invalid and was ignored');

    const unavailableStorage: PrsSnapshotStorage = {
      get: async () => {
        throw new Error('Storage unavailable');
      },
      set: async () => undefined,
    };
    const unavailable = await loadPriorPrsSnapshots(
      { owner: 'codefrost-dev', name: 'sample-bolt-project' },
      unavailableStorage
    );
    expect(unavailable).toEqual({
      samples: [],
      limitations: ['Local PRS history could not be read for codefrost-dev/sample-bolt-project.'],
    });

    const invalidStorage: PrsSnapshotStorage = {
      get: async () => [{ source: 'prior_snapshot' }],
      set: async () => undefined,
    };
    const invalid = await loadPriorPrsSnapshots(
      { owner: 'codefrost-dev', name: 'invalid' },
      invalidStorage
    );
    expect(invalid.samples).toEqual([]);
    expect(invalid.limitations).toEqual([
      'Stored PRS history for codefrost-dev/invalid was invalid and was ignored.',
    ]);
  });
});
