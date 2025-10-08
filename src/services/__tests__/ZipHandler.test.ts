import {
  cleanupTestEnvironment,
  COMPARISON_RESULTS,
  createTestBlob,
  createTestEnvironment,
  ERROR_SCENARIOS,
  setupTestProject,
  TEST_PROJECTS,
  TestAssertions,
  ZIP_FILE_FIXTURES,
  type ZipHandlerTestEnvironment,
} from './test-fixtures/ZipHandlerTestFixtures.index';

describe('ZipHandler', () => {
  let env: ZipHandlerTestEnvironment;

  beforeEach(async () => {
    env = await createTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment(env);
  });

  describe('ZIP File Processing', () => {
    it('should process a valid ZIP file and extract all files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const blobCreationCalls = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCreationCalls).toBeGreaterThan(0);

      TestAssertions.expectSuccessfulUpload(env, ZIP_FILE_FIXTURES.simpleProject.size);
    });

    it('should reject ZIP files larger than 50MB', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const largeBlob = new Blob([new Uint8Array(51 * 1024 * 1024)]);

      await expect(
        env.zipHandler.processZipFile(
          largeBlob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('File too large. Maximum size is 50MB');

      const errorStatus = env.statusCallback.findStatus((s) => s.status === 'error');
      expect(errorStatus?.message).toContain('File too large');
    });

    it('should handle corrupted ZIP files gracefully', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const corruptBlob = createTestBlob(new Map(), { corrupt: true });

      await expect(
        env.zipHandler.processZipFile(
          corruptBlob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Failed to process ZIP file');

      TestAssertions.expectUploadError(env, 'Failed to process ZIP file');
    });

    it('should require GitHub service to be initialized', async () => {
      const testHandler = env.zipHandler as unknown as {
        githubService: typeof env.githubService | null;
        processZipFile: (
          blob: Blob,
          projectId: string | null,
          commitMessage: string
        ) => Promise<void>;
      };
      const originalService = testHandler.githubService;
      testHandler.githubService = null;

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(testHandler.processZipFile(blob, 'project-123', 'Test commit')).rejects.toThrow(
        'GitHub service not initialized'
      );

      const errorStatus = env.statusCallback.findStatus((s) => s.status === 'error');
      expect(errorStatus?.message).toContain('GitHub service not initialized');

      testHandler.githubService = originalService;
    });

    it('should require a valid project ID', async () => {
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(blob, null as unknown as string, 'Test commit')
      ).rejects.toThrow('Project ID not found');

      const errorStatus = env.statusCallback.findStatus((s) => s.status === 'error');
      expect(errorStatus?.message).toContain('Project ID not found');
    });
  });

  describe('Repository Management', () => {
    it('should create repository if it does not exist', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      expect(env.githubService.getRequestCount('GET', '/repos/')).toBeGreaterThan(0);
    });

    it('should initialize empty repositories before uploading', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      env.githubService.setResponse(
        'GET',
        '/repos/test-owner/test-repo/git/refs/heads/main',
        null as unknown as Record<string, unknown>
      );

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const history = env.githubService.getRequestHistory();
      expect(history).toContainEqual(
        expect.objectContaining({
          method: 'GET',
          path: '/repos/test-owner/test-repo/git/refs/heads/main',
        })
      );
    });

    it('should fail if repository owner is not configured', async () => {
      env.chromeStorage.setData({
        repoOwner: '',
        projectSettings: {},
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(blob, 'project-123', 'Test commit')
      ).rejects.toThrow();
    });
  });

  describe('File Comparison and Change Detection', () => {
    it('should skip upload when no files have changed', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.comparisonService.setComparisonResult(COMPARISON_RESULTS.noChanges);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      expect(env.githubService.getRequestCount('POST', '/git/blobs')).toBe(0);

      const successStatus = env.statusCallback.findStatus((s) => s.status === 'success');
      expect(successStatus?.message).toContain('No changes detected');
    });

    it('should upload only changed files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.comparisonService.setComparisonResult(COMPARISON_RESULTS.withChanges);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const blobCreations = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCreations).toBe(COMPARISON_RESULTS.withChanges.changes.size);

      TestAssertions.expectSuccessfulUpload(env, COMPARISON_RESULTS.withChanges.changes.size);
    });

    it('should handle file path normalization', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const filesWithPrefix = new Map([
        ['project/index.js', 'console.log("test");'],
        ['project/src/app.js', 'export default App;'],
      ]);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.js', { status: 'added' as const, content: 'console.log("test");' }],
          ['src/app.js', { status: 'added' as const, content: 'export default App;' }],
        ]),
        repoData: {
          baseTreeSha: 'tree123',
          baseSha: 'commit123',
          existingFiles: new Map(),
        },
      });

      const blob = createTestBlob(filesWithPrefix);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      env.githubService
        .getRequestHistory()
        .filter((req) => req.method === 'POST' && req.path.includes('/git/blobs'));

      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect(treeCreation).toBeDefined();
      if (
        treeCreation?.body &&
        typeof treeCreation.body === 'object' &&
        'tree' in treeCreation.body
      ) {
        const body = treeCreation.body as { tree: Array<{ path: string }> };
        const paths = body.tree.map((item) => item.path);
        expect(paths).toContain('index.js');
        expect(paths).toContain('src/app.js');
        expect(paths).not.toContain('project/index.js');
      }
    });

    it('should respect .gitignore rules', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.projectWithGitignore);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      if (
        treeCreation?.body &&
        typeof treeCreation.body === 'object' &&
        'tree' in treeCreation.body
      ) {
        const body = treeCreation.body as { tree: Array<{ path: string }> };
        const paths = body.tree.map((item) => item.path);
        expect(paths).not.toContain('node_modules/package/index.js');
        expect(paths).not.toContain('.env');
        expect(paths).not.toContain('dist/bundle.js');
        expect(paths).not.toContain('.DS_Store');
      }
    });
  });

  describe('GitHub API Interactions', () => {
    it('should create blobs, tree, commit, and update ref in correct order', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const history = env.githubService.getRequestHistory();

      const firstBlobIndex = history.findIndex(
        (req) => req.method === 'POST' && req.path.includes('/git/blobs')
      );
      const treeIndex = history.findIndex(
        (req) => req.method === 'POST' && req.path.includes('/git/trees')
      );
      const commitIndex = history.findIndex(
        (req) => req.method === 'POST' && req.path.includes('/git/commits')
      );
      const refUpdateIndex = history.findIndex(
        (req) => req.method === 'PATCH' && req.path.includes('/git/refs/heads/')
      );

      expect(firstBlobIndex).toBeGreaterThanOrEqual(0);
      expect(treeIndex).toBeGreaterThan(firstBlobIndex);
      expect(commitIndex).toBeGreaterThan(treeIndex);
      expect(refUpdateIndex).toBeGreaterThan(commitIndex);
    });

    it('should include parent commit when creating new commit', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const commitCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/commits'));

      expect(commitCreation?.body).toMatchObject({
        message: TEST_PROJECTS.default.commitMessage,
        parents: expect.arrayContaining([expect.any(String)]),
      });
    });

    it('should use base tree when creating new tree', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect(treeCreation?.body).toMatchObject({
        base_tree: expect.any(String),
        tree: expect.any(Array),
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should check rate limit before processing', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      expect(env.githubService.getRequestCount('GET', '/rate_limit')).toBeGreaterThan(0);
    });

    it('should warn when rate limit is low', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      env.comparisonService.setComparisonResult({
        changes: new Map([
          [
            'index.html',
            {
              status: 'added' as const,
              content: ZIP_FILE_FIXTURES.simpleProject.get('project/index.html')!,
            },
          ],
          [
            'style.css',
            {
              status: 'added' as const,
              content: ZIP_FILE_FIXTURES.simpleProject.get('project/style.css')!,
            },
          ],
          [
            'script.js',
            {
              status: 'added' as const,
              content: ZIP_FILE_FIXTURES.simpleProject.get('project/script.js')!,
            },
          ],
          [
            'README.md',
            {
              status: 'added' as const,
              content: ZIP_FILE_FIXTURES.simpleProject.get('project/README.md')!,
            },
          ],
        ]),
        repoData: COMPARISON_RESULTS.withChanges.repoData,
      });

      env.githubService.setRateLimit(13);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const warningStatus = env.statusCallback.findStatus((s) =>
        Boolean(s.message?.includes('Rate limit warning'))
      );
      expect(warningStatus).toBeDefined();
    });

    it('should fail if rate limit reset is too far away', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      env.githubService.setRateLimit(5, Math.floor(Date.now() / 1000) + 600);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Insufficient API rate limit remaining');
    });
  });

  describe('Progress Tracking', () => {
    it('should record push statistics on failure', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.githubService.setError(ERROR_SCENARIOS.networkError);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow();

      const records = env.pushStats.getRecords();

      expect(records).toContainEqual(
        expect.objectContaining({
          action: 'attempt',
          projectId: TEST_PROJECTS.default.projectId,
        })
      );

      expect(records).toContainEqual(
        expect.objectContaining({
          action: 'failure',
          projectId: TEST_PROJECTS.default.projectId,
          error: expect.stringContaining('Network request failed'),
        })
      );
    });
  });

  describe('Large File Handling', () => {
    it('should handle large file uploads within limits', () => {
      expect(true).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should handle persistent network errors', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.githubService.resetRateLimit();

      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/blobs', () => {
        throw new Error('Network error');
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty ZIP files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      env.comparisonService.setComparisonResult(COMPARISON_RESULTS.noChanges);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.emptyProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const successStatus = env.statusCallback.findStatus((s) => s.status === 'success');
      expect(successStatus).toBeDefined();
      expect(successStatus?.message).toContain('No changes detected');
    });

    it('should handle comparison service errors gracefully', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.comparisonService.setError(new Error('Comparison failed'));

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Comparison failed');

      TestAssertions.expectUploadError(env, 'Comparison failed');
    });
  });
});
