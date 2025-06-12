/**
 * Comprehensive test fixtures for TempRepoManager.ts
 *
 * This file provides realistic test data, mock implementations, and helper functions
 * designed to reveal actual usage patterns and potential bugs in TempRepoManager.
 */

import type { UploadStatusState } from '../../lib/types';
import type { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
import type { OperationStateManager } from '../../content/services/OperationStateManager';
import { STORAGE_KEY } from '../TempRepoManager';

// =============================================================================
// REALISTIC TEST DATA
// =============================================================================

export const TempRepoTestData = {
  // Repository configurations
  repositories: {
    validSourceRepo: 'my-private-project',
    emptySourceRepo: '',
    longSourceRepo: 'a'.repeat(100), // GitHub max repo name is 100 chars
    specialCharsRepo: 'repo-with_special.chars',
    unicodeRepo: 'проект-репозиторий',

    validTempRepo: 'temp-my-private-project-20240101-abc123',
    existingTempRepo: 'temp-existing-project-20231215-def456',
    failedDeleteRepo: 'temp-failed-delete-20231220-ghi789',
  },

  // User/Owner data
  owners: {
    validOwner: 'testuser',
    emptyOwner: '',
    longOwner: 'a'.repeat(40), // GitHub max username length
    nonExistentOwner: 'user-that-does-not-exist',
  },

  // Branch configurations
  branches: {
    main: 'main',
    master: 'master',
    develop: 'develop',
    featureBranch: 'feature/new-authentication',
    emptyBranch: '',
    nonExistentBranch: 'branch-that-does-not-exist',
    specialCharsBranch: 'feature/fix-issue-#123',
  },

  // GitHub API branch responses
  branchResponses: {
    mainDefault: [
      { name: 'main', isDefault: true },
      { name: 'develop', isDefault: false },
      { name: 'feature/auth', isDefault: false },
    ],
    masterDefault: [
      { name: 'master', isDefault: true },
      { name: 'staging', isDefault: false },
    ],
    noBranches: [],
    singleBranch: [{ name: 'main', isDefault: true }],
    multipleBranches: [
      { name: 'main', isDefault: true },
      { name: 'develop', isDefault: false },
      { name: 'staging', isDefault: false },
      { name: 'feature/auth', isDefault: false },
      { name: 'feature/payments', isDefault: false },
    ],
  },

  // Time-based test data
  timestamps: {
    now: Date.now(),
    oneMinuteAgo: Date.now() - 60 * 1000,
    twoMinutesAgo: Date.now() - 2 * 60 * 1000,
    oneHourAgo: Date.now() - 60 * 60 * 1000,
    oneDayAgo: Date.now() - 24 * 60 * 60 * 1000,
    justCreated: Date.now() - 5 * 1000, // 5 seconds ago
    aboutToExpire: Date.now() - 55 * 1000, // 55 seconds ago (expires at 60s)
    expired: Date.now() - 65 * 1000, // 65 seconds ago (already expired)
  },

  // Storage states
  storage: {
    empty: {},
    singleRepo: {
      [STORAGE_KEY]: [
        {
          originalRepo: 'my-private-project',
          tempRepo: 'temp-my-private-project-20240101-abc123',
          createdAt: Date.now() - 30 * 1000, // 30 seconds ago
          owner: 'testuser',
          branch: 'main',
        },
      ],
    },
    multipleRepos: {
      [STORAGE_KEY]: [
        {
          originalRepo: 'project-one',
          tempRepo: 'temp-project-one-20240101-abc123',
          createdAt: Date.now() - 30 * 1000,
          owner: 'testuser',
          branch: 'main',
        },
        {
          originalRepo: 'project-two',
          tempRepo: 'temp-project-two-20240101-def456',
          createdAt: Date.now() - 45 * 1000,
          owner: 'testuser',
          branch: 'develop',
        },
        {
          originalRepo: 'project-three',
          tempRepo: 'temp-project-three-20240101-ghi789',
          createdAt: Date.now() - 70 * 1000, // Expired
          owner: 'testuser',
          branch: 'feature/auth',
        },
      ],
    },
    expiredRepos: {
      [STORAGE_KEY]: [
        {
          originalRepo: 'old-project-one',
          tempRepo: 'temp-old-project-one-20231220-old123',
          createdAt: Date.now() - 2 * 60 * 1000, // 2 minutes ago (expired)
          owner: 'testuser',
          branch: 'main',
        },
        {
          originalRepo: 'old-project-two',
          tempRepo: 'temp-old-project-two-20231220-old456',
          createdAt: Date.now() - 3 * 60 * 1000, // 3 minutes ago (expired)
          owner: 'testuser',
          branch: 'master',
        },
      ],
    },
    corruptedStorage: {
      [STORAGE_KEY]: 'invalid-data-not-array',
    },
    mixedAgeRepos: {
      [STORAGE_KEY]: [
        {
          originalRepo: 'fresh-project',
          tempRepo: 'temp-fresh-project-20240101-fresh1',
          createdAt: Date.now() - 10 * 1000, // Fresh
          owner: 'testuser',
          branch: 'main',
        },
        {
          originalRepo: 'about-to-expire',
          tempRepo: 'temp-about-to-expire-20240101-expire1',
          createdAt: Date.now() - 55 * 1000, // About to expire
          owner: 'testuser',
          branch: 'main',
        },
        {
          originalRepo: 'expired-project',
          tempRepo: 'temp-expired-project-20240101-expired1',
          createdAt: Date.now() - 75 * 1000, // Already expired
          owner: 'testuser',
          branch: 'main',
        },
      ],
    },
  },

  // Error scenarios - Use getters to create fresh instances
  errors: {
    get githubApiError() {
      return new Error('GitHub API Error: Repository not found');
    },
    get rateLimitError() {
      return new Error('GitHub API Error: Rate limit exceeded');
    },
    get authenticationError() {
      return new Error('GitHub authentication failed - invalid token');
    },
    get networkError() {
      return new Error('Network request failed - timeout');
    },
    get storageError() {
      return new Error('Chrome storage unavailable');
    },
    get repoCreationError() {
      return new Error('Failed to create temporary repository');
    },
    get repoDeleteError() {
      return new Error('Failed to delete repository - not found');
    },
    get branchNotFoundError() {
      return new Error('Branch not found');
    },
    get permissionError() {
      return new Error('Insufficient permissions to access repository');
    },
    get repoVisibilityError() {
      return new Error('Failed to update repository visibility');
    },
    get cloneError() {
      return new Error('Failed to clone repository contents');
    },
  },

  // Progress scenarios
  progress: {
    start: 10,
    tempRepoCreated: 30,
    contentCopying: 70,
    makingPublic: 90,
    complete: 100,
    progressSteps: [0, 25, 50, 75, 100], // For testing progress callbacks
  },

  // Performance data
  performance: {
    fastOperation: 100, // 100ms
    normalOperation: 1000, // 1 second
    slowOperation: 5000, // 5 seconds
    verySlowOperation: 30000, // 30 seconds (timeout scenario)
    cleanupInterval: 30 * 1000, // 30 seconds
    maxAge: 60 * 1000, // 60 seconds
  },
};

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

export class MockUnifiedGitHubService implements Partial<UnifiedGitHubService> {
  private shouldFail = false;
  private failureMode:
    | 'listBranches'
    | 'createRepo'
    | 'cloneContents'
    | 'updateVisibility'
    | 'deleteRepo'
    | 'all' = 'all';
  private delay = 0;
  private deleteFailureRepos = new Set<string>();
  private progressCallbacks = new Map<string, (progress: number) => void>();

  // Mock method declarations - properly initialized
  listBranches = jest.fn(async (owner: string, repo: string) => {
    return this._listBranches(owner, repo);
  });

  createTemporaryPublicRepo = jest.fn(
    async (owner: string, sourceRepo: string, branch?: string) => {
      return this._createTemporaryPublicRepo(owner, sourceRepo, branch);
    }
  );

  cloneRepoContents = jest.fn(
    async (
      sourceOwner: string,
      sourceRepo: string,
      targetOwner: string,
      targetRepo: string,
      branch: string,
      onProgress?: (progress: number) => void
    ) => {
      return this._cloneRepoContents(
        sourceOwner,
        sourceRepo,
        targetOwner,
        targetRepo,
        branch,
        onProgress
      );
    }
  );

  updateRepoVisibility = jest.fn(async (owner: string, repo: string, isPrivate: boolean) => {
    return this._updateRepoVisibility(owner, repo, isPrivate);
  });

  deleteRepo = jest.fn(async (owner: string, repo: string) => {
    return this._deleteRepo(owner, repo);
  });

  // Test configuration methods
  setShouldFail(shouldFail: boolean, mode: typeof this.failureMode = 'all'): void {
    this.shouldFail = shouldFail;
    this.failureMode = mode;
  }

  setDelay(delay: number): void {
    this.delay = delay;
  }

  setDeleteFailureRepos(repos: string[]): void {
    this.deleteFailureRepos = new Set(repos);
  }

  private async simulateDelay(): Promise<void> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }
  }

  private shouldFailOperation(operation: string): boolean {
    return this.shouldFail && (this.failureMode === 'all' || this.failureMode === operation);
  }

  private async _listBranches(
    owner: string,
    repo: string
  ): Promise<Array<{ name: string; isDefault: boolean }>> {
    await this.simulateDelay();

    if (this.shouldFailOperation('listBranches')) {
      throw TempRepoTestData.errors.branchNotFoundError;
    }

    // Return realistic branch data based on repo name
    if (repo.includes('master')) {
      return TempRepoTestData.branchResponses.masterDefault;
    } else if (repo.includes('multiple')) {
      return TempRepoTestData.branchResponses.multipleBranches;
    } else if (repo.includes('single')) {
      return TempRepoTestData.branchResponses.singleBranch;
    } else if (repo.includes('empty')) {
      return TempRepoTestData.branchResponses.noBranches;
    }

    return TempRepoTestData.branchResponses.mainDefault;
  }

  private async _createTemporaryPublicRepo(
    owner: string,
    sourceRepo: string,
    branch?: string
  ): Promise<string> {
    await this.simulateDelay();

    if (this.shouldFailOperation('createRepo')) {
      throw TempRepoTestData.errors.repoCreationError;
    }

    // Generate realistic temp repo name
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomId = Math.random().toString(36).substring(2, 8);
    return `temp-${sourceRepo}-${timestamp}-${randomId}`;
  }

  private async _cloneRepoContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    await this.simulateDelay();

    if (this.shouldFailOperation('cloneContents')) {
      throw TempRepoTestData.errors.cloneError;
    }

    // Simulate progress updates
    if (onProgress) {
      this.progressCallbacks.set(targetRepo, onProgress);

      // Simulate realistic progress steps
      for (let i = 0; i <= 100; i += 20) {
        await new Promise((resolve) => setTimeout(resolve, 50)); // Small delay between updates
        onProgress(i);
      }
    }
  }

  private async _updateRepoVisibility(
    owner: string,
    repo: string,
    isPrivate: boolean
  ): Promise<void> {
    await this.simulateDelay();

    if (this.shouldFailOperation('updateVisibility')) {
      throw TempRepoTestData.errors.repoVisibilityError;
    }
  }

  private async _deleteRepo(owner: string, repo: string): Promise<void> {
    await this.simulateDelay();

    if (this.shouldFailOperation('deleteRepo') || this.deleteFailureRepos.has(repo)) {
      throw TempRepoTestData.errors.repoDeleteError;
    }
  }

  // Test helpers
  getProgressCallback(repo: string): ((progress: number) => void) | undefined {
    return this.progressCallbacks.get(repo);
  }

  clearProgressCallbacks(): void {
    this.progressCallbacks.clear();
  }
}

