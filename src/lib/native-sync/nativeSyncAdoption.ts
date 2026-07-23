/**
 * Pure native-sync repository-adoption candidate ranking.
 *
 * After a private-import handoff, bolt.new's native GitHub setup creates a new
 * repository under the authenticated user. This module ranks plausible
 * candidates for adoption without any I/O: it never guesses or auto-selects, it
 * only orders and labels what the caller supplies.
 *
 * Safety rules encoded here:
 * - The original private repository and the temporary import repository are
 *   never candidates.
 * - Candidates are restricted to the handoff owner (the global repoOwner), so a
 *   cross-owner repository can never be offered for a single project.
 * - In 'suggested' mode, repositories created before the handoff are omitted —
 *   they cannot be the just-created Bolt repository. An explicit 'search' still
 *   surfaces them, flagged, as an escape hatch.
 */

import type { NativeSyncHandoffRecord } from './nativeSyncHandoff';

/** Distinct discovery states: zero, exactly one, or several candidates. */
export type NativeSyncCandidateStatus = 'none' | 'single' | 'multiple';

/** Discovery mode: ranked suggestions vs. an explicit user search. */
export type NativeSyncCandidateMode = 'suggested' | 'search';

/**
 * Minimal owner-scoped repository shape the ranking consumes, decoupled from
 * RepoSummary and the GitHub API so the domain stays pure and fakeable.
 */
export interface RepositoryCandidateInput {
  owner: string;
  name: string;
  createdAt: number;
}

/** A ranked adoption candidate, flagged when it predates the handoff. */
export interface NativeSyncRepositoryCandidate {
  owner: string;
  name: string;
  createdAt: number;
  createdBeforeHandoff: boolean;
}

/** Ranked candidates plus the distinct zero/one/many discovery state. */
export interface NativeSyncCandidateResult {
  status: NativeSyncCandidateStatus;
  candidates: NativeSyncRepositoryCandidate[];
}

function discoveryStatus(count: number): NativeSyncCandidateStatus {
  if (count === 0) return 'none';
  if (count === 1) return 'single';
  return 'multiple';
}

/**
 * Rank adoption candidates for a completed handoff. Excludes the original and
 * temporary repositories and any repository not under `handoff.owner`. In
 * 'suggested' mode omits repositories created before `handoff.createdAt`; in
 * 'search' mode includes name-matching repositories flagged
 * `createdBeforeHandoff`. Sorts newest first and never auto-selects.
 */
export function rankAdoptionCandidates(
  repos: RepositoryCandidateInput[],
  handoff: NativeSyncHandoffRecord,
  mode: NativeSyncCandidateMode,
  query: string | null
): NativeSyncCandidateResult {
  const eligible = repos.filter(
    (repo) =>
      repo.owner === handoff.owner &&
      repo.name !== handoff.originalRepo &&
      repo.name !== handoff.tempRepo
  );

  let matched: RepositoryCandidateInput[];
  if (mode === 'suggested') {
    // Only repositories created at or after the handoff can be the Bolt-created one.
    matched = eligible.filter((repo) => repo.createdAt >= handoff.createdAt);
  } else {
    const needle = (query ?? '').toLowerCase();
    matched = eligible.filter((repo) => repo.name.toLowerCase().includes(needle));
  }

  const candidates: NativeSyncRepositoryCandidate[] = matched
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((repo) => ({
      owner: repo.owner,
      name: repo.name,
      createdAt: repo.createdAt,
      createdBeforeHandoff: repo.createdAt < handoff.createdAt,
    }));

  return { status: discoveryStatus(candidates.length), candidates };
}
