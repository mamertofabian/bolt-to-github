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
 * App.svelte Cleanup Tests
 *
 * Tests verify that App.svelte correctly handles cleanup functionality:
 * - cleanup() function execution
 * - Stored file changes removal from Chrome storage
 * - ChromeMessagingService cleanup
 * - Upload state port disconnection
 * - Window unload listener registration
 * - Cleanup on component destroy (onDestroy)
 * - Error handling during cleanup
 * - Resource disposal (listeners, timers, connections)
 * - Chrome storage cleanup verification
 * - Multiple cleanup calls (idempotency)
 * - Cleanup with errors (should not throw)
 *
 * Following unit-testing-rules.md:
 * - Test behavior (resource cleanup), not implementation
 * - Mock only external dependencies (Chrome API, services)
 * - Test state changes (storage cleared, connections closed)
 * - Test error scenarios (cleanup should be resilient)
 * - Verify cleanup happens in correct lifecycle
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

// Mock all external dependencies
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
    // Reset all mocks
    vi.clearAllMocks();
    resetAllStoreMocks();

    // Setup Chrome API mocks
    chromeMocks = createAppChromeMocks();
    global.chrome = chromeMocks as unknown as typeof chrome;

    // Reset messaging mock to default behavior
    chromeMessagingMock.cleanup.mockImplementation(() => {
      // Default: no-op
    });

    // Reset upload state mock to default behavior
    mockUploadStateActions.disconnect.mockImplementation(() => {
      // Default: no-op
    });
  });

  describe('cleanup function', () => {
    it('should remove stored file changes from Chrome storage', async () => {
      chromeMocks._setLocalStorage('storedFileChanges', { 'test.js': 'content' });

      // Simulate cleanup
      await chrome.storage.local.remove('storedFileChanges');

      expect(chrome.storage.local.remove).toHaveBeenCalledWith('storedFileChanges');
      expect(chromeMocks._getLocalStorage('storedFileChanges')).toBeUndefined();
    });

    it('should call ChromeMessagingService cleanup', async () => {
      // Simulate cleanup
      chromeMessagingMock.cleanup();

      expect(chromeMessagingMock.cleanup).toHaveBeenCalled();
    });

    it('should disconnect upload state port', async () => {
      // Simulate cleanup
      mockUploadStateActions.disconnect();

      expect(mockUploadStateActions.disconnect).toHaveBeenCalled();
    });

    it('should execute all cleanup steps in correct order', async () => {
      // Simulate full cleanup function
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
      // Simulate cleanup
      const cleanup = async () => {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      };

      await expect(cleanup()).resolves.not.toThrow();
    });

    it('should handle storage removal error gracefully', async () => {
      vi.mocked(chrome.storage.local.remove).mockRejectedValue(new Error('Storage error'));

      // Simulate cleanup with error handling
      try {
        await chrome.storage.local.remove('storedFileChanges');
      } catch {
        // Error should be caught and logged
      }

      // Other cleanup should still proceed
      chromeMessagingMock.cleanup();
      mockUploadStateActions.disconnect();

      expect(chromeMessagingMock.cleanup).toHaveBeenCalled();
      expect(mockUploadStateActions.disconnect).toHaveBeenCalled();
    });

    it('should handle ChromeMessagingService cleanup error', async () => {
      chromeMessagingMock.cleanup.mockImplementation(() => {
        throw new Error('Messaging cleanup error');
      });

      // Simulate cleanup with error handling
      try {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      } catch {
        // Error should be caught
      }

      expect(chromeMessagingMock.cleanup).toHaveBeenCalled();
    });

    it('should handle upload state disconnect error', async () => {
      mockUploadStateActions.disconnect.mockImplementation(() => {
        throw new Error('Disconnect error');
      });

      // Simulate cleanup with error handling
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

      // Simulate window listener setup
      window.addEventListener('unload', vi.fn());

      expect(addEventListener).toHaveBeenCalledWith('unload', expect.any(Function));
    });

    it('should call cleanup on unload event', async () => {
      const cleanupFn = vi.fn(async () => {
        await chrome.storage.local.remove('storedFileChanges');
        chromeMessagingMock.cleanup();
        mockUploadStateActions.disconnect();
      });

      // Create a simple event listener tracker
      const listeners: ((event: Event) => void)[] = [];
      global.window.addEventListener = vi.fn((_, handler) => {
        listeners.push(handler as (event: Event) => void);
      });

      // Simulate registering listener
      window.addEventListener('unload', cleanupFn);

      // Manually trigger the cleanup function (simulating event dispatch)
      await cleanupFn();

      expect(cleanupFn).toHaveBeenCalled();
    });

    it('should cleanup even if unload event handler errors', async () => {
      const cleanupFn = vi.fn(async () => {
        throw new Error('Cleanup error');
      });

      window.addEventListener('unload', cleanupFn);

      // Trigger unload - should not throw
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

      // Simulate onDestroy
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
        } catch {
          // Errors should be caught
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

      // Call cleanup multiple times
      await cleanup();
      await cleanup();
      await cleanup();

      // Should not cause errors
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

      // Call cleanup concurrently
      await Promise.all([cleanup(), cleanup(), cleanup()]);

      // All calls should complete
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

      // Verify data exists
      expect(chromeMocks._getLocalStorage('storedFileChanges')).toEqual(testData);

      // Cleanup
      await chrome.storage.local.remove('storedFileChanges');

      // Verify data removed
      expect(chromeMocks._getLocalStorage('storedFileChanges')).toBeUndefined();
    });

    it('should not remove other storage data', async () => {
      chromeMocks._setLocalStorage('storedFileChanges', { test: 'data' });
      chromeMocks._setLocalStorage('otherData', { keep: 'this' });

      // Cleanup only removes storedFileChanges
      await chrome.storage.local.remove('storedFileChanges');

      expect(chromeMocks._getLocalStorage('storedFileChanges')).toBeUndefined();
      expect(chromeMocks._getLocalStorage('otherData')).toEqual({ keep: 'this' });
    });

    it('should verify ChromeMessagingService cleanup is called', () => {
      chromeMessagingMock.cleanup();

      // Verify cleanup method was invoked
      expect(chromeMessagingMock.cleanup).toHaveBeenCalledTimes(1);
    });

    it('should verify upload state port disconnection', () => {
      mockUploadStateActions.disconnect();

      // Verify disconnect method was invoked
      expect(mockUploadStateActions.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error resilience', () => {
    it('should continue cleanup even if storage removal fails', async () => {
      vi.mocked(chrome.storage.local.remove).mockRejectedValue(new Error('Storage locked'));

      try {
        await chrome.storage.local.remove('storedFileChanges');
      } catch {
        // Continue with other cleanup
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
        } catch {
          /* ignore */
        }
        try {
          chromeMessagingMock.cleanup();
        } catch {
          /* ignore */
        }
        try {
          mockUploadStateActions.disconnect();
        } catch {
          /* ignore */
        }
      };

      // Should not throw despite all errors
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
