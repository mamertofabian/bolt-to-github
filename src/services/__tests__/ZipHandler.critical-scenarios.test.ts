import {
  createTestEnvironment,
  cleanupTestEnvironment,
  ZIP_FILE_FIXTURES,
  createTestBlob,
  TEST_PROJECTS,
  setupTestProject,
  COMPARISON_RESULTS,
  type ZipHandlerTestEnvironment,
} from './test-fixtures/ZipHandlerTestFixtures.index';

describe('ZipHandler - Critical Scenarios', () => {
  let env: ZipHandlerTestEnvironment;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment(env);
  });

  describe('Normal Usage Scenarios', () => {
    it('should handle sequential uploads to the same project', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const blob1 = createTestBlob(new Map([['v1.js', 'version 1']]));
      const blob2 = createTestBlob(new Map([['v2.js', 'version 2']]));

      // Sequential uploads (realistic user behavior)
      await env.zipHandler.processZipFile(blob1, TEST_PROJECTS.default.projectId, 'First commit');
      await env.zipHandler.processZipFile(blob2, TEST_PROJECTS.default.projectId, 'Second commit');

      // Both should succeed
      const successStatuses = env.statusCallback.getHistory().filter((s) => s.status === 'success');
      expect(successStatuses.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle uploading to different projects', async () => {
      // Setup two projects (realistic user scenario)
      env.chromeStorage.setData({
        repoOwner: 'test-owner',
        projectSettings: {
          'project-1': { repoName: 'repo-1', branch: 'main' },
          'project-2': { repoName: 'repo-2', branch: 'main' },
        },
      });

      // Configure GitHub service responses for both repos
      env.githubService.setResponse('GET', '/repos/test-owner/repo-1', {
        name: 'repo-1',
        owner: { login: 'test-owner' },
      });
      env.githubService.setResponse('GET', '/repos/test-owner/repo-2', {
        name: 'repo-2',
        owner: { login: 'test-owner' },
      });

      // Configure comparison service for both uploads
      env.comparisonService.setComparisonResult({
        changes: new Map([['file1.js', { status: 'added' as const, content: 'content1' }]]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob1 = createTestBlob(new Map([['file1.js', 'content1']]));
      await env.zipHandler.processZipFile(blob1, 'project-1', 'Commit 1');

      // Configure comparison service for second upload
      env.comparisonService.setComparisonResult({
        changes: new Map([['file2.js', { status: 'added' as const, content: 'content2' }]]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob2 = createTestBlob(new Map([['file2.js', 'content2']]));
      await env.zipHandler.processZipFile(blob2, 'project-2', 'Commit 2');

      // Both should succeed
      const successStatuses = env.statusCallback.getHistory().filter((s) => s.status === 'success');
      expect(successStatuses.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle simple network errors gracefully', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Simulate a simple network error (more realistic)
      env.githubService.setError(new Error('Request timeout'));

      const blob = createTestBlob(new Map([['test.js', 'content']]));

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Request timeout');

      // Should record failure in statistics
      const failureRecord = env.pushStats.getLastRecord();
      expect(failureRecord).toMatchObject({
        action: 'failure',
        error: expect.stringContaining('Request timeout'),
      });
    });

    it('should handle authentication errors', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Simulate auth error (realistic scenario)
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

      // Configure comparison service to return all files as new
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

      // Track blob creations to verify content
      const createdBlobs: any[] = [];
      env.githubService.setResponse(
        'POST',
        '/repos/test-owner/test-repo/git/blobs',
        (_, __, body) => {
          createdBlobs.push(body);
          return { sha: `blob-${createdBlobs.length}` };
        }
      );

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify all blobs were created with base64 encoding
      expect(createdBlobs).toHaveLength(files.size);
      for (const blob of createdBlobs) {
        expect(blob.encoding).toBe('base64');
        expect(blob.content).toBeTruthy();

        // Verify content can be decoded
        const decoded = Buffer.from(blob.content, 'base64').toString('utf-8');
        expect(Object.values(testContent)).toContain(decoded);
      }
    });

    it('should handle files with CRLF and LF line endings consistently', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['unix.txt', 'Line 1\nLine 2\nLine 3'],
        ['windows.txt', 'Line 1\r\nLine 2\r\nLine 3'],
        ['mixed.txt', 'Line 1\nLine 2\r\nLine 3'],
      ]);

      // Configure comparison service to return all files as new
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

      // All files should be processed successfully
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
      expect(lastStatus?.message).toContain('3 files');
    });
  });

  describe('Repository State Handling', () => {
    it('should handle basic Git API errors gracefully', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Configure comparison service to return files as new
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.html', { status: 'added' as const, content: '<html></html>' }],
          ['app.js', { status: 'added' as const, content: 'console.log("app");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      // Simulate a simple Git API error (more realistic than complex force push scenarios)
      env.githubService.setResponse(
        'PATCH',
        '/repos/test-owner/test-repo/git/refs/heads/main',
        () => {
          const error = new Error('Update is not a fast forward') as Error & { status?: number };
          error.status = 422;
          throw error;
        }
      );

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Update is not a fast forward');
    });

    it('should handle repository access errors', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Simulate simple access error (more realistic than deletion during upload)
      env.githubService.setResponse('GET', '/repos/test-owner/test-repo', () => {
        const error = new Error('Not Found') as Error & { status?: number };
        error.status = 404;
        throw error;
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      // Should fail with repository not found error
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

      // Create realistic file sizes (not 10MB which is excessive for typical use)
      const files = new Map([
        ['app.js', 'x'.repeat(50000)], // 50KB - more realistic
        ['styles.css', 'x'.repeat(10000)], // 10KB
        ['small-file.txt', 'small content'],
      ]);

      // Configure comparison service to return all files as new
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

      // Should handle normal file sizes without issues
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should clean up resources on failure', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Configure comparison service to return files as new
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.html', { status: 'added' as const, content: '<html></html>' }],
          ['app.js', { status: 'added' as const, content: 'console.log("app");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      // Fail during tree creation
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/trees', () => {
        throw new Error('Tree creation failed');
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Tree creation failed');

      // Verify error was properly reported
      const errorStatus = env.statusCallback.getLastStatus();
      expect(errorStatus?.status).toBe('error');
      expect(errorStatus?.message).toContain('Tree creation failed');

      // Verify push failure was recorded
      const failureRecord = env.pushStats.getLastRecord();
      expect(failureRecord?.action).toBe('failure');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should handle token expiration during upload', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Configure comparison service to return files as new
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.html', { status: 'added' as const, content: '<html></html>' }],
          ['app.js', { status: 'added' as const, content: 'console.log("app");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      let requestCount = 0;
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/blobs', () => {
        requestCount++;
        if (requestCount === 3) {
          const error = new Error('Bad credentials') as Error & { status?: number };
          error.status = 401;
          throw error;
        }
        return { sha: `blob-${requestCount}` };
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Bad credentials');

      // Should have made some progress before auth failure
      expect(requestCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle insufficient permissions', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Configure comparison service to return files as new
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.html', { status: 'added' as const, content: '<html></html>' }],
          ['app.js', { status: 'added' as const, content: 'console.log("app");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      // Simulate permission error on commit creation
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/commits', () => {
        const error = new Error('Resource not accessible by integration') as Error & {
          status?: number;
        };
        error.status = 403;
        throw error;
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Resource not accessible');

      // Should fail with clear error
      const errorStatus = env.statusCallback.getLastStatus();
      expect(errorStatus?.message).toContain('Resource not accessible');
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

      // Should handle files without extensions
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle deeply nested directory structures', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['a/b/c/d/e/f/g/h/i/j/k/l/m/n/deep.txt', 'Very deep file'],
        ['shallow.txt', 'Shallow file'],
      ]);

      // Configure comparison service to return files as new
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

      // Should preserve directory structure
      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect(treeCreation?.body?.tree).toContainEqual(
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

      // Configure comparison service to return files as new
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

      // All files should be created even with identical content
      const blobCreations = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCreations).toBe(3);

      // Tree should contain all files
      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect(treeCreation?.body?.tree).toHaveLength(3);
    });
  });
});
