/**
 * Shared test utilities for App.svelte tests
 *
 * This module provides common helper functions, fixtures, and utilities
 * for testing the main App component across multiple test files.
 */

import { vi } from 'vitest';
import type { GitHubSettingsState } from '$lib/stores/githubSettings';
import type { ProjectSettingsState } from '$lib/stores/projectSettings';
import type { UIState } from '$lib/stores/uiState';
import type { FileChangesState } from '$lib/stores/fileChanges';
import type { UploadState } from '$lib/stores/uploadState';

/**
 * Create a mock store with subscribe method
 */
export function createMockStore<T>(initialValue: T) {
  let value = initialValue;
  const subscribers = new Set<(value: T) => void>();

  return {
    subscribe: vi.fn((callback: (value: T) => void) => {
      subscribers.add(callback);
      callback(value);
      return () => subscribers.delete(callback);
    }),
    set: vi.fn((newValue: T) => {
      value = newValue;
      subscribers.forEach((cb) => cb(value));
    }),
    update: vi.fn((fn: (value: T) => T) => {
      value = fn(value);
      subscribers.forEach((cb) => cb(value));
    }),
  };
}

/**
 * Default GitHub settings for tests
 */
export const DEFAULT_GITHUB_SETTINGS: GitHubSettingsState = {
  githubToken: '',
  repoOwner: '',
  repoName: '',
  branch: 'main',
  projectSettings: {},
  isValidatingToken: false,
  isTokenValid: null,
  validationError: null,
  hasInitialSettings: false,
  authenticationMethod: 'github_app',
  githubAppInstallationId: null,
  githubAppUsername: null,
  githubAppAvatarUrl: null,
};

/**
 * Valid GitHub settings with PAT authentication
 */
export const VALID_PAT_SETTINGS: GitHubSettingsState = {
  ...DEFAULT_GITHUB_SETTINGS,
  githubToken: 'test-token',
  repoOwner: 'test-owner',
  repoName: 'test-repo',
  branch: 'main',
  hasInitialSettings: true,
  authenticationMethod: 'pat',
  isTokenValid: true,
};

/**
 * Valid GitHub settings with GitHub App authentication
 */
export const VALID_GITHUB_APP_SETTINGS: GitHubSettingsState = {
  ...DEFAULT_GITHUB_SETTINGS,
  repoOwner: 'test-owner',
  repoName: 'test-repo',
  branch: 'main',
  hasInitialSettings: true,
  authenticationMethod: 'github_app',
  githubAppInstallationId: 12345,
  githubAppUsername: 'test-owner',
  githubAppAvatarUrl: 'https://example.com/avatar.png',
};

/**
 * Default project settings for tests
 */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettingsState = {
  version: '1.3.12',
  currentUrl: '',
  parsedProjectId: null,
  isBoltSite: false,
  projectTitle: '',
};

/**
 * Project settings for when user is on a Bolt project
 */
export const ON_BOLT_PROJECT_SETTINGS: ProjectSettingsState = {
  version: '1.3.12',
  currentUrl: 'https://bolt.new/~/test-project',
  parsedProjectId: 'test-project',
  isBoltSite: true,
  projectTitle: 'Test Project',
};

/**
 * Default UI state for tests
 */
export const DEFAULT_UI_STATE: UIState = {
  activeTab: 'home',
  status: '',
  hasStatus: false,
  showTempRepoModal: false,
  tempRepoData: null,
  hasDeletedTempRepo: false,
  hasUsedTempRepoName: false,
};

/**
 * Default file changes state for tests
 */
export const DEFAULT_FILE_CHANGES_STATE: FileChangesState = {
  fileChanges: new Map(),
  showModal: false,
};

/**
 * Default upload state for tests
 */
export const DEFAULT_UPLOAD_STATE: UploadState = {
  uploadStatus: 'idle',
  uploadProgress: 0,
  uploadMessage: '',
  port: null,
};

