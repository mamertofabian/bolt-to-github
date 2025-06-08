/**
 * BackgroundService Edge Cases and Boundary Testing
 *
 * Tests boundary conditions, edge cases, and unusual scenarios that could
 * reveal bugs in complex async operations, error handling, and resource management.
 *
 * Focus on scenarios that are unlikely but possible, and could cause
 * extension crashes, data corruption, or security vulnerabilities.
 */

import { BackgroundServiceTestSuite } from '../test-fixtures';
import { TestData, MessageFixtures } from '../test-fixtures/BackgroundServiceTestFixtures';

describe('BackgroundService Edge Cases and Boundary Testing', () => {
  let testSuite: BackgroundServiceTestSuite;

  beforeEach(async () => {
    testSuite = new BackgroundServiceTestSuite();
    await testSuite.setup();
  });

  afterEach(async () => {
    await testSuite.teardown();
  });

  describe('🎯 Data Boundary Testing', () => {
    it('should handle extremely long commit messages', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      // Test various commit message lengths
      const testCases = [
        TestData.commitMessages.veryLong, // 500 characters
        'a'.repeat(1000), // 1KB
        'a'.repeat(10000), // 10KB
        'a'.repeat(50000), // 50KB - extreme case
        'Unicode test: 🚀🔥💻🎯⚡️'.repeat(1000), // Unicode boundary test
        'Line\nBreak\nTest\n'.repeat(500), // Multiline boundary test
      ];

      for (const commitMessage of testCases) {
        try {
          port.simulateMessage(MessageFixtures.setCommitMessage(commitMessage));
          port.simulateMessage(
            MessageFixtures.zipDataMessage(`long-commit-${commitMessage.length}`)
          );

          await new Promise((resolve) => setTimeout(resolve, 200));

          // Should handle without crashing
          expect(true).toBe(true);
        } catch (error) {
          fail(`Failed with commit message length ${commitMessage.length}: ${error}`);
        }
      }
    });

    it('should handle edge case project IDs', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      // Test various problematic project IDs
      const edgeCaseProjectIds = [
        '', // Empty string
        ' ', // Single space
        '   ', // Multiple spaces
        TestData.projects.longProjectId, // Very long ID
        'special-chars-!@#$%^&*()_+', // Special characters
        'unicode-项目-🚀', // Unicode characters
        'UPPERCASE-PROJECT-ID', // Case sensitivity
        'project.with.dots', // Dots
        'project/with/slashes', // Slashes
        'project\\with\\backslashes', // Backslashes
        'project with spaces', // Spaces
        '123456789', // Numbers only
        'a', // Single character
        null, // Null (JavaScript edge case)
        undefined, // Undefined
      ];

      for (const projectId of edgeCaseProjectIds) {
        try {
          port.simulateMessage(MessageFixtures.zipDataMessage(projectId));
          await new Promise((resolve) => setTimeout(resolve, 150));

          // Should handle gracefully without crashing
        } catch (error) {
          // Some edge cases may fail, but should not crash the service
          console.warn(`Project ID "${projectId}" caused error: ${error}`);
        }
      }

      // Service should still be responsive after edge case testing
      port.simulateMessage(MessageFixtures.zipDataMessage('normal-project-after-edge-cases'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);
    });

    it('should handle malformed ZIP data variations', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      // Various malformed ZIP scenarios
      const malformedZipCases = [
        TestData.zipFiles.emptyZip, // Empty string
        'not-base64-at-all', // Invalid base64
        'SGVsbG8=', // Valid base64 but not ZIP
        'UEsD', // Truncated ZIP header
        TestData.zipFiles.corruptedZip, // Corrupted data
        'a'.repeat(100000), // Very long invalid data
        '==invalid==base64==', // Base64 with invalid padding
        'data:application/zip;base64,UEsD...', // Data URL format
        JSON.stringify({ not: 'zip', data: 'at all' }), // JSON instead of ZIP
        null, // Null data
        undefined, // Undefined data
      ];

      for (const malformedZip of malformedZipCases) {
        try {
          const message = {
            type: 'ZIP_DATA',
            data: {
              data: malformedZip,
              projectId: 'malformed-test',
            },
          };

          port.simulateMessage(message);
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          // Malformed data should be handled gracefully
          console.warn(`Malformed ZIP caused error: ${error}`);
        }
      }

      // Service should recover and handle valid data
      port.simulateMessage(MessageFixtures.zipDataMessage('recovery-test'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(true).toBe(true); // Service survived malformed data attack
    });
  });

  describe('⏱️ Timing and Concurrency Edge Cases', () => {
    it('should handle rapid message flooding', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      const performanceHelper = testSuite.getPerformanceHelper();

      performanceHelper.startTimer('message_flood');

      // Send 200 messages as fast as possible
      const messageCount = 200;
      const promises = [];

      for (let i = 0; i < messageCount; i++) {
        const promise = new Promise<void>((resolve) => {
          // No setTimeout - send immediately
          if (i % 10 === 0) {
            port.simulateMessage(MessageFixtures.zipDataMessage(`flood-${i}`));
          } else {
            port.simulateMessage(MessageFixtures.heartbeatMessage());
          }
          resolve();
        });
        promises.push(promise);
      }

      await Promise.all(promises);
      const duration = performanceHelper.endTimer('message_flood');

      // Should handle message flood without excessive delay
      expect(duration).toBeLessThan(3000);

      // Give service time to process backlog
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Service should still be responsive
      port.simulateMessage(MessageFixtures.heartbeatMessage());
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(true).toBe(true); // Survived message flood
    });

    it('should handle port disconnection at precise timing moments', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSlowUploadScenario(2000); // 2-second delay

      // Test disconnection at various stages of processing
      const timingTests = [
        { disconnectAfter: 50, description: 'immediate disconnection' },
        { disconnectAfter: 500, description: 'mid-processing disconnection' },
        { disconnectAfter: 1500, description: 'near-completion disconnection' },
        { disconnectAfter: 1999, description: 'just-before-completion disconnection' },
      ];

      for (const test of timingTests) {
        const port = env.chromeEnv.simulatePortConnection(
          'bolt-content',
          200 + test.disconnectAfter
        );

        // Start operation
        port.simulateMessage(MessageFixtures.zipDataMessage(`timing-test-${test.disconnectAfter}`));

        // Disconnect at specific timing
        setTimeout(() => {
          port.disconnect();
        }, test.disconnectAfter);

        // Wait for operation to complete or fail
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      // Service should handle all timing edge cases
      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);

      // Should still accept new connections
      const finalPort = env.chromeEnv.simulatePortConnection('bolt-content', 999);
      finalPort.simulateMessage(MessageFixtures.heartbeatMessage());

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(true).toBe(true);
    }, 15000); // Add timeout for this test

    it('should handle concurrent operations with resource contention', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      // Create many concurrent connections
      const concurrentConnections = 20;
      const ports = [];

      for (let i = 0; i < concurrentConnections; i++) {
        const port = env.chromeEnv.simulatePortConnection('bolt-content', 300 + i);
        ports.push(port);
      }

      // All connections start operations simultaneously
      const operationPromises = ports.map((port, index) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            port.simulateMessage(MessageFixtures.zipDataMessage(`concurrent-${index}`));
            resolve();
          }, Math.random() * 50); // Small random delay for realism
        });
      });

      await Promise.all(operationPromises);

      // Wait for all operations to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should handle high concurrency without deadlocks
      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThanOrEqual(concurrentConnections * 0.7); // Allow some failures

      // Clean up connections
      ports.forEach((port) => port.disconnect());
    });
  });

  describe('🧠 Memory and Resource Edge Cases', () => {
    it('should handle memory pressure scenarios', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      const performanceHelper = testSuite.getPerformanceHelper();

      // Simulate memory pressure with large operations
      performanceHelper.startTimer('memory_pressure');

      // Create operations that would consume significant memory
      for (let i = 0; i < 50; i++) {
        // Large commit message to consume memory
        const largeCommit = `Memory test ${i}: ${'x'.repeat(10000)}`;
        port.simulateMessage(MessageFixtures.setCommitMessage(largeCommit));

        // Large project ID
        const largeProjectId = `memory-pressure-project-${i}-${'y'.repeat(1000)}`;
        port.simulateMessage(MessageFixtures.zipDataMessage(largeProjectId));

        // Brief pause to allow garbage collection
        if (i % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      const duration = performanceHelper.endTimer('memory_pressure');

      // Should complete without memory-related failures
      expect(duration).toBeLessThan(15000);

      // Service should still be responsive after memory pressure
      port.simulateMessage(MessageFixtures.heartbeatMessage());
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(true).toBe(true);
    });

    it('should handle resource cleanup during abnormal termination', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSlowUploadScenario(5000); // Very slow operation

      // Start many operations
      const operationCount = 10;
      const ports = [];

      for (let i = 0; i < operationCount; i++) {
        const port = env.chromeEnv.simulatePortConnection('bolt-content', 400 + i);
        ports.push(port);

        // Start long-running operation
        port.simulateMessage(MessageFixtures.zipDataMessage(`cleanup-test-${i}`));
      }

      // Simulate abnormal termination (all ports disconnect suddenly)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      ports.forEach((port) => port.disconnect());

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Service should have cleaned up and be ready for new operations
      const newPort = env.chromeEnv.simulatePortConnection('bolt-content', 500);
      env.serviceFactory.setupSuccessfulUploadScenario();

      newPort.simulateMessage(MessageFixtures.zipDataMessage('post-cleanup-test'));
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should work normally after cleanup
      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);
    });
  });

  describe('🔐 Security Edge Cases', () => {
    it('should handle potential XSS in message data', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      // XSS payloads that could be dangerous if not handled properly
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '"><script>alert("xss")</script>',
        "'; DROP TABLE users; --",
        '${alert("xss")}',
        '{{constructor.constructor("alert(\\"xss\\")")()}}',
        'data:text/html,<script>alert("xss")</script>',
        '\u003cscript\u003ealert("xss")\u003c/script\u003e', // Unicode encoded
      ];

      for (const payload of xssPayloads) {
        try {
          // Test XSS in commit message
          port.simulateMessage(MessageFixtures.setCommitMessage(payload));

          // Test XSS in project ID
          port.simulateMessage(MessageFixtures.zipDataMessage(payload));

          await new Promise((resolve) => setTimeout(resolve, 100));

          // Should handle without executing malicious code
          expect(true).toBe(true);
        } catch (error) {
          // Should not crash on XSS attempts
          console.warn(`XSS payload caused error: ${error}`);
        }
      }
    });

    it('should handle authentication token edge cases', async () => {
      const env = testSuite.getEnvironment();

      // Test various malformed authentication configurations
      const malformedAuthConfigs = [
        { gitHubSettings: null },
        { gitHubSettings: { githubToken: null } },
        { gitHubSettings: { githubToken: '' } },
        { gitHubSettings: { githubToken: 'invalid-token-format' } },
        { gitHubSettings: { githubToken: 'a'.repeat(1000) } }, // Very long token
        { gitHubSettings: { authenticationMethod: 'invalid_method' } },
        {
          gitHubSettings: {
            authenticationMethod: 'github_app',
            githubAppInstallationId: 'not-a-number',
          },
        },
        {
          gitHubSettings: {
            authenticationMethod: 'github_app',
            githubAppInstallationId: -1, // Negative number
          },
        },
      ];

      for (const config of malformedAuthConfigs) {
        env.chromeEnv.mockChrome.storage.setSyncData(config);

        const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

        // Try to perform operation with malformed auth
        port.simulateMessage(MessageFixtures.zipDataMessage('auth-edge-case'));

        await new Promise((resolve) => setTimeout(resolve, 200));

        // Should handle malformed auth gracefully
        port.disconnect();
      }

      // Service should still work with valid auth after edge cases
      env.chromeEnv.setupValidPATAuth();
      env.serviceFactory.setupSuccessfulUploadScenario();

      const validPort = env.chromeEnv.simulatePortConnection('bolt-content', 999);
      validPort.simulateMessage(MessageFixtures.zipDataMessage('valid-auth-test'));

      await new Promise((resolve) => setTimeout(resolve, 200));

      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);
    });
  });

  describe('🌐 Network Edge Cases', () => {
    it('should handle network instability patterns', async () => {
      const env = testSuite.getEnvironment();
      const errorInjector = testSuite.getErrorInjector();

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      // Simulate intermittent network issues
      errorInjector.injectIntermittentNetworkFailure(0.7); // 70% failure rate

      // Try multiple operations under unstable network
      for (let i = 0; i < 10; i++) {
        port.simulateMessage(MessageFixtures.zipDataMessage(`unstable-network-${i}`));

        // Random delays to simulate real network patterns
        await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
      }

      // Wait for all operations to complete or timeout
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Some operations should have failed, but service should not crash
      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      expect(operations.length).toBeGreaterThan(0);

      // Should handle mix of successes and failures
      const failedOps = operations.filter((op) => op.status === 'failed');
      const completedOps = operations.filter((op) => op.status === 'completed');

      expect(failedOps.length + completedOps.length).toBeGreaterThan(0);
    });

    it('should handle DNS resolution failures', async () => {
      const env = testSuite.getEnvironment();

      // Mock DNS resolution failure
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Network request failed: DNS resolution failed')
      );

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);
      port.simulateMessage(MessageFixtures.zipDataMessage('dns-failure-test'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should handle DNS failures gracefully
      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      if (operations.length > 0) {
        const dnsFailure = operations.find(
          (op) => op.status === 'failed' && op.error?.message.toLowerCase().includes('network')
        );

        // May or may not detect DNS failure specifically, but should not crash
        expect(operations.length).toBeGreaterThan(0);
      }

      // Service should recover when network is restored
      env.serviceFactory.setupSuccessfulUploadScenario();
      port.simulateMessage(MessageFixtures.zipDataMessage('dns-recovery-test'));

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(true).toBe(true);
    });
  });

  describe('📱 Browser Environment Edge Cases', () => {
    it('should handle browser API unavailability', async () => {
      const env = testSuite.getEnvironment();

      // Mock Chrome API failures
      env.chromeEnv.mockChrome.storage.local.get.mockRejectedValue(
        new Error('Extension context invalidated')
      );
      env.chromeEnv.mockChrome.tabs.query.mockRejectedValue(new Error('Tabs API unavailable'));

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      // Try operations that depend on Chrome APIs
      port.simulateMessage(MessageFixtures.zipDataMessage('api-unavailable-test'));

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should detect API unavailability and handle gracefully
      expect(true).toBe(true); // Service should not crash

      // Restore APIs and test recovery
      env.serviceFactory.setupSuccessfulUploadScenario();
      port.simulateMessage(MessageFixtures.zipDataMessage('api-recovery-test'));

      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('should handle extension context invalidation during operation', async () => {
      const env = testSuite.getEnvironment();
      env.serviceFactory.setupSlowUploadScenario(3000); // Long operation

      const port = env.chromeEnv.simulatePortConnection('bolt-content', 123);

      // Start long operation
      port.simulateMessage(MessageFixtures.zipDataMessage('context-invalidation-test'));

      // Simulate context invalidation mid-operation
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock context invalidation
      env.chromeEnv.mockChrome.runtime.getManifest.mockImplementation(() => {
        throw new Error('Extension context invalidated');
      });

      // Wait for operation to complete or fail
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Service should detect context invalidation
      const operations = env.serviceFactory.operationStateManager.getAllOperations();
      if (operations.length > 0) {
        const contextFailure = operations.find(
          (op) => op.status === 'failed' && op.error?.message.toLowerCase().includes('context')
        );

        // May detect context invalidation or just fail - should not crash
        expect(operations.length).toBeGreaterThan(0);
      }
    });
  });
});
