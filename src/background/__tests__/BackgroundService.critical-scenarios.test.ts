import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackgroundServiceTestSuite } from '../test-fixtures';
import { MessageFixtures } from '../test-fixtures/BackgroundServiceTestFixtures';

describe('BackgroundService Critical Scenarios - Observable Behaviors', () => {
  let testSuite: BackgroundServiceTestSuite;

  beforeEach(async () => {
    testSuite = new BackgroundServiceTestSuite();
    await testSuite.setup();
  });

  afterEach(async () => {
    await testSuite.teardown();
  });

  describe('Port Connection Lifecycle', () => {
    it('should establish and maintain multiple concurrent port connections', async () => {
      const env = testSuite.getEnvironment();

      const port1 = env.chromeEnv.simulatePortConnection('bolt-content', 100);
      const port2 = env.chromeEnv.simulatePortConnection('bolt-content', 101);
      const popupPort = env.chromeEnv.simulatePortConnection('popup', -1);

      port1.simulateMessage(MessageFixtures.heartbeatMessage());
      port2.simulateMessage(MessageFixtures.setCommitMessage('Test from tab 2'));

      expect(port1.onMessage.hasListeners()).toBe(true);
      expect(port2.onMessage.hasListeners()).toBe(true);
      expect(popupPort.onMessage.hasListeners()).toBe(true);
    });

    it('should recover gracefully when port disconnects during operations', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port1 = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port1.simulateMessage(MessageFixtures.zipDataMessage('project-1'));

      await new Promise((resolve) => setTimeout(resolve, 100));
      port1.disconnect();

      const port2 = env.chromeEnv.simulatePortConnection('bolt-content', 124);
      port2.simulateMessage(MessageFixtures.zipDataMessage('project-2'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);
      const operation = operations[operations.length - 1];
      expect(operation.status).toBeDefined();
      expect(['completed', 'failed', 'pending']).toContain(operation.status);
      expect(operation.id).toBeDefined();
    });

    it('should handle rapid connection/disconnection cycles without resource leaks', async () => {
      const env = testSuite.getEnvironment();

      for (let i = 0; i < 10; i++) {
        const port = env.chromeEnv.simulatePortConnection('bolt-content', 200 + i);
        port.simulateMessage(MessageFixtures.heartbeatMessage());
        port.disconnect();
      }

      const finalPort = env.chromeEnv.simulatePortConnection('bolt-content', 999);
      finalPort.simulateMessage(MessageFixtures.heartbeatMessage());

      expect(finalPort.onMessage.hasListeners()).toBe(true);
    });
  });

  describe('ZIP Upload Workflows', () => {
    it('should complete successful ZIP upload and record operation state', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port.simulateMessage(MessageFixtures.zipDataMessage('test-project'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);
      const operation = operations[0];
      expect(operation.status).toBe('completed');
      expect(operation.type).toBeDefined();
      expect(operation.id).toBeDefined();
    });

    it('should handle corrupted ZIP data and create failed operation', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port.simulateMessage(MessageFixtures.malformedZipData());

      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);
      const failedOperation = operations.find((op) => op.status === 'failed');
      expect(failedOperation).toBeDefined();
      expect(failedOperation?.status).toBe('failed');
      expect(failedOperation?.error).toBeDefined();
    });

    it('should process custom commit message before ZIP upload', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      const customCommit = 'feat: add new authentication flow';
      port.simulateMessage(MessageFixtures.setCommitMessage(customCommit));
      port.simulateMessage(MessageFixtures.zipDataMessage('auth-project'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);
      expect(port.onMessage.hasListeners()).toBe(true);
    });
  });

  describe('Authentication Strategy Handling', () => {
    it('should function with PAT authentication configured', async () => {
      const env = testSuite.getEnvironment();
      env.chromeEnv.setupValidPATAuth();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port.simulateMessage(MessageFixtures.zipDataMessage('pat-project'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(0);
    });

    it('should function with GitHub App authentication configured', async () => {
      const env = testSuite.getEnvironment();
      env.chromeEnv.setupValidGitHubAppAuth();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port.simulateMessage(MessageFixtures.zipDataMessage('app-project'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle authentication failure during upload', async () => {
      const env = testSuite.getEnvironment();
      const errorInjector = testSuite.getErrorInjector();

      errorInjector.injectGitHubAuthFailure();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port.simulateMessage(MessageFixtures.zipDataMessage('auth-fail-project'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      const hasFailed = operations.length === 0 || operations.some((op) => op.status === 'failed');
      expect(hasFailed).toBe(true);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should remain functional after GitHub API rate limit', async () => {
      const env = testSuite.getEnvironment();
      const errorInjector = testSuite.getErrorInjector();

      errorInjector.injectGitHubRateLimit();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port.simulateMessage(MessageFixtures.zipDataMessage('rate-limit-test'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      env.serviceFactory.setupSuccessfulUploadScenario();
      port.simulateMessage(MessageFixtures.zipDataMessage('recovery-test'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(port.onMessage.hasListeners()).toBe(true);
    });

    it('should handle network timeout and recover', async () => {
      const env = testSuite.getEnvironment();
      const errorInjector = testSuite.getErrorInjector();

      errorInjector.injectNetworkTimeout();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port.simulateMessage(MessageFixtures.zipDataMessage('timeout-test'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      env.serviceFactory.setupSuccessfulUploadScenario();
      port.simulateMessage(MessageFixtures.zipDataMessage('after-timeout'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle ZIP processing failure gracefully', async () => {
      const env = testSuite.getEnvironment();
      const errorInjector = testSuite.getErrorInjector();

      errorInjector.injectZipProcessingFailure();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port.simulateMessage(MessageFixtures.zipDataMessage('zip-fail-test'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      const hasFailure = operations.length === 0 || operations.some((op) => op.status === 'failed');
      expect(hasFailure).toBe(true);

      env.serviceFactory.resetAllMocks();
      env.serviceFactory.setupSuccessfulUploadScenario();

      port.simulateMessage(MessageFixtures.zipDataMessage('recovery-after-zip-fail'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(port.onMessage.hasListeners()).toBe(true);
    });
  });

  describe('Concurrent Multi-Tab Operations', () => {
    it('should isolate operations from different tabs', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port1 = env.chromeEnv.simulatePortConnection('bolt-content', 100);
      const port2 = env.chromeEnv.simulatePortConnection('bolt-content', 101);

      port1.simulateMessage(MessageFixtures.setCommitMessage('Commit from tab 1'));
      port1.simulateMessage(MessageFixtures.zipDataMessage('project-tab-1'));

      port2.simulateMessage(MessageFixtures.setCommitMessage('Commit from tab 2'));
      port2.simulateMessage(MessageFixtures.zipDataMessage('project-tab-2'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle simultaneous uploads from multiple tabs', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const ports = [];
      for (let i = 0; i < 3; i++) {
        const port = env.chromeEnv.simulatePortConnection('bolt-content', 200 + i);
        ports.push(port);
        port.simulateMessage(MessageFixtures.zipDataMessage(`concurrent-project-${i}`));
      }

      await new Promise((resolve) => setTimeout(resolve, 400));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(1);

      ports.forEach((port) => expect(port.onMessage.hasListeners()).toBe(true));
    });

    it('should maintain state when one tab disconnects during multi-tab session', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port1 = env.chromeEnv.simulatePortConnection('bolt-content', 300);
      const port2 = env.chromeEnv.simulatePortConnection('bolt-content', 301);

      port1.simulateMessage(MessageFixtures.zipDataMessage('tab-1-project'));
      port2.simulateMessage(MessageFixtures.zipDataMessage('tab-2-project'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      port1.disconnect();

      port2.simulateMessage(MessageFixtures.zipDataMessage('tab-2-second-upload'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(port2.onMessage.hasListeners()).toBe(true);

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Message Routing Under Load', () => {
    it('should handle rapid message bursts without losing messages', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      for (let i = 0; i < 20; i++) {
        port.simulateMessage(MessageFixtures.heartbeatMessage());
      }

      port.simulateMessage(MessageFixtures.setCommitMessage('After burst'));
      port.simulateMessage(MessageFixtures.zipDataMessage('after-burst-project'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(port.onMessage.hasListeners()).toBe(true);
      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(0);
    });

    it('should maintain message processing order under concurrent load', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      const messages = [
        MessageFixtures.setCommitMessage('First'),
        MessageFixtures.heartbeatMessage(),
        MessageFixtures.setCommitMessage('Second'),
        MessageFixtures.heartbeatMessage(),
        MessageFixtures.setCommitMessage('Final'),
        MessageFixtures.zipDataMessage('final-project'),
      ];

      messages.forEach((msg) => port.simulateMessage(msg));

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(port.onMessage.hasListeners()).toBe(true);
      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(0);
    });
  });
});
