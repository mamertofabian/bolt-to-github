import type { UnifiedGitHubService } from '../../UnifiedGitHubService';
import type { GitHubComparisonService } from '../../GitHubComparisonService';
import type { UploadStatusState, ProjectFiles } from '$lib/types';
import { GITHUB_API_RESPONSES, COMPARISON_RESULTS } from './ZipHandlerTestFixtures';

/**
 * Test doubles for ZipHandler dependencies
 * Provides controlled implementations that accurately reflect real behavior
 */

/**
 * Mock UnifiedGitHubService with configurable responses
 */
export class MockUnifiedGitHubService implements Partial<UnifiedGitHubService> {
  private responses: Map<string, any> = new Map();
  private requestHistory: Array<{ method: string; path: string; body?: any }> = [];
  private shouldThrowError: Error | null = null;
  private requestDelay: number = 0;
  private rateLimitState = { ...GITHUB_API_RESPONSES.rateLimit };

  constructor() {
    this.setupDefaultResponses();
  }

  private setupDefaultResponses() {
    // Default successful responses
    this.responses.set('GET:/repos/test-owner/test-repo', GITHUB_API_RESPONSES.repository);
    this.responses.set('GET:/repos/test-owner/test-repo/branches/main', GITHUB_API_RESPONSES.branch);
    this.responses.set('GET:/repos/test-owner/test-repo/git/refs/heads/main', {
      object: { sha: GITHUB_API_RESPONSES.commit.sha },
    });
    this.responses.set('GET:/repos/test-owner/test-repo/git/commits/abc123def456', GITHUB_API_RESPONSES.commit);
    this.responses.set('GET:/repos/test-owner/test-repo/git/trees/tree123', GITHUB_API_RESPONSES.tree);
    this.responses.set('GET:/rate_limit', this.rateLimitState);
  }

  async request(method: string, path: string, body?: any): Promise<any> {
    // Record the request
    this.requestHistory.push({ method, path, body });

    // Simulate network delay if configured
    if (this.requestDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.requestDelay));
    }

    // Throw error if configured
    if (this.shouldThrowError) {
      throw this.shouldThrowError;
    }

    // Handle rate limit checks
    if (path === '/rate_limit') {
      return this.rateLimitState;
    }

    // Handle blob creation
    if (method === 'POST' && path.includes('/git/blobs')) {
      // Decrement rate limit
      this.rateLimitState.resources.core.remaining--;
      
      // Simulate rate limit error if exhausted
      if (this.rateLimitState.resources.core.remaining < 0) {
        const error = new Error('API rate limit exceeded') as Error & { status?: number };
        error.status = 403;
        throw error;
      }

      return { sha: `blob-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    }

    // Handle tree creation
    if (method === 'POST' && path.includes('/git/trees')) {
      return { sha: `tree-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    }

    // Handle commit creation
    if (method === 'POST' && path.includes('/git/commits')) {
      return { sha: `commit-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    }

    // Handle ref update
    if (method === 'PATCH' && path.includes('/git/refs/heads/')) {
      return { object: { sha: body.sha } };
    }

    // Handle branch creation
    if (method === 'POST' && path.includes('/git/refs')) {
      return { ref: body.ref, object: { sha: body.sha } };
    }

    // Return configured response
    const key = `${method}:${path}`;
    if (this.responses.has(key)) {
      return this.responses.get(key);
    }

    // Handle branch not found
    if (path.includes('/branches/') && !path.includes('/main')) {
      const error = new Error('Not Found') as Error & { status?: number };
      error.status = 404;
      throw error;
    }

    // Default 404 for unknown paths
    const error = new Error('Not Found') as Error & { status?: number };
    error.status = 404;
    throw error;
  }

  async ensureRepoExists(owner: string, repo: string): Promise<void> {
    const response = await this.request('GET', `/repos/${owner}/${repo}`);
    if (!response) {
      throw new Error('Repository not found');
    }
  }

  async isRepoEmpty(owner: string, repo: string): Promise<boolean> {
    try {
      await this.request('GET', `/repos/${owner}/${repo}/git/refs/heads/main`);
      return false;
    } catch {
      return true;
    }
  }

  async initializeEmptyRepo(owner: string, repo: string, branch: string): Promise<void> {
    // Simulate repo initialization
    this.responses.set(`GET:/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      object: { sha: 'initial-sha' },
    });
  }

  // Test helper methods
  setResponse(method: string, path: string, response: any) {
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
  }

  getRequestHistory() {
    return [...this.requestHistory];
  }

  clearHistory() {
    this.requestHistory = [];
  }

  getRequestCount(method?: string, pathPattern?: string) {
    return this.requestHistory.filter(req => {
      const methodMatch = !method || req.method === method;
      const pathMatch = !pathPattern || req.path.includes(pathPattern);
      return methodMatch && pathMatch;
    }).length;
  }
}

/**
 * Mock GitHubComparisonService with controlled comparison results
 */
export class MockGitHubComparisonService {
  private comparisonResult = COMPARISON_RESULTS.withChanges;
  private shouldThrowError: Error | null = null;
  private progressCallbacks: Array<{ message: string; progress: number }> = [];

  setGitHubService(service: any): void {
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
  private data: Record<string, any> = {};

  async get(keys: string | string[]): Promise<Record<string, any>> {
    if (typeof keys === 'string') {
      return { [keys]: this.data[keys] };
    }
    
    const result: Record<string, any> = {};
    for (const key of keys) {
      if (key in this.data) {
        result[key] = this.data[key];
      }
    }
    return result;
  }

  async set(items: Record<string, any>): Promise<void> {
    Object.assign(this.data, items);
  }

  setData(data: Record<string, any>) {
    this.data = { ...data };
  }

  getData() {
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

  async recordPushSuccess(
    projectId: string,
    repoOwner: string,
    repoName: string,
    branch: string
  ) {
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