export class MockOperationStateManager implements Partial<OperationStateManager> {
  private operations = new Map<
    string,
    {
      type: string;
      status: 'started' | 'completed' | 'failed';
      description: string;
      metadata?: any;
      error?: Error;
      startTime: number;
    }
  >();
  private shouldFail = false;

  static getInstance = jest.fn(() => new MockOperationStateManager());

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  startOperation = jest.fn(
    async (
      type: string,
      operationId: string,
      description: string,
      metadata?: any
    ): Promise<void> => {
      if (this.shouldFail) {
        throw new Error('Failed to start operation tracking');
      }

      this.operations.set(operationId, {
        type,
        status: 'started',
        description,
        metadata,
        startTime: Date.now(),
      });
    }
  );

  completeOperation = jest.fn(async (operationId: string): Promise<void> => {
    if (this.shouldFail) {
      throw new Error('Failed to complete operation tracking');
    }

    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = 'completed';
    }
  });

  failOperation = jest.fn(async (operationId: string, error: Error): Promise<void> => {
    if (this.shouldFail) {
      throw new Error('Failed to record operation failure');
    }

    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = 'failed';
      operation.error = error;
    }
  });

  // Test helpers
  getOperation(operationId: string): any {
    return this.operations.get(operationId);
  }

  getAllOperations(): Array<{ id: string; operation: any }> {
    return Array.from(this.operations.entries()).map(([id, operation]) => ({ id, operation }));
  }

  getOperationCount(): number {
    return this.operations.size;
  }

  getOperationsByStatus(
    status: 'started' | 'completed' | 'failed'
  ): Array<{ id: string; operation: any }> {
    return this.getAllOperations().filter(({ operation }) => operation.status === status);
  }

  clear(): void {
    this.operations.clear();
  }
}

