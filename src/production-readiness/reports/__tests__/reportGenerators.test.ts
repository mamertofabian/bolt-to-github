import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ReadinessSnapshot } from '../../domain';
import { loadPrsFixture } from '../../test-fixtures/prsFixtures';
import {
  generateAdcFixHandoffMarkdown,
  generateExportReceiptMarkdown,
  sanitizeMarkdownEvidence,
  type AdcFixHandoffOptions,
} from '../reportGenerators';

const UiOnlyReceiptGoldenMarkdown = 'ui-only.receipt.md';
const AuthEnvChangeReceiptGoldenMarkdown = 'auth-env-change.receipt.md';
const SecretFileHandoffGoldenMarkdown = 'secret-file.handoff.md';

const DEFAULT_HANDOFF_OPTIONS: AdcFixHandoffOptions = {
  includeCompareUrl: false,
  includeHistory: false,
  includeAdcFixLink: false,
  redactPathNames: false,
};

function readGolden(name: string): string {
  return readFileSync(resolve(process.cwd(), 'test/golden/prs', name), 'utf8');
}

function authEnvSnapshot(): ReadinessSnapshot {
  const snapshot = loadPrsFixture('auth-env-change').goldenSnapshot;
  if (!snapshot) {
    throw new Error('The auth-env-change fixture must include a golden snapshot.');
  }
  return snapshot;
}

function uiOnlySnapshot(): ReadinessSnapshot {
  return {
    schemaVersion: 'b2g.prs.snapshot.v1',
    generatedAt: '2026-07-07T01:00:00.000Z',
    repository: { owner: 'codefrost-dev', name: 'ui-only-project' },
    base: { ref: 'refs/heads/main', sha: 'ui-base-sha' },
    candidate: {
      id: 'ui-only',
      label: 'UI-only export',
      zipSizeBytes: 2_048,
      generatedFrom: 'bolt-export-zip',
    },
    comparison: {
      changedFiles: 2,
      addedFiles: 1,
      deletedFiles: 0,
      renamedFiles: 0,
      addedLines: 24,
      deletedLines: 3,
      binaryFilesChanged: 0,
      sensitiveFilesChanged: 0,
      packageManifestChanged: false,
      lockfileChanged: false,
      envExampleChanged: false,
      routeSurfaceChanged: false,
    },
    state: {
      state: 'green',
      confidence: 'high',
      internalScore: 0,
      headline: 'No high-priority readiness concerns detected.',
      recommendedAction: 'Continue with normal review before deploying.',
      topConcerns: [],
      safeLookingAreas: [
        'No sensitive file changes detected.',
        'No dependency manifest changes detected.',
      ],
    },
    categories: [],
    signals: [],
    outputs: {},
    limitations: [],
  };
}

function secretFileSnapshot(): ReadinessSnapshot {
  const snapshot = structuredClone(authEnvSnapshot());
  snapshot.base.compareUrl =
    'https://github.com/codefrost-dev/sample-bolt-project/compare/base-sha...candidate-sha';
  snapshot.state = {
    state: 'red',
    confidence: 'high',
    internalScore: 13,
    headline: 'Deeper production readiness review recommended.',
    recommendedAction: 'Resolve or review critical concerns before deploying.',
    topConcerns: ['Committed environment file detected.', 'Authentication code changed.'],
    safeLookingAreas: ['No dependency manifest changes detected.'],
  };
  snapshot.signals = [
    {
      id: 'committed-environment-file',
      category: 'secrets_config',
      severity: 'critical',
      title: 'Committed environment file detected',
      message: 'Review the environment file and rotate exposed credentials if needed.',
      evidence: [
        {
          kind: 'pattern',
          label: 'Credential assignment',
          path: '.env.production',
          before: 'sk_live_before-report-secret',
          after: 'sk_live_after-report-secret',
        },
      ],
      suggestedReview: 'Review environment and secret handling.',
      deterministic: true,
    },
    {
      ...snapshot.signals[0],
      suggestedReview: 'Verify authentication and session boundaries.',
    },
  ];
  snapshot.categories = [
    {
      category: 'identity_access',
      signalCount: 1,
      highestSeverity: 'high',
      evidence: snapshot.signals[1].evidence,
    },
    {
      category: 'secrets_config',
      signalCount: 1,
      highestSeverity: 'critical',
      evidence: snapshot.signals[0].evidence,
    },
  ];
  snapshot.trends = [
    {
      id: 'secret-history',
      label: 'Environment configuration changed in recent exports.',
      evidence: [
        {
          kind: 'commit',
          label: 'Previous environment update',
          path: '.env.production',
          after: 'sk_live_history-report-secret',
        },
      ],
    },
  ];
  return snapshot;
}

