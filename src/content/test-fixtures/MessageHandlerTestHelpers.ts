/**
 * MessageHandlerTestHelpers
 *
 * Test setup, teardown, and utility functions for MessageHandler testing.
 * Provides controlled test environments and helper functions to simplify
 * test implementation and ensure consistent test setup across different scenarios.
 */

import type { Message, MessageType } from '$lib/types';
import type { MockedFunction } from 'vitest';
import { MessageHandler } from '../MessageHandler';
import { BehaviorVerifier, MockChromeEnvironment, MockChromePort } from './MessageHandlerMocks';
import {
  MessageFactory,
  ScenarioBuilder,
  TestData,
  TimingHelpers,
} from './MessageHandlerTestFixtures';

// =============================================================================
// TEST ENVIRONMENT MANAGER
// =============================================================================

export class MessageHandlerTestEnvironment {
  public mockEnvironment: MockChromeEnvironment;
  public messageHandler: MessageHandler | null = null;
  public currentPort: MockChromePort | null = null;

  private cleanupTasks: Array<() => void> = [];
  private timers: Array<NodeJS.Timeout> = [];
  private performanceMarkers: Map<string, number> = new Map();

  constructor(
    options: {
      runtimeOptions?: {
        id?: string;
        invalidated?: boolean;
        shouldThrowOnAccess?: boolean;
      };
    } = {}
  ) {
    this.mockEnvironment = new MockChromeEnvironment(options);
  }

  // =============================================================================
  // SETUP AND TEARDOWN
  // =============================================================================

  async setup(): Promise<void> {
    this.mockEnvironment.setup();
    this.startPerformanceTracking();

    // Ensure window is properly mocked globally for MessageHandler
    if (typeof window === 'undefined') {
      (global as unknown as { window: unknown }).window = this.mockEnvironment.window;
    }

    // Add cleanup for timers
    this.addCleanupTask(() => {
      this.timers.forEach((timer) => clearTimeout(timer));
      this.timers = [];
    });
  }

  async teardown(): Promise<void> {
    // Execute all cleanup tasks
    this.cleanupTasks.forEach((task) => {
      try {
        task();
      } catch (error) {
        console.warn('Cleanup task failed:', error);
      }
    });
    this.cleanupTasks = [];

    // Reset message handler
    if (this.messageHandler) {
      this.messageHandler.clearQueue();
      this.messageHandler = null;
    }

    // Reset port
    if (this.currentPort) {
      this.currentPort.disconnect();
      this.currentPort = null;
    }

    this.mockEnvironment.teardown();
    this.stopPerformanceTracking();
  }

  addCleanupTask(task: () => void): void {
    this.cleanupTasks.push(task);
  }

  // =============================================================================
  // MESSAGE HANDLER CREATION AND MANAGEMENT
  // =============================================================================

  createMessageHandler(port?: MockChromePort): MessageHandler {
    const portToUse = port || this.createHealthyPort();
    this.currentPort = portToUse;
    this.messageHandler = new MessageHandler(portToUse as unknown as chrome.runtime.Port);

    return this.messageHandler;
  }

  createHealthyPort(name: string = 'bolt-content', tabId: number = 123): MockChromePort {
    return this.mockEnvironment.createConnectedPort(name, tabId);
  }

  createDisconnectedPort(name: string = 'bolt-content'): MockChromePort {
    return this.mockEnvironment.createDisconnectedPort(name);
  }

  createPortWithError(errorMessage: string = 'Port disconnected'): MockChromePort {
    return this.mockEnvironment.createPortWithPostMessageError(errorMessage);
  }

  createPortThatWillDisconnect(delayMs: number): MockChromePort {
    return this.mockEnvironment.createPortThatWillDisconnect(delayMs);
  }

  updatePortConnection(newPort?: MockChromePort): void {
    if (!this.messageHandler) {
      throw new Error('MessageHandler not initialized. Call createMessageHandler() first.');
    }

    const portToUse = newPort || this.createHealthyPort();
    this.currentPort = portToUse;
    this.messageHandler.updatePort(portToUse as unknown as chrome.runtime.Port);
  }

  // =============================================================================
  // SCENARIO SETUP HELPERS
  // =============================================================================

  async setupNormalOperationScenario(): Promise<void> {
    this.createMessageHandler();
    await this.waitForSetupComplete();
  }

  async setupPortDisconnectionScenario(): Promise<void> {
    const port = this.createHealthyPort();
    this.createMessageHandler(port);
    await this.waitForSetupComplete();

    // Disconnect the port after setup
    port.simulateDisconnect();
  }

