import type {
  CandidateExportSummary,
  CategorySummary,
  ComparisonSummary,
  EvidenceRef,
  GitRefSummary,
  PartialDataNotice,
  ReadinessCategory,
  ReadinessSignal,
  ReadinessSnapshot,
  ReadinessState,
  RepositoryRef,
  SignalSeverity,
  SnapshotConfidence,
  SnapshotOutputRefs,
  TrendSummary,
} from '../domain';

export type ReadinessDetectorId =
  | 'sensitive_paths'
  | 'dependencies'
  | 'env_secrets'
  | 'public_surface'
  | 'tests_ci'
  | 'maintainability'
  | 'history';

export interface ComposeReadinessSnapshotInput {
  generatedAt: string;
  repository: RepositoryRef;
  base: GitRefSummary;
  candidate: CandidateExportSummary;
  comparison: ComparisonSummary;
  githubComparisonAvailable: boolean;
  availableDetectors: ReadinessDetectorId[];
  signals: ReadinessSignal[];
  trends?: TrendSummary[];
  outputs?: Partial<SnapshotOutputRefs>;
  unavailableData?: PartialDataNotice[];
}

export interface ReadinessScoreSummary {
  internalScore: number;
  highestSeverity: SignalSeverity;
  highSignalCount: number;
  criticalSignalCount: number;
}

const SEVERITY_POINTS: Readonly<Record<SignalSeverity, number>> = {
  info: 0,
  low: 1,
  medium: 3,
  high: 5,
  critical: 8,
};

const SEVERITY_RANK: Readonly<Record<SignalSeverity, number>> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const CONCERN_CATEGORY_RANK: Readonly<Record<ReadinessCategory, number>> = {
  identity_access: 0,
  data_persistence: 1,
  secrets_config: 2,
  deployment_ops: 3,
  external_integrations: 4,
  public_surface: 5,
  testing_recovery: 6,
  change_history: 7,
  maintainability: 8,
};

const CATEGORY_RANK: Readonly<Record<ReadinessCategory, number>> = {
  identity_access: 0,
  data_persistence: 1,
  secrets_config: 2,
  deployment_ops: 3,
  external_integrations: 4,
  public_surface: 5,
  testing_recovery: 6,
  maintainability: 7,
  change_history: 8,
};

const CONFIDENCE_RANK: Readonly<Record<SnapshotConfidence, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

const ALL_DETECTORS: readonly ReadinessDetectorId[] = [
  'sensitive_paths',
  'dependencies',
  'env_secrets',
  'public_surface',
  'tests_ci',
  'maintainability',
  'history',
];

const DETECTOR_LABELS: Readonly<Record<ReadinessDetectorId, string>> = {
  sensitive_paths: 'sensitive path analysis',
  dependencies: 'dependency analysis',
  env_secrets: 'environment and secret analysis',
  public_surface: 'public surface analysis',
  tests_ci: 'test and CI analysis',
  maintainability: 'maintainability analysis',
  history: 'change history analysis',
};

function compareCodePoints(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareSignals(left: ReadinessSignal, right: ReadinessSignal): number {
  return (
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity] ||
    CONCERN_CATEGORY_RANK[left.category] - CONCERN_CATEGORY_RANK[right.category] ||
    compareCodePoints(left.id, right.id) ||
    compareCodePoints(left.title, right.title)
  );
}

function compareEvidence(left: EvidenceRef, right: EvidenceRef): number {
  return (
    compareCodePoints(left.kind, right.kind) ||
    compareCodePoints(left.label, right.label) ||
    compareCodePoints(left.path ?? '', right.path ?? '') ||
    compareCodePoints(typedEvidenceValue(left.before), typedEvidenceValue(right.before)) ||
    compareCodePoints(typedEvidenceValue(left.after), typedEvidenceValue(right.after)) ||
    compareCodePoints(redactedSortKey(left.redacted), redactedSortKey(right.redacted))
  );
}

function typedEvidenceValue(value: EvidenceRef['before']): string {
  return `${typeof value}:${String(value ?? '')}`;
}

function redactedSortKey(value: EvidenceRef['redacted']): string {
  if (value === undefined) {
    return '0';
  }
  return value ? '2' : '1';
}

function evidenceKey(evidence: EvidenceRef): string {
  return JSON.stringify([
    evidence.kind,
    evidence.label,
    evidence.path,
    typeof evidence.before,
    evidence.before,
    typeof evidence.after,
    evidence.after,
    evidence.redacted,
  ]);
}

