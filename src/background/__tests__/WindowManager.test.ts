import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowManager } from '../WindowManager';

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
};

Object.assign(global, { chrome: mockChrome });

describe('WindowManager', () => {
  let windowManager: WindowManager;

  beforeEach(() => {
    vi.clearAllMocks();
    windowManager = WindowManager.getInstance();
  });

  afterEach(async () => {
    await windowManager.closePopupWindow();
  });

  describe('getInstance', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = WindowManager.getInstance();
      const instance2 = WindowManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('openPopupWindow', () => {
    it('should create a new popup window and store window ID', async () => {
      const mockWindow = { id: 123, left: 100, top: 100, width: 420, height: 640 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      const result = await windowManager.openPopupWindow();

      expect(result).toBe(mockWindow);
      expect(windowManager.getPopupWindowId()).toBe(123);
      expect(mockChrome.windows.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test-id/src/popup/index.html?mode=window',
        type: 'popup',
        width: 420,
        height: 640,
        left: expect.any(Number),
        top: expect.any(Number),
        focused: true,
      });
    });

    it('should close existing window before creating new one', async () => {
      const firstWindow = { id: 123 };
      const secondWindow = { id: 456 };
      mockChrome.windows.create.mockResolvedValueOnce(firstWindow);
      mockChrome.windows.remove.mockResolvedValue(undefined);
      mockChrome.windows.create.mockResolvedValueOnce(secondWindow);

      await windowManager.openPopupWindow();
      expect(windowManager.getPopupWindowId()).toBe(123);

      await windowManager.openPopupWindow();

      expect(mockChrome.windows.remove).toHaveBeenCalledWith(123);
      expect(windowManager.getPopupWindowId()).toBe(456);
    });

    it('should create new window even when closing existing window fails', async () => {
      const firstWindow = { id: 123 };
      const secondWindow = { id: 456 };
      mockChrome.windows.create.mockResolvedValueOnce(firstWindow);
      mockChrome.windows.remove.mockRejectedValue(new Error('Window not found'));
      mockChrome.windows.create.mockResolvedValueOnce(secondWindow);

      await windowManager.openPopupWindow();
      const result = await windowManager.openPopupWindow();

      expect(result).toBe(secondWindow);
      expect(windowManager.getPopupWindowId()).toBe(456);
    });

    it('should throw error when window creation fails', async () => {
      mockChrome.windows.create.mockRejectedValue(new Error('Creation failed'));

      await expect(windowManager.openPopupWindow()).rejects.toThrow('Creation failed');
    });

    it('should position window with non-negative coordinates', async () => {
      mockChrome.windows.getLastFocused.mockResolvedValueOnce({
        id: 1,
        left: 50,
        top: 10,
        width: 300,
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
        left: 0,
        top: 90,
        focused: true,
      });
    });

    it('should use default positioning when getLastFocused fails', async () => {
      mockChrome.windows.getLastFocused.mockRejectedValueOnce(new Error('No window'));
      const mockWindow = { id: 999 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      const result = await windowManager.openPopupWindow();

      expect(result).toBe(mockWindow);
      expect(mockChrome.windows.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test-id/src/popup/index.html?mode=window',
        type: 'popup',
        width: 420,
        height: 640,
        left: 100,
        top: 100,
        focused: true,
      });
    });

    it('should register window close listener', async () => {
      const mockWindow = { id: 123 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      await windowManager.openPopupWindow();

      expect(mockChrome.windows.onRemoved.addListener).toHaveBeenCalled();
    });
  });

  describe('closePopupWindow', () => {
    it('should close existing window and clear window ID', async () => {
      const mockWindow = { id: 123 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);
      mockChrome.windows.remove.mockResolvedValue(undefined);

      await windowManager.openPopupWindow();
      expect(windowManager.getPopupWindowId()).toBe(123);

      await windowManager.closePopupWindow();

      expect(mockChrome.windows.remove).toHaveBeenCalledWith(123);
      expect(windowManager.getPopupWindowId()).toBeNull();
    });

    it('should do nothing when no window is open', async () => {
      expect(windowManager.getPopupWindowId()).toBeNull();

      await windowManager.closePopupWindow();

      expect(mockChrome.windows.remove).not.toHaveBeenCalled();
      expect(windowManager.getPopupWindowId()).toBeNull();
    });

    it('should clear window ID even when remove fails', async () => {
      const mockWindow = { id: 123 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);
      mockChrome.windows.remove.mockRejectedValue(new Error('Window not found'));

      await windowManager.openPopupWindow();
      await windowManager.closePopupWindow();

      expect(windowManager.getPopupWindowId()).toBeNull();
    });
  });

  describe('isPopupWindowOpen', () => {
    it('should return true when window exists and is open', async () => {
      const mockWindow = { id: 123 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);
      mockChrome.windows.get.mockResolvedValue({ id: 123 });

      await windowManager.openPopupWindow();
      const result = await windowManager.isPopupWindowOpen();

      expect(result).toBe(true);
      expect(mockChrome.windows.get).toHaveBeenCalledWith(123);
    });

    it('should return false and clear ID when window no longer exists', async () => {
      const mockWindow = { id: 123 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);
      mockChrome.windows.get.mockRejectedValue(new Error('Window not found'));

      await windowManager.openPopupWindow();
      const result = await windowManager.isPopupWindowOpen();

      expect(result).toBe(false);
      expect(windowManager.getPopupWindowId()).toBeNull();
    });

    it('should return false when no window has been opened', async () => {
      const result = await windowManager.isPopupWindowOpen();

      expect(result).toBe(false);
      expect(mockChrome.windows.get).not.toHaveBeenCalled();
    });
  });

  describe('getPopupWindowId', () => {
    it('should return the current window ID after opening', async () => {
      const mockWindow = { id: 123 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);

      await windowManager.openPopupWindow();

      expect(windowManager.getPopupWindowId()).toBe(123);
    });

    it('should return null when no window is open', () => {
      expect(windowManager.getPopupWindowId()).toBeNull();
    });

    it('should return null after closing window', async () => {
      const mockWindow = { id: 123 };
      mockChrome.windows.create.mockResolvedValue(mockWindow);
      mockChrome.windows.remove.mockResolvedValue(undefined);

      await windowManager.openPopupWindow();
      await windowManager.closePopupWindow();

      expect(windowManager.getPopupWindowId()).toBeNull();
    });
  });
});
