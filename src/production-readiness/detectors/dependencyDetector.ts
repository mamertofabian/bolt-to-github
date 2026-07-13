import type {
  EvidenceRef,
  PartialDataNotice,
  ReadinessCategory,
  ReadinessSignal,
  SignalSeverity,
} from '../domain';
import type { FileDiffEntry, InventoryDiffResult } from '../diff/diffEngine';
import { categorizeDependency, type DependencyCategory } from '../rules/dependency-categories';

export type PackageDependencySection =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

export interface PackageManifest {
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
  peerDependencies?: Readonly<Record<string, string>>;
  optionalDependencies?: Readonly<Record<string, string>>;
}

export type PackageManifestSnapshot =
  | { status: 'present'; path: string; manifest: PackageManifest }
  | { status: 'absent'; path: string }
  | { status: 'unavailable'; path: string; limitation: PartialDataNotice };

export interface DependencyDetectorInput {
  candidatePackageJson: PackageManifestSnapshot;
  basePackageJson: PackageManifestSnapshot;
  candidateLockfiles: readonly string[];
  baseLockfiles: readonly string[];
  diff: InventoryDiffResult;
}

export interface DependencyDetectionResult {
  signals: ReadinessSignal[];
  limitations: PartialDataNotice[];
}

type DependencyDeclaration = {
  section: PackageDependencySection;
  name: string;
  version: string;
};

type DependencyChange = DependencyDeclaration & {
  before?: string;
  after?: string;
};

type CategoryPolicy = {
  category: ReadinessCategory;
  severity: SignalSeverity;
  label: string;
  suggestedReview: string;
};

const DEPENDENCY_SECTIONS: readonly PackageDependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

const CATEGORY_POLICY: Record<DependencyCategory, CategoryPolicy> = {
  auth: {
    category: 'identity_access',
    severity: 'high',
    label: 'authentication',
    suggestedReview: 'Review sign-in, session, and access-control configuration.',
  },
  database: {
    category: 'data_persistence',
    severity: 'high',
    label: 'database',
    suggestedReview: 'Review connection, schema, migration, and production data assumptions.',
  },
  payments: {
    category: 'external_integrations',
    severity: 'high',
    label: 'payment',
    suggestedReview: 'Review credentials, webhook handling, retries, and failure states.',
  },
  email_sms: {
    category: 'external_integrations',
    severity: 'medium',
    label: 'email or messaging',
    suggestedReview: 'Review credentials, delivery failures, retries, and rate limits.',
  },
  ai_api: {
    category: 'external_integrations',
    severity: 'medium',
    label: 'AI API',
    suggestedReview: 'Review credentials, data handling, cost limits, and degraded states.',
  },
  validation: {
    category: 'maintainability',
    severity: 'low',
    label: 'validation',
    suggestedReview: 'Review where validation is enforced and how failures are surfaced.',
  },
  monitoring: {
    category: 'external_integrations',
    severity: 'medium',
    label: 'monitoring or analytics',
    suggestedReview: 'Review privacy, environment configuration, and failure behavior.',
  },
  platform_storage: {
    category: 'data_persistence',
    severity: 'high',
    label: 'platform or storage',
    suggestedReview: 'Review credentials, access rules, persistence, and production configuration.',
  },
};

const CONFIDENCE_ORDER: Record<PartialDataNotice['confidenceImpact'], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const REDACTED_DEPENDENCY_SPECIFIER = '[redacted dependency specifier]';
const ALLOWED_DEPENDENCY_DIST_TAGS = new Set([
  'alpha',
  'beta',
  'canary',
  'dev',
  'latest',
  'next',
  'rc',
  'stable',
]);
const VERSION_TOKEN =
  /^v?(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*|[xX*])){0,2}(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

type MajorInterval = {
  min: number;
  max: number | null;
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEvidence(left: EvidenceRef, right: EvidenceRef): number {
  return (
    compareStrings(left.label, right.label) ||
    compareStrings(left.path ?? '', right.path ?? '') ||
    compareStrings(String(left.before ?? ''), String(right.before ?? '')) ||
    compareStrings(String(left.after ?? ''), String(right.after ?? ''))
  );
}

function compareLimitations(left: PartialDataNotice, right: PartialDataNotice): number {
  return (
    compareStrings(left.message, right.message) ||
    compareStrings(left.source, right.source) ||
    CONFIDENCE_ORDER[left.confidenceImpact] - CONFIDENCE_ORDER[right.confidenceImpact]
  );
}

function dependencyKey(declaration: DependencyDeclaration): string {
  return `${declaration.section}\u0000${declaration.name}`;
}

function declarations(manifest: PackageManifest): DependencyDeclaration[] {
  const result: DependencyDeclaration[] = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const values = manifest[section];
    if (values === undefined) {
      continue;
    }
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
      throw new TypeError(`Package manifest ${section} must be an object.`);
    }
    for (const [name, version] of Object.entries(values)) {
      if (!name || name.trim() !== name || typeof version !== 'string') {
        throw new TypeError(`Package manifest ${section} contains an invalid dependency entry.`);
      }
      result.push({ section, name, version });
    }
  }
  return result.sort(
    (left, right) =>
      compareStrings(left.name, right.name) || compareStrings(left.section, right.section)
  );
}

