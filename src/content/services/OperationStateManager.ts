/**
 * Operation State Manager
 *
 * Tracks ongoing operations to prevent conflicting notifications and actions.
 * Used by PushReminderService to avoid showing reminders during active operations.
 *
 * IMPORTANT: This manager supports cross-context synchronization between background
 * service and content scripts using Chrome storage API.
 */

import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('OperationStateManager');

export interface OngoingOperation {
  type: 'push' | 'import' | 'clone' | 'sync' | 'comparison' | 'auth' | 'api';
  id: string;
  startTime: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface OperationStateEvents {
  operationStarted: (operation: OngoingOperation) => void;
  operationCompleted: (operationId: string) => void;
  operationFailed: (operationId: string, error?: Error) => void;
}

/**
 * Centralized operation state management service with cross-context synchronization
 */
export class OperationStateManager {
  private static instance: OperationStateManager | null = null;
  private operations: Map<string, OngoingOperation> = new Map();
  private listeners: Partial<OperationStateEvents> = {};

  // Timeout to prevent operations from being tracked indefinitely
  private readonly OPERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private timeoutMap: Map<string, NodeJS.Timeout> = new Map();

  // Storage key for cross-context synchronization
  private readonly STORAGE_KEY = 'operationState';

  // Flag to prevent infinite sync loops
  private isSyncing = false;

  // Context identification
  private readonly context: string;

  private constructor() {
    // Identify the context where this instance is running
    this.context = this.detectContext();
    logger.info(`🔧 OperationStateManager: Initializing in ${this.context} context`);

    // Set up storage listener for cross-context synchronization
    this.setupStorageListener();

    // Load initial state from storage
    this.loadStateFromStorage();
  }

  /**
   * Detect the execution context
   */
  private detectContext(): string {
    try {
      // Check if we're in service worker context
      if (typeof importScripts !== 'undefined') {
        return 'background';
      }

      // Check if we're in content script context
      if (typeof window !== 'undefined' && window.location) {
        return 'content';
      }

      // Check if we're in popup context
      if (typeof chrome !== 'undefined' && chrome.extension) {
        return 'popup';
      }

      return 'unknown';
    } catch (error) {
      logger.error('Error detecting context:', error);
      return 'unknown';
    }
  }

  /**
   * Set up storage listener for cross-context synchronization
   */
  private setupStorageListener(): void {
    try {
      chrome.storage.onChanged.addListener(
        (changes: { [key: string]: chrome.storage.StorageChange }, namespace: string) => {
          if (namespace === 'local' && changes[this.STORAGE_KEY] && !this.isSyncing) {
            logger.info(`🔄 OperationStateManager [${this.context}]: Syncing from storage`);
            this.syncFromStorage(changes[this.STORAGE_KEY].newValue);
          }
        }
      );
    } catch (error) {
      logger.warn(
        `⚠️ OperationStateManager [${this.context}]: Storage listener setup failed:`,
        error
      );
    }
  }