export class TempRepoMockChromeStorage {
  private localData: Record<string, any> = {};
  private shouldFail = false;
  private delay = 0;

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setDelay(delay: number): void {
    this.delay = delay;
  }

  private async simulateDelay(): Promise<void> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }
  }

  local = {
    get: jest.fn(async (keys?: string | string[] | null) => {
      await this.simulateDelay();

      if (this.shouldFail) {
        throw TempRepoTestData.errors.storageError;
      }

      if (!keys) return { ...this.localData };
      if (typeof keys === 'string') return { [keys]: this.localData[keys] };
      if (Array.isArray(keys)) {
        const result: Record<string, any> = {};
        keys.forEach((key) => {
          if (key in this.localData) result[key] = this.localData[key];
        });
        return result;
      }
      return {};
    }),

    set: jest.fn(async (items: Record<string, any>) => {
      await this.simulateDelay();

      if (this.shouldFail) {
        throw TempRepoTestData.errors.storageError;
      }

      Object.assign(this.localData, items);
    }),

    remove: jest.fn(async (keys: string | string[]) => {
      await this.simulateDelay();

      if (this.shouldFail) {
        throw TempRepoTestData.errors.storageError;
      }

      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach((key) => delete this.localData[key]);
    }),
  };

  // Test helpers
  setLocalData(data: Record<string, any>): void {
    this.localData = { ...data };
  }

  getLocalData(): Record<string, any> {
    return { ...this.localData };
  }

  reset(): void {
    this.localData = {};
    this.shouldFail = false;
    this.delay = 0;
  }
}

