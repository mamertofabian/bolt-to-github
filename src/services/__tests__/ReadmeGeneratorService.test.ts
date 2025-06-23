import { ReadmeGeneratorService } from '../ReadmeGeneratorService';

describe('ReadmeGeneratorService', () => {
  describe('shouldGenerateReadme', () => {
    it('should return true when README does not exist', () => {
      expect(ReadmeGeneratorService.shouldGenerateReadme(null)).toBe(true);
    });

    it('should return true when README is empty', () => {
      expect(ReadmeGeneratorService.shouldGenerateReadme('')).toBe(true);
    });

    it('should return true when README contains only whitespace', () => {
      expect(ReadmeGeneratorService.shouldGenerateReadme('   \n\t\n   ')).toBe(true);
    });

    it('should return false when README has meaningful content', () => {
      expect(
        ReadmeGeneratorService.shouldGenerateReadme('# My Project\n\nThis is a project.')
      ).toBe(false);
    });
  });

  describe('generateReadmeContent', () => {
    it('should generate README with project name', () => {
      const content = ReadmeGeneratorService.generateReadmeContent('my-awesome-project');

      expect(content).toContain('# my-awesome-project');
      expect(content).toContain('Bolt to GitHub');
      expect(content).toContain('https://github.com/mamertofabian/bolt-to-github');
      expect(content).toContain('## Description');
      expect(content).toContain('## Installation');
      expect(content).toContain('## Usage');
      expect(content).toContain('## Contributing');
      expect(content).toContain('## License');
    });

    it('should handle special characters in project name', () => {
      const content = ReadmeGeneratorService.generateReadmeContent('my-project_v2.0');
      expect(content).toContain('# my-project_v2.0');
    });
  });

  describe('isReadmeFile', () => {
    it('should identify README.md', () => {
      expect(ReadmeGeneratorService.isReadmeFile('README.md')).toBe(true);
      expect(ReadmeGeneratorService.isReadmeFile('project/README.md')).toBe(true);
    });

    it('should identify readme.md (lowercase)', () => {
      expect(ReadmeGeneratorService.isReadmeFile('readme.md')).toBe(true);
      expect(ReadmeGeneratorService.isReadmeFile('project/readme.md')).toBe(true);
    });

    it('should not identify other files as README', () => {
      expect(ReadmeGeneratorService.isReadmeFile('index.js')).toBe(false);
      expect(ReadmeGeneratorService.isReadmeFile('readme.txt')).toBe(false);
      expect(ReadmeGeneratorService.isReadmeFile('README.rst')).toBe(false);
    });
  });

  describe('processFilesWithReadme', () => {
    it('should add README when missing', () => {
      const files = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/package.json', '{"name": "test"}'],
      ]);

      const processedFiles = ReadmeGeneratorService.processFilesWithReadme(files, 'test-project');

      expect(processedFiles.has('project/README.md')).toBe(true);
      expect(processedFiles.get('project/README.md')).toContain('# test-project');
    });

    it('should replace empty README', () => {
      const files = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/README.md', ''],
      ]);

      const processedFiles = ReadmeGeneratorService.processFilesWithReadme(files, 'test-project');

      expect(processedFiles.has('project/README.md')).toBe(true);
      expect(processedFiles.get('project/README.md')).toContain('# test-project');
    });

    it('should replace README with different casing', () => {
      const files = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/readme.md', '   '],
      ]);

      const processedFiles = ReadmeGeneratorService.processFilesWithReadme(files, 'test-project');

      expect(processedFiles.has('project/README.md')).toBe(true);
      expect(processedFiles.has('project/readme.md')).toBe(false);
      expect(processedFiles.get('project/README.md')).toContain('# test-project');
    });

    it('should preserve meaningful README content', () => {
      const meaningfulContent = '# My Project\n\nThis is my project.';
      const files = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/README.md', meaningfulContent],
      ]);

      const processedFiles = ReadmeGeneratorService.processFilesWithReadme(files, 'test-project');

      expect(processedFiles.get('project/README.md')).toBe(meaningfulContent);
    });

    it('should add README at root when no project prefix', () => {
      const files = new Map([
        ['index.js', 'console.log("Hello");'],
        ['package.json', '{"name": "test"}'],
      ]);

      const processedFiles = ReadmeGeneratorService.processFilesWithReadme(files, 'test-project');

      expect(processedFiles.has('README.md')).toBe(true);
      expect(processedFiles.get('README.md')).toContain('# test-project');
    });
  });
});
