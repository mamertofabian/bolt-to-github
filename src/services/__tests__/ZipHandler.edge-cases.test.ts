import {
  createTestEnvironment,
  cleanupTestEnvironment,
  createTestBlob,
  TEST_PROJECTS,
  setupTestProject,
  COMPARISON_RESULTS,
  type ZipHandlerTestEnvironment,
} from './test-fixtures/ZipHandlerTestFixtures.index';

describe('ZipHandler - Edge Cases', () => {
  let env: ZipHandlerTestEnvironment;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment(env);
  });

  describe('Unusual File Patterns', () => {
    it('should handle files with multiple dots in names', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['app.min.js', 'minified code'],
        ['data.backup.2024.json', '{"backup": true}'],
        ['jquery-3.6.0.min.js', '/* jQuery v3.6.0 */'],
        ['file.name.with.many.dots.txt', 'content'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // All files should be processed correctly
      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect(treeCreation?.body?.tree).toHaveLength(4);
      const paths = treeCreation?.body?.tree.map((item: any) => item.path);
      expect(paths).toContain('app.min.js');
      expect(paths).toContain('data.backup.2024.json');
    });

    it('should handle files that look like system files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['.htaccess', 'RewriteEngine On'],
        ['.env.example', 'API_KEY=your_key_here'],
        ['_redirects', '/* /index.html 200'],
        ['~$temp.docx', 'temp file content'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // System-like files should be uploaded
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle files with only whitespace in names', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['normal.txt', 'normal content'],
        [' leading-space.txt', 'content'],
        ['trailing-space.txt ', 'content'],
        ['multiple   spaces.txt', 'content'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should handle whitespace in filenames
      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect(treeCreation?.body?.tree).toBeDefined();
      expect(treeCreation?.body?.tree.length).toBeGreaterThan(0);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle exactly 30 files (batch boundary)', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map();
      for (let i = 0; i < 30; i++) {
        files.set(`file${i}.js`, `content ${i}`);
      }

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should process exactly one batch
      const batchStatuses = env.statusCallback
        .getHistory()
        .filter((s) => s.message?.includes('Processing batch'));

      expect(batchStatuses).toHaveLength(1);
      expect(batchStatuses[0]?.message).toContain('batch 1/1');
    });

    it('should handle exactly 31 files (just over batch boundary)', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map();
      for (let i = 0; i < 31; i++) {
        files.set(`file${i}.js`, `content ${i}`);
      }

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should process two batches
      const batchStatuses = env.statusCallback
        .getHistory()
        .filter((s) => s.message?.includes('Processing batch'));

      expect(batchStatuses).toHaveLength(2);
      expect(batchStatuses[0]?.message).toContain('batch 1/2');
      expect(batchStatuses[1]?.message).toContain('batch 2/2');
    });

    it('should handle file at exactly 50MB limit', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Create blob exactly at 50MB
      const exactLimit = new Blob([new Uint8Array(50 * 1024 * 1024)]);

      await env.zipHandler.processZipFile(
        exactLimit,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should succeed at exact limit
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle empty file content', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['empty.txt', ''],
        ['also-empty.js', ''],
        ['has-content.txt', 'some content'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Empty files should still be created
      const blobCreations = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCreations).toBe(3);
    });
  });

  describe('Timing and State Issues', () => {
    it('should handle status callback errors gracefully', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Create a failing status callback
      let callCount = 0;
      const failingCallback = (status: any) => {
        callCount++;
        if (callCount === 3) {
          throw new Error('Status callback failed');
        }
        env.statusCallback.getCallback()(status);
      };

      const handler = new ZipHandler(env.githubService as any, failingCallback);
      const blob = createTestBlob(new Map([['test.js', 'content']]));

      // Should continue despite callback errors
      await handler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Upload should still succeed
      const pushRecords = env.pushStats.getRecords();
      expect(pushRecords).toContainEqual(expect.objectContaining({ action: 'success' }));
    });

    it('should handle chrome storage errors during project setup', async () => {
      // Mock storage to fail on set
      const originalSet = env.chromeStorage.set;
      env.chromeStorage.set = jest.fn().mockRejectedValue(new Error('Storage quota exceeded'));

      const blob = createTestBlob(new Map([['test.js', 'content']]));

      await expect(
        env.zipHandler.processZipFile(
          blob,
          'new-project-without-settings',
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Storage quota exceeded');

      // Restore original
      env.chromeStorage.set = originalSet;
    });

    it('should handle rate limit reset time in the past', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Set rate limit with reset time in the past
      env.githubService.setRateLimit(0, Math.floor(Date.now() / 1000) - 60);

      const blob = createTestBlob(new Map([['test.js', 'content']]));

      // Should recognize reset has already happened and retry
      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should check rate limit again after seeing it's in the past
      expect(env.githubService.getRequestCount('GET', '/rate_limit')).toBeGreaterThan(1);
    });
  });

  describe('Special Content Handling', () => {
    it('should handle files with null bytes', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const files = new Map([
        ['binary-like.txt', 'before\x00after'],
        ['normal.txt', 'normal content'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should handle null bytes in content
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle extremely long single-line files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Create a file with a very long single line
      const longLine = 'x'.repeat(100000); // 100k characters on one line
      const files = new Map([
        ['long-line.txt', longLine],
        ['normal.txt', 'normal\ncontent\nwith\nlinebreaks'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should handle long lines
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle files with various Unicode normalization forms', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Same character in different Unicode normalization forms
      const files = new Map([
        ['café-nfc.txt', 'café'], // NFC form
        ['café-nfd.txt', 'café'], // NFD form (looks same but different bytes)
        ['test-emoji.txt', '👨‍👩‍👧‍👦 Family emoji with ZWJ sequences'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should handle different Unicode forms
      const blobCreations = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCreations).toBe(3);
    });
  });

  describe('Comparison Edge Cases', () => {
    it('should handle comparison returning undefined for some files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Mock comparison to return partial results
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['file1.js', { status: 'added' as const, content: 'new file' }],
          // file2.js exists locally but comparison doesn't return it
        ]),
        repoData: COMPARISON_RESULTS.withChanges.repoData,
      });

      const files = new Map([
        ['file1.js', 'new file'],
        ['file2.js', 'another file'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should only upload files marked as changed
      const blobCreations = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCreations).toBe(1);
    });

    it('should handle existing files with different SHAs in tree', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Set up comparison with existing files
      env.comparisonService.setComparisonResult({
        changes: new Map(),
        repoData: {
          baseTreeSha: 'tree123',
          baseSha: 'commit123',
          existingFiles: new Map([
            ['existing1.js', 'sha-old-1'],
            ['existing2.js', 'sha-old-2'],
          ]),
        },
      });

      // Upload files that include the existing ones
      const files = new Map([
        ['existing1.js', 'same content'],
        ['existing2.js', 'same content'],
        ['new.js', 'new content'],
      ]);

      const blob = createTestBlob(files);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Tree should include existing files with their SHAs
      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect(treeCreation?.body?.tree).toContainEqual(
        expect.objectContaining({
          path: 'existing1.js',
          sha: 'sha-old-1',
        })
      );
    });
  });

  describe('Error Recovery Edge Cases', () => {
    it('should handle errors in push statistics recording', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Make push statistics fail
      env.pushStats.recordPushAttempt = jest
        .fn()
        .mockRejectedValue(new Error('Statistics service unavailable'));

      const blob = createTestBlob(new Map([['test.js', 'content']]));

      // Should continue despite statistics failure
      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Upload should still succeed
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });

    it('should handle malformed GitHub API responses', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Return malformed response for commit lookup
      env.githubService.setResponse('GET', '/repos/test-owner/test-repo/git/commits/abc123def456', {
        // Missing required 'tree' property
        sha: 'abc123def456',
        parents: [],
      });

      const blob = createTestBlob(new Map([['test.js', 'content']]));

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow();
    });

    it('should handle branch creation race condition', async () => {
      setupTestProject(env, TEST_PROJECTS.withBranch);

      let branchCheckCount = 0;
      env.githubService.setResponse(
        'GET',
        `/repos/test-owner/feature-repo/branches/${TEST_PROJECTS.withBranch.branch}`,
        () => {
          branchCheckCount++;
          if (branchCheckCount === 1) {
            // First check: branch doesn't exist
            const error = new Error('Not Found') as Error & { status?: number };
            error.status = 404;
            throw error;
          }
          // Second check: branch now exists (created by another process)
          return { name: TEST_PROJECTS.withBranch.branch };
        }
      );

      // Branch creation should fail (already exists)
      env.githubService.setResponse('POST', '/repos/test-owner/feature-repo/git/refs', () => {
        const error = new Error('Reference already exists') as Error & { status?: number };
        error.status = 422;
        throw error;
      });

      const blob = createTestBlob(new Map([['test.js', 'content']]));

      // Should handle the race condition and continue
      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.withBranch.projectId,
        TEST_PROJECTS.withBranch.commitMessage
      );

      // Should succeed despite race condition
      const lastStatus = env.statusCallback.getLastStatus();
      expect(lastStatus?.status).toBe('success');
    });
  });
});
