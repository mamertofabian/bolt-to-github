import { describe, it, expect } from 'vitest';
import {
  deriveHandoffView,
  type NativeSyncHandoffView,
  type NativeSyncHandoffPhase,
  type NativeSyncHandoffAction,
  type NativeSyncBlockedReason,
  type NativeSyncRepoIdentities,
  type NativeSyncCompletionSummary,
  type HandoffViewInput,
} from '../nativeSyncHandoffView';
import type { NativeSyncHandoffRecord } from '../nativeSyncHandoff';
import type { NativeSyncCandidateResult } from '../nativeSyncAdoption';
import type { AdoptionSelection } from '../nativeSyncRepositoryAdoption';

/**
 * Build a pending handoff record (adoption not started) with distinct original
 * and temporary repository identities.
 */
function makePendingRecord(
  overrides: Partial<NativeSyncHandoffRecord> = {}
): NativeSyncHandoffRecord {
  return {
    schemaVersion: 2,
    projectId: 'project-1',
    originalRepo: 'original-repo',
    tempRepo: 'temp-repo-123',
    owner: 'octocat',
    branch: 'main',
    status: 'pending',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    adoption: null,
    ...overrides,
  };
}

/** Build a completed handoff record with an adopted repository/branch. */
function makeCompletedRecord(): NativeSyncHandoffRecord {
  return makePendingRecord({
    adoption: {
      status: 'completed',
      selectedRepo: 'bolt-xyz',
      selectedBranch: 'main',
      completedAt: 1_700_000_500_000,
    },
  });
}

/** Base input with everything cleared; override only what a test cares about. */
function makeInput(overrides: Partial<HandoffViewInput> = {}): HandoffViewInput {
  return {
    handoff: null,
    discovery: null,
    selection: null,
    lastOutcome: null,
    connectionError: false,
    dismissed: false,
    ...overrides,
  };
}

