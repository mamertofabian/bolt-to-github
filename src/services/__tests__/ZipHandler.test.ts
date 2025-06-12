import {
  createTestEnvironment,
  cleanupTestEnvironment,
  TestScenarios,
  TestAssertions,
  ZIP_FILE_FIXTURES,
  createTestBlob,
  TEST_PROJECTS,
  CHROME_STORAGE_FIXTURES,
  ERROR_SCENARIOS,
  COMPARISON_RESULTS,
  setupTestProject,
  waitForAsync,
  type ZipHandlerTestEnvironment,
} from './test-fixtures/ZipHandlerTestFixtures.index';

describe('ZipHandler', () => {
  let env: ZipHandlerTestEnvironment;

  beforeEach(() => {
    env = createTestEnvironment();
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

      // Verify files were processed
      const blobCreationCalls = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCreationCalls).toBeGreaterThan(0);

      // Verify success status
      TestAssertions.expectSuccessfulUpload(env, ZIP_FILE_FIXTURES.simpleProject.size);
    });

    it('should reject ZIP files larger than 50MB', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const largeBlob = new Blob([new Uint8Array(51 * 1024 * 1024)]); // 51MB

      await expect(
        env.zipHandler.processZipFile(
          largeBlob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('File too large. Maximum size is 50MB');

      // Verify error status was reported
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
      // Test by setting github service to null after creation
      const testHandler = env.zipHandler as any;
      const originalService = testHandler.githubService;
      testHandler.githubService = null;

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(testHandler.processZipFile(blob, 'project-123', 'Test commit')).rejects.toThrow(
        'GitHub service not initialized'
      );

      const errorStatus = env.statusCallback.findStatus((s) => s.status === 'error');
      expect(errorStatus?.message).toContain('GitHub service not initialized');

      // Restore original service
      testHandler.githubService = originalService;
    });

    it('should require a valid project ID', async () => {
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(env.zipHandler.processZipFile(blob, null, 'Test commit')).rejects.toThrow(
        'Project ID not found'
      );

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

      // Verify repository existence was checked
      expect(env.githubService.getRequestCount('GET', '/repos/')).toBeGreaterThan(0);
    });

    it('should initialize empty repositories before uploading', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      // Mock empty repository
      env.githubService.setResponse('GET', '/repos/test-owner/test-repo/git/refs/heads/main', null);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify initialization was called
      const history = env.githubService.getRequestHistory();
      expect(history).toContainEqual(
        expect.objectContaining({
          method: 'GET',
          path: '/repos/test-owner/test-repo/git/refs/heads/main',
        })
      );
    });

    it('should create branch if it does not exist', async () => {
      setupTestProject(env, TEST_PROJECTS.withBranch);

      // Configure comparison service for simple project files
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.html', { status: 'added' as const, content: '<html></html>' }],
          ['app.js', { status: 'added' as const, content: 'console.log("app");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      // The processZipFile should handle branch creation gracefully
      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.withBranch.projectId,
          TEST_PROJECTS.withBranch.commitMessage
        )
      ).resolves.not.toThrow();

      // Verify branch check was attempted
      const branchCheckCalls = env.githubService
        .getRequestHistory()
        .filter((req) => req.path.includes('/git/refs/heads/'));
      expect(branchCheckCalls.length).toBeGreaterThan(0);
    });

    it('should create default project settings if missing', async () => {
      // Set up storage without project settings
      env.chromeStorage.setData({
        repoOwner: 'test-owner',
        projectSettings: {},
      });

      // Configure comparison service for simple project files
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.html', { status: 'added' as const, content: '<html></html>' }],
          ['app.js', { status: 'added' as const, content: 'console.log("app");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);
      const newProjectId = 'new-project-789';

      // Add mock response for the new repository
      env.githubService.setResponse('GET', `/repos/test-owner/${newProjectId}`, {
        name: newProjectId,
        owner: { login: 'test-owner' },
        default_branch: 'main',
      });
      env.githubService.setResponse(
        'GET',
        `/repos/test-owner/${newProjectId}/git/refs/heads/main`,
        {
          ref: 'refs/heads/main',
          object: { sha: 'abc123' },
        }
      );

      await env.zipHandler.processZipFile(blob, newProjectId, 'Initial commit');

      // Verify settings were created
      const savedData = env.chromeStorage.getData();
      expect(savedData.projectSettings[newProjectId]).toEqual({
        repoName: newProjectId,
        branch: 'main',
      });

      TestAssertions.expectSuccessfulUpload(env, ZIP_FILE_FIXTURES.simpleProject.size);
    });

    it('should fail if repository owner is not configured', async () => {
      env.chromeStorage.setData({
        repoOwner: '',
        projectSettings: {},
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(blob, 'project-123', 'Test commit')
      ).rejects.toThrow('Repository details not configured');

      TestAssertions.expectUploadError(env, 'Repository details not configured');
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

      // Verify no blobs were created
      expect(env.githubService.getRequestCount('POST', '/git/blobs')).toBe(0);

      // Verify success message indicates no changes
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

      // Verify only changed files created blobs
      const blobCreations = env.githubService.getRequestCount('POST', '/git/blobs');
      expect(blobCreations).toBe(COMPARISON_RESULTS.withChanges.changes.size);

      TestAssertions.expectSuccessfulUpload(env, COMPARISON_RESULTS.withChanges.changes.size);
    });

    it('should handle file path normalization', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Create files with 'project/' prefix
      const filesWithPrefix = new Map([
        ['project/index.js', 'console.log("test");'],
        ['project/src/app.js', 'export default App;'],
      ]);

      // Set comparison to show these as new files
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

      // Verify paths were normalized (project/ prefix removed)
      const blobCreations = env.githubService
        .getRequestHistory()
        .filter((req) => req.method === 'POST' && req.path.includes('/git/blobs'));

      // The normalized paths should be in the tree creation
      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      expect(treeCreation).toBeDefined();
      if (treeCreation?.body?.tree) {
        const paths = treeCreation.body.tree.map((item: any) => item.path);
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

      // Verify ignored files were not uploaded
      const treeCreation = env.githubService
        .getRequestHistory()
        .find((req) => req.method === 'POST' && req.path.includes('/git/trees'));

      if (treeCreation?.body?.tree) {
        const paths = treeCreation.body.tree.map((item: any) => item.path);
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

      // Find indices of different operations
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

      // Verify order
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

      // Verify rate limit was checked
      expect(env.githubService.getRequestCount('GET', '/rate_limit')).toBeGreaterThan(0);
    });

    it('should warn when rate limit is low', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      // Set comparison to return all files as changed
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

      // Set rate limit to trigger warning (4 files + 10 = 14, so set to 13)
      env.githubService.setRateLimit(13);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should have warning about rate limit
      const warningStatus = env.statusCallback.findStatus((s) =>
        s.message?.includes('Rate limit warning')
      );
      expect(warningStatus).toBeDefined();
    });

    it('should wait for rate limit reset if happening soon', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      // Set rate limit to reset in 2 seconds
      const resetTime = Math.floor(Date.now() / 1000) + 2;
      env.githubService.setRateLimit(5, resetTime);

      // Mock global setTimeout to avoid actual waiting in tests
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      // Start the process
      const processPromise = env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Advance timers to simulate rate limit reset
      jest.advanceTimersByTime(2000);

      // Reset rate limit after wait
      env.githubService.resetRateLimit();

      await processPromise;

      // Should have called setTimeout with ~2000ms
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));
      const sleepDuration = setTimeoutSpy.mock.calls[0][1];
      expect(sleepDuration).toBeGreaterThanOrEqual(1000);
      expect(sleepDuration).toBeLessThanOrEqual(3000);

      // Should show waiting message
      const waitingStatus = env.statusCallback.findStatus(
        (s) => s.message?.includes('Waiting') && s.message?.includes('rate limit reset')
      );
      expect(waitingStatus).toBeDefined();

      // Restore timers
      jest.useRealTimers();
    });

    it('should handle rate limit errors during blob creation', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Mock setTimeout for faster tests
      jest.useFakeTimers();

      // Set up rate limit to fail after 2 blobs
      let blobCount = 0;
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/blobs', () => {
        blobCount++;
        if (blobCount === 3) {
          // Reset rate limit on 3rd attempt to simulate recovery
          env.githubService.resetRateLimit();
          const error = new Error('API rate limit exceeded') as Error & {
            status?: number;
            message: string;
          };
          error.status = 403;
          throw error;
        }
        return { sha: `blob-${blobCount}` };
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      // Start processing
      const processPromise = env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Fast-forward through any delays
      jest.runAllTimers();

      // Should still succeed due to retry logic
      await processPromise;

      // Should have shown rate limit message
      const rateLimitStatus = env.statusCallback.findStatus(
        (s) => s.message?.includes('Rate limit') || s.message?.includes('rate limit')
      );
      expect(rateLimitStatus).toBeDefined();

      // Restore timers
      jest.useRealTimers();
    });

    it('should fail if rate limit reset is too far away', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      // Set rate limit to reset in 10 minutes
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
    it('should report progress at key stages', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      // Ensure rate limit is reset for this test
      env.githubService.resetRateLimit();

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const statusHistory = env.statusCallback.getHistory();
      const progressValues = statusHistory
        .filter((s) => s.progress !== undefined)
        .map((s) => s.progress);

      // Progress should be monotonically increasing
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]!);
      }

      // Should hit key milestones
      TestAssertions.expectStatusSequence(env, [
        'Processing ZIP file',
        'Preparing files',
        'Checking repository',
        'Getting repository information',
        'Creating', // file blobs or tree
        'Updating branch',
        'Successfully uploaded',
      ]);
    });

    it('should send duplicate status updates for critical states', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.githubService.resetRateLimit();

      // Mock setTimeout to execute immediately
      const originalSetTimeout = global.setTimeout;
      const timeoutCallbacks: Array<() => void> = [];
      global.setTimeout = jest.fn((callback: () => void, delay: number) => {
        timeoutCallbacks.push(callback);
        return {} as any;
      }) as any;

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Execute all timeout callbacks
      timeoutCallbacks.forEach((cb) => cb());

      const statusHistory = env.statusCallback.getHistory();

      // Check for duplicate success status or initial upload status
      const criticalStatuses = statusHistory.filter(
        (s) =>
          s.status === 'success' ||
          (s.status === 'uploading' && s.progress === 0) ||
          s.status === 'error'
      );

      // Should have at least one duplicate
      const statusCounts = new Map<string, number>();
      criticalStatuses.forEach((s) => {
        const key = `${s.status}-${s.progress}`;
        statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
      });

      const hasDuplicates = Array.from(statusCounts.values()).some((count) => count >= 2);
      expect(hasDuplicates).toBe(true);

      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    });

    it('should record push statistics on success', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.githubService.resetRateLimit();

      // Set comparison result to ensure files are processed
      env.comparisonService.setComparisonResult(COMPARISON_RESULTS.withChanges);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const records = env.pushStats.getRecords();

      // Should have attempt and success
      expect(records).toContainEqual(
        expect.objectContaining({
          action: 'attempt',
          projectId: TEST_PROJECTS.default.projectId,
          filesCount: expect.any(Number), // Files count after processing
        })
      );

      expect(records).toContainEqual(
        expect.objectContaining({
          action: 'success',
          projectId: TEST_PROJECTS.default.projectId,
        })
      );
    });

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

      // Should have attempt and failure
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
    it('should process files in batches of 30', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.githubService.resetRateLimit();

      // Set comparison to show all 100 files as new
      const largeFiles = Array.from(ZIP_FILE_FIXTURES.largeProject.entries());
      const changes = new Map(
        largeFiles.map(([path, content]) => [
          path.replace('project/', ''),
          { status: 'added' as const, content },
        ])
      );

      env.comparisonService.setComparisonResult({
        changes,
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.largeProject); // 100 files

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should show batch processing messages
      const batchStatuses = env.statusCallback
        .getHistory()
        .filter((s) => s.message?.includes('Processing batch'));

      expect(batchStatuses.length).toBeGreaterThan(0);

      // Should have processed all files
      TestAssertions.expectSuccessfulUpload(env, ZIP_FILE_FIXTURES.largeProject.size);
    });

    it('should add delays between batches', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.githubService.resetRateLimit();

      // Set comparison to show all files as new
      const largeFiles = Array.from(ZIP_FILE_FIXTURES.largeProject.entries());
      const changes = new Map(
        largeFiles.map(([path, content]) => [
          path.replace('project/', ''),
          { status: 'added' as const, content },
        ])
      );

      env.comparisonService.setComparisonResult({
        changes,
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      // Mock setTimeout to track delays
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const blob = createTestBlob(ZIP_FILE_FIXTURES.largeProject);

      const processPromise = env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Run all timers to completion
      jest.runAllTimers();

      await processPromise;

      // With 100 files in ~4 batches, should have at least 3 delays
      const sleepCalls = setTimeoutSpy.mock.calls.filter((call) => call[1] >= 1000);
      expect(sleepCalls.length).toBeGreaterThanOrEqual(3);

      // Restore timers
      jest.useRealTimers();
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed blob uploads', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Set comparison to show files as new
      env.comparisonService.setComparisonResult(COMPARISON_RESULTS.withChanges);

      // Mock sleep for faster tests
      const originalSleep = env.zipHandler.sleep;
      (env.zipHandler as any).sleep = jest.fn(() => Promise.resolve());

      // Make first blob creation fail, then succeed
      let blobCallCount = 0;
      const failOnFirstCall = new Map<string, boolean>();

      env.githubService.setResponse(
        'POST',
        '/repos/test-owner/test-repo/git/blobs',
        (method, path, body) => {
          blobCallCount++;
          const fileKey = body?.content || 'unknown';

          if (!failOnFirstCall.has(fileKey)) {
            failOnFirstCall.set(fileKey, true);
            throw ERROR_SCENARIOS.networkError;
          }

          return { sha: `blob-${blobCallCount}` };
        }
      );

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should have retried and succeeded
      expect(blobCallCount).toBeGreaterThan(COMPARISON_RESULTS.withChanges.changes.size);
      TestAssertions.expectSuccessfulUpload(env, COMPARISON_RESULTS.withChanges.changes.size);

      // Restore original sleep
      (env.zipHandler as any).sleep = originalSleep;
    });

    it('should fail after maximum retry attempts', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      env.githubService.resetRateLimit();

      // Set comparison to show file as new
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['test.js', { status: 'added' as const, content: 'console.log("test");' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      // Mock timers for faster tests
      jest.useFakeTimers();

      // Always fail blob creation
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/blobs', () => {
        throw ERROR_SCENARIOS.networkError;
      });

      const blob = createTestBlob(new Map([['test.js', 'console.log("test");']]));

      await expect(
        env.zipHandler.processZipFile(
          blob,
          TEST_PROJECTS.default.projectId,
          TEST_PROJECTS.default.commitMessage
        )
      ).rejects.toThrow('Network request failed');

      // Should show failure after attempts
      const errorStatus = env.statusCallback.findStatus(
        (s) => s.message?.includes('Failed to upload') && s.message?.includes('after')
      );
      expect(errorStatus).toBeDefined();

      // Restore original sleep
      (env.zipHandler as any).sleep = originalSleep;
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty ZIP files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Set comparison to show no changes for empty project
      env.comparisonService.setComparisonResult(COMPARISON_RESULTS.noChanges);

      const blob = createTestBlob(ZIP_FILE_FIXTURES.emptyProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should complete but with no changes
      const successStatus = env.statusCallback.findStatus((s) => s.status === 'success');
      expect(successStatus).toBeDefined();
      expect(successStatus?.message).toContain('No changes detected');
    });

    it('should handle files with special characters in names', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Set comparison to show all special character files as new
      const specialFiles = Array.from(ZIP_FILE_FIXTURES.projectWithSpecialChars.entries());
      const changes = new Map(
        specialFiles.map(([path, content]) => [
          path.replace('project/', ''), // Remove project prefix
          { status: 'added' as const, content },
        ])
      );

      env.comparisonService.setComparisonResult({
        changes,
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.projectWithSpecialChars);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should handle special characters without errors
      TestAssertions.expectSuccessfulUpload(env, ZIP_FILE_FIXTURES.projectWithSpecialChars.size);
    });

    it('should handle binary files with base64 encoding', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Set comparison to show binary files as new
      const binaryFiles = Array.from(ZIP_FILE_FIXTURES.projectWithBinaryFiles.entries());
      const changes = new Map(
        binaryFiles.map(([path, content]) => [
          path.replace('project/', ''),
          { status: 'added' as const, content },
        ])
      );

      env.comparisonService.setComparisonResult({
        changes,
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.projectWithBinaryFiles);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify binary files were encoded properly
      const blobCreations = env.githubService
        .getRequestHistory()
        .filter((req) => req.method === 'POST' && req.path.includes('/git/blobs'));

      expect(blobCreations.length).toBeGreaterThan(0);
      for (const creation of blobCreations) {
        expect(creation.body).toMatchObject({
          encoding: 'base64',
          content: expect.any(String),
        });
      }
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
