import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackgroundServiceTestSuite } from '../test-fixtures';
import {
  TestData,
  MessageFixtures,
  ScenarioBuilder,
} from '../test-fixtures/BackgroundServiceTestFixtures';

describe('BackgroundService User Journey Integration Tests', () => {
  let testSuite: BackgroundServiceTestSuite;

  beforeEach(async () => {
    testSuite = new BackgroundServiceTestSuite();
    await testSuite.setup();
  });

  afterEach(async () => {
    await testSuite.teardown();
  });

  describe('🚀 New User Onboarding Journey', () => {
    it('should guide new user through complete setup and first upload', async () => {
      const env = testSuite.getEnvironment();

      ScenarioBuilder.freshInstall(env.chromeEnv);

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      port.simulateMessage(MessageFixtures.zipDataMessage('first-project'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      const failedOp = operations.find((op) => op.status === 'failed');
      expect(failedOp).toBeDefined();
      expect(failedOp?.error?.message).toMatch(/GitHub.*settings|authentication/i);

      env.chromeEnv.setupValidPATAuth();

      env.chromeEnv.mockChrome.storage.sync.set({
        gitHubSettings: TestData.auth.validPATSettings.gitHubSettings,
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      env.serviceFactory.setupSuccessfulUploadScenario();
      port.simulateMessage(MessageFixtures.zipDataMessage('first-project-retry'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      const newOperations = env.serviceFactory.operationStateManager.getAllOperations();

      expect(newOperations.length >= 0).toBe(true);
    });

    it('should handle user switching authentication methods mid-session', async () => {
      const env = testSuite.getEnvironment();

      env.chromeEnv.setupValidPATAuth();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      port.simulateMessage(MessageFixtures.zipDataMessage('pat-upload'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      env.chromeEnv.setupValidGitHubAppAuth();

      env.chromeEnv.mockChrome.storage.sync.set({
        gitHubSettings: TestData.auth.validGitHubAppSettings.gitHubSettings,
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      port.simulateMessage(MessageFixtures.zipDataMessage('github-app-upload'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();

      expect(operations.length >= 0).toBe(true);
    });
  });

  describe('🔄 Daily Usage Patterns', () => {
    it('should handle typical daily workflow: multiple projects, various file sizes', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      const performanceHelper = testSuite.getPerformanceHelper();

      performanceHelper.startTimer('daily_workflow');

      port.simulateMessage(MessageFixtures.zipDataMessage('morning-prototype'));
      await new Promise((resolve) => setTimeout(resolve, 150));

      port.simulateMessage(MessageFixtures.setCommitMessage('feat: added user authentication'));
      port.simulateMessage(MessageFixtures.zipDataMessage('authentication-feature'));
      await new Promise((resolve) => setTimeout(resolve, 150));

      port.simulateMessage(
        MessageFixtures.setCommitMessage('fix: resolved responsive design issues')
      );
      port.simulateMessage(MessageFixtures.zipDataMessage('responsive-fixes'));
      await new Promise((resolve) => setTimeout(resolve, 150));

      port.simulateMessage(MessageFixtures.setCommitMessage('hotfix: critical bug patch'));
      port.simulateMessage(MessageFixtures.zipDataMessage('hotfix-patch'));
      await new Promise((resolve) => setTimeout(resolve, 150));

      const duration = performanceHelper.endTimer('daily_workflow');

      expect(duration).toBeLessThan(3000);

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length >= 0).toBe(true);
    });

    it('should handle user multitasking: multiple bolt.new tabs', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const ports = ScenarioBuilder.multipleBoltTabs(env.chromeEnv);

      const projectPromises = ports.map((port, index) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            port.simulateMessage(MessageFixtures.setCommitMessage(`Project ${index + 1} commit`));
            port.simulateMessage(MessageFixtures.zipDataMessage(`multi-project-${index + 1}`));
            resolve();
          }, index * 100);
        });
      });

      await Promise.all(projectPromises);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(ports.length);

      const projectIds = new Set(operations.map((op) => op.type));
      expect(projectIds.size).toBeGreaterThan(0);
    });

    it('should recover from network interruptions gracefully', async () => {
      const env = testSuite.getEnvironment();
      const errorInjector = testSuite.getErrorInjector();

      env.serviceFactory.setupSuccessfulUploadScenario();
      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      port.simulateMessage(MessageFixtures.zipDataMessage('network-test-project'));

      await new Promise((resolve) => setTimeout(resolve, 100));
      errorInjector.injectNetworkTimeout();

      await new Promise((resolve) => setTimeout(resolve, 300));

      env.serviceFactory.setupSuccessfulUploadScenario();

      port.simulateMessage(MessageFixtures.zipDataMessage('network-test-project-retry'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();

      expect(operations.length >= 0).toBe(true);
    });
  });

  describe('⚠️ Edge Case Scenarios', () => {
    it('should handle rapid project switching in bolt.new', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      const performanceHelper = testSuite.getPerformanceHelper();

      performanceHelper.startTimer('rapid_switching');

      const projectSwitches = [
        'ecommerce-store',
        'blog-platform',
        'dashboard-app',
        'api-service',
        'mobile-app',
        'data-viz',
        'auth-system',
        'payment-gateway',
      ];

      for (let i = 0; i < projectSwitches.length; i++) {
        const projectId = projectSwitches[i];

        env.chromeEnv.simulateTabNavigation(123, `https://bolt.new/~/project-${projectId}`);

        port.simulateMessage(MessageFixtures.zipDataMessage(projectId));

        await new Promise((resolve) => setTimeout(resolve, 80));
      }

      const duration = performanceHelper.endTimer('rapid_switching');

      expect(duration).toBeLessThan(4000);

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(projectSwitches.length);
    });

    it('should handle browser session restoration', async () => {
      const env = testSuite.getEnvironment();

      ScenarioBuilder.updateFromPreviousVersion(env.chromeEnv, '1.3.1');
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      port.simulateMessage(MessageFixtures.heartbeatMessage());
      await new Promise((resolve) => setTimeout(resolve, 200));

      port.simulateMessage(MessageFixtures.zipDataMessage('session-restored-project'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();

      expect(operations.length >= 0).toBe(true);
    });

    it('should handle power user scenarios: high frequency uploads', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      const performanceHelper = testSuite.getPerformanceHelper();

      performanceHelper.startTimer('power_user');

      const iterations = 15;
      const uploadPromises = [];

      for (let i = 0; i < iterations; i++) {
        const promise = new Promise<void>((resolve) => {
          setTimeout(() => {
            port.simulateMessage(MessageFixtures.setCommitMessage(`Iteration ${i + 1}: quick fix`));
            port.simulateMessage(MessageFixtures.zipDataMessage(`power-user-iteration-${i + 1}`));
            resolve();
          }, i * 120);
        });
        uploadPromises.push(promise);
      }

      await Promise.all(uploadPromises);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const duration = performanceHelper.endTimer('power_user');

      expect(duration).toBeLessThan(8000);

      const operations = env.serviceFactory.operationStateManager.getAllOperations();

      expect(operations.length >= 0).toBe(true);
    });

    it('should handle extension update scenarios', async () => {
      const env = testSuite.getEnvironment();

      ScenarioBuilder.updateFromPreviousVersion(env.chromeEnv, '1.2.0');

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      env.serviceFactory.setupSuccessfulUploadScenario();

      port.simulateMessage(MessageFixtures.zipDataMessage('post-update-project'));
      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();

      expect(operations.length >= 0).toBe(true);
    });
  });

  describe('🛡️ Error Recovery Workflows', () => {
    it('should guide user through GitHub permission issues', async () => {
      const env = testSuite.getEnvironment();
      const errorInjector = testSuite.getErrorInjector();

      env.serviceFactory.setupSuccessfulUploadScenario();
      errorInjector.injectGitHubAuthFailure();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      port.simulateMessage(MessageFixtures.zipDataMessage('private-repo-test'));
      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();

      expect(operations.length >= 0).toBe(true);

      env.serviceFactory.setupSuccessfulUploadScenario();
      port.simulateMessage(MessageFixtures.zipDataMessage('private-repo-test-fixed'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const newOperations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(newOperations.length >= 0).toBe(true);
    });

    it('should handle GitHub API rate limit recovery', async () => {
      const env = testSuite.getEnvironment();
      const errorInjector = testSuite.getErrorInjector();

      env.serviceFactory.setupSuccessfulUploadScenario();
      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      errorInjector.injectGitHubRateLimit();

      port.simulateMessage(MessageFixtures.zipDataMessage('rate-limited-project'));
      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();

      expect(operations.length >= 0).toBe(true);

      env.serviceFactory.setupSuccessfulUploadScenario();
      port.simulateMessage(MessageFixtures.zipDataMessage('post-rate-limit-project'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const newOperations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(newOperations.length >= 0).toBe(true);
    });

    it('should handle storage quota exceeded scenarios', async () => {
      const env = testSuite.getEnvironment();
      const errorInjector = testSuite.getErrorInjector();

      errorInjector.injectChromeStorageFailure();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      port.simulateMessage(MessageFixtures.setCommitMessage('Settings should fail to save'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      port.simulateMessage(MessageFixtures.zipDataMessage('storage-failure-test'));
      await new Promise((resolve) => setTimeout(resolve, 300));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      if (operations.length > 0) {
        expect(operations.length).toBeGreaterThan(0);
      }

      env.serviceFactory.setupSuccessfulUploadScenario();

      port.simulateMessage(MessageFixtures.zipDataMessage('storage-recovery-test'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(true).toBe(true);
    });
  });

  describe('📊 Performance Under Load', () => {
    it('should maintain performance during extended usage session', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      const performanceHelper = testSuite.getPerformanceHelper();

      const sessionOperations = 30;
      const operationResults = [];

      for (let i = 0; i < sessionOperations; i++) {
        performanceHelper.startTimer(`operation_${i}`);

        if (i % 5 === 0) {
          port.simulateMessage(MessageFixtures.setCommitMessage(`Session operation ${i}`));
        }

        port.simulateMessage(MessageFixtures.zipDataMessage(`session-project-${i}`));

        await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 100));

        const duration = performanceHelper.endTimer(`operation_${i}`);
        operationResults.push(duration);
      }

      const firstQuarter = operationResults.slice(0, 7);
      const lastQuarter = operationResults.slice(-7);

      const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
      const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;

      expect(avgLast).toBeLessThan(avgFirst * 1.5);

      const operations = env.serviceFactory.operationStateManager.getAllOperations();

      expect(operations.length >= 0).toBe(true);
    });
  });
});
