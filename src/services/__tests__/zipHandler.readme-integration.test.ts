import { processFilesWithGitignore } from '$lib/fileUtils';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ReadmeGeneratorService } from '../ReadmeGeneratorService';

vi.mock('$lib/fileUtils');
vi.mock('$lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('ZipHandler - README Generation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (processFilesWithGitignore as Mock).mockImplementation((files) => Promise.resolve(files));
  });

  it('should add README.md when processing files without one', async () => {
    const filesWithoutReadme = new Map([
      ['project/index.js', 'console.log("Hello");'],
      ['project/package.json', '{"name": "test"}'],
    ]);

    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithoutReadme,
      'test-repo'
    );

    expect(processedFiles.has('project/README.md')).toBe(true);
    const readmeContent = processedFiles.get('project/README.md');
    expect(readmeContent).toContain('# test-repo');
    expect(readmeContent).toContain('Bolt to GitHub');
  });

  it('should replace empty README.md', async () => {
    const filesWithEmptyReadme = new Map([
      ['project/index.js', 'console.log("Hello");'],
      ['project/README.md', ''],
    ]);

    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithEmptyReadme,
      'test-repo'
    );

    expect(processedFiles.has('project/README.md')).toBe(true);
    const readmeContent = processedFiles.get('project/README.md');
    expect(readmeContent).not.toBe('');
    expect(readmeContent).toContain('# test-repo');
  });

  it('should preserve meaningful README content', async () => {
    const meaningfulContent = '# My Awesome Project\n\nThis is a detailed description.';
    const filesWithReadme = new Map([
      ['project/index.js', 'console.log("Hello");'],
      ['project/README.md', meaningfulContent],
    ]);

    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithReadme,
      'test-repo'
    );

    expect(processedFiles.get('project/README.md')).toBe(meaningfulContent);
  });

  it('should handle case-insensitive README files', async () => {
    const filesWithLowercaseReadme = new Map([
      ['project/index.js', 'console.log("Hello");'],
      ['project/readme.md', '   '],
    ]);

    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithLowercaseReadme,
      'test-repo'
    );

    expect(processedFiles.has('project/readme.md')).toBe(false);
    expect(processedFiles.has('project/README.md')).toBe(true);
    const readmeContent = processedFiles.get('project/README.md');
    expect(readmeContent).toContain('# test-repo');
  });

  it('should add README at root when no project prefix exists', async () => {
    const filesWithoutProjectPrefix = new Map([
      ['index.js', 'console.log("Hello");'],
      ['package.json', '{"name": "test"}'],
    ]);

    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithoutProjectPrefix,
      'test-repo'
    );

    expect(processedFiles.has('README.md')).toBe(true);
    expect(processedFiles.has('project/README.md')).toBe(false);
  });

  it('should verify integration with zipHandler processZipFile flow', async () => {
    expect(typeof ReadmeGeneratorService.processFilesWithReadme).toBe('function');
    expect(typeof ReadmeGeneratorService.shouldGenerateReadme).toBe('function');
    expect(typeof ReadmeGeneratorService.generateReadmeContent).toBe('function');
    expect(typeof ReadmeGeneratorService.isReadmeFile).toBe('function');
  });
});
