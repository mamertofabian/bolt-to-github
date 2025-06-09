/**
 * Background Services Test Fixtures - Comprehensive Testing Suite
 *
 * This index file provides a unified interface to all Background Service test fixtures,
 * including BackgroundService and TempRepoManager, designed to enable behavior-focused
 * testing that reveals real usage patterns and bugs.
 *
 * USAGE GUIDE:
 * ===========
 *
 * 1. BACKGROUNDSERVICE TESTING:
 *    import { BackgroundServiceTestSuite } from './fixtures';
 *    const testSuite = new BackgroundServiceTestSuite();
 *    await testSuite.setup();
 *
 * 2. TEMPREPOMANAGER TESTING:
 *    import { TempRepoTestLifecycle, TempRepoManagerFactory } from './fixtures';
 *    const lifecycle = new TempRepoTestLifecycle();
 *    const env = lifecycle.beforeEach();
 *    const manager = TempRepoManagerFactory.createForSuccessScenario(env);
 *
 * 3. COMBINED TESTING:
 *    import { quickSetup, verifyTestExpectations } from './fixtures';
 *    const { env, manager, cleanup } = quickSetup('success');
 *
 * DESIGN PRINCIPLES:
 * =================
 *
 * - BEHAVIOR-FOCUSED: Tests user-observable behavior, not implementation details
 * - REALISTIC DATA: Uses actual Chrome extension contexts and real-world scenarios
 * - BUG DETECTION: Designed to catch memory leaks, race conditions, and error handling bugs
 * - MAINTAINABLE: Fixtures survive refactoring because they test behavior, not structure
 * - COMPREHENSIVE: Covers normal paths, edge cases, error scenarios, and performance
 *
 */

import { TestData, ScenarioBuilder } from './BackgroundServiceTestFixtures';
import {
  TestHelpers,
  type BackgroundServiceIntegrationEnvironment,
  type ErrorInjectionHelper,
  type PerformanceTestHelper,
} from './BackgroundServiceTestHelpers';
import {
  BackgroundServiceBehaviorTestFramework,
  BugDetectionScenarios,
  UsagePatterns,
} from './BackgroundServiceTestSpecification';

// TempRepoManager imports
import {
  TempRepoManagerTestEnvironment,
  TempRepoAssertionHelpers,
} from './TempRepoManagerTestFixtures';
import { TempRepoTestLifecycle } from './TempRepoManagerTestHelpers';
import { MockVerificationUtilities } from './TempRepoManagerMocks';
import type { UploadStatusState } from '../../lib/types';

// Core fixtures and data
export {
  TestData,
  MessageFixtures,
  MockPort,
  MockChromeRuntime,
  MockChromeStorage,
  MockChromeTabs,
  BackgroundServiceTestEnvironment,
  AssertionHelpers,
  ScenarioBuilder,
} from './BackgroundServiceTestFixtures';

// Service mocks and test doubles
export { ServiceMocks, MockServiceFactory } from './BackgroundServiceMocks';

// Test helpers and environments
export { TestHelpers } from './BackgroundServiceTestHelpers';

// Test specifications and bug detection
export {
  BackgroundServiceTestSpec,
  UsagePatterns,
  BugDetectionScenarios,
  BackgroundServiceBehaviorTestFramework,
} from './BackgroundServiceTestSpecification';

// TempRepoManager test fixtures exports
export {
  TempRepoTestData,
  TempRepoManagerTestEnvironment,
  TempRepoAssertionHelpers,
  TempRepoScenarioBuilder,
  MockUnifiedGitHubService,
  MockOperationStateManager,
  TempRepoMockChromeStorage,
  TempRepoMockChromeTabs,
  MockStatusBroadcaster,
} from './TempRepoManagerTestFixtures';

// TempRepoManager test helpers exports
export {
  TempRepoManagerFactory,
  TempRepoTestLifecycle,
  AsyncOperationHelpers,
  ValidationHelpers,
  DebuggingHelpers,
  PerformanceHelpers,
} from './TempRepoManagerTestHelpers';