export class TempRepoMockChromeTabs {
  private shouldFail = false;
  private createdTabs: Array<{ url: string; active: boolean }> = [];

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  create = jest.fn(
    async (createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> => {
      if (this.shouldFail) {
        throw new Error('Failed to create tab');
      }

      const tab: chrome.tabs.Tab = {
        id: Math.floor(Math.random() * 1000) + 1,
        url: createProperties.url,
        active: createProperties.active ?? false,
        highlighted: false,
        pinned: false,
        selected: false,
        incognito: false,
        width: 1200,
        height: 800,
        index: 0,
        windowId: 1,
        discarded: false,
        autoDiscardable: false,
        groupId: -1,
      };

      this.createdTabs.push({
        url: createProperties.url || '',
        active: createProperties.active ?? false,
      });

      return tab;
    }
  );

  // Test helpers
  getCreatedTabs(): Array<{ url: string; active: boolean }> {
    return [...this.createdTabs];
  }

  getLastCreatedTab(): { url: string; active: boolean } | undefined {
    return this.createdTabs[this.createdTabs.length - 1];
  }

  reset(): void {
    this.createdTabs = [];
    this.shouldFail = false;
  }
}

// =============================================================================
// STATUS BROADCAST MOCK
// =============================================================================

export class MockStatusBroadcaster {
  private statusHistory: UploadStatusState[] = [];
  private shouldFail = false;

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  broadcast = jest.fn((status: UploadStatusState): void => {
    if (this.shouldFail) {
      throw new Error('Failed to broadcast status');
    }

    this.statusHistory.push({ ...status });
  });

  // Test helpers
  getStatusHistory(): UploadStatusState[] {
    return [...this.statusHistory];
  }

  getLastStatus(): UploadStatusState | undefined {
    return this.statusHistory[this.statusHistory.length - 1];
  }

  getStatusByType(status: UploadStatusState['status']): UploadStatusState[] {
    return this.statusHistory.filter((s) => s.status === status);
  }

  getProgressSteps(): number[] {
    return this.statusHistory.map((s) => s.progress || 0);
  }

  reset(): void {
    this.statusHistory = [];
    this.shouldFail = false;
  }
}

// =============================================================================
// TEST ENVIRONMENT SETUP
// =============================================================================

export class TempRepoManagerTestEnvironment {
  public mockGitHubService: MockUnifiedGitHubService;
  public mockOperationStateManager: MockOperationStateManager;
  public mockStorage: TempRepoMockChromeStorage;
  public mockTabs: TempRepoMockChromeTabs;
  public mockStatusBroadcaster: MockStatusBroadcaster;

