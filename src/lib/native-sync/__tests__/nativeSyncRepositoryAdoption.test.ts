import { describe, it, expect } from 'vitest';
import { discoverAdoptionCandidates, adoptRepository } from '../nativeSyncRepositoryAdoption';
import type {
  AdoptionDeps,
  AdoptionResult,
  NativeSyncAdoptionOutcome,
  AdoptionSelection,
  AdoptionAttestation,
  RepositoryCandidateSource,
  ProjectMappingWriter,
} from '../nativeSyncRepositoryAdoption';
import { NativeSyncJourneyStore } from '../../services/NativeSyncJourneyStore';
import type { JourneyRecordStorage, JourneyClock } from '../../services/NativeSyncJourneyStore';
import { NativeSyncHandoffStore } from '../../services/NativeSyncHandoffStore';
import type { HandoffRecordStorage } from '../../services/NativeSyncHandoffStore';
import type { NativeSyncJourneyRecord } from '../nativeSyncJourney';
import type { TempImportSummary, NativeSyncHandoffRecord } from '../nativeSyncHandoff';
import type { RepositoryCandidateInput, NativeSyncCandidateResult } from '../nativeSyncAdoption';

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

/** Records mapping writes and models project-scoped, field-preserving merge semantics. */
class FakeMappingWriter implements ProjectMappingWriter {
  public settings: Record<string, { repoName: string; branch: string; projectTitle?: string }> = {};
  public calls: Array<{ projectId: string; repoName: string; branch: string }> = [];
  public adoptionStatusAtWrite: string | null = null;

  constructor(private readonly handoffStore: NativeSyncHandoffStore) {}

