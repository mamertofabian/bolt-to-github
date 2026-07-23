import { describe, it, expect } from 'vitest';
import {
  buildPendingHandoffRecord,
  applySelection,
  applyCompletion,
  parseStoredHandoff,
} from '../nativeSyncHandoff';
import type {
  TempImportSummary,
  NativeSyncHandoffParseResult,
  NativeSyncAdoptionState,
  NativeSyncAdoptionStatus,
} from '../nativeSyncHandoff';

const anImport = (over: Partial<TempImportSummary> = {}): TempImportSummary => ({
  originalRepo: 'my-private-repo',
  tempRepo: 'temp-abc123',
  owner: 'octocat',
  branch: 'main',
  ...over,
});

describe('native-sync handoff adoption sub-state', () => {
  it('buildPendingHandoffRecord leaves adoption unset for a fresh pending record', () => {
    const record = buildPendingHandoffRecord(anImport(), 'final-project-1', 1000);

    // A fresh record explicitly carries a null adoption sub-state (not adopted yet).
    expect(record).toHaveProperty('adoption', null);
    expect(record.status).toBe('pending');
  });

  it('applySelection records a selected adoption state with the chosen repo and branch', () => {
    const base = buildPendingHandoffRecord(anImport(), 'final-project-1', 1000);

    const selected = applySelection(base, 'bolt-created', 'main', 2000);

    const adoption: NativeSyncAdoptionState = selected.adoption!;
    const status: NativeSyncAdoptionStatus = adoption.status;
    expect(status).toBe('selected');
    expect(adoption.selectedRepo).toBe('bolt-created');
    expect(adoption.selectedBranch).toBe('main');
    expect(adoption.completedAt).toBeNull();
    expect(selected.updatedAt).toBe(2000);
  });

  it('applySelection is locked once the record is completed', () => {
    const base = buildPendingHandoffRecord(anImport(), 'final-project-1', 1000);
    const completed = applyCompletion(applySelection(base, 'bolt-created', 'main', 2000), 3000);

    const attemptedChange = applySelection(completed, 'other-repo', 'dev', 4000);

    expect(attemptedChange).toEqual(completed);
  });

  it('applyCompletion transitions a selected record to completed with completedAt set', () => {
    const base = buildPendingHandoffRecord(anImport(), 'final-project-1', 1000);
    const selected = applySelection(base, 'bolt-created', 'main', 2000);

    const completed = applyCompletion(selected, 3000);

    expect(completed.adoption?.status).toBe('completed');
    expect(completed.adoption?.completedAt).toBe(3000);
    expect(completed.updatedAt).toBe(3000);
  });

  it('applyCompletion is a no-op when there is no selection', () => {
    const base = buildPendingHandoffRecord(anImport(), 'final-project-1', 1000);

    const result = applyCompletion(base, 3000);

    expect(result).toEqual(base);
  });

  it('parseStoredHandoff round-trips an adoption sub-state as valid', () => {
    const base = buildPendingHandoffRecord(anImport(), 'final-project-1', 1000);
    const completed = applyCompletion(applySelection(base, 'bolt-created', 'main', 2000), 3000);

    const parsed: NativeSyncHandoffParseResult = parseStoredHandoff('final-project-1', completed);

    expect(parsed.status).toBe('valid');
    expect(parsed.record).toEqual(completed);
    expect(parsed.record?.adoption?.selectedRepo).toBe('bolt-created');
    expect(parsed.record?.adoption?.completedAt).toBe(3000);
  });

  it('parseStoredHandoff migrates a legacy record by initializing adoption to null', () => {
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

    const parsed = parseStoredHandoff('final-project-1', legacy);

    expect(parsed.status).toBe('migrated');
    // Migration explicitly initializes the adoption sub-state to null.
    expect(parsed.record).toHaveProperty('adoption', null);
  });

  it('parseStoredHandoff reports malformed for an invalid adoption sub-state', () => {
    const bad = {
      schemaVersion: 2,
      projectId: 'final-project-1',
      originalRepo: 'my-private-repo',
      tempRepo: 'temp-abc123',
      owner: 'octocat',
      branch: 'main',
      status: 'pending',
      createdAt: 10,
      updatedAt: 10,
      adoption: { status: 'bogus' },
    };

    const result: NativeSyncHandoffParseResult = parseStoredHandoff('final-project-1', bad);

    expect(result.status).toBe('malformed');
    expect(result.record).toBeNull();
    expect(typeof result.reason).toBe('string');
  });
});