describe('Production Readiness Snapshot report generators', () => {
  it('generateExportReceiptMarkdown matches the Yellow golden receipt', () => {
    expect(generateExportReceiptMarkdown(authEnvSnapshot())).toBe(
      readGolden(AuthEnvChangeReceiptGoldenMarkdown)
    );
    expect(generateExportReceiptMarkdown(uiOnlySnapshot())).toBe(
      readGolden(UiOnlyReceiptGoldenMarkdown)
    );
  });

  it('generateAdcFixHandoffMarkdown matches the Red golden handoff', () => {
    expect(
      generateAdcFixHandoffMarkdown(secretFileSnapshot(), {
        includeCompareUrl: true,
        includeHistory: true,
        includeAdcFixLink: false,
        redactPathNames: false,
      })
    ).toBe(readGolden(SecretFileHandoffGoldenMarkdown));
  });

  it('reports include limitations for partial snapshots', () => {
    const partial = authEnvSnapshot();

    const receipt = generateExportReceiptMarkdown(partial);
    const handoff = generateAdcFixHandoffMarkdown(partial, DEFAULT_HANDOFF_OPTIONS);

    for (const report of [receipt, handoff]) {
      expect(report).toContain('## Limitations');
      expect(report).toContain('- Historical comparison was unavailable.');
      expect(report).toContain('static');
      expect(report).toContain('does not');
    }
  });

  it('reports never expose secret-looking values', () => {
    const snapshot = secretFileSnapshot();
    const original = structuredClone(snapshot);

    const sanitized = sanitizeMarkdownEvidence(snapshot);
    const receipt = generateExportReceiptMarkdown(snapshot);
    const handoff = generateAdcFixHandoffMarkdown(snapshot, {
      includeCompareUrl: true,
      includeHistory: true,
      includeAdcFixLink: true,
      redactPathNames: false,
    });

    for (const output of [JSON.stringify(sanitized), receipt, handoff]) {
      expect(output).not.toContain('sk_live_before-report-secret');
      expect(output).not.toContain('sk_live_after-report-secret');
      expect(output).not.toContain('sk_live_history-report-secret');
    }
    expect(JSON.stringify(sanitized)).toContain('[REDACTED]');
    expect(snapshot).toEqual(original);
  });

  it('handoff language is helpful and non coercive', () => {
    const privacySnapshot = secretFileSnapshot();
    const privatePath = 'private/config/pnpm-lock.yaml';
    privacySnapshot.signals[0].evidence[0] = {
      ...privacySnapshot.signals[0].evidence[0],
      label: privatePath,
      path: privatePath,
    };
    if (privacySnapshot.trends) {
      privacySnapshot.trends[0].label = `${privatePath} changed in recent exports.`;
      privacySnapshot.trends[0].evidence[0] = {
        ...privacySnapshot.trends[0].evidence[0],
        label: `Previous update to ${privatePath}`,
        path: privatePath,
      };
    }

    const handoff = generateAdcFixHandoffMarkdown(privacySnapshot, {
      includeCompareUrl: false,
      includeHistory: true,
      includeAdcFixLink: true,
      redactPathNames: true,
    });

    expect(handoff).toContain('Suggested ADC Fix review areas');
    expect(handoff).toContain('ADC Fix is optional');
    expect(handoff).toContain('https://fix.aidrivencoder.com');
    expect(handoff).toContain('[path redacted]');
    expect(handoff).not.toContain('.env.production');
    expect(handoff).not.toContain(privatePath);
    expect(handoff).not.toMatch(/ADC Fix is required|your app is broken|not production ready/i);

    const backtickSnapshot = secretFileSnapshot();
    backtickSnapshot.signals[0].evidence[0].path = 'src/filename`';
    const markdownWithBacktickPath = generateAdcFixHandoffMarkdown(backtickSnapshot, {
      ...DEFAULT_HANDOFF_OPTIONS,
      redactPathNames: false,
    });
    expect(markdownWithBacktickPath).toContain('(`` src/filename` ``)');
  });
});
