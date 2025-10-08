import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeBase64ToUtf8,
  normalizeContentForComparison,
  processFilesWithGitignore,
} from '../fileUtils';
import type { ProjectFiles } from '../types';

describe('fileUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processFilesWithGitignore', () => {
    it('should process files with .gitignore rules', () => {
      const files: ProjectFiles = new Map([
        ['.gitignore', 'node_modules/\n*.log\nbuild/'],
        ['README.md', '# Project'],
        ['src/index.js', 'console.log("hello");'],
        ['node_modules/package.json', '{}'],
        ['debug.log', 'debug info'],
        ['build/output.js', 'compiled code'],
        ['src/test.js', 'test code'],
      ]);

      const result = processFilesWithGitignore(files);

      expect(result.has('README.md')).toBe(true);
      expect(result.has('src/index.js')).toBe(true);
      expect(result.has('src/test.js')).toBe(true);
      expect(result.has('node_modules/package.json')).toBe(false);
      expect(result.has('debug.log')).toBe(false);
      expect(result.has('build/output.js')).toBe(false);
    });

    it('should handle project/ prefix in paths', () => {
      const files: ProjectFiles = new Map([
        ['project/.gitignore', '*.tmp\n'],
        ['project/README.md', '# Project'],
        ['project/temp.tmp', 'temporary'],
        ['project/src/index.js', 'code'],
      ]);

      const result = processFilesWithGitignore(files);

      expect(result.has('README.md')).toBe(true);
      expect(result.has('src/index.js')).toBe(true);
      expect(result.has('temp.tmp')).toBe(false);
    });

    it('should use default ignore patterns when no .gitignore exists', () => {
      const files: ProjectFiles = new Map([
        ['README.md', '# Project'],
        ['node_modules/lib.js', 'library'],
        ['dist/bundle.js', 'bundled'],
        ['.DS_Store', 'mac file'],
        ['src/index.js', 'source'],
      ]);

      const result = processFilesWithGitignore(files);

      expect(result.has('README.md')).toBe(true);
      expect(result.has('src/index.js')).toBe(true);
      expect(result.has('node_modules/lib.js')).toBe(false);
      expect(result.has('dist/bundle.js')).toBe(false);
      expect(result.has('.DS_Store')).toBe(false);
    });

    it('should skip directory entries and empty files', () => {
      const files: ProjectFiles = new Map([
        ['src/', ''],
        ['empty.txt', ''],
        ['README.md', '# Project'],
        ['whitespace.txt', '   \n  \t  '],
      ]);

      const result = processFilesWithGitignore(files);

      expect(result.has('src/')).toBe(false);
      expect(result.has('empty.txt')).toBe(false);
      expect(result.has('README.md')).toBe(true);
      expect(result.has('whitespace.txt')).toBe(false);
    });
  });

  describe('decodeBase64ToUtf8', () => {
    it('should decode basic ASCII content correctly', () => {
      const content = 'Hello World';
      const base64 = btoa(content);

      const result = decodeBase64ToUtf8(base64);

      expect(result).toBe(content);
    });

    it('should handle invalid base64 input', () => {
      const invalidBase64 = 'invalid base64!!!';

      expect(() => decodeBase64ToUtf8(invalidBase64)).toThrow();
    });
  });

  describe('normalizeContentForComparison', () => {
    it('should convert CRLF to LF', () => {
      const content = 'line1\r\nline2\r\nline3';

      const result = normalizeContentForComparison(content);

      expect(result).toBe('line1\nline2\nline3');
    });

    it('should convert CR to LF', () => {
      const content = 'line1\rline2\rline3';

      const result = normalizeContentForComparison(content);

      expect(result).toBe('line1\nline2\nline3');
    });

    it('should remove trailing whitespace from lines', () => {
      const content = 'line1  \nline2\t\nline3   ';

      const result = normalizeContentForComparison(content);

      expect(result).toBe('line1\nline2\nline3');
    });

    it('should ensure single trailing newline when content ends with newlines', () => {
      const content = 'line1\nline2\nline3\n\n\n';

      const result = normalizeContentForComparison(content);

      expect(result).toBe('line1\nline2\nline3\n');
    });

    it('should handle mixed line endings and whitespace', () => {
      const content = 'line1  \r\nline2\t\rline3   \n\n';

      const result = normalizeContentForComparison(content);

      expect(result).toBe('line1\nline2\nline3\n');
    });

    it('should handle empty content', () => {
      const content = '';

      const result = normalizeContentForComparison(content);

      expect(result).toBe('');
    });

    it('should handle content with only whitespace', () => {
      const content = '   \t  \r\n  \t  ';

      const result = normalizeContentForComparison(content);

      expect(result).toBe('\n');
    });

    it('should preserve trailing newline when present', () => {
      const content = 'line1\nline2\nline3\n';

      const result = normalizeContentForComparison(content);

      expect(result).toBe('line1\nline2\nline3\n');
    });
  });
});