function cloneAndSortEvidence(evidence: readonly EvidenceRef[]): EvidenceRef[] {
  const unique = new Map<string, EvidenceRef>();
  for (const item of evidence) {
    unique.set(evidenceKey(item), { ...item });
  }
  return [...unique.values()].sort(compareEvidence);
}

function sortSignals(signals: readonly ReadinessSignal[]): ReadinessSignal[] {
  return signals
    .map((signal) => ({
      ...signal,
      evidence: cloneAndSortEvidence(signal.evidence),
    }))
    .sort(compareSignals);
}

export function scoreReadinessSignals(signals: ReadinessSignal[]): ReadinessScoreSummary {
  let internalScore = 0;
  let highestSeverity: SignalSeverity = 'info';
  let highSignalCount = 0;
  let criticalSignalCount = 0;

  for (const signal of signals) {
    internalScore += SEVERITY_POINTS[signal.severity];
    if (SEVERITY_RANK[signal.severity] > SEVERITY_RANK[highestSeverity]) {
      highestSeverity = signal.severity;
    }
    if (signal.severity === 'high') {
      highSignalCount += 1;
    }
    if (signal.severity === 'critical') {
      criticalSignalCount += 1;
    }
  }

  return {
    internalScore,
    highestSeverity,
    highSignalCount,
    criticalSignalCount,
  };
}

export function selectTopConcerns(
  signals: ReadinessSignal[],
  options?: { limit?: number }
): string[] {
  const requestedLimit = options?.limit ?? 5;
  const limit = Number.isFinite(requestedLimit) ? Math.max(0, Math.floor(requestedLimit)) : 5;
  if (limit === 0) {
    return [];
  }
  const titles = new Set<string>();

  for (const signal of [...signals].sort(compareSignals)) {
    titles.add(signal.title);
    if (titles.size >= limit) {
      break;
    }
  }

  return [...titles];
}

function hasCategorySignal(
  input: ComposeReadinessSnapshotInput,
  category: ReadinessCategory
): boolean {
  return input.signals.some((signal) => signal.category === category);
}

type PartialDataSource = PartialDataNotice['source'];

const UNIVERSAL_SAFE_AREA_BLOCKERS: readonly PartialDataSource[] = [
  'zip_scan',
  'large_file_diff',
  'detector',
];

function hasCompleteSupportingData(
  input: ComposeReadinessSnapshotInput,
  additionalBlockers: readonly PartialDataSource[] = []
): boolean {
  const blockers = new Set<PartialDataSource>([
    ...UNIVERSAL_SAFE_AREA_BLOCKERS,
    ...additionalBlockers,
  ]);
  return !(input.unavailableData ?? []).some((notice) => blockers.has(notice.source));
}

export function selectSafeLookingAreas(input: ComposeReadinessSnapshotInput): string[] {
  const available = new Set(input.availableDetectors);
  const safeAreas: string[] = [];
  const comparisonDataComplete = hasCompleteSupportingData(input, ['github_base', 'rate_limit']);

  if (
    input.githubComparisonAvailable &&
    comparisonDataComplete &&
    available.has('sensitive_paths') &&
    input.comparison.sensitiveFilesChanged === 0
  ) {
    safeAreas.push('No sensitive file changes detected.');
  }
  if (
    input.githubComparisonAvailable &&
    comparisonDataComplete &&
    available.has('dependencies') &&
    input.comparison.packageManifestChanged === false
  ) {
    safeAreas.push('No dependency manifest changes detected.');
  }
  if (
    hasCompleteSupportingData(input) &&
    available.has('env_secrets') &&
    !hasCategorySignal(input, 'secrets_config')
  ) {
    safeAreas.push('No environment or secret concerns detected.');
  }
  if (
    input.githubComparisonAvailable &&
    comparisonDataComplete &&
    available.has('public_surface') &&
    input.comparison.routeSurfaceChanged === false &&
    !hasCategorySignal(input, 'public_surface')
  ) {
    safeAreas.push('No public surface changes detected.');
  }
  if (
    hasCompleteSupportingData(input) &&
    available.has('tests_ci') &&
    !hasCategorySignal(input, 'testing_recovery')
  ) {
    safeAreas.push('No testing or recovery concerns detected.');
  }
  if (
    hasCompleteSupportingData(input) &&
    available.has('maintainability') &&
    !hasCategorySignal(input, 'maintainability')
  ) {
    safeAreas.push('No maintainability concerns detected.');
  }
  if (
    hasCompleteSupportingData(input, ['github_base', 'rate_limit', 'history']) &&
    available.has('history') &&
    !hasCategorySignal(input, 'change_history') &&
    (input.trends?.length ?? 0) === 0
  ) {
    safeAreas.push('No unusual change-history concerns detected.');
  }

  return safeAreas;
}

