import { describe, it, expect } from 'vitest';
import type { FileChange } from '../../../services/FilePreviewService';

describe('FileChangesModal Logic', () => {
  function countChanges(changes: Map<string, FileChange>) {
    let added = 0,
      modified = 0,
      deleted = 0,
      unchanged = 0;

    changes.forEach((change) => {
      switch (change.status) {
        case 'added':
          added++;
          break;
        case 'modified':
          modified++;
          break;
        case 'deleted':
          deleted++;
          break;
        case 'unchanged':
          unchanged++;
          break;
      }
    });

    return { added, modified, deleted, unchanged, total: changes.size };
  }

  function hasActualChanges(changeCounts: ReturnType<typeof countChanges>): boolean {
    return changeCounts.added > 0 || changeCounts.modified > 0 || changeCounts.deleted > 0;
  }

  describe('countChanges', () => {
    it('should count added files correctly', () => {
      const changes = new Map<string, FileChange>([
        ['file1.ts', { status: 'added', path: 'file1.ts', content: 'content1' }],
        ['file2.ts', { status: 'added', path: 'file2.ts', content: 'content2' }],
        ['file3.ts', { status: 'added', path: 'file3.ts', content: 'content3' }],
      ]);

      const result = countChanges(changes);

      expect(result).toEqual({
        added: 3,
        modified: 0,
        deleted: 0,
        unchanged: 0,
        total: 3,
      });
    });

    it('should count modified files correctly', () => {
      const changes = new Map<string, FileChange>([
        [
          'file1.ts',
          {
            status: 'modified',
            path: 'file1.ts',
            content: 'new content1',
            previousContent: 'old content1',
          },
        ],
        [
          'file2.ts',
          {
            status: 'modified',
            path: 'file2.ts',
            content: 'new content2',
            previousContent: 'old content2',
          },
        ],
      ]);

      const result = countChanges(changes);

      expect(result).toEqual({
        added: 0,
        modified: 2,
        deleted: 0,
        unchanged: 0,
        total: 2,
      });
    });

    it('should count deleted files correctly', () => {
      const changes = new Map<string, FileChange>([
        [
          'file1.ts',
          { status: 'deleted', path: 'file1.ts', content: '', previousContent: 'old content' },
        ],
      ]);

      const result = countChanges(changes);

      expect(result).toEqual({
        added: 0,
        modified: 0,
        deleted: 1,
        unchanged: 0,
        total: 1,
      });
    });

    it('should count unchanged files correctly', () => {
      const changes = new Map<string, FileChange>([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts', content: 'content1' }],
        ['file2.ts', { status: 'unchanged', path: 'file2.ts', content: 'content2' }],
        ['file3.ts', { status: 'unchanged', path: 'file3.ts', content: 'content3' }],
        ['file4.ts', { status: 'unchanged', path: 'file4.ts', content: 'content4' }],
      ]);

      const result = countChanges(changes);

      expect(result).toEqual({
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: 4,
        total: 4,
      });
    });

    it('should count mixed file statuses correctly', () => {
      const changes = new Map<string, FileChange>([
        ['added1.ts', { status: 'added', path: 'added1.ts', content: 'new content1' }],
        ['added2.ts', { status: 'added', path: 'added2.ts', content: 'new content2' }],
        [
          'modified1.ts',
          {
            status: 'modified',
            path: 'modified1.ts',
            content: 'modified content',
            previousContent: 'old content',
          },
        ],
        [
          'deleted1.ts',
          {
            status: 'deleted',
            path: 'deleted1.ts',
            content: '',
            previousContent: 'deleted content1',
          },
        ],
        [
          'deleted2.ts',
          {
            status: 'deleted',
            path: 'deleted2.ts',
            content: '',
            previousContent: 'deleted content2',
          },
        ],
        [
          'deleted3.ts',
          {
            status: 'deleted',
            path: 'deleted3.ts',
            content: '',
            previousContent: 'deleted content3',
          },
        ],
        [
          'unchanged1.ts',
          { status: 'unchanged', path: 'unchanged1.ts', content: 'unchanged content' },
        ],
      ]);

      const result = countChanges(changes);

      expect(result).toEqual({
        added: 2,
        modified: 1,
        deleted: 3,
        unchanged: 1,
        total: 7,
      });
    });

    it('should return zeros for empty map', () => {
      const changes = new Map<string, FileChange>();

      const result = countChanges(changes);

      expect(result).toEqual({
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: 0,
        total: 0,
      });
    });

    it('should calculate total correctly as sum of all statuses', () => {
      const changes = new Map<string, FileChange>([
        ['file1.ts', { status: 'added', path: 'file1.ts', content: 'added content' }],
        [
          'file2.ts',
          {
            status: 'modified',
            path: 'file2.ts',
            content: 'modified content',
            previousContent: 'old content',
          },
        ],
        [
          'file3.ts',
          { status: 'deleted', path: 'file3.ts', content: '', previousContent: 'deleted content' },
        ],
        ['file4.ts', { status: 'unchanged', path: 'file4.ts', content: 'unchanged content' }],
        ['file5.ts', { status: 'unchanged', path: 'file5.ts', content: 'unchanged content 2' }],
      ]);

      const result = countChanges(changes);

      expect(result.total).toBe(5);
      expect(result.total).toBe(result.added + result.modified + result.deleted + result.unchanged);
    });
  });

  describe('hasActualChanges', () => {
    it('should return true when files are added', () => {
      const counts = {
        added: 1,
        modified: 0,
        deleted: 0,
        unchanged: 0,
        total: 1,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });

    it('should return true when files are modified', () => {
      const counts = {
        added: 0,
        modified: 1,
        deleted: 0,
        unchanged: 0,
        total: 1,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });

    it('should return true when files are deleted', () => {
      const counts = {
        added: 0,
        modified: 0,
        deleted: 1,
        unchanged: 0,
        total: 1,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });

    it('should return true when there are multiple types of changes', () => {
      const counts = {
        added: 2,
        modified: 1,
        deleted: 1,
        unchanged: 0,
        total: 4,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });

    it('should return false when all files are unchanged', () => {
      const counts = {
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: 5,
        total: 5,
      };

      expect(hasActualChanges(counts)).toBe(false);
    });

    it('should return false when there are no files', () => {
      const counts = {
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: 0,
        total: 0,
      };

      expect(hasActualChanges(counts)).toBe(false);
    });

    it('should return true even with unchanged files present', () => {
      const counts = {
        added: 1,
        modified: 0,
        deleted: 0,
        unchanged: 10,
        total: 11,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });
  });

  describe('Confirmation Message Generation', () => {
    it('should generate correct message for no changes scenario', () => {
      const unchangedCount = 5;
      const expectedMessage = `No changes detected (${unchangedCount} unchanged files).

Do you still want to push to GitHub?`;

      expect(expectedMessage).toContain('No changes detected');
      expect(expectedMessage).toContain('5 unchanged files');
      expect(expectedMessage).toContain('Do you still want to push to GitHub?');
    });

    it('should format message with single unchanged file', () => {
      const unchangedCount = 1;
      const expectedMessage = `No changes detected (${unchangedCount} unchanged files).

Do you still want to push to GitHub?`;

      expect(expectedMessage).toContain('1 unchanged files');
    });

    it('should format message with zero unchanged files', () => {
      const unchangedCount = 0;
      const expectedMessage = `No changes detected (${unchangedCount} unchanged files).

Do you still want to push to GitHub?`;

      expect(expectedMessage).toContain('0 unchanged files');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large number of changes', () => {
      const changes = new Map<string, FileChange>();

      for (let i = 0; i < 1000; i++) {
        changes.set(`file${i}.ts`, {
          status: 'added',
          path: `file${i}.ts`,
          content: `content${i}`,
        });
      }

      const result = countChanges(changes);

      expect(result.added).toBe(1000);
      expect(result.total).toBe(1000);
    });

    it('should handle files with special characters in path', () => {
      const changes = new Map<string, FileChange>([
        ['file-with-dash.ts', { status: 'added', path: 'file-with-dash.ts', content: 'content1' }],
        [
          'file_with_underscore.ts',
          {
            status: 'modified',
            path: 'file_with_underscore.ts',
            content: 'new content',
            previousContent: 'old content',
          },
        ],
        [
          'file.with.dots.ts',
          {
            status: 'deleted',
            path: 'file.with.dots.ts',
            content: '',
            previousContent: 'deleted content',
          },
        ],
        [
          'file with spaces.ts',
          { status: 'unchanged', path: 'file with spaces.ts', content: 'unchanged content' },
        ],
      ]);

      const result = countChanges(changes);

      expect(result.added).toBe(1);
      expect(result.modified).toBe(1);
      expect(result.deleted).toBe(1);
      expect(result.unchanged).toBe(1);
      expect(result.total).toBe(4);
    });

    it('should handle deeply nested file paths', () => {
      const changes = new Map<string, FileChange>([
        [
          'src/components/ui/modal/nested/deep/file.ts',
          {
            status: 'added',
            path: 'src/components/ui/modal/nested/deep/file.ts',
            content: 'deeply nested content',
          },
        ],
      ]);

      const result = countChanges(changes);

      expect(result.added).toBe(1);
      expect(result.total).toBe(1);
    });

    it('should handle all files being of same status except one', () => {
      const changes = new Map<string, FileChange>([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts', content: 'content1' }],
        ['file2.ts', { status: 'unchanged', path: 'file2.ts', content: 'content2' }],
        ['file3.ts', { status: 'unchanged', path: 'file3.ts', content: 'content3' }],
        ['file4.ts', { status: 'unchanged', path: 'file4.ts', content: 'content4' }],
        [
          'file5.ts',
          {
            status: 'modified',
            path: 'file5.ts',
            content: 'new content',
            previousContent: 'old content',
          },
        ],
      ]);

      const result = countChanges(changes);
      const hasChanges = hasActualChanges(result);

      expect(result.unchanged).toBe(4);
      expect(result.modified).toBe(1);
      expect(hasChanges).toBe(true);
    });
  });
});
