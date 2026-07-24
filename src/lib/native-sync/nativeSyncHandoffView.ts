/**
 * Pure native-sync handoff view-state presenter.
 *
 * Given the persisted handoff record plus the current discovery/adoption
 * signals, this module derives the single render-ready NativeSyncHandoffView the
 * guided-handoff surface (child 03b) displays. It has no I/O and holds all the
 * UI policy so the safety-critical rules are unit-testable without a DOM:
 *
 * - Completion is derived ONLY from the persisted record's adoption sub-state,
 *   never from a transient adoptRepository return value, and it is terminal.
 * - The completed view carries a single honest basis ('user_attested_adoption')
 *   and names incoming sync as Bolt's native integration ('bolt_native'); there
 *   is deliberately no verified/two-way-sync phase or flag.
 * - Discovery never auto-selects: even a single candidate requires an explicit
 *   'select', and a no-candidate result still offers 'refresh' and 'search'.
 * - The three repository identities (original, temporary, adopted) stay distinct.
 */

import type { NativeSyncHandoffRecord } from './nativeSyncHandoff';
import type { NativeSyncCandidateResult } from './nativeSyncAdoption';
import type { AdoptionSelection, NativeSyncAdoptionOutcome } from './nativeSyncRepositoryAdoption';

/** The distinct phases of the guided handoff surface, used as the view discriminant. */
export type NativeSyncHandoffPhase =
  | 'inactive'
  | 'guidance'
  | 'discovery'
  | 'confirm'
  | 'blocked'
  | 'dismissed'
  | 'completed';

/** A user-invokable action the current phase makes available. */
export type NativeSyncHandoffAction =
  | 'enable_bolt_native'
  | 'discover'
  | 'refresh'
  | 'search'
  | 'select'
  | 'attest_and_adopt'
  | 'back'
  | 'retry'
  | 'resume'
  | 'dismiss';

/** Why the surface is in a visible, recoverable blocked state. */
export type NativeSyncBlockedReason =
  | 'not_attested'
  | 'inaccessible'
  | 'journey_blocked'
  | 'no_handoff'
  | 'discovery_failed';

/** The three repository identities the UI must keep distinct through the handoff. */
export interface NativeSyncRepoIdentities {
  owner: string;
  originalRepo: string;
  tempRepo: string;
  branch: string;
}

/**
 * Honest completion payload. Present only when adoption is completed; it names
 * the adopted repository/branch and encodes that incoming sync is Bolt's native
 * integration, not a verified two-way sync.
 */
export interface NativeSyncCompletionSummary {
  adoptedRepo: string;
  adoptedBranch: string;
  basis: 'user_attested_adoption';
  incomingSyncProvider: 'bolt_native';
  boltMayAlsoCommit: true;
}

/** All inputs the presenter needs to derive the current handoff view; no I/O is performed. */
export interface HandoffViewInput {
  handoff: NativeSyncHandoffRecord | null;
  discovery: NativeSyncCandidateResult | null;
  selection: AdoptionSelection | null;
  lastOutcome: NativeSyncAdoptionOutcome | null;
  connectionError: boolean;
  dismissed: boolean;
}

/** Flat, render-ready description of the handoff surface for the current inputs. */
export interface NativeSyncHandoffView {
  phase: NativeSyncHandoffPhase;
  identities: NativeSyncRepoIdentities | null;
  discovery: NativeSyncCandidateResult | null;
  selection: AdoptionSelection | null;
  blocked: NativeSyncBlockedReason | null;
  completion: NativeSyncCompletionSummary | null;
  actions: NativeSyncHandoffAction[];
}

/** Project the durable record's repository identities for labelling. */
function toIdentities(record: NativeSyncHandoffRecord): NativeSyncRepoIdentities {
  return {
    owner: record.owner,
    originalRepo: record.originalRepo,
    tempRepo: record.tempRepo,
    branch: record.branch,
  };
}

/**
 * Map an adoption outcome to its blocked reason. Only the four blocking outcomes
 * surface as a visible block; 'adopted' is not a block and must not, by itself,
 * render the completed surface (that comes from the persisted record).
 */
function blockingReason(outcome: NativeSyncAdoptionOutcome): NativeSyncBlockedReason | null {
  switch (outcome) {
    case 'not_attested':
      return 'not_attested';
    case 'inaccessible':
      return 'inaccessible';
    case 'journey_blocked':
      return 'journey_blocked';
    case 'no_handoff':
      return 'no_handoff';
    default:
      return null;
  }
}

/** The recovery actions each blocked reason offers. */
function blockedActions(reason: NativeSyncBlockedReason): NativeSyncHandoffAction[] {
  switch (reason) {
    case 'not_attested':
      return ['attest_and_adopt', 'back', 'dismiss'];
    case 'inaccessible':
      return ['retry', 'back', 'dismiss'];
    case 'discovery_failed':
    case 'journey_blocked':
    case 'no_handoff':
      return ['retry', 'dismiss'];
  }
}

/**
 * Derive the single current NativeSyncHandoffView from the inputs.
 *
 * Precedence: no record -> inactive; a completed adoption sub-state -> completed
 * (terminal, wins over dismissed/blocked/connectionError); dismissed ->
 * dismissed; a discovery connection error -> blocked('discovery_failed'); a
 * blocking lastOutcome -> blocked with that reason; a selection -> confirm; a
 * discovery result -> discovery; otherwise guidance. Never auto-selects a
 * candidate and never reports a verified two-way sync.
 */
export function deriveHandoffView(input: HandoffViewInput): NativeSyncHandoffView {
  const { handoff, discovery, selection, lastOutcome, connectionError, dismissed } = input;

  const base: NativeSyncHandoffView = {
    phase: 'inactive',
    identities: null,
    discovery: null,
    selection: null,
    blocked: null,
    completion: null,
    actions: [],
  };

  if (handoff === null) {
    return base;
  }

  const identities = toIdentities(handoff);
  const adoption = handoff.adoption ?? null;

  // Completion is derived only from the persisted record and is terminal.
  if (adoption && adoption.status === 'completed') {
    return {
      ...base,
      phase: 'completed',
      identities,
      completion: {
        adoptedRepo: adoption.selectedRepo,
        adoptedBranch: adoption.selectedBranch,
        basis: 'user_attested_adoption',
        incomingSyncProvider: 'bolt_native',
        boltMayAlsoCommit: true,
      },
    };
  }

  if (dismissed) {
    return { ...base, phase: 'dismissed', identities, actions: ['resume'] };
  }

  if (connectionError) {
    return {
      ...base,
      phase: 'blocked',
      identities,
      blocked: 'discovery_failed',
      actions: blockedActions('discovery_failed'),
    };
  }

  const reason = lastOutcome ? blockingReason(lastOutcome) : null;
  if (reason) {
    return {
      ...base,
      phase: 'blocked',
      identities,
      blocked: reason,
      actions: blockedActions(reason),
    };
  }

  if (selection) {
    return {
      ...base,
      phase: 'confirm',
      identities,
      selection,
      actions: ['attest_and_adopt', 'back', 'dismiss'],
    };
  }

  if (discovery) {
    return {
      ...base,
      phase: 'discovery',
      identities,
      discovery,
      actions: ['refresh', 'search', 'select', 'dismiss'],
    };
  }

  return {
    ...base,
    phase: 'guidance',
    identities,
    actions: ['enable_bolt_native', 'discover', 'refresh', 'dismiss'],
  };
}
