import type { ReadinessSnapshot, RepositoryRef } from '../domain';
import type { PrsHistorySample } from '../history/historyBaselineEngine';

export interface PrsSnapshotStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface PriorSnapshotLoadResult {
  samples: PrsHistorySample[];
  limitations: string[];
}

const MAX_SNAPSHOTS = 30;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_PATHS_PER_SAMPLE = 500;
const MAX_PATH_LENGTH = 1_000;

function compareCodePoints(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function requiredIdentifier(name: string, value: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('\0') ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.length > MAX_IDENTIFIER_LENGTH
  ) {
    throw new TypeError(`${name} must be a repository identifier without path separators.`);
  }
  return normalized;
}

function storageKey(repository: RepositoryRef): string {
  const owner = requiredIdentifier('repository.owner', repository.owner);
  const name = requiredIdentifier('repository.name', repository.name);
  return `b2g.prs.history:${owner.length}:${owner}:${name.length}:${name}`;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function optionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || nonNegativeInteger(value);
}

function validPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PATH_LENGTH &&
    !value.includes('\0')
  );
}

function parseSample(value: unknown): PrsHistorySample | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const sample = value as Partial<PrsHistorySample>;
  const valid =
    typeof sample.id === 'string' &&
    sample.id.length > 0 &&
    sample.id.length <= MAX_IDENTIFIER_LENGTH &&
    !sample.id.includes('\0') &&
    sample.source === 'prior_snapshot' &&
    typeof sample.recordedAt === 'string' &&
    sample.recordedAt.length <= 50 &&
    Number.isFinite(Date.parse(sample.recordedAt)) &&
    nonNegativeInteger(sample.changedFiles) &&
    nonNegativeInteger(sample.addedFiles) &&
    nonNegativeInteger(sample.deletedFiles) &&
    optionalNonNegativeInteger(sample.addedLines) &&
    optionalNonNegativeInteger(sample.deletedLines) &&
    nonNegativeInteger(sample.sensitiveFilesChanged) &&
    optionalNonNegativeInteger(sample.dependencyCount) &&
    Array.isArray(sample.changedPaths) &&
    sample.changedPaths.length <= MAX_PATHS_PER_SAMPLE &&
    sample.changedPaths.every(validPath) &&
    Array.isArray(sample.sensitivePaths) &&
    sample.sensitivePaths.length <= MAX_PATHS_PER_SAMPLE &&
    sample.sensitivePaths.every(validPath);
  if (!valid) return undefined;
  return {
    id: sample.id!,
    source: 'prior_snapshot',
    recordedAt: sample.recordedAt!,
    changedFiles: sample.changedFiles!,
    addedFiles: sample.addedFiles!,
    deletedFiles: sample.deletedFiles!,
    ...(sample.addedLines === undefined ? {} : { addedLines: sample.addedLines }),
    ...(sample.deletedLines === undefined ? {} : { deletedLines: sample.deletedLines }),
    sensitiveFilesChanged: sample.sensitiveFilesChanged!,
    ...(sample.dependencyCount === undefined ? {} : { dependencyCount: sample.dependencyCount }),
    changedPaths: [...sample.changedPaths!],
    sensitivePaths: [...sample.sensitivePaths!],
  };
}

function chronological(samples: PrsHistorySample[]): PrsHistorySample[] {
  return [...samples].sort(
    (left, right) =>
      Date.parse(left.recordedAt) - Date.parse(right.recordedAt) ||
      compareCodePoints(left.id, right.id)
  );
}

function hasDuplicateIds(samples: PrsHistorySample[]): boolean {
  const ids = new Set<string>();
  for (const sample of samples) {
    if (ids.has(sample.id)) return true;
    ids.add(sample.id);
  }
  return false;
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  const selected = paths.filter((path): path is string => Boolean(path));
  if (selected.some((path) => !validPath(path))) {
    throw new TypeError('Snapshot evidence paths must be bounded non-empty strings.');
  }
  return [...new Set(selected)].sort(compareCodePoints).slice(0, MAX_PATHS_PER_SAMPLE);
}

