/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import NativeSyncHandoffModal from '../NativeSyncHandoffModal.svelte';
import { NativeSyncHandoffController } from '$lib/native-sync/NativeSyncHandoffController';
import { NativeSyncJourneyStore } from '$lib/services/NativeSyncJourneyStore';
import { NativeSyncHandoffStore } from '$lib/services/NativeSyncHandoffStore';
import type {
  AdoptionDeps,
  ProjectMappingWriter,
  RepositoryCandidateSource,
} from '$lib/native-sync/nativeSyncRepositoryAdoption';
import type { RepositoryCandidateInput } from '$lib/native-sync/nativeSyncAdoption';

vi.unmock('$lib/components/ui/modal/Modal.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

const PROJECT_ID = 'project-1';
const OWNER = 'octocat';
const HANDOFF_CREATED = Date.parse('2026-07-10T00:00:00.000Z');
const AFTER_HANDOFF = Date.parse('2026-07-15T00:00:00.000Z');

function inMemoryStorage() {
  let data: Record<string, unknown> = {};
  return {
    read: async (): Promise<Record<string, unknown>> => data,
    write: async (records: Record<string, unknown>): Promise<void> => {
      data = records;
    },
  };
}

async function makeController(
  overrides: {
    candidateSource?: RepositoryCandidateSource;
    verifyRepositoryAccess?: AdoptionDeps['verifyRepositoryAccess'];
    mappingWriter?: ProjectMappingWriter;
  } = {}
): Promise<NativeSyncHandoffController> {
  const clock = () => HANDOFF_CREATED;
  const journeyStore = new NativeSyncJourneyStore(inMemoryStorage(), clock);
  const handoffStore = new NativeSyncHandoffStore(inMemoryStorage(), clock);
  await journeyStore.recordImportProvenance(PROJECT_ID);
  await handoffStore.recordPendingHandoff(
    { originalRepo: 'source-repo', tempRepo: 'temp-clone', owner: OWNER, branch: 'develop' },
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

  const deps: AdoptionDeps = {
    journeyStore,
    handoffStore,
    candidateSource,
    verifyRepositoryAccess,
    mappingWriter,
  };
  return new NativeSyncHandoffController(deps, PROJECT_ID);
}

/** Drive the modal through discover -> select -> attest -> adopt to the completed state. */
async function driveToCompleted(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await screen.findByText(/enable native github sync inside bolt/i);
  await user.click(screen.getByRole('button', { name: /find repositories/i }));
  await user.click(await screen.findByRole('button', { name: /bolt-new/i }));
  await user.click(await screen.findByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: /adopt/i }));
  await screen.findByText(/mapped to/i);
}

