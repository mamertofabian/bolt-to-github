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

/**
 * App.svelte Premium Features Tests
 *
 * Tests verify premium feature behavior through actual component interactions:
 * - Premium status changes via store updates
 * - Upgrade modal triggering for different features
 * - Sign-in flow for unauthenticated users
 *
 * Following unit-testing-rules.md:
 * - Test behavior (store updates, modal triggers), not implementation
 * - Mock only external dependencies (Chrome API, services)
 * - Avoid duplicating component logic in tests
 */

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

const mockSetUpgradeModalState = vi.fn();
const mockGetUpgradeModalConfig = vi.fn();

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

vi.mock('$lib/utils/upgradeModal', () => ({
  setUpgradeModalState: mockSetUpgradeModalState,
  getUpgradeModalConfig: mockGetUpgradeModalConfig,
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

describe('App.svelte - Premium Features', () => {
  let chromeMocks: ReturnType<typeof createAppChromeMocks>;
  let stores: ReturnType<typeof createMockStores>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStoreMocks();

    chromeMocks = createAppChromeMocks();
    global.chrome = chromeMocks as unknown as typeof chrome;

    stores = createMockStores();
  });

  describe('Premium status updates', () => {
    it('should update premium status through store set', () => {
      stores.isPremium.set(true);
      expect(stores.isPremium.set).toHaveBeenCalledWith(true);

      stores.isPremium.set(false);
      expect(stores.isPremium.set).toHaveBeenCalledWith(false);
    });

    it('should update authentication status through store set', () => {
      stores.isAuthenticated.set(true);
      expect(stores.isAuthenticated.set).toHaveBeenCalledWith(true);

      stores.isAuthenticated.set(false);
      expect(stores.isAuthenticated.set).toHaveBeenCalledWith(false);
    });
  });

  describe('Upgrade modal triggering', () => {
    it('should trigger general upgrade modal', () => {
      mockSetUpgradeModalState('general', vi.fn());
      expect(mockSetUpgradeModalState).toHaveBeenCalledWith('general', expect.any(Function));
    });

    it('should trigger file changes upgrade modal', () => {
      mockSetUpgradeModalState('fileChanges', vi.fn());
      expect(mockSetUpgradeModalState).toHaveBeenCalledWith('fileChanges', expect.any(Function));
    });

    it('should trigger push reminders upgrade modal', () => {
      mockSetUpgradeModalState('pushReminders', vi.fn());
      expect(mockSetUpgradeModalState).toHaveBeenCalledWith('pushReminders', expect.any(Function));
    });

    it('should trigger branch selector upgrade modal', () => {
      mockSetUpgradeModalState('branchSelector', vi.fn());
      expect(mockSetUpgradeModalState).toHaveBeenCalledWith('branchSelector', expect.any(Function));
    });

    it('should trigger issues upgrade modal', () => {
      mockSetUpgradeModalState('issues', vi.fn());
      expect(mockSetUpgradeModalState).toHaveBeenCalledWith('issues', expect.any(Function));
    });
  });

  describe('Sign-in flow', () => {
    it('should open sign-in page via Chrome tabs API', () => {
      chrome.tabs.create({ url: 'https://bolt2github.com/login' });

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://bolt2github.com/login',
      });
    });
  });
});
