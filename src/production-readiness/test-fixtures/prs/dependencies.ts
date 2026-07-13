import type {
  DependencyDetectorInput,
  PackageManifest,
  PackageManifestSnapshot,
} from '../../detectors/dependencyDetector';
import type { FileDiffEntry, FileDiffStatus, InventoryDiffResult } from '../../diff/diffEngine';

export interface DependencyDetectorFixture {
  input: DependencyDetectorInput;
}

function manifest(value: PackageManifest, path = 'package.json'): PackageManifestSnapshot {
  return { status: 'present', path, manifest: value };
}

function diffFile(path: string, status: FileDiffStatus): FileDiffEntry {
  return {
    path,
    status,
    beforeGitBlobSha: status === 'added' ? undefined : `before:${path}`,
    afterGitBlobSha: status === 'deleted' ? undefined : `after:${path}`,
    sizeBeforeBytes: status === 'added' ? undefined : 1,
    sizeAfterBytes: status === 'deleted' ? undefined : 1,
    isBinary: false,
    lineDiffSkipped: false,
    addedLines: status === 'deleted' ? 0 : 1,
    deletedLines: status === 'added' ? 0 : 1,
  };
}

function diff(files: FileDiffEntry[], complete = true): InventoryDiffResult {
  return {
    files,
    summary: {
      changedFiles: files.filter(({ status }) => status === 'changed').length,
      addedFiles: files.filter(({ status }) => status === 'added').length,
      deletedFiles: files.filter(({ status }) => status === 'deleted').length,
      renamedFiles: files.filter(({ status }) => status === 'renamed').length,
      addedLines: complete
        ? files.reduce((total, file) => total + (file.addedLines ?? 0), 0)
        : undefined,
      deletedLines: complete
        ? files.reduce((total, file) => total + (file.deletedLines ?? 0), 0)
        : undefined,
      binaryFilesChanged: 0,
    },
    limitations: [],
    complete,
  };
}

const BASE_DEPENDENCY_CHANGES: PackageManifest = {
  dependencies: {
    'changed-boundary': '<2',
    'changed-compound': '^1 || ^2',
    'changed-lower-boundary': '>2',
    'changed-lower-equivalent': '>2',
    'changed-prod': '^1.2.0',
    'credential-package': 'git+https://old-dependency-token@github.com/example/private.git',
    'removed-prod': '1.0.0',
  },
  devDependencies: {
    'changed-dev': '~1.0.0',
    'removed-dev': '1.0.0',
  },
  peerDependencies: {
    'changed-peer': '2.0.0',
    'removed-peer': '1.0.0',
  },
  optionalDependencies: {
    'changed-optional': 'workspace:^1.0.0',
    'removed-optional': '1.0.0',
  },
};

const CANDIDATE_DEPENDENCY_CHANGES: PackageManifest = {
  dependencies: {
    'added-prod': '1.0.0',
    'changed-boundary': '<=2',
    'changed-compound': '^1 || ^3',
    'changed-lower-boundary': '>=2',
    'changed-lower-equivalent': '>=3',
    'changed-prod': '^2.0.0',
    'credential-package': 'git+https://new-dependency-token@github.com/example/private.git',
  },
  devDependencies: {
    'added-dev': '1.0.0',
    'changed-dev': '~1.1.0',
  },
  peerDependencies: {
    'added-peer': '1.0.0',
    'changed-peer': '3.0.0',
  },
  optionalDependencies: {
    'added-optional': '1.0.0',
    'changed-optional': 'workspace:^1.2.0',
  },
};

function baseInput(
  candidatePackageJson: PackageManifestSnapshot,
  basePackageJson: PackageManifestSnapshot,
  files: FileDiffEntry[],
  candidateLockfiles: readonly string[] = ['pnpm-lock.yaml'],
  baseLockfiles: readonly string[] = ['pnpm-lock.yaml'],
  complete = true
): DependencyDetectorInput {
  return {
    candidatePackageJson,
    basePackageJson,
    candidateLockfiles: [...candidateLockfiles],
    baseLockfiles: [...baseLockfiles],
    diff: diff(files, complete),
  };
}

