import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilePreviewService } from '../FilePreviewService';

vi.mock('../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('FilePreviewService', () => {
  let service: FilePreviewService;

  beforeEach(() => {
    (FilePreviewService as unknown as { instance: FilePreviewService | null }).instance = null;
    service = FilePreviewService.getInstance();
  });

  afterEach(() => {
    service.cleanup();
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = FilePreviewService.getInstance();
      const instance2 = FilePreviewService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should initialize successfully', () => {
      expect(() => FilePreviewService.getInstance()).not.toThrow();
    });
  });

  describe('Line Diff Calculation', () => {
    it('should identify unchanged lines', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nline2\nline3';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff.path).toBe('test.txt');
      expect(diff.changes).toHaveLength(3);
      expect(diff.changes.every((c) => c.type === 'unchanged')).toBe(true);
    });

    it('should identify added lines', () => {
      const oldContent = 'line1\nline2';
      const newContent = 'line1\nline2\nline3';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff.changes.some((c) => c.type === 'added' && c.content === 'line3')).toBe(true);
    });

    it('should identify deleted lines', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nline3';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff.changes.some((c) => c.type === 'deleted' && c.content === 'line2')).toBe(true);
    });

    it('should identify modified lines', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nmodified\nline3';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff.changes.some((c) => c.type === 'added' && c.content === 'modified')).toBe(true);
      expect(diff.changes.some((c) => c.type === 'deleted' && c.content === 'line2')).toBe(true);
    });

    it('should handle empty content', () => {
      const diff = service.calculateLineDiff('test.txt', '', '');

      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].content).toBe('');
    });

    it('should handle completely different files', () => {
      const oldContent = 'completely\ndifferent\nold\nfile';
      const newContent = 'totally\nnew\ncontent\nhere';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff.changes.length).toBeGreaterThan(0);
      const hasDeleted = diff.changes.some((c) => c.type === 'deleted');
      const hasAdded = diff.changes.some((c) => c.type === 'added');
      expect(hasDeleted || hasAdded).toBe(true);
    });
  });

  describe('Contextual Diff', () => {
    it('should show all lines when contextLines is 0', () => {
      const oldContent = 'line1\nline2\nline3\nline4\nline5';
      const newContent = 'line1\nline2\nmodified\nline4\nline5';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent, 0);

      expect(diff.isContextual).toBeUndefined();
      expect(diff.totalLines).toBeUndefined();
    });

    it('should create contextual diff when contextLines > 0', () => {
      const oldContent = Array(20)
        .fill(0)
        .map((_, i) => `line${i + 1}`)
        .join('\n');
      const newContent = Array(20)
        .fill(0)
        .map((_, i) => (i === 3 ? 'modified4' : `line${i + 1}`))
        .join('\n');

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent, 2);

      expect(diff.isContextual).toBe(true);
      expect(diff.changes.length).toBeLessThan(diff.totalLines || 20);
    });

    it('should merge overlapping context ranges', () => {
      const oldContent = Array(20)
        .fill(0)
        .map((_, i) => `line${i + 1}`)
        .join('\n');
      const newContent = Array(20)
        .fill(0)
        .map((_, i) => (i === 3 || i === 5 ? `modified${i + 1}` : `line${i + 1}`))
        .join('\n');

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent, 2);

      expect(diff.isContextual).toBe(true);
      const hasSkippedMarker = diff.changes.some((c) => c.lineNumber === -1);
      expect(hasSkippedMarker || diff.changes.length < 20).toBe(true);
    });

    it('should include context lines around changes', () => {
      const oldContent = 'line1\nline2\nline3\nline4\nline5\nline6\nline7';
      const newContent = 'line1\nline2\nmodified\nline4\nline5\nline6\nline7';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent, 1);

      expect(diff.isContextual).toBe(true);
      expect(diff.changes.some((c) => c.content === 'line2')).toBe(true);
      expect(diff.changes.some((c) => c.content === 'line4')).toBe(true);
    });

    it('should handle no context when changes are at file boundaries', () => {
      const oldContent = 'first\nline2\nline3';
      const newContent = 'changed\nline2\nline3';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent, 1);

      expect(diff.isContextual).toBe(true);
      expect(diff.changes.some((c) => c.type === 'deleted' && c.content === 'first')).toBe(true);
      expect(diff.changes.some((c) => c.type === 'added' && c.content === 'changed')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with only newlines', () => {
      const oldContent = '\n\n\n';
      const newContent = '\n\n';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff).not.toBeNull();
      expect(diff.changes.length).toBeGreaterThan(0);
    });

    it('should handle special characters in file content', () => {
      const specialContent = '!@#$%^&*()_+{}[]|\\:";\'<>?,./`~';
      const diff = service.calculateLineDiff('test.txt', specialContent, specialContent);

      expect(diff.changes[0].content).toBe(specialContent);
    });

    it('should handle unicode characters in file content', () => {
      const unicodeContent = '你好世界 🌍 Привет мир';
      const diff = service.calculateLineDiff('test.txt', unicodeContent, unicodeContent);

      expect(diff.changes[0].content).toBe(unicodeContent);
    });

    it('should handle very long file paths', () => {
      const longPath = 'a/'.repeat(50) + 'file.txt';
      const diff = service.calculateLineDiff(longPath, 'content', 'content');

      expect(diff.path).toBe(longPath);
    });

    it('should handle files with no newlines', () => {
      const content = 'single line content';
      const diff = service.calculateLineDiff('test.txt', content, content);

      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].content).toBe(content);
      expect(diff.changes[0].type).toBe('unchanged');
    });

    it('should handle contextual diff with all changes', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'new1\nnew2\nnew3';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent, 1);

      expect(diff).not.toBeNull();
      expect(diff.changes.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    it('should not throw when cleanup is called', () => {
      expect(() => service.cleanup()).not.toThrow();
    });

    it('should allow cleanup to be called multiple times', () => {
      service.cleanup();
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe('LCS Algorithm', () => {
    it('should correctly identify longest common subsequence', () => {
      const oldContent = 'A\nB\nC\nD';
      const newContent = 'A\nX\nC\nY';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff.changes.some((c) => c.type === 'unchanged' && c.content === 'A')).toBe(true);
      expect(diff.changes.some((c) => c.type === 'unchanged' && c.content === 'C')).toBe(true);
      expect(diff.changes.some((c) => c.type === 'deleted' && c.content === 'B')).toBe(true);
      expect(diff.changes.some((c) => c.type === 'deleted' && c.content === 'D')).toBe(true);
      expect(diff.changes.some((c) => c.type === 'added' && c.content === 'X')).toBe(true);
      expect(diff.changes.some((c) => c.type === 'added' && c.content === 'Y')).toBe(true);
    });

    it('should handle large diffs efficiently', () => {
      const oldLines = Array(100)
        .fill(0)
        .map((_, i) => `line${i}`);
      const newLines = Array(100)
        .fill(0)
        .map((_, i) => (i % 10 === 0 ? `modified${i}` : `line${i}`));

      const oldContent = oldLines.join('\n');
      const newContent = newLines.join('\n');

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff.changes).toBeDefined();
      expect(diff.changes.length).toBeGreaterThan(0);
    });
  });
});
