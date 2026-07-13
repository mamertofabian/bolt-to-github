import { describe, expect, it } from 'vitest';
import {
  classifySensitivePaths,
  type SensitivePathClassification,
} from '../detectors/sensitivePathClassifier';
import { findPrsIgnoreRule, shouldAnalyzePath } from '../rules/ignore-rules';
import {
  getSensitivePathRules,
  type SensitivePathMatcher,
  type SensitivePathRule,
} from '../rules/path-rules';
import {
  createSensitivePathFixture,
  type SensitivePathFixture,
} from '../test-fixtures/prs/sensitive-paths';

describe('Production Readiness Snapshot sensitive path classifier', () => {
  it('auth data config deployment integration route and test paths classify correctly', () => {
    const fixture: SensitivePathFixture = createSensitivePathFixture('all-categories');
    const classifications: SensitivePathClassification[] = classifySensitivePaths(fixture.diff);
    const categoryPaths = classifications.map(({ category, path }) => `${category}:${path}`);

    expect(categoryPaths).toEqual(
      expect.arrayContaining([
        'identity_access:src/auth/session.ts',
        'data_persistence:prisma/schema.prisma',
        'secrets_config:vite.config.ts',
        'deployment_ops:.github/workflows/deploy.yml',
        'external_integrations:src/integrations/stripe/client.ts',
        'public_surface:src/routes/api/orders.ts',
        'testing_recovery:src/routes/api/orders.test.ts',
        'maintainability:src/legacy/checkout.backup.ts',
      ])
    );
    expect(new Set(getSensitivePathRules().map(({ category }) => category))).toEqual(
      new Set([
        'identity_access',
        'data_persistence',
        'secrets_config',
        'deployment_ops',
        'external_integrations',
        'public_surface',
        'testing_recovery',
        'maintainability',
      ])
    );
    expect(
      classifications.find(
        ({ category, path }) => category === 'public_surface' && path === 'src/routes/api/orders.ts'
      )
    ).toMatchObject({
      severityHint: 'high',
      matchedRule: { id: 'api-directory' },
    });
    expect(
      classifications.find(
        ({ category, path }) =>
          category === 'identity_access' && path === 'src/login/admin/page.tsx'
      )
    ).toMatchObject({
      severityHint: 'high',
      matchedRule: { id: 'admin-directory' },
    });

    const renamed = classifySensitivePaths(createSensitivePathFixture('renamed-sensitive').diff);
    expect(renamed).toEqual([
      expect.objectContaining({
        category: 'identity_access',
        path: 'src/auth/middleware.ts',
        currentPath: 'src/lib/guard.ts',
        previousPath: 'src/auth/middleware.ts',
        status: 'renamed',
      }),
    ]);

    for (const unknownName of ['missing', '__proto__', 'constructor']) {
      expect(() => createSensitivePathFixture(unknownName)).toThrowError(
        `Unknown sensitive path fixture: ${unknownName}`
      );
    }
  });

  it('ignore rules do not hide lockfiles or relevant config', () => {
    const classifications = classifySensitivePaths(
      createSensitivePathFixture('retained-metadata').diff
    );

    expect(
      findPrsIgnoreRule('project/pnpm-lock.yaml', [
        { pattern: 'pnpm-lock.yaml', reason: 'Broad caller ignore' },
      ])
    ).toBeUndefined();
    expect(shouldAnalyzePath('pnpm-lock.yaml')).toBe(true);
    expect(classifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'deployment_ops', path: 'pnpm-lock.yaml' }),
        expect.objectContaining({ category: 'secrets_config', path: 'vite.config.ts' }),
        expect.objectContaining({ category: 'secrets_config', path: '.env.example' }),
        expect.objectContaining({
          category: 'deployment_ops',
          path: '.github/workflows/ci.yml',
        }),
        expect.objectContaining({
          category: 'testing_recovery',
          path: '.github/workflows/ci.yml',
        }),
      ])
    );
  });

  it('classifier evidence includes category and path', () => {
    const customRules: SensitivePathRule[] = [
      {
        id: 'z-custom-auth-regex',
        category: 'identity_access',
        matcher: 'regex',
        pattern: '^src/auth/',
        severityHint: 'high',
        explanation: 'Custom auth paths affect access behavior.',
      },
      {
        id: 'a-custom-middleware-glob',
        category: 'identity_access',
        matcher: 'glob',
        pattern: '**/middleware.*',
        severityHint: 'high',
        explanation: 'Middleware can affect access behavior.',
      },
    ];
    const fixture = createSensitivePathFixture('renamed-sensitive');
    const inputSnapshot = JSON.stringify(customRules);
    const matcher: SensitivePathMatcher = customRules[0].matcher;
    const classifications = classifySensitivePaths(fixture.diff, customRules);

    expect(matcher).toBe('regex');
    expect(classifications).toEqual([
      {
        category: 'identity_access',
        path: 'src/auth/middleware.ts',
        currentPath: 'src/lib/guard.ts',
        previousPath: 'src/auth/middleware.ts',
        status: 'renamed',
        severityHint: 'high',
        matchedRule: customRules[1],
        evidence: {
          kind: 'file',
          label: 'Renamed path matched sensitive rule a-custom-middleware-glob.',
          path: 'src/auth/middleware.ts',
          before: 'src/auth/middleware.ts',
          after: 'src/lib/guard.ts',
        },
      },
    ]);
    expect(JSON.stringify(customRules)).toBe(inputSnapshot);

    const reversed = createSensitivePathFixture('all-categories').diff;
    reversed.files.reverse();
    expect(classifySensitivePaths(reversed)).toEqual(
      classifySensitivePaths(createSensitivePathFixture('all-categories').diff)
    );
    expect(classifications.filter(({ category }) => category === 'identity_access')).toHaveLength(
      1
    );
  });
});
