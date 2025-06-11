/**
 * Log Storage Manager
 * Handles persistent storage of logs using chrome.storage.local with rotation
 */

// Log Storage Manager uses chrome.storage.local directly for better control

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  module: string;
  message: string;
  data?: unknown;
  context: 'background' | 'content' | 'popup' | 'unknown';
}

export interface LogBatch {
  id: string;
  startTime: string;
  endTime: string;
  entries: LogEntry[];
}

export class LogStorageManager {
  private static instance: LogStorageManager;
  private memoryBuffer: LogEntry[] = [];
  private pendingWrites: LogEntry[] = [];
  private writeTimer: number | null = null;
  private readonly MAX_MEMORY_ENTRIES = 1000;
  private readonly MAX_BATCH_SIZE = 100;
  private readonly WRITE_INTERVAL = 10000; // 10 seconds
  private readonly LOG_RETENTION_HOURS = 6;
  private readonly STORAGE_KEY_PREFIX = 'bolt_logs_';
  private readonly CURRENT_BATCH_KEY = 'bolt_logs_current';
  private readonly METADATA_KEY = 'bolt_logs_metadata';

  private constructor() {
    this.initializeStorage();
  }

  static getInstance(): LogStorageManager {
    if (!LogStorageManager.instance) {
      LogStorageManager.instance = new LogStorageManager();
    }
    return LogStorageManager.instance;
  }

  private async initializeStorage(): Promise<void> {
    // Load current batch into memory
    if (chrome.storage && chrome.storage.local) {
      const result = await chrome.storage.local.get([this.CURRENT_BATCH_KEY, this.METADATA_KEY]);
      const currentBatch = result[this.CURRENT_BATCH_KEY] as LogEntry[] | undefined;
      if (currentBatch) {
        this.memoryBuffer = currentBatch.slice(-this.MAX_MEMORY_ENTRIES);
      }

      // Check if rotation is needed based on last rotation time
      const metadata = result[this.METADATA_KEY] as { lastRotation?: string } | undefined;
      if (metadata?.lastRotation) {
        const lastRotation = new Date(metadata.lastRotation);
        const now = new Date();
        const hoursSinceRotation = (now.getTime() - lastRotation.getTime()) / (1000 * 60 * 60);

        if (hoursSinceRotation >= this.LOG_RETENTION_HOURS) {
          // Rotation is overdue
          this.rotateLogs();
        }
      }
    }

    // Schedule periodic writes
    this.scheduleWrite();
  }

