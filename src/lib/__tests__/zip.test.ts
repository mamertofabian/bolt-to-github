import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { ZipProcessor } from '../zip';

describe('ZipProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processZipBlob', () => {
    it('should process a valid ZIP blob and return file contents as a Map', async () => {
      const textContent = 'Hello, World!';
      const fileName = 'test.txt';

      const zipBlob = await createTestZipBlob([[fileName, textContent]]);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result).toBeInstanceOf(Map);
      expect(result.has(fileName)).toBe(true);
      expect(result.get(fileName)).toBe(textContent);
    });

    it('should process multiple files in a ZIP blob', async () => {
      const files: Array<[string, string]> = [
        ['file1.txt', 'Content of file 1'],
        ['file2.md', '# Markdown content'],
        ['src/index.js', 'console.log("hello");'],
      ];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('file1.txt')).toBe('Content of file 1');
      expect(result.get('file2.md')).toBe('# Markdown content');
      expect(result.get('src/index.js')).toBe('console.log("hello");');
    });

    it('should handle empty ZIP files', async () => {
      const zipBlob = await createTestZipBlob([]);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should handle files with special characters in names', async () => {
      const files: Array<[string, string]> = [
        ['file with spaces.txt', 'content1'],
        ['file-with-dashes.txt', 'content2'],
        ['file_with_underscores.txt', 'content3'],
        ['file.multiple.dots.txt', 'content4'],
      ];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('file with spaces.txt')).toBe('content1');
      expect(result.get('file-with-dashes.txt')).toBe('content2');
      expect(result.get('file_with_underscores.txt')).toBe('content3');
      expect(result.get('file.multiple.dots.txt')).toBe('content4');
    });

    it('should handle files with nested directory paths', async () => {
      const files: Array<[string, string]> = [
        ['src/components/Button.tsx', 'export const Button = () => {}'],
        ['src/utils/helpers.ts', 'export const helper = () => {}'],
        ['docs/api/index.md', '# API Documentation'],
        ['tests/unit/component.test.ts', 'test code'],
      ];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('src/components/Button.tsx')).toBe('export const Button = () => {}');
      expect(result.get('src/utils/helpers.ts')).toBe('export const helper = () => {}');
      expect(result.get('docs/api/index.md')).toBe('# API Documentation');
      expect(result.get('tests/unit/component.test.ts')).toBe('test code');
    });

    it('should handle empty files in ZIP', async () => {
      const files: Array<[string, string]> = [
        ['empty.txt', ''],
        ['not-empty.txt', 'content'],
      ];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('empty.txt')).toBe('');
      expect(result.get('not-empty.txt')).toBe('content');
    });

    it('should handle files with UTF-8 content', async () => {
      const files: Array<[string, string]> = [
        ['unicode.txt', 'Hello 世界 🌍'],
        ['emoji.txt', '😀 😃 😄 😁'],
        ['special.txt', 'Café, naïve, résumé'],
      ];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('unicode.txt')).toBe('Hello 世界 🌍');
      expect(result.get('emoji.txt')).toBe('😀 😃 😄 😁');
      expect(result.get('special.txt')).toBe('Café, naïve, résumé');
    });

    it('should handle large text files', async () => {
      const largeContent = 'A'.repeat(10000);
      const files: Array<[string, string]> = [['large.txt', largeContent]];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('large.txt')).toBe(largeContent);
      expect(result.get('large.txt')?.length).toBe(10000);
    });

    it('should handle files with various line endings', async () => {
      const files: Array<[string, string]> = [
        ['unix.txt', 'line1\nline2\nline3'],
        ['windows.txt', 'line1\r\nline2\r\nline3'],
        ['mac.txt', 'line1\rline2\rline3'],
      ];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('unix.txt')).toBe('line1\nline2\nline3');
      expect(result.get('windows.txt')).toBe('line1\r\nline2\r\nline3');
      expect(result.get('mac.txt')).toBe('line1\rline2\rline3');
    });

    it('should throw error for corrupted ZIP blob', async () => {
      const encoder = new TextEncoder();
      const corruptedBlob = createMockBlob(encoder.encode('not a valid zip file'));

      await expect(ZipProcessor.processZipBlob(corruptedBlob)).rejects.toThrow(
        'Failed to process ZIP file'
      );
    });

    it('should throw error with descriptive message for corrupted ZIP', async () => {
      const encoder = new TextEncoder();
      const corruptedBlob = createMockBlob(encoder.encode('invalid zip data'));

      await expect(ZipProcessor.processZipBlob(corruptedBlob)).rejects.toThrow(
        /Failed to process ZIP file/
      );
    });

    it('should handle blob with no content', async () => {
      const emptyBlob = createMockBlob(new Uint8Array(0));

      await expect(ZipProcessor.processZipBlob(emptyBlob)).rejects.toThrow(
        'Failed to process ZIP file'
      );
    });

    it('should convert blob to array buffer correctly', async () => {
      const files: Array<[string, string]> = [['test.txt', 'content']];
      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result).toBeInstanceOf(Map);
      expect(result.has('test.txt')).toBe(true);
    });

    it('should preserve exact content without modifications', async () => {
      const content = '  spaces  \n\ttabs\t\n  mixed  \t  ';
      const files: Array<[string, string]> = [['whitespace.txt', content]];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('whitespace.txt')).toBe(content);
    });

    it('should handle files with JSON content', async () => {
      const jsonContent = JSON.stringify({ key: 'value', nested: { data: 123 } }, null, 2);
      const files: Array<[string, string]> = [['config.json', jsonContent]];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('config.json')).toBe(jsonContent);
      expect(() => JSON.parse(result.get('config.json')!)).not.toThrow();
    });

    it('should handle multiple files with same content', async () => {
      const sameContent = 'duplicate content';
      const files: Array<[string, string]> = [
        ['file1.txt', sameContent],
        ['file2.txt', sameContent],
        ['file3.txt', sameContent],
      ];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('file1.txt')).toBe(sameContent);
      expect(result.get('file2.txt')).toBe(sameContent);
      expect(result.get('file3.txt')).toBe(sameContent);
    });

    it('should handle ZIP with mixed content types', async () => {
      const files: Array<[string, string]> = [
        ['README.md', '# Project\n\nDescription here'],
        ['package.json', '{"name":"test","version":"1.0.0"}'],
        ['src/index.ts', 'export const main = () => console.log("hi");'],
        ['.gitignore', 'node_modules/\n*.log\ndist/'],
      ];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.get('README.md')).toContain('# Project');
      expect(result.get('package.json')).toContain('"name":"test"');
      expect(result.get('src/index.ts')).toContain('export const main');
      expect(result.get('.gitignore')).toContain('node_modules/');
    });

    it('should decode text files with TextDecoder', async () => {
      const content = 'Test content';
      const files: Array<[string, string]> = [['file.txt', content]];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(typeof result.get('file.txt')).toBe('string');
      expect(result.get('file.txt')).toBe(content);
    });

    it('should handle ZIP files with single file', async () => {
      const zipBlob = await createTestZipBlob([['single.txt', 'Single file content']]);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.size).toBeGreaterThanOrEqual(1);
      expect(result.has('single.txt')).toBe(true);
    });

    it('should return Map with correct entries for all files', async () => {
      const files: Array<[string, string]> = [
        ['a.txt', 'A'],
        ['b.txt', 'B'],
      ];

      const zipBlob = await createTestZipBlob(files);

      const result = await ZipProcessor.processZipBlob(zipBlob);

      expect(result.has('a.txt')).toBe(true);
      expect(result.has('b.txt')).toBe(true);
      expect(result.get('a.txt')).toBe('A');
      expect(result.get('b.txt')).toBe('B');
    });
  });
});

async function createTestZipBlob(files: Array<[string, string]>): Promise<Blob> {
  const zipData: Record<string, Uint8Array> = {};

  for (const [filename, content] of files) {
    const encoder = new TextEncoder();

    zipData[filename] = new Uint8Array(encoder.encode(content));
  }

  const compressed = zipSync(zipData);

  return createMockBlob(compressed);
}

function createMockBlob(data: Uint8Array): Blob {
  return new Blob([data as BlobPart], { type: 'application/zip' });
}
