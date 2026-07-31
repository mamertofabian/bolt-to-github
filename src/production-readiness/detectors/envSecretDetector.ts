import type { EvidenceRef, ReadinessSignal, SignalSeverity } from '../domain';
import { extractEnvReferences } from '../rules/env-patterns';
import { detectSecretLikePatterns } from '../rules/secret-patterns';

export interface PrsTextFile {
  path: string;
  content: string;
}

export interface EnvSecretDetectorInput {
  candidateFiles: PrsTextFile[];
  baseFiles: PrsTextFile[];
  baseFilesAvailable: boolean;
  candidateEnvExample: string | null;
  baseEnvExample: string | null;
}

export interface EnvSecretDetectionResult {
  signals: ReadinessSignal[];
  detectedVariables: string[];
  redactionApplied: boolean;
}

interface LocatedEnvReference {
  name: string;
  public: boolean;
  paths: string[];
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

function createSignal(
  id: string,
  severity: SignalSeverity,
  title: string,
  message: string,
  evidence: EvidenceRef[],
  suggestedReview?: string
): ReadinessSignal {
  return {
    id,
    category: 'secrets_config',
    severity,
    title,
    message,
    evidence,
    suggestedReview,
    deterministic: true,
  };
}

function collectEnvReferences(files: readonly PrsTextFile[]): LocatedEnvReference[] {
  const references = new Map<string, { public: boolean; paths: Set<string> }>();

  for (const file of [...files]
    .filter((candidate) => isEnvReferenceSourcePath(candidate.path))
    .sort((left, right) => compareCodePoints(left.path, right.path))) {
    for (const reference of extractEnvReferences(file.content)) {
      const current = references.get(reference.name) ?? {
        public: reference.public,
        paths: new Set<string>(),
      };
      current.public ||= reference.public;
      current.paths.add(file.path);
      references.set(reference.name, current);
    }
  }

  return [...references.entries()]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([name, reference]) => ({
      name,
      public: reference.public,
      paths: [...reference.paths].sort(),
    }));
}

function isEnvReferenceSourcePath(path: string): boolean {
  const basename = path.toLowerCase().replaceAll('\\', '/').split('/').at(-1) ?? path;

  return (
    !/^\.env(?:$|\.)/.test(basename) &&
    !/\.(?:adoc|md|mdx|rst|txt)$/.test(basename) &&
    !/^(?:changelog|contributing|license|readme)(?:\.|$)/.test(basename)
  );
}

function envEvidence(reference: LocatedEnvReference): EvidenceRef {
  return {
    kind: 'env_var',
    label: reference.name,
    path: reference.paths[0],
  };
}

function parseEnvExampleVariables(content: string | null): Set<string> {
  const variables = new Set<string>();
  if (content === null) {
    return variables;
  }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
    if (match?.[1]) {
      variables.add(match[1]);
    }
  }

  return variables;
}

function isSecretEnvFile(path: string): boolean {
  const basename = path.split('/').at(-1) ?? path;
  if (!/^\.env(?:$|\.)/.test(basename)) {
    return false;
  }

  return !/\.(?:example|sample|template)$/.test(basename);
}

function detectEnvFileEvidence(files: readonly PrsTextFile[]): EvidenceRef[] {
  return files
    .map((file) => file.path)
    .filter(isSecretEnvFile)
    .sort()
    .map((path) => ({
      kind: 'file' as const,
      label: 'Environment file included in export',
      path,
      redacted: true,
    }));
}

function detectSecretPatternEvidence(files: readonly PrsTextFile[]): EvidenceRef[] {
  const evidence: EvidenceRef[] = [];

  for (const file of [...files].sort((left, right) => compareCodePoints(left.path, right.path))) {
    for (const match of detectSecretLikePatterns(file.content)) {
      if (match.pattern === 'high-entropy-config-value' && !isConfigLikePath(file.path)) {
        continue;
      }
      evidence.push({
        kind: 'pattern',
        label: match.pattern,
        path: file.path,
        redacted: true,
      });
    }
  }

  return evidence.sort(
    (left, right) =>
      compareCodePoints(left.label, right.label) ||
      compareCodePoints(left.path ?? '', right.path ?? '')
  );
}

