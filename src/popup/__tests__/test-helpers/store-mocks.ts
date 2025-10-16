/**
 * Store mock implementations for App.svelte tests
 *
 * This module provides mock implementations of all the stores used by App.svelte.
 * These mocks allow tests to control store state and verify store interactions.
 */

import { vi } from 'vitest';

/**
 * Mock implementations for all store actions
 */

export const mockGithubSettingsActions = {
  initialize: vi.fn().mockResolvedValue(undefined),
  loadProjectSettings: vi.fn(),
  saveSettings: vi.fn().mockResolvedValue({ success: true }),
  setRepoName: vi.fn(),
  setProjectSettings: vi.fn(),
  setAuthenticationMethod: vi.fn(),
};

export const mockProjectSettingsActions = {
  initialize: vi.fn(),
  detectCurrentProject: vi.fn().mockResolvedValue(undefined),
};

export const mockUiStateActions = {
  setActiveTab: vi.fn(),
  showStatus: vi.fn(),
  clearStatus: vi.fn(),
  showTempRepoModal: vi.fn(),
  hideTempRepoModal: vi.fn(),
  markTempRepoDeleted: vi.fn(),
  markTempRepoNameUsed: vi.fn(),
  canCloseTempRepoModal: vi.fn().mockResolvedValue(true),
};

export const mockFileChangesActions = {
  processFileChangesMessage: vi.fn(),
  setFileChanges: vi.fn(),
  showModal: vi.fn(),
  loadStoredFileChanges: vi.fn().mockResolvedValue(false),
  requestFileChangesFromContentScript: vi.fn().mockResolvedValue(undefined),
};

export const mockUploadStateActions = {
  initializePort: vi.fn(),
  handleUploadStatusMessage: vi.fn(),
  disconnect: vi.fn(),
};

export const mockPremiumStatusActions = {
  initialize: vi.fn().mockResolvedValue(undefined),
};

/**
 * Reset all mock store actions
 */
export function resetAllStoreMocks() {
  Object.values(mockGithubSettingsActions).forEach((mock) => {
    if (vi.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
  Object.values(mockProjectSettingsActions).forEach((mock) => {
    if (vi.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
  Object.values(mockUiStateActions).forEach((mock) => {
    if (vi.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
  Object.values(mockFileChangesActions).forEach((mock) => {
    if (vi.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
  Object.values(mockUploadStateActions).forEach((mock) => {
    if (vi.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
  Object.values(mockPremiumStatusActions).forEach((mock) => {
    if (vi.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
}
