import type { PrsHistorySample, PrsHotspotFile } from './historyBaselineEngine';

function compareCodePoints(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function validatedNumber(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a finite non-negative number.`);
  }
  return value;
}

function normalizedPath(path: string): string | undefined {
  const normalized = path.replaceAll('\\', '/').replace(/^(?:[.]\/)+|^\/+|\/+$/gu, '');
  if (
    !normalized ||
    normalized.includes('\0') ||
    normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return undefined;
  }
  return normalized;
}

export function calculateMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values
    .map((value, index) => validatedNumber(`values[${index}]`, value))
    .sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function calculatePercentileRank(value: number, samples: number[]): number | null {
  validatedNumber('value', value);
  if (samples.length === 0) return null;
  const validated = samples.map((sample, index) => validatedNumber(`samples[${index}]`, sample));
  const atOrBelow = validated.filter((sample) => sample <= value).length;
  return (atOrBelow / validated.length) * 100;
}

export function detectHistoryHotspots(samples: PrsHistorySample[]): PrsHotspotFile[] {
  const changes = new Map<string, number>();
  const sensitiveChanges = new Map<string, number>();

  for (const sample of samples) {
    const changed = new Set(sample.changedPaths.map(normalizedPath).filter(Boolean) as string[]);
    const sensitive = new Set(
      sample.sensitivePaths.map(normalizedPath).filter(Boolean) as string[]
    );
    for (const path of changed) changes.set(path, (changes.get(path) ?? 0) + 1);
    for (const path of sensitive) {
      if (changed.has(path)) sensitiveChanges.set(path, (sensitiveChanges.get(path) ?? 0) + 1);
    }
  }

  return [...changes.entries()]
    .filter(([, changeCount]) => changeCount >= 3)
    .map(([path, changeCount]) => ({
      path,
      changeCount,
      sensitiveChangeCount: sensitiveChanges.get(path) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.changeCount - left.changeCount || compareCodePoints(left.path, right.path)
    );
}
