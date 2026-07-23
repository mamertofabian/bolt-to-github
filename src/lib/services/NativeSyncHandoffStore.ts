import { buildPendingHandoffRecord, parseStoredHandoff } from '../native-sync/nativeSyncHandoff';
import type { NativeSyncHandoffRecord, TempImportSummary } from '../native-sync/nativeSyncHandoff';
import type { JourneyClock } from './NativeSyncJourneyStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('NativeSyncHandoffStore');

/** chrome.storage.local key holding the map of projectId -> handoff record. */
const NATIVE_SYNC_HANDOFFS_STORAGE_KEY = 'nativeSyncHandoffs';

/**
 * Narrow persistence gateway for the native-sync handoffs map. Keeps
 * NativeSyncHandoffStore decoupled from chrome.storage so its logic can be
 * tested against an in-memory fake.
 */
export interface HandoffRecordStorage {
  read: () => Promise<Record<string, unknown>>;
  write: (records: Record<string, NativeSyncHandoffRecord>) => Promise<void>;
}

/**
 * Versioned persistence for native-sync handoff records over an injected
 * HandoffRecordStorage gateway and clock. Records live in a key separate from
 * projectSettings, so handoff handling can never erase a project mapping.
 */
export class NativeSyncHandoffStore {
  constructor(
    private readonly storage: HandoffRecordStorage,
    private readonly now: JourneyClock = () => Date.now()
  ) {}

  /**
   * Persist a pending handoff record for a final project id idempotently and
   * return the stored record. A project id claims exactly one record: if a valid
   * record already exists (duplicate completion event or service-worker
   * restart), it is returned unchanged rather than overwritten, preserving the
   * originally captured import identity and createdAt.
   */
  async recordPendingHandoff(
    matchedImport: TempImportSummary,
    projectId: string
  ): Promise<NativeSyncHandoffRecord> {
    const records = await this.storage.read();
    const existing = this.parseExisting(records, projectId);
    if (existing) {
      return existing;
    }

    const record = buildPendingHandoffRecord(matchedImport, projectId, this.now());
    records[projectId] = record;
    await this.persist(records);
    return record;
  }

  /**
   * Return the current-version handoff record for a project, migrating legacy
   * records in memory. Returns null for absent or malformed entries and never
   * writes.
   */
  async getHandoff(projectId: string): Promise<NativeSyncHandoffRecord | null> {
    const records = await this.storage.read();
    return this.parseExisting(records, projectId);
  }

  /**
   * Persist the handoffs map. Entries for other projects are written back
   * verbatim to preserve them — they may still be legacy-shaped, hence the cast
   * from the raw read map; only the caller's own entry is a freshly normalized
   * record.
   */
  private async persist(records: Record<string, unknown>): Promise<void> {
    await this.storage.write(records as Record<string, NativeSyncHandoffRecord>);
  }

  /**
   * Parse a project's stored entry into a current record, or null when absent or
   * malformed. Malformed entries are left untouched in the raw map so callers do
   * not silently drop them.
   */
  private parseExisting(
    records: Record<string, unknown>,
    projectId: string
  ): NativeSyncHandoffRecord | null {
    if (!(projectId in records)) {
      return null;
    }
    const parsed = parseStoredHandoff(projectId, records[projectId]);
    if (parsed.status === 'malformed') {
      logger.warn(`Malformed native-sync handoff record for ${projectId}: ${parsed.reason}`);
      return null;
    }
    return parsed.record;
  }
}

/**
 * Build the production HandoffRecordStorage backed by chrome.storage.local under
 * the dedicated nativeSyncHandoffs key.
 */
export function createChromeLocalHandoffStorage(): HandoffRecordStorage {
  return {
    async read(): Promise<Record<string, unknown>> {
      const result = await chrome.storage.local.get(NATIVE_SYNC_HANDOFFS_STORAGE_KEY);
      const value = result[NATIVE_SYNC_HANDOFFS_STORAGE_KEY];
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    },
    async write(records: Record<string, NativeSyncHandoffRecord>): Promise<void> {
      await chrome.storage.local.set({ [NATIVE_SYNC_HANDOFFS_STORAGE_KEY]: records });
    },
  };
}
