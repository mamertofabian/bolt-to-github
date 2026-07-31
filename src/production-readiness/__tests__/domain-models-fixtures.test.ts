import { describe, expect, it } from 'vitest';

import type {
  CandidateExportSummary,
  CategorySummary,
  ComparisonSummary,
  EvidenceRef,
  GitRefSummary,
  PartialDataNotice,
  ReadinessCategory,
  ReadinessSignal,
  ReadinessSnapshot,
  ReadinessState,
  ReadinessStateSummary,
  RepositoryRef,
  SignalSeverity,
  SnapshotConfidence,
  SnapshotOutputRefs,
  TrendSummary,
} from '../domain';
import { redactEvidenceRef, redactSensitiveValue } from '../redaction';
import { loadPrsFixture, type PrsFixture } from '../test-fixtures/prsFixtures';

describe('Production Readiness Snapshot domain foundation', () => {
  it('domain objects satisfy the expected snapshot schema', () => {
    const readinessState: ReadinessState = 'yellow';
    const signalSeverity: SignalSeverity = 'high';
    const confidence: SnapshotConfidence = 'medium';
    const categoryName: ReadinessCategory = 'identity_access';
    const repository: RepositoryRef = {
      owner: 'codefrost-dev',
      name: 'sample-bolt-project',
    };
    const base: GitRefSummary = {
      ref: 'refs/heads/main',
      sha: 'base-sha',
      compareUrl: 'https://github.com/codefrost-dev/sample-bolt-project/compare/base-sha',
    };
    const candidate: CandidateExportSummary = {
      id: 'auth-env-change',
      label: 'Auth and environment change',
      zipSizeBytes: 1_024,
      generatedFrom: 'bolt-export-zip',
    };
    const evidence: EvidenceRef = {
      kind: 'file',
      label: 'Authentication module',
      path: 'src/lib/auth.ts',
      before: false,
      after: true,
      redacted: false,
    };
    const category: CategorySummary = {
      category: categoryName,
      signalCount: 1,
      highestSeverity: signalSeverity,
      evidence: [evidence],
    };
    const trend: TrendSummary = {
      id: 'auth-change-history',
      label: 'Authentication code changed in two recent exports.',
      evidence: [{ kind: 'metric', label: 'Recent auth changes', after: 2 }],
    };
    const outputs: SnapshotOutputRefs = {
      receiptMarkdown: '# Export receipt',
      adcFixHandoffMarkdown: '# ADC Fix handoff',
      debugJson: '{"schemaVersion":"b2g.prs.snapshot.v1"}',
      commitMarker: '[B2G-PRS] Yellow [/B2G-PRS]',
    };
    const partialDataNotice: PartialDataNotice = {
      source: 'history',
      message: 'Historical comparison was unavailable.',
      confidenceImpact: 'medium',
    };
    const signal: ReadinessSignal = {
      id: 'auth-file-changed',
      category: categoryName,
      severity: signalSeverity,
      title: 'Authentication code changed',
      message: 'Review sign-in and session behavior before deploying.',
      evidence: [evidence],
      suggestedReview: 'Verify protected routes and session expiry.',
      deterministic: true,
    };
    const comparison: ComparisonSummary = {
      changedFiles: 1,
      addedFiles: 1,
      deletedFiles: 0,
      renamedFiles: 0,
      addedLines: 12,
      deletedLines: 3,
      binaryFilesChanged: 0,
      sensitiveFilesChanged: 2,
      packageManifestChanged: false,
      lockfileChanged: false,
      envExampleChanged: false,
      routeSurfaceChanged: false,
    };
    const state: ReadinessStateSummary = {
      state: readinessState,
      confidence,
      internalScore: 8,
      headline: 'Production-sensitive areas changed.',
      recommendedAction: 'Review authentication and environment configuration.',
      topConcerns: ['Authentication changed.', 'A sensitive value was redacted.'],
      safeLookingAreas: ['No dependencies changed.'],
    };
    const snapshot: ReadinessSnapshot = {
      schemaVersion: 'b2g.prs.snapshot.v1',
      generatedAt: '2026-07-07T00:00:00.000Z',
      repository,
      base,
      candidate,
      comparison,
      state,
      categories: [category],
      signals: [signal],
      trends: [trend],
      outputs,
      limitations: [partialDataNotice.message],
    };

    expect(snapshot).toMatchObject({
      schemaVersion: 'b2g.prs.snapshot.v1',
      state: {
        state: 'yellow',
        confidence: 'medium',
      },
      signals: [
        {
          category: 'identity_access',
          deterministic: true,
        },
      ],
    });
    expect(snapshot.outputs).toEqual(outputs);
    expect(snapshot.trends).toEqual([trend]);
    expect(partialDataNotice).toMatchObject({
      source: 'history',
      confidenceImpact: 'medium',
    });
  });

  it('golden snapshot fixture loading is deterministic', () => {
    const firstLoad: PrsFixture = loadPrsFixture('auth-env-change');
    const secondLoad: PrsFixture = loadPrsFixture('auth-env-change');

    expect(firstLoad).toEqual(secondLoad);
    expect(firstLoad).not.toBe(secondLoad);
    expect(firstLoad.files).not.toBe(secondLoad.files);
    expect(firstLoad.goldenSnapshot).toEqual(secondLoad.goldenSnapshot);

    const goldenSnapshot = firstLoad.goldenSnapshot;
    expect(goldenSnapshot).toBeDefined();

    const fixturePaths = new Set(firstLoad.files.map((file) => file.path));
    for (const category of goldenSnapshot?.categories ?? []) {
      const categorySignals = goldenSnapshot?.signals.filter(
        (signal) => signal.category === category.category
      );

      expect(category.signalCount).toBe(categorySignals?.length);
      for (const evidence of category.evidence) {
        if (evidence.path) {
          expect(fixturePaths.has(evidence.path)).toBe(true);
        }
      }
    }

    expect(goldenSnapshot?.comparison.envExampleChanged).toBe(fixturePaths.has('.env.example'));
    expect(JSON.stringify(goldenSnapshot)).toContain('[REDACTED]');
    expect(JSON.stringify(goldenSnapshot)).not.toContain('sk_live_');
  });

  it('redaction helpers hide secret values while preserving evidence names and paths', () => {
    const evidence = {
      kind: 'env_var',
      label: 'STRIPE_SECRET_KEY',
      path: '.env',
      before: 'sk_live_before-secret-value',
      after: 'sk_live_after-secret-value',
    } as const;

    expect(redactSensitiveValue(evidence.after)).toBe('[REDACTED]');
    expect(redactEvidenceRef(evidence)).toEqual({
      ...evidence,
      before: '[REDACTED]',
      after: '[REDACTED]',
      redacted: true,
    });
    expect(JSON.stringify(redactEvidenceRef(evidence))).not.toContain('secret-value');
  });
});