// TempRepoManager mock coordination exports
export {
  TempRepoMockServiceFactory,
  MockBehaviorOrchestrator,
  MockVerificationUtilities,
} from './TempRepoManagerMocks';

export {
  TestStrategy as TempRepoTestStrategy,
  TestScenarios as TempRepoTestScenarios,
  SuccessCriteria as TempRepoSuccessCriteria,
  CoverageRequirements as TempRepoCoverageRequirements,
} from './TempRepoManagerTestSpecification';

// Re-export specific types for easier consumption
export type { Message, UploadStatusState } from '../../lib/types';

// =============================================================================
// UNIFIED TEST SUITE INTERFACE
// =============================================================================

/**
 * Main interface for BackgroundService testing.
 * Provides a fluent API for setting up and executing comprehensive tests.
 */
export class BackgroundServiceTestSuite {
  private testBuilder: BackgroundServiceBehaviorTestFramework;
  private environment: BackgroundServiceIntegrationEnvironment;
  private errorInjector: ErrorInjectionHelper;
  private performanceHelper: PerformanceTestHelper;
  private isSetup = false;

  constructor() {
    this.testBuilder = new BackgroundServiceBehaviorTestFramework();
    this.environment = new TestHelpers.BackgroundServiceIntegrationEnvironment();
    this.errorInjector = new TestHelpers.ErrorInjectionHelper(
      this.environment.chromeEnv,
      this.environment.serviceFactory
    );
    this.performanceHelper = new TestHelpers.PerformanceTestHelper();
  }

  /**
   * Initialize the test environment
   */
  async setup(): Promise<void> {
    if (this.isSetup) return;

    await this.environment.setup();
    this.isSetup = true;
  }

  /**
   * Clean up the test environment
   */
  async teardown(): Promise<void> {
    if (!this.isSetup) return;

    await this.environment.teardown();
    this.performanceHelper.reset();
    this.isSetup = false;
  }

  /**
   * Run a specific usage pattern test
   */
  async runUsagePattern(patternName: keyof typeof UsagePatterns): Promise<boolean> {
    if (!this.isSetup) await this.setup();

    try {
      const pattern = UsagePatterns[patternName];
      await pattern.simulatePattern(new TestHelpers.BackgroundServiceTestSuiteBuilder());
      return true;
    } catch (error) {
      console.error(`Usage pattern ${String(patternName)} failed:`, error);
      return false;
    }
  }

  /**
   * Run bug detection scenarios
   */
  async detectBugs(
    category: keyof typeof BugDetectionScenarios,
    scenario?: string
  ): Promise<{ [key: string]: boolean }> {
    if (!this.isSetup) await this.setup();

    const results: { [key: string]: boolean } = {};
    const categoryScenarios = BugDetectionScenarios[category];

    for (const [scenarioName, scenarioFn] of Object.entries(categoryScenarios)) {
      if (scenario && scenarioName !== scenario) continue;

      try {
        const testSuiteBuilder = new TestHelpers.BackgroundServiceTestSuiteBuilder();
        await testSuiteBuilder.setupTest();

        const result = await (scenarioFn as any)(testSuiteBuilder);
        results[scenarioName] = result;

        await testSuiteBuilder.teardownTest();
      } catch (error) {
        console.error(`Bug detection ${String(category)}:${scenarioName} failed:`, error);
        results[scenarioName] = false;
      }
    }

    return results;
  }

  /**
   * Measure performance of operations
   */
  async measurePerformance<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    if (!this.isSetup) await this.setup();

    this.performanceHelper.startTimer(operationName);
    const result = await operation();
    const duration = this.performanceHelper.endTimer(operationName);

