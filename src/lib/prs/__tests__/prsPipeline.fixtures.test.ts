import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import type {
  ComparisonSummary,
  ReadinessSignal,
  ReadinessSnapshot,
} from '../../../production-readiness/domain';
import { composeReadinessSnapshot } from '../../../production-readiness/composer/readinessComposer';
import { detectDependencySignals } from '../../../production-readiness/detectors/dependencyDetector';
import type { PackageManifest } from '../../../production-readiness/detectors/dependencyDetector';
import { detectEnvAndSecretSignals } from '../../../production-readiness/detectors/envSecretDetector';
import { detectPublicSurfaceSignals } from '../../../production-readiness/detectors/publicSurfaceDetector';
import { classifySensitivePaths } from '../../../production-readiness/detectors/sensitivePathClassifier';
import { detectTestCiMaintainabilitySignals } from '../../../production-readiness/detectors/testCiMaintainabilityDetector';
import type { TestCiPackageMetadata } from '../../../production-readiness/detectors/testCiMaintainabilityDetector';
import { compareInventories } from '../../../production-readiness/diff/diffEngine';
import {
  buildHistoryBaseline,
  type PrsHistorySample,
} from '../../../production-readiness/history/historyBaselineEngine';
import type { GitHubBaseInventoryResult } from '../../../production-readiness/inventory/githubBaseInventory';
import { buildZipInventory } from '../../../production-readiness/inventory/zipInventory';
import {
  generateAdcFixHandoffMarkdown,
  generateExportReceiptMarkdown,
} from '../../../production-readiness/reports/reportGenerators';
import { generatePrsCommitMarker } from '../commitMarkers';

interface FixtureFile {
  path: string;
  content: string;
}

interface PipelineScenario {
  name: string;
  label: string;
  candidateFiles: FixtureFile[];
  baseFiles: FixtureFile[];
  generatedChangedFiles?: number;
  historySamples?: number[];
}

interface PipelineResult {
  snapshot: ReadinessSnapshot;
  receipt: string;
  handoff: string;
  marker: string;
  historySignals: ReadinessSignal[];
}

const FIXED_TIME = '2026-07-07T00:00:00.000Z';
const FIXED_REPOSITORY = { owner: 'codefrost-dev', name: 'fixture-project' } as const;
const UiOnlyPrsFixtureProject = 'test/fixtures/prs/ui-only/scenario.json';
const AuthEnvChangePrsFixtureProject = 'test/fixtures/prs/auth-env-change/scenario.json';
const SecretFilePrsFixtureProject = 'test/fixtures/prs/secret-file/scenario.json';
const HistoryLargeExportPrsFixtureProject = 'test/fixtures/prs/history-large-export/scenario.json';
const UiOnlySnapshotGoldenJson = 'test/golden/prs/ui-only.snapshot.json';
const AuthEnvChangeSnapshotGoldenJson = 'test/golden/prs/auth-env-change.snapshot.json';
const SecretFileSnapshotGoldenJson = 'test/golden/prs/secret-file.snapshot.json';
const HistoryLargeExportSnapshotGoldenJson = 'test/golden/prs/history-large-export.snapshot.json';

const SCENARIO_PATHS: Readonly<Record<string, string>> = {
  'ui-only': UiOnlyPrsFixtureProject,
  'auth-env-change': AuthEnvChangePrsFixtureProject,
  'secret-file': SecretFilePrsFixtureProject,
  'history-large-export': HistoryLargeExportPrsFixtureProject,
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as T;
}

function fixture(name: string): PipelineScenario {
  const path = SCENARIO_PATHS[name];
  if (!path) throw new Error(`Unknown PRS pipeline fixture: ${name}.`);
  return readJson<PipelineScenario>(path);
}

function golden<T>(path: string): T {
  return readJson<T>(path);
}

function generatedFiles(scenario: PipelineScenario, revision: 'base' | 'candidate'): FixtureFile[] {
  return Array.from({ length: scenario.generatedChangedFiles ?? 0 }, (_, index) => ({
    path: `src/features/views/view-${String(index + 1).padStart(2, '0')}.ts`,
    content: `export const view${index + 1} = '${revision}-${index + 1}';`,
  }));
}

