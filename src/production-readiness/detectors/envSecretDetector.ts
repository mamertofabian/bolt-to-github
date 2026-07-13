import type { EvidenceRef, PartialDataNotice, ReadinessSignal, SignalSeverity } from '../domain';
import { redactEvidenceRef } from '../redaction';
import { extractEnvExampleVariables, extractEnvReferences } from '../rules/env-patterns';
import { detectSecretLikePatterns, type SecretPatternClass } from '../rules/secret-patterns';

export interface PrsTextFile {
  path: string;
  content: string;
}

export type TextFileSnapshot =
  | { status: 'available'; files: readonly PrsTextFile[] }
  | { status: 'unavailable'; limitation: PartialDataNotice };

export type EnvExampleSnapshot =
  | { status: 'present'; path: string; content: string }
  | { status: 'absent'; path: string }
  | { status: 'unavailable'; path: string; limitation: PartialDataNotice };

export interface EnvSecretDetectorInput {
  candidateFiles: readonly PrsTextFile[];
  baseFiles: TextFileSnapshot;
  candidateEnvExample: EnvExampleSnapshot;
  baseEnvExample: EnvExampleSnapshot;
}

export interface EnvSecretDetectionResult {
  signals: ReadinessSignal[];
  detectedVariables: string[];
  redactionApplied: boolean;
  limitations: PartialDataNotice[];
}

type FileSnapshot = {
  path: string;
  content: string;
};

type FileSnapshotResult = {
  files: FileSnapshot[];
  paths: string[];
  limitations: PartialDataNotice[];
  complete: boolean;
};

type VariableOccurrence = {
  public: boolean;
  paths: Set<string>;
};

const CONFIDENCE_ORDER: Record<PartialDataNotice['confidenceImpact'], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const LIMITATION_SOURCES = new Set<PartialDataNotice['source']>([
  'github_base',
  'history',
  'zip_scan',
  'large_file_diff',
  'rate_limit',
  'detector',
]);