  /**
   * Load initial state from storage
   */
  private async loadStateFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      if (result[this.STORAGE_KEY]) {
        logger.info(
          `📥 OperationStateManager [${this.context}]: Loading initial state from storage`
        );
        this.syncFromStorage(result[this.STORAGE_KEY]);
      }
    } catch (error) {
      logger.warn(
        `⚠️ OperationStateManager [${this.context}]: Failed to load initial state:`,
        error
      );
    }
  }

  /**
   * Sync state from storage
   */
  private syncFromStorage(storageData: unknown): void {
    if (!storageData || typeof storageData !== 'object' || !('operations' in storageData)) {
      return;
    }

    const data = storageData as { operations: OngoingOperation[] };

    this.isSyncing = true;

    try {
      // Clear current operations and timeouts
      this.clearAllTimeouts();
      this.operations.clear();

      // Load operations from storage
      data.operations.forEach((op: OngoingOperation) => {
        this.operations.set(op.id, op);

        // Set up timeout for this operation
        const remainingTime = Math.max(0, op.startTime + this.OPERATION_TIMEOUT_MS - Date.now());
        if (remainingTime > 0) {
          const timeout = setTimeout(() => {
            logger.warn(
              `⏰ OperationStateManager [${this.context}]: Operation ${op.type}:${op.id} timed out after sync`
            );
            this.completeOperation(op.id);
          }, remainingTime);
          this.timeoutMap.set(op.id, timeout);
        } else {
          // Operation already timed out, complete it
          this.completeOperation(op.id);
        }
      });

      logger.info(
        `🔄 OperationStateManager [${this.context}]: Synced ${this.operations.size} operations from storage`
      );
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Save current state to storage
   */
  private async saveStateToStorage(): Promise<void> {
    if (this.isSyncing) {
      return; // Don't save while syncing to avoid loops
    }

    try {
      const storageData = {
        operations: Array.from(this.operations.values()),
        lastUpdated: Date.now(),
        context: this.context,
      };

      await chrome.storage.local.set({ [this.STORAGE_KEY]: storageData });
      logger.info(`💾 OperationStateManager [${this.context}]: Saved state to storage`);
    } catch (error) {
      logger.warn(`⚠️ OperationStateManager [${this.context}]: Failed to save state:`, error);
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): OperationStateManager {
    if (!OperationStateManager.instance) {
      OperationStateManager.instance = new OperationStateManager();
    }
    return OperationStateManager.instance;
  }

  /**
   * Start tracking an operation
   */
  public async startOperation(
    type: OngoingOperation['type'],
    id: string,
    description?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const operation: OngoingOperation = {
      type,
      id,
      startTime: Date.now(),
      description,
      metadata,
    };

    logger.info(`🏃 OperationStateManager [${this.context}]: Starting operation ${type}:${id}`, {
      description,
      metadata,
    });

    this.operations.set(id, operation);

    // Set up timeout to auto-complete stuck operations
    const timeout = setTimeout(() => {
      logger.warn(
        `⏰ OperationStateManager [${this.context}]: Operation ${type}:${id} timed out after ${this.OPERATION_TIMEOUT_MS / 1000}s`
      );
      this.completeOperation(id);
    }, this.OPERATION_TIMEOUT_MS);

    this.timeoutMap.set(id, timeout);

    // Save to storage for cross-context sync
    await this.saveStateToStorage();

    // Notify listeners
    this.listeners.operationStarted?.(operation);
  }

  /**
   * Mark an operation as completed
   */
  public async completeOperation(id: string): Promise<void> {
    const operation = this.operations.get(id);
    if (operation) {
      const duration = Date.now() - operation.startTime;
      logger.info(
        `✅ OperationStateManager [${this.context}]: Completed operation ${operation.type}:${id} after ${Math.round(duration / 1000)}s`
      );

      this.operations.delete(id);
      this.clearTimeout(id);

      // Save to storage for cross-context sync
      await this.saveStateToStorage();

      // Notify listeners
      this.listeners.operationCompleted?.(id);
    }
  }

  /**
   * Mark an operation as failed
   */
  public async failOperation(id: string, error?: Error): Promise<void> {
    const operation = this.operations.get(id);
    if (operation) {
      const duration = Date.now() - operation.startTime;
      logger.info(
        `❌ OperationStateManager [${this.context}]: Failed operation ${operation.type}:${id} after ${Math.round(duration / 1000)}s`,
        error
      );

      this.operations.delete(id);
      this.clearTimeout(id);

      // Save to storage for cross-context sync
      await this.saveStateToStorage();

      // Notify listeners
      this.listeners.operationFailed?.(id, error);
    }
  }

  /**
   * Check if any operations of specific types are ongoing
   */
  public hasOngoingOperations(types?: OngoingOperation['type'][]): boolean {
    if (!types) {
      return this.operations.size > 0;
    }

    for (const operation of this.operations.values()) {
      if (types.includes(operation.type)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all ongoing operations
   */
  public getOngoingOperations(): OngoingOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get ongoing operations of specific types
   */
  public getOngoingOperationsByType(types: OngoingOperation['type'][]): OngoingOperation[] {
    return Array.from(this.operations.values()).filter((op) => types.includes(op.type));
  }

  /**
   * Check if a specific operation is ongoing
   */
  public isOperationOngoing(id: string): boolean {
    return this.operations.has(id);
  }

  /**
   * Add event listener
   */
  public addEventListener<K extends keyof OperationStateEvents>(
    event: K,
    listener: OperationStateEvents[K]
  ): void {
    this.listeners[event] = listener;
  }

  /**
   * Remove event listener
   */
  public removeEventListener<K extends keyof OperationStateEvents>(event: K): void {
    delete this.listeners[event];
  }

  /**
   * Get debug information
   */
  public getDebugInfo(): object {
    return {
      context: this.context,
      operationsCount: this.operations.size,
      operations: Array.from(this.operations.values()).map((op) => ({
        type: op.type,
        id: op.id,
        description: op.description,
        durationMs: Date.now() - op.startTime,
        startTime: new Date(op.startTime).toISOString(),
      })),
      timeouts: this.timeoutMap.size,
      isSyncing: this.isSyncing,
    };
  }

  /**
   * Clear timeout for an operation
   */
  private clearTimeout(id: string): void {
    const timeout = this.timeoutMap.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeoutMap.delete(id);
    }
  }

  /**
   * Clear all timeouts
   */
  private clearAllTimeouts(): void {
    for (const timeout of this.timeoutMap.values()) {
      clearTimeout(timeout);
    }
    this.timeoutMap.clear();
  }

  /**
   * Clean up all operations and timeouts
   */
  public async cleanup(): Promise<void> {
    logger.info(`🧹 OperationStateManager [${this.context}]: Cleaning up all operations`);

    // Clear all timeouts
    this.clearAllTimeouts();

    this.operations.clear();
    this.listeners = {};

    // Clear storage
    try {
      await chrome.storage.local.remove([this.STORAGE_KEY]);
    } catch (error) {
      logger.warn(`⚠️ OperationStateManager [${this.context}]: Failed to clear storage:`, error);
    }
  }

  /**
   * Force clear all operations (for testing or emergency reset)
   */
  public async clearAllOperations(): Promise<void> {
    logger.info(`🧹 OperationStateManager [${this.context}]: Force clearing all operations`);
    await this.cleanup();
  }

  /**
   * Force refresh state from storage (for testing)
   */
  public async forceRefreshFromStorage(): Promise<void> {
    logger.info(`🔄 OperationStateManager [${this.context}]: Force refreshing from storage`);
    await this.loadStateFromStorage();
  }
}
