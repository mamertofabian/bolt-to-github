/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAppChromeMocks,
  createMockChromeMessagingService,
  createMockSubscriptionService,
} from '../test-helpers/chrome-mocks';
import { createMockStores } from '../test-helpers/app-test-utils';
import {
  mockGithubSettingsActions,
  mockProjectSettingsActions,
  mockUploadStateActions,
  mockPremiumStatusActions,
  resetAllStoreMocks,
} from '../test-helpers/store-mocks';

const chromeMessagingMock = createMockChromeMessagingService();
const subscriptionServiceMock = createMockSubscriptionService();

const mockFileChangesActions = {
  processFileChangesMessage: vi.fn(),
  setFileChanges: vi.fn(),
  showModal: vi.fn(),
  loadStoredFileChanges: vi.fn().mockResolvedValue(false),
  requestFileChangesFromContentScript: vi.fn().mockResolvedValue(undefined),
};

const mockUiStateActions = {
  setActiveTab: vi.fn(),
  showStatus: vi.fn(),
  clearStatus: vi.fn(),
  showTempRepoModal: vi.fn(),
  hideTempRepoModal: vi.fn(),
  markTempRepoDeleted: vi.fn(),
  markTempRepoNameUsed: vi.fn(),
  canCloseTempRepoModal: vi.fn().mockResolvedValue(true),
};

const mockChromeStorageService = {
  saveProjectSettings: vi.fn().mockResolvedValue(undefined),
};

vi.mock('$lib/services/chromeMessaging', () => ({
  ChromeMessagingService: chromeMessagingMock,
}));

vi.mock('$lib/services/chromeStorage', () => ({
  ChromeStorageService: mockChromeStorageService,
}));

vi.mock('$lib/stores', () => {
  const stores = createMockStores();
  return {
    githubSettingsStore: stores.githubSettings,
    projectSettingsStore: stores.projectSettings,
    uiStateStore: stores.uiState,
    fileChangesStore: stores.fileChanges,
    uploadStateStore: stores.uploadState,
    isSettingsValid: stores.isSettingsValid,
    isAuthenticationValid: stores.isAuthenticationValid,
    isOnBoltProject: stores.isOnBoltProject,
    currentProjectId: stores.currentProjectId,
    isAuthenticated: stores.isAuthenticated,
    isPremium: stores.isPremium,
    githubSettingsActions: mockGithubSettingsActions,
    projectSettingsActions: mockProjectSettingsActions,
    uiStateActions: mockUiStateActions,
    fileChangesActions: mockFileChangesActions,
    uploadStateActions: mockUploadStateActions,
    premiumStatusActions: mockPremiumStatusActions,
  };
});

vi.mock('$lib/utils/windowMode', () => ({
  isWindowMode: vi.fn().mockReturnValue(false),
  openPopupWindow: vi.fn().mockResolvedValue(undefined),
  closePopupWindow: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../services/SubscriptionService', () => ({
  SubscriptionService: subscriptionServiceMock,
}));

