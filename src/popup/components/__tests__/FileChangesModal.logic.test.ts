import { describe, it, expect } from 'vitest';
import type { FileChange } from '../../../services/FilePreviewService';
import {
  countChanges,
  hasActualChanges,
  generateNoChangesConfirmationMessage,
  getTotalActualChanges,
  shouldShowPushConfirmation,
  type ChangeCounts,
} from '../file-changes-modal';

describe('FileChangesModal Business Logic', () => {
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
  });

  describe('hasActualChanges', () => {
    it('should return true when files are added', () => {
      const counts: ChangeCounts = {
        added: 1,
        modified: 0,
        deleted: 0,
        unchanged: 0,
        total: 1,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });

    it('should return true when files are modified', () => {
      const counts: ChangeCounts = {
        added: 0,
        modified: 1,
        deleted: 0,
        unchanged: 0,
        total: 1,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });

    it('should return true when files are deleted', () => {
      const counts: ChangeCounts = {
        added: 0,
        modified: 0,
        deleted: 1,
        unchanged: 0,
        total: 1,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });

    it('should return true when there are multiple types of changes', () => {
      const counts: ChangeCounts = {
        added: 2,
        modified: 1,
        deleted: 1,
        unchanged: 0,
        total: 4,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });

    it('should return false when all files are unchanged', () => {
      const counts: ChangeCounts = {
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: 5,
        total: 5,
      };

      expect(hasActualChanges(counts)).toBe(false);
    });

    it('should return false when there are no files', () => {
      const counts: ChangeCounts = {
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: 0,
        total: 0,
      };

      expect(hasActualChanges(counts)).toBe(false);
    });

    it('should return true even with unchanged files present', () => {
      const counts: ChangeCounts = {
        added: 1,
        modified: 0,
        deleted: 0,
        unchanged: 10,
        total: 11,
      };

      expect(hasActualChanges(counts)).toBe(true);
    });
  });

  describe('generateNoChangesConfirmationMessage', () => {
    it('should generate correct message for single unchanged file', () => {
      const unchangedCount = 1;
      const result = generateNoChangesConfirmationMessage(unchangedCount);

      expect(result).toContain('No changes detected');
      expect(result).toContain('1 unchanged files');
      expect(result).toContain('Do you still want to push to GitHub?');
    });

    it('should generate correct message for multiple unchanged files', () => {
      const unchangedCount = 5;
      const result = generateNoChangesConfirmationMessage(unchangedCount);

      expect(result).toContain('No changes detected');
      expect(result).toContain('5 unchanged files');
      expect(result).toContain('Do you still want to push to GitHub?');
    });

    it('should generate correct message for zero unchanged files', () => {
      const unchangedCount = 0;
      const result = generateNoChangesConfirmationMessage(unchangedCount);

      expect(result).toContain('No changes detected');
      expect(result).toContain('0 unchanged files');
      expect(result).toContain('Do you still want to push to GitHub?');
    });

    it('should include proper line breaks in message', () => {
      const unchangedCount = 3;
      const result = generateNoChangesConfirmationMessage(unchangedCount);

      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('No changes detected');
      expect(lines[1]).toBe('');
      expect(lines[2]).toContain('Do you still want to push to GitHub?');
    });
  });

  describe('getTotalActualChanges', () => {
    it('should calculate total changes correctly', () => {
      const counts: ChangeCounts = {
        added: 2,
        modified: 3,
        deleted: 1,
        unchanged: 5,
        total: 11,
      };

      const result = getTotalActualChanges(counts);

      expect(result).toBe(6);
    });

    it('should return zero when no actual changes', () => {
      const counts: ChangeCounts = {
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: 5,
        total: 5,
      };

      const result = getTotalActualChanges(counts);

      expect(result).toBe(0);
    });

    it('should handle only added files', () => {
      const counts: ChangeCounts = {
        added: 4,
        modified: 0,
        deleted: 0,
        unchanged: 0,
        total: 4,
      };

      const result = getTotalActualChanges(counts);

      expect(result).toBe(4);
    });

    it('should handle only modified files', () => {
      const counts: ChangeCounts = {
        added: 0,
        modified: 3,
        deleted: 0,
        unchanged: 2,
        total: 5,
      };

      const result = getTotalActualChanges(counts);

      expect(result).toBe(3);
    });

    it('should handle only deleted files', () => {
      const counts: ChangeCounts = {
        added: 0,
        modified: 0,
        deleted: 2,
        unchanged: 1,
        total: 3,
      };

      const result = getTotalActualChanges(counts);

      expect(result).toBe(2);
    });
  });

  describe('shouldShowPushConfirmation', () => {
    it('should return true when there are no changes', () => {
      const hasChanges = false;

      const result = shouldShowPushConfirmation(hasChanges);

      expect(result).toBe(true);
    });

    it('should return false when there are changes', () => {
      const hasChanges = true;

      const result = shouldShowPushConfirmation(hasChanges);

      expect(result).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('should work correctly with real-world file change scenarios', () => {
      const changes = new Map<string, FileChange>([
        [
          'src/components/Button.svelte',
          {
            status: 'modified',
            path: 'src/components/Button.svelte',
            content: 'updated',
            previousContent: 'old',
          },
        ],
        [
          'src/components/Modal.svelte',
          { status: 'added', path: 'src/components/Modal.svelte', content: 'new component' },
        ],
        [
          'src/utils/helpers.ts',
          {
            status: 'deleted',
            path: 'src/utils/helpers.ts',
            content: '',
            previousContent: 'old helper',
          },
        ],
        [
          'src/lib/stores.ts',
          { status: 'unchanged', path: 'src/lib/stores.ts', content: 'same content' },
        ],
        [
          'src/lib/api.ts',
          { status: 'unchanged', path: 'src/lib/api.ts', content: 'same content' },
        ],
      ]);

      const counts = countChanges(changes);
      const hasChanges = hasActualChanges(counts);
      const totalChanges = getTotalActualChanges(counts);
      const shouldConfirm = shouldShowPushConfirmation(hasChanges);

      expect(counts).toEqual({
        added: 1,
        modified: 1,
        deleted: 1,
        unchanged: 2,
        total: 5,
      });
      expect(hasChanges).toBe(true);
      expect(totalChanges).toBe(3);
      expect(shouldConfirm).toBe(false);
    });

    it('should handle edge case where all files are unchanged', () => {
      const changes = new Map<string, FileChange>([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts', content: 'content1' }],
        ['file2.ts', { status: 'unchanged', path: 'file2.ts', content: 'content2' }],
        ['file3.ts', { status: 'unchanged', path: 'file3.ts', content: 'content3' }],
      ]);

      const counts = countChanges(changes);
      const hasChanges = hasActualChanges(counts);
      const totalChanges = getTotalActualChanges(counts);
      const shouldConfirm = shouldShowPushConfirmation(hasChanges);
      const message = generateNoChangesConfirmationMessage(counts.unchanged);

      expect(counts).toEqual({
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: 3,
        total: 3,
      });
      expect(hasChanges).toBe(false);
      expect(totalChanges).toBe(0);
      expect(shouldConfirm).toBe(true);
      expect(message).toContain('3 unchanged files');
    });
  });
});
