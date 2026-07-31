import type { EvidenceRef, ReadinessCategory, ReadinessSignal, SignalSeverity } from '../domain';
import { categorizeDependency, type DependencyCategory } from '../rules/dependency-categories';

export interface PackageManifest {
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
  peerDependencies?: Readonly<Record<string, string>>;
  optionalDependencies?: Readonly<Record<string, string>>;
}

export interface DependencyDetectorInput {
  candidatePackageJson: PackageManifest | null;
  basePackageJson: PackageManifest | null;
  candidatePackageJsonAvailable: boolean;
  basePackageJsonAvailable: boolean;
  candidateLockfiles: string[];
  baseLockfiles: string[];
  packageManifestChanged: boolean;
  lockfileChanged: boolean;
}

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

type DependencySection = (typeof DEPENDENCY_SECTIONS)[number];

type DependencyRecord = {
  name: string;
  section: DependencySection;
  version: string;
};

type DependencyChange = {
  name: string;
  section: DependencySection;
  before?: string;
  after?: string;
};

type DependencyMove = {
  name: string;
  beforeSection: DependencySection;
  afterSection: DependencySection;
  before: string;
  after: string;
};

type CategoryPresentation = {
  readinessCategory: ReadinessCategory;
  severity: SignalSeverity;
  label: string;
  suggestedReview: string;
};

const CATEGORY_PRESENTATION: Readonly<Record<DependencyCategory, CategoryPresentation>> = {
  auth: {
    readinessCategory: 'identity_access',
    severity: 'high',
    label: 'authentication',
    suggestedReview: 'Review sign-in, session, and access-control configuration.',
  },
  database: {
    readinessCategory: 'data_persistence',
    severity: 'high',
    label: 'database',
    suggestedReview: 'Review schema, connection, migration, and production-data assumptions.',
  },
  payments: {
    readinessCategory: 'external_integrations',
    severity: 'high',
    label: 'payments',
    suggestedReview: 'Review credentials, webhooks, retries, and failure handling.',
  },
  email_sms: {
    readinessCategory: 'external_integrations',
    severity: 'high',
    label: 'email or messaging',
    suggestedReview: 'Review credentials, delivery behavior, retries, and failure handling.',
  },
  ai_api: {
    readinessCategory: 'external_integrations',
    severity: 'high',
    label: 'AI API',
    suggestedReview: 'Review credentials, cost controls, privacy, and failure handling.',
  },
  validation: {
    readinessCategory: 'maintainability',
    severity: 'medium',
    label: 'validation',
    suggestedReview: 'Review where validation is applied and how invalid input is handled.',
  },
  monitoring: {
    readinessCategory: 'deployment_ops',
    severity: 'medium',
    label: 'monitoring',
    suggestedReview: 'Review telemetry configuration, privacy, and production error handling.',
  },
  platform_storage: {
    readinessCategory: 'external_integrations',
    severity: 'high',
    label: 'platform or storage',
    suggestedReview: 'Review credentials, access policies, storage behavior, and failure handling.',
  },
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

function dependencyRecords(manifest: PackageManifest | null): DependencyRecord[] {
  if (!manifest) {
    return [];
  }
  const records: DependencyRecord[] = [];
  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      records.push({ name, section, version });
    }
  }
  return records.sort(
    (left, right) =>
      compareCodePoints(left.name, right.name) || compareCodePoints(left.section, right.section)
  );
}

function recordKey(record: Pick<DependencyRecord, 'name' | 'section'>): string {
  return `${record.section}\0${record.name}`;
}

function dependencyChanges(
  candidate: PackageManifest | null,
  base: PackageManifest | null
): {
  added: DependencyChange[];
  removed: DependencyChange[];
  versionChanged: DependencyChange[];
  moved: DependencyMove[];
  introduced: DependencyRecord[];
} {
  const candidateRecords = dependencyRecords(candidate);
  const baseRecords = dependencyRecords(base);
  const candidateByKey = new Map(candidateRecords.map((record) => [recordKey(record), record]));
  const baseByKey = new Map(baseRecords.map((record) => [recordKey(record), record]));
  const baseNames = new Set(baseRecords.map((record) => record.name));
  let added: DependencyChange[] = [];
  let removed: DependencyChange[] = [];
  const versionChanged: DependencyChange[] = [];

  for (const record of candidateRecords) {
    const previous = baseByKey.get(recordKey(record));
    if (!previous) {
      added.push({ name: record.name, section: record.section, after: record.version });
    } else if (previous.version !== record.version) {
      versionChanged.push({
        name: record.name,
        section: record.section,
        before: previous.version,
        after: record.version,
      });
    }
  }
  for (const record of baseRecords) {
    if (!candidateByKey.has(recordKey(record))) {
      removed.push({ name: record.name, section: record.section, before: record.version });
    }
  }

  const pairedAdded = new Set<DependencyChange>();
  const pairedRemoved = new Set<DependencyChange>();
  const moved: DependencyMove[] = [];
  for (const addedChange of added) {
    const removedChange = removed
      .filter((candidate) => candidate.name === addedChange.name && !pairedRemoved.has(candidate))
      .sort(
        (left, right) =>
          Number(left.before !== addedChange.after) - Number(right.before !== addedChange.after) ||
          compareCodePoints(left.section, right.section)
      )[0];
    if (!removedChange || !addedChange.after || !removedChange.before) {
      continue;
    }
    pairedAdded.add(addedChange);
    pairedRemoved.add(removedChange);
    moved.push({
      name: addedChange.name,
      beforeSection: removedChange.section,
      afterSection: addedChange.section,
      before: removedChange.before,
      after: addedChange.after,
    });
    if (removedChange.before !== addedChange.after) {
      versionChanged.push({
        name: addedChange.name,
        section: addedChange.section,
        before: removedChange.before,
        after: addedChange.after,
      });
    }
  }
  added = added.filter((change) => !pairedAdded.has(change));
  removed = removed.filter((change) => !pairedRemoved.has(change));
  versionChanged.sort(
    (left, right) =>
      compareCodePoints(left.name, right.name) || compareCodePoints(left.section, right.section)
  );

  const introducedByName = new Map<string, DependencyRecord>();
  for (const record of candidateRecords) {
    if (!baseNames.has(record.name) && !introducedByName.has(record.name)) {
      introducedByName.set(record.name, record);
    }
  }

  return {
    added,
    removed,
    versionChanged,
    moved,
    introduced: [...introducedByName.values()],
  };
}

