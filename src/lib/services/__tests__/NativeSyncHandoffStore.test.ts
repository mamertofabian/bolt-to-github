import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeSyncHandoffStore, createChromeLocalHandoffStorage } from '../NativeSyncHandoffStore';
import type { HandoffRecordStorage } from '../NativeSyncHandoffStore';
import type { JourneyClock } from '../NativeSyncJourneyStore';
import type {
  TempImportSummary,
  NativeSyncHandoffRecord,
} from '../../native-sync/nativeSyncHandoff';

/** In-memory fake of the owned HandoffRecordStorage gateway. */
class FakeHandoffStorage implements HandoffRecordStorage {
  public blob: Record<string, unknown> = {};
  public writeCount = 0;

  read = async (): Promise<Record<string, unknown>> => ({ ...this.blob });

  write = async (records: Record<string, NativeSyncHandoffRecord>): Promise<void> => {
    this.writeCount += 1;
    this.blob = { ...records };
  };
}

const fixedClock: JourneyClock = () => 1000;

const anImport = (over: Partial<TempImportSummary> = {}): TempImportSummary => ({
  originalRepo: 'my-private-repo',
  tempRepo: 'temp-abc123',
  owner: 'octocat',
  branch: 'main',
  ...over,
});

describe('NativeSyncHandoffStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recordPendingHandoff persists a pending record and claims exactly one per project across duplicate calls', async () => {
    const storage = new FakeHandoffStorage();
    const store = new NativeSyncHandoffStore(storage, fixedClock);

    const first = await store.recordPendingHandoff(anImport(), 'final-project-1');
    const second = await store.recordPendingHandoff(
      anImport({ originalRepo: 'different-repo' }),
      'final-project-1'
    );

    expect(first.status).toBe('pending');
    expect(first.originalRepo).toBe('my-private-repo');
    // A duplicate completion claims the same record; it is not overwritten.
    expect(second.originalRepo).toBe('my-private-repo');
    expect(Object.keys(storage.blob)).toEqual(['final-project-1']);
  });

  it('getHandoff returns a migrated record for a legacy stored entry', async () => {
    const storage = new FakeHandoffStorage();
    storage.blob = {
      'final-project-1': {
        projectId: 'final-project-1',
        originalRepo: 'my-private-repo',
        tempRepo: 'temp-abc123',
        owner: 'octocat',
        branch: 'main',
        status: 'pending',
        createdAt: 10,
        updatedAt: 10,
      },
    };
    const store = new NativeSyncHandoffStore(storage, fixedClock);

    const record = await store.getHandoff('final-project-1');

    expect(record?.originalRepo).toBe('my-private-repo');
    expect(record?.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it('getHandoff returns null for a malformed stored record and does not write', async () => {
    const storage = new FakeHandoffStorage();
    const malformed = { projectId: 'final-project-1', status: 'bogus' };
    storage.blob = { 'final-project-1': malformed };
    const store = new NativeSyncHandoffStore(storage, fixedClock);

    const record = await store.getHandoff('final-project-1');

    expect(record).toBeNull();
    expect(storage.writeCount).toBe(0);
    expect(storage.blob['final-project-1']).toEqual(malformed);
  });

  it('createChromeLocalHandoffStorage round-trips handoffs under the nativeSyncHandoffs local key', async () => {
    const local: Record<string, unknown> = {};
    (chrome.storage.local.get as unknown) = vi.fn(async (keys: string | string[]) => {
      const key = Array.isArray(keys) ? keys[0] : keys;
      return key in local ? { [key]: local[key] } : {};
    });
    (chrome.storage.local.set as unknown) = vi.fn(async (data: Record<string, unknown>) => {
      Object.assign(local, data);
    });

    const gateway: HandoffRecordStorage = createChromeLocalHandoffStorage();
    const record: NativeSyncHandoffRecord = {
      schemaVersion: 1,
      projectId: 'final-project-1',
      originalRepo: 'my-private-repo',
      tempRepo: 'temp-abc123',
      owner: 'octocat',
      branch: 'main',
      status: 'pending',
      createdAt: 1000,
      updatedAt: 1000,
    };

    await gateway.write({ 'final-project-1': record });
    expect(Object.keys(local)).toContain('nativeSyncHandoffs');

    const back = await gateway.read();
    expect(back['final-project-1']).toEqual(record);
  });
});
