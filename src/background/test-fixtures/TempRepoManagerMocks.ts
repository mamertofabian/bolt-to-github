/**
 * Mock coordination and service factory for TempRepoManager tests
 *
 * This file provides a centralized mock factory and coordination system
 * for TempRepoManager testing, ensuring consistent mock behavior across tests.
 */

import { 
  MockUnifiedGitHubService,
  MockOperationStateManager,
  TempRepoMockChromeStorage,
  TempRepoMockChromeTabs,
  MockStatusBroadcaster,
  TempRepoTestData
} from './TempRepoManagerTestFixtures';
import { STORAGE_KEY } from '../TempRepoManager';

// =============================================================================
// MOCK SERVICE FACTORY
// =============================================================================

export class TempRepoMockServiceFactory {
  private static instance: TempRepoMockServiceFactory;
  
  private mockServices: {
    githubService: MockUnifiedGitHubService;
    operationStateManager: MockOperationStateManager;
    storage: TempRepoMockChromeStorage;
    tabs: TempRepoMockChromeTabs;
    statusBroadcaster: MockStatusBroadcaster;
  };

  private constructor() {
    this.mockServices = {
      githubService: new MockUnifiedGitHubService(),
      operationStateManager: new MockOperationStateManager(),
      storage: new TempRepoMockChromeStorage(),
      tabs: new TempRepoMockChromeTabs(),
      statusBroadcaster: new MockStatusBroadcaster(),
    };
  }

  static getInstance(): TempRepoMockServiceFactory {
    if (!TempRepoMockServiceFactory.instance) {
      TempRepoMockServiceFactory.instance = new TempRepoMockServiceFactory();
    }
    return TempRepoMockServiceFactory.instance;
  }

  static reset(): void {
    TempRepoMockServiceFactory.instance = new TempRepoMockServiceFactory();
  }

  getMocks() {
    return { ...this.mockServices };
  }

  // =============================================================================
  // CONFIGURATION METHODS
  // =============================================================================

  /**
   * Configure all mocks for success scenario
   */
  configureForSuccess(): void {
    this.mockServices.githubService.setShouldFail(false);
    this.mockServices.operationStateManager.setShouldFail(false);
    this.mockServices.storage.setShouldFail(false);
    this.mockServices.tabs.setShouldFail(false);
    this.mockServices.statusBroadcaster.setShouldFail(false);
  }

  /**
   * Configure all mocks for failure scenario
   */
  configureForFailure(): void {
    this.mockServices.githubService.setShouldFail(true);
    this.mockServices.operationStateManager.setShouldFail(true);
    this.mockServices.storage.setShouldFail(true);
    this.mockServices.tabs.setShouldFail(true);
    this.mockServices.statusBroadcaster.setShouldFail(true);
  }

  /**
   * Configure mocks for specific failure scenarios
   */
  configureForPartialFailure(failingServices: Array<'github' | 'operations' | 'storage' | 'tabs' | 'status'>): void {
    // Reset all to success first
    this.configureForSuccess();
    
    // Then set specific failures
    failingServices.forEach(service => {
      switch (service) {
        case 'github':
          this.mockServices.githubService.setShouldFail(true);
          break;
        case 'operations':
          this.mockServices.operationStateManager.setShouldFail(true);
          break;
        case 'storage':
          this.mockServices.storage.setShouldFail(true);
          break;
        case 'tabs':
          this.mockServices.tabs.setShouldFail(true);
          break;
        case 'status':
          this.mockServices.statusBroadcaster.setShouldFail(true);
          break;
      }
    });
  }

  /**
   * Configure mocks for performance testing with delays
   */
  configureForPerformance(delays: {
    github?: number;
    storage?: number;
  } = {}): void {
    this.configureForSuccess();
    
    if (delays.github) {
      this.mockServices.githubService.setDelay(delays.github);
    }
    
    if (delays.storage) {
      this.mockServices.storage.setDelay(delays.storage);
    }
  }