    return { result, duration };
  }

  /**
   * Fluent interface for building custom test scenarios
   */
  withAuthentication(method: 'pat' | 'github_app'): BackgroundServiceTestScenarioBuilder {
    return new BackgroundServiceTestScenarioBuilder(this.environment).withAuthentication(method);
  }

  /**
   * Run comprehensive test suite
   */
  async runComprehensiveTests(): Promise<string> {
    await this.testBuilder.runAllUsagePatterns();
    await this.testBuilder.runAllBugDetectionScenarios();

    return this.testBuilder.generateReport();
  }

  /**
   * Get direct access to test environment for advanced scenarios
   */
  getEnvironment(): BackgroundServiceIntegrationEnvironment {
    return this.environment;
  }

  /**
   * Get error injection helper for failure testing
   */
  getErrorInjector(): ErrorInjectionHelper {
    return this.errorInjector;
  }

  /**
   * Get performance measurement helper
   */
  getPerformanceHelper(): PerformanceTestHelper {
    return this.performanceHelper;
  }
}

// =============================================================================
// FLUENT SCENARIO BUILDER
// =============================================================================

/**
 * Fluent interface for building custom test scenarios
 */
export class BackgroundServiceTestScenarioBuilder {
  private environment: BackgroundServiceIntegrationEnvironment;
  private config: {
    authentication?: 'pat' | 'github_app';
    networkConditions?: 'normal' | 'slow' | 'failing' | 'intermittent';
    concurrentOperations?: number;
    errorInjection?: Array<string>;
    performanceTracking?: boolean;
  } = {};

  constructor(environment: BackgroundServiceIntegrationEnvironment) {
    this.environment = environment;
  }

  withAuthentication(method: 'pat' | 'github_app'): this {
    this.config.authentication = method;
    return this;
  }

  withNetworkConditions(conditions: 'normal' | 'slow' | 'failing' | 'intermittent'): this {
    this.config.networkConditions = conditions;
    return this;
  }

  withConcurrentOperations(count: number): this {
    this.config.concurrentOperations = count;
    return this;
  }

  withErrorInjection(...errors: string[]): this {
    this.config.errorInjection = errors;
    return this;
  }

  withPerformanceTracking(): this {
    this.config.performanceTracking = true;
    return this;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Apply configuration
    this.applyConfiguration();

    // Execute operation
    const result = await operation();

    return result;
  }

  private applyConfiguration(): void {
    // Setup authentication
    if (this.config.authentication === 'pat') {
      this.environment.chromeEnv.setupValidPATAuth();
    } else if (this.config.authentication === 'github_app') {
      this.environment.chromeEnv.setupValidGitHubAppAuth();
    }

    // Setup network conditions
    const errorInjector = new TestHelpers.ErrorInjectionHelper(
      this.environment.chromeEnv,
      this.environment.serviceFactory
    );

    switch (this.config.networkConditions) {
      case 'slow':
        this.environment.chromeEnv.setupSlowNetwork(TestData.performance.highLatency);
        break;
      case 'failing':
        errorInjector.injectNetworkTimeout();
        break;
      case 'intermittent':
        errorInjector.injectIntermittentNetworkFailure();
        break;
    }

    // Apply error injection
    if (this.config.errorInjection) {
      this.config.errorInjection.forEach((error) => {
        switch (error) {
          case 'github_auth':
            errorInjector.injectGitHubAuthFailure();
            break;
          case 'zip_processing':
            errorInjector.injectZipProcessingFailure();
            break;
          case 'chrome_storage':
            errorInjector.injectChromeStorageFailure();
            break;
          case 'rate_limit':
            errorInjector.injectGitHubRateLimit();
            break;
        }
      });
    }
  }
}

// =============================================================================
// PRESET TEST SCENARIOS
// =============================================================================

/**
 * Common test scenarios that can be run directly
 */
