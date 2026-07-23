/**
 * Pure native-sync journey domain.
 *
 * Shared routing/provenance policy for both native-sync epics. This module has
 * no I/O: time is passed in as `now`, so every decision is deterministic and
 * testable in isolation. Lane eligibility depends ONLY on the stored provenance
 * and the single active journey — never on repository mapping presence,
 * repository name, or repository age.
 */

/** Which native-sync lane a project is going through. */
export type NativeSyncJourneyKind = 'private_import_handoff' | 'existing_project_migration';

/** How the Bolt project came to exist, as far as native-sync routing cares. */
export type NativeSyncProvenance = 'private_import' | 'none';

/** Outcome of parsing a stored raw journey value. */
export type NativeSyncJourneyParseStatus = 'valid' | 'migrated' | 'malformed';

/** Why a requested journey start was refused. */
export type NativeSyncJourneyDenyReason =
  | 'private_import_provenance'
  | 'requires_private_import_provenance'
  | 'another_active_journey'
  | 'malformed_record';

/** Current on-disk schema version for a native-sync journey record. */
const NATIVE_SYNC_JOURNEY_SCHEMA_VERSION = 1;

/** Versioned, per-project native-sync provenance and active-journey record. */
export interface NativeSyncJourneyRecord {
  schemaVersion: number;
  projectId: string;
  provenance: NativeSyncProvenance;
  activeJourney: NativeSyncJourneyKind | null;
  createdAt: number;
  updatedAt: number;
}

/** Result of evaluating whether a journey may start, plus the resulting record when allowed. */
export interface NativeSyncJourneyDecision {
  allowed: boolean;
  reason: NativeSyncJourneyDenyReason | null;
  record: NativeSyncJourneyRecord | null;
}

/** Outcome of parsing a stored raw journey value into a current record. */
export interface NativeSyncJourneyParseResult {
  status: NativeSyncJourneyParseStatus;
  record: NativeSyncJourneyRecord | null;
  reason: string | null;
}

/**
 * Idempotently mark a project's record with private_import provenance.
 *
 * Creates a fresh current-version record when none exists; otherwise preserves
 * the existing activeJourney and createdAt so a duplicate import-completion
 * event never resets prior state.
 */
export function applyImportProvenance(
  existing: NativeSyncJourneyRecord | null,
  projectId: string,
  now: number
): NativeSyncJourneyRecord {
  if (existing === null) {
    return {
      schemaVersion: NATIVE_SYNC_JOURNEY_SCHEMA_VERSION,
      projectId,
      provenance: 'private_import',
      activeJourney: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  return { ...existing, provenance: 'private_import', updatedAt: now };
}

/**
 * Decide whether a native-sync journey of `kind` may start.
 *
 * Precedence: a single active journey is enforced first (starting the same kind
 * again is idempotent; a different kind is refused as `another_active_journey`),
 * then provenance gates the lane. When allowed, the resulting record carries the
 * requested kind as its active journey.
 */
export function evaluateJourneyStart(
  record: NativeSyncJourneyRecord | null,
  projectId: string,
  kind: NativeSyncJourneyKind,
  now: number
): NativeSyncJourneyDecision {
  // Mutual exclusion: at most one active journey per project.
  if (record && record.activeJourney !== null) {
    if (record.activeJourney === kind) {
      return { allowed: true, reason: null, record: { ...record, updatedAt: now } };
    }
    return { allowed: false, reason: 'another_active_journey', record: null };
  }

  const provenance: NativeSyncProvenance = record ? record.provenance : 'none';

  if (kind === 'existing_project_migration' && provenance === 'private_import') {
    return { allowed: false, reason: 'private_import_provenance', record: null };
  }

  if (kind === 'private_import_handoff' && provenance !== 'private_import') {
    return { allowed: false, reason: 'requires_private_import_provenance', record: null };
  }

  const base: NativeSyncJourneyRecord = record ?? {
    schemaVersion: NATIVE_SYNC_JOURNEY_SCHEMA_VERSION,
    projectId,
    provenance,
    activeJourney: null,
    createdAt: now,
    updatedAt: now,
  };

  return {
    allowed: true,
    reason: null,
    record: { ...base, activeJourney: kind, updatedAt: now },
  };
}

/**
 * Validate and version-migrate a raw stored value into a current record.
 *
 * Legacy records (missing or older schemaVersion) are normalized deterministically
 * to the current version and reported as `migrated`; a current, well-formed record
 * is `valid`; anything irreparable is `malformed` (record null, reason set) and is
 * never thrown so callers can surface it as a visible block.
 */
export function parseStoredJourney(projectId: string, raw: unknown): NativeSyncJourneyParseResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'malformed', record: null, reason: 'not an object' };
  }

  const obj = raw as Record<string, unknown>;

  const rawProjectId = obj.projectId;
  if (typeof rawProjectId !== 'string' || rawProjectId.length === 0) {
    return { status: 'malformed', record: null, reason: 'missing or invalid projectId' };
  }

  const provenance: NativeSyncProvenance | null =
    obj.provenance === 'private_import'
      ? 'private_import'
      : obj.provenance === 'none'
        ? 'none'
        : null;
  if (provenance === null) {
    return {
      status: 'malformed',
      record: null,
      reason: `invalid provenance: ${String(obj.provenance)}`,
    };
  }

  let activeJourney: NativeSyncJourneyKind | null;
  const rawActiveJourney = obj.activeJourney;
  if (rawActiveJourney === undefined || rawActiveJourney === null) {
    activeJourney = null;
  } else if (
    rawActiveJourney === 'private_import_handoff' ||
    rawActiveJourney === 'existing_project_migration'
  ) {
    activeJourney = rawActiveJourney;
  } else {
    return {
      status: 'malformed',
      record: null,
      reason: `invalid activeJourney: ${String(rawActiveJourney)}`,
    };
  }

  const createdAt = typeof obj.createdAt === 'number' ? obj.createdAt : 0;
  const updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : 0;

  const record: NativeSyncJourneyRecord = {
    schemaVersion: NATIVE_SYNC_JOURNEY_SCHEMA_VERSION,
    projectId: rawProjectId,
    provenance,
    activeJourney,
    createdAt,
    updatedAt,
  };

  const status: NativeSyncJourneyParseStatus =
    obj.schemaVersion === NATIVE_SYNC_JOURNEY_SCHEMA_VERSION ? 'valid' : 'migrated';

  return { status, record, reason: null };
}
