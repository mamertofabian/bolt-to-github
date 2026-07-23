/**
 * Native-sync repository-adoption coordinator.
 *
 * Sprouted and dependency-injected so the staged ordering, safety gates, and
 * idempotency are testable with real stores over in-memory gateways. The
 * consuming UI child wires the GitHub-backed candidate source, the live-access
 * verifier, and the project-mapping writer.
 *
 * Adoption is deliberately fail-loud: it changes no setting unless the user
 * attests native setup completed AND confirms the exact repository/branch AND a
 * live-access check passes AND child 00's beginJourney allows the handoff journey
 * (single-active-journey mutual exclusion). Only then does it persist the pending
 * selection FIRST, update ONLY the current project mapping, and finally mark
 * completion — so a duplicate event or MV3 restart converges on the same mapping
 * rather than creating a second or divergent one. Completion is a user-confirmed
 * native mapping, never proof of Bolt linkage.
 */

import { rankAdoptionCandidates } from './nativeSyncAdoption';
import type {
  NativeSyncCandidateMode,
  NativeSyncCandidateResult,
  RepositoryCandidateInput,
} from './nativeSyncAdoption';
import type { NativeSyncHandoffRecord } from './nativeSyncHandoff';
import type { NativeSyncJourneyStore } from '../services/NativeSyncJourneyStore';
import type { NativeSyncHandoffStore } from '../services/NativeSyncHandoffStore';

/** Outcome of an adoption attempt; a blocking status means no mapping changed. */
export type NativeSyncAdoptionOutcome =
  | 'adopted'
  | 'not_attested'
  | 'inaccessible'
  | 'journey_blocked'
  | 'no_handoff';

/**
 * Narrow injectable gateway returning owner-scoped repository candidates, so
 * discovery does not depend on RepositoryService or the GitHub API directly.
 */
export interface RepositoryCandidateSource {
  listOwnerRepositories: (owner: string) => Promise<RepositoryCandidateInput[]>;
}

/**
 * Narrow injectable gateway that updates ONLY the given project's repository and
 * branch mapping. Production implementations must preserve the project's other
 * fields and every unrelated project.
 */
export interface ProjectMappingWriter {
  setProjectMapping: (projectId: string, repoName: string, branch: string) => Promise<void>;
}

/** The repository and branch the user explicitly chose to adopt. */
export interface AdoptionSelection {
  repo: string;
  branch: string;
}

/**
 * The user's explicit attestation that Bolt native setup completed, plus the
 * repository/branch they confirmed. User confirmation, not proof of Bolt linkage.
 */
export interface AdoptionAttestation {
  attested: boolean;
  confirmedRepo: string;
  confirmedBranch: string;
}

/** Injected collaborators so the staged adoption is testable with real stores. */
export interface AdoptionDeps {
  journeyStore: NativeSyncJourneyStore;
  handoffStore: NativeSyncHandoffStore;
  candidateSource: RepositoryCandidateSource;
  verifyRepositoryAccess: (owner: string, repo: string, branch: string) => Promise<boolean>;
  mappingWriter: ProjectMappingWriter;
}

/** Outcome of an adoption attempt, including a blocking reason when nothing changed. */
export interface AdoptionResult {
  status: NativeSyncAdoptionOutcome;
  record: NativeSyncHandoffRecord | null;
  reason: string | null;
}

/**
 * List the handoff owner's repositories through the candidate source and rank
 * them for adoption. The caller supplies the handoff record it already read.
 */
export async function discoverAdoptionCandidates(
  deps: AdoptionDeps,
  handoff: NativeSyncHandoffRecord,
  mode: NativeSyncCandidateMode,
  query: string | null
): Promise<NativeSyncCandidateResult> {
  const repos = await deps.candidateSource.listOwnerRepositories(handoff.owner);
  return rankAdoptionCandidates(repos, handoff, mode, query);
}

/**
 * Staged, idempotent adoption. See the module docstring for the safety contract.
 */
export async function adoptRepository(
  deps: AdoptionDeps,
  projectId: string,
  selection: AdoptionSelection,
  attestation: AdoptionAttestation
): Promise<AdoptionResult> {
  const handoff = await deps.handoffStore.getHandoff(projectId);
  if (!handoff) {
    return { status: 'no_handoff', record: null, reason: 'no pending handoff for project' };
  }

  // A completed handoff is terminal: re-adoption converges on the recorded mapping.
  if (handoff.adoption?.status === 'completed') {
    return { status: 'adopted', record: handoff, reason: null };
  }

  // Gate 1 — explicit attestation confirming the exact repository and branch.
  if (
    !attestation.attested ||
    attestation.confirmedRepo !== selection.repo ||
    attestation.confirmedBranch !== selection.branch
  ) {
    return {
      status: 'not_attested',
      record: null,
      reason: 'native setup not attested for the selected repository and branch',
    };
  }

  // Gate 2 — single-active-journey mutual exclusion (child 00).
  const decision = await deps.journeyStore.beginJourney(projectId, 'private_import_handoff');
  if (!decision.allowed) {
    return { status: 'journey_blocked', record: null, reason: decision.reason };
  }

  // Gate 3 — the selected repository and branch are live-accessible right now.
  const accessible = await deps.verifyRepositoryAccess(
    handoff.owner,
    selection.repo,
    selection.branch
  );
  if (!accessible) {
    return {
      status: 'inaccessible',
      record: null,
      reason: 'selected repository or branch is not accessible',
    };
  }

  // Persist the pending selection FIRST, then update ONLY this project's mapping
  // from the recorded selection, then mark completion. Each step is idempotent so
  // repeating or repairing a partial adoption converges on the same mapping.
  const selected = await deps.handoffStore.recordSelection(
    projectId,
    selection.repo,
    selection.branch
  );
  const adoption = selected.adoption;
  if (!adoption) {
    // Unreachable: recordSelection always sets a selection. Fail loud if it did not.
    throw new Error(`Adoption selection was not persisted for ${projectId}`);
  }

  await deps.mappingWriter.setProjectMapping(
    projectId,
    adoption.selectedRepo,
    adoption.selectedBranch
  );

  const completed = await deps.handoffStore.recordCompletion(projectId);
  return { status: 'adopted', record: completed, reason: null };
}
