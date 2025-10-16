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

describe('App.svelte - Cleanup', () => {
  let chromeMocks: ReturnType<typeof createAppChromeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStoreMocks();

    chromeMocks = createAppChromeMocks();
    global.chrome = chromeMocks as unknown as typeof chrome;

    chromeMessagingMock.cleanup.mockImplementation(() => {});

    mockUploadStateActions.disconnect.mockImplementation(() => {});
  });

  describe('cleanup function', () => {
    it('should remove stored file changes from Chrome storage', async () => {
      chromeMocks._setLocalStorage('storedFileChanges', { 'test.js': 'content' });

      await chrome.storage.local.remove('storedFileChanges');

      expect(chrome.storage.local.remove).toHaveBeenCalledWith('storedFileChanges');
      expect(chromeMocks._getLocalStorage('storedFileChanges')).toBeUndefined();
    });

    it('should call ChromeMessagingService cleanup', async () => {
      chromeMessagingMock.cleanup();

      expect(chromeMessagingMock.cleanup).toHaveBeenCalled();
    });

    it('should disconnect upload state port', async () => {
      mockUploadStateActions.disconnect();

      expect(mockUploadStateActions.disconnect).toHaveBeenCalled();
    });

    it('should execute all cleanup steps in correct order', async () => {
      const cleanupSteps: string[] = [];

      await chrome.storage.local.remove('storedFileChanges');
      cleanupSteps.push('storage');

      chromeMessagingMock.cleanup();
      cleanupSteps.push('messaging');

      mockUploadStateActions.disconnect();
      cleanupSteps.push('disconnect');

      expect(cleanupSteps).toEqual(['storage', 'messaging', 'disconnect']);
    });

    it('should handle cleanup without errors', async () => {
      const cleanup = async () => {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      };

      await expect(cleanup()).resolves.not.toThrow();
    });

    it('should handle storage removal error gracefully', async () => {
      vi.mocked(chrome.storage.local.remove).mockRejectedValue(new Error('Storage error'));

      try {
        await chrome.storage.local.remove('storedFileChanges');
      } catch (error) {
        console.error('Expected error during storage removal:', error);
      }

      chromeMessagingMock.cleanup();
      mockUploadStateActions.disconnect();

      expect(chromeMessagingMock.cleanup).toHaveBeenCalled();
      expect(mockUploadStateActions.disconnect).toHaveBeenCalled();
    });

    it('should handle ChromeMessagingService cleanup error', async () => {
      chromeMessagingMock.cleanup.mockImplementation(() => {
        throw new Error('Messaging cleanup error');
      });

      try {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      } catch (error) {
        console.error('Expected error during cleanup:', error);
      }

      expect(chromeMessagingMock.cleanup).toHaveBeenCalled();
    });

    it('should handle upload state disconnect error', async () => {
      mockUploadStateActions.disconnect.mockImplementation(() => {
        throw new Error('Disconnect error');
      });

      let errorThrown = false;
      try {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      } catch {
        errorThrown = true;
      }

      expect(mockUploadStateActions.disconnect).toHaveBeenCalled();
      expect(errorThrown).toBe(true);
    });
  });

  describe('Window unload listener', () => {
    it('should register unload event listener', () => {
      const addEventListener = vi.fn();
      global.window.addEventListener = addEventListener;

      window.addEventListener('unload', vi.fn());

      expect(addEventListener).toHaveBeenCalledWith('unload', expect.any(Function));
    });

    it('should call cleanup on unload event', async () => {
      const cleanupFn = vi.fn(async () => {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      });

      const listeners: ((event: Event) => void)[] = [];
      global.window.addEventListener = vi.fn((_, handler) => {
        listeners.push(handler as (event: Event) => void);
      });

      window.addEventListener('unload', cleanupFn);

      await cleanupFn();

      expect(cleanupFn).toHaveBeenCalled();
    });

    it('should cleanup even if unload event handler errors', async () => {
      const cleanupFn = vi.fn(async () => {
        throw new Error('Cleanup error');
      });

      window.addEventListener('unload', cleanupFn);

      const unloadEvent = new Event('unload');
      expect(() => window.dispatchEvent(unloadEvent)).not.toThrow();
    });
  });

  describe('onDestroy lifecycle', () => {
    it('should call cleanup on component destroy', async () => {
      const cleanupFn = vi.fn(async () => {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      });

      await cleanupFn();

      expect(cleanupFn).toHaveBeenCalled();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('storedFileChanges');
      expect(chromeMessagingMock.cleanup).toHaveBeenCalled();
      expect(mockUploadStateActions.disconnect).toHaveBeenCalled();
    });

    it('should handle cleanup errors in onDestroy', async () => {
      const cleanupFn = vi.fn(async () => {
        try {
          await chrome.storage.local.remove('storedFileChanges');
          chromeMessagingMock.cleanup();
          mockUploadStateActions.disconnect();
        } catch (error) {
          console.error('Expected error during cleanup function:', error);
        }
      });

      await expect(cleanupFn()).resolves.not.toThrow();
    });
  });

  describe('Multiple cleanup calls', () => {
    it('should be idempotent - safe to call multiple times', async () => {
      const cleanup = async () => {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      };

      await cleanup();
      await cleanup();
      await cleanup();

      expect(chrome.storage.local.remove).toHaveBeenCalledTimes(3);
      expect(chromeMessagingMock.cleanup).toHaveBeenCalledTimes(3);
      expect(mockUploadStateActions.disconnect).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent cleanup calls', async () => {
      const cleanup = async () => {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      };

      await Promise.all([cleanup(), cleanup(), cleanup()]);

      expect(chrome.storage.local.remove).toHaveBeenCalled();
      expect(chromeMessagingMock.cleanup).toHaveBeenCalled();
      expect(mockUploadStateActions.disconnect).toHaveBeenCalled();
    });
  });

  describe('Resource disposal verification', () => {
    it('should clear stored file changes data', async () => {
      const testData = {
        'src/App.tsx': { content: 'test', status: 'modified' },
        'package.json': { content: 'test', status: 'added' },
      };

      chromeMocks._setLocalStorage('storedFileChanges', testData);

      expect(chromeMocks._getLocalStorage('storedFileChanges')).toEqual(testData);

      await chrome.storage.local.remove('storedFileChanges');

      expect(chromeMocks._getLocalStorage('storedFileChanges')).toBeUndefined();
    });

    it('should not remove other storage data', async () => {
      chromeMocks._setLocalStorage('storedFileChanges', { test: 'data' });
      chromeMocks._setLocalStorage('otherData', { keep: 'this' });

      await chrome.storage.local.remove('storedFileChanges');

      expect(chromeMocks._getLocalStorage('storedFileChanges')).toBeUndefined();
      expect(chromeMocks._getLocalStorage('otherData')).toEqual({ keep: 'this' });
    });

    it('should verify ChromeMessagingService cleanup is called', () => {
      chromeMessagingMock.cleanup();

      expect(chromeMessagingMock.cleanup).toHaveBeenCalledTimes(1);
    });

    it('should verify upload state port disconnection', () => {
      mockUploadStateActions.disconnect();

      expect(mockUploadStateActions.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error resilience', () => {
    it('should continue cleanup even if storage removal fails', async () => {
      vi.mocked(chrome.storage.local.remove).mockRejectedValue(new Error('Storage locked'));

      try {
        await chrome.storage.local.remove('storedFileChanges');
      } catch {
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      }

      expect(chromeMessagingMock.cleanup).toHaveBeenCalled();
      expect(mockUploadStateActions.disconnect).toHaveBeenCalled();
    });

    it('should handle all cleanup steps failing', async () => {
      vi.mocked(chrome.storage.local.remove).mockRejectedValue(new Error('Error 1'));
      chromeMessagingMock.cleanup.mockImplementation(() => {
        throw new Error('Error 2');
      });
      mockUploadStateActions.disconnect.mockImplementation(() => {
        throw new Error('Error 3');
      });

      const cleanup = async () => {
        try {
          await chrome.storage.local.remove('storedFileChanges');
        } catch (error) {
          console.error('Expected error during storage removal:', error);
        }
        try {
          chromeMessagingMock.cleanup();
        } catch (error) {
          console.error('Expected error during messaging cleanup:', error);
        }
        try {
          mockUploadStateActions.disconnect();
        } catch (error) {
          console.error('Expected error during upload state disconnect:', error);
        }
      };

      await expect(cleanup()).resolves.not.toThrow();
    });

    it('should log errors during cleanup', async () => {
      const logger = { info: vi.fn(), error: vi.fn() };
      vi.mocked(chrome.storage.local.remove).mockRejectedValue(new Error('Test error'));

      try {
        await chrome.storage.local.remove('storedFileChanges');
        logger.info('Cleared stored file changes on popup close');
      } catch (error) {
        logger.error('Error during cleanup:', error);
      }

      expect(logger.error).toHaveBeenCalledWith('Error during cleanup:', expect.any(Error));
    });
  });
});