export function createDependencyDetectorFixture(name: string): DependencyDetectorFixture {
  switch (name) {
    case 'dependency-changes':
      return {
        input: baseInput(
          manifest(structuredClone(CANDIDATE_DEPENDENCY_CHANGES)),
          manifest(structuredClone(BASE_DEPENDENCY_CHANGES)),
          [diffFile('package.json', 'changed'), diffFile('pnpm-lock.yaml', 'changed')]
        ),
      };
    case 'categorized-introductions':
      return {
        input: baseInput(
          manifest({
            dependencies: {
              '@clerk/nextjs': '^6.0.0',
              '@sentry/browser': '^9.0.0',
              '@supabase/supabase-js': '^2.0.0',
              openai: '^5.0.0',
              prisma: '^6.0.0',
              resend: '^6.0.0',
              stripe: 'git+https://category-dependency-token@github.com/example/private-stripe.git',
              zod: '^4.0.0',
            },
          }),
          manifest({ dependencies: {} }),
          [diffFile('package.json', 'changed'), diffFile('pnpm-lock.yaml', 'changed')]
        ),
      };
    case 'unsafe-specifiers':
      return {
        input: baseInput(
          manifest({
            dependencies: {
              'alias-specifier': 'npm:zod@^4',
              'bare-specifier': 'AKIAIOSFODNN7EXAMPLE',
              'control-specifier': '^1.2.3\n',
              'file-specifier': 'file:../private-package',
              'http-specifier': 'https://token-value@example.com/private.tgz',
              'jwt-specifier': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue',
              'normalized-specifier': '  ^1.1.0  ',
            },
          }),
          manifest({
            dependencies: {
              'alias-specifier': '1.0.0',
              'bare-specifier': '1.0.0',
              'control-specifier': '1.0.0',
              'file-specifier': '1.0.0',
              'http-specifier': '1.0.0',
              'jwt-specifier': '1.0.0',
              'normalized-specifier': '^1.0.0',
            },
          }),
          [diffFile('package.json', 'changed'), diffFile('pnpm-lock.yaml', 'changed')]
        ),
      };
    case 'manifest-only':
      return {
        input: baseInput(
          manifest({ dependencies: { zod: '^4.0.0' } }),
          manifest({ dependencies: { zod: '^3.0.0' } }),
          [diffFile('package.json', 'changed')]
        ),
      };
    case 'lockfile-only':
      return {
        input: baseInput(
          manifest({ dependencies: { zod: '^4.0.0' } }),
          manifest({ dependencies: { zod: '^4.0.0' } }),
          [diffFile('pnpm-lock.yaml', 'changed')]
        ),
      };
    case 'multiple-lockfiles':
      return {
        input: baseInput(
          manifest({ dependencies: {} }),
          manifest({ dependencies: {} }),
          [diffFile('package-lock.json', 'added')],
          ['packages/app/yarn.lock', 'pnpm-lock.yaml', 'package-lock.json'],
          ['pnpm-lock.yaml']
        ),
      };
    case 'manifest-removed':
      return {
        input: baseInput(
          { status: 'absent', path: 'package.json' },
          manifest({ dependencies: { stripe: '^18.0.0' } }),
          [diffFile('package.json', 'deleted'), diffFile('pnpm-lock.yaml', 'deleted')],
          [],
          ['pnpm-lock.yaml']
        ),
      };
    case 'base-unavailable':
      return {
        input: baseInput(
          manifest({ dependencies: { stripe: '^18.0.0' } }),
          {
            status: 'unavailable',
            path: 'package.json',
            limitation: {
              source: 'rate_limit',
              message: 'Base package.json was unavailable due to GitHub rate limiting.',
              confidenceImpact: 'medium',
            },
          },
          [],
          ['pnpm-lock.yaml'],
          [],
          false
        ),
      };
    default:
      throw new Error(`Unknown dependency detector fixture: ${name}`);
  }
}
