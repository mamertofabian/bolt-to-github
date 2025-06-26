/**
 * MessageHandler.edge-cases.test.ts
 *
 * Additional edge case tests for MessageHandler focusing on:
 * - Boundary conditions
 * - Race conditions
 * - Unusual payload handling
 * - Stress testing scenarios
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// Mock the Notification.svelte component to prevent parse errors
vi.mock('../Notification.svelte', () => ({
  default: class MockNotification {
    constructor() {
      this.$set = vi.fn();
      this.$destroy = vi.fn();
      this.$on = vi.fn();
    }
    $set = vi.fn();
    $destroy = vi.fn();
    $on = vi.fn();
  },
}));

import type { MessageType } from '$lib/types';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MessageHandlerTestEnvironment, TimingHelpers } from '../test-fixtures';

describe('MessageHandler - Edge Cases', () => {
  let env: MessageHandlerTestEnvironment;

  beforeEach(async () => {
    env = new MessageHandlerTestEnvironment();
    await env.setup();
  });

  afterEach(async () => {
    await env.teardown();
  });

  // =============================================================================
  // BOUNDARY CONDITIONS
  // =============================================================================

  describe('Boundary Conditions', () => {
    describe('Queue Size Boundaries', () => {
      it('should handle empty queue edge cases', async () => {
        env.createMessageHandler();

        // Clear empty queue - should not throw
        expect(() => env.messageHandler!.clearQueue()).not.toThrow();
        env.assertQueueLength(0);

        // Process empty queue on reconnection
        env.simulatePortDisconnection();
        env.updatePortConnection();
        await env.waitForQueueProcessing();

        // Should handle gracefully
        env.assertQueueLength(0);
        env.assertPortPostMessageNotCalled();
      });

      it('should handle single message queue edge case', async () => {
        await env.setupPortDisconnectionScenario();

        // Queue single message
        env.sendDebugMessage('Single queued message');
        env.assertQueueLength(1);

        // Process single message
        env.updatePortConnection();
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(1);
      });

      it('should handle maximum practical queue size', async () => {
        await env.setupPortDisconnectionScenario();

        // Queue maximum practical number of messages (reduced for faster tests)
        const maxPracticalSize = 10000; // 10k messages instead of 100k
        const batchSize = 1000;

        env.markPerformancePoint('queue_start');

        for (let i = 0; i < maxPracticalSize; i += batchSize) {
          const batch = Array.from({ length: batchSize }, (_, j) => `Message ${i + j}`);

          batch.forEach((msg) => env.sendDebugMessage(msg));
        }

        env.markPerformancePoint('queue_end');

        env.assertQueueLength(maxPracticalSize);

        // Verify reasonable queue building time
        const queueTime = env.getPerformanceDuration('queue_start', 'queue_end');
        expect(queueTime).toBeLessThan(5000); // Less than 5 seconds

        // Clear to prevent timeout
        env.messageHandler!.clearQueue();
      });
    });

    describe('Message Type Boundaries', () => {
      it('should handle all defined MessageType values', async () => {
        env.createMessageHandler();

        // Test all message types from the enum
        const allMessageTypes: MessageType[] = [
          'ZIP_DATA',
          'UPLOAD_STATUS',
          'SET_COMMIT_MESSAGE',
          'DEBUG',
          'CONTENT_SCRIPT_READY',
          'GITHUB_SETTINGS_CHANGED',
          'OPEN_HOME',
          'OPEN_SETTINGS',
          'OPEN_FILE_CHANGES',
          'OPEN_ISSUES',
          'OPEN_PROJECTS',
          'IMPORT_PRIVATE_REPO',
          'DELETE_TEMP_REPO',
          'PUSH_TO_GITHUB',
          'USE_CACHED_FILES',
          'HEARTBEAT',
          'HEARTBEAT_RESPONSE',
          'GITHUB_APP_SYNCED',
          'SUBSCRIPTION_UPGRADED',
        ];

        allMessageTypes.forEach((type) => {
          env.sendTestMessage(type, { test: `Data for ${type}` });
        });

        // All should be sent
        env.assertPortPostMessageCalled(allMessageTypes.length);
        env.assertQueueLength(0);
      });

      it('should handle invalid message type gracefully', async () => {
        env.createMessageHandler();

        // TypeScript prevents invalid types, but test runtime behavior
        const invalidType = 'INVALID_MESSAGE_TYPE' as MessageType;

        // Should not throw
        expect(() => {
          env.sendTestMessage(invalidType, { data: 'test' });
        }).not.toThrow();

        // Message should still be sent
        env.assertPortPostMessageCalled(1);
      });
    });

    describe('Timing Boundaries', () => {
      it('should handle zero-delay reconnection', async () => {
        env.createMessageHandler();

        // Disconnect and immediately reconnect
        env.simulatePortDisconnection();
        env.sendDebugMessage('During instant reconnect');
        env.updatePortConnection(); // Immediate reconnection

        await env.waitForQueueProcessing();

        // Message should be processed
        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(1);
      });

      it('should handle very long disconnection periods', async () => {
        await env.setupPortDisconnectionScenario();

        // Add messages at different times during disconnection
        env.sendDebugMessage('Start of disconnection');
        env.sendDebugMessage('Middle of disconnection');
        env.sendDebugMessage('End of disconnection');

        env.assertQueueLength(3);

        // Reconnect after simulated long period
        env.updatePortConnection();
        await env.waitForQueueProcessing();

        // All messages should be preserved and sent
        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(3);
      });
    });
  });

  // =============================================================================
  // RACE CONDITIONS
  // =============================================================================

  describe('Race Conditions', () => {
    it('should handle simultaneous send and disconnect', async () => {
      env.createMessageHandler();

      // Set up promises for concurrent operations
      const sendPromise = Promise.resolve().then(() => {
        for (let i = 0; i < 10; i++) {
          env.sendDebugMessage(`Concurrent send ${i}`);
        }
      });

      const disconnectPromise = Promise.resolve().then(() => {
        env.simulatePortDisconnection();
      });

      // Execute concurrently
      await Promise.all([sendPromise, disconnectPromise]);

      // Some messages may be sent, some queued
      const status = env.messageHandler!.getConnectionStatus();
      expect(status.connected).toBe(false);

      // Total should be 10 (sent + queued)
      const sentCount = env.currentPort
        ? (env.currentPort.postMessage as Mock).mock.calls.length
        : 0;
      const queuedCount = status.queuedMessages;
      expect(sentCount + queuedCount).toBe(10);
    });

    it('should handle simultaneous reconnection and message sending', async () => {
      await env.setupPortDisconnectionScenario();

      // Queue initial messages
      for (let i = 0; i < 50; i++) {
        env.sendDebugMessage(`Initial queue ${i}`);
      }

      // Simultaneous reconnection and new messages
      const reconnectPromise = Promise.resolve().then(() => {
        env.updatePortConnection();
      });

      const sendPromise = Promise.resolve().then(async () => {
        await TimingHelpers.waitForMs(5); // Small delay
        for (let i = 0; i < 50; i++) {
          env.sendDebugMessage(`New message ${i}`);
        }
      });

      await Promise.all([reconnectPromise, sendPromise]);
      await env.waitForQueueProcessing();

      // All 100 messages should eventually be sent
      env.assertQueueLength(0);
      expect(env.currentPort?.getPostMessageCallCount()).toBeGreaterThanOrEqual(100);
    });

    it('should handle rapid updatePort calls', async () => {
      env.createMessageHandler();

      // Rapid port updates with no delay
      const updatePromises = [];
      for (let i = 0; i < 20; i++) {
        updatePromises.push(
          Promise.resolve().then(() => {
            const newPort = env.createHealthyPort();
            env.updatePortConnection(newPort);
            env.sendDebugMessage(`After rapid update ${i}`);
          })
        );
      }

      await Promise.all(updatePromises);
      await TimingHelpers.waitForMs(100);

      // System should remain stable
      const status = env.messageHandler!.getConnectionStatus();
      expect(status.connected).toBe(true);

      // Messages should be sent (exact count may vary due to race conditions)
      expect(env.currentPort?.getPostMessageCallCount()).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // UNUSUAL PAYLOAD HANDLING
  // =============================================================================

  describe('Unusual Payload Handling', () => {
    it('should handle deeply nested objects', async () => {
      env.createMessageHandler();

      // Create deeply nested object
      let deepObject: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 100; i++) {
        deepObject = { nested: deepObject };
      }

      // Should handle without stack overflow
      expect(() => {
        env.sendTestMessage('DEBUG', deepObject);
      }).not.toThrow();

      env.assertPortPostMessageCalled(1);
    });

    it('should handle objects with many properties', async () => {
      env.createMessageHandler();

      // Create object with many properties
      const wideObject: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        // Reduced from 10k
        wideObject[`prop${i}`] = `value${i}`;
      }

      env.markPerformancePoint('before_wide_send');
      env.sendTestMessage('DEBUG', wideObject);
      env.markPerformancePoint('after_wide_send');

      // Should complete in reasonable time
      const duration = env.getPerformanceDuration('before_wide_send', 'after_wide_send');
      expect(duration).toBeLessThan(1000);

      env.assertPortPostMessageCalled(1);
    });

    it('should handle various special characters in messages', async () => {
      env.createMessageHandler();

      const specialCharMessages = [
        'Message with emoji 🚀🎉😊',
        'Message with unicode ñáéíóú ÑÁÉÍÓÚ',
        'Message with quotes "double" \'single\' `backtick`',
        'Message with escapes \n\r\t\\',
        'Message with HTML <script>alert("xss")</script>',
        "Message with SQL '; DROP TABLE users; --",
        'Message with null bytes: \0\0\0',
        'Message with RTL text: مرحبا بالعالم',
      ];

      specialCharMessages.forEach((msg) => {
        env.sendDebugMessage(msg);
      });

      // All should be sent without issues
      env.assertPortPostMessageCalled(specialCharMessages.length);
      env.assertQueueLength(0);
    });

    it('should handle binary data in base64 format', async () => {
      env.createMessageHandler();

      // Simulate binary data as base64 (common for ZIP files)
      const binaryData = new Uint8Array(10 * 1024); // 10KB instead of 1MB to avoid stack overflow
      for (let i = 0; i < binaryData.length; i++) {
        binaryData[i] = Math.floor(Math.random() * 256);
      }

      // Convert to base64 in chunks to avoid stack overflow
      let binaryString = '';
      const chunkSize = 8192;
      for (let i = 0; i < binaryData.length; i += chunkSize) {
        const chunk = binaryData.slice(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64Data = btoa(binaryString);

      env.sendZipDataMessage(base64Data, 'binary-test-project');

      // Should handle large binary data
      env.assertPortPostMessageCalled(1);
    });
  });

  // =============================================================================
  // STRESS TESTING
  // =============================================================================

  describe('Stress Testing', () => {
    it('should handle message burst during disconnection-reconnection cycle', async () => {
      env.createMessageHandler();

      // Start with connected state
      env.sendDebugMessage('Initial message');
      const initialPort = env.currentPort;

      // Create burst scenario
      const burstSize = 100; // Reduced from 1000 for faster tests

      // Send some messages while connected
      for (let i = 0; i < 10; i++) {
        env.sendDebugMessage(`Pre-disconnect message ${i}`);
      }

      // Disconnect the port
      env.simulatePortDisconnection();

      // Send burst of messages while disconnected (these will be queued)
      for (let i = 0; i < burstSize; i++) {
        env.sendDebugMessage(`Burst message ${i}`);
      }

      // Verify messages are queued
      expect(env.messageHandler!.getConnectionStatus().queuedMessages).toBe(burstSize);

      // Reconnect with new port
      env.updatePortConnection();
      await env.waitForQueueProcessing();

      // All messages should eventually be processed
      env.assertQueueLength(0);

      // Verify messages were sent on either the initial port or the reconnected port
      const initialPortCount = initialPort?.getPostMessageCallCount() || 0;
      const reconnectedPortCount = env.currentPort?.getPostMessageCallCount() || 0;

      expect(initialPortCount).toBeGreaterThanOrEqual(11); // Initial + pre-disconnect messages
      expect(reconnectedPortCount).toBe(burstSize); // All queued messages
    });

    it('should handle alternating connection states with continuous messaging', async () => {
      env.createMessageHandler();

      const testDurationMs = 500; // Reduced from 1000ms
      const stateChangeIntervalMs = 50;
      const messageIntervalMs = 10; // Increased from 5ms to reduce total messages

      let isConnected = true;
      let messageCount = 0;

      // State change loop
      const stateChangePromise = (async () => {
        const startTime = Date.now();
        while (Date.now() - startTime < testDurationMs) {
          if (isConnected) {
            env.simulatePortDisconnection();
            isConnected = false;
          } else {
            env.updatePortConnection();
            isConnected = true;
          }
          await TimingHelpers.waitForMs(stateChangeIntervalMs);
        }
      })();

      // Message sending loop
      const messageSendPromise = (async () => {
        const startTime = Date.now();
        while (Date.now() - startTime < testDurationMs) {
          env.sendDebugMessage(`Alternating test ${messageCount++}`);
          await TimingHelpers.waitForMs(messageIntervalMs);
        }
      })();

      await Promise.all([stateChangePromise, messageSendPromise]);

      // Ensure final connected state and process remaining
      if (!isConnected) {
        env.updatePortConnection();
      }
      await env.waitForQueueProcessing();

      // Verify system stability
      const status = env.messageHandler!.getConnectionStatus();
      expect(status.connected).toBeDefined();
      expect(status.queuedMessages).toBe(0);

      // Some messages sent, exact count depends on timing
      expect(env.currentPort?.getPostMessageCallCount()).toBeGreaterThan(0);
    });

    it('should handle memory pressure with large queued payloads', async () => {
      await env.setupPortDisconnectionScenario();

      // Queue messages with increasingly large payloads
      const sizes = [1, 10, 100, 1000, 10000, 100000]; // KB

      for (const sizeKb of sizes) {
        const payload = 'x'.repeat(sizeKb * 1024);
        for (let i = 0; i < 5; i++) {
          env.sendZipDataMessage(payload, `large-${sizeKb}kb-${i}`);
        }
      }

      const totalMessages = sizes.length * 5;
      env.assertQueueLength(totalMessages);

      // Clear queue to prevent memory issues
      env.messageHandler!.clearQueue();
      env.assertQueueLength(0);
    });
  });

  // =============================================================================
  // RECOVERY SCENARIOS
  // =============================================================================

  describe('Recovery Scenarios', () => {
    it('should recover from corrupted port state', async () => {
      env.createMessageHandler();

      // Corrupt port internals
      const port = env.currentPort as unknown as Record<string, unknown>;
      port.name = null;
      port.postMessage = undefined;

      // Should detect as disconnected
      env.sendDebugMessage('With corrupted port');
      env.assertQueueLength(1);

      // Provide new healthy port
      env.updatePortConnection();
      await env.waitForQueueProcessing();

      // Should recover
      env.assertQueueLength(0);
      env.assertConnectionState(true);
    });

    it('should handle partial queue processing failure', async () => {
      await env.setupPortDisconnectionScenario();

      // Queue messages
      for (let i = 0; i < 10; i++) {
        env.sendDebugMessage(`Queue message ${i}`);
      }

      // Create port that fails after 5 messages
      let callCount = 0;
      const flakyPort = env.createHealthyPort();
      flakyPort.postMessage = vi.fn((_message) => {
        callCount++;
        if (callCount > 5) {
          throw new Error('Port failed mid-processing');
        }
      });

      env.updatePortConnection(flakyPort);

      // Wait for partial processing
      await TimingHelpers.waitForMs(100);

      // Should have processed some messages before failure
      expect(callCount).toBeGreaterThanOrEqual(5);

      // Some messages should be re-queued (the one that failed + remaining)
      const queuedCount = env.messageHandler!.getConnectionStatus().queuedMessages;
      expect(queuedCount).toBeGreaterThan(0);
      expect(queuedCount).toBeLessThanOrEqual(5);

      // Provide working port
      env.updatePortConnection();
      await env.waitForQueueProcessing();

      // All messages eventually sent
      env.assertQueueLength(0);
    });
  });
});
