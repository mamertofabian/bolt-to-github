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
import { loadPrsFixture, type FixtureFile, type PrsFixture } from '../test-fixtures/prsFixtures';

const EXPECTED_GENERATED_AT = '2026-07-06T21:00:00.000Z';

function createSnapshot(): ReadinessSnapshot {
  return {
    schemaVersion: 'b2g.prs.snapshot.v1',
    generatedAt: EXPECTED_GENERATED_AT,
    repository: { owner: 'codefrost', name: 'ui-project' },
    base: {
      ref: 'main',
      sha: 'abc123',
      compareUrl: 'https://github.com/codefrost/ui-project/compare/abc123',
    },
    candidate: {
      id: 'bolt-export-ui-only-001',
      label: 'UI-only export',
      zipSizeBytes: 512,
      generatedFrom: 'bolt-export-zip',
    },
    comparison: {
      changedFiles: 1,
      addedFiles: 0,
      deletedFiles: 0,
      binaryFilesChanged: 0,
      sensitiveFilesChanged: 0,
      packageManifestChanged: false,
      lockfileChanged: false,
      envExampleChanged: false,
      routeSurfaceChanged: false,
    },
    state: {
      state: 'green',
      confidence: 'medium',
      internalScore: 0,
      headline: 'Mostly UI/content changes.',
      recommendedAction: 'Review the receipt and continue when ready.',
      topConcerns: [],
      safeLookingAreas: ['No obvious production-sensitive areas changed.'],
    },
    categories: [],
    signals: [],
    trends: [],
    outputs: {},
    limitations: ['Not enough export history yet to judge whether this change is unusual.'],
  } satisfies ReadinessSnapshot;
}

function createDomainContractExamples() {
  const readinessState: ReadinessState = 'yellow';
  const severity: SignalSeverity = 'high';
  const confidence: SnapshotConfidence = 'low';
  const categoryName: ReadinessCategory = 'secrets_config';
  const repository: RepositoryRef = { owner: 'codefrost', name: 'partial-project' };
  const base: GitRefSummary = { ref: 'main', sha: 'def456' };
  const candidate: CandidateExportSummary = {
    id: 'bolt-export-partial-001',
    label: 'Partial export',
    zipSizeBytes: 1024,
    generatedFrom: 'bolt-export-zip',
  };
  const evidence: EvidenceRef = {
    kind: 'env_var',
    label: 'PAYMENT_API_KEY',
    path: 'src/config/payment.ts',
    before: false,
    after: true,
    redacted: false,
  };
  const category: CategorySummary = {
    category: categoryName,
    signalCount: 1,
    highestSeverity: severity,
    evidence: [evidence],
  };
  const trend: TrendSummary = {
    id: 'first-export',
    label: 'No historical baseline yet',
    evidence: [{ kind: 'metric', label: 'historical exports', after: 0 }],
  };
  const outputs: SnapshotOutputRefs = {
    receiptMarkdown: '# Receipt',
    adcFixHandoffMarkdown: '# Handoff',
    debugJson: '{"schemaVersion":"b2g.prs.snapshot.v1"}',
    commitMarker: '[B2G-PRS][/B2G-PRS]',
  };
  const limitation: PartialDataNotice = {
    source: 'github_base',
    message: 'GitHub comparison was unavailable.',
    confidenceImpact: confidence,
  };
  const signal: ReadinessSignal = {
    id: 'env-reference-added',
    category: categoryName,
    severity,
    title: 'Environment configuration changed',
    message: 'Review production environment configuration before deploying.',
    evidence: [evidence],
    suggestedReview: 'Confirm the variable exists in the production environment.',
    deterministic: true,
  };
  const comparison: ComparisonSummary = {
    changedFiles: 3,
    addedFiles: 1,
    deletedFiles: 1,
    renamedFiles: 1,
    addedLines: 40,
    deletedLines: 12,
    binaryFilesChanged: 1,
    sensitiveFilesChanged: 1,
    packageManifestChanged: false,
    lockfileChanged: false,
    envExampleChanged: false,
    routeSurfaceChanged: false,
  };
  const state: ReadinessStateSummary = {
    state: readinessState,
    confidence,
    internalScore: 5,
    headline: 'Production-sensitive areas changed.',
    recommendedAction: 'Review before deploying.',
    topConcerns: [signal.title],
    safeLookingAreas: [],
  };
  const file: FixtureFile = {
    path: 'assets/logo.png',
    content: 'synthetic-binary-fixture',
    binary: true,
  };
  const fixture: PrsFixture = {
    name: 'domain-contract-examples',
    files: [file],
  };

  return {
    base,
    candidate,
    category,
    comparison,
    fixture,
    limitation,
    outputs,
    repository,
    signal,
    state,
    trend,
  };
}

