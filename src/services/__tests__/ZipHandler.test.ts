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
  type ZipHandlerTestEnvironment
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
      const errorStatus = env.statusCallback.findStatus(s => s.status === 'error');
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
      // Create a new env with null github service
      const newEnv = createTestEnvironment();
      const { ZipHandler } = require('../../zipHandler');
      const uninitializedHandler = new ZipHandler(null as any, newEnv.statusCallback.getCallback());
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        uninitializedHandler.processZipFile(blob, 'project-123', 'Test commit')
      ).rejects.toThrow('GitHub service not initialized');

      const errorStatus = newEnv.statusCallback.findStatus(s => s.status === 'error');
      expect(errorStatus?.message).toContain('GitHub service not initialized');
      
      // Clean up the new environment
      cleanupTestEnvironment(newEnv);
    });

    it('should require a valid project ID', async () => {
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await expect(
        env.zipHandler.processZipFile(blob, null, 'Test commit')
      ).rejects.toThrow('Project ID not found');

      const errorStatus = env.statusCallback.findStatus(s => s.status === 'error');
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
          path: '/repos/test-owner/test-repo/git/refs/heads/main'
        })
      );
    });

    it('should create branch if it does not exist', async () => {
      setupTestProject(env, TEST_PROJECTS.withBranch);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.withBranch.projectId,
        TEST_PROJECTS.withBranch.commitMessage
      );

      // Verify branch creation was attempted
      const branchCheckCalls = env.githubService.getRequestHistory().filter(
        req => req.path.includes(`/branches/${TEST_PROJECTS.withBranch.branch}`)
      );
      expect(branchCheckCalls.length).toBeGreaterThan(0);
    });

    it('should create default project settings if missing', async () => {
      // Set up storage without project settings
      env.chromeStorage.setData({
        repoOwner: 'test-owner',
        projectSettings: {}
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);
      const newProjectId = 'new-project-789';

      await env.zipHandler.processZipFile(
        blob,
        newProjectId,
        'Initial commit'
      );

      // Verify settings were created
      const savedData = env.chromeStorage.getData();
      expect(savedData.projectSettings[newProjectId]).toEqual({
        repoName: newProjectId,
        branch: 'main'
      });

      TestAssertions.expectSuccessfulUpload(env, ZIP_FILE_FIXTURES.simpleProject.size);
    });

    it('should fail if repository owner is not configured', async () => {
      env.chromeStorage.setData({
        repoOwner: '',
        projectSettings: {}
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
      const successStatus = env.statusCallback.findStatus(s => s.status === 'success');
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
        ['project/src/app.js', 'export default App;']
      ]);
      
      // Set comparison to show these as new files
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['index.js', { status: 'added' as const, content: 'console.log("test");' }],
          ['src/app.js', { status: 'added' as const, content: 'export default App;' }]
        ]),
        repoData: {
          baseTreeSha: 'tree123',
          baseSha: 'commit123',
          existingFiles: new Map()
        }
      });
      
      const blob = createTestBlob(filesWithPrefix);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify paths were normalized (project/ prefix removed)
      const blobCreations = env.githubService.getRequestHistory()
        .filter(req => req.method === 'POST' && req.path.includes('/git/blobs'));

      // The normalized paths should be in the tree creation
      const treeCreation = env.githubService.getRequestHistory()
        .find(req => req.method === 'POST' && req.path.includes('/git/trees'));
      
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
      const treeCreation = env.githubService.getRequestHistory()
        .find(req => req.method === 'POST' && req.path.includes('/git/trees'));
      
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
      const firstBlobIndex = history.findIndex(req => 
        req.method === 'POST' && req.path.includes('/git/blobs')
      );
      const treeIndex = history.findIndex(req => 
        req.method === 'POST' && req.path.includes('/git/trees')
      );
      const commitIndex = history.findIndex(req => 
        req.method === 'POST' && req.path.includes('/git/commits')
      );
      const refUpdateIndex = history.findIndex(req => 
        req.method === 'PATCH' && req.path.includes('/git/refs/heads/')
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

      const commitCreation = env.githubService.getRequestHistory()
        .find(req => req.method === 'POST' && req.path.includes('/git/commits'));

      expect(commitCreation?.body).toMatchObject({
        message: TEST_PROJECTS.default.commitMessage,
        parents: expect.arrayContaining([expect.any(String)])
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

      const treeCreation = env.githubService.getRequestHistory()
        .find(req => req.method === 'POST' && req.path.includes('/git/trees'));

      expect(treeCreation?.body).toMatchObject({
        base_tree: expect.any(String),
        tree: expect.any(Array)
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
      env.githubService.setRateLimit(15); // Low but enough for small upload
      
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should have warning about rate limit
      const warningStatus = env.statusCallback.findStatus(s => 
        s.message?.includes('Rate limit warning')
      );
      expect(warningStatus).toBeDefined();
    });

    it('should wait for rate limit reset if happening soon', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      // Set rate limit to reset in 2 seconds
      env.githubService.setRateLimit(5, Math.floor(Date.now() / 1000) + 2);
      
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);
      const startTime = Date.now();

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const duration = Date.now() - startTime;
      
      // Should have waited (at least 1 second, allowing for some variance)
      expect(duration).toBeGreaterThan(1000);

      // Should show waiting message
      const waitingStatus = env.statusCallback.findStatus(s => 
        s.message?.includes('Waiting') && s.message?.includes('rate limit reset')
      );
      expect(waitingStatus).toBeDefined();
    });

    it('should handle rate limit errors during blob creation', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      // Set rate limit to be exhausted after a few requests
      env.githubService.setRateLimit(3);
      
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      // Should still succeed due to retry logic
      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should have shown rate limit message
      const rateLimitStatus = env.statusCallback.findStatus(s => 
        s.message?.includes('Rate limit hit')
      );
      expect(rateLimitStatus).toBeDefined();
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
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      const statusHistory = env.statusCallback.getHistory();
      const progressValues = statusHistory
        .filter(s => s.progress !== undefined)
        .map(s => s.progress);

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
        'Successfully uploaded'
      ]);
    });

    it('should send duplicate status updates for critical states', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Allow time for duplicate status sends
      await waitForAsync(200);

      const statusHistory = env.statusCallback.getHistory();
      
      // Check for duplicate success status
      const successStatuses = statusHistory.filter(s => s.status === 'success');
      expect(successStatuses.length).toBeGreaterThanOrEqual(2);
    });

    it('should record push statistics on success', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
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
          filesCount: ZIP_FILE_FIXTURES.simpleProject.size
        })
      );
      
      expect(records).toContainEqual(
        expect.objectContaining({
          action: 'success',
          projectId: TEST_PROJECTS.default.projectId
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
          projectId: TEST_PROJECTS.default.projectId
        })
      );
      
      expect(records).toContainEqual(
        expect.objectContaining({
          action: 'failure',
          projectId: TEST_PROJECTS.default.projectId,
          error: expect.stringContaining('Network request failed')
        })
      );
    });
  });

  describe('Large File Handling', () => {
    it('should process files in batches of 30', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.largeProject); // 100 files

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should show batch processing messages
      const batchStatuses = env.statusCallback.getHistory()
        .filter(s => s.message?.includes('Processing batch'));
      
      expect(batchStatuses.length).toBeGreaterThan(0);
      
      // Should have processed all files
      TestAssertions.expectSuccessfulUpload(env, ZIP_FILE_FIXTURES.largeProject.size);
    });

    it('should add delays between batches', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.largeProject);

      const startTime = Date.now();
      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );
      const duration = Date.now() - startTime;

      // With 100 files in ~4 batches, should have at least 3 seconds of delays
      // (1 second between each batch)
      expect(duration).toBeGreaterThan(2000); // Allow some variance
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed blob uploads', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
      // Make first blob creation fail, then succeed
      let blobCallCount = 0;
      env.githubService.setResponse('POST', '/repos/test-owner/test-repo/git/blobs', () => {
        blobCallCount++;
        if (blobCallCount === 1) {
          throw ERROR_SCENARIOS.networkError;
        }
        return { sha: `blob-${blobCallCount}` };
      });

      const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should have retried and succeeded
      expect(blobCallCount).toBeGreaterThan(ZIP_FILE_FIXTURES.simpleProject.size);
      TestAssertions.expectSuccessfulUpload(env, ZIP_FILE_FIXTURES.simpleProject.size);
    });

    it('should fail after maximum retry attempts', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      
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
      const errorStatus = env.statusCallback.findStatus(s => 
        s.message?.includes('Failed to upload') && s.message?.includes('after')
      );
      expect(errorStatus).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty ZIP files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
      const blob = createTestBlob(ZIP_FILE_FIXTURES.emptyProject);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Should complete but with no changes
      const successStatus = env.statusCallback.findStatus(s => s.status === 'success');
      expect(successStatus).toBeDefined();
    });

    it('should handle files with special characters in names', async () => {
      setupTestProject(env, TEST_PROJECTS.default);
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
      const blob = createTestBlob(ZIP_FILE_FIXTURES.projectWithBinaryFiles);

      await env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      );

      // Verify binary files were encoded properly
      const blobCreations = env.githubService.getRequestHistory()
        .filter(req => req.method === 'POST' && req.path.includes('/git/blobs'));

      for (const creation of blobCreations) {
        expect(creation.body).toMatchObject({
          encoding: 'base64',
          content: expect.any(String)
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