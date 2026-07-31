import type { EvidenceRef, ReadinessCategory } from '../domain';
import type { InventoryDiffResult } from '../diff/diffEngine';
import { getSensitivePathRules, type SensitivePathRule } from '../rules/path-rules';

export interface SensitivePathClassification {
  category: ReadinessCategory;
  path: string;
  status: 'added' | 'changed' | 'deleted' | 'renamed';
  rule: SensitivePathRule;
  evidence: EvidenceRef;
}

const SEVERITY_RANK = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
} as const;

function compareCodePoints(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function globToRegExp(pattern: string): RegExp {
  let expression = '^';

  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];

    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
      continue;
    }

    if (character === '*') {
      expression += '[^/]*';
      continue;
    }

    if ('\\^$+?.()|{}[]'.includes(character)) {
      expression += `\\${character}`;
    } else {
      expression += character;
    }
  }

  return new RegExp(`${expression}$`, 'u');
}

function compileRule(rule: SensitivePathRule): RegExp {
  try {
    return rule.patternKind === 'glob' ? globToRegExp(rule.pattern) : new RegExp(rule.pattern, 'u');
  } catch (error) {
    throw new TypeError(
      `Sensitive path rule "${rule.id}" has an invalid ${rule.patternKind} pattern.`,
      { cause: error }
    );
  }
}

export function classifySensitivePaths(
  diff: InventoryDiffResult,
  rules: SensitivePathRule[] | undefined = undefined
): SensitivePathClassification[] {
  const selectedRules = rules ?? getSensitivePathRules();
  const seenRuleIds = new Set<string>();
  const compiledRules = selectedRules.map((rule) => {
    if (!rule.id || seenRuleIds.has(rule.id)) {
      throw new TypeError(`Sensitive path rule id must be non-empty and unique: "${rule.id}".`);
    }
    seenRuleIds.add(rule.id);
    return { expression: compileRule(rule), rule };
  });
  const classificationsByPathCategory = new Map<string, SensitivePathClassification>();

  for (const entry of diff.entries) {
    if (entry.status === 'indeterminate') {
      continue;
    }

    const paths =
      entry.status === 'renamed' && entry.previousPath && entry.previousPath !== entry.path
        ? [entry.previousPath, entry.path]
        : [entry.path];
    for (const path of paths) {
      for (const { expression, rule } of compiledRules) {
        if (!expression.test(path)) {
          continue;
        }
        const classification: SensitivePathClassification = {
          category: rule.category,
          path,
          status: entry.status,
          rule,
          evidence: {
            kind: 'file',
            label: rule.explanation,
            path,
          },
        };
        const key = `${path}\0${rule.category}`;
        const current = classificationsByPathCategory.get(key);
        if (
          !current ||
          SEVERITY_RANK[rule.severity] > SEVERITY_RANK[current.rule.severity] ||
          (rule.severity === current.rule.severity &&
            compareCodePoints(rule.id, current.rule.id) < 0)
        ) {
          classificationsByPathCategory.set(key, classification);
        }
      }
    }
  }

  return [...classificationsByPathCategory.values()].sort(
    (left, right) =>
      compareCodePoints(left.path, right.path) ||
      compareCodePoints(left.category, right.category) ||
      compareCodePoints(left.rule.id, right.rule.id)
  );
}
