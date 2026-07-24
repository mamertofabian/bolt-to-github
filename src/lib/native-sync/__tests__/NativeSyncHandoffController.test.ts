import { describe, it, expect, vi } from 'vitest';
import { NativeSyncHandoffController } from '../NativeSyncHandoffController';
import { NativeSyncJourneyStore } from '../../services/NativeSyncJourneyStore';
import { NativeSyncHandoffStore } from '../../services/NativeSyncHandoffStore';
import type {
  AdoptionDeps,
  ProjectMappingWriter,
  RepositoryCandidateSource,
} from '../nativeSyncRepositoryAdoption';
import type { RepositoryCandidateInput } from '../nativeSyncAdoption';

const PROJECT_ID = 'project-1';
const OWNER = 'octocat';
const HANDOFF_CREATED = Date.parse('2026-07-10T00:00:00.000Z');
const AFTER_HANDOFF = Date.parse('2026-07-15T00:00:00.000Z');
const BEFORE_HANDOFF = Date.parse('2026-07-05T00:00:00.000Z');

/** Shared in-memory storage usable as both journey and handoff record storage. */
function inMemoryStorage() {
  let data: Record<string, unknown> = {};
  return {
    read: async (): Promise<Record<string, unknown>> => data,
    write: async (records: Record<string, unknown>): Promise<void> => {
      data = records;
    },
  };
}

/**
 * Build AdoptionDeps backed by real journey and handoff stores (over in-memory
 * storage, seeded with private-import provenance and a pending handoff) plus
 * fakeable candidate/access/mapping gateways.
 */
async function makeDeps(
  overrides: {
    candidateSource?: RepositoryCandidateSource;
    verifyRepositoryAccess?: AdoptionDeps['verifyRepositoryAccess'];
    mappingWriter?: ProjectMappingWriter;
  } = {}
): Promise<AdoptionDeps> {
  const clock = () => HANDOFF_CREATED;
  const journeyStore = new NativeSyncJourneyStore(inMemoryStorage(), clock);
  const handoffStore = new NativeSyncHandoffStore(inMemoryStorage(), clock);

  // Private-import provenance is required for the private_import_handoff journey.
  await journeyStore.recordImportProvenance(PROJECT_ID);
  await handoffStore.recordPendingHandoff(
    { originalRepo: 'source-repo', tempRepo: 'temp-clone', owner: OWNER, branch: 'main' },
    PROJECT_ID
  );

  const candidateSource: RepositoryCandidateSource = overrides.candidateSource ?? {
    listOwnerRepositories: async (owner: string): Promise<RepositoryCandidateInput[]> => [
      { owner, name: 'bolt-new', createdAt: AFTER_HANDOFF },
    ],
  };
  const verifyRepositoryAccess = overrides.verifyRepositoryAccess ?? (async () => true);
  const mappingWriter: ProjectMappingWriter = overrides.mappingWriter ?? {
    setProjectMapping: async () => {},
  };

  return { journeyStore, handoffStore, candidateSource, verifyRepositoryAccess, mappingWriter };
}

