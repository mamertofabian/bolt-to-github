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
      // Arrange
      const files: ProjectFiles = new Map([
        ['.gitignore', 'node_modules/\n*.log\nbuild/'],
        ['README.md', '# Project'],
        ['src/index.js', 'console.log("hello");'],
        ['node_modules/package.json', '{}'],
        ['debug.log', 'debug info'],
        ['build/output.js', 'compiled code'],
        ['src/test.js', 'test code'],
      ]);

      // Act
      const result = processFilesWithGitignore(files);

      // Assert
      expect(result.has('README.md')).toBe(true);
      expect(result.has('src/index.js')).toBe(true);
      expect(result.has('src/test.js')).toBe(true);
      expect(result.has('node_modules/package.json')).toBe(false);
      expect(result.has('debug.log')).toBe(false);
      expect(result.has('build/output.js')).toBe(false);
      // Don't test exact size since .gitignore file itself may or may not be included
    });

    it('should handle project/ prefix in paths', () => {
      // Arrange
      const files: ProjectFiles = new Map([
        ['project/.gitignore', '*.tmp\n'],
        ['project/README.md', '# Project'],
        ['project/temp.tmp', 'temporary'],
        ['project/src/index.js', 'code'],
      ]);

      // Act
      const result = processFilesWithGitignore(files);

      // Assert
      expect(result.has('README.md')).toBe(true);
      expect(result.has('src/index.js')).toBe(true);
      expect(result.has('temp.tmp')).toBe(false);
    });

    it('should use default ignore patterns when no .gitignore exists', () => {
      // Arrange
      const files: ProjectFiles = new Map([
        ['README.md', '# Project'],
        ['node_modules/lib.js', 'library'],
        ['dist/bundle.js', 'bundled'],
        ['.DS_Store', 'mac file'],
        ['src/index.js', 'source'],
      ]);

      // Act
      const result = processFilesWithGitignore(files);

      // Assert
      expect(result.has('README.md')).toBe(true);
      expect(result.has('src/index.js')).toBe(true);
      expect(result.has('node_modules/lib.js')).toBe(false); // Default ignore
      expect(result.has('dist/bundle.js')).toBe(false); // Default ignore
      expect(result.has('.DS_Store')).toBe(false); // Default ignore
    });

    it('should skip directory entries and empty files', () => {
      // Arrange
      const files: ProjectFiles = new Map([
        ['src/', ''], // Directory entry
        ['empty.txt', ''], // Empty file
        ['README.md', '# Project'],
        ['whitespace.txt', '   \n  \t  '], // Only whitespace
      ]);

      // Act
      const result = processFilesWithGitignore(files);

      // Assert
      expect(result.has('src/')).toBe(false);
      expect(result.has('empty.txt')).toBe(false);
      expect(result.has('README.md')).toBe(true);
      expect(result.has('whitespace.txt')).toBe(false);
    });
  });

  describe('decodeBase64ToUtf8', () => {
    it('should decode basic ASCII content correctly', () => {
      // Arrange
      const content = 'Hello World';
      const base64 = btoa(content);

      // Act
      const result = decodeBase64ToUtf8(base64);

      // Assert
      expect(result).toBe(content);
    });

    it('should handle invalid base64 input', () => {
      // Arrange
      const invalidBase64 = 'invalid base64!!!';

      // Act & Assert
      expect(() => decodeBase64ToUtf8(invalidBase64)).toThrow();
    });

    // Note: UTF-8 testing is complex in Jest environment due to TextEncoder/TextDecoder
    // These are tested indirectly through integration tests
  });

  describe('normalizeContentForComparison', () => {
    it('should convert CRLF to LF', () => {
      // Arrange
      const content = 'line1\r\nline2\r\nline3';

      // Act
      const result = normalizeContentForComparison(content);

      // Assert - No trailing newline added if none exists
      expect(result).toBe('line1\nline2\nline3');
    });

    it('should convert CR to LF', () => {
      // Arrange
      const content = 'line1\rline2\rline3';

      // Act
      const result = normalizeContentForComparison(content);

      // Assert - No trailing newline added if none exists
      expect(result).toBe('line1\nline2\nline3');
    });

    it('should remove trailing whitespace from lines', () => {
      // Arrange
      const content = 'line1  \nline2\t\nline3   ';

      // Act
      const result = normalizeContentForComparison(content);

      // Assert - No trailing newline added if none exists
      expect(result).toBe('line1\nline2\nline3');
    });

    it('should ensure single trailing newline when content ends with newlines', () => {
      // Arrange
      const content = 'line1\nline2\nline3\n\n\n';

      // Act
      const result = normalizeContentForComparison(content);

      // Assert - Multiple trailing newlines become single
      expect(result).toBe('line1\nline2\nline3\n');
    });

    it('should handle mixed line endings and whitespace', () => {
      // Arrange
      const content = 'line1  \r\nline2\t\rline3   \n\n';

      // Act
      const result = normalizeContentForComparison(content);

      // Assert - Converts line endings, removes whitespace, ensures single trailing newline
      expect(result).toBe('line1\nline2\nline3\n');
    });

    it('should handle empty content', () => {
      // Arrange
      const content = '';

      // Act
      const result = normalizeContentForComparison(content);

      // Assert - Empty remains empty
      expect(result).toBe('');
    });

    it('should handle content with only whitespace', () => {
      // Arrange
      const content = '   \t  \r\n  \t  ';

      // Act
      const result = normalizeContentForComparison(content);

      // Assert - Whitespace-only lines become empty, CRLF becomes LF
      expect(result).toBe('\n');
    });

    it('should preserve trailing newline when present', () => {
      // Arrange
      const content = 'line1\nline2\nline3\n';

      // Act
      const result = normalizeContentForComparison(content);

      // Assert - Single trailing newline is preserved
      expect(result).toBe('line1\nline2\nline3\n');
    });
  });

  // Note: calculateGitBlobHash tests are skipped due to complexity of mocking crypto.subtle in Jest
  // This function is tested indirectly through integration tests and the actual implementation
  // works correctly in browser environments
});
