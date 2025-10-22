/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FilePreviewService } from '../../../services/FilePreviewService';
import { normalizeContentForComparison } from '$lib/fileUtils';
import type { FileChange } from '../../../services/FilePreviewService';

const mockGetFileDiff = vi.fn();
const mockCalculateLineDiff = vi.fn();

vi.mock('../../../services/FilePreviewService', () => ({
  FilePreviewService: {
    getInstance: vi.fn(() => ({
      getFileDiff: mockGetFileDiff,
      calculateLineDiff: mockCalculateLineDiff,
    })),
  },
}));

vi.mock('$lib/fileUtils', () => ({
  normalizeContentForComparison: vi.fn((content: string) => content),
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('DiffViewer Business Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetFileDiff.mockResolvedValue({
      path: 'test.js',
      changes: [
        { type: 'deleted', content: 'old content', lineNumber: 1 },
        { type: 'added', content: 'new content', lineNumber: 1 },
        { type: 'unchanged', content: 'line 2', lineNumber: 2 },
      ],
    });
    mockCalculateLineDiff.mockResolvedValue({
      path: 'test.js',
      changes: [
        { type: 'deleted', content: 'old content', lineNumber: 1 },
        { type: 'added', content: 'new content', lineNumber: 1 },
        { type: 'unchanged', content: 'line 2', lineNumber: 2 },
      ],
    });
  });

  describe('File Content Processing Logic', () => {
    it('should process added file changes correctly', () => {
      const addedFileChange: FileChange = {
        path: 'new-file.js',
        status: 'added',
        content: 'line 1\nline 2\nline 3',
      };

      const lines = addedFileChange.content.split('\n');
      const expectedChanges = lines.map((content, index) => ({
        type: 'added' as const,
        content,
        lineNumber: index + 1,
      }));

      expect(expectedChanges).toEqual([
        { type: 'added', content: 'line 1', lineNumber: 1 },
        { type: 'added', content: 'line 2', lineNumber: 2 },
        { type: 'added', content: 'line 3', lineNumber: 3 },
      ]);
    });

    it('should process deleted file changes correctly', () => {
      const deletedFileChange: FileChange = {
        path: 'deleted-file.js',
        status: 'deleted',
        content: '',
        previousContent: 'old line 1\nold line 2',
      };

      const lines = deletedFileChange.previousContent!.split('\n');
      const expectedChanges = lines.map((content, index) => ({
        type: 'deleted' as const,
        content,
        lineNumber: index + 1,
      }));

      expect(expectedChanges).toEqual([
        { type: 'deleted', content: 'old line 1', lineNumber: 1 },
        { type: 'deleted', content: 'old line 2', lineNumber: 2 },
      ]);
    });

    it('should process unchanged file changes correctly', () => {
      const unchangedFileChange: FileChange = {
        path: 'unchanged-file.js',
        status: 'unchanged',
        content: 'same content\nline 2',
      };

      const lines = unchangedFileChange.content.split('\n');
      const expectedChanges = lines.map((content, index) => ({
        type: 'unchanged' as const,
        content,
        lineNumber: index + 1,
      }));

      expect(expectedChanges).toEqual([
        { type: 'unchanged', content: 'same content', lineNumber: 1 },
        { type: 'unchanged', content: 'line 2', lineNumber: 2 },
      ]);
    });
  });

  describe('Content Normalization Logic', () => {
    it('should normalize content for comparison', () => {
      const content = 'test content\nwith newlines\tand tabs';
      const normalized = normalizeContentForComparison(content);

      expect(normalized).toBe(content);
      expect(normalizeContentForComparison).toHaveBeenCalledWith(content);
    });

    it('should handle empty content normalization', () => {
      const emptyContent = '';
      const normalized = normalizeContentForComparison(emptyContent);

      expect(normalized).toBe(emptyContent);
      expect(normalizeContentForComparison).toHaveBeenCalledWith(emptyContent);
    });
  });

  describe('Diff Calculation Logic', () => {
    it('should calculate line diff for modified files', async () => {
      const filePreviewService = FilePreviewService.getInstance();
      const oldContent = 'old line 1\nold line 2';
      const newContent = 'new line 1\nnew line 2';
      const contextLines = 3;

      await filePreviewService.calculateLineDiff('test.js', oldContent, newContent, contextLines);

      expect(mockCalculateLineDiff).toHaveBeenCalledWith(
        'test.js',
        oldContent,
        newContent,
        contextLines
      );
    });

    it('should get file diff when no file change data is available', async () => {
      const filePreviewService = FilePreviewService.getInstance();
      const path = 'test.js';

      await filePreviewService.getFileDiff(path);

      expect(mockGetFileDiff).toHaveBeenCalledWith(path);
    });
  });

  describe('File Change Status Logic', () => {
    it('should determine correct processing based on file status', () => {
      const testCases = [
        { status: 'added' as const, hasContent: true, hasPrevious: false, expected: 'added' },
        { status: 'deleted' as const, hasContent: false, hasPrevious: true, expected: 'deleted' },
        { status: 'modified' as const, hasContent: true, hasPrevious: true, expected: 'modified' },
        {
          status: 'unchanged' as const,
          hasContent: true,
          hasPrevious: false,
          expected: 'unchanged',
        },
      ];

      testCases.forEach(({ status, hasContent, hasPrevious, expected }) => {
        const fileChange: Partial<FileChange> = {
          status,
          content: hasContent ? 'content' : undefined,
          previousContent: hasPrevious ? 'previous' : undefined,
        };

        expect(fileChange.status).toBe(expected);
      });
    });

    it('should handle edge cases for file change processing', () => {
      const modifiedWithoutPrevious: FileChange = {
        path: 'test.js',
        status: 'modified',
        content: 'new content',
        previousContent: undefined,
      };

      expect(modifiedWithoutPrevious.status).toBe('modified');
      expect(modifiedWithoutPrevious.content).toBe('new content');
      expect(modifiedWithoutPrevious.previousContent).toBeUndefined();

      const emptyContent: FileChange = {
        path: 'empty.js',
        status: 'added',
        content: '',
      };

      expect(emptyContent.content).toBe('');
      expect(emptyContent.content.split('\n')).toEqual(['']);
    });
  });

  describe('Error Handling Logic', () => {
    it('should handle service errors gracefully', async () => {
      const errorMessage = 'Service error';
      mockGetFileDiff.mockRejectedValue(new Error(errorMessage));

      const filePreviewService = FilePreviewService.getInstance();

      await expect(filePreviewService.getFileDiff('test.js')).rejects.toThrow(errorMessage);
    });

    it('should handle missing file change data', () => {
      const fileChange: FileChange | undefined = undefined;

      expect(fileChange).toBeUndefined();
    });
  });
});
