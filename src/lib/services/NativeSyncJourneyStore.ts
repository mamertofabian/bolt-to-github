import {
  applyImportProvenance,
  evaluateJourneyStart,
  parseStoredJourney,
} from '../native-sync/nativeSyncJourney';
import type {
  NativeSyncJourneyDecision,
  NativeSyncJourneyKind,
  NativeSyncJourneyRecord,
} from '../native-sync/nativeSyncJourney';
import { createLogger } from '../utils/logger';

const logger = createLogger('NativeSyncJourneyStore');

/** chrome.storage.local key holding the map of projectId -> journey record. */
const NATIVE_SYNC_JOURNEYS_STORAGE_KEY = 'nativeSyncJourneys';

/** Injected time source so store timestamps stay deterministic under test. */
export type JourneyClock = () => number;

/**
 * Narrow persistence gateway for the native-sync journeys map. Keeps
 * NativeSyncJourneyStore decoupled from chrome.storage so its logic can be
 * tested against an in-memory fake.
 */
export interface JourneyRecordStorage {
  read: () => Promise<Record<string, unknown>>;
  write: (records: Record<string, NativeSyncJourneyRecord>) => Promise<void>;
}

/**
 * Versioned persistence for native-sync journey records over an injected
 * JourneyRecordStorage gateway and clock. Records are stored separately from
 * projectSettings, so journey handling can never erase a project mapping.
 */
export class NativeSyncJourneyStore {
  constructor(
    private readonly storage: JourneyRecordStorage,
    private readonly now: JourneyClock = () => Date.now()
  ) {}

  /**
   * Persist private_import provenance for a project idempotently and return the
   * stored record. Safe to call again on a duplicate completion event or after
   * a service-worker restart: the original createdAt and any active journey are
   * preserved.
   */
  async recordImportProvenance(projectId: string): Promise<NativeSyncJourneyRecord> {
    const records = await this.storage.read();
    const existing = this.parseExisting(records, projectId);
    const updated = applyImportProvenance(existing, projectId, this.now());
    records[projectId] = updated;
    await this.persist(records);
    return updated;
  }

  /**
   * Return the current-version record for a project, migrating legacy records in
   * memory. Returns null for absent or malformed entries and never writes.
   */
  async getJourney(projectId: string): Promise<NativeSyncJourneyRecord | null> {
    const records = await this.storage.read();
    return this.parseExisting(records, projectId);
  }

  /**
   * Evaluate and, when allowed, persist the start of a native-sync journey of
   * the given kind. Enforces provenance rules and single-active-journey mutual
   * exclusion, and blocks visibly on a malformed stored record without erasing
   * it.
   */
  async beginJourney(
    projectId: string,
    kind: NativeSyncJourneyKind
  ): Promise<NativeSyncJourneyDecision> {
    const records = await this.storage.read();

    let existing: NativeSyncJourneyRecord | null = null;
    if (projectId in records) {
      const parsed = parseStoredJourney(projectId, records[projectId]);
      if (parsed.status === 'malformed') {
        logger.warn(
          `Refusing to start '${kind}' for ${projectId}: malformed journey record (${parsed.reason})`
        );
        return { allowed: false, reason: 'malformed_record', record: null };
      }
      existing = parsed.record;
    }

    const decision = evaluateJourneyStart(existing, projectId, kind, this.now());
    if (decision.allowed && decision.record) {
      records[projectId] = decision.record;
      await this.persist(records);
    }
    return decision;
  }

  /**
   * Persist the journeys map. Entries for other projects are written back
   * verbatim to preserve them — they may still be legacy-shaped, hence the cast
   * from the raw read map; only the caller's own entry is a freshly normalized
   * record.
   */
  private async persist(records: Record<string, unknown>): Promise<void> {
    await this.storage.write(records as Record<string, NativeSyncJourneyRecord>);
  }

  /**
   * Parse a project's stored entry into a current record, or null when absent or
   * malformed. Malformed entries are left untouched in the raw map so callers do
   * not silently drop them.
   */
  private parseExisting(
    records: Record<string, unknown>,
    projectId: string
  ): NativeSyncJourneyRecord | null {
    if (!(projectId in records)) {
      return null;
    }
    const parsed = parseStoredJourney(projectId, records[projectId]);
    if (parsed.status === 'malformed') {
      logger.warn(`Malformed native-sync journey record for ${projectId}: ${parsed.reason}`);
      return null;
    }
    return parsed.record;
  }
}

/**
 * Build the production JourneyRecordStorage backed by chrome.storage.local under
 * the dedicated nativeSyncJourneys key.
 */
export function createChromeLocalJourneyStorage(): JourneyRecordStorage {
  return {
    async read(): Promise<Record<string, unknown>> {
      const result = await chrome.storage.local.get(NATIVE_SYNC_JOURNEYS_STORAGE_KEY);
      const value = result[NATIVE_SYNC_JOURNEYS_STORAGE_KEY];
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    },
    async write(records: Record<string, NativeSyncJourneyRecord>): Promise<void> {
      await chrome.storage.local.set({ [NATIVE_SYNC_JOURNEYS_STORAGE_KEY]: records });
    },
  };
}