function manifestDeclarations(snapshot: PackageManifestSnapshot): DependencyDeclaration[] | null {
  if (snapshot.status === 'unavailable') {
    return null;
  }
  return snapshot.status === 'present' ? declarations(snapshot.manifest) : [];
}

function dependencyEvidence(
  change: DependencyChange,
  action: 'added to' | 'removed from' | 'changed in',
  path: string
): EvidenceRef {
  const before = sanitizeDependencySpecifier(change.before);
  const after = sanitizeDependencySpecifier(change.after);
  return {
    kind: 'dependency',
    label: `${change.name} ${action} ${change.section}`,
    path,
    before: before.value,
    after: after.value,
    redacted: before.redacted || after.redacted ? true : undefined,
  };
}

function signal(
  id: string,
  category: ReadinessCategory,
  severity: SignalSeverity,
  title: string,
  message: string,
  evidence: EvidenceRef[],
  suggestedReview: string
): ReadinessSignal {
  return {
    id,
    category,
    severity,
    title,
    message,
    evidence: [...evidence].sort(compareEvidence),
    suggestedReview,
    deterministic: true,
  };
}

function sanitizeDependencySpecifier(value: string | undefined): {
  value: string | undefined;
  redacted: boolean;
} {
  if (value === undefined) {
    return { value: undefined, redacted: false };
  }
  if (containsControlCharacter(value)) {
    return { value: REDACTED_DEPENDENCY_SPECIFIER, redacted: true };
  }
  const normalized = value.trim();
  if (
    !normalized ||
    (!ALLOWED_DEPENDENCY_DIST_TAGS.has(normalized) && !isSupportedSemverRange(normalized))
  ) {
    return { value: REDACTED_DEPENDENCY_SPECIFIER, redacted: true };
  }
  return { value: normalized, redacted: false };
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function rangeBody(value: string): string {
  return value.startsWith('workspace:') ? value.slice('workspace:'.length) : value;
}

function comparatorParts(token: string): { operator: string; version: string } | undefined {
  const match = token.match(/^(<=|>=|<|>|=|\^|~)?(.+)$/);
  if (!match || !VERSION_TOKEN.test(match[2])) {
    return undefined;
  }
  return { operator: match[1] ?? '', version: match[2] };
}

function isSupportedSemverRange(value: string): boolean {
  const body = rangeBody(value);
  if (/^[*xX]$/.test(body) || (value.startsWith('workspace:') && /^[~^]$/.test(body))) {
    return true;
  }
  const clauses = body.split('||');
  return clauses.every((rawClause) => {
    const clause = rawClause.trim();
    if (!clause) {
      return false;
    }
    const hyphen = clause.match(/^(\S+)\s+-\s+(\S+)$/);
    if (hyphen) {
      return VERSION_TOKEN.test(hyphen[1]) && VERSION_TOKEN.test(hyphen[2]);
    }
    const normalizedComparators = clause.replace(/(<=|>=|<|>|=|\^|~)\s+/g, '$1');
    const tokens = normalizedComparators.split(/\s+/);
    return tokens.length > 0 && tokens.every((token) => comparatorParts(token) !== undefined);
  });
}

function versionMajor(version: string): {
  major: number;
  remainderNonZero: boolean;
  strictGreaterExcludesMajor: boolean;
} | null {
  const core = version.replace(/^v/, '').split(/[+-]/, 1)[0];
  const [majorText, minorText, patchText] = core.split('.');
  if (!/^\d+$/.test(majorText)) {
    return null;
  }
  const major = Number(majorText);
  if (!Number.isSafeInteger(major)) {
    return null;
  }
  const numericRemainder = [minorText, patchText]
    .filter((part): part is string => part !== undefined && /^\d+$/.test(part))
    .map(Number);
  return {
    major,
    remainderNonZero: numericRemainder.some((part) => part > 0),
    strictGreaterExcludesMajor:
      minorText === undefined || minorText === 'x' || minorText === 'X' || minorText === '*',
  };
}

function intersectInterval(current: MajorInterval, next: MajorInterval): MajorInterval {
  const finiteMax = [current.max, next.max].filter((value): value is number => value !== null);
  return {
    min: Math.max(current.min, next.min),
    max: finiteMax.length > 0 ? Math.min(...finiteMax) : null,
  };
}

function comparatorInterval(token: string): MajorInterval | undefined {
  if (/^[*xX]$/.test(token)) {
    return { min: 0, max: null };
  }
  const parts = comparatorParts(token);
  if (!parts) {
    return undefined;
  }
  const version = versionMajor(parts.version);
  if (!version) {
    return undefined;
  }
  switch (parts.operator) {
    case '<':
      return {
        min: 0,
        max: version.remainderNonZero ? version.major : version.major - 1,
      };
    case '<=':
      return { min: 0, max: version.major };
    case '>': {
      const min = version.major + (version.strictGreaterExcludesMajor ? 1 : 0);
      if (!Number.isSafeInteger(min)) {
        return undefined;
      }
      return {
        min,
        max: null,
      };
    }
    case '>=':
      return { min: version.major, max: null };
    case '':
    case '=':
    case '^':
    case '~':
      return { min: version.major, max: version.major };
    default:
      return undefined;
  }
}

function clauseInterval(clause: string): MajorInterval | undefined {
  const hyphen = clause.match(/^(\S+)\s+-\s+(\S+)$/);
  if (hyphen) {
    const lower = versionMajor(hyphen[1]);
    const upper = versionMajor(hyphen[2]);
    return lower && upper ? { min: lower.major, max: upper.major } : undefined;
  }
  const normalizedComparators = clause.replace(/(<=|>=|<|>|=|\^|~)\s+/g, '$1');
  let interval: MajorInterval = { min: 0, max: null };
  for (const token of normalizedComparators.split(/\s+/)) {
    const tokenInterval = comparatorInterval(token);
    if (!tokenInterval) {
      return undefined;
    }
    interval = intersectInterval(interval, tokenInterval);
  }
  return interval.max !== null && interval.min > interval.max ? undefined : interval;
}

function mergeIntervals(intervals: readonly MajorInterval[]): MajorInterval[] {
  const sorted = [...intervals].sort(
    (left, right) => left.min - right.min || (left.max ?? Infinity) - (right.max ?? Infinity)
  );
  const merged: MajorInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || (previous.max !== null && interval.min > previous.max + 1)) {
      merged.push({ ...interval });
      continue;
    }
    previous.max =
      previous.max === null || interval.max === null ? null : Math.max(previous.max, interval.max);
  }
  return merged;
}

