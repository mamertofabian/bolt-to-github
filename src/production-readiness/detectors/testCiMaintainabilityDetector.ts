import type { EvidenceRef, ReadinessCategory, ReadinessSignal, SignalSeverity } from '../domain';
import type { FileDiffEntry } from '../diff/diffEngine';
import {
  classifyMaintainabilityPath,
  getMaintainabilityThresholds,
  type MaintainabilityPathKind,
} from '../rules/maintainability-rules';

export interface TestCiPackageMetadata {
  scripts?: Readonly<Record<string, string>>;
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
}

export interface MaintainabilityFile {
  path: string;
  lineCount?: number;
  content?: string;
}

export interface TestCiMaintainabilityDetectorInput {
  candidatePackageJson: TestCiPackageMetadata | null;
  basePackageJson: TestCiPackageMetadata | null;
  changedFiles: FileDiffEntry[];
  candidateFiles: MaintainabilityFile[];
  baseFiles: MaintainabilityFile[];
}

const TEST_FRAMEWORK_NAMES = new Set([
  '@playwright/test',
  'ava',
  'cypress',
  'jasmine',
  'jest',
  'mocha',
  'playwright',
  'vitest',
]);
const TYPECHECK_COMMAND =
  /(?:^|[\s;&|])(?:tsc|vue-tsc|svelte-check)(?=$|[\s;&|])|(?:^|[\s;&|])astro\s+check(?=$|[\s;&|])/u;

function compareCodePoints(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function portablePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/^(?:[.]\/)+/, '')
    .replace(/^\/+/, '');
}

function createSignal(
  id: string,
  category: ReadinessCategory,
  severity: SignalSeverity,
  title: string,
  message: string,
  evidence: EvidenceRef[],
  suggestedReview: string
): ReadinessSignal {
  return {
    id,
    category,
    severity,
    title,
    message,
    evidence,
    suggestedReview,
    deterministic: true,
  };
}

function scriptNames(metadata: TestCiPackageMetadata | null): string[] {
  return Object.keys(metadata?.scripts ?? {}).sort(compareCodePoints);
}

function hasScript(names: readonly string[], candidates: readonly string[]): boolean {
  return names.some((name) =>
    candidates.some(
      (candidate) =>
        name === candidate || (candidate !== 'check' && name.startsWith(`${candidate}:`))
    )
  );
}

function frameworkNames(metadata: TestCiPackageMetadata | null): string[] {
  const dependencies = {
    ...(metadata?.dependencies ?? {}),
    ...(metadata?.devDependencies ?? {}),
  };
  return Object.keys(dependencies)
    .filter((name) => TEST_FRAMEWORK_NAMES.has(name) || name.startsWith('@testing-library/'))
    .sort(compareCodePoints);
}

function isTypecheckScript(name: string, command: string): boolean {
  return (
    hasScript([name], ['typecheck', 'type-check', 'check:types']) ||
    (name === 'check' && TYPECHECK_COMMAND.test(command))
  );
}

function fileEvidence(path: string, label: string): EvidenceRef {
  return { kind: 'file', label, path };
}

function statusLabel(status: FileDiffEntry['status']): string {
  return status;
}

function determinateChanges(changedFiles: readonly FileDiffEntry[]): FileDiffEntry[] {
  return [...changedFiles]
    .filter((change) => change.status !== 'indeterminate')
    .sort((left, right) => compareCodePoints(left.path, right.path));
}

function changedPathKind(change: FileDiffEntry): MaintainabilityPathKind {
  return classifyMaintainabilityPath(change.path);
}

function candidateLineCount(file: MaintainabilityFile | undefined): number | undefined {
  if (file?.lineCount === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(file.lineCount) || file.lineCount < 0) {
    throw new TypeError(`Line count for ${file.path} must be a non-negative safe integer.`);
  }
  return file.lineCount;
}

function inferredBaseLineCount(
  change: FileDiffEntry,
  candidateLines: number,
  baseFile: MaintainabilityFile | undefined
): number | undefined {
  const exactBase = candidateLineCount(baseFile);
  if (exactBase !== undefined) {
    return exactBase;
  }
  if (change.status === 'added') {
    return 0;
  }
  if (change.addedLines !== undefined && change.deletedLines !== undefined) {
    return Math.max(0, candidateLines - change.addedLines + change.deletedLines);
  }
  return undefined;
}

function isComponentPath(path: string): boolean {
  const normalized = portablePath(path).toLowerCase();
  return (
    /[.](?:jsx|tsx|svelte|vue|astro)$/u.test(normalized) ||
    /(?:^|\/)components?(?:\/|$)/u.test(normalized)
  );
}

