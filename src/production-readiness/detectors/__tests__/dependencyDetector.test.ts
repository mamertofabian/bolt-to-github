import { describe, expect, it } from 'vitest';

import {
  detectDependencySignals,
  type DependencyDetectorInput,
  type PackageManifest,
} from '../dependencyDetector';
import { categorizeDependency, type DependencyCategory } from '../../rules/dependency-categories';

function input(overrides: Partial<DependencyDetectorInput> = {}): DependencyDetectorInput {
  return {
    candidatePackageJson: null,
    basePackageJson: null,
    candidatePackageJsonAvailable: true,
    basePackageJsonAvailable: true,
    candidateLockfiles: [],
    baseLockfiles: [],
    packageManifestChanged: false,
    lockfileChanged: false,
    ...overrides,
  };
}

function manifest(value: PackageManifest): PackageManifest {
  return value;
}

describe('Production Readiness Snapshot dependency detector', () => {
  it('detects dependency additions removals and version changes from package json diffs', () => {
    const basePackageJson = manifest({
      dependencies: {
        lodash: '^4.17.21',
        'old-only': '1.0.0',
        react: '^18.3.0',
      },
      devDependencies: {
        moved: '1.0.0',
        vitest: '^1.5.0',
      },
      peerDependencies: {
        'peer-only': '^2.0.0',
      },
      optionalDependencies: {
        'optional-same': '1.0.0',
      },
    });
    const candidatePackageJson = manifest({
      dependencies: {
        added: '2.0.0',
        lodash: '^4.17.21',
        moved: '1.0.0',
        react: '^19.0.0',
      },
      devDependencies: {
        vitest: '^2.0.0',
      },
      optionalDependencies: {
        'optional-added': '3.0.0',
        'optional-same': '1.0.0',
      },
    });

    const result = detectDependencySignals(
      input({
        candidatePackageJson,
        basePackageJson,
        candidateLockfiles: ['pnpm-lock.yaml'],
        baseLockfiles: ['pnpm-lock.yaml'],
        packageManifestChanged: true,
        lockfileChanged: true,
      })
    );

    expect(result.map((signal) => signal.id)).toEqual([
      'dependency-added',
      'dependency-removed',
      'dependency-section-moved',
      'dependency-version-changed',
    ]);
    expect(result[0].evidence).toEqual([
      {
        kind: 'dependency',
        label: 'added (dependencies)',
        after: '2.0.0',
      },
      {
        kind: 'dependency',
        label: 'optional-added (optionalDependencies)',
        after: '3.0.0',
      },
    ]);
    expect(result[1].evidence.map((evidence) => evidence.label)).toEqual([
      'old-only (dependencies)',
      'peer-only (peerDependencies)',
    ]);
    expect(result[2].evidence).toEqual([
      {
        kind: 'dependency',
        label: 'moved (devDependencies → dependencies)',
        before: '1.0.0',
        after: '1.0.0',
      },
    ]);
    expect(result[3].evidence).toEqual([
      {
        kind: 'dependency',
        label: 'react (dependencies)',
        before: '^18.3.0',
        after: '^19.0.0',
      },
      {
        kind: 'dependency',
        label: 'vitest (devDependencies)',
        before: '^1.5.0',
        after: '^2.0.0',
      },
    ]);
  });

  it('categorizes production sensitive dependency introductions', () => {
    const categories: Record<string, DependencyCategory> = {
      'next-auth': 'auth',
      prisma: 'database',
      stripe: 'payments',
      resend: 'email_sms',
      openai: 'ai_api',
      zod: 'validation',
      '@sentry/browser': 'monitoring',
      '@supabase/storage-js': 'platform_storage',
    };
    for (const [packageName, category] of Object.entries(categories)) {
      expect(categorizeDependency(packageName)).toBe(category);
    }
    expect(categorizeDependency('@supabase/supabase-js')).toBe('auth');
    expect(categorizeDependency('firebase')).toBe('auth');
    expect(categorizeDependency('ordinary-package')).toBeNull();

    const result = detectDependencySignals(
      input({
        candidatePackageJson: {
          dependencies: Object.fromEntries(
            Object.keys(categories).map((packageName) => [packageName, '1.0.0'])
          ),
        },
        basePackageJson: {},
        candidateLockfiles: ['pnpm-lock.yaml'],
        packageManifestChanged: true,
        lockfileChanged: true,
      })
    );
    const categorySignals = result.filter((signal) =>
      signal.id.startsWith('dependency-category-introduced-')
    );

    expect(categorySignals.map((signal) => signal.id)).toEqual(
      Object.values(categories)
        .sort()
        .map((category) => `dependency-category-introduced-${category}`)
    );
    expect(categorySignals.every((signal) => signal.deterministic)).toBe(true);
    expect(
      categorySignals
        .flatMap((signal) => signal.evidence)
        .map((evidence) => evidence.label)
        .sort()
    ).toEqual(Object.keys(categories).sort());
    expect(categorySignals.every((signal) => !signal.message.includes('vulnerab'))).toBe(true);

    const promoted = detectDependencySignals(
      input({
        candidatePackageJson: { dependencies: { stripe: '2.0.0' } },
        basePackageJson: { devDependencies: { stripe: '1.0.0' } },
        packageManifestChanged: true,
        lockfileChanged: true,
      })
    );
    expect(promoted.map((signal) => signal.id)).toEqual([
      'dependency-category-promoted-payments',
      'dependency-section-moved',
      'dependency-version-changed',
    ]);
    expect(promoted.every((signal) => !signal.message.includes('removed'))).toBe(true);
    expect(promoted.find((signal) => signal.id === 'dependency-version-changed')?.evidence).toEqual(
      [
        {
          kind: 'dependency',
          label: 'stripe (dependencies)',
          before: '1.0.0',
          after: '2.0.0',
        },
      ]
    );
  });

  it('reports manifest and lockfile mismatch signals', () => {
    const manifestWithoutLock = detectDependencySignals(
      input({
        candidatePackageJson: { dependencies: { react: '^19.0.0' } },
        basePackageJson: { dependencies: { react: '^18.0.0' } },
        candidateLockfiles: ['pnpm-lock.yaml'],
        baseLockfiles: ['pnpm-lock.yaml'],
        packageManifestChanged: true,
        lockfileChanged: false,
      })
    );
    expect(manifestWithoutLock.map((signal) => signal.id)).toContain(
      'dependency-manifest-changed-without-lockfile'
    );

    const lockWithoutManifest = detectDependencySignals(
      input({
        candidatePackageJson: null,
        basePackageJson: null,
        candidateLockfiles: ['pnpm-lock.yaml'],
        baseLockfiles: ['pnpm-lock.yaml'],
        packageManifestChanged: false,
        lockfileChanged: true,
      })
    );
    expect(lockWithoutManifest.map((signal) => signal.id)).toEqual([
      'dependency-lockfile-changed-without-manifest',
    ]);

    const pathlessLockChange = detectDependencySignals(
      input({
        packageManifestChanged: false,
        lockfileChanged: true,
      })
    );
    expect(pathlessLockChange[0].evidence).toEqual([
      {
        kind: 'metric',
        label: 'Lockfile content change reported',
        after: true,
      },
    ]);

    const baseUnavailable = detectDependencySignals(
      input({
        candidatePackageJson: { dependencies: { stripe: '1.0.0' } },
        basePackageJson: null,
        basePackageJsonAvailable: false,
      })
    );
    expect(baseUnavailable.map((signal) => signal.id)).toEqual([
      'dependency-comparison-unavailable',
    ]);
    expect(baseUnavailable[0].evidence).toContainEqual({
      kind: 'metric',
      label: 'Base package manifest available',
      after: false,
    });

    const candidateUnavailable = detectDependencySignals(
      input({
        candidatePackageJson: null,
        basePackageJson: { dependencies: { stripe: '1.0.0' } },
        candidatePackageJsonAvailable: false,
      })
    );
    expect(candidateUnavailable.map((signal) => signal.id)).toEqual([
      'dependency-comparison-unavailable',
    ]);

    const conflictingManagers = detectDependencySignals(
      input({
        candidatePackageJson: {},
        basePackageJson: {},
        candidateLockfiles: ['packages/web/pnpm-lock.yaml', 'pnpm-lock.yaml', 'yarn.lock'],
      })
    );
    expect(conflictingManagers).toHaveLength(1);
    expect(conflictingManagers[0]).toMatchObject({
      id: 'dependency-package-manager-conflict',
      category: 'deployment_ops',
      severity: 'high',
    });
    expect(conflictingManagers[0].evidence.map((evidence) => evidence.path)).toEqual([
      'packages/web/pnpm-lock.yaml',
      'pnpm-lock.yaml',
      'yarn.lock',
    ]);

    const oneManager = detectDependencySignals(
      input({
        candidatePackageJson: {},
        candidateLockfiles: ['packages/web/pnpm-lock.yaml', 'pnpm-lock.yaml'],
      })
    );
    expect(oneManager).toEqual([]);
  });
});
