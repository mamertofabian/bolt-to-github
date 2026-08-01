import type { ReadinessSnapshot, ReadinessState } from '../../production-readiness/domain';
import { detectSecretLikePatterns } from '../../production-readiness/rules/secret-patterns';

export type PrsCommitMarkerOptions = {
  includeTopConcerns?: boolean;
  includeOutputRefs?: boolean;
  maxConcerns?: number;
};

export interface PrsCommitMarkerSettings {
  includeInCommitBody: boolean;
}

export interface GitCommitSummary {
  sha: string;
  message: string;
  committedAt?: string;
}

export type PrsHistoryMarker = {
  commitSha: string;
  committedAt?: string;
  state: ReadinessState;
  changedFiles: number;
  sensitiveFilesChanged: number;
  topConcerns: string[];
  source: 'b2g-prs-commit-marker';
};

const OPEN_MARKER = '[B2G-PRS]';
const CLOSE_MARKER = '[/B2G-PRS]';
const MAX_COMMIT_MESSAGE_LENGTH = 65_536;
const MAX_MARKER_LENGTH = 4_096;
const MAX_CONCERNS = 3;
const MAX_CONCERN_LENGTH = 200;
const MAX_SHA_LENGTH = 100;
const MAX_TIMESTAMP_LENGTH = 50;
const MAX_COMMITS = 30;

const READINESS_LABELS: Record<ReadinessState, string> = {
  green: 'Green',
  yellow: 'Yellow',
  red: 'Red',
};

const SECRET_INDICATORS = [
  /\b(?:basic|bearer|digest|hoba|mutual|negotiate|scram-sha-256|vapid|credentials?|passwords?|passwd|passphrases?|secrets?|tokens?|api[\s_-]?keys?|private[\s_-]?keys?|client[\s_-]?secrets?|access[\s_-]?keys?)\b/iu,
  /\b[A-Za-z_$][A-Za-z0-9_$-]*(?:credential|password|passwd|passphrase|secret|token|apiKey|privateKey|clientSecret|accessKey)[A-Za-z0-9_$-]*\s*[:=]/iu,
  /\b(?:export\s+)?[A-Z][A-Z0-9_]{1,63}\s*=/u,
  /\bauthorization\s*:\s*(?:bearer|basic)\b/iu,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/iu,
  /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{16,}\b/u,
  /\bsk-[A-Za-z0-9_-]{16,}\b/u,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
];

function nonNegativeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function boundedText(name: string, value: string, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) {
    throw new TypeError(`${name} must be a bounded string without null bytes.`);
  }
  return value;
}

