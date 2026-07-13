import type { EvidenceRef, ReadinessCategory, SignalSeverity } from '../domain';
import type { FileDiffEntry, FileDiffStatus, InventoryDiffResult } from '../diff/diffEngine';
import { getSensitivePathRules, type SensitivePathRule } from '../rules/path-rules';

export interface SensitivePathClassification {
  category: ReadinessCategory;
  path: string;
  currentPath: string;
  previousPath?: string;
  status: FileDiffStatus;
  severityHint: SignalSeverity;
  matchedRule: SensitivePathRule;
  evidence: EvidenceRef;
}

type CompiledRule = {
  rule: SensitivePathRule;
  pattern: RegExp;
};

const SEVERITY_ORDER: Record<SignalSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapeRegexCharacter(character: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}

function compileGlob(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized) {
    throw new TypeError('Sensitive path glob must not be empty.');
  }

  let source = '^';
  let index = 0;
  while (index < normalized.length) {
    const character = normalized[index];
    if (character === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 3;
      } else {
        source += '.*';
        index += 2;
      }
      continue;
    }
    if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += escapeRegexCharacter(character);
    }
    index += 1;
  }
  return new RegExp(`${source}$`);
}

function compileRule(rule: SensitivePathRule): CompiledRule {
  if (!rule.id.trim()) {
    throw new TypeError('Sensitive path rule id must not be empty.');
  }
  if (!rule.pattern) {
    throw new TypeError(`Sensitive path rule ${rule.id} must define a pattern.`);
  }
  if (rule.matcher !== 'glob' && rule.matcher !== 'regex') {
    throw new TypeError(`Sensitive path rule ${rule.id} has an unsupported matcher.`);
  }
  try {
    return {
      rule: { ...rule },
      pattern: rule.matcher === 'glob' ? compileGlob(rule.pattern) : new RegExp(rule.pattern),
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('Sensitive path')) {
      throw error;
    }
    throw new TypeError(`Invalid ${rule.matcher} pattern for sensitive path rule ${rule.id}.`, {
      cause: error,
    });
  }
}

function evidenceFor(
  file: FileDiffEntry,
  matchedPath: string,
  rule: SensitivePathRule
): EvidenceRef {
  const renamed = file.status === 'renamed' && file.previousPath !== undefined;
  const labelPrefix = renamed
    ? 'Renamed'
    : `${file.status.charAt(0).toUpperCase()}${file.status.slice(1)}`;
  return {
    kind: 'file',
    label: `${labelPrefix} path matched sensitive rule ${rule.id}.`,
    path: matchedPath,
    before: renamed ? file.previousPath : undefined,
    after: renamed ? file.path : undefined,
  };
}

function classificationsForPath(
  file: FileDiffEntry,
  path: string,
  rules: readonly CompiledRule[]
): SensitivePathClassification[] {
  const bestByCategory = new Map<ReadinessCategory, CompiledRule>();
  for (const compiledRule of rules) {
    const { rule, pattern } = compiledRule;
    if (!pattern.test(path)) {
      continue;
    }
    const current = bestByCategory.get(rule.category);
    if (
      current &&
      (SEVERITY_ORDER[current.rule.severityHint] > SEVERITY_ORDER[rule.severityHint] ||
        (current.rule.severityHint === rule.severityHint && current.rule.id <= rule.id))
    ) {
      continue;
    }
    bestByCategory.set(rule.category, compiledRule);
  }

  return [...bestByCategory.values()].map(({ rule }) => ({
    category: rule.category,
    path,
    currentPath: file.path,
    previousPath: file.previousPath,
    status: file.status,
    severityHint: rule.severityHint,
    matchedRule: { ...rule },
    evidence: evidenceFor(file, path, rule),
  }));
}

export function classifySensitivePaths(
  diff: InventoryDiffResult,
  rules: readonly SensitivePathRule[] | undefined = undefined
): SensitivePathClassification[] {
  const compiledRules = (rules ?? getSensitivePathRules()).map(compileRule);
  const ruleIds = new Set<string>();
  for (const { rule } of compiledRules) {
    if (ruleIds.has(rule.id)) {
      throw new TypeError(`Sensitive path rule id must be unique: ${rule.id}`);
    }
    ruleIds.add(rule.id);
  }
  const classifications = diff.files.flatMap((file) => {
    const current = classificationsForPath(file, file.path, compiledRules);
    if (file.status !== 'renamed' || !file.previousPath || file.previousPath === file.path) {
      return current;
    }
    return [...current, ...classificationsForPath(file, file.previousPath, compiledRules)];
  });

  return classifications.sort(
    (left, right) =>
      compareStrings(left.path, right.path) ||
      compareStrings(left.category, right.category) ||
      compareStrings(left.matchedRule.id, right.matchedRule.id) ||
      compareStrings(left.currentPath, right.currentPath)
  );
}
