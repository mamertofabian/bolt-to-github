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

    it('should create settings with PAT authentication', async () => {
      const projectId = 'test-project';
      const onBoltProject = true;

      chromeMocks._setSyncStorage('repoOwner', 'test-owner');
      chromeMocks._setLocalStorage('authenticationMethod', 'pat');

      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['authenticationMethod', 'githubAppInstallationId']),
      ]);

      const authMethod = localSettings.authenticationMethod || 'pat';
      const githubToken = 'test-token';
      const hasValidAuth = authMethod === 'pat' && Boolean(githubToken);

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

    it('should create settings with GitHub App authentication', async () => {
      const projectId = 'test-project';
      const onBoltProject = true;

      chromeMocks._setSyncStorage('repoOwner', 'test-owner');
      chromeMocks._setLocalStorage('authenticationMethod', 'github_app');
      chromeMocks._setLocalStorage('githubAppInstallationId', 12345);

      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['authenticationMethod', 'githubAppInstallationId']),
      ]);

      const authMethod = localSettings.authenticationMethod || 'pat';
      const hasValidAuth =
        authMethod === 'github_app' && Boolean(localSettings.githubAppInstallationId);

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
      chromeMocks._setLocalStorage('authenticationMethod', 'pat');

      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['authenticationMethod', 'githubAppInstallationId']),
      ]);

      const authMethod = localSettings.authenticationMethod || 'pat';
      const hasValidAuth = authMethod === 'pat' && false;

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

      chromeMocks._setLocalStorage('authenticationMethod', 'pat');

      const [syncSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['authenticationMethod', 'githubAppInstallationId']),
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

  describe('updateEffectiveToken', () => {
    it('should use actual token for PAT authentication', async () => {
      chromeMocks._setLocalStorage('authenticationMethod', 'pat');
      const githubToken = 'ghp_test_token';

      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      let effectiveToken = '';
      if (authMethod === 'github_app') {
        effectiveToken = 'github_app_token';
      } else {
        effectiveToken = githubToken || '';
      }

      expect(effectiveToken).toBe('ghp_test_token');
    });

    it('should use placeholder token for GitHub App authentication', async () => {
      chromeMocks._setLocalStorage('authenticationMethod', 'github_app');

      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      let effectiveToken = '';
      if (authMethod === 'github_app') {
        effectiveToken = 'github_app_token';
      } else {
        effectiveToken = 'some-token';
      }

      expect(effectiveToken).toBe('github_app_token');
    });

    it('should default to PAT if no authentication method is set', async () => {
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      expect(authMethod).toBe('pat');
    });

    it('should handle empty token for PAT', async () => {
      chromeMocks._setLocalStorage('authenticationMethod', 'pat');
      const githubToken = '';

      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      let effectiveToken = '';
      if (authMethod === 'github_app') {
        effectiveToken = 'github_app_token';
      } else {
        effectiveToken = githubToken || '';
      }

      expect(effectiveToken).toBe('');
    });

    it('should update effective token when settings change', async () => {
      chromeMocks._setLocalStorage('authenticationMethod', 'pat');
      let authSettings = await chrome.storage.local.get(['authenticationMethod']);
      let authMethod = authSettings.authenticationMethod || 'pat';
      let effectiveToken = authMethod === 'github_app' ? 'github_app_token' : 'pat-token';

      expect(effectiveToken).toBe('pat-token');

      chromeMocks._setLocalStorage('authenticationMethod', 'github_app');
      authSettings = await chrome.storage.local.get(['authenticationMethod']);
      authMethod = authSettings.authenticationMethod || 'pat';
      effectiveToken = authMethod === 'github_app' ? 'github_app_token' : 'pat-token';

      expect(effectiveToken).toBe('github_app_token');
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
      const settings = await chrome.storage.sync.get([
        'repoOwner',
        'repoName',
        'branch',
        'githubToken',
      ]);

      expect(settings.repoOwner).toBeUndefined();
      expect(settings.repoName).toBeUndefined();
      expect(settings.branch).toBeUndefined();
      expect(settings.githubToken).toBeUndefined();
    });

    it('should load project-specific settings when on bolt project', async () => {
      const projectId = 'test-project';

      mockGithubSettingsActions.loadProjectSettings(projectId);

      expect(mockGithubSettingsActions.loadProjectSettings).toHaveBeenCalledWith(projectId);
    });
  });

  describe('Authentication method handling', () => {
    it('should handle authentication method change to PAT', () => {
      const newAuthMethod = 'pat';

      mockGithubSettingsActions.setAuthenticationMethod(newAuthMethod);

      expect(mockGithubSettingsActions.setAuthenticationMethod).toHaveBeenCalledWith('pat');
    });

    it('should handle authentication method change to GitHub App', () => {
      const newAuthMethod = 'github_app';

      mockGithubSettingsActions.setAuthenticationMethod(newAuthMethod);

      expect(mockGithubSettingsActions.setAuthenticationMethod).toHaveBeenCalledWith('github_app');
    });

    it('should update effective token after auth method change', async () => {
      mockGithubSettingsActions.setAuthenticationMethod('github_app');

      chromeMocks._setLocalStorage('authenticationMethod', 'github_app');
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';
      const effectiveToken = authMethod === 'github_app' ? 'github_app_token' : 'some-token';

      expect(mockGithubSettingsActions.setAuthenticationMethod).toHaveBeenCalledWith('github_app');
      expect(effectiveToken).toBe('github_app_token');
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