function encoded(content: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(content));
}

function contentHash(content: string): string {
  return Array.from(encoded(content))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function zipBuffer(files: FixtureFile[]): ArrayBuffer {
  const zipped = zipSync(
    Object.fromEntries(files.map((file) => [`project/${file.path}`, encoded(file.content)]))
  );
  expect(Object.keys(unzipSync(zipped))).toHaveLength(files.length);
  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength
  ) as ArrayBuffer;
}

function packageMetadata(files: FixtureFile[]): (PackageManifest & TestCiPackageMetadata) | null {
  const content = files.find((file) => file.path === 'package.json')?.content;
  return content ? (JSON.parse(content) as PackageManifest & TestCiPackageMetadata) : null;
}

function lineCount(content: string): number {
  if (content.length === 0) return 0;
  const lines = content.split(/\r\n|\r|\n/u);
  if (lines.at(-1) === '') lines.pop();
  return lines.length;
}

function lineDelta(before: string, after: string): { addedLines: number; deletedLines: number } {
  const beforeLines = before.length === 0 ? [] : before.split(/\r\n|\r|\n/u);
  const afterLines = after.length === 0 ? [] : after.split(/\r\n|\r|\n/u);
  if (beforeLines.at(-1) === '') beforeLines.pop();
  if (afterLines.at(-1) === '') afterLines.pop();
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  )
    suffix++;
  return {
    addedLines: afterLines.length - prefix - suffix,
    deletedLines: beforeLines.length - prefix - suffix,
  };
}

function historySamples(counts: number[] | undefined): PrsHistorySample[] {
  return (counts ?? []).map((changedFiles, index) => ({
    id: `history-${index + 1}`,
    source: 'prior_snapshot',
    recordedAt: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    changedFiles,
    addedFiles: changedFiles,
    deletedFiles: 0,
    addedLines: changedFiles * 10,
    deletedLines: 0,
    sensitiveFilesChanged: 0,
    changedPaths: [`src/history-${index + 1}.ts`],
    sensitivePaths: [],
  }));
}

