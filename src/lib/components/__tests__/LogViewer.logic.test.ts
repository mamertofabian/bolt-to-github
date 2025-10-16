import { describe, it, expect } from 'vitest';
import type { LogEntry } from '$lib/utils/logStorage';
import {
  filterLogs,
  calculateLogStats,
  formatLogForText,
  formatLogsForTextExport,
  createLogExportData,
  debounceSearchTerm,
  isAtScrollBottom,
  generateLogFilename,
} from '$lib/utils/log-filtering';

describe('LogViewer Logic', () => {
  const sampleLogs: LogEntry[] = [
    {
      timestamp: '2025-01-15T10:00:00Z',
      level: 'info',
      context: 'background',
      module: 'AuthService',
      message: 'User authenticated successfully',
      data: { userId: '123' },
    },
    {
      timestamp: '2025-01-15T10:01:00Z',
      level: 'error',
      context: 'content',
      module: 'FileUploader',
      message: 'Failed to upload file',
      data: { error: 'Network timeout' },
    },
    {
      timestamp: '2025-01-15T10:02:00Z',
      level: 'warn',
      context: 'popup',
      module: 'Settings',
      message: 'Invalid configuration detected',
    },
    {
      timestamp: '2025-01-15T10:03:00Z',
      level: 'debug',
      context: 'unknown',
      module: 'Logger',
      message: 'Debug information',
      data: { debug: true },
    },
  ];

  describe('filterLogs', () => {
    it('should return all logs when no filters are applied', () => {
      const result = filterLogs(sampleLogs);
      expect(result).toHaveLength(4);
      expect(result).toEqual(sampleLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
    });

    it('should filter logs by level', () => {
      const result = filterLogs(sampleLogs, { level: 'error' });
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe('error');
      expect(result[0].message).toBe('Failed to upload file');
    });

    it('should filter logs by context', () => {
      const result = filterLogs(sampleLogs, { context: 'background' });
      expect(result).toHaveLength(1);
      expect(result[0].context).toBe('background');
      expect(result[0].message).toBe('User authenticated successfully');
    });

    it('should filter logs by search term in message', () => {
      const result = filterLogs(sampleLogs, { searchTerm: 'authenticated' });
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('User authenticated successfully');
    });

    it('should filter logs by search term in module', () => {
      const result = filterLogs(sampleLogs, { searchTerm: 'AuthService' });
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe('AuthService');
    });

    it('should filter logs by search term in data', () => {
      const result = filterLogs(sampleLogs, { searchTerm: 'userId' });
      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({ userId: '123' });
    });

    it('should combine level and context filters', () => {
      const result = filterLogs(sampleLogs, { level: 'error', context: 'content' });
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe('error');
      expect(result[0].context).toBe('content');
    });

    it('should combine all filters', () => {
      const result = filterLogs(sampleLogs, {
        level: 'info',
        context: 'background',
        searchTerm: 'authenticated',
      });
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe('info');
      expect(result[0].context).toBe('background');
      expect(result[0].message).toBe('User authenticated successfully');
    });

    it('should return empty array when no logs match filters', () => {
      const result = filterLogs(sampleLogs, { level: 'error', context: 'background' });
      expect(result).toHaveLength(0);
    });

    it('should handle case-insensitive search', () => {
      const result = filterLogs(sampleLogs, { searchTerm: 'AUTHENTICATED' });
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('User authenticated successfully');
    });

    it('should sort results by timestamp ascending', () => {
      const unsortedLogs = [
        { ...sampleLogs[3], timestamp: '2025-01-15T09:00:00Z' },
        { ...sampleLogs[0], timestamp: '2025-01-15T11:00:00Z' },
        { ...sampleLogs[1], timestamp: '2025-01-15T10:00:00Z' },
      ];

      const result = filterLogs(unsortedLogs);
      expect(result[0].timestamp).toBe('2025-01-15T09:00:00Z');
      expect(result[1].timestamp).toBe('2025-01-15T10:00:00Z');
      expect(result[2].timestamp).toBe('2025-01-15T11:00:00Z');
    });
  });

  describe('calculateLogStats', () => {
    it('should calculate correct statistics for all logs', () => {
      const stats = calculateLogStats(sampleLogs, sampleLogs);
      expect(stats).toEqual({ total: 4, filtered: 4 });
    });

    it('should calculate correct statistics for filtered logs', () => {
      const filteredLogs = sampleLogs.filter((log) => log.level === 'error');
      const stats = calculateLogStats(sampleLogs, filteredLogs);
      expect(stats).toEqual({ total: 4, filtered: 1 });
    });

    it('should handle empty arrays', () => {
      const stats = calculateLogStats([], []);
      expect(stats).toEqual({ total: 0, filtered: 0 });
    });

    it('should handle empty filtered logs', () => {
      const stats = calculateLogStats(sampleLogs, []);
      expect(stats).toEqual({ total: 4, filtered: 0 });
    });
  });

  describe('formatLogForText', () => {
    it('should format log without data', () => {
      const log: LogEntry = {
        timestamp: '2025-01-15T10:00:00Z',
        level: 'info',
        context: 'background',
        module: 'AuthService',
        message: 'User authenticated successfully',
      };

      const result = formatLogForText(log);
      expect(result).toBe(
        '[2025-01-15T10:00:00Z] [INFO] [background] [AuthService] User authenticated successfully'
      );
    });

    it('should format log with data', () => {
      const log: LogEntry = {
        timestamp: '2025-01-15T10:01:00Z',
        level: 'error',
        context: 'content',
        module: 'FileUploader',
        message: 'Failed to upload file',
        data: { error: 'Network timeout' },
      };

      const result = formatLogForText(log);
      expect(result).toBe(
        '[2025-01-15T10:01:00Z] [ERROR] [content] [FileUploader] Failed to upload file | Data: {"error":"Network timeout"}'
      );
    });
  });

  describe('formatLogsForTextExport', () => {
    it('should format multiple logs with newlines', () => {
      const logs = sampleLogs.slice(0, 2);
      const result = formatLogsForTextExport(logs);

      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('User authenticated successfully');
      expect(lines[1]).toContain('Failed to upload file');
    });

    it('should handle empty array', () => {
      const result = formatLogsForTextExport([]);
      expect(result).toBe('');
    });
  });

  describe('createLogExportData', () => {
    it('should create export data with default metadata', () => {
      const result = createLogExportData(sampleLogs);

      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('logs');
      expect(result.logs).toEqual(sampleLogs);
      expect(result.metadata).toHaveProperty('timestamp');
      expect(result.metadata).toHaveProperty('version', '1.0.0');
    });

    it('should create export data with custom metadata', () => {
      const customMetadata = { timestamp: '2025-01-15T12:00:00Z', version: '2.0.0' };
      const result = createLogExportData(sampleLogs, customMetadata);

      expect(result.metadata).toEqual(customMetadata);
      expect(result.logs).toEqual(sampleLogs);
    });
  });

  describe('debounceSearchTerm', () => {
    it('should return same term when unchanged', () => {
      const result = debounceSearchTerm('test', 'test');
      expect(result.debouncedTerm).toBe('test');
      expect(result.timeoutId).toBeNull();
    });

    it('should return new term when changed', () => {
      const result = debounceSearchTerm('new', 'old');
      expect(result.debouncedTerm).toBe('new');
      expect(result.timeoutId).toBe(1);
    });

    it('should return empty string when search term is empty', () => {
      const result = debounceSearchTerm('', 'old');
      expect(result.debouncedTerm).toBe('');
      expect(result.timeoutId).toBeNull();
    });

    it('should use custom delay', () => {
      const result = debounceSearchTerm('new', 'old');
      expect(result.debouncedTerm).toBe('new');
      expect(result.timeoutId).toBe(1);
    });
  });

  describe('isAtScrollBottom', () => {
    it('should return true when at bottom', () => {
      const result = isAtScrollBottom(100, 200, 100);
      expect(result).toBe(true);
    });

    it('should return true when within tolerance', () => {
      const result = isAtScrollBottom(100, 200, 100, 50);
      expect(result).toBe(true);
    });

    it('should return false when not at bottom', () => {
      const result = isAtScrollBottom(50, 200, 100);
      expect(result).toBe(false);
    });

    it('should use custom tolerance', () => {
      const result = isAtScrollBottom(50, 200, 100, 10);
      expect(result).toBe(false);
    });
  });

  describe('generateLogFilename', () => {
    it('should generate filename with current date', () => {
      const result = generateLogFilename('bolt-to-github-logs', 'json');
      expect(result).toMatch(/^bolt-to-github-logs-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should generate filename with custom date', () => {
      const customDate = new Date('2025-01-15T12:00:00Z');
      const result = generateLogFilename('test-logs', 'txt', customDate);
      expect(result).toBe('test-logs-2025-01-15.txt');
    });

    it('should handle different extensions', () => {
      const result = generateLogFilename('logs', 'csv');
      expect(result).toMatch(/^logs-\d{4}-\d{2}-\d{2}\.csv$/);
    });
  });
});
