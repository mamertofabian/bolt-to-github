import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeSyncJourneyStore, createChromeLocalJourneyStorage } from '../NativeSyncJourneyStore';
import type { JourneyRecordStorage, JourneyClock } from '../NativeSyncJourneyStore';
import type { NativeSyncJourneyRecord } from '../../native-sync/nativeSyncJourney';

/**
 * In-memory fake of the JourneyRecordStorage gateway (a type we own), so the
 * store is tested against realistic persistence behavior without mocking
 * chrome.storage directly.
 */
class FakeJourneyStorage implements JourneyRecordStorage {
  public blob: Record<string, unknown> = {};
  public writeCount = 0;

  read = async (): Promise<Record<string, unknown>> => ({ ...this.blob });

  write = async (records: Record<string, NativeSyncJourneyRecord>): Promise<void> => {
    this.writeCount += 1;
    this.blob = { ...records };
  };
}

const fixedClock: JourneyClock = () => 1000;

describe('NativeSyncJourneyStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recordImportProvenance persists private_import provenance idempotently across duplicate calls', async () => {
    const storage = new FakeJourneyStorage();
    let now = 1000;
    const store = new NativeSyncJourneyStore(storage, () => now);

    const first = await store.recordImportProvenance('project-1');
    now = 2000;
    const second = await store.recordImportProvenance('project-1');

    expect(first.provenance).toBe('private_import');
    expect(second.provenance).toBe('private_import');
    // A duplicate completion event must not create a second record...
    expect(Object.keys(storage.blob)).toEqual(['project-1']);
    // ...nor reset the original creation time even as the clock advances.
    expect(second.createdAt).toBe(first.createdAt);
  });

  it('beginJourney persists an allowed journey and refuses a conflicting lane', async () => {
    const storage = new FakeJourneyStorage();
    const store = new NativeSyncJourneyStore(storage, fixedClock);
    await store.recordImportProvenance('project-1');

    const allowed = await store.beginJourney('project-1', 'private_import_handoff');
    expect(allowed.allowed).toBe(true);

    const persisted = await store.getJourney('project-1');
    expect(persisted?.activeJourney).toBe('private_import_handoff');

    const conflicting = await store.beginJourney('project-1', 'existing_project_migration');
    expect(conflicting.allowed).toBe(false);
    expect(conflicting.reason).toBe('another_active_journey');
  });

  it('recordImportProvenance recovers from a malformed stored record because import completion is authoritative', async () => {
    const storage = new FakeJourneyStorage();
    storage.blob = { 'project-1': { projectId: 'project-1', provenance: 'bogus' } };
    const store = new NativeSyncJourneyStore(storage, fixedClock);

    const record = await store.recordImportProvenance('project-1');

    // A completed private import is ground truth: the corrupt entry is replaced
    // by a clean current record rather than blocking the import.
    expect(record.provenance).toBe('private_import');
    const persisted = await store.getJourney('project-1');
    expect(persisted?.provenance).toBe('private_import');
    expect(persisted?.activeJourney).toBeNull();
  });

  it('getJourney returns a migrated record for a legacy stored entry', async () => {
    const storage = new FakeJourneyStorage();
    storage.blob = {
      'project-1': {
        projectId: 'project-1',
        provenance: 'private_import',
        activeJourney: null,
        createdAt: 10,
        updatedAt: 10,
      },
    };
    const store = new NativeSyncJourneyStore(storage, fixedClock);

    const record = await store.getJourney('project-1');

    expect(record?.provenance).toBe('private_import');
    expect(record?.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it('beginJourney allows existing_project_migration for a project without private_import provenance', async () => {
    const storage = new FakeJourneyStorage();
    const store = new NativeSyncJourneyStore(storage, fixedClock);

    // No private import ever recorded for this project — the migration lane.
    const decision = await store.beginJourney('project-2', 'existing_project_migration');
    expect(decision.allowed).toBe(true);

    const persisted = await store.getJourney('project-2');
    expect(persisted?.activeJourney).toBe('existing_project_migration');
    expect(persisted?.provenance).toBe('none');
  });

  it('beginJourney blocks visibly on a malformed stored record without erasing it', async () => {
    const storage = new FakeJourneyStorage();
    const malformed = { projectId: 'project-1', provenance: 'bogus' };
    storage.blob = { 'project-1': malformed };
    const store = new NativeSyncJourneyStore(storage, fixedClock);

    const decision = await store.beginJourney('project-1', 'existing_project_migration');

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('malformed_record');
    // The malformed entry is surfaced, not silently overwritten or dropped.
    expect(storage.blob['project-1']).toEqual(malformed);
  });

  it('getJourney returns null for a malformed stored record and does not write', async () => {
    const storage = new FakeJourneyStorage();
    storage.blob = { 'project-1': { projectId: 'project-1', provenance: 'bogus' } };
    const store = new NativeSyncJourneyStore(storage, fixedClock);

    const record = await store.getJourney('project-1');

    expect(record).toBeNull();
    // A read must not repair-write; the malformed entry stays untouched.
    expect(storage.writeCount).toBe(0);
    expect(storage.blob['project-1']).toEqual({ projectId: 'project-1', provenance: 'bogus' });
  });

  it('createChromeLocalJourneyStorage round-trips journeys under the nativeSyncJourneys local key', async () => {
    const local: Record<string, unknown> = {};
    (chrome.storage.local.get as unknown) = vi.fn(async (keys: string | string[]) => {
      const key = Array.isArray(keys) ? keys[0] : keys;
      return key in local ? { [key]: local[key] } : {};
    });
    (chrome.storage.local.set as unknown) = vi.fn(async (data: Record<string, unknown>) => {
      Object.assign(local, data);
    });

    const gateway: JourneyRecordStorage = createChromeLocalJourneyStorage();
    const record: NativeSyncJourneyRecord = {
      schemaVersion: 1,
      projectId: 'project-1',
      provenance: 'private_import',
      activeJourney: null,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await gateway.write({ 'project-1': record });
    expect(Object.keys(local)).toContain('nativeSyncJourneys');

    const back = await gateway.read();
    expect(back['project-1']).toEqual(record);
  });
});
