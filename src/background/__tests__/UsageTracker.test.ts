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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-15T10:00:00.000Z'));
    vi.clearAllMocks();
    usageTracker = new UsageTracker();
  });

  afterEach(() => {
    vi.useRealTimers();
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
        installDate: '2024-02-15T10:00:00.000Z',
        lastActiveDate: '2024-02-15T10:00:00.000Z',
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
        lastActiveDate: '2024-02-15T10:00:00.000Z',
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

      let savedData: Record<string, unknown> = {};
      mockChromeStorage.local.set.mockImplementation((data, callback) => {
        savedData = data;
        if (callback) callback();
      });

      await usageTracker.updateUsageStats('auth_method_changed', { authMethod: 'github-app' });

      const usageData = savedData.usageData as UsageData;
      expect(usageData.authMethod).toBe('github-app');
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

      let savedData: Record<string, unknown> = {};
      mockChromeStorage.local.set.mockImplementation((data, callback) => {
        savedData = data;
        if (callback) callback();
      });

      const error = new Error('Test error message');
      await usageTracker.trackError(error, 'test_context');

      const errorLog = savedData.errorLog as ErrorLogEntry[];
      expect(errorLog).toHaveLength(1);
      expect(errorLog[0]).toMatchObject({
        timestamp: '2024-02-15T10:00:00.000Z',
        message: 'Test error message',
        context: 'test_context',
        stack: expect.any(String),
      });

      const usageData = savedData.usageData as UsageData;
      expect(usageData.errorCount).toBe(2);
      expect(usageData.lastError).toBe('Test error message');
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

      let savedData: Record<string, unknown> = {};
      mockChromeStorage.local.set.mockImplementation((data, callback) => {
        savedData = data;
        if (callback) callback();
      });

      const newError = new Error('New error');
      await usageTracker.trackError(newError, 'new_context');

      const errorLog = savedData.errorLog as ErrorLogEntry[];
      expect(errorLog).toHaveLength(10);
      expect(errorLog[9].message).toBe('New error');
      expect(errorLog[0].message).toBe('Error 1');
    });
  });

  describe('setUninstallURL', () => {
    it('should generate correct uninstall URL with usage parameters', async () => {
      vi.setSystemTime(new Date('2024-01-31T10:00:00.000Z'));

      const usageData: UsageData = {
        installDate: '2024-01-01T10:00:00.000Z',
        lastActiveDate: '2024-01-31T10:00:00.000Z',
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
            installDate: '2024-02-15T10:00:00.000Z',
            lastActiveDate: '2024-02-15T10:00:00.000Z',
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
      vi.setSystemTime(new Date('2024-01-31T10:00:00.000Z'));
      const thirtyDaysAgo = '2024-01-01T10:00:00.000Z';
      const days = usageTracker['calculateDaysSinceInstall'](thirtyDaysAgo);
      expect(days).toBe(30);
    });

    it('should return 0 for future dates', () => {
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
      const tomorrow = '2024-01-16T10:00:00.000Z';
      const days = usageTracker['calculateDaysSinceInstall'](tomorrow);
      expect(days).toBe(0);
    });

    it('should return 0 for invalid dates', () => {
      const days = usageTracker['calculateDaysSinceInstall']('invalid-date');
      expect(days).toBe(0);
    });
  });
});