function determineState(score: ReadinessScoreSummary): ReadinessState {
  if (score.criticalSignalCount > 0 || score.highSignalCount >= 2 || score.internalScore >= 12) {
    return 'red';
  }
  if (score.highSignalCount === 1 || score.internalScore >= 4) {
    return 'yellow';
  }
  return 'green';
}

function determineConfidence(input: ComposeReadinessSnapshotInput): SnapshotConfidence {
  const available = new Set(input.availableDetectors);
  let confidence: SnapshotConfidence;
  if (!input.githubComparisonAvailable) {
    confidence = 'low';
  } else if (ALL_DETECTORS.every((detector) => available.has(detector))) {
    confidence = 'high';
  } else {
    confidence = 'medium';
  }

  for (const notice of input.unavailableData ?? []) {
    if (CONFIDENCE_RANK[notice.confidenceImpact] < CONFIDENCE_RANK[confidence]) {
      confidence = notice.confidenceImpact;
    }
  }

  return confidence;
}

function buildCategories(signals: readonly ReadinessSignal[]): CategorySummary[] {
  const byCategory = new Map<ReadinessCategory, ReadinessSignal[]>();
  for (const signal of signals) {
    const categorySignals = byCategory.get(signal.category) ?? [];
    categorySignals.push(signal);
    byCategory.set(signal.category, categorySignals);
  }

  return [...byCategory.entries()]
    .sort(
      ([left], [right]) =>
        CATEGORY_RANK[left] - CATEGORY_RANK[right] || compareCodePoints(left, right)
    )
    .map(([category, categorySignals]) => ({
      category,
      signalCount: categorySignals.length,
      highestSeverity: categorySignals.reduce<SignalSeverity>(
        (highest, signal) =>
          SEVERITY_RANK[signal.severity] > SEVERITY_RANK[highest] ? signal.severity : highest,
        'info'
      ),
      evidence: cloneAndSortEvidence(categorySignals.flatMap((signal) => signal.evidence)),
    }));
}

function buildLimitations(input: ComposeReadinessSnapshotInput): string[] {
  const limitations = new Set((input.unavailableData ?? []).map((notice) => notice.message));
  const available = new Set(input.availableDetectors);
  for (const detector of ALL_DETECTORS) {
    if (!available.has(detector)) {
      limitations.add(`Detector unavailable: ${DETECTOR_LABELS[detector]}.`);
    }
  }
  if (
    !input.githubComparisonAvailable &&
    !(input.unavailableData ?? []).some((notice) => notice.source === 'github_base')
  ) {
    limitations.add(
      'GitHub comparison was unavailable, so this snapshot only inspected the exported zip.'
    );
  }
  return [...limitations].sort(compareCodePoints);
}

function stateCopy(state: ReadinessState): {
  headline: string;
  recommendedAction: string;
} {
  if (state === 'red') {
    return {
      headline: 'Deeper production readiness review recommended.',
      recommendedAction: 'Resolve or review critical concerns before deploying.',
    };
  }
  if (state === 'yellow') {
    return {
      headline: 'Review production-sensitive changes before deploying.',
      recommendedAction: 'Review the top concerns and supporting evidence before deploying.',
    };
  }
  return {
    headline: 'No high-priority readiness concerns detected.',
    recommendedAction: 'Continue with normal review before deploying.',
  };
}

export function composeReadinessSnapshot(input: ComposeReadinessSnapshotInput): ReadinessSnapshot {
  const sortedSignals = sortSignals(input.signals);
  const score = scoreReadinessSignals(sortedSignals);
  const state = determineState(score);
  const copy = stateCopy(state);

  return {
    schemaVersion: 'b2g.prs.snapshot.v1',
    generatedAt: input.generatedAt,
    repository: { ...input.repository },
    base: { ...input.base },
    candidate: { ...input.candidate },
    comparison: { ...input.comparison },
    state: {
      state,
      confidence: determineConfidence(input),
      internalScore: score.internalScore,
      headline: copy.headline,
      recommendedAction: copy.recommendedAction,
      topConcerns: selectTopConcerns(sortedSignals),
      safeLookingAreas: selectSafeLookingAreas(input),
    },
    categories: buildCategories(sortedSignals),
    signals: sortedSignals,
    trends: input.trends
      ? input.trends
          .map((trend) => ({
            ...trend,
            evidence: cloneAndSortEvidence(trend.evidence),
          }))
          .sort((left, right) => compareCodePoints(left.id, right.id))
      : undefined,
    outputs: { ...input.outputs },
    limitations: buildLimitations(input),
  };
}