export const PresetScenarios = {
  /**
   * Test the complete user journey from extension install to successful upload
   */
  async completeUserJourney(): Promise<boolean> {
    const testSuite = new BackgroundServiceTestSuite();

    try {
      await testSuite.setup();

      // Fresh install
      const result = await testSuite
        .withAuthentication('pat')
        .withNetworkConditions('normal')
        .execute(async () => {
          const env = testSuite.getEnvironment();

          // Simulate fresh install
          ScenarioBuilder.freshInstall(env.chromeEnv);

          // Setup authentication
          env.chromeEnv.setupValidPATAuth();

          // Simulate ZIP upload
          await env.simulateSuccessfulZipUpload();

          return true;
        });

      await testSuite.teardown();
      return result;
    } catch (error) {
      await testSuite.teardown();
      return false;
    }
  },

  /**
   * Test high-stress scenarios with multiple concurrent operations
   */
  async highStressTest(): Promise<{ success: boolean; metrics: any }> {
    const testSuite = new BackgroundServiceTestSuite();

    try {
      await testSuite.setup();

      const metrics = await testSuite.measurePerformance('high_stress', async () => {
        return await testSuite
          .withAuthentication('github_app')
          .withConcurrentOperations(5)
          .withPerformanceTracking()
          .execute(async () => {
            const env = testSuite.getEnvironment();
            const concurrentHelper = new TestHelpers.ConcurrentOperationHelper();

            // Multiple concurrent uploads
            await concurrentHelper.simulateMultipleZipUploads(env.chromeEnv, 5);

            // Port connection churn
            await concurrentHelper.simulatePortConnectionChurn(env.chromeEnv, 3, 4);

            return true;
          });
      });

      await testSuite.teardown();
      return { success: metrics.result, metrics };
    } catch (error) {
      await testSuite.teardown();
      return { success: false, metrics: null };
    }
  },

  /**
   * Test error recovery and resilience
   */
  async errorRecoveryTest(): Promise<{ recoveredFromErrors: string[]; failedToRecover: string[] }> {
    const testSuite = new BackgroundServiceTestSuite();
    const recoveredFromErrors: string[] = [];
    const failedToRecover: string[] = [];

    const errorTypes = ['github_auth', 'zip_processing', 'chrome_storage', 'rate_limit'];

    try {
      await testSuite.setup();

      for (const errorType of errorTypes) {
        try {
          await testSuite
            .withAuthentication('pat')
            .withErrorInjection(errorType)
            .execute(async () => {
              const env = testSuite.getEnvironment();

              // Try operation (should fail)
              try {
                await env.simulateSuccessfulZipUpload();
              } catch (error) {
                // Expected to fail
              }

              // Recovery - remove error injection and try again
              env.serviceFactory.setupSuccessfulUploadScenario();
              await env.simulateSuccessfulZipUpload();

              return true;
            });

          recoveredFromErrors.push(errorType);
        } catch (error) {
          failedToRecover.push(errorType);
        }
      }

      await testSuite.teardown();
    } catch (error) {
      await testSuite.teardown();
      failedToRecover.push(...errorTypes.filter((e) => !recoveredFromErrors.includes(e)));
    }

    return { recoveredFromErrors, failedToRecover };
  },
};

// =============================================================================
// TEMPREPOMANAGER CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick setup function for TempRepoManager test scenarios
 *
 * @param scenario - The test scenario to set up
 * @returns Configured test environment and TempRepoManager instance
 */
export function quickSetupTempRepo(scenario: 'success' | 'failure' | 'existing' = 'success') {
  const lifecycle = new TempRepoTestLifecycle();
  const env = lifecycle.beforeEach();
  const manager = lifecycle.createManager(scenario);

  return {
    env,
    manager,
    cleanup: () => lifecycle.afterEach(),
  };
}

/**
 * Create a fully mocked TempRepoManager test environment
 *
 * @returns Complete test environment with all mocks configured
 */
export function createTempRepoMockedEnvironment() {
  const env = new TempRepoManagerTestEnvironment();
  env.setup();
  return env;
}

/**
 * Verify TempRepoManager test expectations across all mock services
 *
 * @param env - Test environment to verify
 * @param expectations - Expected behaviors to check
 */