const SECRET_PATTERN_LABELS: Record<SecretPatternClass, string> = {
  credential_assignment: 'Credential-like assignment',
  provider_key_prefix: 'Provider key prefix',
  private_key_block: 'Private key block',
  high_entropy_literal: 'High-entropy literal',
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEvidence(left: EvidenceRef, right: EvidenceRef): number {
  return (
    compareStrings(left.label, right.label) ||
    compareStrings(left.path ?? '', right.path ?? '') ||
    compareStrings(left.kind, right.kind)
  );
}

function compareLimitations(left: PartialDataNotice, right: PartialDataNotice): number {
  return (
    compareStrings(left.message, right.message) ||
    compareStrings(left.source, right.source) ||
    CONFIDENCE_ORDER[left.confidenceImpact] - CONFIDENCE_ORDER[right.confidenceImpact]
  );
}

function fixedLimitation(message: string): PartialDataNotice {
  return { source: 'detector', message, confidenceImpact: 'medium' };
}

function snapshotLimitation(
  limitation: PartialDataNotice,
  fallback: PartialDataNotice
): PartialDataNotice {
  try {
    const source = limitation.source;
    const message = limitation.message;
    const confidenceImpact = limitation.confidenceImpact;
    if (
      !LIMITATION_SOURCES.has(source) ||
      typeof message !== 'string' ||
      !message ||
      !Object.prototype.hasOwnProperty.call(CONFIDENCE_ORDER, confidenceImpact)
    ) {
      return { ...fallback };
    }
    return { source, message, confidenceImpact };
  } catch {
    return { ...fallback };
  }
}

function sourceReadLimitation(role: 'candidate' | 'base'): PartialDataNotice {
  return fixedLimitation(`A ${role} source excerpt could not be read safely and was skipped.`);
}

function snapshotFiles(
  files: readonly PrsTextFile[],
  role: 'candidate' | 'base'
): FileSnapshotResult {
  const snapshots: FileSnapshot[] = [];
  const paths: string[] = [];
  const limitations: PartialDataNotice[] = [];
  let complete = true;
  try {
    const length = files.length;
    for (let index = 0; index < length; index += 1) {
      let file: PrsTextFile;
      let path: string;
      try {
        file = files[index];
        path = file.path;
        if (typeof path !== 'string') {
          throw new TypeError('Invalid text excerpt');
        }
        paths.push(path);
      } catch {
        complete = false;
        limitations.push(sourceReadLimitation(role));
        continue;
      }
      try {
        const content = file.content;
        if (typeof content !== 'string') {
          throw new TypeError('Invalid text excerpt');
        }
        snapshots.push({ path, content });
      } catch {
        complete = false;
        limitations.push(sourceReadLimitation(role));
      }
    }
  } catch {
    complete = false;
    limitations.push(sourceReadLimitation(role));
  }
  snapshots.sort((left, right) => compareStrings(left.path, right.path));
  return {
    files: snapshots,
    paths: [...new Set(paths)].sort(compareStrings),
    limitations,
    complete,
  };
}

function isEnvMetadataPath(path: string): boolean {
  const basename = path.replace(/\\/g, '/').split('/').at(-1)?.toLowerCase() ?? '';
  return basename.startsWith('.env');
}

function collectVariables(files: readonly FileSnapshot[]): Map<string, VariableOccurrence> {
  const variables = new Map<string, VariableOccurrence>();
  for (const file of files) {
    if (isEnvMetadataPath(file.path)) {
      continue;
    }
    for (const reference of extractEnvReferences(file.content)) {
      const existing = variables.get(reference.name);
      if (existing) {
        existing.public ||= reference.public;
        existing.paths.add(file.path);
      } else {
        variables.set(reference.name, {
          public: reference.public,
          paths: new Set([file.path]),
        });
      }
    }
  }
  return variables;
}

function variableNames(variables: ReadonlyMap<string, VariableOccurrence>): string[] {
  return [...variables.keys()].sort(compareStrings);
}

function difference(left: readonly string[], right: ReadonlySet<string>): string[] {
  return left.filter((name) => !right.has(name));
}

function variableEvidence(
  names: readonly string[],
  variables: ReadonlyMap<string, VariableOccurrence>,
  pathOverride?: string
): EvidenceRef[] {
  const evidence: EvidenceRef[] = [];
  for (const name of names) {
    const paths = pathOverride
      ? [pathOverride]
      : [...(variables.get(name)?.paths ?? [])].sort(compareStrings);
    if (paths.length === 0) {
      evidence.push({ kind: 'env_var', label: name, redacted: false });
      continue;
    }
    for (const path of paths) {
      evidence.push({ kind: 'env_var', label: name, path, redacted: false });
    }
  }
  return evidence.sort(compareEvidence);
}

function signal(
  id: string,
  severity: SignalSeverity,
  title: string,
  message: string,
  evidence: readonly EvidenceRef[],
  suggestedReview: string
): ReadinessSignal {
  return {
    id,
    category: 'secrets_config',
    severity,
    title,
    message,
    evidence: [...evidence].sort(compareEvidence),
    suggestedReview,
    deterministic: true,
  };
}

function isCommittedEnvPath(path: string): boolean {
  const basename = path.replace(/\\/g, '/').split('/').at(-1)?.toLowerCase() ?? '';
  if (!basename.startsWith('.env')) {
    return false;
  }
  const metadataMarkers = new Set(['example', 'sample', 'template', 'dist']);
  const suffixSegments = basename.split('.').slice(2);
  return !suffixSegments.some((segment) => metadataMarkers.has(segment));
}

function uniqueLimitations(limitations: readonly PartialDataNotice[]): PartialDataNotice[] {
  const unique = new Map<string, PartialDataNotice>();
  for (const rawLimitation of limitations) {
    const limitation = snapshotLimitation(
      rawLimitation,
      fixedLimitation('A detector limitation could not be read safely.')
    );
    const key = `${limitation.message}\u0000${limitation.source}\u0000${limitation.confidenceImpact}`;
    if (!unique.has(key)) {
      unique.set(key, limitation);
    }
  }
  return [...unique.values()].sort(compareLimitations);
}

function snapshotCandidateFiles(input: EnvSecretDetectorInput): FileSnapshotResult {
  try {
    const files = input.candidateFiles;
    return snapshotFiles(files, 'candidate');
  } catch {
    const limitation = sourceReadLimitation('candidate');
    return { files: [], paths: [], limitations: [limitation], complete: false };
  }
}

function snapshotBaseFiles(input: EnvSecretDetectorInput): TextFileSnapshot {
  const fallback = fixedLimitation('Base source availability could not be read safely.');
  try {
    const baseFiles = input.baseFiles;
    const status = baseFiles.status;
    if (status === 'unavailable') {
      const limitation = baseFiles.limitation;
      return { status, limitation: snapshotLimitation(limitation, fallback) };
    }
    if (status === 'available') {
      const files = baseFiles.files;
      const result = snapshotFiles(files, 'base');
      if (!result.complete) {
        return { status: 'unavailable', limitation: sourceReadLimitation('base') };
      }
      return {
        status,
        files: result.files.map(({ path, content }) => ({ path, content })),
      };
    }
  } catch {
    return { status: 'unavailable', limitation: fallback };
  }
  return { status: 'unavailable', limitation: fallback };
}

function snapshotEnvExample(
  input: EnvSecretDetectorInput,
  role: 'candidate' | 'base'
): EnvExampleSnapshot {
  const fallback = fixedLimitation(`The ${role} environment example could not be read safely.`);
  let path = '.env.example';
  try {
    const example = role === 'candidate' ? input.candidateEnvExample : input.baseEnvExample;
    const status = example.status;
    const readPath = example.path;
    if (typeof readPath !== 'string' || !readPath) {
      return { status: 'unavailable', path, limitation: fallback };
    }
    path = readPath;
    if (status === 'absent') {
      return { status, path };
    }
    if (status === 'unavailable') {
      const limitation = example.limitation;
      return { status, path, limitation: snapshotLimitation(limitation, fallback) };
    }
    if (status === 'present') {
      if (role === 'base') {
        return { status, path, content: '' };
      }
      const content = example.content;
      if (typeof content !== 'string') {
        return { status: 'unavailable', path, limitation: fallback };
      }
      return { status, path, content };
    }
  } catch {
    return { status: 'unavailable', path, limitation: fallback };
  }
  return { status: 'unavailable', path, limitation: fallback };
}

function createCoverageSignal(
  candidateNames: readonly string[],
  candidateVariables: ReadonlyMap<string, VariableOccurrence>,
  candidateExample: EnvExampleSnapshot,
  baseExample: EnvExampleSnapshot
): ReadinessSignal | undefined {
  if (candidateExample.status === 'unavailable') {
    return undefined;
  }

  if (candidateExample.status === 'present') {
    const covered = new Set(extractEnvExampleVariables(candidateExample.content));
    const missing = candidateNames.filter((name) => !covered.has(name));
    if (missing.length === 0) {
      return undefined;
    }
    return signal(
      'env:example-coverage',
      'high',
      'Environment example coverage is incomplete',
      `${missing.length} referenced environment variable${missing.length === 1 ? ' is' : 's are'} missing from ${candidateExample.path}.`,
      variableEvidence(missing, candidateVariables, candidateExample.path),
      'Update the example configuration with names and safe placeholders before deployment.'
    );
  }

  const removed = baseExample.status === 'present';
  if (candidateNames.length === 0 && !removed) {
    return undefined;
  }
  const message = removed
    ? `${candidateExample.path} was removed while environment configuration remains relevant.`
    : `Environment variables are referenced, but ${candidateExample.path} is missing.`;
  const evidence =
    candidateNames.length > 0
      ? variableEvidence(candidateNames, candidateVariables, candidateExample.path)
      : [
          {
            kind: 'file' as const,
            label: 'Environment example removed',
            path: candidateExample.path,
          },
        ];
  return signal(
    'env:example-coverage',
    'high',
    removed ? 'Environment example was removed' : 'Environment example is missing',
    message,
    evidence,
    'Add or restore an environment example containing names and safe placeholders only.'
  );
}

export function detectEnvAndSecretSignals(input: EnvSecretDetectorInput): EnvSecretDetectionResult {
  const signals: ReadinessSignal[] = [];
  const limitations: PartialDataNotice[] = [];
  const candidateFileSnapshot = snapshotCandidateFiles(input);
  const candidateFiles = candidateFileSnapshot.files;
  limitations.push(...candidateFileSnapshot.limitations);
  const baseFiles = snapshotBaseFiles(input);
  const candidateEnvExample = snapshotEnvExample(input, 'candidate');
  const baseEnvExample = snapshotEnvExample(input, 'base');
  const candidateVariables = collectVariables(candidateFiles);
  const candidateNames = variableNames(candidateVariables);

  if (baseFiles.status === 'available') {
    const baseVariables = collectVariables(
      baseFiles.files.map(({ path, content }) => ({ path, content }))
    );
    const baseNames = variableNames(baseVariables);
    const baseNameSet = new Set(baseNames);
    const candidateNameSet = new Set(candidateNames);
    const added = difference(candidateNames, baseNameSet);
    const removed = candidateFileSnapshot.complete ? difference(baseNames, candidateNameSet) : [];
    const publicAdded = added.filter((name) => candidateVariables.get(name)?.public === true);

    if (added.length > 0) {
      signals.push(
        signal(
          'env:new-references',
          'medium',
          'New environment variable references detected',
          `${added.length} environment variable reference${added.length === 1 ? ' was' : 's were'} introduced in the candidate export.`,
          variableEvidence(added, candidateVariables),
          'Confirm each variable is configured in preview and production environments.'
        )
      );
    }
    if (removed.length > 0) {
      signals.push(
        signal(
          'env:removed-references',
          'medium',
          'Environment variable references removed',
          `${removed.length} environment variable reference${removed.length === 1 ? ' was' : 's were'} removed from the candidate export.`,
          variableEvidence(removed, baseVariables),
          'Review deployment configuration and cleanup assumptions before removing values.'
        )
      );
    }
    if (publicAdded.length > 0) {
      signals.push(
        signal(
          'env:public-references',
          'high',
          'New public environment variables detected',
          `${publicAdded.length} new public environment variable${publicAdded.length === 1 ? '' : 's'} requires review for client-side exposure.`,
          variableEvidence(publicAdded, candidateVariables),
          'Confirm each public variable is safe for client-side exposure and contains no secret.'
        )
      );
    }
  } else {
    limitations.push(baseFiles.limitation);
  }

  if (candidateEnvExample.status === 'unavailable') {
    limitations.push(candidateEnvExample.limitation);
  }
  if (baseEnvExample.status === 'unavailable') {
    limitations.push(baseEnvExample.limitation);
  }
  const coverage = createCoverageSignal(
    candidateNames,
    candidateVariables,
    candidateEnvExample,
    baseEnvExample
  );
  if (coverage) {
    signals.push(coverage);
  }

  const committedEnvPaths = candidateFileSnapshot.paths.filter(isCommittedEnvPath);
  if (committedEnvPaths.length > 0) {
    signals.push(
      signal(
        'secret:committed-env-files',
        'critical',
        'Environment files included in export',
        `${committedEnvPaths.length} environment file${committedEnvPaths.length === 1 ? ' was' : 's were'} found in the exported project. Do not commit real secrets.`,
        committedEnvPaths.map((path) =>
          redactEvidenceRef({ kind: 'file', label: 'Environment file included', path })
        ),
        'Remove real environment files from the export and rotate exposed credentials if needed.'
      )
    );
  }

  const secretEvidence = new Map<string, EvidenceRef>();
  for (const file of candidateFiles) {
    for (const match of detectSecretLikePatterns(file.content)) {
      const label = SECRET_PATTERN_LABELS[match.pattern];
      const key = `${file.path}\u0000${match.pattern}`;
      if (!secretEvidence.has(key)) {
        secretEvidence.set(
          key,
          redactEvidenceRef({ kind: 'pattern', label, path: file.path, redacted: match.redacted })
        );
      }
    }
  }
  if (secretEvidence.size > 0) {
    signals.push(
      signal(
        'secret:possible-values',
        'critical',
        'Possible secret-looking values detected',
        `${secretEvidence.size} possible secret-looking pattern${secretEvidence.size === 1 ? ' was' : 's were'} detected. Values are hidden in this report.`,
        [...secretEvidence.values()],
        'Review the listed files before committing and rotate any real credential that was exposed.'
      )
    );
  }

  return {
    signals: signals.sort((left, right) => compareStrings(left.id, right.id)),
    detectedVariables: candidateNames,
    redactionApplied: committedEnvPaths.length > 0 || secretEvidence.size > 0,
    limitations: uniqueLimitations(limitations),
  };
}
