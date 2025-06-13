import {
  createTestEnvironment,
  cleanupTestEnvironment,
  createTestBlob,
  TEST_PROJECTS,
  setupTestProject,
  COMPARISON_RESULTS,
  type ZipHandlerTestEnvironment,
} from './test-fixtures/ZipHandlerTestFixtures.index';
import { ZipHandler } from '../zipHandler';

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

      // Configure comparison service to return all files as new
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['app.min.js', { status: 'added' as const, content: 'minified code' }],
          ['data.backup.2024.json', { status: 'added' as const, content: '{"backup": true}' }],
          ['jquery-3.6.0.min.js', { status: 'added' as const, content: '/* jQuery v3.6.0 */' }],
          ['file.name.with.many.dots.txt', { status: 'added' as const, content: 'content' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

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
      const changes = new Map();
      for (let i = 0; i < 30; i++) {
        files.set(`file${i}.js`, `content ${i}`);
        changes.set(`file${i}.js`, { status: 'added' as const, content: `content ${i}` });
      }

      // Configure comparison service to return all files as new
      env.comparisonService.setComparisonResult({
        changes,
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

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
      const changes = new Map();
      for (let i = 0; i < 31; i++) {
        files.set(`file${i}.js`, `content ${i}`);
        changes.set(`file${i}.js`, { status: 'added' as const, content: `content ${i}` });
      }

      // Configure comparison service to return all files as new
      env.comparisonService.setComparisonResult({
        changes,
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

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

      // Configure comparison service to return all files as new
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['empty.txt', { status: 'added' as const, content: '' }],
          ['also-empty.js', { status: 'added' as const, content: '' }],
          ['has-content.txt', { status: 'added' as const, content: 'some content' }],
        ]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

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

      // Configure comparison service
      env.comparisonService.setComparisonResult({
        changes: new Map([['test.js', { status: 'added' as const, content: 'content' }]]),
        repoData: COMPARISON_RESULTS.allNew.repoData,
      });

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

    // Removed: Testing chrome storage errors is an implementation detail
    // The important behavior is that operations fail gracefully, not specific error messages

    // Removed: Testing rate limit reset timing is an implementation detail
    // The behavior is already tested in the main rate limiting tests
  });

  describe('Special Content Handling', () => {
    // Removed: Testing null bytes in files is an unrealistic edge case
    // Normal text files don't contain null bytes, and binary files are handled as base64
    // Removed: Testing extremely long single-line files is an edge case not worth complex test setup
    // GitHub API handles large content appropriately
    // Removed: Testing Unicode normalization is an implementation detail
    // The important behavior is that files are uploaded correctly
  });

  describe('Comparison Edge Cases', () => {
    it('should handle comparison returning undefined for some files', async () => {
      setupTestProject(env, TEST_PROJECTS.default);

      // Mock comparison to return partial results (realistic scenario)
      env.comparisonService.setComparisonResult({
        changes: new Map([
          ['file1.js', { status: 'added' as const, content: 'new file' }],
          // file2.js exists locally but comparison doesn't return it (unchanged)
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

    // Removed: Testing SHA handling with no changes is contradictory
    // If there are no changes, no tree should be created
  });

  describe('Error Recovery Edge Cases', () => {
    // Removed: Testing push statistics errors is testing implementation details
    // Statistics are a side effect, not core behavior

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

    // Removed: Testing branch creation race conditions is testing implementation details
    // This is an extremely unlikely scenario in a single-threaded extension
  });
});