describe('NativeSyncHandoffController', () => {
  it('load surfaces the guidance phase for a pending handoff record', async () => {
    const controller = new NativeSyncHandoffController(await makeDeps(), PROJECT_ID);

    await controller.load();

    expect(controller.getView().phase).toBe('guidance');
  });

  it('discover populates candidates and moves the view to discovery', async () => {
    const controller = new NativeSyncHandoffController(await makeDeps(), PROJECT_ID);
    await controller.load();

    await controller.discover();

    const view = controller.getView();
    expect(view.phase).toBe('discovery');
    expect(view.discovery?.status).toBe('single');
  });

  it('discover blocks with discovery_failed when candidate discovery throws', async () => {
    const deps = await makeDeps({
      candidateSource: {
        listOwnerRepositories: async () => {
          throw new Error('offline');
        },
      },
    });
    const controller = new NativeSyncHandoffController(deps, PROJECT_ID);
    await controller.load();

    await controller.discover();

    expect(controller.getView().phase).toBe('blocked');
    expect(controller.getView().blocked).toBe('discovery_failed');
  });

  it('select moves the view to confirm and echoes the chosen repository and branch', async () => {
    const controller = new NativeSyncHandoffController(await makeDeps(), PROJECT_ID);
    await controller.load();
    await controller.discover();

    controller.select('bolt-new', 'main');

    const view = controller.getView();
    expect(view.phase).toBe('confirm');
    expect(view.selection).toEqual({ repo: 'bolt-new', branch: 'main' });
  });

  it('attestAndAdopt without attestation blocks as not_attested and writes no project mapping', async () => {
    const setProjectMapping = vi.fn(async () => {});
    const controller = new NativeSyncHandoffController(
      await makeDeps({ mappingWriter: { setProjectMapping } }),
      PROJECT_ID
    );
    await controller.load();
    await controller.discover();
    controller.select('bolt-new', 'main');

    await controller.attestAndAdopt(false);

    expect(controller.getView().phase).toBe('blocked');
    expect(controller.getView().blocked).toBe('not_attested');
    expect(setProjectMapping).not.toHaveBeenCalled();
  });

  it('attestAndAdopt with attestation and live access completes and writes the project mapping once', async () => {
    const setProjectMapping = vi.fn(async () => {});
    const controller = new NativeSyncHandoffController(
      await makeDeps({
        mappingWriter: { setProjectMapping },
        verifyRepositoryAccess: async () => true,
      }),
      PROJECT_ID
    );
    await controller.load();
    await controller.discover();
    controller.select('bolt-new', 'main');

    await controller.attestAndAdopt(true);

    const view = controller.getView();
    expect(view.phase).toBe('completed');
    expect(view.completion?.adoptedRepo).toBe('bolt-new');
    expect(view.completion?.adoptedBranch).toBe('main');
    expect(setProjectMapping).toHaveBeenCalledTimes(1);
    expect(setProjectMapping).toHaveBeenCalledWith('project-1', 'bolt-new', 'main');
  });

  it('attestAndAdopt blocks as inaccessible when the selected repository fails the live-access check', async () => {
    const setProjectMapping = vi.fn(async () => {});
    const controller = new NativeSyncHandoffController(
      await makeDeps({
        mappingWriter: { setProjectMapping },
        verifyRepositoryAccess: async () => false,
      }),
      PROJECT_ID
    );
    await controller.load();
    await controller.discover();
    controller.select('bolt-new', 'main');

    await controller.attestAndAdopt(true);

    expect(controller.getView().phase).toBe('blocked');
    expect(controller.getView().blocked).toBe('inaccessible');
    expect(setProjectMapping).not.toHaveBeenCalled();
  });

  it('back clears a blocked adoption outcome and returns to discovery', async () => {
    const controller = new NativeSyncHandoffController(
      await makeDeps({ verifyRepositoryAccess: async () => false }),
      PROJECT_ID
    );
    await controller.load();
    await controller.discover();
    controller.select('bolt-new', 'main');
    await controller.attestAndAdopt(true);
    expect(controller.getView().phase).toBe('blocked');

    controller.back();

    expect(controller.getView().phase).toBe('discovery');
  });

  it('dismiss then resume toggles the resumable dismissed state', async () => {
    const controller = new NativeSyncHandoffController(await makeDeps(), PROJECT_ID);
    await controller.load();
    await controller.discover();

    controller.dismiss();
    expect(controller.getView().phase).toBe('dismissed');

    controller.resume();
    expect(controller.getView().phase).toBe('discovery');
  });

  it('search surfaces a pre-handoff repository that suggested discovery omits', async () => {
    const controller = new NativeSyncHandoffController(
      await makeDeps({
        candidateSource: {
          listOwnerRepositories: async (owner: string): Promise<RepositoryCandidateInput[]> => [
            { owner, name: 'old-match', createdAt: BEFORE_HANDOFF },
          ],
        },
      }),
      PROJECT_ID
    );
    await controller.load();

    await controller.discover();
    expect(controller.getView().discovery?.status).toBe('none');

    await controller.search('old');
    expect(controller.getView().discovery?.status).toBe('single');
  });

  it('retry recovers to discovery after a transient discovery failure', async () => {
    let calls = 0;
    const controller = new NativeSyncHandoffController(
      await makeDeps({
        candidateSource: {
          listOwnerRepositories: async (owner: string): Promise<RepositoryCandidateInput[]> => {
            calls += 1;
            if (calls === 1) {
              throw new Error('offline');
            }
            return [{ owner, name: 'bolt-new', createdAt: AFTER_HANDOFF }];
          },
        },
      }),
      PROJECT_ID
    );
    await controller.load();
    await controller.discover();
    expect(controller.getView().phase).toBe('blocked');

    await controller.retry();

    expect(controller.getView().phase).toBe('discovery');
  });

  it('a completed adoption is terminal so further discovery keeps the completed view', async () => {
    const controller = new NativeSyncHandoffController(
      await makeDeps({ verifyRepositoryAccess: async () => true }),
      PROJECT_ID
    );
    await controller.load();
    await controller.discover();
    controller.select('bolt-new', 'main');
    await controller.attestAndAdopt(true);
    expect(controller.getView().phase).toBe('completed');

    await controller.discover();

    expect(controller.getView().phase).toBe('completed');
  });
});
