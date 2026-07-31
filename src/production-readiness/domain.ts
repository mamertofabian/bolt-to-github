export type ReadinessState = 'green' | 'yellow' | 'red';

export type SignalSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type SnapshotConfidence = 'low' | 'medium' | 'high';

export type ReadinessCategory =
  | 'identity_access'
  | 'data_persistence'
  | 'secrets_config'
  | 'deployment_ops'
  | 'external_integrations'
  | 'public_surface'
  | 'testing_recovery'
  | 'maintainability'
  | 'change_history';

export interface RepositoryRef {
  owner: string;
  name: string;
}

export interface GitRefSummary {
  ref: string;
  sha: string;
  compareUrl?: string;
}

export interface CandidateExportSummary {
  id: string;
  label: string;
  zipSizeBytes: number;
  generatedFrom: 'bolt-export-zip';
}

export interface EvidenceRef {
  kind: 'file' | 'dependency' | 'env_var' | 'route' | 'metric' | 'commit' | 'pattern';
  label: string;
  path?: string;
  before?: string | number | boolean;
  after?: string | number | boolean;
  redacted?: boolean;
}

export interface CategorySummary {
  category: ReadinessCategory;
  signalCount: number;
  highestSeverity: SignalSeverity;
  evidence: EvidenceRef[];
}

export interface TrendSummary {
  id: string;
  label: string;
  evidence: EvidenceRef[];
}

export interface SnapshotOutputRefs {
  receiptMarkdown?: string;
  adcFixHandoffMarkdown?: string;
  debugJson?: string;
  commitMarker?: string;
}

export interface PartialDataNotice {
  source: 'github_base' | 'history' | 'zip_scan' | 'large_file_diff' | 'rate_limit' | 'detector';
  message: string;
  confidenceImpact: SnapshotConfidence;
}

export interface ReadinessSignal {
  id: string;
  category: ReadinessCategory;
  severity: SignalSeverity;
  title: string;
  message: string;
  evidence: EvidenceRef[];
  suggestedReview?: string;
  deterministic: true;
}

export interface ComparisonSummary {
  changedFiles: number;
  addedFiles: number;
  deletedFiles: number;
  renamedFiles?: number;
  addedLines?: number;
  deletedLines?: number;
  binaryFilesChanged: number;
  sensitiveFilesChanged: number;
  packageManifestChanged: boolean;
  lockfileChanged: boolean;
  envExampleChanged: boolean;
  routeSurfaceChanged: boolean;
}

export interface ReadinessStateSummary {
  state: ReadinessState;
  confidence: SnapshotConfidence;
  internalScore: number;
  headline: string;
  recommendedAction: string;
  topConcerns: string[];
  safeLookingAreas: string[];
}

export interface ReadinessSnapshot {
  schemaVersion: 'b2g.prs.snapshot.v1';
  generatedAt: string;
  repository: RepositoryRef;
  base: GitRefSummary;
  candidate: CandidateExportSummary;
  comparison: ComparisonSummary;
  state: ReadinessStateSummary;
  categories: CategorySummary[];
  signals: ReadinessSignal[];
  trends?: TrendSummary[];
  outputs: SnapshotOutputRefs;
  limitations: string[];
}
