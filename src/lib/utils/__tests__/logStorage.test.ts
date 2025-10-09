import { LogStorageManager } from '../logStorage';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z');

const mockChromeStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
};

global.chrome = {
  storage: mockChromeStorage,
  runtime: {
    lastError: null,
  },
} as unknown as typeof chrome;

describe('LogStorageManager', () => {
  let storageManager: LogStorageManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TIME);
    vi.clearAllMocks();

    (LogStorageManager as unknown as { instance: LogStorageManager | null }).instance = null;

    mockChromeStorage.local.get.mockResolvedValue({});
    mockChromeStorage.local.set.mockResolvedValue(undefined);
    mockChromeStorage.local.remove.mockResolvedValue(undefined);

    storageManager = LogStorageManager.getInstance();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = LogStorageManager.getInstance();
      const instance2 = LogStorageManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('addLog', () => {
    it('should add log to memory buffer and pending writes', async () => {
      await storageManager.addLog('info', 'TestModule', 'Test message', { data: 'test' });

      const recentLogs = storageManager.getRecentLogs(10);
      expect(recentLogs).toHaveLength(1);
      expect(recentLogs[0]).toMatchObject({
        level: 'info',
        module: 'TestModule',
        message: 'Test message',
        data: { data: 'test' },
      });
    });

    it('should include timestamp and context in log entry', async () => {
      await storageManager.addLog('error', 'TestModule', 'Error message');

      const recentLogs = storageManager.getRecentLogs(1);
      expect(recentLogs[0].timestamp).toBe(FIXED_TIME.toISOString());
      expect(recentLogs[0].context).toBeDefined();
      expect(['background', 'content', 'popup', 'unknown']).toContain(recentLogs[0].context);
    });

    it('should maintain memory buffer size limit', async () => {
      for (let i = 0; i < 1010; i++) {
        await storageManager.addLog('info', 'TestModule', `Message ${i}`);
      }

      const recentLogs = storageManager.getRecentLogs(2000);
      expect(recentLogs.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('getAllLogs', () => {
    let storedLogs: unknown[] = [];

    beforeEach(() => {
      storedLogs = [];

      mockChromeStorage.local.get.mockImplementation(
        (keys: string | string[] | null, callback?: (result: Record<string, unknown>) => void) => {
          const result: Record<string, unknown> = {};

          if (keys === null) {
            result['bolt_logs_current'] = storedLogs;
            result['bolt_logs_metadata'] = {};
          } else if (Array.isArray(keys)) {
            if (keys.includes('bolt_logs_current')) {
              result['bolt_logs_current'] = storedLogs;
            }
            if (keys.includes('bolt_logs_metadata')) {
              result['bolt_logs_metadata'] = {};
            }
          } else if (keys === 'bolt_logs_current') {
            result['bolt_logs_current'] = storedLogs;
          }

          if (callback) {
            callback(result);
            return undefined;
          }
          return Promise.resolve(result);
        }
      );

      mockChromeStorage.local.set.mockImplementation((items: Record<string, unknown>) => {
        if (items['bolt_logs_current']) {
          storedLogs = [...(items['bolt_logs_current'] as unknown[])];
        }
        return Promise.resolve();
      });
    });

    it('should return filtered logs by level', async () => {
      await storageManager.addLog('debug', 'Module1', 'Debug message');
      await storageManager.addLog('info', 'Module2', 'Info message');
      await storageManager.addLog('error', 'Module3', 'Error message');

      await (
        storageManager as unknown as { flushPendingWrites: () => Promise<void> }
      ).flushPendingWrites();

      const errorLogs = await storageManager.getAllLogs({ levels: ['error'] });
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe('error');
    });

    it('should return filtered logs by module', async () => {
      await storageManager.addLog('info', 'ModuleA', 'Message A');
      await storageManager.addLog('info', 'ModuleB', 'Message B');

      await (
        storageManager as unknown as { flushPendingWrites: () => Promise<void> }
      ).flushPendingWrites();

      const moduleALogs = await storageManager.getAllLogs({ modules: ['ModuleA'] });
      expect(moduleALogs).toHaveLength(1);
      expect(moduleALogs[0].module).toBe('ModuleA');
    });

    it('should return logs sorted by timestamp', async () => {
      await storageManager.addLog('info', 'Module', 'Message 1');

      vi.advanceTimersByTime(1000);
      await storageManager.addLog('info', 'Module', 'Message 2');

      await (
        storageManager as unknown as { flushPendingWrites: () => Promise<void> }
      ).flushPendingWrites();

      const allLogs = await storageManager.getAllLogs();
      expect(allLogs).toHaveLength(2);
      expect(allLogs[0].message).toBe('Message 1');
      expect(allLogs[1].message).toBe('Message 2');
      expect(allLogs[0].timestamp).toBe(FIXED_TIME.toISOString());
      expect(allLogs[1].timestamp).toBe(new Date(FIXED_TIME.getTime() + 1000).toISOString());
    });
  });

  describe('clearAllLogs', () => {
    it('should clear all logs from memory and storage', async () => {
      mockChromeStorage.local.get.mockImplementation(
        (keys: string | string[] | null, callback?: (result: Record<string, unknown>) => void) => {
          const result: Record<string, unknown> = {};
          if (keys === null) {
            result['bolt_logs_current'] = [];
            result['bolt_logs_metadata'] = {};
            result['bolt_logs_12345'] = [];
          }

          if (callback) {
            callback(result);
            return undefined;
          }
          return Promise.resolve(result);
        }
      );

      await storageManager.addLog('info', 'Module', 'Message');
      expect(storageManager.getRecentLogs()).toHaveLength(1);

      await storageManager.clearAllLogs();

      expect(storageManager.getRecentLogs()).toHaveLength(0);
      expect(mockChromeStorage.local.remove).toHaveBeenCalled();
    });
  });

  describe('exportLogs', () => {
    let storedLogs: unknown[] = [];

    beforeEach(() => {
      storedLogs = [];

      mockChromeStorage.local.get.mockImplementation(
        (keys: string | string[] | null, callback?: (result: Record<string, unknown>) => void) => {
          const result: Record<string, unknown> = {};

          if (keys === null) {
            result['bolt_logs_current'] = storedLogs;
            result['bolt_logs_metadata'] = {};
          } else if (Array.isArray(keys)) {
            if (keys.includes('bolt_logs_current')) {
              result['bolt_logs_current'] = storedLogs;
            }
            if (keys.includes('bolt_logs_metadata')) {
              result['bolt_logs_metadata'] = {};
            }
          } else if (keys === 'bolt_logs_current') {
            result['bolt_logs_current'] = storedLogs;
          }

          if (callback) {
            callback(result);
            return undefined;
          }
          return Promise.resolve(result);
        }
      );

      mockChromeStorage.local.set.mockImplementation((items: Record<string, unknown>) => {
        if (items['bolt_logs_current']) {
          storedLogs = [...(items['bolt_logs_current'] as unknown[])];
        }
        return Promise.resolve();
      });
    });

    it('should export logs as JSON', async () => {
      await storageManager.addLog('info', 'TestModule', 'Test message', { extra: 'data' });

      await (
        storageManager as unknown as { flushPendingWrites: () => Promise<void> }
      ).flushPendingWrites();

      const exported = await storageManager.exportLogs('json');
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({
        level: 'info',
        module: 'TestModule',
        message: 'Test message',
        data: { extra: 'data' },
      });
    });

    it('should export logs as text', async () => {
      await storageManager.addLog('error', 'TestModule', 'Error occurred');

      await (
        storageManager as unknown as { flushPendingWrites: () => Promise<void> }
      ).flushPendingWrites();

      const exported = await storageManager.exportLogs('text');

      expect(exported).toContain('[ERROR]');
      expect(exported).toContain('[TestModule]');
      expect(exported).toContain('Error occurred');
    });
  });

  describe('rotateLogs', () => {
    it('should remove logs older than retention period', async () => {
      const oldTimestamp = new Date(FIXED_TIME.getTime() - 13 * 60 * 60 * 1000).toISOString();
      const recentTimestamp = FIXED_TIME.toISOString();

      mockChromeStorage.local.get.mockImplementation(
        (keys: string | string[] | null, callback?: (result: Record<string, unknown>) => void) => {
          let result: Record<string, unknown> = {};

          if (keys === null) {
            result = {
              bolt_logs_current: [
                {
                  timestamp: oldTimestamp,
                  level: 'info',
                  module: 'Old',
                  message: 'Old message',
                  context: 'unknown',
                },
                {
                  timestamp: recentTimestamp,
                  level: 'info',
                  module: 'New',
                  message: 'New message',
                  context: 'unknown',
                },
              ],
              bolt_logs_metadata: {},
            };
          } else if (Array.isArray(keys)) {
            if (keys.includes('bolt_logs_current')) {
              result['bolt_logs_current'] = [
                {
                  timestamp: oldTimestamp,
                  level: 'info',
                  module: 'Old',
                  message: 'Old message',
                  context: 'unknown',
                },
                {
                  timestamp: recentTimestamp,
                  level: 'info',
                  module: 'New',
                  message: 'New message',
                  context: 'unknown',
                },
              ];
            }
            if (keys.includes('bolt_logs_metadata')) {
              result['bolt_logs_metadata'] = {};
            }
          } else if (keys === 'bolt_logs_current') {
            result = {
              bolt_logs_current: [
                {
                  timestamp: oldTimestamp,
                  level: 'info',
                  module: 'Old',
                  message: 'Old message',
                  context: 'unknown',
                },
                {
                  timestamp: recentTimestamp,
                  level: 'info',
                  module: 'New',
                  message: 'New message',
                  context: 'unknown',
                },
              ],
            };
          }

          if (callback) {
            callback(result);
            return undefined;
          }
          return Promise.resolve(result);
        }
      );

      await storageManager.rotateLogs();

      expect(mockChromeStorage.local.set).toHaveBeenCalled();
    });

    it('should retain logs newer than 4 hours', async () => {
      const now = FIXED_TIME.getTime();
      const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();
      const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();
      const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000).toISOString();

      const testLogs = [
        {
          timestamp: oneHourAgo,
          level: 'info' as const,
          module: 'Recent1',
          message: 'Recent log 1',
          context: 'unknown' as const,
        },
        {
          timestamp: threeHoursAgo,
          level: 'info' as const,
          module: 'Recent2',
          message: 'Recent log 2 (3h ago)',
          context: 'unknown' as const,
        },
        {
          timestamp: fiveHoursAgo,
          level: 'info' as const,
          module: 'Old',
          message: 'Old log beyond 4h',
          context: 'unknown' as const,
        },
      ];

      mockChromeStorage.local.get.mockImplementation(
        (keys: string | string[] | null, callback?: (result: Record<string, unknown>) => void) => {
          let result: Record<string, unknown> = {};

          if (keys === null) {
            result = {
              bolt_logs_current: testLogs,
              bolt_logs_metadata: {},
            };
          } else if (Array.isArray(keys)) {
            if (keys.includes('bolt_logs_current')) {
              result['bolt_logs_current'] = testLogs;
            }
            if (keys.includes('bolt_logs_metadata')) {
              result['bolt_logs_metadata'] = {};
            }
          } else if (keys === 'bolt_logs_current') {
            result = { bolt_logs_current: testLogs };
          }

          if (callback) {
            callback(result);
            return undefined;
          }
          return Promise.resolve(result);
        }
      );

      (storageManager as unknown as { memoryBuffer: typeof testLogs }).memoryBuffer = [...testLogs];

      await storageManager.rotateLogs();

      expect(mockChromeStorage.local.set).toHaveBeenCalled();

      const recentLogs = storageManager.getRecentLogs();
      expect(recentLogs.length).toBe(2);

      const modules = recentLogs.map((log) => log.module);
      expect(modules).toContain('Recent1');
      expect(modules).toContain('Recent2');
      expect(modules).not.toContain('Old');
    });
  });
});
