/**
 * Service-specific test doubles and dependency mocks for BackgroundService.ts
 *
 * These mocks accurately reflect real service behavior while providing
 * controlled testing environments for various scenarios.
 */

import type { UploadStatusState } from '../../lib/types';

// =============================================================================
// STATE MANAGER MOCK
// =============================================================================

export class MockStateManager {
  private projectId: string | null = null;
  private githubSettings: any = null;

  static getInstance = jest.fn(() => new MockStateManager());

  getProjectId = jest.fn(async (): Promise<string | null> => {
    return this.projectId;
  });

  setProjectId = jest.fn(async (projectId: string): Promise<void> => {
    this.projectId = projectId;
  });

  getGitHubSettings = jest.fn(async () => {
    return this.githubSettings;
  });

  // Test helpers
  setMockProjectId(projectId: string | null): void {
    this.projectId = projectId;
  }

  setMockGitHubSettings(settings: any): void {
    this.githubSettings = settings;
  }

  reset(): void {
    this.projectId = null;
    this.githubSettings = null;
    jest.clearAllMocks();
  }
}

// =============================================================================
// UNIFIED GITHUB SERVICE MOCK
// =============================================================================

export class MockUnifiedGitHubService {
  private shouldFail = false;
  private delay = 0;
  private rateLimitCount = 0;
  private maxRateLimitRetries = 0;

  constructor(token?: string | { type: string }) {
    // Mock constructor behavior
  }

  // Test configuration methods
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setDelay(delay: number): void {
    this.delay = delay;
  }

  setRateLimitBehavior(maxRetries: number): void {
    this.maxRateLimitRetries = maxRetries;
    this.rateLimitCount = 0;
  }

  // Mock service methods that would be called by BackgroundService
  async authenticateUser(): Promise<boolean> {
    await this.simulateDelay();
    if (this.shouldFail) {
      throw new Error('GitHub authentication failed');
    }
    return true;
  }

  async validateToken(): Promise<boolean> {
    await this.simulateDelay();
    if (this.shouldFail) {
      throw new Error('Invalid token');
    }
    return true;
  }

  async createRepository(name: string): Promise<any> {
    await this.simulateDelay();
    if (this.shouldFail) {
      throw new Error('Failed to create repository');
    }
    return { name, id: 123456, full_name: `testuser/${name}` };
  }

  private async simulateDelay(): Promise<void> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }
  }

  private async simulateRateLimit(): Promise<void> {
    if (this.rateLimitCount < this.maxRateLimitRetries) {
      this.rateLimitCount++;
      throw new Error('GitHub API Error: Rate limit exceeded');
    }
  }

  reset(): void {
    this.shouldFail = false;
    this.delay = 0;
    this.rateLimitCount = 0;
    this.maxRateLimitRetries = 0;
  }
}

// =============================================================================
// ZIP HANDLER MOCK
// =============================================================================

export class MockZipHandler {
  private shouldFail = false;
  private delay = 0;
  private progressCallbacks: Array<(status: UploadStatusState) => void> = [];
  private processedFiles: string[] = [];

  constructor(githubService: any, statusCallback: (status: UploadStatusState) => void) {
    this.progressCallbacks.push(statusCallback);
  }

  processZipFile = jest.fn(
    async (blob: Blob, projectId: string, commitMessage: string): Promise<void> => {
      // Simulate processing stages
      this.broadcastStatus({
        status: 'uploading',
        message: 'Processing ZIP file...',
        progress: 10,
      });
      await this.simulateDelay(this.delay * 0.3);

      this.broadcastStatus({ status: 'uploading', message: 'Extracting files...', progress: 30 });
      await this.simulateDelay(this.delay * 0.3);

      this.broadcastStatus({
        status: 'uploading',
        message: 'Uploading to GitHub...',
        progress: 60,
      });
      await this.simulateDelay(this.delay * 0.4);

      if (this.shouldFail) {
        this.broadcastStatus({ status: 'error', message: 'Upload failed' });
        throw new Error('ZIP processing failed');
      }

      this.processedFiles.push(`${projectId}-${commitMessage}`);
      this.broadcastStatus({
        status: 'success',
        message: 'Upload completed successfully',
        progress: 100,
      });
    }
  );

  // Test configuration methods
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setDelay(delay: number): void {
    this.delay = delay;
  }

  getProcessedFiles(): string[] {
    return [...this.processedFiles];
  }

  private broadcastStatus(status: UploadStatusState): void {
    this.progressCallbacks.forEach((callback) => callback(status));
  }

