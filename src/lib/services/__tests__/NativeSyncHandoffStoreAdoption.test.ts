import { describe, it, expect } from 'vitest';
import { NativeSyncHandoffStore } from '../NativeSyncHandoffStore';
import type { HandoffRecordStorage } from '../NativeSyncHandoffStore';
import type { JourneyClock } from '../NativeSyncJourneyStore';
import type {
  TempImportSummary,
  NativeSyncHandoffRecord,
} from '../../native-sync/nativeSyncHandoff';

/** In-memory fake of the owned HandoffRecordStorage gateway. */
class FakeHandoffStorage implements HandoffRecordStorage {
  public blob: Record<string, unknown> = {};

  read = async (): Promise<Record<string, unknown>> => ({ ...this.blob });

  write = async (records: Record<string, NativeSyncHandoffRecord>): Promise<void> => {
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

const PROJECT_ID = 'final-project-1';

async function seededStore(): Promise<{
  store: NativeSyncHandoffStore;
  storage: FakeHandoffStorage;
}> {
  const storage = new FakeHandoffStorage();
  const store = new NativeSyncHandoffStore(storage, fixedClock);
  await store.recordPendingHandoff(anImport(), PROJECT_ID);
  return { store, storage };
}

describe('NativeSyncHandoffStore adoption transitions', () => {
  it('recordSelection persists a selected adoption state on a pending record', async () => {
    const { store } = await seededStore();

    const selected = await store.recordSelection(PROJECT_ID, 'bolt-created', 'main');

    expect(selected.adoption?.status).toBe('selected');
    expect(selected.adoption?.selectedRepo).toBe('bolt-created');
    expect(selected.adoption?.selectedBranch).toBe('main');
    expect((await store.getHandoff(PROJECT_ID))?.adoption?.status).toBe('selected');
  });

  it('recordSelection re-affirms the same selection idempotently', async () => {
    const { store, storage } = await seededStore();

    await store.recordSelection(PROJECT_ID, 'bolt-created', 'main');
    const second = await store.recordSelection(PROJECT_ID, 'bolt-created', 'main');

    expect(second.adoption?.selectedRepo).toBe('bolt-created');
    expect(Object.keys(storage.blob)).toEqual([PROJECT_ID]);
  });

  it('recordSelection is locked after completion', async () => {
    const { store } = await seededStore();
    await store.recordSelection(PROJECT_ID, 'bolt-created', 'main');
    await store.recordCompletion(PROJECT_ID);

    const locked = await store.recordSelection(PROJECT_ID, 'other-repo', 'dev');

    expect(locked.adoption?.status).toBe('completed');
    expect(locked.adoption?.selectedRepo).toBe('bolt-created');
  });

  it('recordCompletion transitions a selected record to completed idempotently', async () => {
    const { store } = await seededStore();
    await store.recordSelection(PROJECT_ID, 'bolt-created', 'main');

    const completed = await store.recordCompletion(PROJECT_ID);
    const again = await store.recordCompletion(PROJECT_ID);

    expect(completed.adoption?.status).toBe('completed');
    expect(completed.adoption?.completedAt).toBe(1000);
    expect(again).toEqual(completed);
  });

  it('recordSelection throws when no handoff record exists', async () => {
    const storage = new FakeHandoffStorage();
    const store = new NativeSyncHandoffStore(storage, fixedClock);

    await expect(
      store.recordSelection('missing-project', 'bolt-created', 'main')
    ).rejects.toThrow();
  });
});
