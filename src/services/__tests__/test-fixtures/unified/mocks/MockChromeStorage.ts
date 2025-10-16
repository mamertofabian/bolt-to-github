/**
 * Mock Chrome Storage for Testing
 *
 * This module provides a mock implementation of Chrome's storage API for testing.
 * Supports both local and sync storage with configurable failure modes and delays.
 */

import { vi } from 'vitest';
import { StorageFixtures } from '../storage';

/**
 * Mock implementation of Chrome storage API
 *
 * Provides in-memory simulation of Chrome's storage.local and storage.sync APIs
 * with configurable behavior for testing various scenarios:
 * - Normal storage operations (get, set, remove, clear)
 * - Failure modes for error handling tests
 * - Delay simulation for async behavior tests
 * - Preset configurations for common test scenarios
 *
 * @example
 * ```ts
 * const storage = new MockChromeStorage();
 * storage.loadGitHubSettings();
 * storage.loadAuthenticationMethod('pat');
 * ```
 */
export class MockChromeStorage {
  private localStorage: Map<string, unknown> = new Map();
  private syncStorage: Map<string, unknown> = new Map();
  private shouldFail = false;
  private delay = 0;

  constructor() {
    this.setupChromeMocks();
  }

  private setupChromeMocks(): void {
    // Mock chrome.storage.local
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[]) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            if (!keys) {
              return Object.fromEntries(this.localStorage);
            }

            const keyArray = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, unknown> = {};

            for (const key of keyArray) {
              if (this.localStorage.has(key)) {
                result[key] = this.localStorage.get(key);
              }
            }

            return result;
          }),

          set: vi.fn(async (items: Record<string, unknown>) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            for (const [key, value] of Object.entries(items)) {
              this.localStorage.set(key, value);
            }
          }),

          remove: vi.fn(async (keys: string | string[]) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            const keyArray = Array.isArray(keys) ? keys : [keys];
            for (const key of keyArray) {
              this.localStorage.delete(key);
            }
          }),

          clear: vi.fn(async () => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }
            this.localStorage.clear();
          }),
        },

        sync: {
          get: vi.fn(async (keys?: string | string[]) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            if (!keys) {
              return Object.fromEntries(this.syncStorage);
            }

            const keyArray = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, unknown> = {};

            for (const key of keyArray) {
              if (this.syncStorage.has(key)) {
                result[key] = this.syncStorage.get(key);
              }
            }

            return result;
          }),

          set: vi.fn(async (items: Record<string, unknown>) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            for (const [key, value] of Object.entries(items)) {
              this.syncStorage.set(key, value);
            }
          }),

          remove: vi.fn(async (keys: string | string[]) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            const keyArray = Array.isArray(keys) ? keys : [keys];
            for (const key of keyArray) {
              this.syncStorage.delete(key);
            }
          }),

          clear: vi.fn(async () => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }
            this.syncStorage.clear();
          }),
        },
      },
    } as unknown as typeof chrome;
  }

  // Preset configurations
  loadGitHubSettings(settings?: Record<string, unknown>): void {
    this.localStorage.set(
      'gitHubSettings',
      settings || StorageFixtures.chromeStorage.githubSettings.gitHubSettings
    );
  }

  loadAuthenticationMethod(method: 'pat' | 'github_app' = 'pat'): void {
    this.localStorage.set('authenticationMethod', method);
  }

  loadSupabaseToken(token?: string): void {
    this.localStorage.set(
      'supabaseToken',
      token || StorageFixtures.chromeStorage.supabaseToken.supabaseToken
    );
  }

  loadProjectSettings(settings?: Record<string, unknown>): void {
    const projectSettings = settings || StorageFixtures.chromeStorage.projectSettings;
    for (const [key, value] of Object.entries(projectSettings)) {
      this.localStorage.set(key, value);
    }
  }

  // Test configuration
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setDelay(delay: number): void {
    this.delay = delay;
  }

  // Direct storage access for testing
  setItem(key: string, value: unknown, useSync: boolean = false): void {
    if (useSync) {
      this.syncStorage.set(key, value);
    } else {
      this.localStorage.set(key, value);
    }
  }

  getItem(key: string, useSync: boolean = false): unknown {
    return useSync ? this.syncStorage.get(key) : this.localStorage.get(key);
  }

  getAllItems(useSync: boolean = false): Record<string, unknown> {
    const storage = useSync ? this.syncStorage : this.localStorage;
    return Object.fromEntries(storage);
  }

  private async simulateDelay(): Promise<void> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }
  }

  reset(): void {
    this.localStorage.clear();
    this.syncStorage.clear();
    this.shouldFail = false;
    this.delay = 0;
    vi.clearAllMocks();
  }
}
