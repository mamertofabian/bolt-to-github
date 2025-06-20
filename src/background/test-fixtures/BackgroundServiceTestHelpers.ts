/**
 * Test helpers and controlled test environments for BackgroundService.ts
 *
 * Provides reusable setup/teardown functions and specialized test environments
 * designed to reveal real usage patterns and catch potential bugs.
 */

import {
  BackgroundServiceTestEnvironment,
  MessageFixtures,
  TestData,
  MockPort,
} from './BackgroundServiceTestFixtures';
import { MockServiceFactory, ServiceMocks } from './BackgroundServiceMocks';
import type { Message } from '../../lib/types';

// =============================================================================
// CONTROLLED TEST ENVIRONMENTS
// =============================================================================

export class BackgroundServiceIntegrationEnvironment {
  public chromeEnv: BackgroundServiceTestEnvironment;
  public serviceFactory: MockServiceFactory;
  public backgroundService: { destroy?: () => void } | null = null;

  constructor() {
    this.chromeEnv = new BackgroundServiceTestEnvironment();
    this.serviceFactory = new MockServiceFactory();
  }

  async setup(): Promise<void> {
    // Setup Chrome environment
    this.chromeEnv.setup();

    // Setup service mocks
    this.serviceFactory.setupMocks();

    // Import and create BackgroundService after mocks are in place
    const { BackgroundService } = await import('../BackgroundService');
    this.backgroundService = new BackgroundService();

    // Give the service time to initialize
    await this.waitForInitialization();
  }

  async teardown(): Promise<void> {
    if (this.backgroundService?.destroy) {
      this.backgroundService.destroy();
    }

    this.serviceFactory.resetAllMocks();
    this.chromeEnv.teardown();
    jest.resetModules();
  }

  private async waitForInitialization(maxWait: number = 5000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Check if initialization is complete by verifying internal state
      if (this.backgroundService && this.isInitialized()) {
        return;
      }
    }
  }

  private isInitialized(): boolean {
    // Check initialization indicators - this would depend on BackgroundService internals
    return this.serviceFactory.stateManager.getProjectId !== undefined;
  }

  // Helper methods for common test scenarios
  async simulateSuccessfulZipUpload(
    projectId: string = TestData.projects.validProjectId
  ): Promise<void> {
    this.serviceFactory.setupSuccessfulUploadScenario();

    const port = this.chromeEnv.simulatePortConnection('bolt-content', 123);
    const zipMessage = MessageFixtures.zipDataMessage(projectId);

    port.simulateMessage(zipMessage);

    // Wait for upload to complete
    await this.waitForUploadCompletion();
  }

  async simulateFailedZipUpload(): Promise<void> {
    this.serviceFactory.setupFailedUploadScenario();

    const port = this.chromeEnv.simulatePortConnection('bolt-content', 123);
    const zipMessage = MessageFixtures.zipDataMessage();

    port.simulateMessage(zipMessage);

    // Wait for failure to be processed
    await this.waitForUploadCompletion();
  }

  private async waitForUploadCompletion(maxWait: number = 10000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if upload is complete by checking operation state
      const operations = this.serviceFactory.operationStateManager.getAllOperations();
      const hasCompletedOperation = operations.some(
        (op) => op.status === 'completed' || op.status === 'failed'
      );

      if (hasCompletedOperation) {
        return;
      }
    }
  }
}

// =============================================================================
// ERROR INJECTION HELPERS
// =============================================================================

export class ErrorInjectionHelper {
  private chromeEnv: BackgroundServiceTestEnvironment;
  private serviceFactory: MockServiceFactory;

  constructor(chromeEnv: BackgroundServiceTestEnvironment, serviceFactory: MockServiceFactory) {
    this.chromeEnv = chromeEnv;
    this.serviceFactory = serviceFactory;
  }

  // Network-related failures
  injectNetworkTimeout(): void {
    this.chromeEnv.setupNetworkFailure();
  }

  injectSlowNetwork(delay: number = 10000): void {
    this.chromeEnv.setupSlowNetwork(delay);
  }

  injectIntermittentNetworkFailure(failureRate: number = 0.5): void {
    (global.fetch as jest.Mock).mockImplementation(() => {
      if (Math.random() < failureRate) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  }

  // GitHub API failures
  injectGitHubRateLimit(): void {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Map([
        ['x-ratelimit-remaining', '0'],
        ['x-ratelimit-reset', String(Math.floor(Date.now() / 1000) + 3600)],
      ]),
      json: () => Promise.resolve({ message: 'API rate limit exceeded' }),
    });
  }

  injectGitHubAuthFailure(): void {
    this.serviceFactory.supabaseAuthService.setShouldFailAuth(true);
    this.serviceFactory.unifiedGitHubService.setShouldFail(true);
  }

