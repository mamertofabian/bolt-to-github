import { describe, expect, it } from 'vitest';

import {
  classifySensitivePaths,
  type SensitivePathClassification,
} from '../detectors/sensitivePathClassifier';
import type { ReadinessCategory } from '../domain';
import { getSensitivePathRules, type SensitivePathRule } from '../rules/path-rules';
import {
  createSensitivePathFixture,
  type SensitivePathFixture,
  type SensitivePathFixtureName,
} from '../test-fixtures/prs/sensitive-paths';

function categoriesByPath(
  classifications: SensitivePathClassification[]
): Record<string, ReadinessCategory[]> {
  const result: Record<string, ReadinessCategory[]> = {};
  for (const classification of classifications) {
    (result[classification.path] ??= []).push(classification.category);
  }
  for (const categories of Object.values(result)) {
    categories.sort();
  }
  return result;
}

function fixture(name: SensitivePathFixtureName): SensitivePathFixture {
  return createSensitivePathFixture(name);
}

describe('Production Readiness Snapshot sensitive path classifier', () => {
  it('auth data config deployment integration route and test paths classify correctly', () => {
    const input = fixture('category-matrix');
    const rules = getSensitivePathRules();

    const result = classifySensitivePaths(input.diff, rules);

    expect(categoriesByPath(result)).toEqual(input.expected);
    expect(new Set(rules.map((rule) => rule.category))).toEqual(
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
    expect(result.some((classification) => classification.path === 'src/auth/unconfirmed.ts')).toBe(
      false
    );
    expect(
      result.some((classification) => classification.path === 'src/components/Button.svelte')
    ).toBe(false);
    for (const path of ['src/pages/_app.tsx', 'src/pages/_document.tsx', 'src/pages/_error.tsx']) {
      expect(result.some((classification) => classification.path === path)).toBe(false);
    }
    expect(
      result.find((classification) => classification.path === '.env.production')?.rule.severity
    ).toBe('critical');
  });

  it('ignore rules do not hide lockfiles or relevant config', () => {
    const input = fixture('retained-metadata');

    const result = classifySensitivePaths(input.diff);

    expect(categoriesByPath(result)).toEqual(input.expected);
    expect(
      result.find((classification) => classification.path === '.env.example')?.rule.severity
    ).toBe('medium');
  });

  it('classifier evidence includes category and path', () => {
    const customRule: SensitivePathRule = {
      id: 'custom-risk-flag',
      category: 'maintainability',
      pattern: '^custom/risk[.]flag$',
      patternKind: 'regex',
      severity: 'medium',
      explanation: 'A project-specific risk marker changed.',
    };
    const input = fixture('category-matrix');
    const customDiff = {
      ...input.diff,
      entries: [{ ...input.diff.entries[0], path: 'custom/risk.flag' }],
    };

    expect(classifySensitivePaths(customDiff, [customRule])).toEqual([
      {
        category: 'maintainability',
        path: 'custom/risk.flag',
        status: 'changed',
        rule: customRule,
        evidence: {
          kind: 'file',
          label: 'A project-specific risk marker changed.',
          path: 'custom/risk.flag',
        },
      },
    ]);
  });
});