function snapshotSample(snapshot: ReadinessSnapshot): PrsHistorySample {
  const changedPaths = uniquePaths(
    snapshot.signals.flatMap((signal) => signal.evidence.map((evidence) => evidence.path))
  );
  const sensitivePaths = uniquePaths(
    snapshot.signals
      .filter(
        (signal) =>
          !['maintainability', 'testing_recovery', 'change_history'].includes(signal.category)
      )
      .flatMap((signal) => signal.evidence.map((evidence) => evidence.path))
  );
  return {
    id: snapshot.candidate.id,
    source: 'prior_snapshot',
    recordedAt: snapshot.generatedAt,
    changedFiles: snapshot.comparison.changedFiles,
    addedFiles: snapshot.comparison.addedFiles,
    deletedFiles: snapshot.comparison.deletedFiles,
    ...(snapshot.comparison.addedLines === undefined
      ? {}
      : { addedLines: snapshot.comparison.addedLines }),
    ...(snapshot.comparison.deletedLines === undefined
      ? {}
      : { deletedLines: snapshot.comparison.deletedLines }),
    sensitiveFilesChanged: snapshot.comparison.sensitiveFilesChanged,
    changedPaths,
    sensitivePaths,
  };
}

export async function loadPriorPrsSnapshots(
  repository: RepositoryRef,
  storage: PrsSnapshotStorage
): Promise<PriorSnapshotLoadResult> {
  const key = storageKey(repository);
  let value: unknown;
  try {
    value = await storage.get(key);
  } catch {
    return {
      samples: [],
      limitations: [
        `Local PRS history could not be read for ${repository.owner}/${repository.name}.`,
      ],
    };
  }
  if (value === undefined) {
    return {
      samples: [],
      limitations: [
        `No prior PRS snapshots are stored for ${repository.owner}/${repository.name}.`,
      ],
    };
  }
  const storedArray = Array.isArray(value) && value.length <= MAX_SNAPSHOTS ? value : undefined;
  const parsed = storedArray ? storedArray.map(parseSample) : [];
  const parsedSamples = parsed.filter((sample): sample is PrsHistorySample => Boolean(sample));
  if (
    !storedArray ||
    parsedSamples.length !== storedArray.length ||
    hasDuplicateIds(parsedSamples)
  ) {
    return {
      samples: [],
      limitations: [
        `Stored PRS history for ${repository.owner}/${repository.name} was invalid and was ignored.`,
      ],
    };
  }
  return {
    samples: chronological(parsedSamples),
    limitations: [],
  };
}

export async function savePrsSnapshotSummary(
  snapshot: ReadinessSnapshot,
  storage: PrsSnapshotStorage
): Promise<void> {
  if (!Number.isFinite(Date.parse(snapshot.generatedAt))) {
    throw new TypeError('snapshot.generatedAt must be a valid timestamp.');
  }
  const key = storageKey(snapshot.repository);
  const current = await storage.get(key);
  const storedArray = Array.isArray(current) && current.length <= MAX_SNAPSHOTS ? current : [];
  const parsed = storedArray.map(parseSample);
  const parsedSamples = parsed.filter((sample): sample is PrsHistorySample => Boolean(sample));
  const samples =
    parsedSamples.length === storedArray.length && !hasDuplicateIds(parsedSamples)
      ? parsedSamples
      : [];
  const next = parseSample(snapshotSample(snapshot));
  if (!next) throw new TypeError('Snapshot summary metadata exceeded storage safety limits.');
  const deduplicated = samples.filter((sample) => sample.id !== next.id);
  deduplicated.push(next);
  await storage.set(key, chronological(deduplicated).slice(-MAX_SNAPSHOTS));
}