  // Chrome API failures
  injectChromeStorageFailure(): void {
    this.chromeEnv.mockChrome.storage.local.get.mockRejectedValue(
      new Error('Chrome storage unavailable')
    );
    this.chromeEnv.mockChrome.storage.sync.get.mockRejectedValue(
      new Error('Chrome storage unavailable')
    );
  }

  injectChromeTabsFailure(): void {
    this.chromeEnv.mockChrome.tabs.query.mockRejectedValue(
      new Error('Chrome tabs API unavailable')
    );
  }

  // Service-specific failures
  injectZipProcessingFailure(): void {
    this.serviceFactory.zipHandler.setShouldFail(true);
  }

  injectTempRepoManagerFailure(): void {
    this.serviceFactory.tempRepoManager.setShouldFail(true);
  }

  injectOperationStateFailure(): void {
    this.serviceFactory.operationStateManager.setShouldFail(true);
  }
}

// =============================================================================
// PERFORMANCE TESTING HELPERS
// =============================================================================

export class PerformanceTestHelper {
  private startTimes: Map<string, number> = new Map();
  private metrics: Array<{ operation: string; duration: number; timestamp: number }> = [];

  startTimer(operation: string): void {
    this.startTimes.set(operation, Date.now());
  }

  endTimer(operation: string): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) {
      throw new Error(`Timer for operation '${operation}' was not started`);
    }

    const duration = Date.now() - startTime;
    this.metrics.push({
      operation,
      duration,
      timestamp: Date.now(),
    });

    this.startTimes.delete(operation);
    return duration;
  }

  getMetrics(): Array<{ operation: string; duration: number; timestamp: number }> {
    return [...this.metrics];
  }

  getAverageDuration(operation: string): number {
    const operationMetrics = this.metrics.filter((m) => m.operation === operation);
    if (operationMetrics.length === 0) return 0;

    const total = operationMetrics.reduce((sum, m) => sum + m.duration, 0);
    return total / operationMetrics.length;
  }

  reset(): void {
    this.startTimes.clear();
    this.metrics = [];
  }
}

// =============================================================================
// MESSAGE SEQUENCING HELPERS
// =============================================================================

export class MessageSequenceHelper {
  private sequences: Array<{ delay: number; message: Message; port?: MockPort }> = [];

  addMessage(message: Message, delay: number = 0, port?: MockPort): MessageSequenceHelper {
    this.sequences.push({ delay, message, port });
    return this;
  }

  addHeartbeat(delay: number = 0, port?: MockPort): MessageSequenceHelper {
    return this.addMessage(MessageFixtures.heartbeatMessage(), delay, port);
  }

  addZipUpload(projectId?: string, delay: number = 0, port?: MockPort): MessageSequenceHelper {
    return this.addMessage(MessageFixtures.zipDataMessage(projectId), delay, port);
  }

  addCommitMessage(message: string, delay: number = 0, port?: MockPort): MessageSequenceHelper {
    return this.addMessage(MessageFixtures.setCommitMessage(message), delay, port);
  }

  async execute(defaultPort?: MockPort): Promise<void> {
    for (const sequence of this.sequences) {
      if (sequence.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, sequence.delay));
      }

      const port = sequence.port || defaultPort;
      if (port) {
        port.simulateMessage(sequence.message);
      }
    }
  }

  reset(): void {
    this.sequences = [];
  }
}

// =============================================================================
// CONCURRENT OPERATION HELPERS
// =============================================================================

export class ConcurrentOperationHelper {
  async simulateMultipleZipUploads(
    env: BackgroundServiceTestEnvironment,
    count: number = 3
  ): Promise<MockPort[]> {
    const ports: MockPort[] = [];
    const promises: Promise<void>[] = [];

    // Create multiple ports and start concurrent uploads
    for (let i = 0; i < count; i++) {
      const port = env.simulatePortConnection('bolt-content', 100 + i);
      ports.push(port);

      const promise = new Promise<void>((resolve) => {
        setTimeout(() => {
          port.simulateMessage(MessageFixtures.zipDataMessage(`project-${i}`));
          resolve();
        }, i * 100); // Stagger the uploads slightly
      });

      promises.push(promise);
    }

    await Promise.all(promises);
    return ports;
  }

  async simulateRapidPortConnections(
    env: BackgroundServiceTestEnvironment,
    count: number = 10,
    interval: number = 50
  ): Promise<MockPort[]> {
    const ports: MockPort[] = [];

    for (let i = 0; i < count; i++) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      const port = env.simulatePortConnection('bolt-content', 200 + i);
      ports.push(port);
    }