  private originalChrome: any;
  private originalSetInterval: any;
  private originalClearInterval: any;
  private originalConsole: any;

  constructor() {
    this.mockGitHubService = new MockUnifiedGitHubService();
    this.mockStorage = new TempRepoMockChromeStorage();
    this.mockTabs = new TempRepoMockChromeTabs();
    this.mockStatusBroadcaster = new MockStatusBroadcaster();

    // Get the mocked OperationStateManager module
    const { OperationStateManager: MockedOperationStateManager } = jest.requireMock(
      '../../content/services/OperationStateManager'
    );

    // Create our test instance and configure the mock to return it
    this.mockOperationStateManager = new MockOperationStateManager();
    MockedOperationStateManager.getInstance = jest.fn(() => this.mockOperationStateManager);
  }

  setup(): void {
    // Store originals
    this.originalChrome = (global as any).chrome;
    this.originalSetInterval = global.setInterval;
    this.originalClearInterval = global.clearInterval;
    this.originalConsole = global.console;

    // Mock Chrome APIs
    (global as any).chrome = {
      storage: this.mockStorage,
      tabs: this.mockTabs,
    };

    // Mock console to avoid noise in tests
    global.console = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Don't mock timers by default, let individual tests control this
    // jest.useFakeTimers();
  }

  teardown(): void {
    // Restore originals
    (global as any).chrome = this.originalChrome;
    global.setInterval = this.originalSetInterval;
    global.clearInterval = this.originalClearInterval;
    global.console = this.originalConsole;

    // Reset all mocks
    jest.clearAllMocks();
    jest.useRealTimers();

    // Reset all mock services
    this.mockGitHubService.clearProgressCallbacks();
    this.mockOperationStateManager.clear();
    this.mockStorage.reset();
    this.mockTabs.reset();
    this.mockStatusBroadcaster.reset();
  }

  // Helper methods for common test scenarios
  setupEmptyStorage(): void {
    this.mockStorage.setLocalData(TempRepoTestData.storage.empty);
  }

  setupSingleRepo(): void {
    this.mockStorage.setLocalData(TempRepoTestData.storage.singleRepo);
  }

  setupMultipleRepos(): void {
    this.mockStorage.setLocalData(TempRepoTestData.storage.multipleRepos);
  }

  setupExpiredRepos(): void {
    this.mockStorage.setLocalData(TempRepoTestData.storage.expiredRepos);
  }

  setupMixedAgeRepos(): void {
    this.mockStorage.setLocalData(TempRepoTestData.storage.mixedAgeRepos);
  }

  setupCorruptedStorage(): void {
    this.mockStorage.setLocalData(TempRepoTestData.storage.corruptedStorage);
  }

  setupGitHubServiceFailure(
    operation:
      | 'listBranches'
      | 'createRepo'
      | 'cloneContents'
      | 'updateVisibility'
      | 'deleteRepo'
      | 'all' = 'all'
  ): void {
    this.mockGitHubService.setShouldFail(true, operation);
  }

  setupSlowGitHubService(delay: number = TempRepoTestData.performance.slowOperation): void {
    this.mockGitHubService.setDelay(delay);
  }

  setupStorageFailure(): void {
    this.mockStorage.setShouldFail(true);
  }

  setupOperationStateManagerFailure(): void {
    this.mockOperationStateManager.setShouldFail(true);
  }

  setupTabCreationFailure(): void {
    this.mockTabs.setShouldFail(true);
  }

  setupDeleteFailures(repos: string[]): void {
    this.mockGitHubService.setDeleteFailureRepos(repos);
  }

  // Fast-forward time for interval testing
  advanceTime(ms: number): void {
    jest.advanceTimersByTime(ms);
  }