async function runPipeline(scenario: PipelineScenario): Promise<PipelineResult> {
  const baseFiles = [...scenario.baseFiles, ...generatedFiles(scenario, 'base')];
  const candidateFiles = [...scenario.candidateFiles, ...generatedFiles(scenario, 'candidate')];
  const baseByPath = new Map(baseFiles.map((file) => [file.path, file]));
  const candidateByPath = new Map(candidateFiles.map((file) => [file.path, file]));
  const inventory = await buildZipInventory(zipBuffer(candidateFiles), {
    hashBytes: async (bytes) =>
      Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
  });
  expect(
    inventory.entries.map((entry) => entry.path),
    `Expected complete candidate inventory; received ${JSON.stringify(inventory)}`
  ).toEqual(candidateFiles.map((file) => file.path).sort());
  const base: GitHubBaseInventoryResult = {
    repository: { ...FIXED_REPOSITORY },
    base: { ref: 'refs/heads/main', sha: 'fixture-base' },
    treeSha: 'fixture-tree',
    entries: baseFiles.map((file) => ({
      path: file.path,
      sizeBytes: encoded(file.content).byteLength,
      blobSha: contentHash(file.content),
      mode: '100644',
    })),
    partial: false,
    limitations: [],
  };
  const allPaths = new Set([...baseByPath.keys(), ...candidateByPath.keys()]);
  const lineDeltasByPath = Object.fromEntries(
    [...allPaths].map((path) => {
      const before = baseByPath.get(path)?.content ?? '';
      const after = candidateByPath.get(path)?.content ?? '';
      return [path, lineDelta(before, after)];
    })
  );
  const diff = compareInventories(inventory, base, {
    lineDeltasByPath,
    candidateBlobShasByPath: Object.fromEntries(
      candidateFiles.map((file) => [file.path, contentHash(file.content)])
    ),
    baseBinaryPaths: new Set(),
  });
  const sensitive = classifySensitivePaths(diff);
  const candidatePackage = packageMetadata(candidateFiles);
  const basePackage = packageMetadata(baseFiles);
  const changedPaths = diff.entries
    .filter((entry) => entry.status !== 'indeterminate')
    .map((entry) => entry.path);
  const comparison: ComparisonSummary = {
    changedFiles: diff.summary.changedFiles,
    addedFiles: diff.summary.addedFiles,
    deletedFiles: diff.summary.deletedFiles,
    renamedFiles: diff.summary.renamedFiles,
    addedLines: diff.summary.addedLines,
    deletedLines: diff.summary.deletedLines,
    binaryFilesChanged: diff.summary.binaryFilesChanged,
    sensitiveFilesChanged: new Set(sensitive.map((item) => item.path)).size,
    packageManifestChanged: changedPaths.includes('package.json'),
    lockfileChanged: changedPaths.some((path) =>
      /(?:^|\/)(?:pnpm-lock.yaml|package-lock.json|yarn.lock)$/u.test(path)
    ),
    envExampleChanged: changedPaths.includes('.env.example'),
    routeSurfaceChanged: false,
  };
  const candidateTextFiles = candidateFiles.map((file) => ({ ...file }));
  const baseTextFiles = baseFiles.map((file) => ({ ...file }));
  const dependencySignals = detectDependencySignals({
    candidatePackageJson: candidatePackage,
    basePackageJson: basePackage,
    candidatePackageJsonAvailable: candidatePackage !== null,
    basePackageJsonAvailable: basePackage !== null,
    candidateLockfiles: candidateFiles
      .map((file) => file.path)
      .filter((path) => path.endsWith('.lock')),
    baseLockfiles: baseFiles.map((file) => file.path).filter((path) => path.endsWith('.lock')),
    packageManifestChanged: comparison.packageManifestChanged,
    lockfileChanged: comparison.lockfileChanged,
  });
  const env = detectEnvAndSecretSignals({
    candidateFiles: candidateTextFiles,
    baseFiles: baseTextFiles,
    baseFilesAvailable: true,
    candidateEnvExample: candidateByPath.get('.env.example')?.content ?? null,
    baseEnvExample: baseByPath.get('.env.example')?.content ?? null,
  });
  const publicSurface = detectPublicSurfaceSignals({
    changedFiles: diff.entries,
    candidateFiles: candidateTextFiles,
  });
  comparison.routeSurfaceChanged = publicSurface.routes.length > 0;
  const maintainabilitySignals = detectTestCiMaintainabilitySignals({
    candidatePackageJson: candidatePackage,
    basePackageJson: basePackage,
    changedFiles: diff.entries,
    candidateFiles: candidateFiles.map((file) => ({
      path: file.path,
      lineCount: lineCount(file.content),
      content: file.content,
    })),
    baseFiles: baseFiles.map((file) => ({
      path: file.path,
      lineCount: lineCount(file.content),
      content: file.content,
    })),
  });
  const history = buildHistoryBaseline({
    current: comparison,
    currentChangedPaths: changedPaths,
    currentSensitivePaths: sensitive.map((item) => item.path),
    currentSourceFilesChanged: changedPaths.filter((path) =>
      /\.(?:js|jsx|ts|tsx|svelte)$/u.test(path)
    ).length,
    currentSourceLinesChanged: diff.summary.addedLines + diff.summary.deletedLines,
    currentDependencyCount: Object.keys(
      (candidatePackage?.dependencies as Record<string, string> | undefined) ?? {}
    ).length,
    priorSnapshots: historySamples(scenario.historySamples),
    githubCommits: [],
  });
  const signals = [
    ...dependencySignals,
    ...env.signals,
    ...publicSurface.signals,
    ...maintainabilitySignals,
    ...history.signals,
  ];
  const snapshot = composeReadinessSnapshot({
    generatedAt: FIXED_TIME,
    repository: { ...FIXED_REPOSITORY },
    base: { ref: 'refs/heads/main', sha: 'fixture-base' },
    candidate: {
      id: scenario.name,
      label: scenario.label,
      zipSizeBytes: zipBuffer(candidateFiles).byteLength,
      generatedFrom: 'bolt-export-zip',
    },
    comparison,
    githubComparisonAvailable: true,
    availableDetectors: [
      'sensitive_paths',
      'dependencies',
      'env_secrets',
      'public_surface',
      'tests_ci',
      'maintainability',
      'history',
    ],
    signals,
    unavailableData: history.limitations.map((message) => ({
      source: 'history' as const,
      message,
      confidenceImpact: 'medium' as const,
    })),
  });
  return {
    snapshot,
    receipt: generateExportReceiptMarkdown(snapshot),
    handoff: generateAdcFixHandoffMarkdown(snapshot, {
      includeCompareUrl: false,
      includeHistory: true,
      includeAdcFixLink: false,
      redactPathNames: false,
    }),
    marker: generatePrsCommitMarker(snapshot, {
      includeTopConcerns: true,
      includeOutputRefs: false,
      maxConcerns: 3,
    }),
    historySignals: history.signals,
  };
}

