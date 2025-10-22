import type { UnifiedGitHubService } from '../../UnifiedGitHubService';
import type { UploadStatusState, ProjectFiles } from '$lib/types';
import {
  GITHUB_API_RESPONSES,
  COMPARISON_RESULTS,
  FIXED_UNIX_TIME,
} from './ZipHandlerTestFixtures';
import type { GitHubRepository } from 'src/services/types/repository';

/**
 * Test doubles for ZipHandler dependencies
 * Provides controlled implementations that accurately reflect real behavior
 */

// Define types for test mock responses and data
type MockResponse =
  | Record<string, unknown>
  | unknown[]
  | ((method: string, path: string, body?: unknown) => unknown);

type RequestHistoryEntry = {
  method: string;
  path: string;
  body?: unknown;
};

// Chrome storage types
type ChromeStorageData = Record<string, unknown>;

/**
 * Mock UnifiedGitHubService with configurable responses
 */
export class MockUnifiedGitHubService implements Partial<UnifiedGitHubService> {
  private responses: Map<string, MockResponse> = new Map();
  private requestHistory: RequestHistoryEntry[] = [];
  private shouldThrowError: Error | null = null;
  private requestDelay: number = 0;
  private rateLimitState = { ...GITHUB_API_RESPONSES.rateLimit };
  private rateLimitBehavior: 'normal' | 'limited' | 'exceeded' = 'normal';
  private blobShaMap: Map<string, string> = new Map();
  private treeCounter = 0;
  private commitCounter = 0;

  constructor() {
    this.setupDefaultResponses();
  }

  private setupDefaultResponses() {
    // Default successful responses for test-repo
    this.responses.set('GET:/repos/test-owner/test-repo', GITHUB_API_RESPONSES.repository);
    this.responses.set(
      'GET:/repos/test-owner/test-repo/branches/main',
      GITHUB_API_RESPONSES.branch
    );
    this.responses.set('GET:/repos/test-owner/test-repo/git/refs/heads/main', {
      object: { sha: GITHUB_API_RESPONSES.commit.sha },
    });
    this.responses.set(
      'GET:/repos/test-owner/test-repo/git/commits/abc123def456',
      GITHUB_API_RESPONSES.commit
    );
    this.responses.set(
      'GET:/repos/test-owner/test-repo/git/trees/tree123',
      GITHUB_API_RESPONSES.tree
    );

    // Also set up responses for feature-repo
    this.responses.set('GET:/repos/test-owner/feature-repo', {
      ...GITHUB_API_RESPONSES.repository,
      name: 'feature-repo',
    });
    this.responses.set('GET:/repos/test-owner/feature-repo/git/refs/heads/main', {
      object: { sha: GITHUB_API_RESPONSES.commit.sha },
    });
    this.responses.set(
      'GET:/repos/test-owner/feature-repo/git/commits/abc123def456',
      GITHUB_API_RESPONSES.commit
    );
    this.responses.set(
      'GET:/repos/test-owner/feature-repo/git/trees/tree123',
      GITHUB_API_RESPONSES.tree
    );

    // Rate limit
    this.responses.set('GET:/rate_limit', this.rateLimitState);
  }

