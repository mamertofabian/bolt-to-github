import { ZipHandler } from '../../zipHandler';
import { GitHubComparisonService } from '../../GitHubComparisonService';
import { 
  MockUnifiedGitHubService, 
  MockGitHubComparisonService, 
  MockStatusCallback,
  MockChromeStorage,
  MockPushStatisticsActions
} from './ZipHandlerMocks';
import {
  ZIP_FILE_FIXTURES,
  createTestBlob,
  CHROME_STORAGE_FIXTURES,
  TEST_PROJECTS,
  ERROR_SCENARIOS
} from './ZipHandlerTestFixtures';

/**
 * Test helper functions for ZipHandler testing
 * Provides utilities for test setup, teardown, and common test scenarios
 */

/**
 * Test environment setup for ZipHandler tests
 */
export interface ZipHandlerTestEnvironment {
  zipHandler: ZipHandler;
  githubService: MockUnifiedGitHubService;
  comparisonService: MockGitHubComparisonService;
  statusCallback: MockStatusCallback;
  chromeStorage: MockChromeStorage;
  pushStats: MockPushStatisticsActions;
  originalComparison: GitHubComparisonService;
}

/**
 * Create a complete test environment for ZipHandler testing
 */
export function createTestEnvironment(): ZipHandlerTestEnvironment {
  // Create mocks
  const githubService = new MockUnifiedGitHubService();
  const comparisonService = new MockGitHubComparisonService();
  const statusCallback = new MockStatusCallback();
  const chromeStorage = new MockChromeStorage();
  const pushStats = new MockPushStatisticsActions();

  // Store original GitHubComparisonService instance
  const originalComparison = GitHubComparisonService.getInstance();

  // Mock GitHubComparisonService.getInstance()
  jest.spyOn(GitHubComparisonService, 'getInstance').mockReturnValue(comparisonService as any);

  // Mock chrome.storage
  global.chrome = {
    ...global.chrome,
    storage: {
      ...global.chrome?.storage,
      sync: {
        get: chromeStorage.get.bind(chromeStorage),
        set: chromeStorage.set.bind(chromeStorage),
      } as any,
    },
  };

  // Mock push statistics actions
  jest.mock('../lib/stores', () => ({
    pushStatisticsActions: pushStats,
  }));

  // Create ZipHandler instance
  const zipHandler = new ZipHandler(githubService as any, statusCallback.getCallback());

  return {
    zipHandler,
    githubService,
    comparisonService,
    statusCallback,
    chromeStorage,
    pushStats,
    originalComparison,
  };
}

/**
 * Clean up test environment after tests
 */
export function cleanupTestEnvironment(env: ZipHandlerTestEnvironment) {
  // Restore GitHubComparisonService
  jest.spyOn(GitHubComparisonService, 'getInstance').mockRestore();
  
  // Clear all mocks
  jest.clearAllMocks();
  
  // Clear mock data
  env.githubService.clearHistory();
  env.comparisonService.clearHistory();
  env.statusCallback.clear();
  env.chromeStorage.clear();
  env.pushStats.clear();
}

/**
 * Setup test project in Chrome storage
 */
export function setupTestProject(
  env: ZipHandlerTestEnvironment,
  project: typeof TEST_PROJECTS.default
) {
  env.chromeStorage.setData({
    repoOwner: project.repoOwner,
    projectSettings: {
      [project.projectId]: {
        repoName: project.repoName,
        branch: project.branch,
      },
    },
  });
}

/**
 * Create test scenarios for different file upload situations
 */
export const TestScenarios = {
  /**
   * Simple successful upload scenario
   */
  async simpleUpload(env: ZipHandlerTestEnvironment) {
    setupTestProject(env, TEST_PROJECTS.default);
    const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);
    
    await env.zipHandler.processZipFile(
      blob,
      TEST_PROJECTS.default.projectId,
      TEST_PROJECTS.default.commitMessage
    );
  },

  /**
   * Upload with no changes detected
   */
  async uploadWithNoChanges(env: ZipHandlerTestEnvironment) {
    setupTestProject(env, TEST_PROJECTS.default);
    env.comparisonService.setComparisonResult({
      changes: new Map(),
      repoData: {
        baseTreeSha: 'tree123',
        baseSha: 'abc123',
        existingFiles: new Map([['index.js', 'blob123']]),
      },
    });
    
    const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);
    await env.zipHandler.processZipFile(
      blob,
      TEST_PROJECTS.default.projectId,
      TEST_PROJECTS.default.commitMessage
    );
  },

  /**
   * Upload with rate limit handling
   */
  async uploadWithRateLimit(env: ZipHandlerTestEnvironment) {
    setupTestProject(env, TEST_PROJECTS.default);
    env.githubService.setRateLimit(5); // Low rate limit
    
    const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);
    await env.zipHandler.processZipFile(
      blob,
      TEST_PROJECTS.default.projectId,
      TEST_PROJECTS.default.commitMessage
    );
  },

  /**
   * Upload with network error
   */
  async uploadWithNetworkError(env: ZipHandlerTestEnvironment) {
    setupTestProject(env, TEST_PROJECTS.default);
    env.githubService.setError(ERROR_SCENARIOS.networkError);
    
    const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);
    await expect(
      env.zipHandler.processZipFile(
        blob,
        TEST_PROJECTS.default.projectId,
        TEST_PROJECTS.default.commitMessage
      )
    ).rejects.toThrow('Network request failed');
  },

  /**
   * Upload large project with batching
   */
  async uploadLargeProject(env: ZipHandlerTestEnvironment) {
    setupTestProject(env, TEST_PROJECTS.default);
    const blob = createTestBlob(ZIP_FILE_FIXTURES.largeProject);
    
    await env.zipHandler.processZipFile(
      blob,
      TEST_PROJECTS.default.projectId,
      TEST_PROJECTS.default.commitMessage
    );
  },

  /**
   * Upload to new branch
   */
  async uploadToNewBranch(env: ZipHandlerTestEnvironment) {
    setupTestProject(env, TEST_PROJECTS.withBranch);
    const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);
    
    await env.zipHandler.processZipFile(
      blob,
      TEST_PROJECTS.withBranch.projectId,
      TEST_PROJECTS.withBranch.commitMessage
    );
  },

  /**
   * Upload to empty repository
   */
  async uploadToEmptyRepo(env: ZipHandlerTestEnvironment) {
    setupTestProject(env, TEST_PROJECTS.default);
    env.githubService.setResponse('GET', '/repos/test-owner/test-repo/git/refs/heads/main', null);
    
    const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);
    await env.zipHandler.processZipFile(
      blob,
      TEST_PROJECTS.default.projectId,
      TEST_PROJECTS.default.commitMessage
    );
  },
};