function changeEvidence(change: DependencyChange): EvidenceRef {
  return {
    kind: 'dependency',
    label: `${change.name} (${change.section})`,
    before: change.before,
    after: change.after,
  };
}

function signal(
  id: string,
  category: ReadinessCategory,
  severity: SignalSeverity,
  title: string,
  message: string,
  evidence: EvidenceRef[],
  suggestedReview?: string
): ReadinessSignal {
  return {
    id,
    category,
    severity,
    title,
    message,
    evidence,
    suggestedReview,
    deterministic: true,
  };
}

function lockfileManager(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1);
  if (basename === 'package-lock.json' || basename === 'npm-shrinkwrap.json') {
    return 'npm';
  }
  if (basename === 'pnpm-lock.yaml') {
    return 'pnpm';
  }
  if (basename === 'yarn.lock') {
    return 'yarn';
  }
  if (basename === 'bun.lock' || basename === 'bun.lockb') {
    return 'bun';
  }
  if (basename === 'deno.lock') {
    return 'deno';
  }
  return `unknown:${basename}`;
}

function lockfileEvidence(paths: readonly string[]): EvidenceRef[] {
  return [...new Set(paths)]
    .sort(compareCodePoints)
    .map((path) => ({ kind: 'file', label: path, path }));
}

function categoryIntroductionSignals(introduced: DependencyRecord[]): ReadinessSignal[] {
  const byCategory = new Map<DependencyCategory, DependencyRecord[]>();
  for (const record of introduced) {
    const category = categorizeDependency(record.name);
    if (!category) {
      continue;
    }
    const records = byCategory.get(category) ?? [];
    records.push(record);
    byCategory.set(category, records);
  }

  return [...byCategory.entries()].map(([category, records]) => {
    const presentation = CATEGORY_PRESENTATION[category];
    const sortedRecords = [...records].sort((left, right) =>
      compareCodePoints(left.name, right.name)
    );
    return signal(
      `dependency-category-introduced-${category}`,
      presentation.readinessCategory,
      presentation.severity,
      `New ${presentation.label} dependency`,
      `${sortedRecords.length} production-sensitive ${presentation.label} dependency ${
        sortedRecords.length === 1 ? 'was' : 'were'
      } introduced. Review its production configuration and behavior.`,
      sortedRecords.map((record) => ({
        kind: 'dependency',
        label: record.name,
        after: record.version,
      })),
      presentation.suggestedReview
    );
  });
}

function categoryPromotionSignals(moved: DependencyMove[]): ReadinessSignal[] {
  const byCategory = new Map<DependencyCategory, DependencyMove[]>();
  for (const move of moved) {
    if (
      move.beforeSection !== 'devDependencies' ||
      (move.afterSection !== 'dependencies' && move.afterSection !== 'optionalDependencies')
    ) {
      continue;
    }
    const category = categorizeDependency(move.name);
    if (!category) {
      continue;
    }
    const records = byCategory.get(category) ?? [];
    records.push(move);
    byCategory.set(category, records);
  }

  return [...byCategory.entries()].map(([category, moves]) => {
    const presentation = CATEGORY_PRESENTATION[category];
    const sortedMoves = [...moves].sort((left, right) => compareCodePoints(left.name, right.name));
    return signal(
      `dependency-category-promoted-${category}`,
      presentation.readinessCategory,
      presentation.severity,
      `${presentation.label} dependency moved to runtime`,
      `${sortedMoves.length} production-sensitive ${presentation.label} dependency ${
        sortedMoves.length === 1 ? 'was' : 'were'
      } moved from development tooling to runtime dependencies.`,
      sortedMoves.map((move) => ({
        kind: 'dependency',
        label: move.name,
        before: `${move.beforeSection}:${move.before}`,
        after: `${move.afterSection}:${move.after}`,
      })),
      presentation.suggestedReview
    );
  });
}