  async request<T = unknown>(method: string, endpoint: string, data?: unknown): Promise<T> {
    // Record the request
    this.requestHistory.push({ method, path: endpoint, body: data });

    // Simulate network delay if configured
    if (this.requestDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.requestDelay));
    }

    // Throw error if configured
    if (this.shouldThrowError) {
      throw this.shouldThrowError;
    }

    // Handle rate limit checks
    if (endpoint === '/rate_limit') {
      // Check if we should simulate rate limit reset
      const now = FIXED_UNIX_TIME;
      if (this.rateLimitState.resources.core.reset <= now && this.rateLimitBehavior !== 'normal') {
        // Reset has passed, restore rate limit
        this.resetRateLimit();
      }

      // Return rate limit based on configured behavior
      if (this.rateLimitBehavior === 'exceeded') {
        return {
          resources: {
            core: {
              limit: 5000,
              remaining: 0,
              reset: this.rateLimitState.resources.core.reset,
            },
          },
        } as T;
      } else if (this.rateLimitBehavior === 'limited') {
        return {
          resources: {
            core: {
              limit: 5000,
              remaining: Math.max(0, this.rateLimitState.resources.core.remaining),
              reset: this.rateLimitState.resources.core.reset,
            },
          },
        } as T;
      }
      return this.rateLimitState as T;
    }

    // Handle blob creation
    if (method === 'POST' && endpoint.includes('/git/blobs')) {
      // Only simulate rate limit if explicitly configured for rate limit testing
      if (this.rateLimitBehavior === 'limited') {
        this.rateLimitState.resources.core.remaining--;

        if (this.rateLimitState.resources.core.remaining < 0) {
          const error = new Error('API rate limit exceeded') as Error & { status?: number };
          error.status = 403;
          throw error;
        }
      }

      // Generate consistent SHA based on content
      const blobData = data as { content: string; encoding: string };
      const contentKey = blobData.content || '';
      let sha = this.blobShaMap.get(contentKey);
      if (!sha) {
        sha = `blob-${this.blobShaMap.size + 1}`;
        this.blobShaMap.set(contentKey, sha);
      }

      return { sha } as T;
    }

    // Handle tree creation
    if (method === 'POST' && endpoint.includes('/git/trees')) {
      return { sha: `tree-${this.treeCounter++}` } as T;
    }

    // Handle commit creation
    if (method === 'POST' && endpoint.includes('/git/commits')) {
      return { sha: `commit-${this.commitCounter++}` } as T;
    }

    // Handle ref update
    if (method === 'PATCH' && endpoint.includes('/git/refs/heads/')) {
      const requestData = data as Record<string, unknown>;
      return { object: { sha: requestData?.sha } } as T;
    }

    // Handle branch creation
    if (method === 'POST' && endpoint.includes('/git/refs')) {
      const requestData = data as Record<string, unknown>;
      return { ref: requestData?.ref, object: { sha: requestData?.sha } } as T;
    }

    // Return configured response
    const key = `${method}:${endpoint}`;
    if (this.responses.has(key)) {
      const response = this.responses.get(key);
      if (typeof response === 'function') {
        return response(method, endpoint, data) as T;
      }
      return response as T;
    }

    // Handle branch checks - return 404 for non-main branches to simulate branch creation scenario
    if (method === 'GET' && endpoint.includes('/branches/') && !endpoint.includes('/main')) {
      const error = new Error('Not Found') as Error & { status?: number };
      error.status = 404;
      throw error;
    }

    // Handle branch existence check via refs API
    if (method === 'GET' && endpoint.includes('/git/refs/heads/') && !endpoint.includes('/main')) {
      // Return 404 to simulate branch doesn't exist, but don't break the flow
      const error = new Error('Not Found') as Error & { status?: number };
      error.status = 404;
      throw error;
    }

    // Handle successful ref checks for main branch
    if (method === 'GET' && endpoint.includes('/git/refs/heads/main')) {
      return { ref: 'refs/heads/main', object: { sha: 'abc123' } } as T;
    }

    // Handle repo checks
    if (method === 'GET' && endpoint.match(/^\/repos\/[^/]+\/[^/]+$/)) {
      return {
        name: endpoint.split('/').pop(),
        owner: { login: endpoint.split('/')[2] },
        default_branch: 'main',
      } as T;
    }

    // Handle contents checks (for empty repo detection)
    if (method === 'GET' && endpoint.includes('/contents/')) {
      return [] as T; // Empty contents
    }

    // Default 404 for unknown paths
    const error = new Error('Not Found') as Error & { status?: number };
    error.status = 404;
    throw error;
  }

  async ensureRepoExists(owner: string, repo: string): Promise<GitHubRepository> {
    const response = await this.request<GitHubRepository>('GET', `/repos/${owner}/${repo}`);
    if (!response) {
      const error = new Error('Repository not found') as Error & { status?: number };
      error.status = 404;
      throw error;
    }
    return response;
  }

  async isRepoEmpty(owner: string, repo: string): Promise<boolean> {
    try {
      const result = await this.request<{ object?: { sha: string } }>(
        'GET',
        `/repos/${owner}/${repo}/git/refs/heads/main`
      );
      return !result || !result.object;
    } catch {
      return true;
    }
  }

  async initializeEmptyRepo(owner: string, repo: string, branch: string): Promise<void> {
    // Simulate repo initialization - create initial commit
    const initialCommitSha = 'initial-commit-sha';
    const initialTreeSha = 'initial-tree-sha';

    // Set up responses for initialized repo
    this.responses.set(`GET:/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      object: { sha: initialCommitSha },
    });
    this.responses.set(`GET:/repos/${owner}/${repo}/git/commits/${initialCommitSha}`, {
      sha: initialCommitSha,
      tree: { sha: initialTreeSha },
      parents: [],
      message: 'Initial commit',
    });
    this.responses.set(`GET:/repos/${owner}/${repo}/git/trees/${initialTreeSha}`, {
      sha: initialTreeSha,
      tree: [],
    });
  }

  // Test helper methods
  setResponse(method: string, path: string, response: MockResponse) {
    this.responses.set(`${method}:${path}`, response);
  }

  setError(error: Error) {
    this.shouldThrowError = error;
  }

  clearError() {
    this.shouldThrowError = null;
  }

  setDelay(ms: number) {
    this.requestDelay = ms;
  }

  setRateLimit(remaining: number, reset?: number) {
    this.rateLimitState.resources.core.remaining = remaining;
    if (reset) {
      this.rateLimitState.resources.core.reset = reset;
    }
    // Set rate limit behavior based on remaining count
    if (remaining === 0) {
      this.rateLimitBehavior = 'exceeded';
    } else if (remaining < 50) {
      this.rateLimitBehavior = 'limited';
    } else {
      this.rateLimitBehavior = 'normal';
    }
  }

  resetRateLimit() {
    this.rateLimitState = { ...GITHUB_API_RESPONSES.rateLimit };
    this.rateLimitBehavior = 'normal';
  }

  clearHistory() {
    this.requestHistory = [];
  }

  getRequestCount(method?: string, pathPattern?: string) {
    return this.requestHistory.filter((req) => {
      const methodMatch = !method || req.method === method;
      const pathMatch = !pathPattern || req.path.includes(pathPattern);
      return methodMatch && pathMatch;
    }).length;
  }

  getRequestHistory(method?: string, pathPattern?: string) {
    return this.requestHistory
      .filter((req) => {
        const methodMatch = !method || req.method === method;
        const pathMatch = !pathPattern || req.path.includes(pathPattern);
        return methodMatch && pathMatch;
      })
      .map((req) => ({
        method: req.method,
        path: req.path,
        body: req.body,
        response: this.getMockResponseForRequest(req),
      }));
  }

  private getMockResponseForRequest(req: RequestHistoryEntry) {
    // Return the mock response that would have been returned for this request
    if (req.method === 'POST' && req.path.includes('/git/blobs')) {
      const blobData = req.body as { content: string; encoding: string };
      const contentKey = blobData?.content || '';
      const sha = this.blobShaMap.get(contentKey) || `blob-unknown`;
      return { sha };
    }
    if (req.method === 'POST' && req.path.includes('/git/trees')) {
      return { sha: `tree-${this.treeCounter}` };
    }
    if (req.method === 'POST' && req.path.includes('/git/commits')) {
      return { sha: `commit-${this.commitCounter}` };
    }
    return {};
  }
}

/**
 * Mock GitHubComparisonService with controlled comparison results
 */
export class MockGitHubComparisonService {
  private comparisonResult = COMPARISON_RESULTS.withChanges;
  private shouldThrowError: Error | null = null;
  private progressCallbacks: Array<{ message: string; progress: number }> = [];

  setGitHubService(): void {
    // No-op for mock
  }

  async compareWithGitHub(
    localFiles: ProjectFiles,
    repoOwner: string,
    repoName: string,
    targetBranch: string,
    progressCallback?: (message: string, progress: number) => void
  ) {
    // Record progress callbacks
    const trackProgress = (message: string, progress: number) => {
      this.progressCallbacks.push({ message, progress });
      if (progressCallback) {
        progressCallback(message, progress);
      }
    };

    trackProgress('Starting comparison...', 0);

    if (this.shouldThrowError) {
      throw this.shouldThrowError;
    }

    trackProgress('Analyzing files...', 50);
    trackProgress('Comparison complete', 100);

    return this.comparisonResult;
  }

  // Test helper methods
  setComparisonResult(result: typeof COMPARISON_RESULTS.withChanges) {
    this.comparisonResult = result;
  }

  setError(error: Error) {
    this.shouldThrowError = error;
  }

  clearError() {
    this.shouldThrowError = null;
  }

  getProgressHistory() {
    return [...this.progressCallbacks];
  }

  clearHistory() {
    this.progressCallbacks = [];
  }
}

/**
 * Mock status callback to track upload status updates
 */
export class MockStatusCallback {
  private statusHistory: UploadStatusState[] = [];
  private callback: (status: UploadStatusState) => void;

  constructor() {
    this.callback = (status: UploadStatusState) => {
      this.statusHistory.push({ ...status });
    };
  }

  getCallback() {
    return this.callback;
  }

  getHistory() {
    return [...this.statusHistory];
  }

  getLastStatus() {
    return this.statusHistory[this.statusHistory.length - 1];
  }

  findStatus(predicate: (status: UploadStatusState) => boolean) {
    return this.statusHistory.find(predicate);
  }

  clear() {
    this.statusHistory = [];
  }

  expectSequence(expectedStatuses: Partial<UploadStatusState>[]) {
    const actualStatuses = this.statusHistory;

    for (let i = 0; i < expectedStatuses.length; i++) {
      const expected = expectedStatuses[i];
      const actual = actualStatuses[i];

      if (!actual) {
        throw new Error(`Expected status at index ${i} but got undefined`);
      }

      for (const [key, value] of Object.entries(expected)) {
        if (actual[key as keyof UploadStatusState] !== value) {
          throw new Error(
            `Status mismatch at index ${i}: expected ${key}=${value}, got ${actual[key as keyof UploadStatusState]}`
          );
        }
      }
    }
  }
}

/**
 * Mock Chrome storage API
 */
export class MockChromeStorage {
  private data: ChromeStorageData = {};

  async get(keys: string | string[]): Promise<ChromeStorageData> {
    if (typeof keys === 'string') {
      return { [keys]: this.data[keys] };
    }

    const result: ChromeStorageData = {};
    for (const key of keys) {
      if (key in this.data) {
        result[key] = this.data[key];
      }
    }
    return result;
  }

  async set(items: ChromeStorageData): Promise<void> {
    Object.assign(this.data, items);
  }

  setData(data: ChromeStorageData) {
    this.data = { ...data };
  }

  getData(): ChromeStorageData {
    return { ...this.data };
  }

  clear() {
    this.data = {};
  }
}

/**
 * Mock ZipProcessor for controlled ZIP processing
 */
export class MockZipProcessor {
  private processResult: Map<string, string> | null = null;
  private shouldThrowError: Error | null = null;

  static async processZipBlob(blob: Blob): Promise<Map<string, string>> {
    // For testing, parse the blob content as JSON
    try {
      const text = await blob.text();
      const entries = JSON.parse(text);
      return new Map(entries);
    } catch {
      throw new Error('Failed to process ZIP file: Invalid ZIP data');
    }
  }

  setProcessResult(result: Map<string, string>) {
    this.processResult = result;
  }

  setError(error: Error) {
    this.shouldThrowError = error;
  }
}

/**
 * Mock push statistics actions
 */
export class MockPushStatisticsActions {
  private records: Array<{
    action: string;
    projectId: string;
    repoOwner: string;
    repoName: string;
    branch: string;
    filesCount?: number;
    commitMessage?: string;
    error?: string;
  }> = [];

  async recordPushAttempt(
    projectId: string,
    repoOwner: string,
    repoName: string,
    branch: string,
    filesCount: number,
    commitMessage: string
  ) {
    this.records.push({
      action: 'attempt',
      projectId,
      repoOwner,
      repoName,
      branch,
      filesCount,
      commitMessage,
    });
  }

  async recordPushSuccess(projectId: string, repoOwner: string, repoName: string, branch: string) {
    this.records.push({
      action: 'success',
      projectId,
      repoOwner,
      repoName,
      branch,
    });
  }

  async recordPushFailure(
    projectId: string,
    repoOwner: string,
    repoName: string,
    branch: string,
    error: string
  ) {
    this.records.push({
      action: 'failure',
      projectId,
      repoOwner,
      repoName,
      branch,
      error,
    });
  }

  getRecords() {
    return [...this.records];
  }

  getLastRecord() {
    return this.records[this.records.length - 1];
  }

  clear() {
    this.records = [];
  }
}