  setProjectMapping = async (
    projectId: string,
    repoName: string,
    branch: string
  ): Promise<void> => {
    const handoff = await this.handoffStore.getHandoff(projectId);
    this.adoptionStatusAtWrite = handoff?.adoption?.status ?? null;
    this.calls.push({ projectId, repoName, branch });
    const existing = this.settings[projectId] ?? { repoName: '', branch: '' };
    this.settings[projectId] = { ...existing, repoName, branch };
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

const selection: AdoptionSelection = { repo: 'bolt-created', branch: 'main' };
const validAttestation: AdoptionAttestation = {
  attested: true,
  confirmedRepo: 'bolt-created',
  confirmedBranch: 'main',
};

const DEFAULT_REPOS: RepositoryCandidateInput[] = [
  { owner: 'octocat', name: 'bolt-created', createdAt: 2000 },
  { owner: 'octocat', name: 'my-private-repo', createdAt: 2000 },
];

function makeHarness(opts: { verifyAccess?: boolean; repos?: RepositoryCandidateInput[] } = {}) {
  const { verifyAccess = true, repos = DEFAULT_REPOS } = opts;
  const journeyStorage = new FakeJourneyStorage();
  const handoffStorage = new FakeHandoffStorage();
  const journeyStore = new NativeSyncJourneyStore(journeyStorage, clock);
  const handoffStore = new NativeSyncHandoffStore(handoffStorage, clock);
  const listedOwners: string[] = [];
  const candidateSource: RepositoryCandidateSource = {
    listOwnerRepositories: async (owner: string) => {
      listedOwners.push(owner);
      return repos;
    },
  };
  const accessChecks: Array<{ owner: string; repo: string; branch: string }> = [];
  const mappingWriter = new FakeMappingWriter(handoffStore);
  const deps: AdoptionDeps = {
    journeyStore,
    handoffStore,
    candidateSource,
    verifyRepositoryAccess: async (owner: string, repo: string, branch: string) => {
      accessChecks.push({ owner, repo, branch });
      return verifyAccess;
    },
    mappingWriter,
  };
  return {
    deps,
    journeyStore,
    handoffStore,
    journeyStorage,
    mappingWriter,
    listedOwners,
    accessChecks,
  };
}

/** Seed the durable pending state child 01 leaves behind: provenance + pending handoff. */
async function seedHandoff(h: ReturnType<typeof makeHarness>): Promise<void> {
  await h.journeyStore.recordImportProvenance(PROJECT_ID);
  await h.handoffStore.recordPendingHandoff(anImport(), PROJECT_ID);
}

describe('discoverAdoptionCandidates', () => {
  it('discoverAdoptionCandidates ranks the handoff owner repositories from the source', async () => {
    const h = makeHarness();
    await seedHandoff(h);
    const handoff = await h.handoffStore.getHandoff(PROJECT_ID);
    // The candidate source exposes the owner-scoped listing the coordinator ranks.
    const source: RepositoryCandidateSource = h.deps.candidateSource;
    expect(typeof source.listOwnerRepositories).toBe('function');

    const result: NativeSyncCandidateResult = await discoverAdoptionCandidates(
      h.deps,
      handoff!,
      'suggested',
      null
    );

    const names = result.candidates.map((c) => c.name);
    expect(names).toContain('bolt-created');
    expect(names).not.toContain('my-private-repo');
    expect(result.status).toBe('single');
    // Candidates are sourced strictly for the handoff owner.
    expect(h.listedOwners).toEqual(['octocat']);
  });
});

describe('adoptRepository', () => {
  it('adoptRepository blocks with no_handoff and writes nothing when no pending handoff exists', async () => {
    const h = makeHarness();

    const result: AdoptionResult = await adoptRepository(
      h.deps,
      'no-project',
      selection,
      validAttestation
    );

    const outcome: NativeSyncAdoptionOutcome = result.status;
    expect(outcome).toBe('no_handoff');
    expect(result.record).toBeNull();
    expect(h.mappingWriter.calls).toHaveLength(0);
  });

  it('adoptRepository blocks with not_attested and does not change the mapping', async () => {
    const h = makeHarness();
    await seedHandoff(h);
    const notAttested: AdoptionAttestation = {
      attested: false,
      confirmedRepo: 'bolt-created',
      confirmedBranch: 'main',
    };

    const result = await adoptRepository(h.deps, PROJECT_ID, selection, notAttested);

    expect(result.status).toBe('not_attested');
    expect(h.mappingWriter.calls).toHaveLength(0);
    expect((await h.handoffStore.getHandoff(PROJECT_ID))?.adoption ?? null).toBeNull();
  });

  it('adoptRepository blocks with journey_blocked when beginJourney is denied', async () => {
    const h = makeHarness();
    await h.handoffStore.recordPendingHandoff(anImport(), PROJECT_ID);
    // A malformed journey record makes beginJourney refuse to start the handoff journey.
    h.journeyStorage.blob = { [PROJECT_ID]: { projectId: PROJECT_ID, provenance: 'bogus' } };

    const result = await adoptRepository(h.deps, PROJECT_ID, selection, validAttestation);

    expect(result.status).toBe('journey_blocked');
    expect(h.mappingWriter.calls).toHaveLength(0);
    // A blocked journey persists no selection.
    expect((await h.handoffStore.getHandoff(PROJECT_ID))?.adoption ?? null).toBeNull();
  });

  it('adoptRepository blocks with inaccessible when the live-access check fails', async () => {
    const h = makeHarness({ verifyAccess: false });
    await seedHandoff(h);

    const result = await adoptRepository(h.deps, PROJECT_ID, selection, validAttestation);

    expect(result.status).toBe('inaccessible');
    expect(h.mappingWriter.calls).toHaveLength(0);
    // Selection is persisted only after the live-access gate passes.
    expect((await h.handoffStore.getHandoff(PROJECT_ID))?.adoption ?? null).toBeNull();
  });

  it('adoptRepository persists selection before mapping and marks completion after mapping', async () => {
    const h = makeHarness();
    await seedHandoff(h);

    const result = await adoptRepository(h.deps, PROJECT_ID, selection, validAttestation);

    expect(result.status).toBe('adopted');
    // The live-access check received the handoff owner and the selected repo/branch.
    expect(h.accessChecks).toEqual([{ owner: 'octocat', repo: 'bolt-created', branch: 'main' }]);
    // The pending selection was persisted before the mapping was written.
    expect(h.mappingWriter.adoptionStatusAtWrite).toBe('selected');
    // Completion is marked only after the mapping write.
    expect((await h.handoffStore.getHandoff(PROJECT_ID))?.adoption?.status).toBe('completed');
    expect(h.mappingWriter.calls).toHaveLength(1);
    // Adoption begins the handoff journey (child 00 mutual-exclusion marker persists).
    expect((await h.journeyStore.getJourney(PROJECT_ID))?.activeJourney).toBe(
      'private_import_handoff'
    );
  });

  it('adoptRepository updates only the current project mapping and preserves provenance', async () => {
    const h = makeHarness();
    await seedHandoff(h);
    h.mappingWriter.settings = {
      'other-project': { repoName: 'other-repo', branch: 'dev', projectTitle: 'Other' },
      [PROJECT_ID]: { repoName: 'github.com', branch: 'main', projectTitle: 'My Project' },
    };

    const writer: ProjectMappingWriter = h.deps.mappingWriter;
    expect(typeof writer.setProjectMapping).toBe('function');

    const result = await adoptRepository(h.deps, PROJECT_ID, selection, validAttestation);

    expect(result.status).toBe('adopted');
    // Unrelated project mapping is untouched.
    expect(h.mappingWriter.settings['other-project']).toEqual({
      repoName: 'other-repo',
      branch: 'dev',
      projectTitle: 'Other',
    });
    // Only the current project's repo/branch changed; its other fields survive.
    expect(h.mappingWriter.settings[PROJECT_ID].repoName).toBe('bolt-created');
    expect(h.mappingWriter.settings[PROJECT_ID].branch).toBe('main');
    expect(h.mappingWriter.settings[PROJECT_ID].projectTitle).toBe('My Project');
    expect(h.mappingWriter.calls.every((c) => c.projectId === PROJECT_ID)).toBe(true);
    // Provenance from the original import is preserved through adoption.
    expect(result.record?.originalRepo).toBe('my-private-repo');
    expect(result.record?.tempRepo).toBe('temp-abc123');
  });

  it('adoptRepository is idempotent and converges on the same mapping across repeated calls', async () => {
    const h = makeHarness();
    await seedHandoff(h);

    const first = await adoptRepository(h.deps, PROJECT_ID, selection, validAttestation);
    const second = await adoptRepository(h.deps, PROJECT_ID, selection, validAttestation);

    expect(first.status).toBe('adopted');
    expect(second.status).toBe('adopted');
    // A completed handoff short-circuits: the mapping is written exactly once.
    expect(h.mappingWriter.calls).toHaveLength(1);
    expect(h.mappingWriter.settings[PROJECT_ID]?.repoName).toBe('bolt-created');
    expect(second.record?.adoption?.status).toBe('completed');
  });

  it('adoptRepository repairs a selected-but-uncompleted record forward to completion', async () => {
    const h = makeHarness();
    await seedHandoff(h);
    // Simulate a crash after selection persisted but before the mapping/completion.
    await h.handoffStore.recordSelection(PROJECT_ID, 'bolt-created', 'main');

    const result = await adoptRepository(h.deps, PROJECT_ID, selection, validAttestation);

    expect(result.status).toBe('adopted');
    expect(result.record?.adoption?.status).toBe('completed');
    expect(h.mappingWriter.calls).toHaveLength(1);
    expect(h.mappingWriter.settings[PROJECT_ID]?.repoName).toBe('bolt-created');
  });
});
