export type MaintainabilityThresholds = {
  componentInfoLines: number;
  componentYellowLines: number;
  heavyGrowthLines: number;
  redLinesWhenHeavilyChanged: number;
  broadSourceChangeFiles: number;
};

export type MaintainabilityPathKind =
  | 'test'
  | 'ci'
  | 'source'
  | 'backup_temp_copy'
  | 'generated_like'
  | 'other';

const DEFAULT_THRESHOLDS: Readonly<MaintainabilityThresholds> = {
  componentInfoLines: 300,
  componentYellowLines: 500,
  heavyGrowthLines: 300,
  redLinesWhenHeavilyChanged: 1000,
  broadSourceChangeFiles: 10,
};

const SOURCE_EXTENSION = /[.](?:[cm]?[jt]sx?|svelte|vue|astro|css|scss|sass|less)$/u;
const TEST_PATH =
  /(?:^|\/)(?:__tests__|tests?|e2e)(?:\/|$)|[.](?:test|spec)[.][^/]+$|(?:^|\/)(?:vitest|jest|playwright|cypress)[.]config[.][^/]+$/u;
const BACKUP_PATH =
  /(?:[.](?:bak|backup|old|orig|tmp|copy)$|(?:[. _-])(?:backup|copy|old|orig|tmp)(?:[. _()-]|$))/u;
const GENERATED_PATH = /(?:^|\/)(?:__generated__|generated)(?:\/|$)|[.](?:gen|generated)[.][^/]+$/u;

function normalizePath(filePath: string): string {
  return filePath
    .replaceAll('\\', '/')
    .replace(/^(?:[.]\/)+/, '')
    .replace(/^\/+/, '');
}

export function getMaintainabilityThresholds(): MaintainabilityThresholds {
  return { ...DEFAULT_THRESHOLDS };
}

export function classifyMaintainabilityPath(filePath: string): MaintainabilityPathKind {
  const normalized = normalizePath(filePath).toLowerCase();
  if (/^[.]github\/workflows\/[^/]+$/u.test(normalized)) {
    return 'ci';
  }
  if (BACKUP_PATH.test(normalized)) {
    return 'backup_temp_copy';
  }
  if (TEST_PATH.test(normalized)) {
    return 'test';
  }
  if (GENERATED_PATH.test(normalized) && SOURCE_EXTENSION.test(normalized)) {
    return 'generated_like';
  }
  if (SOURCE_EXTENSION.test(normalized) && !/[.]d[.][cm]?[jt]s$/u.test(normalized)) {
    return 'source';
  }
  return 'other';
}