export function verifyTempRepoExpectations(
  env: TempRepoManagerTestEnvironment,
  expectations: {
    statusSequence?: UploadStatusState['status'][];
    storageOperations?: { gets?: number; sets?: number };
    operationTracking?: { started?: number; completed?: number; failed?: number };
    tabsCreated?: number;
  }
) {
  // Verify status sequence if expected
  if (expectations.statusSequence) {
    TempRepoAssertionHelpers.expectStatusSequence(
      env.mockStatusBroadcaster,
      expectations.statusSequence
    );
  }

  // Verify storage operations if expected
  if (expectations.storageOperations) {
    MockVerificationUtilities.verifyStorageOperations(
      env.mockStorage,
      expectations.storageOperations
    );
  }

  // Verify operation tracking if expected
  if (expectations.operationTracking) {
    const { started = 0, completed = 0, failed = 0 } = expectations.operationTracking;

    expect(env.mockOperationStateManager.getOperationsByStatus('started')).toHaveLength(started);
    expect(env.mockOperationStateManager.getOperationsByStatus('completed')).toHaveLength(
      completed
    );
    expect(env.mockOperationStateManager.getOperationsByStatus('failed')).toHaveLength(failed);
  }

  // Verify tabs created if expected
  if (expectations.tabsCreated !== undefined) {
    expect(env.mockTabs.getCreatedTabs()).toHaveLength(expectations.tabsCreated);
  }
}

// =============================================================================
// QUICK START EXAMPLES
// =============================================================================

/**
 * Quick start examples for common testing scenarios
 */
export const QuickStart = {
  /**
   * Example: Basic ZIP upload test
   */
  basicUploadTest: `
    import { BackgroundServiceTestSuite } from './fixtures';
    
    describe('BackgroundService ZIP Upload', () => {
      let testSuite: BackgroundServiceTestSuite;
      
      beforeEach(async () => {
        testSuite = new BackgroundServiceTestSuite();
        await testSuite.setup();
      });
      
      afterEach(async () => {
        await testSuite.teardown();
      });
      
      it('should successfully upload ZIP file', async () => {
        const success = await testSuite
          .withAuthentication('pat')
          .withNetworkConditions('normal')
          .execute(async () => {
            const env = testSuite.getEnvironment();
            await env.simulateSuccessfulZipUpload();
            return true;
          });
        
        expect(success).toBe(true);
      });
    });
  `,

  /**
   * Example: Error handling test
   */
  errorHandlingTest: `
    import { BackgroundServiceTestSuite } from './fixtures';
    
    it('should handle GitHub authentication failures gracefully', async () => {
      const testSuite = new BackgroundServiceTestSuite();
      await testSuite.setup();
      
      try {
        await testSuite
          .withAuthentication('pat')
          .withErrorInjection('github_auth')
          .execute(async () => {
            const env = testSuite.getEnvironment();
            await env.simulateFailedZipUpload();
            
            // Verify error was handled properly
            const operations = env.serviceFactory.operationStateManager.getAllOperations();
            const failedOps = operations.filter(op => op.status === 'failed');
            expect(failedOps.length).toBeGreaterThan(0);
          });
      } finally {
        await testSuite.teardown();
      }
    });
  `,

  /**
   * Example: Performance test
   */
  performanceTest: `
    import { BackgroundServiceTestSuite } from './fixtures';
    
    it('should complete upload within performance threshold', async () => {
      const testSuite = new BackgroundServiceTestSuite();
      await testSuite.setup();
      
      try {
        const { duration } = await testSuite.measurePerformance('upload', async () => {
          const env = testSuite.getEnvironment();
          await env.simulateSuccessfulZipUpload();
          return true;
        });
        
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      } finally {
        await testSuite.teardown();
      }
    });
  `,
};

// Export everything for easy access
export default {
  BackgroundServiceTestSuite,
  BackgroundServiceTestScenarioBuilder,
  PresetScenarios,
  QuickStart,
};
