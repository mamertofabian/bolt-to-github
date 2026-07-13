import { describe, expect, it } from 'vitest';
import {
  compareInventories,
  type DiffEngineOptions,
  type FileDiffEntry,
  type FileDiffStatus,
  type FileDiffSummary,
  type InventoryDiffInput,
  type InventoryDiffResult,
} from '../diff/diffEngine';
import {
  createInventoryDiffFixture,
  type InventoryDiffFixture,
} from '../test-fixtures/prs/diff-cases';

describe('Production Readiness Snapshot diff engine', () => {
  it('changed added and deleted counts match fixtures', () => {
    const fixture: InventoryDiffFixture = createInventoryDiffFixture('mixed');
    const input: InventoryDiffInput = fixture.input;
    const options: DiffEngineOptions = {
      detectRenames: fixture.options?.detectRenames ?? true,
      maxLineDiffBytes: fixture.options?.maxLineDiffBytes ?? 1024 * 1024,
      maxLineDiffCells: fixture.options?.maxLineDiffCells ?? 250_000,
    };
    const result: InventoryDiffResult = compareInventories(input, options);
    const statuses: FileDiffStatus[] = result.files.map(({ status }) => status);
    const summary: FileDiffSummary = result.summary;

    expect(input.baseContentByPath?.get('src/App.ts')?.textContent).toBe('a\nb\n');
    expect(result.complete).toBe(true);
    expect(summary).toEqual({
      changedFiles: 1,
      addedFiles: 1,
      deletedFiles: 1,
      renamedFiles: 1,
      addedLines: 4,
      deletedLines: 3,
      binaryFilesChanged: 0,
    } satisfies FileDiffSummary);
    expect(statuses).toEqual(['renamed', 'changed', 'added', 'deleted']);
    expect(result.files.map(({ path }) => path)).toEqual([
      'new-name.ts',
      'src/App.ts',
      'src/new.ts',
      'src/old.ts',
    ]);
    expect(result.files).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'README.md' })])
    );
    expect(result.limitations).toEqual([]);

    const second = createInventoryDiffFixture('mixed');
    expect(second).not.toBe(fixture);
    expect(second.input.candidate.entries).not.toBe(fixture.input.candidate.entries);
    for (const unknownName of ['missing', '__proto__', 'constructor']) {
      expect(() => createInventoryDiffFixture(unknownName)).toThrowError(
        `Unknown inventory diff fixture: ${unknownName}`
      );
    }
  });

  it('text line deltas are correct', () => {
    const result = compareInventories(createInventoryDiffFixture('mixed').input);
    const changed: FileDiffEntry | undefined = result.files.find(
      ({ status }) => status === 'changed'
    );

    expect(changed).toMatchObject({
      path: 'src/App.ts',
      status: 'changed',
      beforeGitBlobSha: 'old-app',
      afterGitBlobSha: 'new-app',
      sizeBeforeBytes: 4,
      sizeAfterBytes: 6,
      lineDiffSkipped: false,
      addedLines: 2,
      deletedLines: 1,
      isBinary: false,
    });
    expect(result.files.find(({ status }) => status === 'added')).toMatchObject({
      addedLines: 2,
      deletedLines: 0,
    });
    expect(result.files.find(({ status }) => status === 'deleted')).toMatchObject({
      addedLines: 0,
      deletedLines: 2,
    });
    expect(result.files.find(({ status }) => status === 'renamed')).toMatchObject({
      path: 'new-name.ts',
      previousPath: 'old-name.ts',
      lineDiffSkipped: false,
      addedLines: 0,
      deletedLines: 0,
    });

    const lineEndings = compareInventories(createInventoryDiffFixture('line-endings').input);
    expect(lineEndings.complete).toBe(true);
    expect(lineEndings.summary).toMatchObject({
      changedFiles: 2,
      addedLines: 3,
      deletedLines: 3,
    });
    expect(lineEndings.files).toEqual([
      expect.objectContaining({ path: 'src/crlf.ts', addedLines: 2, deletedLines: 2 }),
      expect.objectContaining({
        path: 'src/final-newline.ts',
        addedLines: 1,
        deletedLines: 1,
      }),
    ]);
  });

  it('large files can be skipped with limitations', () => {
    const largeFixture = createInventoryDiffFixture('large');
    const large = compareInventories(largeFixture.input, largeFixture.options);

    expect(large.complete).toBe(false);
    expect(large.files).toEqual([
      expect.objectContaining({
        path: 'src/large.ts',
        status: 'changed',
        lineDiffSkipped: true,
        addedLines: undefined,
        deletedLines: undefined,
      }),
    ]);
    expect(large.summary.addedLines).toBeUndefined();
    expect(large.summary.deletedLines).toBeUndefined();
    expect(large.limitations).toEqual([
      {
        source: 'large_file_diff',
        message: 'Skipped line diff for large or metadata-only file: src/large.ts',
        confidenceImpact: 'medium',
      },
    ]);

    const partial = compareInventories(createInventoryDiffFixture('partial').input);
    expect(partial.complete).toBe(false);
    expect(partial.files.map(({ path }) => path)).toEqual(['known-deleted.ts', 'shared.ts']);
    expect(partial.files.some(({ path }) => path === 'maybe-existing.ts')).toBe(false);
    expect(partial.summary).toMatchObject({
      changedFiles: 1,
      addedFiles: 0,
      deletedFiles: 1,
      renamedFiles: 0,
    });
    expect(partial.limitations).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'github_base' })])
    );

    const cellBounded = compareInventories(createInventoryDiffFixture('mixed').input, {
      maxLineDiffCells: 1,
    });
    expect(cellBounded.complete).toBe(false);
    expect(cellBounded.limitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'large_file_diff',
          message: 'Skipped line diff over byte or computation budget: src/App.ts',
        }),
      ])
    );

    const byteBounded = compareInventories(createInventoryDiffFixture('mixed').input, {
      maxLineDiffBytes: 5,
    });
    expect(byteBounded.limitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Skipped line count for large or metadata-only added file: src/new.ts',
        }),
      ])
    );

    const unhydratedFixture = createInventoryDiffFixture('mixed');
    const unhydratedContent = new Map(unhydratedFixture.input.baseContentByPath);
    unhydratedContent.delete('src/App.ts');
    unhydratedFixture.input.baseContentByPath = unhydratedContent;
    const unhydrated = compareInventories(unhydratedFixture.input);
    expect(unhydrated.complete).toBe(false);
    expect(unhydrated.limitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Skipped line diff because GitHub base text was unavailable: src/App.ts',
        }),
      ])
    );

    const limitedFixture = createInventoryDiffFixture('mixed');
    const firstLimit = {
      source: 'rate_limit' as const,
      message: 'Selective base content was unavailable.',
      confidenceImpact: 'low' as const,
    };
    const secondLimit = { ...firstLimit, confidenceImpact: 'high' as const };
    limitedFixture.input.baseContentByPath = new Map([
      ['src/old.ts', { path: 'src/old.ts', isBinary: undefined, limitation: secondLimit }],
      ['src/App.ts', { path: 'src/App.ts', isBinary: undefined, limitation: firstLimit }],
    ]);
    const limited = compareInventories(limitedFixture.input);
    expect(limited.limitations.filter(({ source }) => source === 'rate_limit')).toEqual([
      firstLimit,
      secondLimit,
    ]);

    const unavailableFixture = createInventoryDiffFixture('mixed');
    unavailableFixture.input.base.base = undefined;
    unavailableFixture.input.base.complete = false;
    unavailableFixture.input.base.limitations = [
      {
        source: 'rate_limit',
        message: 'GitHub base inventory is unavailable.',
        confidenceImpact: 'high',
      },
      {
        source: 'rate_limit',
        message: 'GitHub base inventory is unavailable.',
        confidenceImpact: 'low',
      },
      {
        source: 'github_base',
        message: 'GitHub base inventory is unavailable.',
        confidenceImpact: 'medium',
      },
    ];
    const unavailable = compareInventories(unavailableFixture.input);
    expect(unavailable.limitations).toEqual([
      {
        source: 'github_base',
        message: 'GitHub base inventory is unavailable.',
        confidenceImpact: 'medium',
      },
      {
        source: 'rate_limit',
        message: 'GitHub base inventory is unavailable.',
        confidenceImpact: 'low',
      },
      {
        source: 'rate_limit',
        message: 'GitHub base inventory is unavailable.',
        confidenceImpact: 'high',
      },
    ]);
  });

  it('binary file changes are counted separately', () => {
    const binary = compareInventories(createInventoryDiffFixture('binary').input);

    expect(binary.complete).toBe(true);
    expect(binary.summary).toMatchObject({
      changedFiles: 1,
      deletedFiles: 1,
      binaryFilesChanged: 2,
      addedLines: 0,
      deletedLines: 0,
    });
    expect(binary.files).toEqual([
      expect.objectContaining({
        path: 'assets/legacy.bin',
        status: 'deleted',
        isBinary: true,
        lineDiffSkipped: true,
      }),
      expect.objectContaining({
        path: 'assets/logo.bin',
        status: 'changed',
        isBinary: true,
        lineDiffSkipped: true,
        addedLines: undefined,
        deletedLines: undefined,
      }),
    ]);
    expect(binary.limitations).toEqual([]);

    const renamesDisabled = compareInventories(createInventoryDiffFixture('mixed').input, {
      detectRenames: false,
    });
    expect(renamesDisabled.summary).toMatchObject({
      addedFiles: 2,
      deletedFiles: 2,
      renamedFiles: 0,
    });

    const ambiguous = compareInventories(createInventoryDiffFixture('ambiguous-rename').input);
    expect(ambiguous.summary).toMatchObject({
      addedFiles: 2,
      deletedFiles: 2,
      renamedFiles: 0,
    });
    expect(ambiguous.files.every(({ status }) => status !== 'renamed')).toBe(true);
  });
});
