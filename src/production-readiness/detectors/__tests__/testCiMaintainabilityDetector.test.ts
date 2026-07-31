import { describe, expect, it } from 'vitest';

import type { FileDiffEntry } from '../../diff/diffEngine';
import type { ReadinessSignal } from '../../domain';
import {
  detectTestCiMaintainabilitySignals,
  type MaintainabilityFile,
  type TestCiMaintainabilityDetectorInput,
  type TestCiPackageMetadata,
} from '../testCiMaintainabilityDetector';
import {
  classifyMaintainabilityPath,
  getMaintainabilityThresholds,
  type MaintainabilityPathKind,
  type MaintainabilityThresholds,
} from '../../rules/maintainability-rules';

function changedFile(
  path: string,
  status: Exclude<FileDiffEntry['status'], 'indeterminate'> = 'changed',
  addedLines?: number,
  deletedLines?: number,
  previousPath?: string
): FileDiffEntry {
  return {
    path,
    previousPath,
    status,
    binary: false,
    lineDiffEligible: true,
    addedLines,
    deletedLines,
  };
}

function file(path: string, lineCount?: number, content?: string): MaintainabilityFile {
  return { path, lineCount, content };
}

function input(
  overrides: Partial<TestCiMaintainabilityDetectorInput> = {}
): TestCiMaintainabilityDetectorInput {
  return {
    candidatePackageJson: null,
    basePackageJson: null,
    changedFiles: [],
    candidateFiles: [],
    baseFiles: [],
    ...overrides,
  };
}

