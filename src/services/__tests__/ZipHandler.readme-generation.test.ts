import {
  createTestEnvironment,
  cleanupTestEnvironment,
  TestAssertions,
  ZIP_FILE_FIXTURES,
  createTestBlob,
  TEST_PROJECTS,
  setupTestProject,
  type ZipHandlerTestEnvironment,
} from './test-fixtures/ZipHandlerTestFixtures.index';

describe('ZipHandler - README Generation', () => {
  let env: ZipHandlerTestEnvironment;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment(env);
  });

  describe('README detection', () => {
    it('should detect when README.md is missing from the project', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Create a ZIP without README.md
      const filesWithoutReadme = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/package.json', '{"name": "test-project"}'],
      ]);
      const blob = createTestBlob(filesWithoutReadme);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify that a README.md was created
      const blobCreationCalls = env.githubService.getRequestHistory('POST', '/git/blobs');
      const readmeBlob = blobCreationCalls.find((call) => {
        const treeCall = env.githubService.getRequestHistory('POST', '/git/trees')[0];
        return treeCall?.body?.tree?.some(
          (item: any) => item.path === 'README.md' && item.sha === call.response.sha
        );
      });

      expect(readmeBlob).toBeDefined();
    });

    it('should detect when README.md exists but is empty', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Create a ZIP with empty README.md
      const filesWithEmptyReadme = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/README.md', ''],
      ]);
      const blob = createTestBlob(filesWithEmptyReadme);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify that README.md was replaced with generated content
      const blobCreationCalls = env.githubService.getRequestHistory('POST', '/git/blobs');
      const readmeBlob = blobCreationCalls.find((call) => {
        const treeCall = env.githubService.getRequestHistory('POST', '/git/trees')[0];
        return treeCall?.body?.tree?.some(
          (item: any) => item.path === 'README.md' && item.sha === call.response.sha
        );
      });

      expect(readmeBlob).toBeDefined();
      // The content should not be empty
      expect(readmeBlob?.body?.content).not.toBe('');
    });

    it('should detect when README.md contains only whitespace', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Create a ZIP with whitespace-only README.md
      const filesWithWhitespaceReadme = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/README.md', '   \n\t\n   '],
      ]);
      const blob = createTestBlob(filesWithWhitespaceReadme);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify that README.md was replaced with generated content
      const blobCreationCalls = env.githubService.getRequestHistory('POST', '/git/blobs');
      const readmeBlob = blobCreationCalls.find((call) => {
        const treeCall = env.githubService.getRequestHistory('POST', '/git/trees')[0];
        return treeCall?.body?.tree?.some(
          (item: any) => item.path === 'README.md' && item.sha === call.response.sha
        );
      });

      expect(readmeBlob).toBeDefined();
      // The content should contain actual text, not just whitespace
      const decodedContent = atob(readmeBlob?.body?.content || '');
      expect(decodedContent.trim().length).toBeGreaterThan(0);
    });

    it('should NOT replace README.md if it contains meaningful content', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const existingReadmeContent = '# My Awesome Project\n\nThis is a great project!';
      const filesWithMeaningfulReadme = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/README.md', existingReadmeContent],
      ]);
      const blob = createTestBlob(filesWithMeaningfulReadme);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify that README.md was NOT replaced
      const blobCreationCalls = env.githubService.getRequestHistory('POST', '/git/blobs');
      const readmeBlob = blobCreationCalls.find((call) => {
        const treeCall = env.githubService.getRequestHistory('POST', '/git/trees')[0];
        return treeCall?.body?.tree?.some(
          (item: any) => item.path === 'README.md' && item.sha === call.response.sha
        );
      });

      if (readmeBlob) {
        const decodedContent = atob(readmeBlob.body.content);
        expect(decodedContent).toBe(existingReadmeContent);
      }
    });
  });

  describe('README content generation', () => {
    it('should generate README with project name from repository name', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const filesWithoutReadme = new Map([['project/index.js', 'console.log("Hello");']]);
      const blob = createTestBlob(filesWithoutReadme);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Get the generated README content
      const blobCreationCalls = env.githubService.getRequestHistory('POST', '/git/blobs');
      const readmeBlob = blobCreationCalls.find((call) => {
        const treeCall = env.githubService.getRequestHistory('POST', '/git/trees')[0];
        return treeCall?.body?.tree?.some(
          (item: any) => item.path === 'README.md' && item.sha === call.response.sha
        );
      });

      const decodedContent = atob(readmeBlob?.body?.content || '');

      // Should include the repository name as the title
      expect(decodedContent).toContain(`# ${TEST_PROJECTS.default.repoName}`);

      // Should mention Bolt to GitHub
      expect(decodedContent).toContain('Bolt to GitHub');
      expect(decodedContent).toContain('https://github.com/mamertofabian/bolt-to-github');

      // Should include standard sections
      expect(decodedContent).toContain('## Description');
      expect(decodedContent).toContain('## Installation');
      expect(decodedContent).toContain('## Usage');
      expect(decodedContent).toContain('## Contributing');
      expect(decodedContent).toContain('## License');
    });

    it('should handle special characters in project name', async () => {
      const specialProject = {
        ...TEST_PROJECTS.default,
        repoName: 'my-awesome_project.v2',
      };
      setupTestProject(env, specialProject);

      const filesWithoutReadme = new Map([['project/index.js', 'console.log("Hello");']]);
      const blob = createTestBlob(filesWithoutReadme);

      await env.zipHandler.processZipFile(
        blob,
        specialProject.projectId,
        specialProject.commitMessage
      );

      const blobCreationCalls = env.githubService.getRequestHistory('POST', '/git/blobs');
      const readmeBlob = blobCreationCalls.find((call) => {
        const treeCall = env.githubService.getRequestHistory('POST', '/git/trees')[0];
        return treeCall?.body?.tree?.some(
          (item: any) => item.path === 'README.md' && item.sha === call.response.sha
        );
      });

      const decodedContent = atob(readmeBlob?.body?.content || '');
      expect(decodedContent).toContain('# my-awesome_project.v2');
    });
  });

  describe('README generation with gitignore', () => {
    it('should still generate README even if .gitignore exists', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const filesWithGitignore = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/.gitignore', 'node_modules/\n*.log'],
      ]);
      const blob = createTestBlob(filesWithGitignore);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify README was created
      const treeCall = env.githubService.getRequestHistory('POST', '/git/trees')[0];
      const readmeInTree = treeCall?.body?.tree?.find((item: any) => item.path === 'README.md');
      expect(readmeInTree).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle README.md with different case variations', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Test with readme.md (lowercase)
      const filesWithLowercaseReadme = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/readme.md', ''],
      ]);
      const blob = createTestBlob(filesWithLowercaseReadme);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should still create README.md (proper case)
      const treeCall = env.githubService.getRequestHistory('POST', '/git/trees')[0];
      const readmeInTree = treeCall?.body?.tree?.find((item: any) => item.path === 'README.md');
      expect(readmeInTree).toBeDefined();
    });

    it('should handle projects with readme.txt but no README.md', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const filesWithReadmeTxt = new Map([
        ['project/index.js', 'console.log("Hello");'],
        ['project/readme.txt', 'This is a text readme'],
      ]);
      const blob = createTestBlob(filesWithReadmeTxt);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should create README.md even though readme.txt exists
      const treeCall = env.githubService.getRequestHistory('POST', '/git/trees')[0];
      const readmeInTree = treeCall?.body?.tree?.find((item: any) => item.path === 'README.md');
      const readmeTxtInTree = treeCall?.body?.tree?.find((item: any) => item.path === 'readme.txt');

      expect(readmeInTree).toBeDefined();
      expect(readmeTxtInTree).toBeDefined(); // Original file should still exist
    });
  });
});