  // Run all pending timers
  runAllTimers(): void {
    jest.runAllTimers();
  }
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

export const TempRepoAssertionHelpers = {
  expectStatusSequence(
    broadcaster: MockStatusBroadcaster,
    expectedStatuses: UploadStatusState['status'][]
  ): void {
    const actualStatuses = broadcaster.getStatusHistory().map((s) => s.status);
    expect(actualStatuses).toEqual(expectedStatuses);
  },

  expectProgressionIncreases(broadcaster: MockStatusBroadcaster): void {
    const progressSteps = broadcaster.getProgressSteps();
    for (let i = 1; i < progressSteps.length; i++) {
      expect(progressSteps[i]).toBeGreaterThanOrEqual(progressSteps[i - 1]);
    }
  },

  expectStorageContains(
    storage: TempRepoMockChromeStorage,
    expectedRepos: Array<{ originalRepo: string; tempRepo: string }>
  ): void {
    const storageData = storage.getLocalData();
    const tempRepos = storageData[STORAGE_KEY] || [];

    expectedRepos.forEach((expected) => {
      const found = tempRepos.find(
        (repo: any) =>
          repo.originalRepo === expected.originalRepo && repo.tempRepo === expected.tempRepo
      );
      expect(found).toBeDefined();
    });
  },

  expectStorageEmpty(storage: TempRepoMockChromeStorage): void {
    const storageData = storage.getLocalData();
    const tempRepos = storageData[STORAGE_KEY] || [];
    expect(tempRepos).toHaveLength(0);
  },

  expectOperationTracked(operationManager: MockOperationStateManager, operationType: string): void {
    const operations = operationManager.getAllOperations();
    const operation = operations.find((op) => op.operation.type === operationType);
    expect(operation).toBeDefined();
    expect(operation?.operation.status).toBe('started');
  },

  expectOperationCompleted(
    operationManager: MockOperationStateManager,
    operationType: string
  ): void {
    const operations = operationManager.getAllOperations();
    const operation = operations.find((op) => op.operation.type === operationType);
    expect(operation).toBeDefined();
    expect(operation?.operation.status).toBe('completed');
  },

  expectOperationFailed(operationManager: MockOperationStateManager, operationType: string): void {
    const operations = operationManager.getAllOperations();
    const operation = operations.find((op) => op.operation.type === operationType);
    expect(operation).toBeDefined();
    expect(operation?.operation.status).toBe('failed');
    expect(operation?.operation.error).toBeDefined();
  },

  expectBoltTabCreated(
    tabs: TempRepoMockChromeTabs,
    expectedOwner: string,
    expectedRepo: string | jest.AsymmetricMatcher
  ): void {
    const createdTab = tabs.getLastCreatedTab();
    expect(createdTab).toBeDefined();
    expect(createdTab?.url).toContain('bolt.new');
    if (typeof expectedRepo === 'string') {
      expect(createdTab?.url).toContain(`${expectedOwner}/${expectedRepo}`);
    } else {
      // Handle Jest matchers like expect.stringContaining()
      expect(createdTab?.url).toContain(expectedOwner);
      const match = createdTab?.url?.match(/github\.com\/[^/]+\/(.+)$/);
      if (match) {
        expect(match[1]).toEqual(expectedRepo);
      }
    }
    expect(createdTab?.active).toBe(true);
  },
};

// =============================================================================
// SCENARIO BUILDERS
// =============================================================================

export const TempRepoScenarioBuilder = {
  // Fresh TempRepoManager with no existing repos
  freshInstance(env: TempRepoManagerTestEnvironment): void {
    env.setupEmptyStorage();
  },

  // Instance with existing repos that need cleanup
  instanceWithExistingRepos(env: TempRepoManagerTestEnvironment): void {
    env.setupMixedAgeRepos();
  },

  // High-stress scenario with many repos and failures
  highStressScenario(env: TempRepoManagerTestEnvironment): void {
    env.setupMultipleRepos();
    env.setupSlowGitHubService(1000); // 1 second delays
    env.setupDeleteFailures(['temp-project-two-20240101-def456']); // One repo fails to delete
  },

  // Network failure scenario
  networkFailureScenario(env: TempRepoManagerTestEnvironment): void {
    env.setupGitHubServiceFailure('all');
    env.setupStorageFailure();
  },

  // Partial failure scenario - some operations succeed, others fail
  partialFailureScenario(env: TempRepoManagerTestEnvironment): void {
    env.setupMultipleRepos();
    env.setupGitHubServiceFailure('deleteRepo'); // Only delete operations fail
  },

  // Race condition scenario - rapid operations
  raceConditionScenario(env: TempRepoManagerTestEnvironment): void {
    env.setupEmptyStorage();
    // Multiple rapid operations will be simulated in tests
  },

  // Resource leak scenario - operations that don't complete cleanup
  resourceLeakScenario(env: TempRepoManagerTestEnvironment): void {
    env.setupExpiredRepos();
    env.setupDeleteFailures([
      'temp-old-project-one-20231220-old123',
      'temp-old-project-two-20231220-old456',
    ]);
  },
};