describe('Production Readiness Snapshot test CI and maintainability detector', () => {
  it('detects test scripts test files and ci workflow changes', () => {
    const packageMetadata: TestCiPackageMetadata = {
      scripts: {
        test: 'vitest run',
        lint: 'eslint src',
        typecheck: 'tsc --noEmit',
      },
      dependencies: { '@playwright/test': '^1.45.0' },
      devDependencies: { vitest: '^1.6.1' },
    };
    const result: ReadinessSignal[] = detectTestCiMaintainabilitySignals(
      input({
        candidatePackageJson: packageMetadata,
        basePackageJson: { scripts: {} },
        changedFiles: [
          changedFile('src/feature.test.ts', 'added', 20, 0),
          changedFile('.github/workflows/ci.yml'),
        ],
        candidateFiles: [file('src/feature.test.ts', 20)],
      })
    );

    expect(result.map((signal) => signal.id)).toEqual([
      'ci-workflow-changed',
      'test-files-changed',
      'test-readiness-detected',
    ]);
    expect(
      result
        .find((signal) => signal.id === 'test-readiness-detected')
        ?.evidence.map((evidence) => evidence.label)
    ).toEqual([
      'Package script: lint',
      'Package script: test',
      'Package script: typecheck',
      'Test framework: @playwright/test',
      'Test framework: vitest',
    ]);
    expect(result.find((signal) => signal.id === 'test-files-changed')?.evidence).toEqual([
      {
        kind: 'file',
        label: 'Test file added',
        path: 'src/feature.test.ts',
      },
    ]);

    const workflowRenamedAway = detectTestCiMaintainabilitySignals(
      input({
        changedFiles: [changedFile('docs/ci.yml', 'renamed', 0, 0, '.github/workflows/ci.yml')],
      })
    );
    expect(workflowRenamedAway.map((signal) => signal.id)).toEqual(['ci-workflow-changed']);
    expect(workflowRenamedAway[0].evidence).toEqual([
      {
        kind: 'file',
        label: 'CI workflow renamed outside workflow directory',
        path: '.github/workflows/ci.yml',
      },
    ]);

    const removedScript = detectTestCiMaintainabilitySignals(
      input({
        candidatePackageJson: {
          scripts: { lint: 'eslint src', 'check:format': 'prettier --check .' },
        },
        basePackageJson: { scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' } },
      })
    );
    expect(removedScript.map((signal) => signal.id)).toEqual([
      'quality-scripts-missing',
      'test-readiness-detected',
      'test-script-removed',
    ]);
    expect(
      removedScript.find((signal) => signal.id === 'test-readiness-detected')?.evidence
    ).toEqual([
      {
        kind: 'pattern',
        label: 'Package script: lint',
        path: 'package.json',
      },
    ]);

    for (const scriptName of ['check', 'check:types']) {
      const recognizedAlias = detectTestCiMaintainabilitySignals(
        input({
          candidatePackageJson: {
            scripts: { test: 'vitest run', [scriptName]: 'tsc --noEmit' },
          },
        })
      );
      expect(
        recognizedAlias.find((signal) => signal.id === 'test-readiness-detected')?.evidence
      ).toEqual([
        {
          kind: 'pattern',
          label: `Package script: ${scriptName}`,
          path: 'package.json',
        },
        {
          kind: 'pattern',
          label: 'Package script: test',
          path: 'package.json',
        },
      ]);
      expect(
        recognizedAlias.find((signal) => signal.id === 'quality-scripts-missing')?.evidence
      ).toEqual([
        {
          kind: 'pattern',
          label: 'Lint script not detected',
          path: 'package.json',
        },
      ]);
    }

    const nonTypecheckingExactCheck = detectTestCiMaintainabilitySignals(
      input({
        candidatePackageJson: {
          scripts: { test: 'vitest run', lint: 'eslint src', check: 'prettier --check .' },
        },
      })
    );
    expect(
      nonTypecheckingExactCheck.find((signal) => signal.id === 'quality-scripts-missing')?.evidence
    ).toEqual([
      {
        kind: 'pattern',
        label: 'Typecheck script not detected',
        path: 'package.json',
      },
    ]);
    expect(
      nonTypecheckingExactCheck.find((signal) => signal.id === 'test-readiness-detected')?.evidence
    ).toEqual([
      { kind: 'pattern', label: 'Package script: lint', path: 'package.json' },
      { kind: 'pattern', label: 'Package script: test', path: 'package.json' },
    ]);

    const missingTestScript = detectTestCiMaintainabilitySignals(
      input({
        candidatePackageJson: { scripts: { lint: 'eslint src', check: 'tsc --noEmit' } },
        basePackageJson: { scripts: {} },
      })
    );
    expect(
      missingTestScript.find((signal) => signal.id === 'test-script-missing')?.evidence
    ).toEqual([
      {
        kind: 'pattern',
        label: 'Package test script not detected',
        path: 'package.json',
        before: false,
        after: false,
      },
    ]);

    const missingTestWithUnavailableBase = detectTestCiMaintainabilitySignals(
      input({
        candidatePackageJson: { scripts: { lint: 'eslint src', check: 'tsc --noEmit' } },
        basePackageJson: null,
      })
    );
    expect(
      missingTestWithUnavailableBase.find((signal) => signal.id === 'test-script-missing')?.evidence
    ).toEqual([
      {
        kind: 'pattern',
        label: 'Package test script not detected',
        path: 'package.json',
        after: false,
      },
    ]);
  });

  it('reports deleted tests and missing nearby tests for broad source changes', () => {
    const sourceChanges = Array.from({ length: 10 }, (_, index) =>
      changedFile(`src/features/feature-${index}.ts`, 'changed', 8, 2)
    );
    const result = detectTestCiMaintainabilitySignals(
      input({
        candidatePackageJson: { scripts: { test: 'vitest run' } },
        changedFiles: [
          ...sourceChanges,
          changedFile('src/legacy.test.ts', 'deleted'),
          changedFile('src/renamed.test.ts', 'renamed', 0, 0, 'src/original.test.ts'),
        ],
        candidateFiles: sourceChanges.map(({ path }) => file(path, 80)),
      })
    );

    expect(result.map((signal) => signal.id)).toEqual([
      'quality-scripts-missing',
      'source-changes-without-tests',
      'test-files-changed',
      'test-files-deleted',
      'test-readiness-detected',
    ]);
    expect(result.find((signal) => signal.id === 'test-files-deleted')).toMatchObject({
      category: 'testing_recovery',
      severity: 'high',
      deterministic: true,
    });
    expect(result.find((signal) => signal.id === 'test-files-deleted')?.evidence).toEqual([
      {
        kind: 'file',
        label: 'Test file deleted',
        path: 'src/legacy.test.ts',
      },
    ]);
    expect(
      result.find((signal) => signal.id === 'source-changes-without-tests')?.evidence.at(-1)
    ).toEqual({
      kind: 'metric',
      label: 'Source files changed without added or updated tests',
      after: 10,
    });
    expect(result.find((signal) => signal.id === 'source-changes-without-tests')?.message).toBe(
      'A broad source-file change was detected without added or updated test files.'
    );
  });

  it('reports files crossing maintainability thresholds', () => {
    const thresholds: MaintainabilityThresholds = getMaintainabilityThresholds();
    expect(thresholds).toEqual({
      componentInfoLines: 300,
      componentYellowLines: 500,
      heavyGrowthLines: 300,
      redLinesWhenHeavilyChanged: 1000,
      broadSourceChangeFiles: 10,
    });
    thresholds.componentInfoLines = 1;
    expect(getMaintainabilityThresholds().componentInfoLines).toBe(300);

    const result = detectTestCiMaintainabilitySignals(
      input({
        changedFiles: [
          changedFile('src/components/Card.tsx', 'changed', 1, 0),
          changedFile('src/service.ts', 'changed', 1, 0),
          changedFile('src/Huge.ts', 'changed', 400, 0),
          changedFile('src/Growing.ts', 'changed', 300, 0),
          changedFile('src/small.ts', 'changed', 49, 0),
        ],
        candidateFiles: [
          file('src/components/Card.tsx', 300),
          file('src/service.ts', 500),
          file('src/Huge.ts', 1000),
          file('src/Growing.ts', 400),
          file('src/small.ts', 299),
        ],
        baseFiles: [
          file('src/components/Card.tsx', 299),
          file('src/service.ts', 499),
          file('src/Huge.ts', 600),
          file('src/Growing.ts', 100),
          file('src/small.ts', 250),
        ],
      })
    );

    expect(result.map((signal) => signal.id)).toEqual([
      'maintainability-heavy-growth',
      'maintainability-large-component',
      'maintainability-large-file',
      'maintainability-red-large-growth',
    ]);
    expect(result.find((signal) => signal.id === 'maintainability-red-large-growth')).toMatchObject(
      { severity: 'critical', category: 'maintainability' }
    );
    expect(
      result.find((signal) => signal.id === 'maintainability-red-large-growth')?.evidence
    ).toEqual([
      {
        kind: 'metric',
        label: 'Large heavily changed source file',
        path: 'src/Huge.ts',
        before: 600,
        after: 1000,
      },
    ]);
    expect(result.find((signal) => signal.id === 'maintainability-heavy-growth')?.evidence).toEqual(
      [
        {
          kind: 'metric',
          label: 'Source file line growth',
          path: 'src/Growing.ts',
          before: 100,
          after: 400,
        },
      ]
    );
  });

  it('detects backup temp copy and generated looking source files', () => {
    const classified: Record<string, MaintainabilityPathKind> = {
      'src/feature.test.ts': 'test',
      '.github/workflows/ci.yml': 'ci',
      'src/App.tsx': 'source',
      'src/App.copy.tsx': 'backup_temp_copy',
      'src/App.tsx.bak': 'backup_temp_copy',
      'src/widget.test.ts.bak': 'backup_temp_copy',
      'src/__generated__/schema.ts': 'generated_like',
      'src/api.generated.ts': 'generated_like',
      'README.md': 'other',
    };
    for (const [path, kind] of Object.entries(classified)) {
      expect(classifyMaintainabilityPath(path)).toBe(kind);
    }

    const result = detectTestCiMaintainabilitySignals(
      input({
        changedFiles: [
          changedFile('src/App.copy.tsx', 'added'),
          changedFile('src/App.tsx.bak', 'changed'),
          changedFile('src/widget.test.ts.bak', 'added'),
          changedFile('src/__generated__/schema.ts', 'added'),
          changedFile('src/api.generated.ts', 'added'),
          changedFile('src/App.tsx', 'changed'),
        ],
      })
    );

    expect(result.map((signal) => signal.id)).toEqual([
      'backup-temp-copy-files',
      'generated-looking-source-files',
    ]);
    expect(result[0].severity).toBe('low');
    expect(result[0].evidence.map((evidence) => evidence.path)).toEqual([
      'src/App.copy.tsx',
      'src/App.tsx.bak',
      'src/widget.test.ts.bak',
    ]);
    expect(result[1].evidence.map((evidence) => evidence.path)).toEqual([
      'src/__generated__/schema.ts',
      'src/api.generated.ts',
    ]);
  });

  it('reports growth in TypeScript suppression and any markers', () => {
    const privateSourceText = 'private-source-text-must-not-appear';
    const result = detectTestCiMaintainabilitySignals(
      input({
        changedFiles: [
          changedFile('src/unsafe.ts'),
          changedFile('src/stable.ts'),
          changedFile('src/base-unavailable.ts'),
          changedFile('src/renamed.ts', 'renamed', 0, 0, 'src/original.ts'),
        ],
        candidateFiles: [
          file(
            'src/unsafe.ts',
            20,
            `
              // @ts-ignore ${privateSourceText}
              // @ts-ignore
              // eslint-disable-next-line no-explicit-any
              const value: any = load();
              type UnsafeValue = any;
              const cache: Record<string, any> = {};
            `
          ),
          file('src/stable.ts', 10, 'const stable: any = value;'),
          file('src/base-unavailable.ts', 4, '// @ts-ignore\nconst unavailable = load();'),
          file('src/renamed.ts', 4, '// @ts-ignore\nconst renamed = load();'),
        ],
        baseFiles: [
          file('src/unsafe.ts', 16, '// @ts-ignore\nconst value = load();'),
          file('src/stable.ts', 10, 'const stable: any = value;'),
          file('src/original.ts', 4, '// @ts-ignore\nconst renamed = load();'),
        ],
      })
    );

    expect(result.map((signal) => signal.id)).toEqual(['typescript-suppression-growth']);
    expect(result[0].evidence).toEqual([
      {
        kind: 'pattern',
        label: '@ts-ignore markers increased',
        path: 'src/unsafe.ts',
        before: 1,
        after: 2,
      },
      {
        kind: 'pattern',
        label: 'eslint-disable markers increased',
        path: 'src/unsafe.ts',
        before: 0,
        after: 1,
      },
      {
        kind: 'pattern',
        label: 'Explicit any markers increased',
        path: 'src/unsafe.ts',
        before: 0,
        after: 3,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(privateSourceText);
  });
});
