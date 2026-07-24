/**
 * Headless controller for the guided native-sync handoff surface.
 *
 * Holds the transient journey UI state (loaded handoff record, discovery result,
 * current selection, last adoption outcome, discovery connection-error flag,
 * dismissed flag) and orchestrates child-02 discovery and adoption. getView()
 * maps that state into 03a's HandoffViewInput and returns deriveHandoffView(...),
 * so every phase/action decision stays in the reviewed presenter.
 *
 * The controller re-implements no policy: child 02's adoptRepository owns the
 * attestation / single-active-journey / live-access gates and the staged,
 * idempotent mapping write, and 03a's deriveHandoffView owns the view. This class
 * only sequences user actions and records their results, and it shows 'completed'
 * only from the persisted record adoptRepository returns — never from a transient
 * outcome. The composition root that builds the real-service AdoptionDeps lives in
 * child 03b-ii; this class is cheap to construct (assigns collaborators only).
 */

import { deriveHandoffView } from './nativeSyncHandoffView';
import type { HandoffViewInput, NativeSyncHandoffView } from './nativeSyncHandoffView';
import { adoptRepository, discoverAdoptionCandidates } from './nativeSyncRepositoryAdoption';
import type {
  AdoptionAttestation,
  AdoptionDeps,
  AdoptionSelection,
  NativeSyncAdoptionOutcome,
} from './nativeSyncRepositoryAdoption';
import type { NativeSyncCandidateMode, NativeSyncCandidateResult } from './nativeSyncAdoption';
import type { NativeSyncHandoffRecord } from './nativeSyncHandoff';

export class NativeSyncHandoffController {
  private handoff: NativeSyncHandoffRecord | null = null;
  private discovery: NativeSyncCandidateResult | null = null;
  private selection: AdoptionSelection | null = null;
  private lastOutcome: NativeSyncAdoptionOutcome | null = null;
  private connectionError = false;
  private dismissed = false;

  constructor(
    private readonly deps: AdoptionDeps,
    private readonly projectId: string
  ) {}

  /** Return the current view by mapping controller state through 03a's deriveHandoffView. */
  getView(): NativeSyncHandoffView {
    const input: HandoffViewInput = {
      handoff: this.handoff,
      discovery: this.discovery,
      selection: this.selection,
      lastOutcome: this.lastOutcome,
      connectionError: this.connectionError,
      dismissed: this.dismissed,
    };
    return deriveHandoffView(input);
  }

  /** Load the project's handoff record from the handoff store into controller state. */
  async load(): Promise<void> {
    this.handoff = await this.deps.handoffStore.getHandoff(this.projectId);
  }

  /** Discover suggested candidates for the loaded handoff. */
  async discover(): Promise<void> {
    await this.runDiscovery('suggested', null);
  }

  /** Discover candidates in explicit search mode — the manual escape hatch. */
  async search(query: string): Promise<void> {
    await this.runDiscovery('search', query);
  }

  /** Record the user's explicit repository/branch selection, moving the view to confirm. */
  select(repo: string, branch: string): void {
    this.selection = { repo, branch };
  }

  /** Clear the current selection and any transient error signals, returning to discovery or guidance. */
  back(): void {
    this.selection = null;
    this.lastOutcome = null;
    this.connectionError = false;
  }

  /**
   * Adopt the current selection via child-02 adoptRepository using an attestation
   * built from the selection. On 'adopted' load the returned completed record; on
   * any blocking status record only the outcome (adoptRepository writes no mapping
   * in that case).
   */
  async attestAndAdopt(attested: boolean): Promise<void> {
    const selection = this.selection;
    if (!selection) {
      return;
    }
    const attestation: AdoptionAttestation = {
      attested,
      confirmedRepo: selection.repo,
      confirmedBranch: selection.branch,
    };
    const result = await adoptRepository(this.deps, this.projectId, selection, attestation);
    this.lastOutcome = result.status;
    if (result.status === 'adopted') {
      if (result.record) {
        this.handoff = result.record;
      }
      this.selection = null;
    }
  }

  /** Clear transient error signals and re-run discovery after a degraded state. */
  async retry(): Promise<void> {
    this.connectionError = false;
    this.lastOutcome = null;
    await this.discover();
  }

  /** Mark the surface dismissed so the view becomes the resumable dismissed state. */
  dismiss(): void {
    this.dismissed = true;
  }

  /** Clear the dismissed flag so the view returns to its active phase. */
  resume(): void {
    this.dismissed = false;
  }

  /** Shared discovery path: ensure the handoff is loaded, then discover and record success/failure. */
  private async runDiscovery(mode: NativeSyncCandidateMode, query: string | null): Promise<void> {
    if (this.handoff === null) {
      await this.load();
    }
    const handoff = this.handoff;
    if (handoff === null) {
      return;
    }
    try {
      this.discovery = await discoverAdoptionCandidates(this.deps, handoff, mode, query);
      this.connectionError = false;
    } catch {
      this.connectionError = true;
    }
  }
}
