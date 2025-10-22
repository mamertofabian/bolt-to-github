import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isWindowMode,
  getCurrentWindowMode,
  isPopupMode,
  getWindowTitle,
  WINDOW_MODE,
  WindowModeStateSync,
} from '../windowMode';

const mockLocation = {
  search: '',
};

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
  },
  storage: {
    local: {
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
    },
  },
};

Object.assign(global, { chrome: mockChrome });

describe('windowMode utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.search = '';
  });

  describe('isWindowMode', () => {
    it('should return true when mode=window is in URL params', () => {
      mockLocation.search = '?mode=window';
      expect(isWindowMode()).toBe(true);
    });

    it('should return false when mode=popup is in URL params', () => {
      mockLocation.search = '?mode=popup';
      expect(isWindowMode()).toBe(false);
    });

    it('should return false when no mode parameter exists', () => {
      mockLocation.search = '';
      expect(isWindowMode()).toBe(false);
    });

    it('should return false when mode has different value', () => {
      mockLocation.search = '?mode=other';
      expect(isWindowMode()).toBe(false);
    });

    it('should handle URL with multiple parameters', () => {
      mockLocation.search = '?param1=value1&mode=window&param2=value2';
      expect(isWindowMode()).toBe(true);
    });
  });

  describe('getCurrentWindowMode', () => {
    it('should return WINDOW when in window mode', () => {
      mockLocation.search = '?mode=window';
      expect(getCurrentWindowMode()).toBe(WINDOW_MODE.WINDOW);
    });

    it('should return POPUP when not in window mode', () => {
      mockLocation.search = '';
      expect(getCurrentWindowMode()).toBe(WINDOW_MODE.POPUP);
    });
  });

  describe('isPopupMode', () => {
    it('should return false when in window mode', () => {
      mockLocation.search = '?mode=window';
      expect(isPopupMode()).toBe(false);
    });

    it('should return true when not in window mode', () => {
      mockLocation.search = '';
      expect(isPopupMode()).toBe(true);
    });
  });

  describe('getWindowTitle', () => {
    it('should return correct title for window mode', () => {
      mockLocation.search = '?mode=window';
      expect(getWindowTitle()).toBe('Bolt to GitHub');
    });

    it('should return correct title for popup mode', () => {
      mockLocation.search = '';
      expect(getWindowTitle()).toBe('Bolt to GitHub');
    });
  });

  describe('WindowModeStateSync', () => {
    let stateSync: WindowModeStateSync;

    beforeEach(() => {
      stateSync = WindowModeStateSync.getInstance();
    });

    describe('getInstance', () => {
      it('should return the same instance when called multiple times', () => {
        const instance1 = WindowModeStateSync.getInstance();
        const instance2 = WindowModeStateSync.getInstance();
        expect(instance1).toBe(instance2);
      });
    });

    describe('saveSharedState', () => {
      it('should save state to chrome storage with prefix', async () => {
        const key = 'testKey';
        const value = { test: 'data' };
        mockChrome.storage.local.set.mockResolvedValue(undefined);

        await stateSync.saveSharedState(key, value);

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
          windowMode_testKey: value,
        });
      });

      it('should handle save errors gracefully', async () => {
        const key = 'testKey';
        const value = { test: 'data' };
        mockChrome.storage.local.set.mockRejectedValue(new Error('Storage error'));

        await expect(stateSync.saveSharedState(key, value)).resolves.toBeUndefined();
      });
    });

    describe('loadSharedState', () => {
      it('should load state from chrome storage with prefix', async () => {
        const key = 'testKey';
        const value = { test: 'data' };
        mockChrome.storage.local.get.mockResolvedValue({
          windowMode_testKey: value,
        });

        const result = await stateSync.loadSharedState(key);

        expect(mockChrome.storage.local.get).toHaveBeenCalledWith('windowMode_testKey');
        expect(result).toEqual(value);
      });

      it('should return default value when key not found', async () => {
        const key = 'testKey';
        const defaultValue = 'default';
        mockChrome.storage.local.get.mockResolvedValue({});

        const result = await stateSync.loadSharedState(key, defaultValue);

        expect(result).toBe(defaultValue);
      });

      it('should return undefined when key not found and no default provided', async () => {
        const key = 'testKey';
        mockChrome.storage.local.get.mockResolvedValue({});

        const result = await stateSync.loadSharedState(key);

        expect(result).toBeUndefined();
      });

      it('should handle load errors gracefully', async () => {
        const key = 'testKey';
        const defaultValue = 'default';
        mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

        const result = await stateSync.loadSharedState(key, defaultValue);

        expect(result).toBe(defaultValue);
      });
    });

    describe('clearSharedState', () => {
      it('should remove state from chrome storage with prefix', async () => {
        const key = 'testKey';
        mockChrome.storage.local.remove.mockResolvedValue(undefined);

        await stateSync.clearSharedState(key);

        expect(mockChrome.storage.local.remove).toHaveBeenCalledWith('windowMode_testKey');
      });

      it('should handle clear errors gracefully', async () => {
        const key = 'testKey';
        mockChrome.storage.local.remove.mockRejectedValue(new Error('Storage error'));

        await expect(stateSync.clearSharedState(key)).resolves.toBeUndefined();
      });
    });
  });
});
