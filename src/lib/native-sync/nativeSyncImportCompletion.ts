/**
 * Private-import completion coordinator.
 *
 * Sprouted, dependency-injected so the ordering and matching are testable with
 * real stores over in-memory gateways. BackgroundService only rewires the call
 * site and is not contracted here.
 *
 * When a bolt.new tab URL transitions from the temporary-import form to a final
 * Bolt project id, this coordinator matches the pending temporary import and, on
 * a single match, persists provenance and the pending handoff record BEFORE
 * temporary-repository cleanup runs. That ordering means the original repository
 * identity and routing provenance are durable before cleanup deletes the
 * temporary clone and before popup initialization can create or repair default
 * project settings. On none or ambiguous it records nothing but still cleans up.
 */

import { matchPendingImport } from './nativeSyncHandoff';
import type {
  NativeSyncHandoffMatchStatus,
  NativeSyncHandoffRecord,
  TempImportSummary,
} from './nativeSyncHandoff';
import type { NativeSyncJourneyStore } from '../services/NativeSyncJourneyStore';
import type { NativeSyncHandoffStore } from '../services/NativeSyncHandoffStore';

/**
 * Injected collaborators for private-import completion, so ordering and matching
 * are testable with real stores.
 */
export interface ImportCompletionDeps {
  journeyStore: NativeSyncJourneyStore;
  handoffStore: NativeSyncHandoffStore;
  listPendingImports: () => Promise<TempImportSummary[]>;
  cleanup: () => Promise<void>;
}

/** Outcome of handling a private-import completion event. */
export interface ImportCompletionResult {
  status: NativeSyncHandoffMatchStatus;
  record: NativeSyncHandoffRecord | null;
}

/**
 * Handle a private-import completion event for a final Bolt project id.
 *
 * On a single pending import: persist provenance and the pending handoff record
 * (in that order) BEFORE running cleanup, then clean up last. On none or
 * ambiguous: record neither provenance nor a handoff — never guessing which
 * original repository belongs to the project — and still run cleanup last so
 * temporary repositories are never orphaned.
 */
export async function completePrivateImportHandoff(
  deps: ImportCompletionDeps,
  projectId: string
): Promise<ImportCompletionResult> {
  const tempImports = await deps.listPendingImports();
  const match = matchPendingImport(tempImports);

  if (match.status === 'matched' && match.matchedImport) {
    // Persist durable provenance and handoff state BEFORE cleanup removes the
    // temporary clone, so the original repo identity and routing survive.
    await deps.journeyStore.recordImportProvenance(projectId);
    const record = await deps.handoffStore.recordPendingHandoff(match.matchedImport, projectId);
    await deps.cleanup();
    return { status: 'matched', record };
  }

  // none or ambiguous: never guess, record nothing, but still clean up.
  await deps.cleanup();
  return { status: match.status, record: null };
}
