/**
 * Test helper functions for TempRepoManager.ts
 *
 * This file provides utility functions for setting up controlled test environments,
 * managing test lifecycle, and performing common test operations.
 */

import { BackgroundTempRepoManager } from '../TempRepoManager';
import type { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
import {
  TempRepoManagerTestEnvironment,
  TempRepoTestData,
  TempRepoScenarioBuilder,
} from './TempRepoManagerTestFixtures';

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export class TempRepoManagerFactory {
  /**
   * Creates a TempRepoManager instance with all dependencies mocked
   */
  static createWithMocks(
    env: TempRepoManagerTestEnvironment,
    owner: string = TempRepoTestData.owners.validOwner
  ): BackgroundTempRepoManager {
    return new BackgroundTempRepoManager(
      env.mockGitHubService as unknown as UnifiedGitHubService,
      owner,
      env.mockStatusBroadcaster.broadcast
    );
  }

  /**
   * Creates a TempRepoManager instance configured for success scenarios
   */
  static createForSuccessScenario(env: TempRepoManagerTestEnvironment): BackgroundTempRepoManager {
    TempRepoScenarioBuilder.freshInstance(env);
    return this.createWithMocks(env);
  }

  /**
   * Creates a TempRepoManager instance configured for failure scenarios
   */
  static createForFailureScenario(env: TempRepoManagerTestEnvironment): BackgroundTempRepoManager {
    TempRepoScenarioBuilder.networkFailureScenario(env);
    return this.createWithMocks(env);
  }

  /**
   * Creates a TempRepoManager instance with existing repos for cleanup testing
   */
  static createWithExistingRepos(env: TempRepoManagerTestEnvironment): BackgroundTempRepoManager {
    TempRepoScenarioBuilder.instanceWithExistingRepos(env);
    return this.createWithMocks(env);
  }
}

// =============================================================================
// TEST LIFECYCLE HELPERS
// =============================================================================

export class TempRepoTestLifecycle {
  private env: TempRepoManagerTestEnvironment;
  private tempRepoManager: BackgroundTempRepoManager | null = null;

  constructor() {
    this.env = new TempRepoManagerTestEnvironment();
  }

  /**
   * Setup test environment before each test
   */
  beforeEach(): TempRepoManagerTestEnvironment {
    this.env.setup();
    return this.env;
  }

  /**
   * Cleanup test environment after each test
   */
  afterEach(): void {
    this.tempRepoManager = null;
    this.env.teardown();
  }

  /**
   * Create and return a TempRepoManager instance for testing
   */
  createManager(
    scenario: 'success' | 'failure' | 'existing' | 'custom' = 'success',
    owner?: string
  ): BackgroundTempRepoManager {
    switch (scenario) {
      case 'success':
        this.tempRepoManager = TempRepoManagerFactory.createForSuccessScenario(this.env);
        break;
      case 'failure':
        this.tempRepoManager = TempRepoManagerFactory.createForFailureScenario(this.env);
        break;
      case 'existing':
        this.tempRepoManager = TempRepoManagerFactory.createWithExistingRepos(this.env);
        break;
      case 'custom':
        this.tempRepoManager = TempRepoManagerFactory.createWithMocks(this.env, owner);
        break;
    }
    return this.tempRepoManager;
  }

  /**
   * Get the test environment for direct mock manipulation
   */
  getEnvironment(): TempRepoManagerTestEnvironment {
    return this.env;
  }

  /**
   * Get the current TempRepoManager instance
   */
  getManager(): BackgroundTempRepoManager | null {
    return this.tempRepoManager;
  }
}

// =============================================================================
// ASYNC OPERATION HELPERS
// =============================================================================

export class AsyncOperationHelpers {
  /**
   * Wait for an async operation to complete and verify its outcome
   */
  static async waitForOperation<T>(operation: Promise<T>, timeoutMs: number = 5000): Promise<T> {
    return Promise.race([
      operation,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      ),
    ]);
  }

  /**
   * Wait for a specific number of status broadcasts
   */
  static async waitForStatusBroadcasts(
    env: TempRepoManagerTestEnvironment,
    expectedCount: number,
    timeoutMs: number = 3000
  ): Promise<void> {
    const startTime = Date.now();

    while (env.mockStatusBroadcaster.getStatusHistory().length < expectedCount) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Timeout waiting for ${expectedCount} status broadcasts. Got ${env.mockStatusBroadcaster.getStatusHistory().length}`
        );
      }

      // Small delay to prevent busy waiting
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Wait for cleanup interval to run and process repos
   */
  static async waitForCleanupCycle(
    env: TempRepoManagerTestEnvironment,
    cycles: number = 1
  ): Promise<void> {
    const cleanupInterval = 30 * 1000; // 30 seconds as defined in TempRepoManager

    for (let i = 0; i < cycles; i++) {
      env.advanceTime(cleanupInterval);
      await new Promise((resolve) => setTimeout(resolve, 0)); // Allow promises to resolve
    }
  }

  /**
   * Simulate progress callback execution
   */
  static async simulateProgressCallback(
    env: TempRepoManagerTestEnvironment,
    repoName: string,
    steps: number[] = TempRepoTestData.progress.progressSteps
  ): Promise<void> {
    const callback = env.mockGitHubService.getProgressCallback(repoName);

    if (callback) {
      for (const step of steps) {
        await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay between steps
        callback(step);
      }
    }
  }
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export class ValidationHelpers {
  /**
   * Validate that a temp repo name follows the expected format
   */
  static validateTempRepoName(tempRepoName: string, originalRepo: string): boolean {
    const pattern = new RegExp(
      `^temp-${originalRepo.replace(/[^a-zA-Z0-9-]/g, '-')}-\\d{8}-[a-f0-9]{6}$`
    );
    return pattern.test(tempRepoName);
  }

  /**
   * Validate that an operation ID follows the expected format
   */
  static validateOperationId(operationId: string): boolean {
    const pattern = /^import-\d{13}-[a-z0-9]{6}$/;
    return pattern.test(operationId);
  }

  /**
   * Validate that a repository metadata object has all required fields
   */
  static validateRepoMetadata(metadata: Record<string, unknown>): boolean {
    const requiredFields = ['originalRepo', 'tempRepo', 'createdAt', 'owner', 'branch'];
    return requiredFields.every((field) => field in metadata && metadata[field] !== undefined);
  }

  /**
   * Validate that a progress value is within expected bounds
   */
  static validateProgress(progress: number): boolean {
    return progress >= 0 && progress <= 100 && Number.isInteger(progress);
  }

  /**
   * Validate that a status sequence follows the expected flow
   */
  static validateStatusSequence(
    statuses: Array<{ status: string; progress?: number }>,
    expectedFlow: string[] = ['uploading', 'success']
  ): boolean {
    const statusSequence = statuses.map((s) => s.status);

    // Check if the sequence contains all expected statuses in order
    let expectedIndex = 0;
    for (const status of statusSequence) {
      if (status === expectedFlow[expectedIndex]) {
        expectedIndex++;
      }
    }

    return expectedIndex === expectedFlow.length;
  }
}

// =============================================================================
// DEBUGGING HELPERS
// =============================================================================

export class DebuggingHelpers {
  /**
   * Print current state of all mocks for debugging
   */
  static printMockState(env: TempRepoManagerTestEnvironment): void {
    console.log('=== MOCK STATE DEBUG ===');

    console.log('Storage:', env.mockStorage.getLocalData());
    console.log('Status History:', env.mockStatusBroadcaster.getStatusHistory());
    console.log('Created Tabs:', env.mockTabs.getCreatedTabs());
    console.log('Operations:', env.mockOperationStateManager.getAllOperations());

    console.log('========================');
  }

  /**
   * Create a detailed test report for failed operations
   */
  static createFailureReport(
    env: TempRepoManagerTestEnvironment,
    operation: string,
    error: Error
  ): string {
    const report = [
      `FAILURE REPORT: ${operation}`,
      `Error: ${error.message}`,
      `Stack: ${error.stack}`,
      '',
      'Mock States:',
      `- Storage Calls: ${JSON.stringify({
        get: env.mockStorage.local.get.mock.calls.length,
        set: env.mockStorage.local.set.mock.calls.length,
      })}`,
      `- Status Broadcasts: ${env.mockStatusBroadcaster.getStatusHistory().length}`,
      `- Operations Tracked: ${env.mockOperationStateManager.getOperationCount()}`,
      `- Tabs Created: ${env.mockTabs.getCreatedTabs().length}`,
      '',
      'Last Status:',
      JSON.stringify(env.mockStatusBroadcaster.getLastStatus(), null, 2),
      '',
      'Storage Data:',
      JSON.stringify(env.mockStorage.getLocalData(), null, 2),
    ];

    return report.join('\n');
  }

  /**
   * Verify mock interactions for comprehensive testing
   */
  static verifyMockInteractions(env: TempRepoManagerTestEnvironment): {
    storageInteractions: { gets: number; sets: number };
    statusBroadcasts: number;
    operationTracking: number;
    tabsCreated: number;
    githubServiceCalls: {
      listBranches: boolean;
      createRepo: boolean;
      cloneContents: boolean;
      updateVisibility: boolean;
      deleteRepo: boolean;
    };
  } {
    // Note: This would need to be implemented based on your specific mock tracking needs
    // You might want to add call tracking to your mocks for this functionality

    return {
      storageInteractions: {
        gets: env.mockStorage.local.get.mock.calls.length,
        sets: env.mockStorage.local.set.mock.calls.length,
      },
      statusBroadcasts: env.mockStatusBroadcaster.getStatusHistory().length,
      operationTracking: env.mockOperationStateManager.getOperationCount(),
      tabsCreated: env.mockTabs.getCreatedTabs().length,
      githubServiceCalls: {
        listBranches: false, // You'd track these in the mock
        createRepo: false,
        cloneContents: false,
        updateVisibility: false,
        deleteRepo: false,
      },
    };
  }
}

// =============================================================================
// PERFORMANCE TESTING HELPERS
// =============================================================================

export class PerformanceHelpers {
  /**
   * Measure execution time of an operation
   */
  static async measureExecutionTime<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; timeMs: number }> {
    const startTime = Date.now();
    const result = await operation();
    const timeMs = Date.now() - startTime;

    return { result, timeMs };
  }

  /**
   * Test operation under various timing conditions
   */
  static async testWithTimingVariations<T>(
    operation: () => Promise<T>,
    variations: { name: string; setup: () => void }[]
  ): Promise<Array<{ name: string; timeMs: number; success: boolean; error?: Error }>> {
    const results = [];

    for (const variation of variations) {
      variation.setup();

      try {
        const { timeMs } = await this.measureExecutionTime(operation);
        results.push({ name: variation.name, timeMs, success: true });
      } catch (error) {
        results.push({
          name: variation.name,
          timeMs: -1,
          success: false,
          error: error as Error,
        });
      }
    }

    return results;
  }

  /**
   * Simulate memory pressure during operations
   */
  static simulateMemoryPressure<T>(operation: () => Promise<T>): Promise<T> {
    // Create large objects to simulate memory pressure
    const memoryPressure = Array.from({ length: 1000 }, () =>
      new Array(1000).fill('memory-pressure-data')
    );

    return operation().finally(() => {
      // Clear memory pressure
      memoryPressure.length = 0;
    });
  }
}

// =============================================================================
// EXPORT ALL HELPERS
// =============================================================================

export {
  TempRepoManagerTestEnvironment,
  TempRepoTestData,
  TempRepoScenarioBuilder,
} from './TempRepoManagerTestFixtures';

// Default export for convenience
export default {
  TempRepoManagerFactory,
  TempRepoTestLifecycle,
  AsyncOperationHelpers,
  ValidationHelpers,
  DebuggingHelpers,
  PerformanceHelpers,
};
