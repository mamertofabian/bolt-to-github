import { describe, expect, it } from 'vitest';
import {
  detectDependencySignals,
  type DependencyDetectionResult,
  type DependencyDetectorInput,
  type PackageDependencySection,
  type PackageManifest,
  type PackageManifestSnapshot,
} from '../dependencyDetector';
import {
  categorizeDependency,
  getDependencyCategoryRules,
  type DependencyCategory,
  type DependencyCategoryRule,
} from '../../rules/dependency-categories';
import {
  createDependencyDetectorFixture,
  type DependencyDetectorFixture,
} from '../../test-fixtures/prs/dependencies';

function signal(result: DependencyDetectionResult, id: string) {
  return result.signals.find((candidate) => candidate.id === id);
}

describe('Production Readiness Snapshot dependency detector', () => {
  it('detects dependency additions removals and version changes from package json diffs', () => {
    const fixture: DependencyDetectorFixture =
      createDependencyDetectorFixture('dependency-changes');
    const input: DependencyDetectorInput = fixture.input;
    const candidateSource: PackageManifestSnapshot = input.candidatePackageJson;
    expect(candidateSource.status).toBe('present');
    if (candidateSource.status !== 'present') {
      throw new Error('Expected a present candidate package manifest fixture.');
    }
    const candidateManifest: PackageManifest = candidateSource.manifest;
    const sections: PackageDependencySection[] = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ];
    const inputSnapshot = JSON.stringify(input);
    const result: DependencyDetectionResult = detectDependencySignals(input);

    expect(sections.every((section) => candidateManifest[section] !== undefined)).toBe(true);
    expect(candidateManifest.dependencies).toBeDefined();
    expect(candidateManifest.devDependencies).toBeDefined();
    expect(candidateManifest.peerDependencies).toBeDefined();
    expect(candidateManifest.optionalDependencies).toBeDefined();
    expect(input.baseLockfiles).toEqual(['pnpm-lock.yaml']);
    expect(signal(result, 'dependency:additions')?.evidence.map(({ label }) => label)).toEqual([
      'added-dev added to devDependencies',
      'added-optional added to optionalDependencies',
      'added-peer added to peerDependencies',
      'added-prod added to dependencies',
    ]);
    expect(signal(result, 'dependency:removals')?.evidence.map(({ label }) => label)).toEqual([
      'removed-dev removed from devDependencies',
      'removed-optional removed from optionalDependencies',
      'removed-peer removed from peerDependencies',
      'removed-prod removed from dependencies',
    ]);
    expect(signal(result, 'dependency:version-changes')).toMatchObject({
      severity: 'high',
      message: expect.stringContaining('5 major-looking'),
      evidence: [
        expect.objectContaining({
          label: 'changed-boundary changed in dependencies',
          before: '<2',
          after: '<=2',
        }),
        expect.objectContaining({
          label: 'changed-compound changed in dependencies',
          before: '^1 || ^2',
          after: '^1 || ^3',
        }),
        expect.objectContaining({
          label: 'changed-dev changed in devDependencies',
          before: '~1.0.0',
          after: '~1.1.0',
        }),
        expect.objectContaining({
          label: 'changed-lower-boundary changed in dependencies',
          before: '>2',
          after: '>=2',
        }),
        expect.objectContaining({
          label: 'changed-lower-equivalent changed in dependencies',
          before: '>2',
          after: '>=3',
        }),
        expect.objectContaining({
          label: 'changed-optional changed in optionalDependencies',
          before: 'workspace:^1.0.0',
          after: 'workspace:^1.2.0',
        }),
        expect.objectContaining({
          label: 'changed-peer changed in peerDependencies',
          before: '2.0.0',
          after: '3.0.0',
        }),
        expect.objectContaining({
          label: 'changed-prod changed in dependencies',
          before: '^1.2.0',
          after: '^2.0.0',
        }),
        expect.objectContaining({
          label: 'credential-package changed in dependencies',
          before: '[redacted dependency specifier]',
          after: '[redacted dependency specifier]',
          redacted: true,
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/old-dependency-token|new-dependency-token/);
    expect(result.limitations).toEqual([]);
    expect(JSON.stringify(input)).toBe(inputSnapshot);

    const detectRangeChange = (before: string, after: string): DependencyDetectionResult =>
      detectDependencySignals({
        ...input,
        basePackageJson: {
          status: 'present',
          path: 'package.json',
          manifest: { dependencies: { range: before } },
        },
        candidatePackageJson: {
          status: 'present',
          path: 'package.json',
          manifest: { dependencies: { range: after } },
        },
      });
    expect(signal(detectRangeChange('>2', '>=2'), 'dependency:version-changes')).toMatchObject({
      severity: 'high',
      message: expect.stringContaining('1 major-looking change'),
    });
    expect(signal(detectRangeChange('>2', '>=3'), 'dependency:version-changes')).toMatchObject({
      severity: 'medium',
      message: expect.not.stringContaining('major-looking'),
    });
    for (const [before, after] of [
      ['>9007199254740992', '>=1'],
      ['>9007199254740991', '>=1'],
      ['^1 || >9007199254740992', '^2 || >9007199254740992'],
    ]) {
      expect(signal(detectRangeChange(before, after), 'dependency:version-changes')).toMatchObject({
        severity: 'medium',
        message: expect.not.stringContaining('major-looking'),
      });
    }

    const reordered = createDependencyDetectorFixture('dependency-changes').input;
    if (
      reordered.candidatePackageJson.status === 'present' &&
      reordered.basePackageJson.status === 'present'
    ) {
      for (const section of sections) {
        reordered.candidatePackageJson.manifest[section] = Object.fromEntries(
          Object.entries(reordered.candidatePackageJson.manifest[section] ?? {}).reverse()
        );
        reordered.basePackageJson.manifest[section] = Object.fromEntries(
          Object.entries(reordered.basePackageJson.manifest[section] ?? {}).reverse()
        );
      }
    }
    reordered.diff.files.reverse();
    reordered.candidateLockfiles = [...reordered.candidateLockfiles].reverse();
    expect(detectDependencySignals(reordered)).toEqual(result);

    const unsafe = detectDependencySignals(
      createDependencyDetectorFixture('unsafe-specifiers').input
    );
    const unsafeEvidence = signal(unsafe, 'dependency:version-changes')?.evidence ?? [];
    for (const label of [
      'alias-specifier changed in dependencies',
      'bare-specifier changed in dependencies',
      'control-specifier changed in dependencies',
      'file-specifier changed in dependencies',
      'http-specifier changed in dependencies',
      'jwt-specifier changed in dependencies',
    ]) {
      expect(unsafeEvidence.find((evidence) => evidence.label === label)).toMatchObject({
        after: '[redacted dependency specifier]',
        redacted: true,
      });
    }
    expect(
      unsafeEvidence.find(({ label }) => label === 'normalized-specifier changed in dependencies')
    ).toMatchObject({
      before: '^1.0.0',
      after: '^1.1.0',
    });
    expect(
      unsafeEvidence.find(({ label }) => label === 'normalized-specifier changed in dependencies')
        ?.redacted
    ).toBeUndefined();
    expect(JSON.stringify(unsafe)).not.toMatch(
      /AKIAIOSFODNN7EXAMPLE|eyJhbGciOiJIUzI1NiJ9|token-value|file:\.\.\/private-package|npm:zod@\^4|\^1\.2\.3\\n/
    );
  });

  it('categorizes production sensitive dependency introductions', () => {
    const rules: DependencyCategoryRule[] = getDependencyCategoryRules();
    const supabaseCategories: DependencyCategory[] = categorizeDependency('@supabase/supabase-js');

    expect(rules).not.toBe(getDependencyCategoryRules());
    expect(rules.every(({ packages }) => packages.length > 0)).toBe(true);
    expect(supabaseCategories).toEqual(['auth', 'platform_storage']);
    expect(categorizeDependency('@paypal/react-paypal-js')).toEqual(['payments']);
    expect(categorizeDependency('@ai-sdk/openai')).toEqual(['ai_api']);
    expect(categorizeDependency('unclassified-package')).toEqual([]);

    const result = detectDependencySignals(
      createDependencyDetectorFixture('categorized-introductions').input
    );
    expect(
      result.signals.filter(({ id }) => id.startsWith('dependency:category:')).map(({ id }) => id)
    ).toEqual([
      'dependency:category:ai_api',
      'dependency:category:auth',
      'dependency:category:database',
      'dependency:category:email_sms',
      'dependency:category:monitoring',
      'dependency:category:payments',
      'dependency:category:platform_storage',
      'dependency:category:validation',
    ]);
    expect(signal(result, 'dependency:category:auth')).toMatchObject({
      category: 'identity_access',
      severity: 'high',
      evidence: [
        expect.objectContaining({ label: '@clerk/nextjs introduced as auth' }),
        expect.objectContaining({ label: '@supabase/supabase-js introduced as auth' }),
      ],
    });
    expect(signal(result, 'dependency:category:platform_storage')).toMatchObject({
      category: 'data_persistence',
      severity: 'high',
      evidence: [
        expect.objectContaining({
          label: '@supabase/supabase-js introduced as platform_storage',
        }),
      ],
    });
    expect(
      signal(result, 'dependency:category:payments')?.evidence.find(
        ({ label }) => label === 'stripe introduced as payments'
      )
    ).toMatchObject({
      after: '[redacted dependency specifier]',
      redacted: true,
    });
    expect(JSON.stringify(result)).not.toContain('category-dependency-token');
    expect(JSON.stringify(result)).not.toMatch(/vulnerab|insecure|broken install/i);
  });

  it('reports manifest and lockfile mismatch signals', () => {
    const manifestOnly = detectDependencySignals(
      createDependencyDetectorFixture('manifest-only').input
    );
    expect(signal(manifestOnly, 'dependency:manifest-without-lockfile')).toMatchObject({
      category: 'deployment_ops',
      severity: 'medium',
      evidence: [expect.objectContaining({ kind: 'file', path: 'package.json' })],
    });
    expect(signal(manifestOnly, 'dependency:lockfile-without-manifest')).toBeUndefined();

    const lockfileOnly = detectDependencySignals(
      createDependencyDetectorFixture('lockfile-only').input
    );
    expect(signal(lockfileOnly, 'dependency:lockfile-without-manifest')).toMatchObject({
      category: 'deployment_ops',
      severity: 'medium',
      evidence: [expect.objectContaining({ kind: 'file', path: 'pnpm-lock.yaml' })],
    });
    expect(signal(lockfileOnly, 'dependency:manifest-without-lockfile')).toBeUndefined();

    const conflict = detectDependencySignals(
      createDependencyDetectorFixture('multiple-lockfiles').input
    );
    expect(signal(conflict, 'dependency:multiple-lockfile-families')).toMatchObject({
      category: 'deployment_ops',
      severity: 'medium',
      evidence: [
        expect.objectContaining({
          kind: 'metric',
          label: 'Candidate package manager lockfile families',
          before: 'pnpm',
          after: 'npm, pnpm, yarn',
        }),
      ],
    });

    const removed = detectDependencySignals(
      createDependencyDetectorFixture('manifest-removed').input
    );
    expect(signal(removed, 'dependency:package-manifest-removed')).toMatchObject({
      category: 'deployment_ops',
      severity: 'high',
      evidence: [expect.objectContaining({ kind: 'file', path: 'package.json' })],
    });

    const unavailable = detectDependencySignals(
      createDependencyDetectorFixture('base-unavailable').input
    );
    expect(unavailable.signals.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining(['dependency:additions', 'dependency:category:payments'])
    );
    expect(unavailable.limitations).toEqual([
      {
        source: 'rate_limit',
        message: 'Base package.json was unavailable due to GitHub rate limiting.',
        confidenceImpact: 'medium',
      },
    ]);

    for (const unknownName of ['missing', '__proto__', 'constructor']) {
      expect(() => createDependencyDetectorFixture(unknownName)).toThrowError(
        `Unknown dependency detector fixture: ${unknownName}`
      );
    }
  });
});
