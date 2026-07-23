import { describe, it, expect } from 'vitest';
import { completePrivateImportHandoff } from '../nativeSyncImportCompletion';
import type { ImportCompletionDeps, ImportCompletionResult } from '../nativeSyncImportCompletion';
import { NativeSyncJourneyStore } from '../../services/NativeSyncJourneyStore';
import type { JourneyRecordStorage, JourneyClock } from '../../services/NativeSyncJourneyStore';
import { NativeSyncHandoffStore } from '../../services/NativeSyncHandoffStore';
import type { HandoffRecordStorage } from '../../services/NativeSyncHandoffStore';
import type { NativeSyncJourneyRecord } from '../nativeSyncJourney';
import type { TempImportSummary, NativeSyncHandoffRecord } from '../nativeSyncHandoff';

class FakeJourneyStorage implements JourneyRecordStorage {
  public blob: Record<string, unknown> = {};
  read = async (): Promise<Record<string, unknown>> => ({ ...this.blob });
  write = async (records: Record<string, NativeSyncJourneyRecord>): Promise<void> => {
    this.blob = { ...records };
  };
}

class FakeHandoffStorage implements HandoffRecordStorage {
  public blob: Record<string, unknown> = {};
  read = async (): Promise<Record<string, unknown>> => ({ ...this.blob });
  write = async (records: Record<string, NativeSyncHandoffRecord>): Promise<void> => {
    this.blob = { ...records };
  };
}

const clock: JourneyClock = () => 1000;
const PROJECT_ID = 'final-project-1';

const anImport = (over: Partial<TempImportSummary> = {}): TempImportSummary => ({
  originalRepo: 'my-private-repo',
  tempRepo: 'temp-abc123',
  owner: 'octocat',
  branch: 'main',
  ...over,
});

/** Wire the coordinator to REAL stores over in-memory gateways, with a cleanup probe. */
function makeHarness(imports: TempImportSummary[]) {
  const journeyStorage = new FakeJourneyStorage();
  const handoffStorage = new FakeHandoffStorage();
  const journeyStore = new NativeSyncJourneyStore(journeyStorage, clock);
  const handoffStore = new NativeSyncHandoffStore(handoffStorage, clock);
  const probe = {
    cleanupCalls: 0,
    handoffPresentAtCleanup: false,
    provenancePresentAtCleanup: false,
  };

  const deps: ImportCompletionDeps = {
    journeyStore,
    handoffStore,
    listPendingImports: async () => imports,
    cleanup: async () => {
      probe.cleanupCalls += 1;
      probe.handoffPresentAtCleanup = PROJECT_ID in handoffStorage.blob;
      probe.provenancePresentAtCleanup = PROJECT_ID in journeyStorage.blob;
    },
  };

  return { deps, journeyStore, handoffStore, handoffStorage, probe };
}

describe('completePrivateImportHandoff', () => {
  it('completePrivateImportHandoff records provenance and pending handoff before cleanup on a single match', async () => {
    const { deps, journeyStore, handoffStore, probe } = makeHarness([anImport()]);

    const result: ImportCompletionResult = await completePrivateImportHandoff(deps, PROJECT_ID);

    expect(result.status).toBe('matched');
    expect(result.record?.originalRepo).toBe('my-private-repo');
    // Both were persisted before cleanup ran.
    expect(probe.handoffPresentAtCleanup).toBe(true);
    expect(probe.provenancePresentAtCleanup).toBe(true);
    expect(probe.cleanupCalls).toBe(1);
    // Real stores hold the resulting state.
    expect((await handoffStore.getHandoff(PROJECT_ID))?.status).toBe('pending');
    expect((await journeyStore.getJourney(PROJECT_ID))?.provenance).toBe('private_import');
  });

  it('completePrivateImportHandoff preserves the original repository identity through cleanup', async () => {
    const { deps, handoffStore } = makeHarness([
      anImport({ originalRepo: 'secret-private', tempRepo: 'temp-x' }),
    ]);

    await completePrivateImportHandoff(deps, PROJECT_ID);

    const record = await handoffStore.getHandoff(PROJECT_ID);
    // The original private repo identity is captured durably, distinct from the
    // temporary repo that cleanup deletes.
    expect(record?.originalRepo).toBe('secret-private');
    expect(record?.tempRepo).toBe('temp-x');
  });

  it('completePrivateImportHandoff records nothing but still cleans up when no import is pending', async () => {
    const { deps, journeyStore, handoffStore, probe } = makeHarness([]);

    const result = await completePrivateImportHandoff(deps, PROJECT_ID);

    expect(result.status).toBe('none');
    expect(result.record).toBeNull();
    expect(await handoffStore.getHandoff(PROJECT_ID)).toBeNull();
    expect(await journeyStore.getJourney(PROJECT_ID)).toBeNull();
    expect(probe.cleanupCalls).toBe(1);
  });

  it('completePrivateImportHandoff does not guess on ambiguous multiple imports and still cleans up', async () => {
    const { deps, journeyStore, handoffStore, probe } = makeHarness([
      anImport({ tempRepo: 't1' }),
      anImport({ tempRepo: 't2' }),
    ]);

    const result = await completePrivateImportHandoff(deps, PROJECT_ID);

    expect(result.status).toBe('ambiguous');
    expect(result.record).toBeNull();
    // Never guessed: neither provenance nor a handoff record was written.
    expect(await handoffStore.getHandoff(PROJECT_ID)).toBeNull();
    expect(await journeyStore.getJourney(PROJECT_ID)).toBeNull();
    expect(probe.cleanupCalls).toBe(1);
  });

  it('completePrivateImportHandoff is idempotent across duplicate completion events', async () => {
    // First event sees the pending import; a duplicate event after cleanup sees none.
    const imports = [anImport()];
    const { deps, handoffStore, handoffStorage } = makeHarness(imports);

    await completePrivateImportHandoff(deps, PROJECT_ID);
    imports.length = 0; // temp import already cleaned up before the duplicate event
    await completePrivateImportHandoff(deps, PROJECT_ID);

    const record = await handoffStore.getHandoff(PROJECT_ID);
    // The recorded handoff survives a later empty completion; exactly one record.
    expect(record?.originalRepo).toBe('my-private-repo');
    expect(Object.keys(handoffStorage.blob)).toEqual([PROJECT_ID]);
  });
});
