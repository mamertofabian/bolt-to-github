import type {
  GitHubBaseInventoryEntry,
  GitHubBaseInventoryResult,
} from '../inventory/githubBaseInventory';
import type { FileInventory, FileInventoryEntry } from '../inventory/zipInventory';

const DEFAULT_MAX_LINE_DIFF_FILE_BYTES = 1_000_000;

export interface LineDelta {
  addedLines: number;
  deletedLines: number;
}

export interface DiffEngineOptions {
  detectRenames?: boolean;
  maxLineDiffFileBytes?: number;
  lineDeltasByPath?: Readonly<Record<string, LineDelta>>;
  candidateBlobShasByPath?: Readonly<Record<string, string>>;
  baseBinaryPaths?: ReadonlySet<string>;
}

export interface FileDiffEntry {
  path: string;
  previousPath?: string;
  status: 'added' | 'changed' | 'deleted' | 'renamed' | 'indeterminate';
  binary: boolean | undefined;
  lineDiffEligible: boolean;
  addedLines?: number;
  deletedLines?: number;
}

export interface InventoryComparisonSummary {
  changedFiles: number;
  addedFiles: number;
  deletedFiles: number;
  renamedFiles: number;
  indeterminateFiles: number;
  addedLines: number;
  deletedLines: number;
  binaryFilesChanged: number;
}

export interface InventoryDiffResult {
  entries: FileDiffEntry[];
  summary: InventoryComparisonSummary;
  limitations: string[];
}