function snapshotProjection(snapshot: ReadinessSnapshot): unknown {
  return {
    schemaVersion: snapshot.schemaVersion,
    state: snapshot.state,
    comparison: snapshot.comparison,
    categories: snapshot.categories.map((category) => ({
      category: category.category,
      signalCount: category.signalCount,
      highestSeverity: category.highestSeverity,
    })),
    signalIds: snapshot.signals.map((signal) => signal.id),
    limitations: snapshot.limitations,
  };
}

function digest(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return createHash('sha256').update(serialized).digest('hex');
}

function goldenProjection(result: PipelineResult): unknown {
  return {
    summary: snapshotProjection(result.snapshot),
    digests: {
      snapshot: digest(result.snapshot),
      receipt: digest(result.receipt),
      handoff: digest(result.handoff),
      marker: digest(result.marker),
    },
  };
}

describe('PRS end-to-end fixture pipeline', () => {
  it('ui only export fixture returns Green snapshot and matching receipt', async () => {
    const result = await runPipeline(fixture('ui-only'));

    expect(result.snapshot.state.state).toBe('green');
    expect(result.receipt).toContain('Readiness: Green');
    expect(goldenProjection(result)).toEqual(golden<unknown>(UiOnlySnapshotGoldenJson));
  });

  it('auth env change fixture returns Yellow or Red with env limitations', async () => {
    const result = await runPipeline(fixture('auth-env-change'));

    expect(['yellow', 'red']).toContain(result.snapshot.state.state);
    expect(result.snapshot.signals.map((signal) => signal.id)).toContain('env-variable-introduced');
    expect(goldenProjection(result)).toEqual(golden<unknown>(AuthEnvChangeSnapshotGoldenJson));
  });

  it('secret file fixture returns Red and redacts every output', async () => {
    const scenario = fixture('secret-file');
    const result = await runPipeline(scenario);
    const sentinel = ['fixture', 'super', 'secret', 'value'].join('-');
    const serialized = JSON.stringify(result);

    expect(result.snapshot.state.state).toBe('red');
    expect(serialized.includes(sentinel)).toBe(false);
    expect(goldenProjection(result)).toEqual(golden<unknown>(SecretFileSnapshotGoldenJson));
  });

  it('history large export fixture applies baseline thresholds', async () => {
    const result = await runPipeline(fixture('history-large-export'));
    const withoutSensitive = buildHistoryBaseline({
      current: { ...result.snapshot.comparison, sensitiveFilesChanged: 0 },
      currentChangedPaths: [],
      currentSensitivePaths: [],
      currentSourceFilesChanged: result.snapshot.comparison.changedFiles,
      currentSourceLinesChanged:
        (result.snapshot.comparison.addedLines ?? 0) +
        (result.snapshot.comparison.deletedLines ?? 0),
      currentDependencyCount: 0,
      priorSnapshots: historySamples([4, 5, 4, 6, 5]),
      githubCommits: [],
    });

    expect(result.snapshot.state.state).toBe('red');
    expect(result.historySignals.map((signal) => signal.id)).toContain(
      'history-unusually-large-change'
    );
    expect(withoutSensitive.signals.map((signal) => signal.id)).not.toContain(
      'history-unusually-large-change'
    );
    expect(goldenProjection(result)).toEqual(golden<unknown>(HistoryLargeExportSnapshotGoldenJson));
  });
});
