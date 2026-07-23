/**
 * Pure native-sync handoff domain.
 *
 * Turns a completed private-repository import into a durable, project-scoped
 * handoff record. This module has no I/O: time is passed in as `now`, so every
 * decision is deterministic and testable in isolation.
 *
 * The final Bolt project id carries no temporary-repository identity (the
 * extracted id is only the literal "github.com"; see
 * src/lib/utils/projectId.ts). Matching therefore relies on the persisted list
 * of pending temporary imports, and it never guesses: a single pending import is
 * claimed, zero yields no match, and more than one is reported ambiguous so the
 * extension never links the wrong original repository to a project.
 */

/** Lifecycle status of a native-sync handoff record. Child 01 only records 'pending'. */
export type NativeSyncHandoffStatus = 'pending';

/** Result of matching pending temporary imports to a completed import event. */
export type NativeSyncHandoffMatchStatus = 'matched' | 'none' | 'ambiguous';

/** Outcome of parsing a stored raw handoff value. */
export type NativeSyncHandoffParseStatus = 'valid' | 'migrated' | 'malformed';

/** Lifecycle of the repository-adoption sub-state added by child 02. */
export type NativeSyncAdoptionStatus = 'selected' | 'completed';

/**
 * Current on-disk schema version for a native-sync handoff record. Bumped to 2
 * by child 02 (repository adoption): version 1 records carry no `adoption`
 * sub-state and migrate deterministically by initializing it to null.
 */
const NATIVE_SYNC_HANDOFF_SCHEMA_VERSION = 2;

/**
 * Minimal identity of a pending temporary import, derived from TempRepoManager
 * metadata. Keeps this domain decoupled from the manager's full record shape.
 */
export interface TempImportSummary {
  originalRepo: string;
  tempRepo: string;
  owner: string;
  branch: string;
}

/**
 * Repository-adoption sub-state (child 02). Present once the user selects a
 * Bolt-created repository to adopt; `completed` once that repository has been
 * mapped as the project's canonical repository. Distinct from the base record
 * `status`, which stays 'pending' — this nesting keeps the child-01 contract
 * unchanged (additive chain merge, not a supersede).
 */
export interface NativeSyncAdoptionState {
  status: NativeSyncAdoptionStatus;
  selectedRepo: string;
  selectedBranch: string;
  completedAt: number | null;
}

/** Versioned, project-scoped durable handoff record for a completed private import. */
export interface NativeSyncHandoffRecord {
  schemaVersion: number;
  projectId: string;
  originalRepo: string;
  tempRepo: string;
  owner: string;
  branch: string;
  status: NativeSyncHandoffStatus;
  createdAt: number;
  updatedAt: number;
  /**
   * Adoption sub-state. Null when the handoff is pending adoption. Optional only
   * so pre-child-02 record literals still type-check; the domain always sets it.
   */
  adoption?: NativeSyncAdoptionState | null;
}

/** Result of matching pending temporary imports to a completed import event. */
export interface NativeSyncHandoffMatch {
  status: NativeSyncHandoffMatchStatus;
  matchedImport: TempImportSummary | null;
}

/** Outcome of parsing a stored raw handoff value into a current record. */
export interface NativeSyncHandoffParseResult {
  status: NativeSyncHandoffParseStatus;
  record: NativeSyncHandoffRecord | null;
  reason: string | null;
}

/**
 * Claim exactly one pending temporary import for a completed project.
 *
 * one -> matched; zero -> none; more than one -> ambiguous. On ambiguous no
 * import is selected (matchedImport null): the extension never guesses which
 * original repository belongs to the freshly completed project.
 */
export function matchPendingImport(tempImports: TempImportSummary[]): NativeSyncHandoffMatch {
  if (tempImports.length === 0) {
    return { status: 'none', matchedImport: null };
  }
  if (tempImports.length > 1) {
    return { status: 'ambiguous', matchedImport: null };
  }
  return { status: 'matched', matchedImport: tempImports[0] };
}

/**
 * Build a current-version pending handoff record from a matched import and the
 * final Bolt project id. The original repository identity is captured here so it
 * survives temporary-repository cleanup.
 */
export function buildPendingHandoffRecord(
  matchedImport: TempImportSummary,
  projectId: string,
  now: number
): NativeSyncHandoffRecord {
  return {
    schemaVersion: NATIVE_SYNC_HANDOFF_SCHEMA_VERSION,
    projectId,
    originalRepo: matchedImport.originalRepo,
    tempRepo: matchedImport.tempRepo,
    owner: matchedImport.owner,
    branch: matchedImport.branch,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    adoption: null,
  };
}

