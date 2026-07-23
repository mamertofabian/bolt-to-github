import { describe, it, expect } from 'vitest';
import {
  applyImportProvenance,
  evaluateJourneyStart,
  parseStoredJourney,
} from '../nativeSyncJourney';
import type {
  NativeSyncJourneyKind,
  NativeSyncProvenance,
  NativeSyncJourneyParseStatus,
  NativeSyncJourneyDenyReason,
  NativeSyncJourneyRecord,
  NativeSyncJourneyDecision,
  NativeSyncJourneyParseResult,
} from '../nativeSyncJourney';

describe('nativeSyncJourney domain', () => {
  it('applyImportProvenance creates a current-version private_import record when none exists', () => {
    const record: NativeSyncJourneyRecord = applyImportProvenance(null, 'project-1', 1000);

    const provenance: NativeSyncProvenance = record.provenance;
    expect(provenance).toBe('private_import');
    expect(record.projectId).toBe('project-1');
    expect(record.activeJourney).toBeNull();
    expect(record.createdAt).toBe(1000);
    expect(record.updatedAt).toBe(1000);
    expect(typeof record.schemaVersion).toBe('number');
    expect(record.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it('applyImportProvenance is idempotent and preserves an existing active journey', () => {
    const activeKind: NativeSyncJourneyKind = 'private_import_handoff';
    const existing: NativeSyncJourneyRecord = {
      schemaVersion: 1,
      projectId: 'project-1',
      provenance: 'private_import',
      activeJourney: activeKind,
      createdAt: 500,
      updatedAt: 500,
    };

    const first = applyImportProvenance(existing, 'project-1', 1500);
    const second = applyImportProvenance(first, 'project-1', 2500);

    expect(second.provenance).toBe('private_import');
    // Existing active journey and original creation time survive re-recording.
    expect(second.activeJourney).toBe('private_import_handoff');
    expect(second.createdAt).toBe(500);
  });

  it('evaluateJourneyStart refuses existing_project_migration for private_import provenance', () => {
    const imported = applyImportProvenance(null, 'project-1', 1000);

    const decision: NativeSyncJourneyDecision = evaluateJourneyStart(
      imported,
      'project-1',
      'existing_project_migration',
      2000
    );

    const reason: NativeSyncJourneyDenyReason | null = decision.reason;
    expect(decision.allowed).toBe(false);
    expect(reason).toBe('private_import_provenance');
    expect(decision.record).toBeNull();
  });

  it('evaluateJourneyStart refuses private_import_handoff without private_import provenance', () => {
    const decision = evaluateJourneyStart(null, 'project-1', 'private_import_handoff', 2000);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('requires_private_import_provenance');
    expect(decision.record).toBeNull();
  });

  it('evaluateJourneyStart allows existing_project_migration for a clean project', () => {
    const decision = evaluateJourneyStart(null, 'project-1', 'existing_project_migration', 3000);

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeNull();
    const record = decision.record as NativeSyncJourneyRecord;
    expect(record.activeJourney).toBe('existing_project_migration');
    expect(record.provenance).toBe('none');
  });

  it('evaluateJourneyStart refuses a second, different active journey', () => {
    const imported = applyImportProvenance(null, 'project-1', 1000);
    const started = evaluateJourneyStart(imported, 'project-1', 'private_import_handoff', 1100);
    expect(started.allowed).toBe(true);
    const activeRecord = started.record as NativeSyncJourneyRecord;

    const decision = evaluateJourneyStart(
      activeRecord,
      'project-1',
      'existing_project_migration',
      1200
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('another_active_journey');
  });

  it('evaluateJourneyStart is idempotent for the same active journey kind', () => {
    const imported = applyImportProvenance(null, 'project-1', 1000);
    const started = evaluateJourneyStart(imported, 'project-1', 'private_import_handoff', 1100);
    const activeRecord = started.record as NativeSyncJourneyRecord;

    const decision = evaluateJourneyStart(
      activeRecord,
      'project-1',
      'private_import_handoff',
      1300
    );

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeNull();
    expect((decision.record as NativeSyncJourneyRecord).activeJourney).toBe(
      'private_import_handoff'
    );
  });

  it('parseStoredJourney migrates a legacy record deterministically', () => {
    const legacy = {
      projectId: 'project-1',
      provenance: 'private_import',
      activeJourney: null,
      createdAt: 10,
      updatedAt: 10,
    };

    const first: NativeSyncJourneyParseResult = parseStoredJourney('project-1', legacy);
    const second = parseStoredJourney('project-1', legacy);

    const status: NativeSyncJourneyParseStatus = first.status;
    expect(status).toBe('migrated');
    const migrated = first.record as NativeSyncJourneyRecord;
    expect(migrated.provenance).toBe('private_import');
    expect(typeof migrated.schemaVersion).toBe('number');
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(1);
    // Deterministic: same input yields the same normalized output.
    expect(second.record).toEqual(first.record);
  });

  it('parseStoredJourney re-parses a migrated record as valid', () => {
    const legacy = {
      projectId: 'project-1',
      provenance: 'private_import',
      activeJourney: null,
      createdAt: 10,
      updatedAt: 10,
    };

    const migrated = parseStoredJourney('project-1', legacy).record as NativeSyncJourneyRecord;
    const revalidated = parseStoredJourney('project-1', migrated);

    // Migration output must itself be a current, valid record (not re-migrated).
    expect(revalidated.status).toBe('valid');
    expect(revalidated.record).toEqual(migrated);
  });

  it('parseStoredJourney reports malformed input without throwing', () => {
    let result: NativeSyncJourneyParseResult | undefined;
    expect(() => {
      result = parseStoredJourney('project-1', { projectId: 'project-1', provenance: 'bogus' });
    }).not.toThrow();

    expect(result?.status).toBe('malformed');
    expect(result?.record).toBeNull();
    expect(typeof result?.reason).toBe('string');
  });
});
