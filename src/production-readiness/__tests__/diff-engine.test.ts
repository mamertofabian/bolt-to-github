import { describe, expect, it } from 'vitest';

import {
  compareInventories,
  type DiffEngineOptions,
  type FileDiffEntry,
  type InventoryComparisonSummary,
  type InventoryDiffResult,
  type LineDelta,
} from '../diff/diffEngine';
import type { GitHubBaseInventoryResult } from '../inventory/githubBaseInventory';
import type { FileInventory } from '../inventory/zipInventory';
import {
  createInventoryDiffFixture,
  type InventoryDiffFixture,
  type InventoryDiffFixtureName,
} from '../test-fixtures/prs/diff-cases';

function fixture(name: InventoryDiffFixtureName): InventoryDiffFixture {
  return createInventoryDiffFixture(name);
}

function entryAt(result: InventoryDiffResult, path: string): FileDiffEntry {
  const entry = result.entries.find((candidate) => candidate.path === path);
  expect(entry, `Expected diff entry for ${path}`).toBeDefined();
  return entry as FileDiffEntry;
}

describe('Production Readiness Snapshot inventory diff engine', () => {
  it('changed added and deleted counts match fixtures', () => {
    const input = fixture('core');
    const options: DiffEngineOptions = {
      ...input.options,
      detectRenames: true,
      maxLineDiffFileBytes: 1_000_000,
      candidateBlobShasByPath: input.options.candidateBlobShasByPath,
      baseBinaryPaths: new Set(),
    };
    const result: InventoryDiffResult = compareInventories(input.candidate, input.base, options);
    const expectedSummary: InventoryComparisonSummary = {
      changedFiles: 1,
      addedFiles: 1,
      deletedFiles: 1,
      renamedFiles: 1,
      indeterminateFiles: 0,
      addedLines: 2,
      deletedLines: 2,
      binaryFilesChanged: 0,
    };

    expect(result.summary).toEqual(expectedSummary);
    expect(result.entries.map((entry) => `${entry.status}:${entry.path}`)).toEqual([
      'added:added.txt',
      'changed:changed.txt',
      'deleted:deleted.txt',
      'renamed:new-name.txt',
    ]);
    expect(entryAt(result, 'new-name.txt')).toEqual({
      path: 'new-name.txt',
      previousPath: 'old-name.txt',
      status: 'renamed',
      binary: false,
      lineDiffEligible: true,
      addedLines: 0,
      deletedLines: 0,
    });
    expect(result.entries.some((entry) => entry.path === 'same.txt')).toBe(false);

    const uncertainCandidate: FileInventory = {
      entries: [
        {
          ...input.candidate.entries[0],
          path: 'uncertain.txt',
          contentKind: 'uninspected',
        },
      ],
      limitations: [],
    };
    const uncertainBase: GitHubBaseInventoryResult = {
      ...input.base,
      entries: [{ ...input.base.entries[0], path: 'uncertain.txt' }],
    };
    const uncertain = compareInventories(uncertainCandidate, uncertainBase);
    expect(entryAt(uncertain, 'uncertain.txt').status).toBe('indeterminate');
    expect(uncertain.summary.indeterminateFiles).toBe(1);
    expect(uncertain.limitations).toContain(
      'Candidate Git blob SHA unavailable for same-size file: uncertain.txt.'
    );

    const unknownChangedBaseBinary = compareInventories(
      {
        entries: [
          {
            ...input.candidate.entries[0],
            path: 'changed-unknown.txt',
            sizeBytes: 5,
          },
        ],
        limitations: [],
      },
      {
        ...input.base,
        entries: [{ ...input.base.entries[0], path: 'changed-unknown.txt', sizeBytes: 4 }],
      }
    );
    expect(entryAt(unknownChangedBaseBinary, 'changed-unknown.txt')).toMatchObject({
      status: 'changed',
      binary: undefined,
      lineDiffEligible: false,
    });
    expect(unknownChangedBaseBinary.limitations).toContain(
      'Binary classification unavailable for file: changed-unknown.txt.'
    );

    const unknownAddedCandidate = compareInventories(
      {
        entries: [
          {
            ...input.candidate.entries[0],
            path: 'added-unknown.dat',
            contentKind: 'uninspected',
            lineCount: undefined,
            lineDiffEligible: false,
          },
        ],
        limitations: [],
      },
      { ...input.base, entries: [] },
      { baseBinaryPaths: new Set() }
    );
    expect(entryAt(unknownAddedCandidate, 'added-unknown.dat')).toMatchObject({
      status: 'added',
      binary: undefined,
      lineDiffEligible: false,
    });
    expect(unknownAddedCandidate.limitations).toContain(
      'Binary classification unavailable for file: added-unknown.dat.'
    );

    const noRenames = compareInventories(input.candidate, input.base, {
      ...input.options,
      detectRenames: false,
    });
    expect(noRenames.summary).toMatchObject({
      addedFiles: 2,
      deletedFiles: 2,
      renamedFiles: 0,
    });

    const ambiguousCandidate: FileInventory = {
      entries: [
        { ...input.candidate.entries[0], path: 'new-a.txt' },
        { ...input.candidate.entries[0], path: 'new-b.txt' },
      ],
      limitations: [],
    };
    const ambiguousBase: GitHubBaseInventoryResult = {
      ...input.base,
      entries: [
        { ...input.base.entries[0], path: 'old-a.txt', blobSha: 'shared-blob' },
        { ...input.base.entries[0], path: 'old-b.txt', blobSha: 'shared-blob' },
      ],
    };
    const ambiguous = compareInventories(ambiguousCandidate, ambiguousBase, {
      detectRenames: true,
      candidateBlobShasByPath: {
        'new-a.txt': 'shared-blob',
        'new-b.txt': 'shared-blob',
      },
    });
    expect(ambiguous.summary).toMatchObject({
      addedFiles: 2,
      deletedFiles: 2,
      renamedFiles: 0,
    });
    expect(ambiguous.limitations).toContain(
      'Rename detection ambiguous for Git blob SHA: shared-blob.'
    );

    const binaryRename = compareInventories(
      {
        entries: [
          {
            ...input.candidate.entries[0],
            path: 'new-logo.dat',
            contentKind: 'uninspected',
            lineCount: undefined,
            lineDiffEligible: false,
          },
        ],
        limitations: [],
      },
      {
        ...input.base,
        entries: [{ ...input.base.entries[0], path: 'old-logo.dat', blobSha: 'binary-blob' }],
      },
      {
        candidateBlobShasByPath: { 'new-logo.dat': 'binary-blob' },
        baseBinaryPaths: new Set(['old-logo.dat']),
      }
    );
    expect(entryAt(binaryRename, 'new-logo.dat')).toMatchObject({
      previousPath: 'old-logo.dat',
      status: 'renamed',
      binary: true,
      lineDiffEligible: false,
    });

    const unknownBinaryRename = compareInventories(
      {
        entries: [
          {
            ...input.candidate.entries[0],
            path: 'new-unknown.dat',
            contentKind: 'uninspected',
            lineCount: undefined,
            lineDiffEligible: false,
          },
        ],
        limitations: [],
      },
      {
        ...input.base,
        entries: [{ ...input.base.entries[0], path: 'old-unknown.dat', blobSha: 'unknown-blob' }],
      },
      {
        candidateBlobShasByPath: { 'new-unknown.dat': 'unknown-blob' },
      }
    );
    expect(entryAt(unknownBinaryRename, 'new-unknown.dat')).toMatchObject({
      status: 'renamed',
      binary: undefined,
      lineDiffEligible: false,
    });
    expect(unknownBinaryRename.limitations).toContain(
      'Binary classification unavailable for file: new-unknown.dat.'
    );

    const partialBase: GitHubBaseInventoryResult = {
      ...input.base,
      entries: [],
      partial: true,
      limitations: [
        {
          source: 'github_base',
          confidenceImpact: 'low',
          message: 'GitHub base inventory is partial.',
        },
      ],
    };
    const partial = compareInventories(
      { entries: [input.candidate.entries[0]], limitations: [] },
      partialBase,
      input.options
    );
    expect(entryAt(partial, 'same.txt').status).toBe('indeterminate');
    expect(partial.summary.addedFiles).toBe(0);
    expect(partial.limitations).toContain('GitHub base inventory is partial.');

    expect(() =>
      compareInventories(
        {
          entries: [input.candidate.entries[0], input.candidate.entries[0]],
          limitations: [],
        },
        input.base
      )
    ).toThrow('candidate inventory contains duplicate path: same.txt');
    expect(() =>
      compareInventories(input.candidate, {
        ...input.base,
        entries: [input.base.entries[0], input.base.entries[0]],
      })
    ).toThrow('base inventory contains duplicate path: same.txt');
  });

  it('text line deltas are correct', () => {
    const input = fixture('line-deltas');
    const delta: LineDelta = input.options.lineDeltasByPath?.['changed.txt'] as LineDelta;
    const result = compareInventories(input.candidate, input.base, input.options);

    expect(delta).toEqual({ addedLines: 2, deletedLines: 1 });
    expect(entryAt(result, 'changed.txt')).toMatchObject({
      status: 'changed',
      lineDiffEligible: true,
      addedLines: 2,
      deletedLines: 1,
    });
    expect(entryAt(result, 'added.txt')).toMatchObject({
      status: 'added',
      addedLines: 2,
      deletedLines: 0,
    });
    expect(entryAt(result, 'deleted.txt')).toMatchObject({
      status: 'deleted',
      addedLines: 0,
      deletedLines: 2,
    });
    expect(result.summary).toMatchObject({
      addedLines: 4,
      deletedLines: 3,
    });

    const missingAddedLineCount = compareInventories(
      {
        entries: [
          {
            ...input.candidate.entries[0],
            lineCount: undefined,
            lineDiffEligible: true,
          },
        ],
        limitations: [],
      },
      { ...input.base, entries: [] },
      input.options
    );
    expect(entryAt(missingAddedLineCount, 'added.txt').lineDiffEligible).toBe(false);
    expect(missingAddedLineCount.limitations).toContain(
      'Line delta unavailable for added text file: added.txt.'
    );

    expect(() =>
      compareInventories(input.candidate, input.base, {
        ...input.options,
        lineDeltasByPath: {
          'changed.txt': { addedLines: -1, deletedLines: 0 },
        },
      })
    ).toThrow('lineDeltasByPath[changed.txt].addedLines must be a non-negative safe integer');
    expect(() =>
      compareInventories(input.candidate, input.base, {
        ...input.options,
        lineDeltasByPath: {
          ...input.options.lineDeltasByPath,
          'added.txt': { addedLines: 2, deletedLines: 1 },
        },
      })
    ).toThrow('lineDeltasByPath[added.txt].deletedLines must be zero for an added file');
    expect(() =>
      compareInventories(input.candidate, input.base, {
        ...input.options,
        lineDeltasByPath: {
          ...input.options.lineDeltasByPath,
          'added.txt': { addedLines: 99, deletedLines: 0 },
        },
      })
    ).toThrow('lineDeltasByPath[added.txt].addedLines must match the candidate line count');
    expect(() =>
      compareInventories(input.candidate, input.base, {
        ...input.options,
        lineDeltasByPath: {
          ...input.options.lineDeltasByPath,
          'deleted.txt': { addedLines: 1, deletedLines: 2 },
        },
      })
    ).toThrow('lineDeltasByPath[deleted.txt].addedLines must be zero for a deleted file');
  });

  it('large files can be skipped with limitations', () => {
    const input = fixture('large-files');
    const result = compareInventories(input.candidate, input.base, input.options);

    expect(entryAt(result, 'src/generated.ts')).toMatchObject({
      status: 'changed',
      binary: false,
      lineDiffEligible: false,
      addedLines: undefined,
      deletedLines: undefined,
    });
    expect(result.summary.changedFiles).toBe(1);
    expect(result.limitations).toEqual([
      'Candidate ZIP skipped line analysis for src/generated.ts.',
      'Line diff skipped for large file: src/generated.ts.',
    ]);
    expect(() =>
      compareInventories(input.candidate, input.base, {
        ...input.options,
        maxLineDiffFileBytes: -1,
      })
    ).toThrow('maxLineDiffFileBytes must be a non-negative safe integer');
  });

  it('binary file changes are counted separately', () => {
    const input = fixture('binary-files');
    const result = compareInventories(input.candidate, input.base, input.options);

    expect(result.summary).toMatchObject({
      changedFiles: 1,
      addedFiles: 1,
      deletedFiles: 1,
      binaryFilesChanged: 3,
      addedLines: 0,
      deletedLines: 0,
    });
    for (const path of ['assets/logo.png', 'assets/new.wasm', 'assets/old.pdf']) {
      expect(entryAt(result, path)).toMatchObject({
        binary: true,
        lineDiffEligible: false,
        addedLines: undefined,
        deletedLines: undefined,
      });
    }
    expect(result.limitations).toEqual([
      'Line diff unavailable for binary file: assets/logo.png.',
      'Line diff unavailable for binary file: assets/new.wasm.',
      'Line diff unavailable for binary file: assets/old.pdf.',
    ]);

    const unknownBaseBinary = compareInventories(
      { entries: [], limitations: [] },
      {
        ...input.base,
        entries: [input.base.entries[1]],
      }
    );
    expect(entryAt(unknownBaseBinary, 'assets/old.pdf')).toMatchObject({
      status: 'deleted',
      binary: undefined,
      lineDiffEligible: false,
    });
    expect(unknownBaseBinary.summary.binaryFilesChanged).toBe(0);
    expect(unknownBaseBinary.limitations).toContain(
      'Binary classification unavailable for file: assets/old.pdf.'
    );
  });
});