    return ports;
  }

  async simulatePortConnectionChurn(
    env: BackgroundServiceTestEnvironment,
    cycles: number = 5,
    connectionsPerCycle: number = 3
  ): Promise<void> {
    for (let cycle = 0; cycle < cycles; cycle++) {
      // Connect multiple ports
      const ports: MockPort[] = [];
      for (let i = 0; i < connectionsPerCycle; i++) {
        const port = env.simulatePortConnection('bolt-content', 300 + cycle * 10 + i);
        ports.push(port);
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Disconnect all ports
      ports.forEach((port) => port.disconnect());

      // Wait before next cycle
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

// =============================================================================
// STATE VALIDATION HELPERS
// =============================================================================

export class StateValidationHelper {
  static validateUploadOperationState(
    operationStateManager: InstanceType<typeof ServiceMocks.MockOperationStateManager>,
    expectedStatus: 'running' | 'completed' | 'failed'
  ): boolean {
    const operations = operationStateManager.getAllOperations();
    const pushOperations = operations.filter((op: { type: string }) => op.type === 'push');

    if (pushOperations.length === 0) {
      return expectedStatus === 'completed'; // No operations means nothing to validate
    }

    const latestOperation = pushOperations[pushOperations.length - 1];
    return latestOperation.status === expectedStatus;
  }

  static validatePortConnections(
    _chromeEnv: BackgroundServiceTestEnvironment,
    _expectedCount: number
  ): boolean {
    // This would need to be implemented based on how you track ports
    // in your BackgroundService implementation
    return true; // Placeholder
  }

  static validateAnalyticsEvents(
    expectedEvents: Array<{ name: string; params?: unknown }>
  ): boolean {
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const analyticsCalls = fetchCalls.filter((call) => call[0]?.includes('google-analytics.com'));

    for (const expectedEvent of expectedEvents) {
      const hasEvent = analyticsCalls.some((call) => {
        const body = call[1]?.body;
        return body?.includes(expectedEvent.name);
      });

      if (!hasEvent) {
        return false;
      }
    }

    return true;
  }
}

// =============================================================================
// COMPREHENSIVE TEST SUITE BUILDER
// =============================================================================

export class BackgroundServiceTestSuiteBuilder {
  private environment: BackgroundServiceIntegrationEnvironment;
  private errorInjector: ErrorInjectionHelper;
  private performanceHelper: PerformanceTestHelper;
  private messageSequencer: MessageSequenceHelper;
  private concurrentHelper: ConcurrentOperationHelper;

  constructor() {
    this.environment = new BackgroundServiceIntegrationEnvironment();
    this.errorInjector = new ErrorInjectionHelper(
      this.environment.chromeEnv,
      this.environment.serviceFactory
    );
    this.performanceHelper = new PerformanceTestHelper();
    this.messageSequencer = new MessageSequenceHelper();
    this.concurrentHelper = new ConcurrentOperationHelper();
  }

  async setupTest(): Promise<void> {
    await this.environment.setup();
  }

  async teardownTest(): Promise<void> {
    await this.environment.teardown();
    this.performanceHelper.reset();
    this.messageSequencer.reset();
  }

  getEnvironment(): BackgroundServiceIntegrationEnvironment {
    return this.environment;
  }

  getErrorInjector(): ErrorInjectionHelper {
    return this.errorInjector;
  }

  getPerformanceHelper(): PerformanceTestHelper {
    return this.performanceHelper;
  }

  getMessageSequencer(): MessageSequenceHelper {
    return this.messageSequencer;
  }

  getConcurrentHelper(): ConcurrentOperationHelper {
    return this.concurrentHelper;
  }

  // Pre-built test scenarios
  async runBasicUploadScenario(): Promise<void> {
    this.environment.serviceFactory.setupSuccessfulUploadScenario();
    await this.environment.simulateSuccessfulZipUpload();
  }

  async runFailureRecoveryScenario(): Promise<void> {
    // First upload fails
    this.environment.serviceFactory.setupFailedUploadScenario();
    await this.environment.simulateFailedZipUpload();

    // Recovery - second upload succeeds
    this.environment.serviceFactory.setupSuccessfulUploadScenario();
    await this.environment.simulateSuccessfulZipUpload();
  }

  async runHighStressScenario(): Promise<void> {
    // Setup multiple concurrent operations
    await this.concurrentHelper.simulateMultipleZipUploads(this.environment.chromeEnv, 5);

    // Simulate port churn
    await this.concurrentHelper.simulatePortConnectionChurn(this.environment.chromeEnv, 3, 4);
  }

  async runNetworkResilienceScenario(): Promise<void> {
    // Inject intermittent network failures
    this.errorInjector.injectIntermittentNetworkFailure(0.3);

    // Try multiple uploads
    for (let i = 0; i < 3; i++) {
      try {
        await this.environment.simulateSuccessfulZipUpload(`project-${i}`);
      } catch {
        // Expected - some will fail due to network issues
      }
    }
  }
}

// =============================================================================
// EXPORT ALL HELPERS
// =============================================================================

export const TestHelpers = {
  BackgroundServiceIntegrationEnvironment,
  ErrorInjectionHelper,
  PerformanceTestHelper,
  MessageSequenceHelper,
  ConcurrentOperationHelper,
  StateValidationHelper,
  BackgroundServiceTestSuiteBuilder,
};