describe('Production Readiness Snapshot domain foundation', () => {
  it('domain objects satisfy the expected snapshot schema', () => {
    const snapshot = createSnapshot();
    const contractExamples = createDomainContractExamples();

    expect(snapshot).toEqual({
      schemaVersion: 'b2g.prs.snapshot.v1',
      generatedAt: EXPECTED_GENERATED_AT,
      repository: { owner: 'codefrost', name: 'ui-project' },
      base: {
        ref: 'main',
        sha: 'abc123',
        compareUrl: 'https://github.com/codefrost/ui-project/compare/abc123',
      },
      candidate: {
        id: 'bolt-export-ui-only-001',
        label: 'UI-only export',
        zipSizeBytes: 512,
        generatedFrom: 'bolt-export-zip',
      },
      comparison: {
        changedFiles: 1,
        addedFiles: 0,
        deletedFiles: 0,
        binaryFilesChanged: 0,
        sensitiveFilesChanged: 0,
        packageManifestChanged: false,
        lockfileChanged: false,
        envExampleChanged: false,
        routeSurfaceChanged: false,
      },
      state: {
        state: 'green',
        confidence: 'medium',
        internalScore: 0,
        headline: 'Mostly UI/content changes.',
        recommendedAction: 'Review the receipt and continue when ready.',
        topConcerns: [],
        safeLookingAreas: ['No obvious production-sensitive areas changed.'],
      },
      categories: [],
      signals: [],
      trends: [],
      outputs: {},
      limitations: ['Not enough export history yet to judge whether this change is unusual.'],
    });
    expect(contractExamples).toEqual({
      base: { ref: 'main', sha: 'def456' },
      candidate: {
        id: 'bolt-export-partial-001',
        label: 'Partial export',
        zipSizeBytes: 1024,
        generatedFrom: 'bolt-export-zip',
      },
      category: {
        category: 'secrets_config',
        signalCount: 1,
        highestSeverity: 'high',
        evidence: [
          {
            kind: 'env_var',
            label: 'PAYMENT_API_KEY',
            path: 'src/config/payment.ts',
            before: false,
            after: true,
            redacted: false,
          },
        ],
      },
      comparison: {
        changedFiles: 3,
        addedFiles: 1,
        deletedFiles: 1,
        renamedFiles: 1,
        addedLines: 40,
        deletedLines: 12,
        binaryFilesChanged: 1,
        sensitiveFilesChanged: 1,
        packageManifestChanged: false,
        lockfileChanged: false,
        envExampleChanged: false,
        routeSurfaceChanged: false,
      },
      fixture: {
        name: 'domain-contract-examples',
        files: [{ path: 'assets/logo.png', content: 'synthetic-binary-fixture', binary: true }],
      },
      limitation: {
        source: 'github_base',
        message: 'GitHub comparison was unavailable.',
        confidenceImpact: 'low',
      },
      outputs: {
        receiptMarkdown: '# Receipt',
        adcFixHandoffMarkdown: '# Handoff',
        debugJson: '{"schemaVersion":"b2g.prs.snapshot.v1"}',
        commitMarker: '[B2G-PRS][/B2G-PRS]',
      },
      repository: { owner: 'codefrost', name: 'partial-project' },
      signal: {
        id: 'env-reference-added',
        category: 'secrets_config',
        severity: 'high',
        title: 'Environment configuration changed',
        message: 'Review production environment configuration before deploying.',
        evidence: [
          {
            kind: 'env_var',
            label: 'PAYMENT_API_KEY',
            path: 'src/config/payment.ts',
            before: false,
            after: true,
            redacted: false,
          },
        ],
        suggestedReview: 'Confirm the variable exists in the production environment.',
        deterministic: true,
      },
      state: {
        state: 'yellow',
        confidence: 'low',
        internalScore: 5,
        headline: 'Production-sensitive areas changed.',
        recommendedAction: 'Review before deploying.',
        topConcerns: ['Environment configuration changed'],
        safeLookingAreas: [],
      },
      trend: {
        id: 'first-export',
        label: 'No historical baseline yet',
        evidence: [{ kind: 'metric', label: 'historical exports', after: 0 }],
      },
    });
  });

  it('golden snapshot fixture loading is deterministic', () => {
    const first = loadPrsFixture('ui-only');
    const second = loadPrsFixture('ui-only');

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.files).not.toBe(second.files);
    expect(first.goldenSnapshot).toEqual(createSnapshot());

    first.files[0].content = 'mutated by a test';
    expect(loadPrsFixture('ui-only')).toEqual(second);
    expect(() => loadPrsFixture('missing-fixture')).toThrowError(
      'Unknown PRS fixture: missing-fixture'
    );
    for (const inheritedName of ['__proto__', 'constructor', 'toString']) {
      expect(() => loadPrsFixture(inheritedName)).toThrowError(
        `Unknown PRS fixture: ${inheritedName}`
      );
    }
  });

  it('redaction helpers hide secret values while preserving evidence names and paths', () => {
    const secretValue = ['sk', 'live', 'fixture', 'secret'].join('_');
    const evidence: EvidenceRef = {
      kind: 'env_var',
      label: 'PAYMENT_API_KEY',
      path: 'src/config/payment.ts',
      before: 'previous-sensitive-value',
      after: secretValue,
    };

    const redactedEvidence = redactEvidenceRef(evidence);

    expect(redactSensitiveValue(secretValue)).toBe('[REDACTED]');
    expect(redactedEvidence).toEqual({
      kind: 'env_var',
      label: 'PAYMENT_API_KEY',
      path: 'src/config/payment.ts',
      before: '[REDACTED]',
      after: '[REDACTED]',
      redacted: true,
    });
    expect(JSON.stringify(redactedEvidence)).not.toContain(secretValue);
    expect(JSON.stringify(redactedEvidence)).not.toContain('previous-sensitive-value');
    expect(evidence).not.toHaveProperty('redacted');
    expect(evidence.after).toBe(secretValue);

    let beforeReads = 0;
    let afterReads = 0;
    const accessorEvidence: EvidenceRef = {
      kind: 'pattern',
      label: 'one-shot secret evidence',
      get before() {
        beforeReads += 1;
        return beforeReads === 1 ? 'raw-before-secret' : undefined;
      },
      get after() {
        afterReads += 1;
        return afterReads === 1 ? 'raw-after-secret' : undefined;
      },
    };

    const redactedAccessorEvidence = redactEvidenceRef(accessorEvidence);

    expect(redactedAccessorEvidence.before).toBe('[REDACTED]');
    expect(redactedAccessorEvidence.after).toBe('[REDACTED]');
    expect(JSON.stringify(redactedAccessorEvidence)).not.toMatch(/raw-(?:before|after)-secret/);
    expect({ beforeReads, afterReads }).toEqual({ beforeReads: 1, afterReads: 1 });
  });
});
