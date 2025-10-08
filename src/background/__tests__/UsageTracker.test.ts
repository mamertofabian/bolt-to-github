import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorLogEntry, UsageData } from '../../lib/types';
import { UsageTracker } from '../UsageTracker';

const mockChromeStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
  sync: {
    get: vi.fn(),
    set: vi.fn(),
  },
};

const mockChromeRuntime = {
  getManifest: vi.fn(() => ({ version: '1.3.5' })),
  setUninstallURL: vi.fn(),
};

global.chrome = {
  storage: mockChromeStorage,
  runtime: mockChromeRuntime,
} as unknown as typeof chrome;

describe('UsageTracker', () => {
  let usageTracker: UsageTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    usageTracker = new UsageTracker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initializeUsageData', () => {
    it('should create initial usage data on first install', async () => {
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      mockChromeStorage.sync.get.mockImplementation((keys, callback) => {
        callback({ analyticsEnabled: true });
      });

      let savedData: Record<string, unknown> = {};
      mockChromeStorage.local.set.mockImplementation((data, callback) => {
        savedData = data;
        if (callback) callback();
      });

      await usageTracker.initializeUsageData();

      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(['usageData'], expect.any(Function));

      expect(savedData.usageData).toMatchObject({
        installDate: expect.any(String),
        lastActiveDate: expect.any(String),
        totalPushes: 0,
        authMethod: 'none',
        extensionVersion: '1.3.5',
        errorCount: 0,
      });
    });

    it('should preserve existing usage data', async () => {
      const existingData: UsageData = {
        installDate: '2024-01-01T00:00:00.000Z',
        lastActiveDate: '2024-01-15T00:00:00.000Z',
        totalPushes: 10,
        authMethod: 'github-app',
        extensionVersion: '1.3.4',
        errorCount: 2,
        lastError: 'Test error',
      };

      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ usageData: existingData });
      });

      let savedData: Record<string, unknown> = {};
      mockChromeStorage.local.set.mockImplementation((data, callback) => {
        savedData = data;
        if (callback) callback();
      });

      await usageTracker.initializeUsageData();

      expect(savedData.usageData).toMatchObject({
        ...existingData,
        extensionVersion: '1.3.5',
      });
    });
  });

  describe('updateUsageStats', () => {
    it('should increment push count and update last active date', async () => {
      const existingData: UsageData = {
        installDate: '2024-01-01T00:00:00.000Z',
        lastActiveDate: '2024-01-15T00:00:00.000Z',
        totalPushes: 5,
        authMethod: 'pat',
        extensionVersion: '1.3.5',
        errorCount: 0,
      };

      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ usageData: existingData });
      });

      let savedData: Record<string, unknown> = {};
      mockChromeStorage.local.set.mockImplementation((data, callback) => {
        savedData = data;
        if (callback) callback();
      });

      await usageTracker.updateUsageStats('push_completed');

      expect(savedData.usageData).toMatchObject({
        ...existingData,
        totalPushes: 6,
        lastActiveDate: expect.any(String),
      });
    });

    it('should update authentication method when changed', async () => {
      const existingData: UsageData = {
        installDate: '2024-01-01T00:00:00.000Z',
        lastActiveDate: '2024-01-15T00:00:00.000Z',
        totalPushes: 5,
        authMethod: 'none',
        extensionVersion: '1.3.5',
        errorCount: 0,
      };

      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ usageData: existingData });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let savedData: Record<string, any> = {};
      mockChromeStorage.local.set.mockImplementation((data, callback) => {
        savedData = data;
        if (callback) callback();
      });

      await usageTracker.updateUsageStats('auth_method_changed', { authMethod: 'github-app' });

      expect(savedData.usageData.authMethod).toBe('github-app');
    });
  });

  describe('trackError', () => {
    it('should add error to error log and increment error count', async () => {
      const existingData: UsageData = {
        installDate: '2024-01-01T00:00:00.000Z',
        lastActiveDate: '2024-01-15T00:00:00.000Z',
        totalPushes: 5,
        authMethod: 'pat',
        extensionVersion: '1.3.5',
        errorCount: 1,
      };

      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        if (keys.includes('usageData')) {
          callback({ usageData: existingData, errorLog: [] });
        } else {
          callback({ errorLog: [] });
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let savedData: Record<string, any> = {};
      mockChromeStorage.local.set.mockImplementation((data, callback) => {
        savedData = data;
        if (callback) callback();
      });

      const error = new Error('Test error message');
      await usageTracker.trackError(error, 'test_context');

      expect(savedData.errorLog).toHaveLength(1);
      expect(savedData.errorLog[0]).toMatchObject({
        timestamp: expect.any(String),
        message: 'Test error message',
        context: 'test_context',
        stack: expect.any(String),
      });

      expect(savedData.usageData.errorCount).toBe(2);
      expect(savedData.usageData.lastError).toBe('Test error message');
    });

    it('should keep only last 10 errors', async () => {
      const existingErrors: ErrorLogEntry[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(2024, 0, i + 1).toISOString(),
        message: `Error ${i}`,
        context: 'test',
      }));

      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({
          errorLog: existingErrors,
          usageData: {
            installDate: '2024-01-01T00:00:00.000Z',
            lastActiveDate: '2024-01-15T00:00:00.000Z',
            totalPushes: 5,
            authMethod: 'pat',
            extensionVersion: '1.3.5',
            errorCount: 10,
          },
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let savedData: Record<string, any> = {};
      mockChromeStorage.local.set.mockImplementation((data, callback) => {
        savedData = data;
        if (callback) callback();
      });

      const newError = new Error('New error');
      await usageTracker.trackError(newError, 'new_context');

      expect(savedData.errorLog).toHaveLength(10);
      expect(savedData.errorLog[9].message).toBe('New error');
      expect(savedData.errorLog[0].message).toBe('Error 1');
    });
  });

  describe('setUninstallURL', () => {
    it('should generate correct uninstall URL with usage parameters', async () => {
      const usageData: UsageData = {
        installDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        lastActiveDate: new Date().toISOString(),
        totalPushes: 15,
        authMethod: 'github-app',
        extensionVersion: '1.3.5',
        errorCount: 2,
      };

      mockChromeStorage.sync.get.mockImplementation((keys, callback) => {
        callback({ analyticsEnabled: true });
      });

      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ usageData });
      });

      await usageTracker.setUninstallURL();

      expect(mockChromeRuntime.setUninstallURL).toHaveBeenCalledWith(
        expect.stringContaining('https://bolt2github.com/uninstall-feedback?')
      );

      const urlCall = mockChromeRuntime.setUninstallURL.mock.calls[0][0];
      const url = new URL(urlCall);
      const params = url.searchParams;

      expect(params.get('v')).toBe('1.3.5');
      expect(params.get('d')).toBe('30');
      expect(params.get('p')).toBe('15');
      expect(params.get('a')).toBe('github-app');
      expect(params.get('e')).toBe('true');
    });

    it('should not set uninstall URL if analytics is disabled', async () => {
      mockChromeStorage.sync.get.mockImplementation((keys, callback) => {
        callback({ analyticsEnabled: false });
      });

      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({
          usageData: {
            installDate: new Date().toISOString(),
            lastActiveDate: new Date().toISOString(),
            totalPushes: 0,
            authMethod: 'none',
            extensionVersion: '1.3.5',
            errorCount: 0,
          },
        });
      });

      await usageTracker.setUninstallURL();

      expect(mockChromeRuntime.setUninstallURL).toHaveBeenCalledWith('');
    });

    it('should handle missing usage data gracefully', async () => {
      mockChromeStorage.sync.get.mockImplementation((keys, callback) => {
        callback({ analyticsEnabled: true });
      });

      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      await usageTracker.setUninstallURL();

      expect(mockChromeRuntime.setUninstallURL).toHaveBeenCalledWith(
        expect.stringContaining('https://bolt2github.com/uninstall-feedback?')
      );

      const urlCall = mockChromeRuntime.setUninstallURL.mock.calls[0][0];
      const url = new URL(urlCall);
      const params = url.searchParams;

      expect(params.get('v')).toBe('1.3.5');
      expect(params.get('d')).toBe('0');
      expect(params.get('p')).toBe('0');
      expect(params.get('a')).toBe('none');
      expect(params.get('e')).toBe('false');
    });
  });

  describe('calculateDaysSinceInstall', () => {
    it('should calculate correct days since install', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const days = usageTracker['calculateDaysSinceInstall'](thirtyDaysAgo);
      expect(days).toBe(30);
    });

    it('should return 0 for future dates', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const days = usageTracker['calculateDaysSinceInstall'](tomorrow);
      expect(days).toBe(0);
    });

    it('should return 0 for invalid dates', () => {
      const days = usageTracker['calculateDaysSinceInstall']('invalid-date');
      expect(days).toBe(0);
    });
  });
});
