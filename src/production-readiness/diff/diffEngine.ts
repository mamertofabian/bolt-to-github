import type { PartialDataNotice } from '../domain';
import type {
  GitHubBaseContentResult,
  GitHubBaseInventoryEntry,
  GitHubBaseInventoryResult,
} from '../inventory/githubBaseInventory';
import type { FileInventory, FileInventoryEntry } from '../inventory/zipInventory';

const DEFAULT_MAX_LINE_DIFF_BYTES = 1024 * 1024;
const DEFAULT_MAX_LINE_DIFF_CELLS = 250_000;

export type FileDiffStatus = 'added' | 'changed' | 'deleted' | 'renamed';

export interface InventoryDiffInput {
  candidate: FileInventory;
  base: GitHubBaseInventoryResult;
  baseContentByPath?: ReadonlyMap<string, GitHubBaseContentResult>;
}

export interface DiffEngineOptions {
  detectRenames?: boolean;
  maxLineDiffBytes?: number;
  maxLineDiffCells?: number;
}

export interface FileDiffEntry {
  path: string;
  status: FileDiffStatus;
  previousPath?: string;
  beforeGitBlobSha?: string;
  afterGitBlobSha?: string;
  sizeBeforeBytes?: number;
  sizeAfterBytes?: number;
  isBinary?: boolean;
  lineDiffSkipped: boolean;
  addedLines?: number;
  deletedLines?: number;
}

export interface FileDiffSummary {
  changedFiles: number;
  addedFiles: number;
  deletedFiles: number;
  renamedFiles: number;
  addedLines?: number;
  deletedLines?: number;
  binaryFilesChanged: number;
}

export interface InventoryDiffResult {
  files: FileDiffEntry[];
  summary: FileDiffSummary;
  limitations: PartialDataNotice[];
  complete: boolean;
}

interface ResolvedOptions {
  detectRenames: boolean;
  maxLineDiffBytes: number;
  maxLineDiffCells: number;
}

