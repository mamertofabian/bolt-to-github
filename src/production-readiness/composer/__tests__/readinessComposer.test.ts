import { describe, expect, it } from 'vitest';

import type {
  ComparisonSummary,
  ReadinessCategory,
  ReadinessSignal,
  SignalSeverity,
} from '../../domain';
import {
  composeReadinessSnapshot,
  scoreReadinessSignals,
  selectSafeLookingAreas,
  selectTopConcerns,
  type ComposeReadinessSnapshotInput,
  type ReadinessDetectorId,
  type ReadinessScoreSummary,
} from '../readinessComposer';

const COMPLETE_DETECTORS: ReadinessDetectorId[] = [
  'sensitive_paths',
  'dependencies',
  'env_secrets',
  'public_surface',
  'tests_ci',
  'maintainability',
  'history',
];

function comparison(overrides: Partial<ComparisonSummary> = {}): ComparisonSummary {
  return {
    changedFiles: 0,
    addedFiles: 0,
    deletedFiles: 0,
    renamedFiles: 0,
    addedLines: 0,
    deletedLines: 0,
    binaryFilesChanged: 0,
    sensitiveFilesChanged: 0,
    packageManifestChanged: false,
    lockfileChanged: false,
    envExampleChanged: false,
    routeSurfaceChanged: false,
    ...overrides,
  };
}

function signal(
  id: string,
  severity: SignalSeverity,
  category: ReadinessCategory,
  title = id
): ReadinessSignal {
  return {
    id,
    severity,
    category,
    title,
    message: `${title} requires review.`,
    evidence: [
      {
        kind: 'pattern',
        label: `${id}-evidence`,
        path: `src/${id}.ts`,
      },
    ],
    deterministic: true,
  };
}

function input(
  overrides: Partial<ComposeReadinessSnapshotInput> = {}
): ComposeReadinessSnapshotInput {
  return {
    generatedAt: '2026-07-31T00:00:00.000Z',
    repository: { owner: 'codefrost-dev', name: 'sample-project' },
    base: { ref: 'refs/heads/main', sha: 'base-sha' },
    candidate: {
      id: 'candidate-export',
      label: 'Candidate export',
      zipSizeBytes: 1_024,
      generatedFrom: 'bolt-export-zip',
    },
    comparison: comparison(),
    githubComparisonAvailable: true,
    availableDetectors: [...COMPLETE_DETECTORS],
    signals: [],
    trends: [],
    outputs: {},
    unavailableData: [],
    ...overrides,
  };
}

