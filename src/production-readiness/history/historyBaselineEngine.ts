import type { ComparisonSummary, EvidenceRef, ReadinessSignal } from '../domain';
import { calculateMedian, calculatePercentileRank, detectHistoryHotspots } from './historyStats';

export type HistorySource = 'prior_snapshot' | 'b2g_commit' | 'github_commit';
export type HistoryBaselineLabel =
  | 'normal_range'
  | 'larger_than_usual'
  | 'unusually_large'
  | 'largest_recent_export'
  | 'repeated_churn'
  | 'accelerating_dependency_growth'
  | 'insufficient_history';

export interface PrsHistorySample {
  id: string;
  source: HistorySource;
  recordedAt: string;
  changedFiles: number;
  addedFiles: number;
  deletedFiles: number;
  addedLines?: number;
  deletedLines?: number;
  sensitiveFilesChanged: number;
  dependencyCount?: number;
  changedPaths: string[];
  sensitivePaths: string[];
}

export interface PrsCommitHistoryRecord extends PrsHistorySample {
  sha: string;
  subject: string;
  isB2gCommit: boolean;
}

export interface PrsHotspotFile {
  path: string;
  changeCount: number;
  sensitiveChangeCount: number;
}

export interface PrsHistoryBaseline {
  source: HistorySource;
  sampleCount: number;
  medianChangedFiles: number;
  medianLineChanges: number | null;
  changedFilesPercentile: number;
  lineChangesPercentile: number | null;
  hotspots: PrsHotspotFile[];
  label: HistoryBaselineLabel;
}

export interface HistoryBaselineInput {
  current: ComparisonSummary;
  currentChangedPaths: string[];
  currentSensitivePaths: string[];
  currentSourceFilesChanged: number | undefined;
  currentSourceLinesChanged: number | undefined;
  currentDependencyCount: number | undefined;
  priorSnapshots: PrsHistorySample[];
  githubCommits: PrsCommitHistoryRecord[];
}

export interface HistoryBaselineResult {
  signals: ReadinessSignal[];
  baseline: PrsHistoryBaseline | null;
  limitations: string[];
}

const MIN_HISTORY_SAMPLES = 5;
const INSUFFICIENT_HISTORY =
  'Not enough export history yet to judge whether this change is unusual.';

