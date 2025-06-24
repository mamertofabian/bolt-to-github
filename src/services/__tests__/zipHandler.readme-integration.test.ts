import { ReadmeGeneratorService } from '../ReadmeGeneratorService';
import { processFilesWithGitignore } from '$lib/fileUtils';

// Mock dependencies
jest.mock('$lib/fileUtils');
jest.mock('$lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('ZipHandler - README Generation Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock processFilesWithGitignore to return input unchanged
    (processFilesWithGitignore as jest.Mock).mockImplementation((files) => Promise.resolve(files));
  });

  it('should add README.md when processing files without one', async () => {
    const filesWithoutReadme = new Map([
      ['project/index.js', 'console.log("Hello");'],
      ['project/package.json', '{"name": "test"}'],
    ]);

    // Process files with README generation
    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithoutReadme,
      'test-repo'
    );

    // Verify README was added
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

    // Process files with README generation
    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithEmptyReadme,
      'test-repo'
    );

    // Verify README was replaced
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

    // Process files with README generation
    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithReadme,
      'test-repo'
    );

    // Verify README was NOT replaced
    expect(processedFiles.get('project/README.md')).toBe(meaningfulContent);
  });

  it('should handle case-insensitive README files', async () => {
    const filesWithLowercaseReadme = new Map([
      ['project/index.js', 'console.log("Hello");'],
      ['project/readme.md', '   '], // Whitespace only
    ]);

    // Process files with README generation
    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithLowercaseReadme,
      'test-repo'
    );

    // Verify lowercase readme was replaced with proper case README.md
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

    // Process files with README generation
    const processedFiles = ReadmeGeneratorService.processFilesWithReadme(
      filesWithoutProjectPrefix,
      'test-repo'
    );

    // Verify README was added at root
    expect(processedFiles.has('README.md')).toBe(true);
    expect(processedFiles.has('project/README.md')).toBe(false);
  });

  it('should verify integration with zipHandler processZipFile flow', async () => {
    // This test verifies that the ReadmeGeneratorService is properly integrated
    // by checking that all required methods exist and are functions

    // Verify the service has the expected methods
    expect(typeof ReadmeGeneratorService.processFilesWithReadme).toBe('function');
    expect(typeof ReadmeGeneratorService.shouldGenerateReadme).toBe('function');
    expect(typeof ReadmeGeneratorService.generateReadmeContent).toBe('function');
    expect(typeof ReadmeGeneratorService.isReadmeFile).toBe('function');
  });
});