describe('deriveHandoffView', () => {
  it('deriveHandoffView returns the inactive phase with no identities when there is no handoff record', () => {
    const view: NativeSyncHandoffView = deriveHandoffView(makeInput({ handoff: null }));

    const phase: NativeSyncHandoffPhase = view.phase;
    const identities: NativeSyncRepoIdentities | null = view.identities;
    expect(phase).toBe('inactive');
    expect(identities).toBeNull();
    expect(view.actions).toEqual([]);
  });

  it('deriveHandoffView surfaces guidance with the distinct original and temporary repositories for a fresh pending handoff', () => {
    const view = deriveHandoffView(makeInput({ handoff: makePendingRecord() }));

    expect(view.phase).toBe('guidance');
    const identities = view.identities as NativeSyncRepoIdentities;
    expect(identities.owner).toBe('octocat');
    expect(identities.originalRepo).toBe('original-repo');
    expect(identities.tempRepo).toBe('temp-repo-123');
    // The three identities must stay distinct so the UI can label them separately.
    expect(identities.originalRepo).not.toBe(identities.tempRepo);
  });

  it('deriveHandoffView surfaces the handoff branch in the repository identities', () => {
    // The adoption surface must map the user's actual imported branch, so the
    // branch has to travel through the view rather than be defaulted in the UI.
    const view = deriveHandoffView(
      makeInput({ handoff: makePendingRecord({ branch: 'develop' }) })
    );

    const identities = view.identities as NativeSyncRepoIdentities;
    expect(identities.branch).toBe('develop');
  });

  it('deriveHandoffView guidance offers the enable-native and discover actions', () => {
    const view = deriveHandoffView(makeInput({ handoff: makePendingRecord() }));

    expect(view.phase).toBe('guidance');
    // Guidance must move the user forward: enable Bolt native setup, then discover.
    expect(view.actions).toContain('enable_bolt_native');
    expect(view.actions).toContain('discover');
  });

  it('deriveHandoffView presents a no-candidate discovery result with both refresh and search actions', () => {
    const discovery: NativeSyncCandidateResult = { status: 'none', candidates: [] };
    const view = deriveHandoffView(makeInput({ handoff: makePendingRecord(), discovery }));

    expect(view.phase).toBe('discovery');
    const actions: NativeSyncHandoffAction[] = view.actions;
    expect(actions).toContain('refresh');
    expect(actions).toContain('search');
  });

  it('deriveHandoffView keeps a single candidate in discovery without auto-selecting it', () => {
    const discovery: NativeSyncCandidateResult = {
      status: 'single',
      candidates: [
        {
          owner: 'octocat',
          name: 'bolt-xyz',
          createdAt: 1_700_000_400_000,
          createdBeforeHandoff: false,
        },
      ],
    };
    const view = deriveHandoffView(makeInput({ handoff: makePendingRecord(), discovery }));

    expect(view.phase).toBe('discovery');
    // Never auto-select: a single candidate still requires an explicit choice.
    expect(view.selection).toBeNull();
    expect(view.actions).toContain('select');
    expect(view.actions).not.toContain('attest_and_adopt');
  });

  it('deriveHandoffView keeps multiple candidates in discovery and requires an explicit selection', () => {
    const discovery: NativeSyncCandidateResult = {
      status: 'multiple',
      candidates: [
        {
          owner: 'octocat',
          name: 'bolt-xyz',
          createdAt: 1_700_000_400_000,
          createdBeforeHandoff: false,
        },
        {
          owner: 'octocat',
          name: 'bolt-abc',
          createdAt: 1_700_000_300_000,
          createdBeforeHandoff: false,
        },
      ],
    };
    const view = deriveHandoffView(makeInput({ handoff: makePendingRecord(), discovery }));

    expect(view.phase).toBe('discovery');
    expect(view.discovery?.status).toBe('multiple');
    expect(view.selection).toBeNull();
    expect(view.actions).toContain('select');
    expect(view.actions).toContain('search');
  });

  it('deriveHandoffView moves to confirm and echoes the user selection when one is chosen', () => {
    const selection: AdoptionSelection = { repo: 'bolt-xyz', branch: 'main' };
    const view = deriveHandoffView(makeInput({ handoff: makePendingRecord(), selection }));

    expect(view.phase).toBe('confirm');
    expect(view.selection).toEqual(selection);
    expect(view.actions).toContain('attest_and_adopt');
    expect(view.actions).toContain('back');
  });

  it('deriveHandoffView blocks on an inaccessible adoption outcome with a retry action', () => {
    const view = deriveHandoffView(
      makeInput({ handoff: makePendingRecord(), lastOutcome: 'inaccessible' })
    );

    expect(view.phase).toBe('blocked');
    const blocked: NativeSyncBlockedReason | null = view.blocked;
    expect(blocked).toBe('inaccessible');
    expect(view.actions).toContain('retry');
  });

  it('deriveHandoffView blocks on a journey-blocked adoption outcome', () => {
    const view = deriveHandoffView(
      makeInput({ handoff: makePendingRecord(), lastOutcome: 'journey_blocked' })
    );

    expect(view.phase).toBe('blocked');
    expect(view.blocked).toBe('journey_blocked');
  });

  it('deriveHandoffView blocks on a not-attested adoption outcome with an attest action', () => {
    const view = deriveHandoffView(
      makeInput({ handoff: makePendingRecord(), lastOutcome: 'not_attested' })
    );

    expect(view.phase).toBe('blocked');
    expect(view.blocked).toBe('not_attested');
    // The user can recover by attesting and adopting again.
    expect(view.actions).toContain('attest_and_adopt');
  });

  it('deriveHandoffView blocks with no_handoff when the adoption outcome reports a missing record', () => {
    // A stale, still-non-null handoff in the view input paired with a no_handoff
    // adoption outcome (the record vanished between reads) is a visible blocked
    // state, never a silent success.
    const view = deriveHandoffView(
      makeInput({ handoff: makePendingRecord(), lastOutcome: 'no_handoff' })
    );

    expect(view.phase).toBe('blocked');
    expect(view.blocked).toBe('no_handoff');
  });

  it('deriveHandoffView blocks with discovery_failed when discovery hit a connection error', () => {
    const view = deriveHandoffView(
      makeInput({ handoff: makePendingRecord(), connectionError: true })
    );

    expect(view.phase).toBe('blocked');
    expect(view.blocked).toBe('discovery_failed');
    expect(view.actions).toContain('retry');
  });

  it('deriveHandoffView shows a resumable dismissed state for a pending handoff', () => {
    const view = deriveHandoffView(makeInput({ handoff: makePendingRecord(), dismissed: true }));

    expect(view.phase).toBe('dismissed');
    expect(view.actions).toContain('resume');
  });

  it('deriveHandoffView reports completion as a user-attested native mapping without claiming verified sync', () => {
    const view = deriveHandoffView(makeInput({ handoff: makeCompletedRecord() }));

    expect(view.phase).toBe('completed');
    const completion: NativeSyncCompletionSummary | null = view.completion;
    expect(completion).not.toBeNull();
    expect(completion?.adoptedRepo).toBe('bolt-xyz');
    expect(completion?.adoptedBranch).toBe('main');
    // Honest completion: user confirmation, incoming sync is Bolt's, Bolt may commit.
    expect(completion?.basis).toBe('user_attested_adoption');
    expect(completion?.incomingSyncProvider).toBe('bolt_native');
    expect(completion?.boltMayAlsoCommit).toBe(true);
  });

  it('deriveHandoffView treats a completed record as terminal over dismissed and blocking signals', () => {
    const view = deriveHandoffView(
      makeInput({
        handoff: makeCompletedRecord(),
        dismissed: true,
        connectionError: true,
        lastOutcome: 'inaccessible',
      })
    );

    expect(view.phase).toBe('completed');
    expect(view.blocked).toBeNull();
  });

  it('deriveHandoffView does not report completion from a transient adopted outcome without a completed record', () => {
    const view = deriveHandoffView(
      makeInput({ handoff: makePendingRecord(), lastOutcome: 'adopted' })
    );

    // A transient 'adopted' return must NOT render completion; only the persisted
    // completed record can. With nothing else pending, the surface stays guidance.
    expect(view.phase).not.toBe('completed');
    expect(view.phase).toBe('guidance');
    expect(view.completion).toBeNull();
  });
});