  async setupContextInvalidationScenario(): Promise<void> {
    this.createMessageHandler();
    await this.waitForSetupComplete();

    // Invalidate the Chrome runtime
    this.mockEnvironment.simulateExtensionContextInvalidation();
  }

  async setupRapidReconnectionScenario(reconnectDelayMs: number = 100): Promise<void> {
    const initialPort = this.createHealthyPort();
    this.createMessageHandler(initialPort);
    await this.waitForSetupComplete();

    // Schedule disconnection and reconnection
    this.scheduleDelayedAction(() => {
      initialPort.simulateDisconnect();
    }, 50);

    this.scheduleDelayedAction(() => {
      this.updatePortConnection();
    }, 50 + reconnectDelayMs);
  }

  async setupHighFrequencyMessageScenario(messageCount: number = 100): Promise<void> {
    this.createMessageHandler();
    await this.waitForSetupComplete();

    // Pre-fill the queue with messages while disconnected
    const port = this.createDisconnectedPort();
    this.updatePortConnection(port);

    for (let i = 0; i < messageCount; i++) {
      this.messageHandler!.sendDebugMessage(`High frequency message ${i + 1}`);
    }
  }

  async setupMemoryLeakScenario(): Promise<void> {
    this.createMessageHandler();
    await this.waitForSetupComplete();

    // Set up rapid port updates to test for listener leaks
    for (let i = 0; i < 50; i++) {
      this.scheduleDelayedAction(() => {
        this.updatePortConnection();
      }, i * 10);
    }
  }

  // =============================================================================
  // MESSAGE SENDING HELPERS
  // =============================================================================

  sendTestMessage(type: MessageType, data?: unknown): void {
    if (!this.messageHandler) {
      throw new Error('MessageHandler not initialized');
    }
    this.messageHandler.sendMessage(type, data);
  }

  sendMessageSequence(messages: Message[], intervalMs: number = 10): Promise<void> {
    return new Promise((resolve) => {
      let index = 0;

      const sendNext = () => {
        if (index >= messages.length) {
          resolve();
          return;
        }

        const message = messages[index++];
        this.sendTestMessage(message.type, 'data' in message ? message.data : message.feature);

        if (index < messages.length) {
          this.scheduleDelayedAction(sendNext, intervalMs);
        } else {
          resolve();
        }
      };

      sendNext();
    });
  }

  sendBurstMessages(
    count: number,
    type: MessageType = 'DEBUG',
    intervalMs: number = 1
  ): Promise<void> {
    const messages = MessageFactory.createPerformanceMessages(count, type);

    if (intervalMs === 0 || intervalMs === 1) {
      // Send all messages synchronously for performance tests
      messages.forEach((msg) =>
        this.sendTestMessage(msg.type, 'data' in msg ? msg.data : msg.feature)
      );
      return Promise.resolve();
    }

    return this.sendMessageSequence(messages, intervalMs);
  }

  sendZipDataMessage(data?: string, projectId?: string): void {
    const zipData = data || TestData.messages.zipData.data.data;
    this.messageHandler?.sendZipData(zipData, projectId);
  }

  sendCommitMessage(message?: string): void {
    const commitMessage = message || TestData.messages.setCommitMessage.data.message;
    this.messageHandler?.sendCommitMessage(commitMessage);
  }

  sendDebugMessage(message?: string): void {
    const debugMessage = message || 'Test debug message';
    this.messageHandler?.sendDebugMessage(debugMessage);
  }

  // =============================================================================
  // ASSERTION HELPERS
  // =============================================================================

  assertConnectionState(expectedConnected: boolean): void {
    if (!this.messageHandler) {
      throw new Error('MessageHandler not initialized');
    }

    const status = this.messageHandler.getConnectionStatus();
    expect(status.connected).toBe(expectedConnected);
  }

  assertQueueLength(expectedLength: number): void {
    if (!this.messageHandler) {
      throw new Error('MessageHandler not initialized');
    }

    const status = this.messageHandler.getConnectionStatus();
    expect(status.queuedMessages).toBe(expectedLength);
  }

  assertPortMessageSent(expectedType: MessageType, expectedData?: unknown): void {
    if (!this.currentPort) {
      throw new Error('No current port to check');
    }

    BehaviorVerifier.verifyPortMessageSent(this.currentPort, expectedType, expectedData);
  }

  assertCustomEventDispatched(expectedType: string, expectedDetail?: unknown): void {
    const events = this.mockEnvironment.window.getDispatchedEvents();
    const matchingEvent = events.find((e: { type: string }) => e.type === expectedType);

    expect(matchingEvent).toBeDefined();

    if (expectedDetail !== undefined) {
      expect(matchingEvent?.detail).toEqual(expectedDetail);
    }
  }

