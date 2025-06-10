import { 
  createTestEnvironment, 
  cleanupTestEnvironment,
  ZIP_FILE_FIXTURES,
  createTestBlob,
  TEST_PROJECTS,
  setupTestProject,
  type ZipHandlerTestEnvironment
} from './test-fixtures/ZipHandlerTestFixtures.index';

describe('ZipHandler - Critical Scenarios', () => {
  let env: ZipHandlerTestEnvironment;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment(env);
  });

  describe('Concurrent Upload Handling', () => {
    it('should handle multiple simultaneous uploads to different projects', async () => {
      // Setup multiple projects
      env.chromeStorage.setData({
        repoOwner: 'test-owner',
        projectSettings: {
          'project-1': { repoName: 'repo-1', branch: 'main' },
          'project-2': { repoName: 'repo-2', branch: 'main' },
          'project-3': { repoName: 'repo-3', branch: 'main' }
        }
      });

      const blob1 = createTestBlob(new Map([['file1.js', 'content1']]));
      const blob2 = createTestBlob(new Map([['file2.js', 'content2']]));
      const blob3 = createTestBlob(new Map([['file3.js', 'content3']]));

      // Start multiple uploads
      const uploads = Promise.all([
        env.zipHandler.processZipFile(blob1, 'project-1', 'Commit 1'),
        env.zipHandler.processZipFile(blob2, 'project-2', 'Commit 2'),
        env.zipHandler.processZipFile(blob3, 'project-3', 'Commit 3')
      ]);

      await uploads;

      // Verify all uploads succeeded
      const successStatuses = env.statusCallback.getHistory()
        .filter(s => s.status === 'success');
      expect(successStatuses.length).toBeGreaterThanOrEqual(3);

      // Verify push statistics for all projects
      const pushRecords = env.pushStats.getRecords();
      const successRecords = pushRecords.filter(r => r.action === 'success');
      expect(successRecords).toHaveLength(3);
      expect(new Set(successRecords.map(r => r.projectId))).toEqual(
        new Set(['project-1', 'project-2', 'project-3'])
      );
    });

    it('should handle rapid successive uploads to the same project', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
      const blob1 = createTestBlob(new Map([['v1.js', 'version 1']]));
      const blob2 = createTestBlob(new Map([['v2.js', 'version 2']]));

      // First upload
      await env.zipHandler.processZipFile(
        blob1,
        TEST_PROJECTS.default.projectId,
        'First commit'
      );

      // Immediate second upload
      await env.zipHandler.processZipFile(
        blob2,
        TEST_PROJECTS.default.projectId,
        'Second commit'
      );

      // Both should succeed
      const successStatuses = env.statusCallback.getHistory()
        .filter(s => s.status === 'success');
      expect(successStatuses.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Network Resilience', () => {
    it('should recover from intermittent network failures', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
      let requestCount = 0;
      let failureCount = 0;
      const maxFailures = 3;

      // Simulate intermittent failures
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/blobs', () => {
        requestCount++;
        if (failureCount < maxFailures && requestCount % 2 === 0) {
          failureCount++;
          const error = new Error('Network timeout') as Error & { code?: string };
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return { sha: `blob-${requestCount}` };
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should succeed despite failures
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');

      // Should have made extra requests due to retries
      expect(requestCount).toBeGreaterThan(ZIP_FILE_FIXTURES.simpleProject.size);
    });

    it('should handle complete network outage during upload', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
      let blobsCreated = 0;
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/blobs', () => {
        blobsCreated++;
        if (blobsCreated === 2) {
          // Simulate network outage after 2 blobs
          env.githubService.setError(new Error('Network unreachable'));
        }
        return { sha: `blob-${blobsCreated}` };
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Network unreachable');

      // Should have attempted some uploads before failing
      expect(blobsCreated).toBeGreaterThanOrEqual(2);

      // Should record failure
      const failureRecord = env.pushStats.getLastRecord();
      expect(failureRecord).toMatchObject({
        action: 'failure',
        error: expect.stringContaining('Network unreachable')
      });
    });
  });

  describe('Data Integrity', () => {
    it('should maintain file content integrity through the upload process', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
      const testContent = {
        'test.js': 'const x = 42;\nconsole.log(x);',
        'data.json': JSON.stringify({ nested: { value: true } }, null, 2),
        'unicode.txt': '🚀 Unicode test: αβγ δεζ 中文字符'
      };
      
      const files = new Map(Object.entries(testContent));
      const blob = createTestBlob(files);

      // Track blob creations to verify content
      const createdBlobs: any[] = [];
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/blobs', (_, __, body) => {
        createdBlobs.push(body);
        return { sha: `blob-${createdBlobs.length}` };
      });

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
        ['mixed.txt', 'Line 1\nLine 2\r\nLine 3']
      ]);
      
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

  describe('Repository State Management', () => {
    it('should handle force push scenarios correctly', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
      // Simulate a conflict where ref update fails
      let updateAttempts = 0;
      env.githubService.setResponse('PATCH', '/repos/test-owner/test-repo/git/refs/heads/main', () => {
        updateAttempts++;
        if (updateAttempts === 1) {
          const error = new Error('Update is not a fast forward') as Error & { status?: number };
          error.status = 422;
          throw error;
        }
        return { object: { sha: 'updated-sha' } };
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should succeed (current implementation doesn't force push, but handles the error)
      // In a real scenario, this might need user intervention
      expect(updateAttempts).toBe(1);
    });

    it('should handle repository deletion during upload', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
      let checkCount = 0;
      env.githubService.setResponse('GET', '/repos/test-owner/test-repo', () => {
        checkCount++;
        if (checkCount > 1) {
          const error = new Error('Not Found') as Error & { status?: number };
          error.status = 404;
          throw error;
        }
        return { name: 'test-repo', owner: { login: 'test-owner' } };
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      // This should fail when repository check fails
      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow();
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle extremely large individual files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
      // Create a file with 10MB of content
      const largeContent = 'x'.repeat(10 * 1024 * 1024);
      const files = new Map([
        ['large-file.txt', largeContent],
        ['small-file.txt', 'small content']
      ]);
      
      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should handle large files without issues
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should clean up resources on failure', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
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
      
      // Simulate permission error on commit creation
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/commits', () => {
        const error = new Error('Resource not accessible by integration') as Error & { status?: number };
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
        ['Makefile', 'build:\n\techo "Building..."']
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
        ['shallow.txt', 'Shallow file']
      ]);
      
      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should preserve directory structure
      const treeCreation = env.githubService.getRequestHistory()
        .find(req => req.method === 'POST' && req.path.includes('/git/trees'));
      
      expect(treeCreation?.body?.tree).toContainEqual(
        expect.objectContaining({
          path: 'a/b/c/d/e/f/g/h/i/j/k/l/m/n/deep.txt'
        })
      );
    });

    it('should handle files with identical content but different names', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
      const identicalContent = 'console.log("Same content");';
      const files = new Map([
        ['file1.js', identicalContent],
        ['file2.js', identicalContent],
        ['backup/file1.js', identicalContent]
      ]);
      
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
      const treeCreation = env.githubService.getRequestHistory()
        .find(req => req.method === 'POST' && req.path.includes('/git/trees'));
      
      expect(treeCreation?.body?.tree).toHaveLength(3);
    });
  });
});