function validTimestamp(value: string): boolean {
  if (
    typeof value !== 'string' ||
    value.length > MAX_TIMESTAMP_LENGTH ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  ) {
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const canonical = new Date(parsed).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z');
}

function sanitizeConcern(value: string): string {
  const sanitized = value
    .replaceAll(OPEN_MARKER, '[marker removed]')
    .replaceAll(CLOSE_MARKER, '[marker removed]')
    .replace(/[\r\n\t]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (
    detectSecretLikePatterns(sanitized).length > 0 ||
    SECRET_INDICATORS.some((pattern) => pattern.test(sanitized))
  ) {
    return '[REDACTED]';
  }
  return sanitized.replace(/\s+/gu, ' ').trim().slice(0, MAX_CONCERN_LENGTH);
}

function normalizedOptions(options: PrsCommitMarkerOptions): Required<PrsCommitMarkerOptions> {
  if (options.includeTopConcerns !== undefined && typeof options.includeTopConcerns !== 'boolean') {
    throw new TypeError('includeTopConcerns must be a boolean when provided.');
  }
  if (options.includeOutputRefs !== undefined && typeof options.includeOutputRefs !== 'boolean') {
    throw new TypeError('includeOutputRefs must be a boolean when provided.');
  }
  const maxConcerns = options.maxConcerns ?? MAX_CONCERNS;
  if (!Number.isSafeInteger(maxConcerns) || maxConcerns < 0 || maxConcerns > MAX_CONCERNS) {
    throw new TypeError(`maxConcerns must be a safe integer between 0 and ${MAX_CONCERNS}.`);
  }
  return {
    includeTopConcerns: options.includeTopConcerns ?? true,
    includeOutputRefs: options.includeOutputRefs ?? false,
    maxConcerns,
  };
}

function outputLabels(snapshot: ReadinessSnapshot): string[] {
  const labels: string[] = [];
  if (typeof snapshot.outputs.receiptMarkdown === 'string') labels.push('receipt');
  if (typeof snapshot.outputs.adcFixHandoffMarkdown === 'string') labels.push('handoff');
  if (typeof snapshot.outputs.debugJson === 'string') labels.push('debug');
  return labels;
}

export function generatePrsCommitMarker(
  snapshot: ReadinessSnapshot,
  options: PrsCommitMarkerOptions
): string {
  if (snapshot.schemaVersion !== 'b2g.prs.snapshot.v1') {
    throw new TypeError('snapshot.schemaVersion must be b2g.prs.snapshot.v1.');
  }
  if (!validTimestamp(snapshot.generatedAt)) {
    throw new TypeError('snapshot.generatedAt must be a bounded valid timestamp.');
  }
  if (
    snapshot.state.state !== 'green' &&
    snapshot.state.state !== 'yellow' &&
    snapshot.state.state !== 'red'
  ) {
    throw new TypeError('snapshot.state.state must be a supported readiness state.');
  }
  const selected = normalizedOptions(options);
  const lines = [
    OPEN_MARKER,
    'Version: 1',
    `Readiness: ${READINESS_LABELS[snapshot.state.state]}`,
    `Generated: ${snapshot.generatedAt}`,
    `Changed-Files: ${nonNegativeInteger('snapshot.comparison.changedFiles', snapshot.comparison.changedFiles)}`,
    `Sensitive-Files: ${nonNegativeInteger('snapshot.comparison.sensitiveFilesChanged', snapshot.comparison.sensitiveFilesChanged)}`,
  ];

  if (selected.includeTopConcerns && selected.maxConcerns > 0) {
    const concerns = snapshot.state.topConcerns
      .map(sanitizeConcern)
      .filter(Boolean)
      .slice(0, selected.maxConcerns);
    if (concerns.length > 0) {
      lines.push('Top-Concerns:', ...concerns.map((concern) => `- ${concern}`));
    }
  }

  if (selected.includeOutputRefs) {
    const outputs = outputLabels(snapshot);
    if (outputs.length > 0) lines.push(`Outputs: ${outputs.join(', ')}`);
  }
  lines.push(CLOSE_MARKER);

  const marker = lines.join('\n');
  if (marker.length > MAX_MARKER_LENGTH) {
    throw new TypeError('Generated PRS commit marker exceeded the bounded marker length.');
  }
  return marker;
}

function hasMarkerDelimiter(value: string): boolean {
  return value.includes(OPEN_MARKER) || value.includes(CLOSE_MARKER);
}

function isSingleMarker(marker: string): boolean {
  return (
    marker.startsWith(`${OPEN_MARKER}\n`) &&
    marker.endsWith(`\n${CLOSE_MARKER}`) &&
    marker.indexOf(OPEN_MARKER) === marker.lastIndexOf(OPEN_MARKER) &&
    marker.indexOf(CLOSE_MARKER) === marker.lastIndexOf(CLOSE_MARKER)
  );
}

export function appendPrsCommitMarker(commitBody: string, marker: string): string {
  const body = boundedText('commitBody', commitBody, MAX_COMMIT_MESSAGE_LENGTH);
  const boundedMarker = boundedText('marker', marker, MAX_MARKER_LENGTH);
  if (!isSingleMarker(boundedMarker)) {
    throw new TypeError('marker must contain exactly one complete B2G PRS marker block.');
  }
  if (hasMarkerDelimiter(body)) return body;

  const appended = body.length === 0 ? boundedMarker : `${body}\n\n${boundedMarker}`;
  if (appended.length > MAX_COMMIT_MESSAGE_LENGTH) {
    throw new TypeError('Commit body with PRS marker exceeded the bounded message length.');
  }
  return appended;
}

export function buildPrsCommitBody(
  commitBody: string,
  snapshot: ReadinessSnapshot,
  settings: PrsCommitMarkerSettings,
  options: PrsCommitMarkerOptions | undefined = undefined
): string {
  if (typeof settings.includeInCommitBody !== 'boolean') {
    throw new TypeError('settings.includeInCommitBody must be a boolean.');
  }
  if (!settings.includeInCommitBody) return commitBody;
  return appendPrsCommitMarker(commitBody, generatePrsCommitMarker(snapshot, options ?? {}));
}

function singleMarkerBlock(message: string): string | undefined {
  const start = message.indexOf(OPEN_MARKER);
  const end = message.indexOf(CLOSE_MARKER);
  if (
    start < 0 ||
    end < start ||
    start !== message.lastIndexOf(OPEN_MARKER) ||
    end !== message.lastIndexOf(CLOSE_MARKER)
  ) {
    return undefined;
  }
  const block = message.slice(start, end + CLOSE_MARKER.length);
  return block.length <= MAX_MARKER_LENGTH ? block : undefined;
}

function singleField(lines: string[], prefix: string): string | undefined {
  const values = lines.filter((line) => line.startsWith(prefix));
  return values.length === 1 ? values[0].slice(prefix.length).trim() : undefined;
}

function parsedNonNegativeInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parsedState(value: string | undefined): ReadinessState | undefined {
  const normalized = value?.toLowerCase();
  return normalized === 'green' || normalized === 'yellow' || normalized === 'red'
    ? normalized
    : undefined;
}

function parseBlock(
  block: string
): Omit<PrsHistoryMarker, 'commitSha' | 'committedAt'> | undefined {
  const lines = block.split(/\r?\n/gu).map((line) => line.trim());
  if (lines[0] !== OPEN_MARKER || lines.at(-1) !== CLOSE_MARKER) return undefined;
  if (
    lines.filter((line) => line === 'Top-Concerns:').length > 1 ||
    lines.filter((line) => line.startsWith('Outputs:')).length > 1
  ) {
    return undefined;
  }
  const version = singleField(lines, 'Version:');
  const state = parsedState(singleField(lines, 'Readiness:'));
  const generatedAt = singleField(lines, 'Generated:');
  const changedFiles = parsedNonNegativeInteger(singleField(lines, 'Changed-Files:'));
  const sensitiveFilesChanged = parsedNonNegativeInteger(singleField(lines, 'Sensitive-Files:'));
  if (
    version !== '1' ||
    !state ||
    !generatedAt ||
    !validTimestamp(generatedAt) ||
    changedFiles === undefined ||
    sensitiveFilesChanged === undefined
  ) {
    return undefined;
  }

  const heading = lines.indexOf('Top-Concerns:');
  const topConcerns: string[] = [];
  if (heading >= 0) {
    for (const line of lines.slice(heading + 1)) {
      if (!line.startsWith('- ')) break;
      const concern = sanitizeConcern(line.slice(2));
      if (concern && !topConcerns.includes(concern)) topConcerns.push(concern);
      if (topConcerns.length === MAX_CONCERNS) break;
    }
  }

  return {
    state,
    changedFiles,
    sensitiveFilesChanged,
    topConcerns,
    source: 'b2g-prs-commit-marker',
  };
}

export function parsePrsCommitMarkers(commits: GitCommitSummary[]): PrsHistoryMarker[] {
  if (!Array.isArray(commits)) throw new TypeError('commits must be an array.');
  const records: PrsHistoryMarker[] = [];
  const seenShas = new Set<string>();

  for (const commit of commits.slice(0, MAX_COMMITS)) {
    if (
      !commit ||
      typeof commit.sha !== 'string' ||
      commit.sha.length === 0 ||
      commit.sha.length > MAX_SHA_LENGTH ||
      commit.sha.includes('\0') ||
      typeof commit.message !== 'string' ||
      commit.message.length > MAX_COMMIT_MESSAGE_LENGTH ||
      seenShas.has(commit.sha)
    ) {
      continue;
    }
    seenShas.add(commit.sha);
    const block = singleMarkerBlock(commit.message);
    const parsed = block ? parseBlock(block) : undefined;
    if (!parsed) continue;

    const committedAt =
      typeof commit.committedAt === 'string' && validTimestamp(commit.committedAt)
        ? commit.committedAt
        : undefined;
    records.push({
      commitSha: commit.sha,
      ...(committedAt === undefined ? {} : { committedAt }),
      ...parsed,
    });
  }

  return records.sort((left, right) => {
    const leftTime = left.committedAt ? Date.parse(left.committedAt) : Number.POSITIVE_INFINITY;
    const rightTime = right.committedAt ? Date.parse(right.committedAt) : Number.POSITIVE_INFINITY;
    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.commitSha < right.commitSha) return -1;
    if (left.commitSha > right.commitSha) return 1;
    return 0;
  });
}