  assertConsoleOutput(level: 'log' | 'warn' | 'error' | 'debug', expectedMessage: string): void {
    BehaviorVerifier.verifyConsoleOutput(this.mockEnvironment.console, level, expectedMessage);
  }

  assertNoQueuedMessages(): void {
    this.assertQueueLength(0);
  }

  assertMessageWasQueued(): void {
    const status = this.messageHandler?.getConnectionStatus();
    expect(status?.queuedMessages).toBeGreaterThan(0);
  }

  assertPortPostMessageCalled(times: number = 1): void {
    if (!this.currentPort) {
      throw new Error('No current port to check');
    }

    expect(this.currentPort.postMessage).toHaveBeenCalledTimes(times);
  }

  assertPortPostMessageNotCalled(): void {
    this.assertPortPostMessageCalled(0);
  }

  // =============================================================================
  // TIMING AND ASYNC HELPERS
  // =============================================================================

  async waitForSetupComplete(maxWaitMs: number = 100): Promise<void> {
    await TimingHelpers.waitForMs(maxWaitMs);
  }

  async waitForCondition(
    condition: () => boolean,
    timeoutMs: number = 5000,
    intervalMs: number = 10
  ): Promise<void> {
    return TimingHelpers.waitForCondition(condition, timeoutMs, intervalMs);
  }

  async waitForPortDisconnection(): Promise<void> {
    if (!this.currentPort) {
      throw new Error('No current port to monitor');
    }

    return this.waitForCondition(() => !this.currentPort!.isConnected(), 5000);
  }

  async waitForQueueProcessing(): Promise<void> {
    return this.waitForCondition(() => {
      const status = this.messageHandler?.getConnectionStatus();
      return status?.queuedMessages === 0;
    }, 5000);
  }

  scheduleDelayedAction(action: () => void, delayMs: number): void {
    const timer = setTimeout(action, delayMs);
    this.timers.push(timer);
  }