export function detectDependencySignals(input: DependencyDetectorInput): ReadinessSignal[] {
  const signals: ReadinessSignal[] = [];
  const comparisonAvailable = input.candidatePackageJsonAvailable && input.basePackageJsonAvailable;
  const changes = comparisonAvailable
    ? dependencyChanges(input.candidatePackageJson, input.basePackageJson)
    : {
        added: [],
        removed: [],
        versionChanged: [],
        moved: [],
        introduced: [],
      };

  if (!comparisonAvailable) {
    signals.push(
      signal(
        'dependency-comparison-unavailable',
        'maintainability',
        'info',
        'Dependency comparison is incomplete',
        'Candidate or base package metadata was unavailable, so dependency drift was not inferred.',
        [
          {
            kind: 'metric',
            label: 'Candidate package manifest available',
            after: input.candidatePackageJsonAvailable,
          },
          {
            kind: 'metric',
            label: 'Base package manifest available',
            after: input.basePackageJsonAvailable,
          },
        ],
        'Review package.json directly when both candidate and base metadata are available.'
      )
    );
  }

  if (changes.added.length > 0) {
    signals.push(
      signal(
        'dependency-added',
        'maintainability',
        'medium',
        'Dependencies added',
        `${changes.added.length} dependency ${
          changes.added.length === 1 ? 'entry was' : 'entries were'
        } added. Review install and runtime implications.`,
        changes.added.map(changeEvidence),
        'Confirm each dependency is intentional and configured for production.'
      )
    );
  }
  if (changes.removed.length > 0) {
    signals.push(
      signal(
        'dependency-removed',
        'maintainability',
        'medium',
        'Dependencies removed',
        `${changes.removed.length} dependency ${
          changes.removed.length === 1 ? 'entry was' : 'entries were'
        } removed. Review imports, build steps, and runtime assumptions.`,
        changes.removed.map(changeEvidence),
        'Confirm removed packages are no longer required by source or build tooling.'
      )
    );
  }
  if (changes.versionChanged.length > 0) {
    signals.push(
      signal(
        'dependency-version-changed',
        'maintainability',
        'medium',
        'Dependency versions changed',
        `${changes.versionChanged.length} dependency ${
          changes.versionChanged.length === 1 ? 'version changed' : 'versions changed'
        }. Review release notes and compatibility.`,
        changes.versionChanged.map(changeEvidence),
        'Review compatibility and migration notes for the changed versions.'
      )
    );
  }
  if (changes.moved.length > 0) {
    signals.push(
      signal(
        'dependency-section-moved',
        'maintainability',
        'medium',
        'Dependency sections changed',
        `${changes.moved.length} dependency ${
          changes.moved.length === 1 ? 'was' : 'were'
        } moved between package manifest sections. Review runtime and tooling implications.`,
        changes.moved.map((move) => ({
          kind: 'dependency',
          label: `${move.name} (${move.beforeSection} → ${move.afterSection})`,
          before: move.before,
          after: move.after,
        })),
        'Confirm each dependency remains in the section that matches how the project uses it.'
      )
    );
  }

  signals.push(...categoryIntroductionSignals(changes.introduced));
  signals.push(...categoryPromotionSignals(changes.moved));

  const candidateLockfiles = [...new Set(input.candidateLockfiles)].sort(compareCodePoints);
  const managers = new Set(candidateLockfiles.map(lockfileManager));
  if (managers.size > 1) {
    signals.push(
      signal(
        'dependency-package-manager-conflict',
        'deployment_ops',
        'high',
        'Multiple package managers detected',
        'Lockfiles for multiple package managers are present. Confirm which manager is authoritative.',
        lockfileEvidence(candidateLockfiles),
        'Keep only the intended package-manager lockfile unless the repository deliberately uses more than one.'
      )
    );
  }

  if (input.packageManifestChanged && !input.lockfileChanged) {
    signals.push(
      signal(
        'dependency-manifest-changed-without-lockfile',
        'deployment_ops',
        'medium',
        'Package manifest changed without a lockfile update',
        'Package metadata changed, but no lockfile change was reported. Dependency resolution may not match the manifest.',
        [{ kind: 'file', label: 'package.json', path: 'package.json' }],
        'Regenerate the authoritative lockfile with the project package manager.'
      )
    );
  }
  if (input.lockfileChanged && !input.packageManifestChanged) {
    const paths = [...input.candidateLockfiles, ...input.baseLockfiles];
    const evidence = lockfileEvidence(paths);
    if (evidence.length === 0) {
      evidence.push({
        kind: 'metric',
        label: 'Lockfile content change reported',
        after: true,
      });
    }
    signals.push(
      signal(
        'dependency-lockfile-changed-without-manifest',
        'deployment_ops',
        'medium',
        'Lockfile changed without a package manifest update',
        'A lockfile changed without a reported package manifest change. Review whether the resolution change is intentional.',
        evidence,
        'Review the lockfile diff and confirm the resolved dependency change is intentional.'
      )
    );
  }

  return signals.sort((left, right) => compareCodePoints(left.id, right.id));
}