type MarkerDefinition = {
  label: string;
  count: (content: string) => number;
};

function matchCount(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length;
}

const TYPESCRIPT_MARKERS: readonly MarkerDefinition[] = [
  {
    label: '@ts-ignore markers increased',
    count: (content) => matchCount(content, /@ts-ignore\b/gu),
  },
  {
    label: 'eslint-disable markers increased',
    count: (content) => matchCount(content, /eslint-disable(?:-next-line|-line)?\b/gu),
  },
  {
    label: 'Explicit any markers increased',
    count: (content) =>
      matchCount(
        content,
        /(?::\s*any\b|\bas\s+any\b|=\s*any\b|(?:<|,)\s*any\s*(?=[,>])|\bany\s*\[\s*\])/gu
      ),
  },
];

export function detectTestCiMaintainabilitySignals(
  input: TestCiMaintainabilityDetectorInput
): ReadinessSignal[] {
  const signals: ReadinessSignal[] = [];
  const changes = determinateChanges(input.changedFiles);
  const thresholds = getMaintainabilityThresholds();
  const candidateByPath = new Map(
    input.candidateFiles.map((file) => [portablePath(file.path), file])
  );
  const baseByPath = new Map(input.baseFiles.map((file) => [portablePath(file.path), file]));

  const candidateScripts = scriptNames(input.candidatePackageJson);
  const baseScripts = scriptNames(input.basePackageJson);
  const hasCandidateTestScript = hasScript(candidateScripts, ['test']);
  const hadBaseTestScript = hasScript(baseScripts, ['test']);
  const hasLintScript = hasScript(candidateScripts, ['lint']);
  const hasTypecheckScript = candidateScripts.some((name) =>
    isTypecheckScript(name, input.candidatePackageJson?.scripts?.[name] ?? '')
  );

  if (input.candidatePackageJson) {
    if (!hasCandidateTestScript) {
      signals.push(
        createSignal(
          hadBaseTestScript ? 'test-script-removed' : 'test-script-missing',
          'testing_recovery',
          hadBaseTestScript ? 'high' : 'medium',
          hadBaseTestScript ? 'Test script removed' : 'Test script not detected',
          hadBaseTestScript
            ? 'A package test script present in the base is absent from the candidate.'
            : 'No package test script was detected in the candidate.',
          [
            {
              kind: 'pattern',
              label: hadBaseTestScript
                ? 'Package test script removed'
                : 'Package test script not detected',
              path: 'package.json',
              ...(input.basePackageJson ? { before: hadBaseTestScript } : {}),
              after: false,
            },
          ],
          'Confirm the project has an appropriate repeatable test command.'
        )
      );
    }

    const missingQualityScripts: EvidenceRef[] = [];
    if (!hasLintScript) {
      missingQualityScripts.push({
        kind: 'pattern',
        label: 'Lint script not detected',
        path: 'package.json',
      });
    }
    if (!hasTypecheckScript) {
      missingQualityScripts.push({
        kind: 'pattern',
        label: 'Typecheck script not detected',
        path: 'package.json',
      });
    }
    if (missingQualityScripts.length > 0) {
      signals.push(
        createSignal(
          'quality-scripts-missing',
          'testing_recovery',
          'low',
          'Quality scripts not detected',
          'One or more lint or typecheck package scripts were not detected.',
          missingQualityScripts,
          'Confirm lint and typecheck commands are documented or automated where appropriate.'
        )
      );
    }

    const readinessEvidence: EvidenceRef[] = [];
    for (const scriptName of candidateScripts.filter(
      (name) =>
        hasScript([name], ['test', 'lint']) ||
        isTypecheckScript(name, input.candidatePackageJson?.scripts?.[name] ?? '')
    )) {
      readinessEvidence.push({
        kind: 'pattern',
        label: `Package script: ${scriptName}`,
        path: 'package.json',
      });
    }
    for (const framework of frameworkNames(input.candidatePackageJson)) {
      readinessEvidence.push({
        kind: 'dependency',
        label: `Test framework: ${framework}`,
        path: 'package.json',
      });
    }
    readinessEvidence.sort((left, right) => compareCodePoints(left.label, right.label));
    if (readinessEvidence.length > 0) {
      signals.push(
        createSignal(
          'test-readiness-detected',
          'testing_recovery',
          'info',
          'Test and quality readiness evidence detected',
          'Package scripts or test framework dependencies were detected.',
          readinessEvidence,
          'Keep these checks running as part of review or CI.'
        )
      );
    }
  }

  const changedTestEvidence: EvidenceRef[] = [];
  const deletedTestEvidence: EvidenceRef[] = [];
  const activeTestPaths = new Set<string>();
  for (const change of changes) {
    const currentPath = portablePath(change.path);
    const currentIsTest = changedPathKind(change) === 'test';
    const previousPath = change.previousPath ? portablePath(change.previousPath) : undefined;
    const previousIsTest = previousPath
      ? classifyMaintainabilityPath(previousPath) === 'test'
      : false;

    if (currentIsTest && change.status !== 'deleted') {
      if (change.status !== 'renamed') {
        activeTestPaths.add(currentPath);
      }
      changedTestEvidence.push(
        fileEvidence(currentPath, `Test file ${statusLabel(change.status)}`)
      );
    }
    if (
      (currentIsTest && change.status === 'deleted') ||
      (change.status === 'renamed' && previousIsTest && !currentIsTest)
    ) {
      const deletedPath = change.status === 'renamed' && previousPath ? previousPath : currentPath;
      deletedTestEvidence.push(fileEvidence(deletedPath, 'Test file deleted'));
    }
  }
  if (changedTestEvidence.length > 0) {
    signals.push(
      createSignal(
        'test-files-changed',
        'testing_recovery',
        'info',
        'Test files changed',
        'Added, changed, or renamed test files were found in the export diff.',
        changedTestEvidence,
        'Confirm the changed tests cover the intended behavior.'
      )
    );
  }
  if (deletedTestEvidence.length > 0) {
    signals.push(
      createSignal(
        'test-files-deleted',
        'testing_recovery',
        'high',
        'Test files deleted',
        'One or more test files were removed from the candidate export.',
        deletedTestEvidence,
        'Confirm coverage was intentionally removed or replaced.'
      )
    );
  }

  const ciEvidence: EvidenceRef[] = [];
  for (const change of changes) {
    const currentPath = portablePath(change.path);
    const currentIsCi = changedPathKind(change) === 'ci';
    const previousPath = change.previousPath ? portablePath(change.previousPath) : undefined;
    const previousIsCi = previousPath ? classifyMaintainabilityPath(previousPath) === 'ci' : false;

    if (currentIsCi) {
      ciEvidence.push(fileEvidence(currentPath, `CI workflow ${statusLabel(change.status)}`));
    } else if (change.status === 'renamed' && previousPath && previousIsCi) {
      ciEvidence.push(fileEvidence(previousPath, 'CI workflow renamed outside workflow directory'));
    }
  }
  ciEvidence.sort((left, right) => compareCodePoints(left.path ?? '', right.path ?? ''));
  if (ciEvidence.length > 0) {
    signals.push(
      createSignal(
        'ci-workflow-changed',
        'testing_recovery',
        'high',
        'CI workflow changed',
        'A continuous-integration workflow file changed.',
        ciEvidence,
        'Verify required build, lint, typecheck, and test jobs still run.'
      )
    );
  }

  const sourceChanges = changes.filter((change) => changedPathKind(change) === 'source');
  if (sourceChanges.length >= thresholds.broadSourceChangeFiles && activeTestPaths.size === 0) {
    signals.push(
      createSignal(
        'source-changes-without-tests',
        'testing_recovery',
        'medium',
        'Broad source change has no added or updated tests',
        'A broad source-file change was detected without added or updated test files.',
        [
          ...sourceChanges.map((change) =>
            fileEvidence(portablePath(change.path), 'Changed source file')
          ),
          {
            kind: 'metric',
            label: 'Source files changed without added or updated tests',
            after: sourceChanges.length,
          },
        ],
        'Review whether focused tests should accompany this source change.'
      )
    );
  }

  const backupEvidence = changes
    .filter(
      (change) => change.status !== 'deleted' && changedPathKind(change) === 'backup_temp_copy'
    )
    .map((change) => fileEvidence(portablePath(change.path), 'Backup, temporary, or copy file'));
  if (backupEvidence.length > 0) {
    signals.push(
      createSignal(
        'backup-temp-copy-files',
        'maintainability',
        'low',
        'Backup or temporary files detected',
        'Backup, temporary, or copy filenames were found in the candidate diff.',
        backupEvidence,
        'Remove accidental copies or confirm they belong in source control.'
      )
    );
  }

  const generatedEvidence = changes
    .filter((change) => change.status === 'added' && changedPathKind(change) === 'generated_like')
    .map((change) => fileEvidence(portablePath(change.path), 'Generated-looking source file'));
  if (generatedEvidence.length > 0) {
    signals.push(
      createSignal(
        'generated-looking-source-files',
        'maintainability',
        'low',
        'Generated-looking source files added',
        'New source paths look generated based on deterministic filename rules.',
        generatedEvidence,
        'Confirm generated source belongs in the repository and can be reproduced.'
      )
    );
  }

  const componentEvidence: EvidenceRef[] = [];
  const largeFileEvidence: EvidenceRef[] = [];
  const heavyGrowthEvidence: EvidenceRef[] = [];
  const redLargeGrowthEvidence: EvidenceRef[] = [];
  for (const change of sourceChanges) {
    if (change.status === 'deleted') {
      continue;
    }
    const path = portablePath(change.path);
    const candidateLines = candidateLineCount(candidateByPath.get(path));
    if (candidateLines === undefined) {
      continue;
    }
    const baseLines = inferredBaseLineCount(change, candidateLines, baseByPath.get(path));
    const growth = baseLines === undefined ? undefined : candidateLines - baseLines;
    const evidence = (label: string): EvidenceRef => ({
      kind: 'metric',
      label,
      path,
      before: baseLines,
      after: candidateLines,
    });
    const redLargeGrowth =
      candidateLines >= thresholds.redLinesWhenHeavilyChanged &&
      growth !== undefined &&
      growth >= thresholds.heavyGrowthLines;

    if (redLargeGrowth) {
      redLargeGrowthEvidence.push(evidence('Large heavily changed source file'));
      continue;
    }
    if (
      isComponentPath(path) &&
      candidateLines >= thresholds.componentInfoLines &&
      candidateLines < thresholds.componentYellowLines
    ) {
      componentEvidence.push(evidence('Large component file'));
    }
    if (candidateLines >= thresholds.componentYellowLines) {
      largeFileEvidence.push(evidence('Large source file'));
    }
    if (growth !== undefined && growth >= thresholds.heavyGrowthLines) {
      heavyGrowthEvidence.push(evidence('Source file line growth'));
    }
  }
  if (componentEvidence.length > 0) {
    signals.push(
      createSignal(
        'maintainability-large-component',
        'maintainability',
        'info',
        'Large component files changed',
        'Changed component files meet the documented informational line threshold.',
        componentEvidence,
        'Consider whether the component remains easy to review and test.'
      )
    );
  }
  if (largeFileEvidence.length > 0) {
    signals.push(
      createSignal(
        'maintainability-large-file',
        'maintainability',
        'medium',
        'Large source files changed',
        'Changed source files meet the documented 500-line review threshold.',
        largeFileEvidence,
        'Review whether focused extraction would improve maintainability and testability.'
      )
    );
  }
  if (heavyGrowthEvidence.length > 0) {
    signals.push(
      createSignal(
        'maintainability-heavy-growth',
        'maintainability',
        'medium',
        'Source files grew substantially',
        'Changed source files grew by at least the documented line threshold.',
        heavyGrowthEvidence,
        'Review the added responsibilities and ensure focused tests cover them.'
      )
    );
  }
  if (redLargeGrowthEvidence.length > 0) {
    signals.push(
      createSignal(
        'maintainability-red-large-growth',
        'maintainability',
        'critical',
        'Very large source files grew substantially',
        'Changed source files are at least 1,000 lines and grew by at least 300 lines.',
        redLargeGrowthEvidence,
        'Perform a focused review of responsibilities, failure paths, and test coverage.'
      )
    );
  }

  const suppressionEvidence: EvidenceRef[] = [];
  for (const change of sourceChanges) {
    if (change.status === 'deleted' || !/[.](?:[cm]?ts|tsx)$/u.test(change.path)) {
      continue;
    }
    const path = portablePath(change.path);
    const candidateContent = candidateByPath.get(path)?.content;
    if (candidateContent === undefined) {
      continue;
    }
    const previousPath = change.previousPath ? portablePath(change.previousPath) : undefined;
    const baseContent =
      baseByPath.get(path)?.content ??
      (change.status === 'renamed' && previousPath
        ? baseByPath.get(previousPath)?.content
        : undefined);
    if (baseContent === undefined && change.status !== 'added') {
      continue;
    }
    for (const marker of TYPESCRIPT_MARKERS) {
      const before = marker.count(baseContent ?? '');
      const after = marker.count(candidateContent);
      if (after > before) {
        suppressionEvidence.push({
          kind: 'pattern',
          label: marker.label,
          path,
          before,
          after,
        });
      }
    }
  }
  if (suppressionEvidence.length > 0) {
    signals.push(
      createSignal(
        'typescript-suppression-growth',
        'maintainability',
        'medium',
        'TypeScript suppression markers increased',
        'Static counts of eslint-disable, @ts-ignore, or explicit any markers increased.',
        suppressionEvidence,
        'Review whether the new suppressions can be replaced with typed, validated behavior.'
      )
    );
  }

  return signals.sort((left, right) => compareCodePoints(left.id, right.id));
}
