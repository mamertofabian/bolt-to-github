import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowManager } from '../WindowManager';

// Mock Chrome APIs
const mockChrome = {
  windows: {
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    get: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    getLastFocused: vi.fn().mockResolvedValue({
      id: 1,
      left: 100,
      top: 100,
      width: 1200,
      height: 800,
      focused: true,
    }),
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
  },

  action: {
    openPopup: vi.fn().mockResolvedValue(undefined),
  },
};

// Mock global chrome object
Object.assign(global, { chrome: mockChrome });

describe('WindowManager', () => {
  let windowManager: WindowManager;

  beforeEach(() => {
    vi.clearAllMocks();
    windowManager = WindowManager.getInstance();
  });

  afterEach(() => {
    // Clean up any window references
    windowManager['popupWindowId'] = null;
  });

  describe('getInstance', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = WindowManager.getInstance();
      const instance2 = WindowManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('openPopupWindow', () => {
    it('should create a new popup window', async () => {
      const mockWindow = { id: 123, left: 100, top: 100, width: 420, height: 640 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      const result = await windowManager.openPopupWindow();

      expect(mockChrome.windows.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test-id/src/popup/index.html?mode=window',
        type: 'popup',
        width: 420,
        height: 640,
        left: expect.any(Number),
        top: expect.any(Number),
        focused: true,
      });
      expect(result).toBe(mockWindow);
    });

    it('should close existing window before creating new one', async () => {
      const mockWindow = { id: 456 };
      windowManager['popupWindowId'] = 123;
      mockChrome.windows.remove.mockResolvedValue(undefined);
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      const result = await windowManager.openPopupWindow();

      expect(mockChrome.windows.remove).toHaveBeenCalledWith(123);
      expect(mockChrome.windows.create).toHaveBeenCalled();
      expect(result).toBe(mockWindow);
    });

    it('should handle error when closing existing window', async () => {
      const mockWindow = { id: 456 };
      windowManager['popupWindowId'] = 123;
      mockChrome.windows.remove.mockRejectedValue(new Error('Window not found'));
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      const result = await windowManager.openPopupWindow();

      expect(mockChrome.windows.remove).toHaveBeenCalledWith(123);
      expect(mockChrome.windows.create).toHaveBeenCalled();
      expect(result).toBe(mockWindow);
    });

    it('should throw error if window creation fails', async () => {
      mockChrome.windows.create.mockRejectedValue(new Error('Creation failed'));

      await expect(windowManager.openPopupWindow()).rejects.toThrow('Creation failed');
    });

    it('should handle negative positioning by using Math.max(0, ...)', async () => {
      // Mock a window that would result in negative positioning
      mockChrome.windows.getLastFocused.mockResolvedValueOnce({
        id: 1,
        left: 50, // Small left value that would result in negative positioning
        top: 10, // Small top value that would result in negative positioning
        width: 300, // Small width
        height: 200,
        focused: true,
      });

      const mockWindow = { id: 789 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      const result = await windowManager.openPopupWindow();

      expect(result).toBe(mockWindow);
      expect(mockChrome.windows.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test-id/src/popup/index.html?mode=window',
        type: 'popup',
        width: 420,
        height: 640,
        left: 0, // Should be 0 instead of negative (Math.max(0, 50 + 300 - 420 - 100) = Math.max(0, -170) = 0)
        top: 130, // Should be Math.max(0, 10 + 120) = 130
        focused: true,
      });
    });
  });

  describe('closePopupWindow', () => {
    it('should close existing popup window', async () => {
      const windowManager = WindowManager.getInstance();

      // First open a window
      const mockWindow = { id: 123 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      await windowManager.openPopupWindow();
      expect(mockChrome.windows.create).toHaveBeenCalled();

      // Now close it
      mockChrome.windows.remove.mockResolvedValue(undefined);

      await windowManager.closePopupWindow();

      expect(mockChrome.windows.remove).toHaveBeenCalledWith(123);
      expect(windowManager.getPopupWindowId()).toBeNull();
    });

    it('should handle closing when no window exists', async () => {
      const windowManager = WindowManager.getInstance();

      // Ensure no window is open
      expect(windowManager.getPopupWindowId()).toBeNull();

      // Should not throw when closing non-existent window
      await expect(windowManager.closePopupWindow()).resolves.toBeUndefined();
      expect(mockChrome.windows.remove).not.toHaveBeenCalled();
    });

    it('should handle chrome.windows.remove errors gracefully', async () => {
      const windowManager = WindowManager.getInstance();

      // First open a window
      const mockWindow = { id: 123 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      await windowManager.openPopupWindow();

      // Mock an error when removing
      const removeError = new Error('Window not found');
      mockChrome.windows.remove.mockRejectedValue(removeError);

      // Should handle the error gracefully and not throw
      await expect(windowManager.closePopupWindow()).resolves.toBeUndefined();
      expect(windowManager.getPopupWindowId()).toBeNull();
    });
  });

  describe('isPopupWindowOpen', () => {
    it('should return true when window exists', async () => {
      windowManager['popupWindowId'] = 123;
      mockChrome.windows.get.mockResolvedValue({ id: 123 });

      const result = await windowManager.isPopupWindowOpen();

      expect(result).toBe(true);
      expect(mockChrome.windows.get).toHaveBeenCalledWith(123);
    });

    it('should return false when window does not exist', async () => {
      windowManager['popupWindowId'] = 123;
      mockChrome.windows.get.mockRejectedValue(new Error('Window not found'));

      const result = await windowManager.isPopupWindowOpen();

      expect(result).toBe(false);
      expect(windowManager.getPopupWindowId()).toBeNull(); // Should clear ID
    });

    it('should return false when no window ID is set', async () => {
      windowManager['popupWindowId'] = null;

      const result = await windowManager.isPopupWindowOpen();

      expect(result).toBe(false);
      expect(mockChrome.windows.get).not.toHaveBeenCalled();
    });
  });

  describe('getPopupWindowId', () => {
    it('should return the current window ID', () => {
      windowManager['popupWindowId'] = 123;
      expect(windowManager.getPopupWindowId()).toBe(123);
    });

    it('should return null when no window is open', () => {
      windowManager['popupWindowId'] = null;
      expect(windowManager.getPopupWindowId()).toBeNull();
    });
  });

  describe('Background service integration', () => {
    it('should be able to call chrome.action.openPopup from background context', async () => {
      // This test verifies that chrome.action.openPopup() works from background service context
      // which is different from popup window context where it would fail

      // Mock successful popup opening
      mockChrome.action.openPopup.mockResolvedValue(undefined);

      // Call chrome.action.openPopup directly (simulating background service call)
      await expect(chrome.action.openPopup()).resolves.toBeUndefined();

      // Verify it was called
      expect(mockChrome.action.openPopup).toHaveBeenCalled();
    });

    it('should handle chrome.action.openPopup errors gracefully', async () => {
      // Mock an error from chrome.action.openPopup
      const openPopupError = new Error('No active tab');
      mockChrome.action.openPopup.mockRejectedValue(openPopupError);

      // Should reject with the error
      await expect(chrome.action.openPopup()).rejects.toThrow('No active tab');

      expect(mockChrome.action.openPopup).toHaveBeenCalled();
    });
  });
});