/**
 * Create mock Chrome storage with initial values
 */
export function createMockChromeStorage(initialValues: Record<string, unknown> = {}) {
  const storage = { ...initialValues };

  return {
    get: vi.fn((keys: string | string[] | Record<string, unknown>) => {
      if (typeof keys === 'string') {
        return Promise.resolve({ [keys]: storage[keys] });
      } else if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        keys.forEach((key) => {
          result[key] = storage[key];
        });
        return Promise.resolve(result);
      } else {
        // Object with defaults
        const result: Record<string, unknown> = {};
        Object.keys(keys).forEach((key) => {
          result[key] = storage[key] ?? keys[key];
        });
        return Promise.resolve(result);
      }
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(storage, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach((key) => delete storage[key]);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      Object.keys(storage).forEach((key) => delete storage[key]);
      return Promise.resolve();
    }),
  };
}

/**
 * Setup Chrome runtime message listener mock
 */
export function setupChromeMessageListener() {
  const listeners = new Set<(message: unknown) => void>();

  return {
    addListener: vi.fn((callback: (message: unknown) => void) => {
      listeners.add(callback);
    }),
    removeListener: vi.fn((callback: (message: unknown) => void) => {
      listeners.delete(callback);
    }),
    // Helper to trigger messages
    trigger: (message: unknown) => {
      listeners.forEach((callback) => callback(message));
    },
  };
}

/**
 * Wait for next tick (useful for reactive statements)
 */
export function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait for multiple ticks
 */
export function waitForTicks(count: number): Promise<void> {
  return new Promise((resolve) => {
    let ticks = 0;
    const tick = () => {
      ticks++;
      if (ticks >= count) {
        resolve();
      } else {
        setTimeout(tick, 0);
      }
    };
    tick();
  });
}

/**
 * Create a mock temp repo metadata object
 */
export function createMockTempRepo() {
  return {
    owner: 'test-owner',
    tempRepo: 'bolt-project-temp-123',
    originalRepo: 'bolt-project',
    timestamp: Date.now(),
  };
}

/**
 * Create a mock file change object
 */
export function createMockFileChange(
  filename: string,
  status: 'added' | 'modified' | 'deleted' = 'modified'
) {
  return {
    filename,
    status,
    additions: status === 'added' ? 10 : status === 'modified' ? 5 : 0,
    deletions: status === 'deleted' ? 10 : status === 'modified' ? 3 : 0,
    changes: status === 'added' ? 10 : status === 'modified' ? 8 : 10,
    patch: status === 'deleted' ? '' : '@@ -1,3 +1,5 @@\n-old line\n+new line',
  };
}

/**
 * Mock window event listener
 */
export function setupWindowEventListener() {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    addEventListener: vi.fn((event: string, callback: EventListener) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
    }),
    removeEventListener: vi.fn((event: string, callback: EventListener) => {
      listeners.get(event)?.delete(callback);
    }),
    // Helper to trigger events
    trigger: (event: string, detail?: unknown) => {
      const customEvent = new CustomEvent(event, { detail });
      listeners.get(event)?.forEach((callback) => callback(customEvent));
    },
  };
}

/**
 * Create a complete mock store set for App.svelte
 */
export function createMockStores() {
  return {
    githubSettings: createMockStore(DEFAULT_GITHUB_SETTINGS),
    projectSettings: createMockStore(DEFAULT_PROJECT_SETTINGS),
    uiState: createMockStore(DEFAULT_UI_STATE),
    fileChanges: createMockStore(DEFAULT_FILE_CHANGES_STATE),
    uploadState: createMockStore(DEFAULT_UPLOAD_STATE),
    isSettingsValid: createMockStore(false),
    isAuthenticationValid: createMockStore(false),
    isOnBoltProject: createMockStore(false),
    currentProjectId: createMockStore(null as string | null),
    isAuthenticated: createMockStore(false),
    isPremium: createMockStore(false),
  };
}