function semverMajorSignature(version: string): string | undefined {
  if (sanitizeDependencySpecifier(version).redacted) {
    return undefined;
  }
  const body = rangeBody(version.trim());
  if (/^[~^]$/.test(body)) {
    return undefined;
  }
  const intervals = body.split('||').map((clause) => clauseInterval(clause.trim()));
  if (intervals.length === 0 || intervals.some((interval) => interval === undefined)) {
    return undefined;
  }
  return mergeIntervals(intervals as MajorInterval[])
    .map(({ min, max }) => `${min}:${max ?? '*'}`)
    .join('|');
}

function isMajorLookingChange(before: string, after: string): boolean {
  const beforeMajors = semverMajorSignature(before);
  const afterMajors = semverMajorSignature(after);
  return beforeMajors !== undefined && afterMajors !== undefined && beforeMajors !== afterMajors;
}

function changedFilesForPaths(
  files: readonly FileDiffEntry[],
  paths: ReadonlySet<string>
): FileDiffEntry[] {
  return files
    .filter((file) => paths.has(file.path) || (file.previousPath && paths.has(file.previousPath)))
    .sort((left, right) => compareStrings(left.path, right.path));
}

function fileEvidence(files: readonly FileDiffEntry[]): EvidenceRef[] {
  return files.map((file) => ({
    kind: 'file',
    label: `${file.path} ${file.status}`,
    path: file.path,
    before: file.previousPath,
  }));
}

