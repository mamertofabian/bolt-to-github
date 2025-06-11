/**
 * Tests for LogStorageManager
 */

import { LogStorageManager } from '../logStorage';

// Mock chrome.storage
const mockChromeStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
};

global.chrome = {
  storage: mockChromeStorage,
} as unknown as typeof chrome;

describe('LogStorageManager', () => {
  let storageManager: LogStorageManager;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LogStorageManager as any).instance = null;

    // Reset chrome storage mocks
    mockChromeStorage.local.get.mockImplementation((keys, callback) => {
      if (callback) {
        callback({});
      }
      return Promise.resolve({});
    });
    mockChromeStorage.local.set.mockResolvedValue(undefined);
    mockChromeStorage.local.remove.mockResolvedValue(undefined);

    storageManager = LogStorageManager.getInstance();
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
      const beforeTime = new Date().toISOString();
      await storageManager.addLog('error', 'TestModule', 'Error message');
      const afterTime = new Date().toISOString();

      const recentLogs = storageManager.getRecentLogs(1);
      expect(recentLogs[0].timestamp).toBeDefined();
      expect(new Date(recentLogs[0].timestamp).toISOString()).toBeGreaterThanOrEqual(beforeTime);
      expect(new Date(recentLogs[0].timestamp).toISOString()).toBeLessThanOrEqual(afterTime);
      expect(recentLogs[0].context).toBeDefined();
    });

    it('should maintain memory buffer size limit', async () => {
      // Add more than MAX_MEMORY_ENTRIES (1000) logs
      for (let i = 0; i < 1010; i++) {
        await storageManager.addLog('info', 'TestModule', `Message ${i}`);
      }

      const recentLogs = storageManager.getRecentLogs(2000);
      expect(recentLogs.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('getAllLogs', () => {
    it('should return filtered logs by level', async () => {
      await storageManager.addLog('debug', 'Module1', 'Debug message');
      await storageManager.addLog('info', 'Module2', 'Info message');
      await storageManager.addLog('error', 'Module3', 'Error message');

      const errorLogs = await storageManager.getAllLogs({ levels: ['error'] });
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe('error');
    });

    it('should return filtered logs by module', async () => {
      await storageManager.addLog('info', 'ModuleA', 'Message A');
      await storageManager.addLog('info', 'ModuleB', 'Message B');

      const moduleALogs = await storageManager.getAllLogs({ modules: ['ModuleA'] });
      expect(moduleALogs).toHaveLength(1);
      expect(moduleALogs[0].module).toBe('ModuleA');
    });

    it('should return logs sorted by timestamp', async () => {
      await storageManager.addLog('info', 'Module', 'Message 1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storageManager.addLog('info', 'Module', 'Message 2');

      const allLogs = await storageManager.getAllLogs();
      expect(allLogs[0].message).toBe('Message 1');
      expect(allLogs[1].message).toBe('Message 2');
    });
  });

  describe('clearAllLogs', () => {
    it('should clear all logs from memory and storage', async () => {
      await storageManager.addLog('info', 'Module', 'Message');
      expect(storageManager.getRecentLogs()).toHaveLength(1);

      await storageManager.clearAllLogs();

      expect(storageManager.getRecentLogs()).toHaveLength(0);
      expect(mockChromeStorage.local.remove).toHaveBeenCalled();
    });
  });

  describe('exportLogs', () => {
    it('should export logs as JSON', async () => {
      await storageManager.addLog('info', 'TestModule', 'Test message', { extra: 'data' });

      const exported = await storageManager.exportLogs('json');
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toMatchObject({
        level: 'info',
        module: 'TestModule',
        message: 'Test message',
        data: { extra: 'data' },
      });
    });

    it('should export logs as text', async () => {
      await storageManager.addLog('error', 'TestModule', 'Error occurred');

      const exported = await storageManager.exportLogs('text');

      expect(exported).toContain('[ERROR]');
      expect(exported).toContain('[TestModule]');
      expect(exported).toContain('Error occurred');
    });
  });

  describe('rotateLogs', () => {
    it('should remove logs older than retention period', async () => {
      const oldTimestamp = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(); // 7 hours ago
      const recentTimestamp = new Date().toISOString();

      // Mock storage to return old and new logs
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({
          bolt_logs_current: [
            { timestamp: oldTimestamp, level: 'info', module: 'Old', message: 'Old message' },
            { timestamp: recentTimestamp, level: 'info', module: 'New', message: 'New message' },
          ],
        });
      });

      await storageManager.rotateLogs();

      // Should have called set for archiving current batch
      expect(mockChromeStorage.local.set).toHaveBeenCalled();
    });
  });
});