describe('NativeSyncHandoffModal.svelte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'chrome', {
      value: {
        runtime: { sendMessage: vi.fn().mockResolvedValue({}) },
        storage: {
          local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not render the handoff surface when show is false', async () => {
    const controller = await makeController();
    render(NativeSyncHandoffModal, { props: { show: false, controller, onClose: vi.fn() } });

    expect(screen.queryByText(/enable native github sync inside bolt/i)).not.toBeInTheDocument();
  });

  it('guidance names Bolt and GitHub distinctly and labels the original repository as preserved', async () => {
    const controller = await makeController();
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    expect(await screen.findByText(/enable native github sync inside bolt/i)).toBeInTheDocument();
    expect(screen.getByText(/source-repo/)).toBeInTheDocument();
    expect(screen.getByText(/preserved/i)).toBeInTheDocument();
  });

  it('guidance labels the temporary public repository as deleted', async () => {
    const controller = await makeController();
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await screen.findByText(/enable native github sync inside bolt/i);
    expect(screen.getByText(/temp-clone/)).toBeInTheDocument();
    expect(screen.getByText(/deleted/i)).toBeInTheDocument();
  });

  it('discovering repositories lists the Bolt-created candidates', async () => {
    const user = userEvent.setup();
    const controller = await makeController();
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await screen.findByText(/enable native github sync inside bolt/i);
    await user.click(screen.getByRole('button', { name: /find repositories/i }));

    expect(await screen.findByRole('button', { name: /bolt-new/i })).toBeInTheDocument();
  });

  it('a no-candidate result offers both refresh and a manual search', async () => {
    const user = userEvent.setup();
    const controller = await makeController({
      candidateSource: { listOwnerRepositories: async () => [] },
    });
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await screen.findByText(/enable native github sync inside bolt/i);
    await user.click(screen.getByRole('button', { name: /find repositories/i }));

    await screen.findByText(/no repositories/i);
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('multiple candidates are listed without auto-selecting one', async () => {
    const user = userEvent.setup();
    const controller = await makeController({
      candidateSource: {
        listOwnerRepositories: async (owner: string): Promise<RepositoryCandidateInput[]> => [
          { owner, name: 'bolt-new', createdAt: AFTER_HANDOFF },
          { owner, name: 'bolt-two', createdAt: AFTER_HANDOFF + 1000 },
        ],
      },
    });
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await screen.findByText(/enable native github sync inside bolt/i);
    await user.click(screen.getByRole('button', { name: /find repositories/i }));

    expect(await screen.findByRole('button', { name: /bolt-new/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bolt-two/i })).toBeInTheDocument();
    // No candidate is auto-selected: the attestation step is not shown yet.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('selecting a candidate reveals the attestation confirmation before adoption', async () => {
    const user = userEvent.setup();
    const controller = await makeController();
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await screen.findByText(/enable native github sync inside bolt/i);
    await user.click(screen.getByRole('button', { name: /find repositories/i }));
    await user.click(await screen.findByRole('button', { name: /bolt-new/i }));

    expect(await screen.findByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adopt/i })).toBeInTheDocument();
  });

  it('the adopt action is disabled until the user attests native setup completed', async () => {
    const user = userEvent.setup();
    const controller = await makeController();
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await screen.findByText(/enable native github sync inside bolt/i);
    await user.click(screen.getByRole('button', { name: /find repositories/i }));
    await user.click(await screen.findByRole('button', { name: /bolt-new/i }));

    const adopt = await screen.findByRole('button', { name: /adopt/i });
    expect(adopt).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    expect(adopt).not.toBeDisabled();
  });

  it('completing the guided journey shows a user-confirmed native mapping without claiming verified two-way sync', async () => {
    const user = userEvent.setup();
    const setProjectMapping = vi.fn(async () => {});
    const controller = await makeController({ mappingWriter: { setProjectMapping } });
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await driveToCompleted(user);

    expect(screen.getByText(/bolt-new/)).toBeInTheDocument();
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument();
    // Honest completion: none of the banned "stronger than it is" claims appear.
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/synced/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/two-way sync/i)).not.toBeInTheDocument();
    // The adopted branch is the user's actual handoff branch, not a hard-coded default.
    expect(setProjectMapping).toHaveBeenCalledWith('project-1', 'bolt-new', 'develop');
  });

  it('completion explains incoming changes return through Bolt and that Bolt may also commit', async () => {
    const user = userEvent.setup();
    const controller = await makeController();
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await driveToCompleted(user);

    expect(screen.getByText(/through bolt'?s native github integration/i)).toBeInTheDocument();
    expect(screen.getByText(/bolt may also create its own commits/i)).toBeInTheDocument();
  });

  it('a failed discovery shows a retry affordance', async () => {
    const user = userEvent.setup();
    const controller = await makeController({
      candidateSource: {
        listOwnerRepositories: async () => {
          throw new Error('offline');
        },
      },
    });
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await screen.findByText(/enable native github sync inside bolt/i);
    await user.click(screen.getByRole('button', { name: /find repositories/i }));

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('a candidate can be selected with the keyboard', async () => {
    const user = userEvent.setup();
    const controller = await makeController();
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose: vi.fn() } });

    await screen.findByText(/enable native github sync inside bolt/i);
    await user.click(screen.getByRole('button', { name: /find repositories/i }));

    const candidate = await screen.findByRole('button', { name: /bolt-new/i });
    candidate.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('checkbox')).toBeInTheDocument();
  });

  it('dismissing the surface invokes the close handler', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const controller = await makeController();
    render(NativeSyncHandoffModal, { props: { show: true, controller, onClose } });

    await screen.findByText(/enable native github sync inside bolt/i);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