function compareCodePoints(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function signal(
  id: string,
  severity: ReadinessSignal['severity'],
  title: string,
  message: string,
  evidence: EvidenceRef[],
  suggestedReview: string
): ReadinessSignal {
  return {
    id,
    category: 'change_history',
    severity,
    title,
    message,
    evidence,
    suggestedReview,
    deterministic: true,
  };
}

function nonNegativeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function validateSample(sample: PrsHistorySample, index: number): PrsHistorySample {
  if (
    !sample ||
    typeof sample.id !== 'string' ||
    !sample.id.trim() ||
    typeof sample.recordedAt !== 'string' ||
    !Number.isFinite(Date.parse(sample.recordedAt))
  ) {
    throw new TypeError(`history sample ${index} must have an id and valid recordedAt value.`);
  }
  for (const key of [
    'changedFiles',
    'addedFiles',
    'deletedFiles',
    'sensitiveFilesChanged',
  ] as const) {
    nonNegativeInteger(`history sample ${index}.${key}`, sample[key]);
  }
  if (sample.addedLines !== undefined)
    nonNegativeInteger(`history sample ${index}.addedLines`, sample.addedLines);
  if (sample.deletedLines !== undefined)
    nonNegativeInteger(`history sample ${index}.deletedLines`, sample.deletedLines);
  if (sample.dependencyCount !== undefined)
    nonNegativeInteger(`history sample ${index}.dependencyCount`, sample.dependencyCount);
  return {
    ...sample,
    changedPaths: [...sample.changedPaths],
    sensitivePaths: [...sample.sensitivePaths],
  };
}

function chronological(
  samples: PrsHistorySample[],
  identity: (sample: PrsHistorySample) => string = (sample) => sample.id
): PrsHistorySample[] {
  const validated = samples.map(validateSample);
  const identities = new Set<string>();
  for (const sample of validated) {
    const key = identity(sample);
    if (!key || identities.has(key)) {
      throw new TypeError(`duplicate history sample identity: ${key || '[missing]'}.`);
    }
    identities.add(key);
  }
  return validated.sort(
    (left, right) =>
      Date.parse(left.recordedAt) - Date.parse(right.recordedAt) ||
      compareCodePoints(left.id, right.id)
  );
}

function selectHistory(input: HistoryBaselineInput): {
  source: HistorySource | null;
  samples: PrsHistorySample[];
} {
  const prior = chronological(input.priorSnapshots);
  if (prior.length >= MIN_HISTORY_SAMPLES) return { source: 'prior_snapshot', samples: prior };
  const b2g = chronological(
    input.githubCommits.filter((sample) => sample?.isB2gCommit === true),
    (sample) => (sample as PrsCommitHistoryRecord).sha
  );
  if (b2g.length >= MIN_HISTORY_SAMPLES) return { source: 'b2g_commit', samples: b2g };
  const commits = chronological(
    input.githubCommits,
    (sample) => (sample as PrsCommitHistoryRecord).sha
  );
  if (commits.length >= MIN_HISTORY_SAMPLES) return { source: 'github_commit', samples: commits };
  return { source: null, samples: [] };
}

function totalLines(summary: ComparisonSummary): number | undefined {
  if (summary.addedLines === undefined || summary.deletedLines === undefined) return undefined;
  return (
    nonNegativeInteger('current.addedLines', summary.addedLines) +
    nonNegativeInteger('current.deletedLines', summary.deletedLines)
  );
}

function fallbackSignals(input: HistoryBaselineInput): ReadinessSignal[] {
  const sourceFiles = input.currentSourceFilesChanged;
  const sourceLines = input.currentSourceLinesChanged;
  if (sourceFiles !== undefined) nonNegativeInteger('currentSourceFilesChanged', sourceFiles);
  if (sourceLines !== undefined) nonNegativeInteger('currentSourceLinesChanged', sourceLines);
  if (sourceFiles !== undefined && sourceFiles > 75 && input.current.sensitiveFilesChanged > 0) {
    return [
      signal(
        'history-fallback-critical-change',
        'critical',
        'Large production-sensitive change',
        'A large static change affected production-sensitive files.',
        [
          { kind: 'metric', label: 'Source files changed', after: sourceFiles },
          {
            kind: 'metric',
            label: 'Sensitive files changed',
            after: input.current.sensitiveFilesChanged,
          },
        ],
        'Review the production-sensitive changes and recovery plan before publishing.'
      ),
    ];
  }
  if (
    (sourceFiles !== undefined && sourceFiles > 30) ||
    (sourceLines !== undefined && sourceLines > 1_000)
  ) {
    return [
      signal(
        'history-fallback-large-change',
        'medium',
        'Large change detected',
        'This change crossed a static size threshold.',
        [
          ...(sourceFiles === undefined
            ? []
            : [
                {
                  kind: 'metric' as const,
                  label: 'Source files changed',
                  after: sourceFiles,
                },
              ]),
          ...(sourceLines === undefined
            ? []
            : [
                {
                  kind: 'metric' as const,
                  label: 'Source lines changed',
                  after: sourceLines,
                },
              ]),
        ],
        'Review whether the change can be validated and recovered in focused steps.'
      ),
    ];
  }
  return [];
}

function dependencyGrowth(
  samples: PrsHistorySample[],
  currentDependencyCount: number | undefined
): boolean {
  if (currentDependencyCount === undefined) return false;
  nonNegativeInteger('currentDependencyCount', currentDependencyCount);
  const recent = samples.slice(-5).map((sample) => sample.dependencyCount);
  if (recent.length < 5 || recent.some((value) => value === undefined)) return false;
  const values = [...(recent as number[]), currentDependencyCount];
  const increases = values.slice(1).filter((value, index) => value > values[index]).length;
  return currentDependencyCount > values.at(-2)! && increases >= 4;
}

export function buildHistoryBaseline(input: HistoryBaselineInput): HistoryBaselineResult {
  nonNegativeInteger('current.changedFiles', input.current.changedFiles);
  nonNegativeInteger('current.sensitiveFilesChanged', input.current.sensitiveFilesChanged);
  const selected = selectHistory(input);
  if (!selected.source) {
    return {
      signals: fallbackSignals(input),
      baseline: null,
      limitations: [INSUFFICIENT_HISTORY],
    };
  }

  const changedFileSamples = selected.samples.map((sample) => sample.changedFiles);
  const lineSamples = selected.samples
    .filter((sample) => sample.addedLines !== undefined && sample.deletedLines !== undefined)
    .map((sample) => sample.addedLines! + sample.deletedLines!);
  const medianChangedFiles = calculateMedian(changedFileSamples)!;
  const medianLineChanges =
    lineSamples.length >= MIN_HISTORY_SAMPLES ? calculateMedian(lineSamples) : null;
  const currentLines = totalLines(input.current);
  const changedFilesPercentile = calculatePercentileRank(
    input.current.changedFiles,
    changedFileSamples
  )!;
  const lineChangesPercentile =
    currentLines !== undefined && medianLineChanges !== null
      ? calculatePercentileRank(currentLines, lineSamples)
      : null;
  const hotspots = detectHistoryHotspots(selected.samples);
  const currentPaths = new Set(input.currentChangedPaths);
  const currentSensitivePaths = new Set(input.currentSensitivePaths);
  const currentHotspots = hotspots.filter((hotspot) => currentPaths.has(hotspot.path));
  const currentSensitiveHotspots = currentHotspots.filter(
    (hotspot) => hotspot.sensitiveChangeCount >= 3 && currentSensitivePaths.has(hotspot.path)
  );
  const changedFilesLarge =
    input.current.changedFiles > medianChangedFiles * 3 && input.current.changedFiles >= 15;
  const linesLarge =
    currentLines !== undefined &&
    medianLineChanges !== null &&
    currentLines > medianLineChanges * 3 &&
    currentLines >= 500;
  const unusuallyLarge =
    input.current.changedFiles > medianChangedFiles * 6 && input.current.sensitiveFilesChanged > 0;
  const largest = input.current.changedFiles > Math.max(...changedFileSamples);
  const dependenciesGrowing = dependencyGrowth(selected.samples, input.currentDependencyCount);
  const signals: ReadinessSignal[] = [];

  if (unusuallyLarge) {
    signals.push(
      signal(
        'history-unusually-large-change',
        'critical',
        'Unusually large production-sensitive change',
        'This change is more than six times the historical file-count median and affects sensitive files.',
        [
          {
            kind: 'metric',
            label: 'Changed files compared with median',
            before: medianChangedFiles,
            after: input.current.changedFiles,
          },
        ],
        'Perform a focused review of sensitive paths, validation, and recovery steps.'
      )
    );
  } else if (changedFilesLarge || linesLarge) {
    const evidence: EvidenceRef[] = [];
    if (changedFilesLarge) {
      evidence.push({
        kind: 'metric',
        label: 'Changed files compared with median',
        before: medianChangedFiles,
        after: input.current.changedFiles,
      });
    }
    if (linesLarge && currentLines !== undefined && medianLineChanges !== null) {
      evidence.push({
        kind: 'metric',
        label: 'Changed lines compared with median',
        before: medianLineChanges,
        after: currentLines,
      });
    }
    signals.push(
      signal(
        'history-change-larger-than-usual',
        'medium',
        'Change is larger than usual',
        'This change is more than three times a historical median and crosses the minimum size threshold.',
        evidence,
        'Review whether the change can be validated in focused sections.'
      )
    );
  }
  if (largest) {
    signals.push(
      signal(
        'history-largest-recent-export',
        'info',
        'Largest change in available history',
        'This change has more changed files than every selected historical sample.',
        [
          {
            kind: 'metric',
            label: 'Previous largest changed-file count',
            before: Math.max(...changedFileSamples),
            after: input.current.changedFiles,
          },
        ],
        'Use the larger scope as context when planning validation and rollback.'
      )
    );
  }
  if (dependenciesGrowing) {
    signals.push(
      signal(
        'history-dependency-growth',
        'low',
        'Dependencies are growing repeatedly',
        'Dependency count increased across at least four recent transitions and increased again now.',
        [
          {
            kind: 'metric',
            label: 'Dependency count',
            before: selected.samples.at(-1)?.dependencyCount,
            after: input.currentDependencyCount,
          },
        ],
        'Review whether each recently added dependency remains necessary and maintained.'
      )
    );
  }
  if (currentHotspots.length > 0) {
    signals.push(
      signal(
        'history-hotspot-churn',
        'medium',
        'Historical hotspot files changed again',
        'Files changed in at least three historical samples were changed again.',
        currentHotspots.map((hotspot) => ({
          kind: 'metric',
          label: 'Historical file changes before current change',
          path: hotspot.path,
          before: hotspot.changeCount,
          after: hotspot.changeCount + 1,
        })),
        'Review whether these frequently changed files have focused tests and clear responsibilities.'
      )
    );
  }
  if (currentSensitiveHotspots.length > 0) {
    signals.push(
      signal(
        'history-sensitive-churn',
        'high',
        'Sensitive paths changed repeatedly',
        'Production-sensitive paths with repeated historical churn changed again.',
        currentSensitiveHotspots.map((hotspot) => ({
          kind: 'metric',
          label: 'Sensitive path changed across recent history',
          path: hotspot.path,
          before: hotspot.sensitiveChangeCount,
          after: hotspot.sensitiveChangeCount + 1,
        })),
        'Review the sensitive behavior, access boundaries, and recovery plan.'
      )
    );
  }

  const label: HistoryBaselineLabel = unusuallyLarge
    ? 'unusually_large'
    : changedFilesLarge || linesLarge
      ? 'larger_than_usual'
      : largest
        ? 'largest_recent_export'
        : currentSensitiveHotspots.length > 0 || currentHotspots.length > 0
          ? 'repeated_churn'
          : dependenciesGrowing
            ? 'accelerating_dependency_growth'
            : 'normal_range';

  return {
    signals: signals.sort((left, right) => compareCodePoints(left.id, right.id)),
    baseline: {
      source: selected.source,
      sampleCount: selected.samples.length,
      medianChangedFiles,
      medianLineChanges,
      changedFilesPercentile,
      lineChangesPercentile,
      hotspots,
      label,
    },
    limitations: [],
  };
}