  private getContext(): LogEntry['context'] {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Check if we're in a service worker (background script in Manifest V3)
      if (typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self) {
        return 'background';
      }

      // Check if we're in the popup or other extension pages
      if (typeof window !== 'undefined' && window.location?.href) {
        const url = window.location.href;

        // Check for popup.html in the URL
        if (url.includes('popup.html') || url.includes('/popup/')) {
          return 'popup';
        }

        // Check for logs.html
        if (url.includes('logs.html') || url.includes('/pages/')) {
          return 'popup'; // Treat logs page as popup context
        }

        // Check if it's a chrome-extension:// URL (popup or options page)
        if (url.startsWith('chrome-extension://')) {
          return 'popup';
        }
      }

      // If we're in a window context without chrome-extension:// URL, it's likely content script
      if (
        typeof window !== 'undefined' &&
        !window.location?.href?.startsWith('chrome-extension://')
      ) {
        return 'content';
      }

      // Default to content if we can't determine
      return 'content';
    }
    return 'unknown';
  }

  async addLog(
    level: LogEntry['level'],
    module: string,
    message: string,
    data?: unknown
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
      context: this.getContext(),
    };

    // Add to memory buffer
    this.memoryBuffer.push(entry);
    if (this.memoryBuffer.length > this.MAX_MEMORY_ENTRIES) {
      this.memoryBuffer.shift();
    }

    // Add to pending writes
    this.pendingWrites.push(entry);

    // Schedule write if needed
    if (this.pendingWrites.length >= this.MAX_BATCH_SIZE) {
      this.flushPendingWrites();
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) return;

    // Use global setTimeout which works in both window and service worker contexts
    const timeoutFn = typeof window !== 'undefined' ? window.setTimeout : setTimeout;

    this.writeTimer = timeoutFn(() => {
      this.writeTimer = null;
      this.flushPendingWrites();
      this.scheduleWrite();
    }, this.WRITE_INTERVAL) as unknown as number;
  }

  private async flushPendingWrites(): Promise<void> {
    if (this.pendingWrites.length === 0) return;
    if (!chrome.storage || !chrome.storage.local) return;

    const entriesToWrite = [...this.pendingWrites];
    this.pendingWrites = [];

    try {
      // Get current batch
      const result = await chrome.storage.local.get(this.CURRENT_BATCH_KEY);
      const currentBatch = (result[this.CURRENT_BATCH_KEY] as LogEntry[]) || [];
      const updatedBatch = [...currentBatch, ...entriesToWrite];

      // Save updated batch
      await chrome.storage.local.set({ [this.CURRENT_BATCH_KEY]: updatedBatch });

      // Update metadata
      await this.updateMetadata();
    } catch (error) {
      console.error('Failed to write logs to storage:', error);
      // Re-add entries to pending if write failed
      this.pendingWrites.unshift(...entriesToWrite);
    }
  }

  private async updateMetadata(includeRotation = false): Promise<void> {
    if (!chrome.storage || !chrome.storage.local) return;

    const metadata: Record<string, unknown> = {
      lastWrite: new Date().toISOString(),
      totalEntries: this.memoryBuffer.length,
    };

    if (includeRotation) {
      metadata.lastRotation = new Date().toISOString();
    }

    await chrome.storage.local.set({ [this.METADATA_KEY]: metadata });
  }

  async rotateLogs(): Promise<void> {
    try {
      if (!chrome.storage || !chrome.storage.local) return;

      const now = new Date();
      const cutoffTime = new Date(now.getTime() - this.LOG_RETENTION_HOURS * 60 * 60 * 1000);

      // Get all log keys
      const allKeys = await this.getAllLogKeys();

      // Archive current batch if it has entries
      const result = await chrome.storage.local.get(this.CURRENT_BATCH_KEY);
      const currentBatch = result[this.CURRENT_BATCH_KEY] as LogEntry[] | undefined;
      if (currentBatch && currentBatch.length > 0) {
        const batchId = `${this.STORAGE_KEY_PREFIX}${now.getTime()}`;
        await chrome.storage.local.set({
          [batchId]: currentBatch,
          [this.CURRENT_BATCH_KEY]: [],
        });
      }

      // Remove old batches
      for (const key of allKeys) {
        if (key === this.CURRENT_BATCH_KEY || key === this.METADATA_KEY) continue;

        const batchResult = await chrome.storage.local.get(key);
        const batch = batchResult[key] as LogEntry[] | undefined;
        if (batch && batch.length > 0) {
          const oldestEntry = new Date(batch[0].timestamp);
          if (oldestEntry < cutoffTime) {
            await chrome.storage.local.remove(key);
          }
        }
      }

      // Clean up memory buffer
      this.memoryBuffer = this.memoryBuffer.filter(
        (entry) => new Date(entry.timestamp) >= cutoffTime
      );

      // Update metadata with rotation timestamp
      await this.updateMetadata(true);
    } catch (error) {
      console.error('Failed to rotate logs:', error);
    }
  }

  private async getAllLogKeys(): Promise<string[]> {
    if (chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
          const keys = Object.keys(items).filter(
            (key) =>
              key.startsWith(this.STORAGE_KEY_PREFIX) ||
              key === this.CURRENT_BATCH_KEY ||
              key === this.METADATA_KEY
          );
          resolve(keys);
        });
      });
    }
    return [];
  }

  async getAllLogs(options?: {
    startTime?: Date;
    endTime?: Date;
    levels?: LogEntry['level'][];
    modules?: string[];
    contexts?: LogEntry['context'][];
  }): Promise<LogEntry[]> {
    if (!chrome.storage || !chrome.storage.local) return [];

    const allLogs: LogEntry[] = [];
    const keys = await this.getAllLogKeys();

    for (const key of keys) {
      if (key === this.METADATA_KEY) continue;

      const result = await chrome.storage.local.get(key);
      const batch = result[key] as LogEntry[] | undefined;
      if (batch) {
        allLogs.push(...batch);
      }
    }

    // Sort by timestamp
    allLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Apply filters
    let filteredLogs = allLogs;

    if (options) {
      if (options.startTime) {
        filteredLogs = filteredLogs.filter((log) => new Date(log.timestamp) >= options.startTime!);
      }
      if (options.endTime) {
        filteredLogs = filteredLogs.filter((log) => new Date(log.timestamp) <= options.endTime!);
      }
      if (options.levels && options.levels.length > 0) {
        filteredLogs = filteredLogs.filter((log) => options.levels!.includes(log.level));
      }
      if (options.modules && options.modules.length > 0) {
        filteredLogs = filteredLogs.filter((log) => options.modules!.includes(log.module));
      }
      if (options.contexts && options.contexts.length > 0) {
        filteredLogs = filteredLogs.filter((log) => options.contexts!.includes(log.context));
      }
    }

    return filteredLogs;
  }

  getRecentLogs(count: number = 100): LogEntry[] {
    return this.memoryBuffer.slice(-count);
  }

  async clearAllLogs(): Promise<void> {
    if (!chrome.storage || !chrome.storage.local) return;

    const keys = await this.getAllLogKeys();

    if (keys.length > 0) {
      await chrome.storage.local.remove(keys);
    }

    this.memoryBuffer = [];
    this.pendingWrites = [];
  }

  async exportLogs(format: 'json' | 'text' = 'json'): Promise<string> {
    const logs = await this.getAllLogs();

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else {
      return logs
        .map((log) => {
          const dataStr = log.data ? ` | Data: ${JSON.stringify(log.data)}` : '';
          return `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.context}] [${log.module}] ${log.message}${dataStr}`;
        })
        .join('\n');
    }
  }

  destroy(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.flushPendingWrites();
  }
}