/**
 * Pure monotonic transition recording a 'selected' adoption sub-state with the
 * user-chosen repository and branch. Returns the record unchanged once it is
 * already completed, so an adopted mapping is locked and re-selection cannot
 * silently repoint it.
 */
export function applySelection(
  record: NativeSyncHandoffRecord,
  selectedRepo: string,
  selectedBranch: string,
  now: number
): NativeSyncHandoffRecord {
  if (record.adoption?.status === 'completed') {
    return record;
  }
  return {
    ...record,
    adoption: { status: 'selected', selectedRepo, selectedBranch, completedAt: null },
    updatedAt: now,
  };
}

/**
 * Pure monotonic transition marking a 'selected' adoption sub-state 'completed'
 * with completedAt set. A no-op when there is no selection to complete or the
 * record is already completed, so retries converge instead of diverging.
 */
export function applyCompletion(
  record: NativeSyncHandoffRecord,
  now: number
): NativeSyncHandoffRecord {
  const adoption = record.adoption;
  if (!adoption || adoption.status === 'completed') {
    return record;
  }
  return {
    ...record,
    adoption: { ...adoption, status: 'completed', completedAt: now },
    updatedAt: now,
  };
}

/** Extract a required non-empty string field or return null. */
function readRequiredString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

type AdoptionParse =
  | { ok: true; value: NativeSyncAdoptionState | null }
  | { ok: false; reason: string };

/**
 * Validate the optional adoption sub-state. Absent or null yields a null
 * sub-state; a present-but-invalid sub-state fails loud so callers can surface a
 * malformed record instead of silently dropping an adopted mapping.
 */
function parseAdoptionState(raw: unknown): AdoptionParse {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'adoption is not an object' };
  }

  const obj = raw as Record<string, unknown>;
  if (obj.status !== 'selected' && obj.status !== 'completed') {
    return { ok: false, reason: `invalid adoption status: ${String(obj.status)}` };
  }

  const selectedRepo = readRequiredString(obj, 'selectedRepo');
  const selectedBranch = readRequiredString(obj, 'selectedBranch');
  if (selectedRepo === null || selectedBranch === null) {
    return { ok: false, reason: 'adoption missing selectedRepo or selectedBranch' };
  }

  const completedAt = typeof obj.completedAt === 'number' ? obj.completedAt : null;

  return {
    ok: true,
    value: { status: obj.status, selectedRepo, selectedBranch, completedAt },
  };
}

/**
 * Validate and version-migrate a raw stored value into a current handoff record.
 *
 * A record already at the current schemaVersion is `valid`; an older or
 * version-less record with all required fields is normalized deterministically
 * and reported as `migrated`; anything irreparable is `malformed` (record null,
 * reason set) and is never thrown, so callers can surface it as a visible block
 * instead of silently dropping data.
 *
 * `projectId` is the key the value was stored under; it is authoritative over any
 * projectId embedded in the raw value.
 */
export function parseStoredHandoff(projectId: string, raw: unknown): NativeSyncHandoffParseResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'malformed', record: null, reason: 'not an object' };
  }

  const obj = raw as Record<string, unknown>;

  const originalRepo = readRequiredString(obj, 'originalRepo');
  const tempRepo = readRequiredString(obj, 'tempRepo');
  const owner = readRequiredString(obj, 'owner');
  const branch = readRequiredString(obj, 'branch');

  const missing: string[] = [];
  if (originalRepo === null) missing.push('originalRepo');
  if (tempRepo === null) missing.push('tempRepo');
  if (owner === null) missing.push('owner');
  if (branch === null) missing.push('branch');
  if (missing.length > 0) {
    return {
      status: 'malformed',
      record: null,
      reason: `missing or invalid field(s): ${missing.join(', ')}`,
    };
  }

  if (obj.status !== 'pending') {
    return { status: 'malformed', record: null, reason: `invalid status: ${String(obj.status)}` };
  }

  const adoptionResult = parseAdoptionState(obj.adoption);
  if (!adoptionResult.ok) {
    return { status: 'malformed', record: null, reason: adoptionResult.reason };
  }

  const createdAt = typeof obj.createdAt === 'number' ? obj.createdAt : 0;
  const updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : 0;

  const record: NativeSyncHandoffRecord = {
    schemaVersion: NATIVE_SYNC_HANDOFF_SCHEMA_VERSION,
    projectId,
    originalRepo: originalRepo as string,
    tempRepo: tempRepo as string,
    owner: owner as string,
    branch: branch as string,
    status: 'pending',
    createdAt,
    updatedAt,
    adoption: adoptionResult.value,
  };

  const status: NativeSyncHandoffParseStatus =
    obj.schemaVersion === NATIVE_SYNC_HANDOFF_SCHEMA_VERSION ? 'valid' : 'migrated';

  return { status, record, reason: null };
}
