/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

import { GitHubComparisonService } from '../../GitHubComparisonService';
import {
  MockChromeStorage,
  MockGitHubComparisonService,
  MockPushStatisticsActions,
  MockStatusCallback,
  MockUnifiedGitHubService,
} from './ZipHandlerMocks';
import {
  createTestBlob,
  ERROR_SCENARIOS,
  TEST_PROJECTS,
  ZIP_FILE_FIXTURES,
} from './ZipHandlerTestFixtures';

/**
 * Test helper functions for ZipHandler testing
 * Provides utilities for test setup, teardown, and common test scenarios
 */

// Define ZipHandler interface to avoid using any
interface ZipHandlerLike {
  processZipFile(blob: Blob, projectId: string, commitMessage: string): Promise<void>;
}

/**
 * Test environment setup for ZipHandler tests
 */
export interface ZipHandlerTestEnvironment {
  zipHandler: ZipHandlerLike;
  githubService: MockUnifiedGitHubService;
  comparisonService: MockGitHubComparisonService;
  statusCallback: MockStatusCallback;
  chromeStorage: MockChromeStorage;
  pushStats: MockPushStatisticsActions;
  originalComparison: GitHubComparisonService;
}

// Mock modules before importing ZipHandler
vi.mock('../../../lib/zip', () => ({
  ZipProcessor: {
    processZipBlob: vi.fn().mockImplementation(async (blob: Blob) => {
      // Check if it's a corrupted blob (our test marker)
      if (blob.size === 4) {
        // Check the blob type to see if it's corrupted
        if (blob.type === 'application/zip') {
          throw new Error('Failed to process ZIP file: Invalid ZIP data');
        }
      }

      try {
        // Handle both real Blob and our mock blob
        let text: string;
        if (typeof blob.text === 'function') {
          text = await blob.text();
        } else if ('_content' in blob && typeof blob._content === 'string') {
          text = blob._content;
        } else {
          text = '[]';
        }

        const entries = JSON.parse(text);
        return new Map(entries);
      } catch (error) {
        console.error('Failed to parse blob content:', error);
        console.error('Blob content:', blob);
        // Return empty map if JSON parsing fails (for other test cases)
        return new Map();
      }
    }),
  },
}));

// Mock the stores module first, before any imports
vi.mock('../../../lib/stores', () => ({
  pushStatisticsActions: {
    recordPushAttempt: vi.fn(),
    recordPushSuccess: vi.fn(),
    recordPushFailure: vi.fn(),
  },
}));

vi.mock('../../../lib/common', () => ({
  toBase64: vi.fn().mockImplementation((str: string) => {
    // Simple base64 encoding for tests
    return Buffer.from(str).toString('base64');
  }),
}));

vi.mock('../../../lib/Queue', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => {
      // Execute the function immediately in tests
      return await fn();
    }),
  })),
}));

vi.mock('../../../lib/fileUtils', () => ({
  processFilesWithGitignore: vi.fn().mockImplementation((files) => {
    // Simple mock that filters out common ignored patterns
    const processedFiles = new Map();
    for (const [path, content] of files.entries()) {
      if (
        !path.includes('node_modules/') &&
        !path.includes('.env') &&
        !path.includes('dist/') &&
        !path.includes('.DS_Store')
      ) {
        processedFiles.set(path, content);
      }
    }
    return processedFiles;
  }),
}));

/**
 * Create a complete test environment for ZipHandler testing
 */
export async function createTestEnvironment(): Promise<ZipHandlerTestEnvironment> {
  // Create mocks
  const githubService = new MockUnifiedGitHubService();
  const comparisonService = new MockGitHubComparisonService();
  const statusCallback = new MockStatusCallback();
  const chromeStorage = new MockChromeStorage();
  const pushStats = new MockPushStatisticsActions();

  // Store original GitHubComparisonService instance
  const originalComparison = GitHubComparisonService.getInstance();

  // Mock GitHubComparisonService.getInstance()
  vi.spyOn(GitHubComparisonService, 'getInstance').mockReturnValue(
    comparisonService as unknown as GitHubComparisonService
  );

  // Mock chrome.storage
  global.chrome = {
    ...global.chrome,
    storage: {
      ...global.chrome?.storage,
      sync: {
        get: chromeStorage.get.bind(chromeStorage),
        set: chromeStorage.set.bind(chromeStorage),
      } as chrome.storage.SyncStorageArea,
    },
  };

  // Get the mocked push statistics actions
  const { pushStatisticsActions } = await import('../../../lib/stores');

  // Override the mock functions to use our test spy
  vi.mocked(pushStatisticsActions.recordPushAttempt).mockImplementation(
    pushStats.recordPushAttempt.bind(pushStats) as any
  );
  vi.mocked(pushStatisticsActions.recordPushSuccess).mockImplementation(
    pushStats.recordPushSuccess.bind(pushStats) as any
  );
  vi.mocked(pushStatisticsActions.recordPushFailure).mockImplementation(
    pushStats.recordPushFailure.bind(pushStats) as any
  );

  // Import ZipHandler after mocks are set up
  const { ZipHandler } = await import('../../zipHandler');

  // Create ZipHandler instance
  const zipHandler = new ZipHandler(
    githubService as any,
    statusCallback.getCallback()
  ) as ZipHandlerLike;

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
  vi.spyOn(GitHubComparisonService, 'getInstance').mockRestore();

  // Clear all mocks
  vi.clearAllMocks();

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
    env.githubService.setResponse('GET', '/repos/test-owner/test-repo/git/refs/heads/main', {
      status: 404,
      data: null,
    });

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
  expectSuccessfulUpload(env: ZipHandlerTestEnvironment, _expectedFileCount: number) {
    const lastStatus = env.statusCallback.getLastStatus();
    expect(lastStatus).toMatchObject({
      status: 'success',
      progress: 100,
      message: expect.stringContaining('Successfully uploaded'),
    });

    // Verify push statistics recorded
    const pushRecords = env.pushStats.getRecords();
    expect(pushRecords).toContainEqual(expect.objectContaining({ action: 'attempt' }));
    expect(pushRecords).toContainEqual(expect.objectContaining({ action: 'success' }));
  },

  /**
   * Assert that the correct API calls were made
   */
  expectGitHubApiCalls(
    env: ZipHandlerTestEnvironment,
    options: {
      repoChecks?: boolean;
      blobCreation?: boolean;
      treeCreation?: boolean;
      commitCreation?: boolean;
      branchUpdate?: boolean;
    }
  ) {
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
    const messages = statusHistory.map((s) => s.message || '');

    for (const expected of expectedSequence) {
      const found = messages.some((msg) => msg.includes(expected));
      expect(found).toBe(true);
    }
  },
};

/**
 * Wait for async operations to complete
 */
export function waitForAsync(ms: number = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
} as const;

/**
 * Network condition type
 */
type NetworkCondition = (typeof NetworkConditions)[keyof typeof NetworkConditions];

/**
 * Apply network condition to GitHub service mock
 */
export function applyNetworkCondition(env: ZipHandlerTestEnvironment, condition: NetworkCondition) {
  env.githubService.setDelay(condition.delay);

  if ('errorRate' in condition && Math.random() < condition.errorRate) {
    env.githubService.setError(ERROR_SCENARIOS.networkError);
  }
}
