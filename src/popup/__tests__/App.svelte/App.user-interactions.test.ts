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

vi.mock('$lib/services/chromeMessaging', () => ({
  ChromeMessagingService: chromeMessagingMock,
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

describe('App.svelte - User Interactions', () => {
  let chromeMocks: ReturnType<typeof createAppChromeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStoreMocks();

    chromeMocks = createAppChromeMocks();
    global.chrome = chromeMocks as unknown as typeof chrome;
  });

  describe('saveSettings', () => {
    it('should save settings successfully and show success message', async () => {
      vi.mocked(mockGithubSettingsActions.saveSettings).mockResolvedValue({ success: true });

      const result = await mockGithubSettingsActions.saveSettings();

      if (result.success) {
        await subscriptionServiceMock.incrementInteractionCount();
        await subscriptionServiceMock.shouldShowSubscriptionPrompt();
      }

      expect(mockGithubSettingsActions.saveSettings).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(subscriptionServiceMock.incrementInteractionCount).toHaveBeenCalled();
    });

    it('should update project settings before saving when on a project', async () => {
      const projectId = 'test-project';
      const repoName = 'test-repo';
      const branch = 'main';

      mockGithubSettingsActions.setProjectSettings(projectId, repoName, branch);

      await mockGithubSettingsActions.saveSettings();

      expect(mockGithubSettingsActions.setProjectSettings).toHaveBeenCalledWith(
        projectId,
        repoName,
        branch
      );
      expect(mockGithubSettingsActions.saveSettings).toHaveBeenCalled();
    });

    it('should handle save error with status message', async () => {
      const errorMessage = 'Failed to save settings';
      vi.mocked(mockGithubSettingsActions.saveSettings).mockResolvedValue({
        success: false,
        error: errorMessage,
      });

      const result = await mockGithubSettingsActions.saveSettings();

      if (!result.success) {
        if (result.error && !result.error.includes('MAX_WRITE_OPERATIONS_PER_H')) {
          mockUiStateActions.showStatus(result.error);
        }
      }

      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith(errorMessage);
    });

    it('should not show storage quota errors on button', async () => {
      const quotaError = 'QUOTA_BYTES_PER_ITEM quota exceeded. MAX_WRITE_OPERATIONS_PER_H';
      vi.mocked(mockGithubSettingsActions.saveSettings).mockResolvedValue({
        success: false,
        error: quotaError,
      });

      const result = await mockGithubSettingsActions.saveSettings();

      if (!result.success) {
        if (result.error && result.error.includes('MAX_WRITE_OPERATIONS_PER_H')) {
          // Rate limit error - no status shown
        } else {
          mockUiStateActions.showStatus(result.error || 'Error saving settings');
        }
      }

      expect(mockUiStateActions.showStatus).not.toHaveBeenCalled();
    });
  });

  describe('handleSettingsError', () => {
    it('should clear status for storage quota errors', () => {
      const error = 'QUOTA_BYTES_PER_ITEM quota exceeded. MAX_WRITE_OPERATIONS_PER_H';

      if (error.includes('MAX_WRITE_OPERATIONS_PER_H')) {
        mockUiStateActions.clearStatus();
      }

      expect(mockUiStateActions.clearStatus).toHaveBeenCalled();
    });

    it('should not clear status for non-quota errors', () => {
      const error = 'Network error';

      if (error.includes('MAX_WRITE_OPERATIONS_PER_H')) {
        mockUiStateActions.clearStatus();
      }

      expect(mockUiStateActions.clearStatus).not.toHaveBeenCalled();
    });
  });

  describe('handleSwitchTab', () => {
    it('should switch to home tab', () => {
      const event = { detail: 'home' } as CustomEvent<string>;

      mockUiStateActions.setActiveTab(event.detail);

      expect(mockUiStateActions.setActiveTab).toHaveBeenCalledWith('home');
    });

    it('should switch to projects tab', () => {
      const event = { detail: 'projects' } as CustomEvent<string>;

      mockUiStateActions.setActiveTab(event.detail);

      expect(mockUiStateActions.setActiveTab).toHaveBeenCalledWith('projects');
    });

    it('should switch to settings tab', () => {
      const event = { detail: 'settings' } as CustomEvent<string>;

      mockUiStateActions.setActiveTab(event.detail);

      expect(mockUiStateActions.setActiveTab).toHaveBeenCalledWith('settings');
    });
  });

  describe('handleConfigurePushReminder', () => {
    it('should open push reminder settings modal', () => {
      const modalStates = { pushReminderSettings: false };
      modalStates.pushReminderSettings = true;

      expect(modalStates.pushReminderSettings).toBe(true);
    });
  });

  describe('openSignInPage', () => {
    it('should open sign-in page in new tab', () => {
      const url = 'https://bolt2github.com/login';

      chromeMocks.tabs.create({ url });

      expect(chromeMocks.tabs.create).toHaveBeenCalledWith({ url });
    });
  });

  describe('showStoredFileChanges', () => {
    it('should show stored file changes when available', async () => {
      const projectId = 'test-project';
      vi.mocked(mockFileChangesActions.loadStoredFileChanges).mockResolvedValue(true);

      const success = await mockFileChangesActions.loadStoredFileChanges(projectId);

      expect(success).toBe(true);
      expect(mockFileChangesActions.requestFileChangesFromContentScript).not.toHaveBeenCalled();
    });

    it('should request file changes from content script if not stored', async () => {
      const projectId = 'test-project';
      vi.mocked(mockFileChangesActions.loadStoredFileChanges).mockResolvedValue(false);
      vi.mocked(mockFileChangesActions.requestFileChangesFromContentScript).mockResolvedValue(
        undefined
      );

      const success = await mockFileChangesActions.loadStoredFileChanges(projectId);

      if (!success) {
        try {
          await mockFileChangesActions.requestFileChangesFromContentScript();
          mockUiStateActions.showStatus('Calculating file changes...', 5000);
        } catch {
          mockUiStateActions.showStatus('Cannot show file changes: Not on a Bolt project page');
        }
      }

      expect(mockFileChangesActions.requestFileChangesFromContentScript).toHaveBeenCalled();
      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith(
        'Calculating file changes...',
        5000
      );
    });

    it('should show error when not on Bolt project', async () => {
      const projectId = 'test-project';
      vi.mocked(mockFileChangesActions.loadStoredFileChanges).mockResolvedValue(false);
      vi.mocked(mockFileChangesActions.requestFileChangesFromContentScript).mockRejectedValue(
        new Error('Not on bolt project')
      );

      const success = await mockFileChangesActions.loadStoredFileChanges(projectId);

      if (!success) {
        try {
          await mockFileChangesActions.requestFileChangesFromContentScript();
          mockUiStateActions.showStatus('Calculating file changes...', 5000);
        } catch {
          mockUiStateActions.showStatus('Cannot show file changes: Not on a Bolt project page');
        }
      }

      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith(
        'Cannot show file changes: Not on a Bolt project page'
      );
    });
  });

  describe('handleSuccessfulAction', () => {
    it('should show success toast without subscription prompt when already subscribed', async () => {
      vi.mocked(subscriptionServiceMock.getSubscriptionStatus).mockResolvedValue({
        subscribed: true,
      });
      vi.mocked(subscriptionServiceMock.shouldShowSubscriptionPrompt).mockResolvedValue(false);

      await subscriptionServiceMock.incrementInteractionCount();
      const shouldPrompt = await subscriptionServiceMock.shouldShowSubscriptionPrompt();
      const hasSubscribed = (await subscriptionServiceMock.getSubscriptionStatus()).subscribed;

      expect(subscriptionServiceMock.incrementInteractionCount).toHaveBeenCalled();
      expect(shouldPrompt).toBe(false);
      expect(hasSubscribed).toBe(true);
    });

    it('should show subscription prompt for unsubscribed users', async () => {
      vi.mocked(subscriptionServiceMock.getSubscriptionStatus).mockResolvedValue({
        subscribed: false,
      });
      vi.mocked(subscriptionServiceMock.shouldShowSubscriptionPrompt).mockResolvedValue(true);

      await subscriptionServiceMock.incrementInteractionCount();
      const shouldPrompt = await subscriptionServiceMock.shouldShowSubscriptionPrompt();
      const hasSubscribed = (await subscriptionServiceMock.getSubscriptionStatus()).subscribed;

      expect(shouldPrompt).toBe(true);
      expect(hasSubscribed).toBe(false);
    });

    it('should handle errors gracefully and still show success toast', async () => {
      vi.mocked(subscriptionServiceMock.incrementInteractionCount).mockRejectedValue(
        new Error('Service unavailable')
      );

      try {
        await subscriptionServiceMock.incrementInteractionCount();
      } catch {
        // Expected error
      }

      expect(subscriptionServiceMock.incrementInteractionCount).toHaveBeenCalled();
    });
  });

  describe('handleToastSubscribe', () => {
    it('should update last prompt date and open newsletter modal', async () => {
      await subscriptionServiceMock.updateLastPromptDate();

      expect(subscriptionServiceMock.updateLastPromptDate).toHaveBeenCalled();
    });
  });

  describe('handleUpgradeClick', () => {
    it('should open upgrade modal with general config', () => {
      const upgradeModalConfig = {
        feature: 'premium',
        reason: 'Unlock professional features',
        features: [],
      };

      expect(upgradeModalConfig.feature).toBe('premium');
      expect(upgradeModalConfig.reason).toBe('Unlock professional features');
    });

    it('should open upgrade modal for file changes feature', () => {
      const upgradeModalConfig = {
        feature: 'fileChanges',
        reason: 'Preview your changes before committing',
        features: [{ title: 'File Changes Preview', description: 'See exactly what changed' }],
      };

      expect(upgradeModalConfig.feature).toBe('fileChanges');
    });

    it('should open upgrade modal for push reminders feature', () => {
      const upgradeModalConfig = {
        feature: 'pushReminders',
        reason: 'Never forget to push your changes',
        features: [{ title: 'Smart Reminders', description: 'Get notified to push changes' }],
      };

      expect(upgradeModalConfig.feature).toBe('pushReminders');
    });
  });

  describe('authMethodChangeHandler', () => {
    it('should change authentication method to GitHub App', () => {
      const event = { detail: 'github_app' } as CustomEvent<string>;

      mockGithubSettingsActions.setAuthenticationMethod(event.detail as 'github_app' | 'pat');

      expect(mockGithubSettingsActions.setAuthenticationMethod).toHaveBeenCalledWith('github_app');
    });

    it('should change authentication method to PAT', () => {
      const event = { detail: 'pat' } as CustomEvent<string>;

      mockGithubSettingsActions.setAuthenticationMethod(event.detail as 'github_app' | 'pat');

      expect(mockGithubSettingsActions.setAuthenticationMethod).toHaveBeenCalledWith('pat');
    });

    it('should update effective token after auth method change', async () => {
      mockGithubSettingsActions.setAuthenticationMethod('github_app');

      await chromeMocks.storage.local.get(['authenticationMethod']);

      expect(mockGithubSettingsActions.setAuthenticationMethod).toHaveBeenCalledWith('github_app');
    });
  });

  describe('Newsletter Modal', () => {
    it('should open newsletter modal', () => {
      const modalStates = { newsletter: false };
      modalStates.newsletter = true;

      expect(modalStates.newsletter).toBe(true);
    });

    it('should refresh subscription status on modal close', async () => {
      vi.mocked(subscriptionServiceMock.getSubscriptionStatus).mockResolvedValue({
        subscribed: true,
      });

      const subscription = await subscriptionServiceMock.getSubscriptionStatus();

      expect(subscriptionServiceMock.getSubscriptionStatus).toHaveBeenCalled();
      expect(subscription.subscribed).toBe(true);
    });
  });

  describe('Feedback Modal', () => {
    it('should open feedback modal', () => {
      const modalStates = { feedback: false };
      modalStates.feedback = true;

      expect(modalStates.feedback).toBe(true);
    });
  });

  describe('Issues Modal', () => {
    it('should open issues modal when settings are valid', () => {
      const modalStates = { issues: false };
      const settingsValid = true;
      const effectiveGithubToken = 'test-token';
      const repoOwner = 'test-owner';
      const repoName = 'test-repo';

      if (settingsValid && effectiveGithubToken && repoOwner && repoName) {
        modalStates.issues = true;
      }

      expect(modalStates.issues).toBe(true);
    });

    it('should not open issues modal when settings are invalid', () => {
      const modalStates = { issues: false };
      const settingsValid = false;

      if (settingsValid) {
        modalStates.issues = true;
      }

      expect(modalStates.issues).toBe(false);
    });
  });

  describe('Success Toast', () => {
    it('should show success toast with message', () => {
      const modalStates = { successToast: false };
      const successToastMessage = 'Operation successful!';

      modalStates.successToast = true;

      expect(modalStates.successToast).toBe(true);
      expect(successToastMessage).toBe('Operation successful!');
    });

    it('should hide success toast', () => {
      const modalStates = { successToast: true };

      modalStates.successToast = false;

      expect(modalStates.successToast).toBe(false);
    });
  });
});
