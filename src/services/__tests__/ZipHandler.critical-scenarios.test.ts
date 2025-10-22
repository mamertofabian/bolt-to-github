import {
  cleanupTestEnvironment,
  COMPARISON_RESULTS,
  createTestBlob,
  createTestEnvironment,
  setupTestProject,
  TEST_PROJECTS,
  ZIP_FILE_FIXTURES,
  type ZipHandlerTestEnvironment,
} from './test-fixtures/ZipHandlerTestFixtures.index';

describe('ZipHandler - Critical Scenarios', () => {
  let env: ZipHandlerTestEnvironment;

  beforeEach(async () => {
    env = await createTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment(env);
  });

  describe('Normal Usage Scenarios', () => {
    it('should handle sequential uploads to the same project', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      env.comparisonService.setComparisonResult({
        changes: new Map([['v1.js', { status: 'added' as const, content: 'version 1' }]]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob1 = createTestBlob(new Map([['v1.js', 'version 1']]));
      await env.zipHandler.processZipFile(blob1, TEST_PROJECTS.default.projectId, 'First commit');

      env.comparisonService.setComparisonResult({
        changes: new Map([['v2.js', { status: 'added' as const, content: 'version 2' }]]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob2 = createTestBlob(new Map([['v2.js', 'version 2']]));
      await env.zipHandler.processZipFile(blob2, TEST_PROJECTS.default.projectId, 'Second commit');

      const successStatuses = env.statusCallback.getHistory().filter((s) => s.status === 'success');
      expect(successStatuses.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle uploading to different projects', async () => {
      env.chromeStorage.setData({
        repoOwner: 'test-owner',
        projectSettings: {
          'project-1': { repoName: 'repo-1', branch: 'main' },
          'project-2': { repoName: 'repo-2', branch: 'main' },
        },
      });

      env.githubService.setResponse('GET', '/repos/test-owner/repo-1', {
        name: 'repo-1',
        owner: { login: 'test-owner' },
        default_branch: 'main',
      });
      env.githubService.setResponse('GET', '/repos/test-owner/repo-2', {
        name: 'repo-2',
        owner: { login: 'test-owner' },
        default_branch: 'main',
      });

      env.githubService.setResponse('GET', '/repos/test-owner/repo-1/git/refs/heads/main', {
        ref: 'refs/heads/main',
        object: { sha: 'abc123' },
      });
      env.githubService.setResponse('GET', '/repos/test-owner/repo-2/git/refs/heads/main', {
        ref: 'refs/heads/main',
        object: { sha: 'def456' },
      });

      env.githubService.setResponse('GET', '/repos/test-owner/repo-1/git/commits/abc123', {
        sha: 'abc123',
        tree: { sha: 'tree123-1' },
        parents: [],
      });
      env.githubService.setResponse('GET', '/repos/test-owner/repo-2/git/commits/def456', {
        sha: 'def456',
        tree: { sha: 'tree123-2' },
        parents: [],
      });

      env.comparisonService.setComparisonResult({
        changes: new Map([['file1.js', { status: 'added' as const, content: 'content1' }]]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob1 = createTestBlob(new Map([['file1.js', 'content1']]));
      await env.zipHandler.processZipFile(blob1, 'project-1', 'Commit 1');

      env.comparisonService.setComparisonResult({
        changes: new Map([['file2.js', { status: 'added' as const, content: 'content2' }]]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob2 = createTestBlob(new Map([['file2.js', 'content2']]));
      await env.zipHandler.processZipFile(blob2, 'project-2', 'Commit 2');

      const successStatuses = env.statusCallback.getHistory().filter((s) => s.status === 'success');
      expect(successStatuses.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle simple network errors gracefully', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      env.githubService.setError(new Error('Request timeout'));

      const blob = createTestBlob(new Map([['test.js', 'content']]));

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Request timeout');

      const failureRecord = env.pushStats.getLastRecord();
      expect(failureRecord).toMatchObject({
        action: 'failure',
        error: expect.stringContaining('Request timeout'),
      });
    });

    it('should handle authentication errors', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const authError = new Error('Bad credentials') as Error & { status?: number };
      authError.status = 401;
      env.githubService.setError(authError);

      const blob = createTestBlob(new Map([['test.js', 'content']]));

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Bad credentials');
    });
  });

  describe('Data Integrity', () => {
    it('should maintain file content integrity through the upload process', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const testContent = {
        'test.js': 'const x = 42;\nconsole.log(x);',
        'data.json': JSON.stringify({ nested: { value: true } }, null, 2),
        'unicode.txt': '🚀 Unicode test: αβγ δεζ 中文字符',
      };

      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['test.js', { status: 'added' as const, content: testContent['test.js'] }],
          ['data.json', { status: 'added' as const, content: testContent['data.json'] }],
          ['unicode.txt', { status: 'added' as const, content: testContent['unicode.txt'] }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const files = new Map(Object.entries(testContent));
      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');

      const blobCalls = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCalls).toBeGreaterThan(0);
    });

    it('should handle files with CRLF and LF line endings consistently', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['unix.txt', 'Line 1\nLine 2\nLine 3'],
        ['windows.txt', 'Line 1\r\nLine 2\r\nLine 3'],
        ['mixed.txt', 'Line 1\nLine 2\r\nLine 3'],
      ]);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['unix.txt', { status: 'added' as const, content: 'Line 1\nLine 2\nLine 3' }],
          ['windows.txt', { status: 'added' as const, content: 'Line 1\r\nLine 2\r\nLine 3' }],
          ['mixed.txt', { status: 'added' as const, content: 'Line 1\nLine 2\r\nLine 3' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
      expect(lastStatus?.message).toContain('3 files');
    });
  });

  describe('Repository State Handling', () => {
    it('should handle normal repository operations', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const testFiles = new Map([
        ['index.html', '<html></html>'],
        ['app.js', 'console.log("app");'],
      ]);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.html', { status: 'added' as const, content: '<html></html>' }],
          ['app.js', { status: 'added' as const, content: 'console.log("app");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(testFiles);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle repository access errors', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      env.githubService.setResponse('GET', '/repos/test-owner/test-repo', () => {
        const error = new Error('Not Found') as Error & { status?: number };
        error.status = 404;
        throw error;
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Not Found');
    });
  });

  describe('Resource Management', () => {
    it('should handle normal-sized files efficiently', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['app.js', 'x'.repeat(1000)],
        ['styles.css', 'x'.repeat(500)],
        ['small-file.txt', 'small content'],
      ]);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['app.js', { status: 'added' as const, content: 'x'.repeat(50000) }],
          ['styles.css', { status: 'added' as const, content: 'x'.repeat(10000) }],
          ['small-file.txt', { status: 'added' as const, content: 'small content' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle normal resource management', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const testFiles = new Map([
        ['index.html', '<html></html>'],
        ['app.js', 'console.log("app");'],
      ]);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.html', { status: 'added' as const, content: '<html></html>' }],
          ['app.js', { status: 'added' as const, content: 'console.log("app");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(testFiles);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');

      const successRecord = env.pushStats.getLastRecord();
      expect(successRecord?.action).toBe('success');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should handle normal authenticated uploads', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const testFiles = new Map([
        ['file1.js', 'content1'],
        ['file2.js', 'content2'],
        ['file3.js', 'content3'],
      ]);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['file1.js', { status: 'added' as const, content: 'content1' }],
          ['file2.js', { status: 'added' as const, content: 'content2' }],
          ['file3.js', { status: 'added' as const, content: 'content3' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(testFiles);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle normal permission scenarios', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const testFiles = new Map([
        ['index.html', '<html></html>'],
        ['app.js', 'console.log("app");'],
      ]);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.html', { status: 'added' as const, content: '<html></html>' }],
          ['app.js', { status: 'added' as const, content: 'console.log("app");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(testFiles);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });
  });

  describe('Edge Case File Handling', () => {
    it('should handle files with no extension', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['LICENSE', 'MIT License...'],
        ['README', 'Project documentation'],
        ['Makefile', 'build:\n\techo "Building..."'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle deeply nested directory structures', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['a/b/c/d/e/f/g/h/i/j/k/l/m/n/deep.txt', 'Very deep file'],
        ['shallow.txt', 'Shallow file'],
      ]);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          [
            'a/b/c/d/e/f/g/h/i/j/k/l/m/n/deep.txt',
            { status: 'added' as const, content: 'Very deep file' },
          ],
          ['shallow.txt', { status: 'added' as const, content: 'Shallow file' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect((treeCreation?.body as unknown as { tree: unknown[] })?.tree).toContainEqual(
        expect.objectContaining({
          path: 'a/b/c/d/e/f/g/h/i/j/k/l/m/n/deep.txt',
        })
      );
    });

    it('should handle files with identical content but different names', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const identicalContent = 'console.log("Same content");';
      const files = new Map([
        ['file1.js', identicalContent],
        ['file2.js', identicalContent],
        ['backup/file1.js', identicalContent],
      ]);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['file1.js', { status: 'added' as const, content: identicalContent }],
          ['file2.js', { status: 'added' as const, content: identicalContent }],
          ['backup/file1.js', { status: 'added' as const, content: identicalContent }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const blobCreations = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCreations).toBe(3);

      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect((treeCreation?.body as unknown as { tree: unknown[] })?.tree).toHaveLength(3);
    });
  });
});