  async executeWithTimeout<T>(
    action: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage?: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage || `Action timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      action()
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  // =============================================================================
  // PERFORMANCE TRACKING
  // =============================================================================

  startPerformanceTracking(): void {
    this.performanceMarkers.set('start', performance.now());
  }

  stopPerformanceTracking(): void {
    this.performanceMarkers.set('end', performance.now());
  }

  markPerformancePoint(label: string): void {
    this.performanceMarkers.set(label, performance.now());
  }

  getPerformanceDuration(startLabel: string = 'start', endLabel: string = 'end'): number {
    const start = this.performanceMarkers.get(startLabel);
    const end = this.performanceMarkers.get(endLabel);

    if (start === undefined || end === undefined) {
      throw new Error(`Performance markers not found: ${startLabel}, ${endLabel}`);
    }

    return end - start;
  }

  getPerformanceReport(): Record<string, number> {
    const report: Record<string, number> = {};
    const markers = Array.from(this.performanceMarkers.entries()).sort((a, b) => a[1] - b[1]);

    for (let i = 1; i < markers.length; i++) {
      const prevLabel = markers[i - 1][0];
      const currentLabel = markers[i][0];
      const duration = markers[i][1] - markers[i - 1][1];
      report[`${prevLabel}_to_${currentLabel}`] = duration;
    }

    return report;
  }

  // =============================================================================
  // MEMORY TRACKING
  // =============================================================================

  getMemorySnapshot(): {
    eventListeners: number;
    timers: number;
    portCallCount: number;
    queueSize: number;
  } {
    return {
      eventListeners: this.mockEnvironment.window.getEventListenerCount(
        'messageHandlerDisconnected'
      ),
      timers: this.timers.length,
      portCallCount: this.currentPort?.getPostMessageCallCount() || 0,
      queueSize: this.messageHandler?.getConnectionStatus().queuedMessages || 0,
    };
  }

  compareMemorySnapshots(
    initial: ReturnType<typeof this.getMemorySnapshot>,
    final: ReturnType<typeof this.getMemorySnapshot>
  ): void {
    BehaviorVerifier.verifyNoMemoryLeaks(
      { listeners: initial.eventListeners, timers: initial.timers },
      { listeners: final.eventListeners, timers: final.timers }
    );
  }

  // =============================================================================
  // ERROR SIMULATION
  // =============================================================================

  simulatePortError(errorMessage: string = 'Port disconnected'): void {
    if (!this.currentPort) {
      throw new Error('No current port to simulate error on');
    }

    this.currentPort.postMessage = vi.fn((_message: unknown): void => {
      throw new Error(errorMessage);
    }) as MockedFunction<(message: unknown) => void>;
  }

  simulateExtensionContextInvalidation(): void {
    this.mockEnvironment.simulateExtensionContextInvalidation();
  }

  simulateRuntimeAccessErrors(): void {
    this.mockEnvironment.simulateRuntimeAccessErrors();
  }

  simulateNetworkError(): void {
    this.simulatePortError('Network error: Failed to connect');
  }

  simulatePortDisconnection(): void {
    if (!this.currentPort) {
      throw new Error('No current port to disconnect');
    }

    this.currentPort.simulateDisconnect();
  }
}

// =============================================================================
// TEST SUITE HELPERS
// =============================================================================

export class TestSuiteHelpers {
  // Helper to create consistent test descriptions
  static describeScenario(
    scenario: string,
    tests: (getEnv: () => MessageHandlerTestEnvironment) => void
  ): void {
    describe(scenario, () => {
      let env: MessageHandlerTestEnvironment;

      beforeEach(async () => {
        env = new MessageHandlerTestEnvironment();
        await env.setup();
      });

      afterEach(async () => {
        await env.teardown();
      });

      tests(() => env);
    });
  }

  // Helper for performance tests
  static describePerformanceScenario(
    scenario: string,
    maxDurationMs: number,
    tests: (env: MessageHandlerTestEnvironment) => Promise<void>
  ): void {
    describe(`Performance: ${scenario}`, () => {
      let env: MessageHandlerTestEnvironment;

      beforeEach(async () => {
        env = new MessageHandlerTestEnvironment();
        await env.setup();
      });

      afterEach(async () => {
        await env.teardown();
      });

      it(`should complete within ${maxDurationMs}ms`, async () => {
        env.markPerformancePoint('test_start');
        await tests(env);
        env.markPerformancePoint('test_end');

        const duration = env.getPerformanceDuration('test_start', 'test_end');
        expect(duration).toBeLessThan(maxDurationMs);
      });
    });
  }

  // Helper for memory leak tests
  static describeMemoryLeakScenario(
    scenario: string,
    tests: (env: MessageHandlerTestEnvironment) => Promise<void>
  ): void {
    describe(`Memory: ${scenario}`, () => {
      let env: MessageHandlerTestEnvironment;

      beforeEach(async () => {
        env = new MessageHandlerTestEnvironment();
        await env.setup();
      });

      afterEach(async () => {
        await env.teardown();
      });

      it('should not leak memory', async () => {
        const initialSnapshot = env.getMemorySnapshot();
        await tests(env);
        const finalSnapshot = env.getMemorySnapshot();

        env.compareMemorySnapshots(initialSnapshot, finalSnapshot);
      });
    });
  }

  // Helper to run the same test across multiple scenarios
  static testAcrossScenarios(
    scenarios: Record<string, () => MessageHandlerTestEnvironment>,
    testName: string,
    testFn: (env: MessageHandlerTestEnvironment) => Promise<void>
  ): void {
    Object.entries(scenarios).forEach(([scenarioName, setupFn]) => {
      describe(`${testName} (${scenarioName})`, () => {
        let env: MessageHandlerTestEnvironment;

        beforeEach(async () => {
          env = setupFn();
          await env.setup();
        });

        afterEach(async () => {
          await env.teardown();
        });

        it(`should work correctly in ${scenarioName}`, async () => {
          await testFn(env);
        });
      });
    });
  }
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

export { BehaviorVerifier, MessageFactory, ScenarioBuilder, TestData, TimingHelpers };

// Common test patterns
export const CommonTestPatterns = {
  async testBasicMessageSending(env: MessageHandlerTestEnvironment): Promise<void> {
    await env.setupNormalOperationScenario();
    env.sendDebugMessage('Test message');
    env.assertPortMessageSent('DEBUG', { message: 'Test message' });
  },

  async testMessageQueueing(env: MessageHandlerTestEnvironment): Promise<void> {
    await env.setupPortDisconnectionScenario();
    env.sendDebugMessage('Queued message');
    env.assertMessageWasQueued();
    env.assertPortPostMessageNotCalled();
  },

  async testQueueProcessingOnReconnection(env: MessageHandlerTestEnvironment): Promise<void> {
    await env.setupPortDisconnectionScenario();
    env.sendDebugMessage('Queued message');
    env.updatePortConnection();
    await env.waitForQueueProcessing();
    env.assertNoQueuedMessages();
    env.assertPortPostMessageCalled();
  },

  async testContextInvalidationHandling(env: MessageHandlerTestEnvironment): Promise<void> {
    await env.setupContextInvalidationScenario();
    env.sendDebugMessage('Message during invalidation');
    env.assertMessageWasQueued();
    env.assertCustomEventDispatched('messageHandlerDisconnected');
  },
};