function lockfileManager(path: string): string | undefined {
  const basename = path.split('/').at(-1);
  switch (basename) {
    case 'bun.lock':
    case 'bun.lockb':
      return 'bun';
    case 'npm-shrinkwrap.json':
    case 'package-lock.json':
      return 'npm';
    case 'pnpm-lock.yaml':
      return 'pnpm';
    case 'yarn.lock':
      return 'yarn';
    default:
      return undefined;
  }
}

function lockfileManagers(paths: readonly string[]): string[] {
  return [...new Set(paths.map(lockfileManager).filter((value): value is string => !!value))].sort(
    compareStrings
  );
}

function lockfileChangedFiles(files: readonly FileDiffEntry[]): FileDiffEntry[] {
  return files
    .filter(
      (file) =>
        lockfileManager(file.path) || (file.previousPath && lockfileManager(file.previousPath))
    )
    .sort((left, right) => compareStrings(left.path, right.path));
}

function categoryEvidence(
  declaration: DependencyDeclaration,
  category: DependencyCategory,
  path: string
): EvidenceRef {
  const version = sanitizeDependencySpecifier(declaration.version);
  return {
    kind: 'dependency',
    label: `${declaration.name} introduced as ${category}`,
    path,
    after: version.value,
    redacted: version.redacted ? true : undefined,
  };
}