function isConfigLikePath(path: string): boolean {
  const normalized = path.toLowerCase().replaceAll('\\', '/');
  const segments = normalized.split('/');
  const basename = segments.at(-1) ?? normalized;

  return (
    /^\.env(?:$|\.)/.test(basename) ||
    /^(?:appsettings|config|configuration|credentials|deploy|deployment|environment|secrets|settings)(?:[._-]|$)/.test(
      basename
    ) ||
    /[._-]config(?:[._-]|$)/.test(basename) ||
    segments.some((segment) => ['config', 'configs', 'configuration'].includes(segment))
  );
}

export function detectEnvAndSecretSignals(input: EnvSecretDetectorInput): EnvSecretDetectionResult {
  const signals: ReadinessSignal[] = [];
  const candidateReferences = collectEnvReferences(input.candidateFiles);
  const baseReferences = input.baseFilesAvailable ? collectEnvReferences(input.baseFiles) : [];
  const candidateByName = new Map(
    candidateReferences.map((reference) => [reference.name, reference])
  );
  const baseByName = new Map(baseReferences.map((reference) => [reference.name, reference]));

  if (input.baseFilesAvailable) {
    const introduced = candidateReferences.filter((reference) => !baseByName.has(reference.name));
    const removed = baseReferences.filter((reference) => !candidateByName.has(reference.name));
    const introducedPublic = introduced.filter((reference) => reference.public);

    if (introduced.length > 0) {
      signals.push(
        createSignal(
          'env-variable-introduced',
          'medium',
          'New environment variables referenced',
          'New environment variable references were found in the candidate export.',
          introduced.map(envEvidence),
          'Confirm each variable is configured in the deployment environment.'
        )
      );
    }

    if (introducedPublic.length > 0) {
      signals.push(
        createSignal(
          'env-public-variable-introduced',
          'high',
          'New public environment variables referenced',
          'New client-visible environment variable references were found.',
          introducedPublic.map(envEvidence),
          'Confirm these values are safe for client-side exposure.'
        )
      );
    }

    if (removed.length > 0) {
      signals.push(
        createSignal(
          'env-variable-removed',
          'low',
          'Environment variable references removed',
          'Environment variables referenced by the base are no longer referenced by the candidate.',
          removed.map(envEvidence),
          'Remove obsolete deployment configuration only after confirming it is unused.'
        )
      );
    }
  } else {
    signals.push(
      createSignal(
        'env-comparison-unavailable',
        'info',
        'Environment comparison unavailable',
        'Base source text was unavailable, so introduced and removed environment variables were not inferred.',
        [
          {
            kind: 'metric',
            label: 'Base environment reference comparison available',
            after: false,
          },
        ]
      )
    );
  }

  const exampleVariables = parseEnvExampleVariables(input.candidateEnvExample);
  const uncovered = candidateReferences.filter(
    (reference) => !exampleVariables.has(reference.name)
  );
  if (uncovered.length > 0) {
    signals.push(
      createSignal(
        'env-example-missing-coverage',
        'medium',
        'Environment example is missing referenced variables',
        'One or more candidate environment references are absent from .env.example.',
        uncovered.map((reference) => ({
          ...envEvidence(reference),
          path: input.candidateEnvExample === null ? undefined : '.env.example',
        })),
        'Document variable names with safe placeholder values before deployment.'
      )
    );
  }

  const envFileEvidence = detectEnvFileEvidence(input.candidateFiles);
  if (envFileEvidence.length > 0) {
    signals.push(
      createSignal(
        'env-file-in-export',
        'critical',
        'Environment file included in export',
        'A secret-bearing environment file may be included in the export. Values are hidden.',
        envFileEvidence,
        'Remove the environment file and rotate any exposed credentials before committing.'
      )
    );
  }

  const secretPatternEvidence = detectSecretPatternEvidence(input.candidateFiles);
  if (secretPatternEvidence.length > 0) {
    signals.push(
      createSignal(
        'possible-secret-value',
        'high',
        'Possible secret-looking value detected',
        'Possible secret-looking values were detected. Values are hidden; review before committing.',
        secretPatternEvidence,
        'Verify the flagged locations and move real secrets to deployment configuration.'
      )
    );
  }

  return {
    signals: signals.sort((left, right) => compareCodePoints(left.id, right.id)),
    detectedVariables: candidateReferences.map((reference) => reference.name),
    redactionApplied: envFileEvidence.length > 0 || secretPatternEvidence.length > 0,
  };
}
