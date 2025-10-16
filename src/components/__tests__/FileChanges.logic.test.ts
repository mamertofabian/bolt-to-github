/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import type { FileChange } from '../../services/FilePreviewService';

function getStatusIcon(status: string): string {
  switch (status) {
    case 'added':
      return '➕';
    case 'modified':
      return '✏️';
    case 'deleted':
      return '❌';
    case 'unchanged':
      return '✓';
    default:
      return '';
  }
}

function formatPath(path: string): string {
  return path.replace(/^project\//, '');
}

function filterFilesByStatus(files: FileChange[], status: string): FileChange[] {
  return files.filter((file) => file.status === status);
}

function countFilesByStatus(files: FileChange[], status: string): number {
  return files.filter((file) => file.status === status).length;
}

function calculateChangedCount(files: FileChange[]): number {
  return (
    countFilesByStatus(files, 'added') +
    countFilesByStatus(files, 'modified') +
    countFilesByStatus(files, 'deleted')
  );
}

function calculateTotalCount(files: FileChange[]): number {
  return files.length;
}

describe('FileChanges Logic Functions', () => {
  const createFileChange = (
    path: string,
    status: string,
    previousContent?: string
  ): FileChange => ({
    path,
    status: status as 'added' | 'modified' | 'deleted' | 'unchanged',
    content: 'test content',
    previousContent,
  });

  const sampleFiles: FileChange[] = [
    createFileChange('src/file1.ts', 'added'),
    createFileChange('src/file2.ts', 'modified', 'old content'),
    createFileChange('src/file3.ts', 'deleted', 'old content'),
    createFileChange('src/file4.ts', 'unchanged'),
    createFileChange('project/src/file5.ts', 'added'),
  ];

  describe('getStatusIcon', () => {
    it('should return correct icon for added status', () => {
      expect(getStatusIcon('added')).toBe('➕');
    });

    it('should return correct icon for modified status', () => {
      expect(getStatusIcon('modified')).toBe('✏️');
    });

    it('should return correct icon for deleted status', () => {
      expect(getStatusIcon('deleted')).toBe('❌');
    });

    it('should return correct icon for unchanged status', () => {
      expect(getStatusIcon('unchanged')).toBe('✓');
    });

    it('should return empty string for unknown status', () => {
      expect(getStatusIcon('unknown')).toBe('');
    });

    it('should return empty string for empty status', () => {
      expect(getStatusIcon('')).toBe('');
    });
  });

  describe('formatPath', () => {
    it('should remove project/ prefix from path', () => {
      expect(formatPath('project/src/file.ts')).toBe('src/file.ts');
    });

    it('should remove only the first project/ prefix', () => {
      expect(formatPath('project/project/file.ts')).toBe('project/file.ts');
    });

    it('should not modify path without project/ prefix', () => {
      expect(formatPath('src/file.ts')).toBe('src/file.ts');
    });

    it('should not modify path with project/ in middle', () => {
      expect(formatPath('src/project/file.ts')).toBe('src/project/file.ts');
    });

    it('should handle empty path', () => {
      expect(formatPath('')).toBe('');
    });

    it('should handle path that is just project/', () => {
      expect(formatPath('project/')).toBe('');
    });

    it('should handle path that starts with project but not followed by slash', () => {
      expect(formatPath('projectfile.ts')).toBe('projectfile.ts');
    });
  });

  describe('filterFilesByStatus', () => {
    it('should filter added files', () => {
      const result = filterFilesByStatus(sampleFiles, 'added');
      expect(result).toHaveLength(2);
      expect(result.every((file) => file.status === 'added')).toBe(true);
    });

    it('should filter modified files', () => {
      const result = filterFilesByStatus(sampleFiles, 'modified');
      expect(result).toHaveLength(1);
      expect(result.every((file) => file.status === 'modified')).toBe(true);
    });

    it('should filter deleted files', () => {
      const result = filterFilesByStatus(sampleFiles, 'deleted');
      expect(result).toHaveLength(1);
      expect(result.every((file) => file.status === 'deleted')).toBe(true);
    });

    it('should filter unchanged files', () => {
      const result = filterFilesByStatus(sampleFiles, 'unchanged');
      expect(result).toHaveLength(1);
      expect(result.every((file) => file.status === 'unchanged')).toBe(true);
    });

    it('should return empty array for unknown status', () => {
      const result = filterFilesByStatus(sampleFiles, 'unknown');
      expect(result).toHaveLength(0);
    });

    it('should handle empty files array', () => {
      const result = filterFilesByStatus([], 'added');
      expect(result).toHaveLength(0);
    });
  });

  describe('countFilesByStatus', () => {
    it('should count added files', () => {
      expect(countFilesByStatus(sampleFiles, 'added')).toBe(2);
    });

    it('should count modified files', () => {
      expect(countFilesByStatus(sampleFiles, 'modified')).toBe(1);
    });

    it('should count deleted files', () => {
      expect(countFilesByStatus(sampleFiles, 'deleted')).toBe(1);
    });

    it('should count unchanged files', () => {
      expect(countFilesByStatus(sampleFiles, 'unchanged')).toBe(1);
    });

    it('should return 0 for unknown status', () => {
      expect(countFilesByStatus(sampleFiles, 'unknown')).toBe(0);
    });

    it('should handle empty files array', () => {
      expect(countFilesByStatus([], 'added')).toBe(0);
    });
  });

  describe('calculateChangedCount', () => {
    it('should calculate correct changed count', () => {
      expect(calculateChangedCount(sampleFiles)).toBe(4);
    });

    it('should return 0 when no changed files', () => {
      const unchangedFiles = sampleFiles.filter((file) => file.status === 'unchanged');
      expect(calculateChangedCount(unchangedFiles)).toBe(0);
    });

    it('should handle empty files array', () => {
      expect(calculateChangedCount([])).toBe(0);
    });

    it('should handle only added files', () => {
      const addedFiles = sampleFiles.filter((file) => file.status === 'added');
      expect(calculateChangedCount(addedFiles)).toBe(2);
    });

    it('should handle only modified files', () => {
      const modifiedFiles = sampleFiles.filter((file) => file.status === 'modified');
      expect(calculateChangedCount(modifiedFiles)).toBe(1);
    });

    it('should handle only deleted files', () => {
      const deletedFiles = sampleFiles.filter((file) => file.status === 'deleted');
      expect(calculateChangedCount(deletedFiles)).toBe(1);
    });
  });

  describe('calculateTotalCount', () => {
    it('should calculate correct total count', () => {
      expect(calculateTotalCount(sampleFiles)).toBe(5);
    });

    it('should return 0 for empty files array', () => {
      expect(calculateTotalCount([])).toBe(0);
    });

    it('should return 1 for single file', () => {
      const singleFile = [sampleFiles[0]];
      expect(calculateTotalCount(singleFile)).toBe(1);
    });
  });

  describe('Integration Tests', () => {
    it('should correctly process a complete file changes scenario', () => {
      const files = [
        createFileChange('project/src/component.svelte', 'added'),
        createFileChange('src/utils/helper.ts', 'modified', 'old helper'),
        createFileChange('src/old-file.js', 'deleted', 'old content'),
        createFileChange('src/readme.md', 'unchanged'),
      ];

      const addedFiles = filterFilesByStatus(files, 'added');
      const modifiedFiles = filterFilesByStatus(files, 'modified');
      const deletedFiles = filterFilesByStatus(files, 'deleted');
      const unchangedFiles = filterFilesByStatus(files, 'unchanged');

      expect(addedFiles).toHaveLength(1);
      expect(modifiedFiles).toHaveLength(1);
      expect(deletedFiles).toHaveLength(1);
      expect(unchangedFiles).toHaveLength(1);

      expect(calculateChangedCount(files)).toBe(3);
      expect(calculateTotalCount(files)).toBe(4);

      expect(formatPath(addedFiles[0].path)).toBe('src/component.svelte');
      expect(formatPath(modifiedFiles[0].path)).toBe('src/utils/helper.ts');

      expect(getStatusIcon(addedFiles[0].status)).toBe('➕');
      expect(getStatusIcon(modifiedFiles[0].status)).toBe('✏️');
      expect(getStatusIcon(deletedFiles[0].status)).toBe('❌');
      expect(getStatusIcon(unchangedFiles[0].status)).toBe('✓');
    });

    it('should handle edge cases correctly', () => {
      const edgeCaseFiles = [
        createFileChange('', 'added'),
        createFileChange('project/', 'modified', 'old'),
        createFileChange('project/project/project/file.ts', 'deleted', 'old'),
      ];

      expect(calculateChangedCount(edgeCaseFiles)).toBe(3);
      expect(calculateTotalCount(edgeCaseFiles)).toBe(3);

      expect(formatPath('')).toBe('');
      expect(formatPath('project/')).toBe('');
      expect(formatPath('project/project/project/file.ts')).toBe('project/project/file.ts');
    });
  });
});