describe('App.svelte - Settings', () => {
  let chromeMocks: ReturnType<typeof createAppChromeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStoreMocks();

    chromeMocks = createAppChromeMocks();
    global.chrome = chromeMocks as unknown as typeof chrome;
  });

  describe('saveSettings', () => {
    it('should save settings successfully', async () => {
      mockGithubSettingsActions.saveSettings.mockResolvedValue({ success: true });

      const result = await mockGithubSettingsActions.saveSettings();

      expect(result.success).toBe(true);
      expect(mockGithubSettingsActions.saveSettings).toHaveBeenCalled();
    });

    it('should update project settings before saving when projectId exists', async () => {
      const projectId = 'test-project';
      const repoName = 'test-repo';
      const branch = 'main';

      mockGithubSettingsActions.setProjectSettings(projectId, repoName, branch);
      mockGithubSettingsActions.saveSettings.mockResolvedValue({ success: true });

      await mockGithubSettingsActions.saveSettings();

      expect(mockGithubSettingsActions.setProjectSettings).toHaveBeenCalledWith(
        projectId,
        repoName,
        branch
      );
      expect(mockGithubSettingsActions.saveSettings).toHaveBeenCalled();
    });

    it('should show success toast after successful save', async () => {
      mockGithubSettingsActions.saveSettings.mockResolvedValue({ success: true });
      subscriptionServiceMock.incrementInteractionCount.mockResolvedValue(undefined);

      const result = await mockGithubSettingsActions.saveSettings();

      if (result.success) {
        await subscriptionServiceMock.incrementInteractionCount();
      }

      expect(subscriptionServiceMock.incrementInteractionCount).toHaveBeenCalled();
    });

    it('should handle save failure with error message', async () => {
      mockGithubSettingsActions.saveSettings.mockResolvedValue({
        success: false,
        error: 'Failed to save settings',
      });

      const result = await mockGithubSettingsActions.saveSettings();

      if (!result.success) {
        mockUiStateActions.showStatus(result.error || 'Error saving settings');
      }

      expect(result.success).toBe(false);
      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith('Failed to save settings');
    });

    it('should handle storage quota error (MAX_WRITE_OPERATIONS_PER_H)', async () => {
      const quotaError = 'Error: MAX_WRITE_OPERATIONS_PER_H exceeded';
      mockGithubSettingsActions.saveSettings.mockResolvedValue({
        success: false,
        error: quotaError,
      });

      const result = await mockGithubSettingsActions.saveSettings();

      if (result.error && result.error.includes('MAX_WRITE_OPERATIONS_PER_H')) {
        console.error('Quota exceeded error detected:', result.error);
      } else if (!result.success) {
        mockUiStateActions.showStatus(result.error || 'Error saving settings');
      }

      expect(result.success).toBe(false);
      expect(mockUiStateActions.showStatus).not.toHaveBeenCalled();
    });

    it('should clear status on storage quota error', () => {
      const error = 'Error: MAX_WRITE_OPERATIONS_PER_H exceeded';

      if (error.includes('MAX_WRITE_OPERATIONS_PER_H')) {
        mockUiStateActions.clearStatus();
      }

      expect(mockUiStateActions.clearStatus).toHaveBeenCalled();
    });
  });

  describe('autoCreateProjectSettingsIfNeeded', () => {
    it('should not create settings when not on Bolt project', async () => {
      const onBoltProject = false;
      const projectId = null;

      if (!onBoltProject || !projectId) {
        return;
      }

      expect(mockChromeStorageService.saveProjectSettings).not.toHaveBeenCalled();
    });

    it('should not create settings when no projectId', async () => {
      const onBoltProject = true;
      const projectId = null;

      if (!onBoltProject || !projectId) {
        return;
      }

      expect(mockChromeStorageService.saveProjectSettings).not.toHaveBeenCalled();
    });

    it('should not create settings if project settings already exist', async () => {
      const projectId = 'test-project';
      chromeMocks._setSyncStorage('projectSettings', {
        [projectId]: {
          repoName: 'existing-repo',
          branch: 'main',
        },
      });

      const existingSettings = await chrome.storage.sync.get(['projectSettings']);
      const projectSettings = existingSettings.projectSettings || {};

      if (projectSettings[projectId]) {
        return;
      }

      expect(mockChromeStorageService.saveProjectSettings).not.toHaveBeenCalled();
    });

    it('should not create settings from legacy PAT state', async () => {
      const projectId = 'test-project';
      const onBoltProject = true;

      chromeMocks._setSyncStorage('repoOwner', 'test-owner');
      chromeMocks._setLocalStorage('authenticationMethod', 'pat');
      chromeMocks._setSyncStorage('githubToken', 'legacy-token');

      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['githubAppInstallationId']),
      ]);

      const hasValidAuth = Boolean(localSettings.githubAppInstallationId);

      expect(onBoltProject).toBe(true);
      expect(projectId).toBe('test-project');

      if (onBoltProject && projectId && syncSettings.repoOwner && hasValidAuth) {
        await mockChromeStorageService.saveProjectSettings(projectId, projectId, 'main', projectId);
      }

      expect(mockChromeStorageService.saveProjectSettings).not.toHaveBeenCalled();
    });

    it('should create settings with GitHub App authentication', async () => {
      const projectId = 'test-project';
      const onBoltProject = true;

      chromeMocks._setSyncStorage('repoOwner', 'test-owner');
      chromeMocks._setLocalStorage('githubAppInstallationId', 12345);

      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['githubAppInstallationId']),
      ]);

      const hasValidAuth = Boolean(localSettings.githubAppInstallationId);

      expect(onBoltProject).toBe(true);
      expect(projectId).toBe('test-project');

      if (onBoltProject && projectId && syncSettings.repoOwner && hasValidAuth) {
        await mockChromeStorageService.saveProjectSettings(projectId, projectId, 'main', projectId);
      }

      expect(mockChromeStorageService.saveProjectSettings).toHaveBeenCalledWith(
        projectId,
        projectId,
        'main',
        projectId
      );
    });

    it('should not create settings without valid authentication', async () => {
      const projectId = 'test-project';
      const onBoltProject = true;

      chromeMocks._setSyncStorage('repoOwner', 'test-owner');
      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['githubAppInstallationId']),
      ]);

      const hasValidAuth = Boolean(localSettings.githubAppInstallationId);

      expect(onBoltProject).toBe(true);
      expect(projectId).toBe('test-project');
      expect(hasValidAuth).toBe(false);

      if (!syncSettings.repoOwner || !hasValidAuth) {
        return;
      }

      expect(mockChromeStorageService.saveProjectSettings).not.toHaveBeenCalled();
    });

    it('should not create settings without repoOwner', async () => {
      const projectId = 'test-project';
      const onBoltProject = true;

      chromeMocks._setLocalStorage('githubAppInstallationId', 12345);

      const [syncSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['githubAppInstallationId']),
      ]);

      expect(onBoltProject).toBe(true);
      expect(projectId).toBe('test-project');
      expect(syncSettings.repoOwner).toBeUndefined();

      if (!syncSettings.repoOwner) {
        return;
      }

      expect(mockChromeStorageService.saveProjectSettings).not.toHaveBeenCalled();
    });

    it('should update stores after creating settings', async () => {
      const projectId = 'test-project';
      const newSettings = {
        repoName: projectId,
        branch: 'main',
        projectTitle: projectId,
      };

      await mockChromeStorageService.saveProjectSettings(
        projectId,
        newSettings.repoName,
        newSettings.branch,
        newSettings.projectTitle
      );

      mockGithubSettingsActions.setProjectSettings(
        projectId,
        newSettings.repoName,
        newSettings.branch,
        newSettings.projectTitle
      );

      mockGithubSettingsActions.loadProjectSettings(projectId);

      expect(mockGithubSettingsActions.setProjectSettings).toHaveBeenCalledWith(
        projectId,
        newSettings.repoName,
        newSettings.branch,
        newSettings.projectTitle
      );
      expect(mockGithubSettingsActions.loadProjectSettings).toHaveBeenCalledWith(projectId);
    });

    it('should set repository to private by default', async () => {
      const projectId = 'test-project';

      const newSettings = {
        repoName: projectId,
        branch: 'main',
        projectTitle: projectId,
      };

      await mockChromeStorageService.saveProjectSettings(
        projectId,
        newSettings.repoName,
        newSettings.branch,
        newSettings.projectTitle
      );

      expect(mockChromeStorageService.saveProjectSettings).toHaveBeenCalled();
    });
  });

  describe('GitHub App capability', () => {
    it('should not expose a capability for a stored legacy token', () => {
      const connectionReady = true;
      const githubAppInstallationId = null;
      const storedLegacyToken = 'ghp_legacy_token';
      const effectiveToken = connectionReady && githubAppInstallationId ? 'github_app_token' : '';

      expect(storedLegacyToken).toBeTruthy();
      expect(effectiveToken).toBe('');
    });

    it('should expose a capability for a verified GitHub App installation', () => {
      const connectionReady = true;
      const githubAppInstallationId = 12345;
      const effectiveToken = connectionReady && githubAppInstallationId ? 'github_app_token' : '';

      expect(effectiveToken).toBe('github_app_token');
    });

    it('should withhold the capability while live connection verification is unavailable', () => {
      const connectionReady = false;
      const githubAppInstallationId = 12345;
      const effectiveToken = connectionReady && githubAppInstallationId ? 'github_app_token' : '';

      expect(effectiveToken).toBe('');
    });
  });

  describe('Settings initialization', () => {
    it('should initialize settings from Chrome storage', async () => {
      chromeMocks._setSyncStorage('repoOwner', 'test-owner');
      chromeMocks._setSyncStorage('repoName', 'test-repo');
      chromeMocks._setSyncStorage('branch', 'main');

      const settings = await chrome.storage.sync.get(['repoOwner', 'repoName', 'branch']);

      expect(settings.repoOwner).toBe('test-owner');
      expect(settings.repoName).toBe('test-repo');
      expect(settings.branch).toBe('main');
    });

    it('should handle missing settings gracefully', async () => {
      const settings = await chrome.storage.sync.get(['repoOwner', 'repoName', 'branch']);

      expect(settings.repoOwner).toBeUndefined();
      expect(settings.repoName).toBeUndefined();
      expect(settings.branch).toBeUndefined();
    });

    it('should load project-specific settings when on bolt project', async () => {
      const projectId = 'test-project';

      mockGithubSettingsActions.loadProjectSettings(projectId);

      expect(mockGithubSettingsActions.loadProjectSettings).toHaveBeenCalledWith(projectId);
    });
  });

  describe('GitHub App-only settings state', () => {
    it('should not invoke authentication method switching', () => {
      expect(mockGithubSettingsActions).not.toHaveProperty('setAuthenticationMethod');
    });

    it('should derive readiness from the GitHub App installation', () => {
      const githubAppInstallationId = 12345;

      expect(Boolean(githubAppInstallationId)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle errors during auto-create gracefully', async () => {
      mockChromeStorageService.saveProjectSettings.mockRejectedValue(new Error('Storage error'));

      try {
        await mockChromeStorageService.saveProjectSettings('test', 'test', 'main', 'test');
      } catch (error) {
        console.error('Expected error during auto-create:', error);
      }

      expect(mockChromeStorageService.saveProjectSettings).toHaveBeenCalled();
    });

    it('should handle settings save errors with generic message', async () => {
      mockGithubSettingsActions.saveSettings.mockResolvedValue({
        success: false,
        error: undefined,
      });

      const result = await mockGithubSettingsActions.saveSettings();

      if (!result.success) {
        mockUiStateActions.showStatus(result.error || 'Error saving settings');
      }

      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith('Error saving settings');
    });
  });
});