/**
 * Assertion helpers for common test verifications
 */
export const TestAssertions = {
  /**
   * Assert that the upload completed successfully
   */
  expectSuccessfulUpload(env: ZipHandlerTestEnvironment, expectedFileCount: number) {
    const lastStatus = env.statusCallback.getLastStatus();
    expect(lastStatus).toMatchObject({
      status: 'success',
      progress: 100,
      message: expect.stringContaining('Successfully uploaded'),
    });

    // Verify push statistics recorded
    const pushRecords = env.pushStats.getRecords();
    expect(pushRecords).toContainEqual(
      expect.objectContaining({ action: 'attempt' })
    );
    expect(pushRecords).toContainEqual(
      expect.objectContaining({ action: 'success' })
    );
  },

  /**
   * Assert that the correct API calls were made
   */
  expectGitHubApiCalls(env: ZipHandlerTestEnvironment, options: {
    repoChecks?: boolean;
    blobCreation?: boolean;
    treeCreation?: boolean;
    commitCreation?: boolean;
    branchUpdate?: boolean;
  }) {
    const history = env.githubService.getRequestHistory();

    if (options.repoChecks) {
      expect(history).toContainEqual(
        expect.objectContaining({
          method: 'GET',
          path: expect.stringContaining('/repos/'),
        })
      );
    }

    if (options.blobCreation) {
      expect(history).toContainEqual(
        expect.objectContaining({
          method: 'POST',
          path: expect.stringContaining('/git/blobs'),
        })
      );
    }

    if (options.treeCreation) {
      expect(history).toContainEqual(
        expect.objectContaining({
          method: 'POST',
          path: expect.stringContaining('/git/trees'),
        })
      );
    }

    if (options.commitCreation) {
      expect(history).toContainEqual(
        expect.objectContaining({
          method: 'POST',
          path: expect.stringContaining('/git/commits'),
        })
      );
    }

    if (options.branchUpdate) {
      expect(history).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          path: expect.stringContaining('/git/refs/heads/'),
        })
      );
    }
  },

  /**
   * Assert that the upload failed with specific error
   */
  expectUploadError(env: ZipHandlerTestEnvironment, errorMessage: string) {
    const lastStatus = env.statusCallback.getLastStatus();
    expect(lastStatus).toMatchObject({
      status: 'error',
      progress: 0,
      message: expect.stringContaining(errorMessage),
    });

    // Verify push failure recorded
    const lastPushRecord = env.pushStats.getLastRecord();
    expect(lastPushRecord).toMatchObject({
      action: 'failure',
      error: expect.stringContaining(errorMessage),
    });
  },

  /**
   * Assert status update sequence
   */
  expectStatusSequence(env: ZipHandlerTestEnvironment, expectedSequence: string[]) {
    const statusHistory = env.statusCallback.getHistory();
    const messages = statusHistory.map(s => s.message || '');
    
    for (const expected of expectedSequence) {
      expect(messages).toContain(expect.stringContaining(expected));
    }
  },
};

/**
 * Wait for async operations to complete
 */
export function waitForAsync(ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a test blob that simulates a real ZIP file
 */
export function createRealisticZipBlob(files: Map<string, string>): Blob {
  // In a real implementation, this would use fflate to create actual ZIP data
  // For testing, we use our mock format
  return createTestBlob(files);
}

/**
 * Simulate different network conditions
 */
export const NetworkConditions = {
  fast: { delay: 0 },
  normal: { delay: 50 },
  slow: { delay: 200 },
  unreliable: { delay: 500, errorRate: 0.1 },
};

/**
 * Apply network condition to GitHub service mock
 */
export function applyNetworkCondition(
  env: ZipHandlerTestEnvironment,
  condition: typeof NetworkConditions.normal
) {
  env.githubService.setDelay(condition.delay);
  
  if ('errorRate' in condition && Math.random() < condition.errorRate) {
    env.githubService.setError(ERROR_SCENARIOS.networkError);
  }
}