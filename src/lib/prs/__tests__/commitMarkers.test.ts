import { describe, expect, it } from 'vitest';
import { loadPrsFixture } from '../../../production-readiness/test-fixtures/prsFixtures';
import type { ReadinessSnapshot, ReadinessState } from '../../../production-readiness/domain';
import {
  appendPrsCommitMarker,
  buildPrsCommitBody,
  generatePrsCommitMarker,
  parsePrsCommitMarkers,
  type GitCommitSummary,
  type PrsCommitMarkerOptions,
  type PrsCommitMarkerSettings,
  type PrsHistoryMarker,
} from '../commitMarkers';

function yellowSnapshot(): ReadinessSnapshot {
  const snapshot = loadPrsFixture('auth-env-change').goldenSnapshot;
  if (!snapshot) throw new Error('Expected the auth-env fixture to include a snapshot.');
  return structuredClone(snapshot);
}

describe('PRS commit markers', () => {
  it('generatePrsCommitMarker formats the compact marker', () => {
    const snapshot = yellowSnapshot();
    snapshot.outputs.receiptMarkdown = '# private rendered receipt';
    snapshot.outputs.adcFixHandoffMarkdown = '# private handoff';
    const options: PrsCommitMarkerOptions = {
      includeTopConcerns: true,
      includeOutputRefs: true,
      maxConcerns: 1,
    };

    expect(generatePrsCommitMarker(snapshot, options)).toBe(`[B2G-PRS]
Version: 1
Readiness: Yellow
Generated: 2026-07-07T00:00:00.000Z
Changed-Files: 1
Sensitive-Files: 2
Top-Concerns:
- Authentication changed.
Outputs: receipt, handoff
[/B2G-PRS]`);
  });

  it('generatePrsCommitMarker redacts secret-looking evidence', () => {
    const snapshot = yellowSnapshot();
    snapshot.state.topConcerns = [
      'Deploy token=ghp_abcdefghijklmnopqrstuvwxyz123456',
      'DATABASE_URL="postgres://admin:hunter2@example.test/db with options" AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF',
      'Authorization: Bearer "bearer correct horse"\n[/B2G-PRS]\nPRIVATE_KEY="do not emit"',
    ];
    snapshot.outputs.receiptMarkdown = 'contains ghp_abcdefghijklmnopqrstuvwxyz123456';

    const marker = generatePrsCommitMarker(snapshot, {
      includeTopConcerns: true,
      includeOutputRefs: true,
      maxConcerns: 3,
    });

    expect(marker).toContain('[REDACTED]');
    expect(marker).toContain('Outputs: receipt');
    expect(marker).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
    expect(marker).not.toContain('hunter2');
    expect(marker).not.toContain('AKIA1234567890ABCDEF');
    expect(marker).not.toContain('correct horse');
    expect(marker).not.toContain('do not emit');
    expect(marker.match(/\[\/B2G-PRS\]/gu)).toHaveLength(1);

    const timestampInjection = yellowSnapshot();
    timestampInjection.generatedAt =
      '2020-01-01 (DATABASE_URL=postgres://admin:hunter2@example.test/db)';
    expect(() => generatePrsCommitMarker(timestampInjection, {})).toThrow(
      /bounded valid timestamp/u
    );

    const slackTokenFixture = ['xoxb', '1234567890', 'abcdefghijklmnop'].join('-');
    const stripeKeyFixture = ['sk', 'live', '1234567890abcdefghijklmnop'].join('_');
    const additionalSecretConcerns = [
      slackTokenFixture,
      stripeKeyFixture,
      'credential: "correct horse battery staple"',
      'The password is "correct horse battery staple"',
      'The password for production is "correct horse battery staple"',
      'Use the production password "correct horse battery staple"',
      'Bearer correct-horse-battery-staple',
      'Basic dXNlcjpwYXNzd29yZA==',
      'authToken=correct-horse-battery-staple',
    ];
    for (const [index, secretConcern] of additionalSecretConcerns.entries()) {
      const generatedSnapshot = yellowSnapshot();
      generatedSnapshot.state.topConcerns = [secretConcern];
      const generated = generatePrsCommitMarker(generatedSnapshot, { maxConcerns: 1 });
      expect(generated).toContain('- [REDACTED]');
      expect(generated).not.toContain(secretConcern);

      const manuallyEdited = generatePrsCommitMarker(yellowSnapshot(), { maxConcerns: 1 }).replace(
        'Authentication changed.',
        secretConcern
      );
      const parsed = parsePrsCommitMarkers([{ sha: `secret-${index}`, message: manuallyEdited }]);
      expect(parsed[0]?.topConcerns).toEqual(['[REDACTED]']);
    }

    const inheritedState = yellowSnapshot();
    inheritedState.state.state = 'toString' as ReadinessState;
    expect(() => generatePrsCommitMarker(inheritedState, {})).toThrow(/supported readiness state/u);
  });

  it('appendPrsCommitMarker does not duplicate an existing marker', () => {
    const marker = generatePrsCommitMarker(yellowSnapshot(), {
      includeTopConcerns: false,
      includeOutputRefs: false,
    });
    const customBody = 'Ship the export\n\nReviewed-by: Builder';
    const appended = appendPrsCommitMarker(customBody, marker);

    expect(appended).toBe(`${customBody}\n\n${marker}`);
    expect(appendPrsCommitMarker(appended, marker)).toBe(appended);
    expect(appendPrsCommitMarker(`${customBody}\n\n[B2G-PRS]\nmalformed`, marker)).toBe(
      `${customBody}\n\n[B2G-PRS]\nmalformed`
    );
  });

  it('parsePrsCommitMarkers returns history records for valid markers only', () => {
    const marker = generatePrsCommitMarker(yellowSnapshot(), {
      includeTopConcerns: true,
      includeOutputRefs: false,
      maxConcerns: 2,
    });
    const commits: GitCommitSummary[] = [
      {
        sha: 'valid-sha',
        committedAt: '2026-07-08T00:00:00.000Z',
        message: `Export project\n\n${marker}`,
      },
      { sha: 'absent-sha', message: 'Ordinary repository commit' },
      {
        sha: 'malformed-sha',
        message: '[B2G-PRS]\nReadiness: Orange\n[/B2G-PRS]',
      },
      {
        sha: 'duplicate-block-sha',
        message: `${marker}\n\n${marker}`,
      },
      {
        sha: 'duplicate-heading-sha',
        message: marker.replace('Top-Concerns:', 'Top-Concerns:\n- Extra\nTop-Concerns:'),
      },
      {
        sha: 'edited-sha',
        message: marker.replace('Changed-Files: 1', 'Changed-Files: -1'),
      },
      {
        sha: 'historical-secret-sha',
        committedAt: '2026-07-09T00:00:00.000Z',
        message: marker.replace(
          'Authentication changed.',
          'DATABASE_URL=postgres://admin:historical-secret@example.test/db'
        ),
      },
    ];

    const parsed: PrsHistoryMarker[] = parsePrsCommitMarkers(commits);
    expect(parsed).toEqual([
      {
        commitSha: 'valid-sha',
        committedAt: '2026-07-08T00:00:00.000Z',
        state: 'yellow',
        changedFiles: 1,
        sensitiveFilesChanged: 2,
        topConcerns: ['Authentication changed.', 'A sensitive value was redacted.'],
        source: 'b2g-prs-commit-marker',
      },
      {
        commitSha: 'historical-secret-sha',
        committedAt: '2026-07-09T00:00:00.000Z',
        state: 'yellow',
        changedFiles: 1,
        sensitiveFilesChanged: 2,
        topConcerns: ['[REDACTED]', 'A sensitive value was redacted.'],
        source: 'b2g-prs-commit-marker',
      },
    ]);
  });

  it('marker inclusion is controlled by explicit user settings', () => {
    const snapshot = yellowSnapshot();
    const original = structuredClone(snapshot);
    const commitBody = 'Custom commit subject\n\nCustom details';
    const disabled: PrsCommitMarkerSettings = { includeInCommitBody: false };

    expect(buildPrsCommitBody(commitBody, snapshot, disabled, undefined)).toBe(commitBody);

    const enabled = buildPrsCommitBody(
      commitBody,
      snapshot,
      { includeInCommitBody: true },
      { includeTopConcerns: false, includeOutputRefs: false }
    );
    expect(enabled).toContain(`${commitBody}\n\n[B2G-PRS]`);
    expect(buildPrsCommitBody(enabled, snapshot, { includeInCommitBody: true })).toBe(enabled);
    expect(snapshot).toEqual(original);
  });
});