interface LineMetrics {
  addedLines: number;
  deletedLines: number;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const CONFIDENCE_IMPACT_ORDER: Record<PartialDataNotice['confidenceImpact'], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function compareLimitations(left: PartialDataNotice, right: PartialDataNotice): number {
  return (
    compareStrings(left.message, right.message) ||
    compareStrings(left.source, right.source) ||
    CONFIDENCE_IMPACT_ORDER[left.confidenceImpact] - CONFIDENCE_IMPACT_ORDER[right.confidenceImpact]
  );
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function resolveOptions(options: DiffEngineOptions | undefined): ResolvedOptions {
  return {
    detectRenames: options?.detectRenames !== false,
    maxLineDiffBytes: positiveInteger(
      options?.maxLineDiffBytes,
      DEFAULT_MAX_LINE_DIFF_BYTES,
      'maxLineDiffBytes'
    ),
    maxLineDiffCells: positiveInteger(
      options?.maxLineDiffCells,
      DEFAULT_MAX_LINE_DIFF_CELLS,
      'maxLineDiffCells'
    ),
  };
}

function splitLines(content: string): string[] {
  if (!content) {
    return [];
  }
  return content.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
}

function lcsLength(left: readonly string[], right: readonly string[]): number {
  const rows = left.length >= right.length ? left : right;
  const columns = left.length >= right.length ? right : left;
  let previous = new Uint32Array(columns.length + 1);
  let current = new Uint32Array(columns.length + 1);

  for (const row of rows) {
    current.fill(0);
    for (let column = 1; column <= columns.length; column += 1) {
      current[column] =
        row === columns[column - 1]
          ? previous[column - 1] + 1
          : Math.max(previous[column], current[column - 1]);
    }
    [previous, current] = [current, previous];
  }
  return previous[columns.length];
}

function lineMetrics(before: string, after: string, maxCells: number): LineMetrics | undefined {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  if (beforeLines.length * afterLines.length > maxCells) {
    return undefined;
  }
  const sharedLines = lcsLength(beforeLines, afterLines);
  return {
    addedLines: afterLines.length - sharedLines,
    deletedLines: beforeLines.length - sharedLines,
  };
}

function utf8SizeWithin(content: string, maxBytes: number): boolean {
  if (content.length > maxBytes) {
    return false;
  }
  return new TextEncoder().encode(content).byteLength <= maxBytes;
}

function limitation(message: string): PartialDataNotice {
  return {
    source: 'large_file_diff',
    message,
    confidenceImpact: 'medium',
  };
}

function groupBySha<T extends { gitBlobSha: string }>(entries: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const entry of entries) {
    const values = grouped.get(entry.gitBlobSha);
    if (values) {
      values.push(entry);
    } else {
      grouped.set(entry.gitBlobSha, [entry]);
    }
  }
  return grouped;
}

function addedEntry(candidate: FileInventoryEntry, options: ResolvedOptions): FileDiffEntry {
  if (candidate.isBinary) {
    return {
      path: candidate.path,
      status: 'added',
      afterGitBlobSha: candidate.gitBlobSha,
      sizeAfterBytes: candidate.sizeBytes,
      isBinary: true,
      lineDiffSkipped: true,
      addedLines: undefined,
      deletedLines: undefined,
    };
  }
  const canCountLines =
    !candidate.largeFile &&
    candidate.analysisEligible &&
    candidate.lineCount !== undefined &&
    candidate.sizeBytes <= options.maxLineDiffBytes;
  return {
    path: candidate.path,
    status: 'added',
    afterGitBlobSha: candidate.gitBlobSha,
    sizeAfterBytes: candidate.sizeBytes,
    isBinary: false,
    lineDiffSkipped: !canCountLines,
    addedLines: canCountLines ? candidate.lineCount : undefined,
    deletedLines: canCountLines ? 0 : undefined,
  };
}

function deletedEntry(
  base: GitHubBaseInventoryEntry,
  baseContent: GitHubBaseContentResult | undefined,
  options: ResolvedOptions
): FileDiffEntry {
  if (baseContent?.isBinary) {
    return {
      path: base.path,
      status: 'deleted',
      beforeGitBlobSha: base.gitBlobSha,
      sizeBeforeBytes: base.sizeBytes,
      isBinary: true,
      lineDiffSkipped: true,
      addedLines: undefined,
      deletedLines: undefined,
    };
  }
  const baseText = baseContent?.textContent;
  const canDiff =
    baseText !== undefined &&
    (base.sizeBytes === undefined || base.sizeBytes <= options.maxLineDiffBytes) &&
    utf8SizeWithin(baseText, options.maxLineDiffBytes);
  const deletedLines = canDiff ? splitLines(baseText).length : undefined;
  return {
    path: base.path,
    status: 'deleted',
    beforeGitBlobSha: base.gitBlobSha,
    sizeBeforeBytes: base.sizeBytes,
    isBinary: canDiff ? false : undefined,
    lineDiffSkipped: !canDiff,
    addedLines: canDiff ? 0 : undefined,
    deletedLines,
  };
}

function changedEntry(
  candidate: FileInventoryEntry,
  base: GitHubBaseInventoryEntry,
  baseContent: GitHubBaseContentResult | undefined,
  options: ResolvedOptions
): FileDiffEntry {
  const common = {
    path: candidate.path,
    status: 'changed' as const,
    beforeGitBlobSha: base.gitBlobSha,
    afterGitBlobSha: candidate.gitBlobSha,
    sizeBeforeBytes: base.sizeBytes,
    sizeAfterBytes: candidate.sizeBytes,
  };
  if (candidate.isBinary || baseContent?.isBinary) {
    return {
      ...common,
      isBinary: true,
      lineDiffSkipped: true,
      addedLines: undefined,
      deletedLines: undefined,
    };
  }
  const baseText = baseContent?.textContent;
  if (
    candidate.largeFile ||
    !candidate.analysisEligible ||
    candidate.textContent === undefined ||
    candidate.sizeBytes > options.maxLineDiffBytes ||
    (base.sizeBytes !== undefined && base.sizeBytes > options.maxLineDiffBytes) ||
    baseText === undefined ||
    !utf8SizeWithin(baseText, options.maxLineDiffBytes)
  ) {
    return {
      ...common,
      isBinary: false,
      lineDiffSkipped: true,
      addedLines: undefined,
      deletedLines: undefined,
    };
  }
  const metrics = lineMetrics(baseText, candidate.textContent, options.maxLineDiffCells);
  return {
    ...common,
    isBinary: false,
    lineDiffSkipped: metrics === undefined,
    addedLines: metrics?.addedLines,
    deletedLines: metrics?.deletedLines,
  };
}

function lineSkipMessage(
  file: FileDiffEntry,
  candidate: FileInventoryEntry | undefined,
  baseText: string | undefined
): string {
  if (candidate?.largeFile || candidate?.analysisEligible === false) {
    return `Skipped line diff for large or metadata-only file: ${file.path}`;
  }
  if (baseText === undefined) {
    return `Skipped line diff because GitHub base text was unavailable: ${file.path}`;
  }
  return `Skipped line diff over byte or computation budget: ${file.path}`;
}

function emptySummary(): FileDiffSummary {
  return {
    changedFiles: 0,
    addedFiles: 0,
    deletedFiles: 0,
    renamedFiles: 0,
    addedLines: undefined,
    deletedLines: undefined,
    binaryFilesChanged: 0,
  };
}

export function compareInventories(
  input: InventoryDiffInput,
  options: DiffEngineOptions | undefined = undefined
): InventoryDiffResult {
  const resolved = resolveOptions(options);
  const blockingCandidateLimitations = input.candidate.limitations.filter(
    (message) =>
      !message.startsWith('Skipped line analysis for binary file: ') &&
      !message.startsWith('Skipped line analysis for large file: ')
  );
  const limitations: PartialDataNotice[] = [
    ...input.base.limitations.map((notice) => ({ ...notice })),
    ...blockingCandidateLimitations.map((message) => ({
      source: 'zip_scan' as const,
      message,
      confidenceImpact: 'medium' as const,
    })),
  ];

  if (!input.base.base) {
    if (limitations.length === 0) {
      limitations.push({
        source: 'github_base',
        message: 'GitHub base metadata is unavailable for inventory comparison.',
        confidenceImpact: 'low',
      });
    }
    limitations.sort(compareLimitations);
    return { files: [], summary: emptySummary(), limitations, complete: false };
  }

  const candidateByPath = new Map(input.candidate.entries.map((entry) => [entry.path, entry]));
  const baseByPath = new Map(input.base.entries.map((entry) => [entry.path, entry]));
  const candidateOnly: FileInventoryEntry[] = [];
  const baseOnly: GitHubBaseInventoryEntry[] = [];
  const files: FileDiffEntry[] = [];
  let lineTotalsComplete = input.base.complete && blockingCandidateLimitations.length === 0;

  for (const candidate of input.candidate.entries) {
    const base = baseByPath.get(candidate.path);
    if (!base) {
      candidateOnly.push(candidate);
      continue;
    }
    if (candidate.gitBlobSha === base.gitBlobSha) {
      continue;
    }
    const baseContent = input.baseContentByPath?.get(candidate.path);
    const file = changedEntry(candidate, base, baseContent, resolved);
    files.push(file);
    if (file.lineDiffSkipped && !file.isBinary) {
      lineTotalsComplete = false;
      if (baseContent?.limitation) {
        limitations.push({ ...baseContent.limitation });
      } else {
        limitations.push(limitation(lineSkipMessage(file, candidate, baseContent?.textContent)));
      }
    }
  }

  for (const base of input.base.entries) {
    if (!candidateByPath.has(base.path)) {
      baseOnly.push(base);
    }
  }

  const renamedCandidates = new Set<FileInventoryEntry>();
  const renamedBases = new Set<GitHubBaseInventoryEntry>();
  if (input.base.complete && resolved.detectRenames) {
    const candidateBySha = groupBySha(candidateOnly);
    const baseBySha = groupBySha(baseOnly);
    for (const [sha, candidates] of candidateBySha) {
      const bases = baseBySha.get(sha);
      if (candidates.length !== 1 || bases?.length !== 1) {
        continue;
      }
      const candidate = candidates[0];
      const base = bases[0];
      renamedCandidates.add(candidate);
      renamedBases.add(base);
      files.push({
        path: candidate.path,
        status: 'renamed',
        previousPath: base.path,
        beforeGitBlobSha: base.gitBlobSha,
        afterGitBlobSha: candidate.gitBlobSha,
        sizeBeforeBytes: base.sizeBytes,
        sizeAfterBytes: candidate.sizeBytes,
        isBinary: candidate.isBinary,
        lineDiffSkipped: false,
        addedLines: 0,
        deletedLines: 0,
      });
    }
  }

  if (input.base.complete) {
    for (const candidate of candidateOnly) {
      if (renamedCandidates.has(candidate)) {
        continue;
      }
      const file = addedEntry(candidate, resolved);
      files.push(file);
      if (file.lineDiffSkipped && !file.isBinary) {
        lineTotalsComplete = false;
        limitations.push(
          limitation(`Skipped line count for large or metadata-only added file: ${file.path}`)
        );
      }
    }
  } else if (candidateOnly.length > 0) {
    limitations.push({
      source: 'github_base',
      message:
        'Skipped added-file and rename inference because GitHub base inventory is incomplete.',
      confidenceImpact: 'medium',
    });
  }

  for (const base of baseOnly) {
    if (renamedBases.has(base)) {
      continue;
    }
    const baseContent = input.baseContentByPath?.get(base.path);
    const file = deletedEntry(base, baseContent, resolved);
    files.push(file);
    if (file.lineDiffSkipped && !file.isBinary) {
      lineTotalsComplete = false;
      if (baseContent?.limitation) {
        limitations.push({ ...baseContent.limitation });
      } else {
        limitations.push(limitation(lineSkipMessage(file, undefined, baseContent?.textContent)));
      }
    }
  }

  files.sort((left, right) => compareStrings(left.path, right.path));
  limitations.sort(compareLimitations);

  const summary: FileDiffSummary = {
    changedFiles: files.filter(({ status }) => status === 'changed').length,
    addedFiles: files.filter(({ status }) => status === 'added').length,
    deletedFiles: files.filter(({ status }) => status === 'deleted').length,
    renamedFiles: files.filter(({ status }) => status === 'renamed').length,
    addedLines: lineTotalsComplete
      ? files.reduce((total, file) => total + (file.addedLines ?? 0), 0)
      : undefined,
    deletedLines: lineTotalsComplete
      ? files.reduce((total, file) => total + (file.deletedLines ?? 0), 0)
      : undefined,
    binaryFilesChanged: files.filter(({ isBinary }) => isBinary === true).length,
  };

  return {
    files,
    summary,
    limitations,
    complete:
      input.base.complete && lineTotalsComplete && blockingCandidateLimitations.length === 0,
  };
}