function compareCodePoints(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function validatedNonNegativeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function candidateMap(candidate: FileInventory): Map<string, FileInventoryEntry> {
  const entries = new Map<string, FileInventoryEntry>();
  for (const entry of candidate.entries) {
    if (entries.has(entry.path)) {
      throw new Error(`candidate inventory contains duplicate path: ${entry.path}.`);
    }
    entries.set(entry.path, entry);
  }
  return entries;
}

function baseMap(base: GitHubBaseInventoryResult): Map<string, GitHubBaseInventoryEntry> {
  const entries = new Map<string, GitHubBaseInventoryEntry>();
  for (const entry of base.entries) {
    if (entries.has(entry.path)) {
      throw new Error(`base inventory contains duplicate path: ${entry.path}.`);
    }
    entries.set(entry.path, entry);
  }
  return entries;
}

function candidateBinary(candidate: FileInventoryEntry | undefined): boolean | undefined {
  if (candidate?.contentKind === 'binary') {
    return true;
  }
  if (candidate?.contentKind === 'text') {
    return false;
  }
  return undefined;
}

function resolveBinary(
  candidate: FileInventoryEntry | undefined,
  basePath: string | undefined,
  baseBinaryPaths: ReadonlySet<string> | undefined
): boolean | undefined {
  const candidateState = candidateBinary(candidate);
  const baseState =
    basePath === undefined
      ? undefined
      : baseBinaryPaths
        ? baseBinaryPaths.has(basePath)
        : undefined;

  if (candidateState === true || baseState === true) {
    return true;
  }
  if (candidate && basePath !== undefined) {
    return candidateState === false && baseState === false ? false : undefined;
  }
  if (candidate) {
    return candidateState;
  }
  return baseState;
}

function isLarge(
  candidate: FileInventoryEntry | undefined,
  base: GitHubBaseInventoryEntry | undefined,
  maxLineDiffFileBytes: number
): boolean {
  return (
    candidate?.largeFile === true ||
    (candidate?.sizeBytes ?? 0) > maxLineDiffFileBytes ||
    (base?.sizeBytes ?? 0) > maxLineDiffFileBytes
  );
}

function validatedLineDelta(path: string, delta: LineDelta | undefined): LineDelta | undefined {
  if (!delta) {
    return undefined;
  }
  return {
    addedLines: validatedNonNegativeInteger(
      `lineDeltasByPath[${path}].addedLines`,
      delta.addedLines
    ),
    deletedLines: validatedNonNegativeInteger(
      `lineDeltasByPath[${path}].deletedLines`,
      delta.deletedLines
    ),
  };
}

type DiffContext = {
  maxLineDiffFileBytes: number;
  lineDeltasByPath: Readonly<Record<string, LineDelta>>;
  baseBinaryPaths: ReadonlySet<string> | undefined;
  limitations: Set<string>;
};

function withLineMetrics(
  entry: Omit<FileDiffEntry, 'lineDiffEligible' | 'addedLines' | 'deletedLines'>,
  candidate: FileInventoryEntry | undefined,
  base: GitHubBaseInventoryEntry | undefined,
  context: DiffContext
): FileDiffEntry {
  if (entry.binary === undefined) {
    context.limitations.add(`Binary classification unavailable for file: ${entry.path}.`);
    return {
      ...entry,
      lineDiffEligible: false,
      addedLines: undefined,
      deletedLines: undefined,
    };
  }

  if (entry.binary) {
    context.limitations.add(`Line diff unavailable for binary file: ${entry.path}.`);
    return {
      ...entry,
      lineDiffEligible: false,
      addedLines: undefined,
      deletedLines: undefined,
    };
  }

  if (isLarge(candidate, base, context.maxLineDiffFileBytes)) {
    context.limitations.add(`Line diff skipped for large file: ${entry.path}.`);
    return {
      ...entry,
      lineDiffEligible: false,
      addedLines: undefined,
      deletedLines: undefined,
    };
  }

  if (entry.status === 'indeterminate') {
    return {
      ...entry,
      lineDiffEligible: false,
      addedLines: undefined,
      deletedLines: undefined,
    };
  }

  if (entry.status === 'renamed') {
    return {
      ...entry,
      lineDiffEligible: true,
      addedLines: 0,
      deletedLines: 0,
    };
  }

  const exactDelta = validatedLineDelta(entry.path, context.lineDeltasByPath[entry.path]);

  if (entry.status === 'added') {
    if (exactDelta?.deletedLines !== undefined && exactDelta.deletedLines !== 0) {
      throw new TypeError(
        `lineDeltasByPath[${entry.path}].deletedLines must be zero for an added file.`
      );
    }
    if (
      exactDelta &&
      candidate?.lineCount !== undefined &&
      exactDelta.addedLines !== candidate.lineCount
    ) {
      throw new TypeError(
        `lineDeltasByPath[${entry.path}].addedLines must match the candidate line count.`
      );
    }
    if (candidate?.lineDiffEligible && candidate.lineCount !== undefined) {
      return {
        ...entry,
        lineDiffEligible: true,
        addedLines: candidate.lineCount,
        deletedLines: 0,
      };
    }
    if (exactDelta) {
      return {
        ...entry,
        lineDiffEligible: true,
        addedLines: exactDelta.addedLines,
        deletedLines: 0,
      };
    }
  }

  if (entry.status === 'deleted' && exactDelta) {
    if (exactDelta.addedLines !== 0) {
      throw new TypeError(
        `lineDeltasByPath[${entry.path}].addedLines must be zero for a deleted file.`
      );
    }
    return {
      ...entry,
      lineDiffEligible: true,
      addedLines: 0,
      deletedLines: exactDelta.deletedLines,
    };
  }

  if (exactDelta) {
    return {
      ...entry,
      lineDiffEligible: true,
      addedLines: exactDelta.addedLines,
      deletedLines: exactDelta.deletedLines,
    };
  }

  context.limitations.add(`Line delta unavailable for ${entry.status} text file: ${entry.path}.`);
  return {
    ...entry,
    lineDiffEligible: false,
    addedLines: undefined,
    deletedLines: undefined,
  };
}

function ambiguousRenameHashes(
  added: ReadonlyMap<string, FileInventoryEntry>,
  deleted: ReadonlyMap<string, GitHubBaseInventoryEntry>,
  candidateBlobShasByPath: Readonly<Record<string, string>>
): Set<string> {
  const candidateCounts = new Map<string, number>();
  const baseCounts = new Map<string, number>();
  for (const path of added.keys()) {
    const sha = candidateBlobShasByPath[path];
    if (sha) {
      candidateCounts.set(sha, (candidateCounts.get(sha) ?? 0) + 1);
    }
  }
  for (const entry of deleted.values()) {
    if (entry.blobSha) {
      baseCounts.set(entry.blobSha, (baseCounts.get(entry.blobSha) ?? 0) + 1);
    }
  }

  const ambiguous = new Set<string>();
  for (const [sha, count] of candidateCounts) {
    if (count > 1 || (baseCounts.get(sha) ?? 0) > 1) {
      ambiguous.add(sha);
    }
  }
  return ambiguous;
}

export function compareInventories(
  candidate: FileInventory,
  base: GitHubBaseInventoryResult,
  options: DiffEngineOptions | undefined = undefined
): InventoryDiffResult {
  const resolvedOptions = options ?? {};
  const detectRenames = resolvedOptions.detectRenames ?? true;
  const maxLineDiffFileBytes = validatedNonNegativeInteger(
    'maxLineDiffFileBytes',
    resolvedOptions.maxLineDiffFileBytes ?? DEFAULT_MAX_LINE_DIFF_FILE_BYTES
  );
  const candidateBlobShasByPath = resolvedOptions.candidateBlobShasByPath ?? {};
  const limitations = new Set([
    ...candidate.limitations,
    ...base.limitations.map((notice) => notice.message),
  ]);
  const context: DiffContext = {
    maxLineDiffFileBytes,
    lineDeltasByPath: resolvedOptions.lineDeltasByPath ?? {},
    baseBinaryPaths: resolvedOptions.baseBinaryPaths,
    limitations,
  };
  const candidateByPath = candidateMap(candidate);
  const baseByPath = baseMap(base);
  const entries: FileDiffEntry[] = [];
  const added = new Map<string, FileInventoryEntry>();
  const deleted = new Map<string, GitHubBaseInventoryEntry>();

  for (const [path, candidateEntry] of candidateByPath) {
    const baseEntry = baseByPath.get(path);
    if (!baseEntry) {
      if (base.partial) {
        limitations.add(`GitHub base is partial; added status cannot be confirmed: ${path}.`);
        entries.push(
          withLineMetrics(
            {
              path,
              status: 'indeterminate',
              binary: resolveBinary(candidateEntry, undefined, context.baseBinaryPaths),
            },
            candidateEntry,
            undefined,
            context
          )
        );
      } else {
        added.set(path, candidateEntry);
      }
      continue;
    }

    const binary = resolveBinary(candidateEntry, path, context.baseBinaryPaths);
    if (baseEntry.sizeBytes !== undefined && candidateEntry.sizeBytes !== baseEntry.sizeBytes) {
      entries.push(
        withLineMetrics({ path, status: 'changed', binary }, candidateEntry, baseEntry, context)
      );
      continue;
    }

    const candidateBlobSha = candidateBlobShasByPath[path];
    if (!candidateBlobSha) {
      limitations.add(`Candidate Git blob SHA unavailable for same-size file: ${path}.`);
      entries.push(
        withLineMetrics(
          { path, status: 'indeterminate', binary },
          candidateEntry,
          baseEntry,
          context
        )
      );
      continue;
    }

    if (candidateBlobSha !== baseEntry.blobSha) {
      entries.push(
        withLineMetrics({ path, status: 'changed', binary }, candidateEntry, baseEntry, context)
      );
    }
  }

  for (const [path, baseEntry] of baseByPath) {
    if (!candidateByPath.has(path)) {
      deleted.set(path, baseEntry);
    }
  }

  if (detectRenames && !base.partial) {
    const ambiguous = ambiguousRenameHashes(added, deleted, candidateBlobShasByPath);
    for (const sha of ambiguous) {
      limitations.add(`Rename detection ambiguous for Git blob SHA: ${sha}.`);
    }

    const deletedPaths = [...deleted.keys()].sort(compareCodePoints);
    for (const candidatePath of [...added.keys()].sort(compareCodePoints)) {
      const candidateEntry = added.get(candidatePath) as FileInventoryEntry;
      const candidateBlobSha = candidateBlobShasByPath[candidatePath];
      if (!candidateBlobSha || ambiguous.has(candidateBlobSha)) {
        continue;
      }
      const previousPath = deletedPaths.find(
        (path) => deleted.get(path)?.blobSha === candidateBlobSha
      );
      if (!previousPath) {
        continue;
      }

      const baseEntry = deleted.get(previousPath) as GitHubBaseInventoryEntry;
      entries.push(
        withLineMetrics(
          {
            path: candidatePath,
            previousPath,
            status: 'renamed',
            binary: resolveBinary(candidateEntry, previousPath, context.baseBinaryPaths),
          },
          candidateEntry,
          baseEntry,
          context
        )
      );
      added.delete(candidatePath);
      deleted.delete(previousPath);
      deletedPaths.splice(deletedPaths.indexOf(previousPath), 1);
    }
  }

  for (const [path, candidateEntry] of added) {
    entries.push(
      withLineMetrics(
        {
          path,
          status: 'added',
          binary: resolveBinary(candidateEntry, undefined, context.baseBinaryPaths),
        },
        candidateEntry,
        undefined,
        context
      )
    );
  }
  for (const [path, baseEntry] of deleted) {
    entries.push(
      withLineMetrics(
        {
          path,
          status: 'deleted',
          binary: resolveBinary(undefined, path, context.baseBinaryPaths),
        },
        undefined,
        baseEntry,
        context
      )
    );
  }

  entries.sort((left, right) => compareCodePoints(left.path, right.path));
  const summary: InventoryComparisonSummary = {
    changedFiles: entries.filter((entry) => entry.status === 'changed').length,
    addedFiles: entries.filter((entry) => entry.status === 'added').length,
    deletedFiles: entries.filter((entry) => entry.status === 'deleted').length,
    renamedFiles: entries.filter((entry) => entry.status === 'renamed').length,
    indeterminateFiles: entries.filter((entry) => entry.status === 'indeterminate').length,
    addedLines: entries.reduce((total, entry) => total + (entry.addedLines ?? 0), 0),
    deletedLines: entries.reduce((total, entry) => total + (entry.deletedLines ?? 0), 0),
    binaryFilesChanged: entries.filter((entry) => entry.binary && entry.status !== 'indeterminate')
      .length,
  };

  return {
    entries,
    summary,
    limitations: [...limitations].sort(compareCodePoints),
  };
}
