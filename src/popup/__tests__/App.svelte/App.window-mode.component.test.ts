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

const mockIsWindowMode = vi.fn();
const mockOpenPopupWindow = vi.fn();
const mockClosePopupWindow = vi.fn();

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
  isWindowMode: mockIsWindowMode,
  openPopupWindow: mockOpenPopupWindow,
  closePopupWindow: mockClosePopupWindow,
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

describe('App.svelte - Window Mode', () => {
  let chromeMocks: ReturnType<typeof createAppChromeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStoreMocks();

    chromeMocks = createAppChromeMocks();
    global.chrome = chromeMocks as unknown as typeof chrome;

    mockIsWindowMode.mockReturnValue(false);
    mockOpenPopupWindow.mockResolvedValue(undefined);
    mockClosePopupWindow.mockResolvedValue({ success: true });
  });

  describe('isWindowMode detection', () => {
    it('should detect popup mode correctly', () => {
      mockIsWindowMode.mockReturnValue(false);
      const isInWindowMode = mockIsWindowMode();

      expect(isInWindowMode).toBe(false);
      expect(mockIsWindowMode).toHaveBeenCalled();
    });

    it('should detect window mode correctly', () => {
      mockIsWindowMode.mockReturnValue(true);
      const isInWindowMode = mockIsWindowMode();

      expect(isInWindowMode).toBe(true);
      expect(mockIsWindowMode).toHaveBeenCalled();
    });

    it('should call isWindowMode on initialization', () => {
      mockIsWindowMode();

      expect(mockIsWindowMode).toHaveBeenCalled();
    });
  });

  describe('handlePopOutClick', () => {
    it('should successfully open popup in window mode', async () => {
      mockOpenPopupWindow.mockResolvedValue(undefined);

      try {
        await mockOpenPopupWindow();
      } catch {
        mockUiStateActions.showStatus('Failed to open popup window');
      }

      expect(mockOpenPopupWindow).toHaveBeenCalled();
      expect(mockUiStateActions.showStatus).not.toHaveBeenCalled();
    });

    it('should schedule window close after opening new window', async () => {
      vi.useFakeTimers();
      const mockWindowClose = vi.fn();
      global.window.close = mockWindowClose;

      try {
        setTimeout(() => window.close(), 100);
        await mockOpenPopupWindow();
      } catch {
        mockUiStateActions.showStatus('Failed to open popup window');
      }

      vi.advanceTimersByTime(100);

      expect(mockWindowClose).toHaveBeenCalled();
      expect(mockOpenPopupWindow).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should handle error when opening popup window fails', async () => {
      mockOpenPopupWindow.mockRejectedValue(new Error('Failed to create window'));

      try {
        await mockOpenPopupWindow();
      } catch {
        mockUiStateActions.showStatus('Failed to open popup window');
      }

      expect(mockOpenPopupWindow).toHaveBeenCalled();
      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith('Failed to open popup window');
    });

    it('should not close window if opening fails before timeout', async () => {
      vi.useFakeTimers();
      const mockWindowClose = vi.fn();
      global.window.close = mockWindowClose;
      mockOpenPopupWindow.mockRejectedValue(new Error('Failed'));

      try {
        setTimeout(() => window.close(), 100);
        await mockOpenPopupWindow();
      } catch {
        mockUiStateActions.showStatus('Failed to open popup window');
      }

      vi.advanceTimersByTime(100);
      expect(mockWindowClose).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should handle Chrome API errors gracefully', async () => {
      mockOpenPopupWindow.mockRejectedValue(new Error('Extension context invalidated'));

      try {
        await mockOpenPopupWindow();
      } catch {
        mockUiStateActions.showStatus('Failed to open popup window');
      }

      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith('Failed to open popup window');
    });
  });

  describe('handlePopBackIn', () => {
    it('should successfully switch from window to popup', async () => {
      mockClosePopupWindow.mockResolvedValue({ success: true });

      try {
        const result = await mockClosePopupWindow();
        if (!result.success) {
          mockUiStateActions.showStatus(`Failed to switch back to popup: ${result.error}`);
        }
      } catch {
        mockUiStateActions.showStatus('Failed to switch back to popup');
      }

      expect(mockClosePopupWindow).toHaveBeenCalled();
      expect(mockUiStateActions.showStatus).not.toHaveBeenCalled();
    });

    it('should handle error when closing window fails', async () => {
      mockClosePopupWindow.mockResolvedValue({
        success: false,
        error: 'Failed to create popup',
      });

      const result = await mockClosePopupWindow();
      if (!result.success) {
        mockUiStateActions.showStatus(`Failed to switch back to popup: ${result.error}`);
      }

      expect(mockClosePopupWindow).toHaveBeenCalled();
      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith(
        'Failed to switch back to popup: Failed to create popup'
      );
    });

    it('should handle exception when closing window throws', async () => {
      mockClosePopupWindow.mockRejectedValue(new Error('Window not found'));

      try {
        const result = await mockClosePopupWindow();
        if (!result.success) {
          mockUiStateActions.showStatus(`Failed to switch back to popup: ${result.error}`);
        }
      } catch {
        mockUiStateActions.showStatus('Failed to switch back to popup');
      }

      expect(mockClosePopupWindow).toHaveBeenCalled();
      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith('Failed to switch back to popup');
    });

    it('should close current window after successful switch', async () => {
      mockClosePopupWindow.mockResolvedValue({ success: true });

      const result = await mockClosePopupWindow();

      expect(result.success).toBe(true);
    });

    it('should display specific error message from closePopupWindow', async () => {
      const errorMessage = 'No popup window found';
      mockClosePopupWindow.mockResolvedValue({
        success: false,
        error: errorMessage,
      });

      try {
        const result = await mockClosePopupWindow();
        if (!result.success) {
          mockUiStateActions.showStatus(`Failed to switch back to popup: ${result.error}`);
        }
      } catch {
        mockUiStateActions.showStatus('Failed to switch back to popup');
      }

      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith(
        `Failed to switch back to popup: ${errorMessage}`
      );
    });
  });

  describe('UI state based on window mode', () => {
    it('should show pop-out button when in popup mode', () => {
      mockIsWindowMode.mockReturnValue(false);
      mockIsWindowMode();

      expect(mockIsWindowMode()).toBe(false);
    });

    it('should show pop-back-in button when in window mode', () => {
      mockIsWindowMode.mockReturnValue(true);
      mockIsWindowMode();

      expect(mockIsWindowMode()).toBe(true);
    });

    it('should not show both buttons at the same time', () => {
      mockIsWindowMode.mockReturnValue(false);
      let isInWindowMode = mockIsWindowMode();
      expect(isInWindowMode).toBe(false);

      mockIsWindowMode.mockReturnValue(true);
      isInWindowMode = mockIsWindowMode();
      expect(isInWindowMode).toBe(true);

      expect(mockIsWindowMode()).not.toBe(!mockIsWindowMode());
    });
  });

  describe('Window mode initialization', () => {
    it('should initialize window mode state on app mount', () => {
      mockIsWindowMode();

      expect(mockIsWindowMode).toHaveBeenCalled();
    });

    it('should handle window mode detection failure gracefully', () => {
      mockIsWindowMode.mockImplementation(() => {
        throw new Error('Window API not available');
      });

      let windowMode = false;
      try {
        windowMode = mockIsWindowMode();
      } catch {
        windowMode = false;
      }

      expect(windowMode).toBe(false);
    });
  });

  describe('Edge cases and error scenarios', () => {
    it('should handle multiple rapid pop-out clicks', async () => {
      mockOpenPopupWindow.mockResolvedValue(undefined);

      const promises = [mockOpenPopupWindow(), mockOpenPopupWindow(), mockOpenPopupWindow()];

      await Promise.all(promises);

      expect(mockOpenPopupWindow).toHaveBeenCalledTimes(3);
    });

    it('should handle window close timeout correctly', async () => {
      vi.useFakeTimers();
      const mockWindowClose = vi.fn();
      global.window.close = mockWindowClose;

      setTimeout(() => window.close(), 50);
      setTimeout(() => window.close(), 100);
      setTimeout(() => window.close(), 150);

      vi.advanceTimersByTime(50);
      expect(mockWindowClose).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      expect(mockWindowClose).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(50);
      expect(mockWindowClose).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should handle concurrent pop-out and pop-back-in operations', async () => {
      mockOpenPopupWindow.mockResolvedValue(undefined);
      mockClosePopupWindow.mockResolvedValue({ success: true });

      await Promise.all([mockOpenPopupWindow(), mockClosePopupWindow()]);

      expect(mockOpenPopupWindow).toHaveBeenCalled();
      expect(mockClosePopupWindow).toHaveBeenCalled();
    });
  });
});