export function detectDependencySignals(input: DependencyDetectorInput): DependencyDetectionResult {
  const signals: ReadinessSignal[] = [];
  const limitations: PartialDataNotice[] = [];

  for (const snapshot of [input.candidatePackageJson, input.basePackageJson]) {
    if (snapshot.status === 'unavailable') {
      limitations.push({ ...snapshot.limitation });
    }
  }

  const candidateDeclarations = manifestDeclarations(input.candidatePackageJson);
  const baseDeclarations = manifestDeclarations(input.basePackageJson);

  if (candidateDeclarations !== null && baseDeclarations !== null) {
    const candidateByKey = new Map(
      candidateDeclarations.map((value) => [dependencyKey(value), value])
    );
    const baseByKey = new Map(baseDeclarations.map((value) => [dependencyKey(value), value]));
    const added: DependencyChange[] = [];
    const removed: DependencyChange[] = [];
    const changed: DependencyChange[] = [];

    for (const declaration of candidateDeclarations) {
      const base = baseByKey.get(dependencyKey(declaration));
      if (!base) {
        added.push({ ...declaration, after: declaration.version });
      } else if (base.version !== declaration.version) {
        changed.push({
          ...declaration,
          before: base.version,
          after: declaration.version,
        });
      }
    }
    for (const declaration of baseDeclarations) {
      if (!candidateByKey.has(dependencyKey(declaration))) {
        removed.push({ ...declaration, before: declaration.version });
      }
    }

    if (added.length > 0) {
      signals.push(
        signal(
          'dependency:additions',
          'maintainability',
          'medium',
          'Dependencies added',
          `${added.length} package declaration${added.length === 1 ? ' was' : 's were'} added across package.json dependency sections.`,
          added.map((change) =>
            dependencyEvidence(change, 'added to', input.candidatePackageJson.path)
          ),
          'Review whether each new package is required and configured for production use.'
        )
      );
    }
    if (removed.length > 0) {
      signals.push(
        signal(
          'dependency:removals',
          'maintainability',
          'medium',
          'Dependencies removed',
          `${removed.length} package declaration${removed.length === 1 ? ' was' : 's were'} removed across package.json dependency sections.`,
          removed.map((change) =>
            dependencyEvidence(change, 'removed from', input.basePackageJson.path)
          ),
          'Review whether removed packages leave runtime, build, or migration assumptions behind.'
        )
      );
    }
    if (changed.length > 0) {
      const majorLooking = changed.filter((change) =>
        isMajorLookingChange(change.before ?? '', change.after ?? '')
      ).length;
      signals.push(
        signal(
          'dependency:version-changes',
          'maintainability',
          majorLooking > 0 ? 'high' : 'medium',
          'Dependency versions changed',
          `${changed.length} dependency version${changed.length === 1 ? '' : 's'} changed${
            majorLooking > 0
              ? `, including ${majorLooking} major-looking change${majorLooking === 1 ? '' : 's'}`
              : ''
          }.`,
          changed.map((change) =>
            dependencyEvidence(change, 'changed in', input.candidatePackageJson.path)
          ),
          'Review release notes, compatibility, migrations, and rollback expectations.'
        )
      );
    }

    const baseNames = new Set(baseDeclarations.map(({ name }) => name));
    const introducedByCategory = new Map<DependencyCategory, Map<string, DependencyDeclaration>>();
    for (const declaration of candidateDeclarations) {
      if (baseNames.has(declaration.name)) {
        continue;
      }
      for (const category of categorizeDependency(declaration.name)) {
        const values = introducedByCategory.get(category) ?? new Map();
        if (!values.has(declaration.name)) {
          values.set(declaration.name, declaration);
        }
        introducedByCategory.set(category, values);
      }
    }
    for (const [category, values] of introducedByCategory) {
      const policy = CATEGORY_POLICY[category];
      const declarations = [...values.values()].sort((left, right) =>
        compareStrings(left.name, right.name)
      );
      signals.push(
        signal(
          `dependency:category:${category}`,
          policy.category,
          policy.severity,
          `${policy.label} dependency introduced`,
          `${declarations.length} ${policy.label} package${declarations.length === 1 ? ' was' : 's were'} introduced. Review the related production assumptions before deployment.`,
          declarations.map((declaration) =>
            categoryEvidence(declaration, category, input.candidatePackageJson.path)
          ),
          policy.suggestedReview
        )
      );
    }
  }

  const manifestPaths = new Set([input.candidatePackageJson.path, input.basePackageJson.path]);
  const manifestFiles = changedFilesForPaths(input.diff.files, manifestPaths);
  const lockfileFiles = lockfileChangedFiles(input.diff.files);
  const manifestChanged = manifestFiles.length > 0;
  const lockfileChanged = lockfileFiles.length > 0;

  if (manifestChanged !== lockfileChanged) {
    if (!input.diff.complete) {
      limitations.push({
        source: 'detector',
        message:
          'Skipped manifest/lockfile mismatch inference because the file diff is incomplete.',
        confidenceImpact: 'medium',
      });
    } else if (manifestChanged) {
      signals.push(
        signal(
          'dependency:manifest-without-lockfile',
          'deployment_ops',
          'medium',
          'Package manifest changed without a lockfile change',
          'package.json changed, but no package manager lockfile change was detected.',
          fileEvidence(manifestFiles),
          'Confirm the authoritative package manager and refresh its lockfile if dependencies changed.'
        )
      );
    } else {
      signals.push(
        signal(
          'dependency:lockfile-without-manifest',
          'deployment_ops',
          'medium',
          'Lockfile changed without a package manifest change',
          'A package manager lockfile changed, but no package.json change was detected.',
          fileEvidence(lockfileFiles),
          'Confirm the lockfile was generated intentionally from the current package manifest.'
        )
      );
    }
  }

  const candidateManagers = lockfileManagers(input.candidateLockfiles);
  if (candidateManagers.length > 1) {
    const baseManagers = lockfileManagers(input.baseLockfiles);
    signals.push(
      signal(
        'dependency:multiple-lockfile-families',
        'deployment_ops',
        'medium',
        'Multiple package manager lockfiles detected',
        `The candidate contains lockfiles for ${candidateManagers.join(', ')}. This may be intentional, but the authoritative package manager should be clear.`,
        [
          {
            kind: 'metric',
            label: 'Candidate package manager lockfile families',
            before: baseManagers.join(', ') || 'none',
            after: candidateManagers.join(', '),
          },
        ],
        'Choose and document the authoritative package manager before deployment.'
      )
    );
  }

  if (
    input.candidatePackageJson.status === 'absent' &&
    input.basePackageJson.status === 'present' &&
    manifestChanged
  ) {
    signals.push(
      signal(
        'dependency:package-manifest-removed',
        'deployment_ops',
        'high',
        'Package manifest removed',
        'The candidate no longer contains the base package.json manifest.',
        fileEvidence(manifestFiles),
        'Confirm the application can still install, build, and run before deployment.'
      )
    );
  }

  return {
    signals: signals.sort((left, right) => compareStrings(left.id, right.id)),
    limitations: limitations.sort(compareLimitations),
  };
}