  private async simulateDelay(ms: number): Promise<void> {
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  reset(): void {
    this.shouldFail = false;
    this.delay = 0;
    this.processedFiles = [];
    jest.clearAllMocks();
  }
}

// =============================================================================
// TEMP REPO MANAGER MOCK
// =============================================================================

export class MockBackgroundTempRepoManager {
  private repositories: Array<{ name: string; created: number }> = [];
  private shouldFail = false;

  constructor(
    githubService: any,
    repoOwner: string,
    statusCallback: (status: UploadStatusState) => void
  ) {
    // Mock constructor
  }

  handlePrivateRepoImport = jest.fn(async (repoName: string, branch?: string): Promise<void> => {
    if (this.shouldFail) {
      throw new Error('Failed to import private repository');
    }

    this.repositories.push({
      name: repoName,
      created: Date.now(),
    });

    // Simulate import process
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  cleanupTempRepos = jest.fn(async (force: boolean = false): Promise<void> => {
    if (this.shouldFail && !force) {
      throw new Error('Failed to cleanup temporary repositories');
    }

    this.repositories = [];
  });

  // Test configuration methods
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  getRepositories(): Array<{ name: string; created: number }> {
    return [...this.repositories];
  }

  reset(): void {
    this.repositories = [];
    this.shouldFail = false;
    jest.clearAllMocks();
  }
}

// =============================================================================
// SUPABASE AUTH SERVICE MOCK
// =============================================================================

export class MockSupabaseAuthService {
  private isPremiumUser = false;
  private isAuthenticated = false;
  private shouldFailAuth = false;

  static getInstance = jest.fn(() => new MockSupabaseAuthService());

  isPremium = jest.fn((): boolean => {
    return this.isPremiumUser;
  });

  isAuth = jest.fn((): boolean => {
    return this.isAuthenticated;
  });

  forceCheck = jest.fn(async (): Promise<void> => {
    if (this.shouldFailAuth) {
      throw new Error('Authentication check failed');
    }
    // Simulate auth check delay
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  forceSubscriptionRevalidation = jest.fn(async (): Promise<void> => {
    if (this.shouldFailAuth) {
      throw new Error('Subscription revalidation failed');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  forceSyncToPopup = jest.fn(async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  logout = jest.fn(async (): Promise<void> => {
    this.isAuthenticated = false;
    this.isPremiumUser = false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  getAuthState = jest.fn(() => ({
    isAuthenticated: this.isAuthenticated,
    user: this.isAuthenticated ? { id: 'test-user', email: 'test@example.com' } : null,
    subscription: { isActive: this.isPremiumUser, plan: 'free' as const },
  }));

  addAuthStateListener = jest.fn((listener: any): void => {
    // Mock implementation - store listener for testing
  });

  removeAuthStateListener = jest.fn((listener: any): void => {
    // Mock implementation - remove listener for testing
  });

  // Test configuration methods
  setIsPremium(isPremium: boolean): void {
    this.isPremiumUser = isPremium;
  }

  setIsAuthenticated(isAuthenticated: boolean): void {
    this.isAuthenticated = isAuthenticated;
  }

  setShouldFailAuth(shouldFail: boolean): void {
    this.shouldFailAuth = shouldFail;
  }

  reset(): void {
    this.isPremiumUser = false;
    this.isAuthenticated = false;
    this.shouldFailAuth = false;
    jest.clearAllMocks();
  }
}

// =============================================================================
// OPERATION STATE MANAGER MOCK
// =============================================================================

export class MockOperationStateManager {
  private operations: Map<string, { type: string; status: string; error?: Error }> = new Map();
  private shouldFail = false;

  static getInstance = jest.fn(() => new MockOperationStateManager());

  startOperation = jest.fn(
    async (
      type: string,
      operationId: string,
      description: string,
      metadata?: any
    ): Promise<void> => {
      if (this.shouldFail) {
        throw new Error('Failed to start operation');
      }

      this.operations.set(operationId, { type, status: 'running' });
    }
  );

  completeOperation = jest.fn(async (operationId: string): Promise<void> => {
    if (this.shouldFail) {
      throw new Error('Failed to complete operation');
    }

    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = 'completed';
    }
  });

  failOperation = jest.fn(async (operationId: string, error: Error): Promise<void> => {
    if (this.shouldFail) {
      throw new Error('Failed to fail operation');
    }

    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = 'failed';
      operation.error = error;
    }
  });

  // Test helpers
  getOperation(operationId: string): { type: string; status: string; error?: Error } | undefined {
    return this.operations.get(operationId);
  }

  getAllOperations(): Array<{ id: string; type: string; status: string; error?: Error }> {
    return Array.from(this.operations.entries()).map(([id, operation]) => ({
      id,
      ...operation,
    }));
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  reset(): void {
    this.operations.clear();
    this.shouldFail = false;
    jest.clearAllMocks();
  }
}

// =============================================================================
// USAGE TRACKER MOCK
// =============================================================================

export class MockUsageTracker {
  initializeUsageData = jest.fn(async (): Promise<void> => {
    // Mock implementation - does nothing
  });

  updateUsageStats = jest.fn(async (eventType: string, data?: any): Promise<void> => {
    // Mock implementation - does nothing
  });

  trackError = jest.fn(async (error: Error, context: string): Promise<void> => {
    // Mock implementation - does nothing
  });

  setUninstallURL = jest.fn(async (): Promise<void> => {
    // Mock implementation - does nothing
  });

  reset(): void {
    jest.clearAllMocks();
  }
}

// =============================================================================
// MOCK FACTORY
// =============================================================================

export class MockServiceFactory {
  public stateManager: MockStateManager;
  public unifiedGitHubService: MockUnifiedGitHubService;
  public zipHandler: MockZipHandler;
  public tempRepoManager: MockBackgroundTempRepoManager;
  public supabaseAuthService: MockSupabaseAuthService;
  public operationStateManager: MockOperationStateManager;
  public usageTracker: MockUsageTracker;

  constructor() {
    this.stateManager = new MockStateManager();
    this.unifiedGitHubService = new MockUnifiedGitHubService();
    this.zipHandler = new MockZipHandler(this.unifiedGitHubService, () => {});
    this.tempRepoManager = new MockBackgroundTempRepoManager(
      this.unifiedGitHubService,
      'testuser',
      () => {}
    );
    this.supabaseAuthService = new MockSupabaseAuthService();
    this.operationStateManager = new MockOperationStateManager();
    this.usageTracker = new MockUsageTracker();
  }

  setupMocks(): void {
    // Mock the imports to return our mock instances
    jest.doMock('../StateManager', () => ({
      StateManager: {
        getInstance: () => this.stateManager,
      },
    }));

    jest.doMock('../../services/UnifiedGitHubService', () => ({
      UnifiedGitHubService: jest.fn(() => this.unifiedGitHubService),
    }));

    jest.doMock('../../services/zipHandler', () => ({
      ZipHandler: jest.fn(() => this.zipHandler),
    }));

    jest.doMock('../TempRepoManager', () => ({
      BackgroundTempRepoManager: jest.fn(() => this.tempRepoManager),
    }));

    jest.doMock('../../content/services/SupabaseAuthService', () => ({
      SupabaseAuthService: {
        getInstance: () => this.supabaseAuthService,
      },
    }));

    jest.doMock('../../content/services/OperationStateManager', () => ({
      OperationStateManager: {
        getInstance: () => this.operationStateManager,
      },
    }));

    jest.doMock('../UsageTracker', () => ({
      UsageTracker: jest.fn(() => this.usageTracker),
    }));
  }

  resetAllMocks(): void {
    this.stateManager.reset();
    this.unifiedGitHubService.reset();
    this.zipHandler.reset();
    this.tempRepoManager.reset();
    this.supabaseAuthService.reset();
    this.operationStateManager.reset();
    this.usageTracker.reset();
  }

  // Scenario setup methods
  setupSuccessfulUploadScenario(): void {
    this.stateManager.setMockGitHubSettings({
      gitHubSettings: {
        githubToken: 'ghp_test_token',
        repoOwner: 'testuser',
        repoName: 'test-repo',
        branch: 'main',
      },
    });
    this.stateManager.setMockProjectId('test-project-123');
    this.supabaseAuthService.setIsAuthenticated(true);
    this.supabaseAuthService.setIsPremium(true);
  }

  setupFailedUploadScenario(): void {
    this.setupSuccessfulUploadScenario();
    this.zipHandler.setShouldFail(true);
  }

  setupSlowUploadScenario(delay: number = 5000): void {
    this.setupSuccessfulUploadScenario();
    this.zipHandler.setDelay(delay);
  }

  setupInvalidAuthScenario(): void {
    this.stateManager.setMockGitHubSettings(null);
    this.supabaseAuthService.setIsAuthenticated(false);
    this.supabaseAuthService.setShouldFailAuth(true);
  }

  setupPremiumFeatureScenario(isPremium: boolean): void {
    this.supabaseAuthService.setIsAuthenticated(true);
    this.supabaseAuthService.setIsPremium(isPremium);
  }
}

// =============================================================================
// EXPORT ALL MOCKS
// =============================================================================

export const ServiceMocks = {
  MockStateManager,
  MockUnifiedGitHubService,
  MockZipHandler,
  MockBackgroundTempRepoManager,
  MockSupabaseAuthService,
  MockOperationStateManager,
  MockUsageTracker,
  MockServiceFactory,
};
