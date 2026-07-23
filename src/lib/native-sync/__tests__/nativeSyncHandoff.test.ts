import { describe, it, expect } from 'vitest';
import {
  matchPendingImport,
  buildPendingHandoffRecord,
  parseStoredHandoff,
} from '../nativeSyncHandoff';
import type {
  NativeSyncHandoffStatus,
  NativeSyncHandoffMatchStatus,
  NativeSyncHandoffParseStatus,
  TempImportSummary,
  NativeSyncHandoffRecord,
  NativeSyncHandoffMatch,
  NativeSyncHandoffParseResult,
} from '../nativeSyncHandoff';

const anImport = (over: Partial<TempImportSummary> = {}): TempImportSummary => ({
  originalRepo: 'my-private-repo',
  tempRepo: 'temp-abc123',
  owner: 'octocat',
  branch: 'main',
  ...over,
});

describe('nativeSyncHandoff domain', () => {
  it('matchPendingImport returns matched for exactly one pending import', () => {
    const match: NativeSyncHandoffMatch = matchPendingImport([anImport()]);

    const status: NativeSyncHandoffMatchStatus = match.status;
    expect(status).toBe('matched');
    expect(match.matchedImport?.originalRepo).toBe('my-private-repo');
  });

  it('matchPendingImport returns none for zero pending imports', () => {
    const match = matchPendingImport([]);

    expect(match.status).toBe('none');
    expect(match.matchedImport).toBeNull();
  });

  it('matchPendingImport returns ambiguous for more than one pending import', () => {
    const match = matchPendingImport([anImport({ tempRepo: 't1' }), anImport({ tempRepo: 't2' })]);

    expect(match.status).toBe('ambiguous');
    // Never guess which import belongs to the completed project.
    expect(match.matchedImport).toBeNull();
  });

  it('buildPendingHandoffRecord captures original repo and marks status pending', () => {
    const record: NativeSyncHandoffRecord = buildPendingHandoffRecord(
      anImport(),
      'final-project-1',
      1000
    );

    const status: NativeSyncHandoffStatus = record.status;
    expect(status).toBe('pending');
    expect(record.projectId).toBe('final-project-1');
    expect(record.originalRepo).toBe('my-private-repo');
    expect(record.tempRepo).toBe('temp-abc123');
    expect(record.owner).toBe('octocat');
    expect(record.branch).toBe('main');
    expect(record.createdAt).toBe(1000);
    expect(record.updatedAt).toBe(1000);
    expect(record.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it('parseStoredHandoff migrates a legacy record deterministically', () => {
    const legacy = {
      projectId: 'final-project-1',
      originalRepo: 'my-private-repo',
      tempRepo: 'temp-abc123',
      owner: 'octocat',
      branch: 'main',
      status: 'pending',
      createdAt: 10,
      updatedAt: 10,
    };

    const first: NativeSyncHandoffParseResult = parseStoredHandoff('final-project-1', legacy);
    const second = parseStoredHandoff('final-project-1', legacy);

    const status: NativeSyncHandoffParseStatus = first.status;
    expect(status).toBe('migrated');
    expect(first.record?.originalRepo).toBe('my-private-repo');
    expect(first.record?.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(second.record).toEqual(first.record);
  });

  it('parseStoredHandoff re-parses a migrated record as valid', () => {
    const legacy = {
      projectId: 'final-project-1',
      originalRepo: 'my-private-repo',
      tempRepo: 'temp-abc123',
      owner: 'octocat',
      branch: 'main',
      status: 'pending',
      createdAt: 10,
      updatedAt: 10,
    };

    const migrated = parseStoredHandoff('final-project-1', legacy)
      .record as NativeSyncHandoffRecord;
    const revalidated = parseStoredHandoff('final-project-1', migrated);

    expect(revalidated.status).toBe('valid');
    expect(revalidated.record).toEqual(migrated);
  });

  it('parseStoredHandoff reports malformed when a required field is missing', () => {
    const result = parseStoredHandoff('final-project-1', {
      projectId: 'final-project-1',
      tempRepo: 'temp-abc123',
      owner: 'octocat',
      branch: 'main',
      status: 'pending',
      // originalRepo intentionally omitted
    });

    expect(result.status).toBe('malformed');
    expect(result.record).toBeNull();
    expect(typeof result.reason).toBe('string');
  });

  it('parseStoredHandoff reports malformed input without throwing', () => {
    let result: NativeSyncHandoffParseResult | undefined;
    expect(() => {
      result = parseStoredHandoff('final-project-1', {
        projectId: 'final-project-1',
        status: 'bogus',
      });
    }).not.toThrow();

    expect(result?.status).toBe('malformed');
    expect(result?.record).toBeNull();
    expect(typeof result?.reason).toBe('string');
  });
});