describe('Production Readiness Snapshot composer', () => {
  it('composeReadinessSnapshot returns Green for low-score fixture with complete data', () => {
    const lowSignal = signal('limited-history-note', 'medium', 'change_history');
    const composerInput = input({ signals: [lowSignal] });
    const originalInput = structuredClone(composerInput);

    const snapshot = composeReadinessSnapshot(composerInput);

    expect(snapshot.state).toEqual({
      state: 'green',
      confidence: 'high',
      internalScore: 3,
      headline: 'No high-priority readiness concerns detected.',
      recommendedAction: 'Continue with normal review before deploying.',
      topConcerns: ['limited-history-note'],
      safeLookingAreas: [
        'No sensitive file changes detected.',
        'No dependency manifest changes detected.',
        'No environment or secret concerns detected.',
        'No public surface changes detected.',
        'No testing or recovery concerns detected.',
        'No maintainability concerns detected.',
      ],
    });
    expect(snapshot.schemaVersion).toBe('b2g.prs.snapshot.v1');
    expect(snapshot.categories).toEqual([
      {
        category: 'change_history',
        signalCount: 1,
        highestSeverity: 'medium',
        evidence: lowSignal.evidence,
      },
    ]);
    expect(snapshot.outputs).toEqual({});
    expect(snapshot.limitations).toEqual([]);
    expect(composerInput).toEqual(originalInput);
  });

  it('composeReadinessSnapshot returns Yellow for medium score or one high signal', () => {
    const scoreSummary: ReadinessScoreSummary = scoreReadinessSignals([
      signal('info', 'info', 'maintainability'),
      signal('low', 'low', 'maintainability'),
      signal('medium', 'medium', 'maintainability'),
      signal('high', 'high', 'maintainability'),
      signal('critical', 'critical', 'maintainability'),
    ]);
    expect(scoreSummary).toEqual({
      internalScore: 17,
      highestSeverity: 'critical',
      highSignalCount: 1,
      criticalSignalCount: 1,
    });

    const mediumScore = composeReadinessSnapshot(
      input({
        signals: [
          signal('medium-score', 'medium', 'deployment_ops'),
          signal('low-score', 'low', 'maintainability'),
        ],
      })
    );
    const oneHigh = composeReadinessSnapshot(
      input({ signals: [signal('one-high', 'high', 'identity_access')] })
    );

    expect(mediumScore.state.state).toBe('yellow');
    expect(mediumScore.state.internalScore).toBe(4);
    expect(oneHigh.state.state).toBe('yellow');
    expect(oneHigh.state.internalScore).toBe(5);
    expect(oneHigh.state.recommendedAction).not.toContain('block');
  });

  it('composeReadinessSnapshot returns Red when a critical signal is present', () => {
    const critical = composeReadinessSnapshot(
      input({ signals: [signal('env-file', 'critical', 'secrets_config')] })
    );
    const twoHigh = composeReadinessSnapshot(
      input({
        signals: [
          signal('auth-change', 'high', 'identity_access'),
          signal('payment-change', 'high', 'external_integrations'),
        ],
      })
    );
    const scoreThreshold = composeReadinessSnapshot(
      input({
        signals: [
          signal('medium-a', 'medium', 'deployment_ops'),
          signal('medium-b', 'medium', 'public_surface'),
          signal('medium-c', 'medium', 'testing_recovery'),
          signal('medium-d', 'medium', 'maintainability'),
        ],
      })
    );

    expect(critical.state.state).toBe('red');
    expect(twoHigh.state.state).toBe('red');
    expect(scoreThreshold.state.state).toBe('red');
    expect(scoreThreshold.state.internalScore).toBe(12);
    expect(critical.state.recommendedAction).not.toContain('blocked');
  });

  it('selectTopConcerns orders critical and sensitive evidence first', () => {
    const signals = [
      signal('maintainability-medium', 'medium', 'maintainability', 'Maintainability trend'),
      signal('secret-high', 'high', 'secrets_config', 'Secret configuration'),
      signal('auth-high', 'high', 'identity_access', 'Authentication change'),
      signal('history-high', 'high', 'change_history', 'Unusual change size'),
      signal('critical-ops', 'critical', 'deployment_ops', 'Critical deployment issue'),
    ];
    const originalOrder = signals.map((candidate) => candidate.id);

    expect(selectTopConcerns(signals, { limit: 4 })).toEqual([
      'Critical deployment issue',
      'Authentication change',
      'Secret configuration',
      'Unusual change size',
    ]);
    expect(selectTopConcerns(signals, { limit: 0 })).toEqual([]);
    expect(signals.map((candidate) => candidate.id)).toEqual(originalOrder);

    const snapshot = composeReadinessSnapshot(input({ signals: [...signals].reverse() }));
    expect(snapshot.signals.map((candidate) => candidate.id)).toEqual([
      'critical-ops',
      'auth-high',
      'secret-high',
      'history-high',
      'maintainability-medium',
    ]);

    const evidenceSignal = signal('evidence-order', 'low', 'maintainability');
    evidenceSignal.evidence = [
      { kind: 'pattern', label: 'same', path: 'same.ts', redacted: true },
      { kind: 'pattern', label: 'same', path: 'same.ts' },
    ];
    const forward = composeReadinessSnapshot(input({ signals: [evidenceSignal] }));
    const reverse = composeReadinessSnapshot(
      input({
        signals: [{ ...evidenceSignal, evidence: [...evidenceSignal.evidence].reverse() }],
      })
    );
    expect(forward.categories).toEqual(reverse.categories);
    expect(forward.categories[0].evidence.map((evidence) => evidence.redacted)).toEqual([
      undefined,
      true,
    ]);
  });

  it('selectSafeLookingAreas suppresses claims when supporting data is unavailable', () => {
    const partialInput = input({
      githubComparisonAvailable: false,
      availableDetectors: ['dependencies', 'env_secrets'],
      unavailableData: [
        {
          source: 'history',
          message: 'Historical comparison was unavailable.',
          confidenceImpact: 'medium',
        },
        {
          source: 'github_base',
          message: 'GitHub comparison was unavailable.',
          confidenceImpact: 'low',
        },
      ],
    });

    expect(selectSafeLookingAreas(partialInput)).toEqual([
      'No environment or secret concerns detected.',
    ]);

    const snapshot = composeReadinessSnapshot(partialInput);
    expect(snapshot.state.confidence).toBe('low');
    expect(snapshot.state.safeLookingAreas).toEqual([
      'No environment or secret concerns detected.',
    ]);
    expect(snapshot.limitations).toEqual([
      'Detector unavailable: change history analysis.',
      'Detector unavailable: maintainability analysis.',
      'Detector unavailable: public surface analysis.',
      'Detector unavailable: sensitive path analysis.',
      'Detector unavailable: test and CI analysis.',
      'GitHub comparison was unavailable.',
      'Historical comparison was unavailable.',
    ]);
    expect(snapshot.state.safeLookingAreas.join(' ')).not.toMatch(
      /sensitive|public|testing|maintainability|history/i
    );

    const detectorPartial = composeReadinessSnapshot(
      input({
        availableDetectors: ['history'],
      })
    );
    expect(detectorPartial.state.confidence).toBe('medium');
    expect(detectorPartial.limitations).toEqual([
      'Detector unavailable: dependency analysis.',
      'Detector unavailable: environment and secret analysis.',
      'Detector unavailable: maintainability analysis.',
      'Detector unavailable: public surface analysis.',
      'Detector unavailable: sensitive path analysis.',
      'Detector unavailable: test and CI analysis.',
    ]);

    const insufficientHistory = input({
      unavailableData: [
        {
          source: 'history',
          message: 'Not enough history was available to establish a trend.',
          confidenceImpact: 'medium',
        },
      ],
    });
    expect(selectSafeLookingAreas(insufficientHistory)).not.toContain(
      'No unusual change-history concerns detected.'
    );

    const degradedCandidateAnalysis = input({
      unavailableData: [
        {
          source: 'zip_scan',
          message: 'Part of the exported zip could not be scanned.',
          confidenceImpact: 'medium',
        },
        {
          source: 'large_file_diff',
          message: 'Large-file comparison was incomplete.',
          confidenceImpact: 'medium',
        },
      ],
    });
    expect(selectSafeLookingAreas(degradedCandidateAnalysis)).toEqual([]);
  });
});