  /**
   * Configure mocks for cleanup testing scenarios
   */
  configureForCleanupTesting(scenario: 'all-succeed' | 'some-fail' | 'all-fail'): void {
    this.configureForSuccess();
    
    switch (scenario) {
      case 'all-succeed':
        // Default success configuration
        break;
        
      case 'some-fail':
        // Configure some repos to fail deletion
        this.mockServices.githubService.setDeleteFailureRepos([
          'temp-project-two-20240101-def456',
          'temp-old-project-one-20231220-old123'
        ]);
        break;
        
      case 'all-fail':
        // Configure all delete operations to fail
        this.mockServices.githubService.setShouldFail(true, 'deleteRepo');
        break;
    }
  }

  /**
   * Reset all mocks to their initial state
   */
  resetAllMocks(): void {
    this.mockServices.githubService.clearProgressCallbacks();
    this.mockServices.operationStateManager.clear();
    this.mockServices.storage.reset();
    this.mockServices.tabs.reset();
    this.mockServices.statusBroadcaster.reset();
  }
}

// =============================================================================
// MOCK BEHAVIOR ORCHESTRATOR
// =============================================================================

export class MockBehaviorOrchestrator {
  private factory: TempRepoMockServiceFactory;

  constructor(factory: TempRepoMockServiceFactory) {
    this.factory = factory;
  }

  /**
   * Orchestrate a complete import success flow
   */
  async orchestrateSuccessfulImport(
    sourceRepo: string = TempRepoTestData.repositories.validSourceRepo,
    branch?: string
  ): Promise<{
    tempRepoName: string;
    operationId: string;
    progressSteps: number[];
  }> {
    const mocks = this.factory.getMocks();
    
    // Pre-configure expected responses
    const tempRepoName = `temp-${sourceRepo}-20240101-abc123`;
    const operationId = `import-${Date.now()}-abc123`;
    
    // Set up storage for empty state
    mocks.storage.setLocalData(TempRepoTestData.storage.empty);
    
    return {
      tempRepoName,
      operationId,
      progressSteps: TempRepoTestData.progress.progressSteps,
    };
  }

  /**
   * Orchestrate a cleanup cycle with mixed results
   */
  async orchestrateCleanupCycle(scenario: 'mixed-results' | 'all-success' | 'all-fail'): Promise<{
    initialRepoCount: number;
    expectedDeletions: number;
    expectedRemaining: number;
  }> {
    const mocks = this.factory.getMocks();
    
    switch (scenario) {
      case 'mixed-results':
        mocks.storage.setLocalData(TempRepoTestData.storage.mixedAgeRepos);
        this.factory.configureForCleanupTesting('some-fail');
        return {
          initialRepoCount: TempRepoTestData.storage.mixedAgeRepos[STORAGE_KEY].length,
          expectedDeletions: 1, // Only one expired repo should be deleted successfully
          expectedRemaining: 2, // One fresh repo + one failed deletion
        };
        
      case 'all-success':
        mocks.storage.setLocalData(TempRepoTestData.storage.expiredRepos);
        this.factory.configureForCleanupTesting('all-succeed');
        return {
          initialRepoCount: TempRepoTestData.storage.expiredRepos[STORAGE_KEY].length,
          expectedDeletions: 2, // Both expired repos should be deleted
          expectedRemaining: 0,
        };
        
      case 'all-fail':
        mocks.storage.setLocalData(TempRepoTestData.storage.expiredRepos);
        this.factory.configureForCleanupTesting('all-fail');
        return {
          initialRepoCount: TempRepoTestData.storage.expiredRepos[STORAGE_KEY].length,
          expectedDeletions: 0, // No repos should be deleted
          expectedRemaining: 2, // Both repos remain due to failures
        };
        
      default:
        throw new Error(`Unknown cleanup scenario: ${scenario}`);
    }
  }

  /**
   * Orchestrate concurrent operations scenario
   */
  async orchestrateConcurrentOperations(operationCount: number = 3): Promise<{
    operations: Array<{
      sourceRepo: string;
      branch?: string;
      expectedTempRepo: string;
    }>;
  }> {
    const operations = [];
    
    for (let i = 0; i < operationCount; i++) {
      const sourceRepo = `concurrent-repo-${i}`;
      const branch = i % 2 === 0 ? 'main' : 'develop';
      const expectedTempRepo = `temp-${sourceRepo}-20240101-abc${i.toString().padStart(3, '0')}`;
      
      operations.push({
        sourceRepo,
        branch,
        expectedTempRepo,
      });
    }
    
    return { operations };
  }

  /**
   * Orchestrate error recovery scenario
   */
  async orchestrateErrorRecovery(
    failurePoint: 'listBranches' | 'createRepo' | 'cloneContents' | 'updateVisibility'
  ): Promise<{
    sourceRepo: string;
    expectedFailurePoint: string;
    shouldCleanupPartialState: boolean;
  }> {
    const mocks = this.factory.getMocks();
    
    // Set up for specific failure
    mocks.githubService.setShouldFail(true, failurePoint);
    
    return {
      sourceRepo: TempRepoTestData.repositories.validSourceRepo,
      expectedFailurePoint: failurePoint,
      shouldCleanupPartialState: ['cloneContents', 'updateVisibility'].includes(failurePoint),
    };
  }
}

// =============================================================================
// MOCK VERIFICATION UTILITIES
// =============================================================================

export class MockVerificationUtilities {
  static verifyGitHubServiceCalls(
    mockService: MockUnifiedGitHubService,
    expectedCalls: {
      listBranches?: { owner: string; repo: string };
      createTemporaryPublicRepo?: { owner: string; sourceRepo: string; branch?: string };
      cloneRepoContents?: { 
        sourceOwner: string; 
        sourceRepo: string; 
        targetOwner: string; 
        targetRepo: string; 
        branch: string; 
      };
      updateRepoVisibility?: { owner: string; repo: string; isPrivate: boolean };
      deleteRepo?: Array<{ owner: string; repo: string }>;
    }
  ): void {
    // Note: This would require adding call tracking to the mock service
    // Implementation would verify that expected methods were called with correct parameters
  }

  static verifyOperationTracking(
    mockOperationManager: MockOperationStateManager,
    expectedOperations: Array<{
      type: string;
      status: 'started' | 'completed' | 'failed';
      hasMetadata?: boolean;
    }>
  ): void {
    const allOperations = mockOperationManager.getAllOperations();
    
    expectedOperations.forEach(expected => {
      const found = allOperations.find(op => 
        op.operation.type === expected.type && 
        op.operation.status === expected.status
      );
      
      expect(found).toBeDefined();
      
      if (expected.hasMetadata) {
        expect(found?.operation.metadata).toBeDefined();
      }
    });
  }

  static verifyStatusSequence(
    mockBroadcaster: MockStatusBroadcaster,
    expectedSequence: Array<{
      status: 'uploading' | 'success' | 'error';
      messageContains?: string;
      progressRange?: { min: number; max: number };
    }>
  ): void {
    const statusHistory = mockBroadcaster.getStatusHistory();
    
    expect(statusHistory).toHaveLength(expectedSequence.length);
    
    expectedSequence.forEach((expected, index) => {
      const actual = statusHistory[index];
      
      expect(actual.status).toBe(expected.status);
      
      if (expected.messageContains) {
        expect(actual.message).toContain(expected.messageContains);
      }
      
      if (expected.progressRange) {
        expect(actual.progress).toBeGreaterThanOrEqual(expected.progressRange.min);
        expect(actual.progress).toBeLessThanOrEqual(expected.progressRange.max);
      }
    });
  }

  static verifyStorageOperations(
    mockStorage: TempRepoMockChromeStorage,
    expectedOperations: {
      gets?: number;
      sets?: number;
      finalDataCheck?: (data: any) => boolean;
    }
  ): void {
    if (expectedOperations.gets !== undefined) {
      expect(mockStorage.local.get).toHaveBeenCalledTimes(expectedOperations.gets);
    }
    
    if (expectedOperations.sets !== undefined) {
      expect(mockStorage.local.set).toHaveBeenCalledTimes(expectedOperations.sets);
    }
    
    if (expectedOperations.finalDataCheck) {
      const finalData = mockStorage.getLocalData();
      expect(expectedOperations.finalDataCheck(finalData)).toBe(true);
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  MockUnifiedGitHubService,
  MockOperationStateManager,
  TempRepoMockChromeStorage,
  TempRepoMockChromeTabs,
  MockStatusBroadcaster,
} from './TempRepoManagerTestFixtures';

export default {
  TempRepoMockServiceFactory,
  MockBehaviorOrchestrator,
  MockVerificationUtilities,
};