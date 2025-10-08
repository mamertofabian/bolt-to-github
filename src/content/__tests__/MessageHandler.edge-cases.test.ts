/* eslint-disable @typescript-eslint/no-explicit-any */

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

  describe('Boundary Conditions', () => {
    describe('Queue Size Boundaries', () => {
      it('should handle empty queue edge cases', async () => {
        env.createMessageHandler();

        expect(() => env.messageHandler!.clearQueue()).not.toThrow();
        env.assertQueueLength(0);

        env.simulatePortDisconnection();
        env.updatePortConnection();
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertPortPostMessageNotCalled();
      });

      it('should handle single message queue edge case', async () => {
        await env.setupPortDisconnectionScenario();

        env.sendDebugMessage('Single queued message');
        env.assertQueueLength(1);

        env.updatePortConnection();
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(1);
      });

      it('should handle maximum practical queue size', async () => {
        await env.setupPortDisconnectionScenario();

        const maxPracticalSize = 10000;
        const batchSize = 1000;

        env.markPerformancePoint('queue_start');

        for (let i = 0; i < maxPracticalSize; i += batchSize) {
          const batch = Array.from({ length: batchSize }, (_, j) => `Message ${i + j}`);

          batch.forEach((msg) => env.sendDebugMessage(msg));
        }

        env.markPerformancePoint('queue_end');

        env.assertQueueLength(maxPracticalSize);

        const queueTime = env.getPerformanceDuration('queue_start', 'queue_end');
        expect(queueTime).toBeLessThan(5000);

        env.messageHandler!.clearQueue();
      });
    });

    describe('Message Type Boundaries', () => {
      it('should handle all defined MessageType values', async () => {
        env.createMessageHandler();

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

        env.assertPortPostMessageCalled(allMessageTypes.length);
        env.assertQueueLength(0);
      });

      it('should handle invalid message type gracefully', async () => {
        env.createMessageHandler();

        const invalidType = 'INVALID_MESSAGE_TYPE' as MessageType;

        expect(() => {
          env.sendTestMessage(invalidType, { data: 'test' });
        }).not.toThrow();

        env.assertPortPostMessageCalled(1);
      });
    });

    describe('Timing Boundaries', () => {
      it('should handle zero-delay reconnection', async () => {
        env.createMessageHandler();

        env.simulatePortDisconnection();
        env.sendDebugMessage('During instant reconnect');
        env.updatePortConnection();

        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(1);
      });

      it('should handle very long disconnection periods', async () => {
        await env.setupPortDisconnectionScenario();

        env.sendDebugMessage('Start of disconnection');
        env.sendDebugMessage('Middle of disconnection');
        env.sendDebugMessage('End of disconnection');

        env.assertQueueLength(3);

        env.updatePortConnection();
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(3);
      });
    });
  });

  describe('Race Conditions', () => {
    it('should handle simultaneous send and disconnect', async () => {
      env.createMessageHandler();

      const sendPromise = Promise.resolve().then(() => {
        for (let i = 0; i < 10; i++) {
          env.sendDebugMessage(`Concurrent send ${i}`);
        }
      });

      const disconnectPromise = Promise.resolve().then(() => {
        env.simulatePortDisconnection();
      });

      await Promise.all([sendPromise, disconnectPromise]);

      const status = env.messageHandler!.getConnectionStatus();
      expect(status.connected).toBe(false);

      const sentCount = env.currentPort
        ? (env.currentPort.postMessage as Mock).mock.calls.length
        : 0;
      const queuedCount = status.queuedMessages;
      expect(sentCount + queuedCount).toBe(10);
    });

    it('should handle simultaneous reconnection and message sending', async () => {
      await env.setupPortDisconnectionScenario();

      for (let i = 0; i < 50; i++) {
        env.sendDebugMessage(`Initial queue ${i}`);
      }

      const reconnectPromise = Promise.resolve().then(() => {
        env.updatePortConnection();
      });

      const sendPromise = Promise.resolve().then(async () => {
        await TimingHelpers.waitForMs(5);
        for (let i = 0; i < 50; i++) {
          env.sendDebugMessage(`New message ${i}`);
        }
      });

      await Promise.all([reconnectPromise, sendPromise]);
      await env.waitForQueueProcessing();

      env.assertQueueLength(0);
      expect(env.currentPort?.getPostMessageCallCount()).toBeGreaterThanOrEqual(100);
    });

    it('should handle rapid updatePort calls', async () => {
      env.createMessageHandler();

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

      const status = env.messageHandler!.getConnectionStatus();
      expect(status.connected).toBe(true);

      expect(env.currentPort?.getPostMessageCallCount()).toBeGreaterThan(0);
    });
  });

  describe('Unusual Payload Handling', () => {
    it('should handle deeply nested objects', async () => {
      env.createMessageHandler();

      let deepObject: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 100; i++) {
        deepObject = { nested: deepObject };
      }

      expect(() => {
        env.sendTestMessage('DEBUG', deepObject);
      }).not.toThrow();

      env.assertPortPostMessageCalled(1);
    });

    it('should handle objects with many properties', async () => {
      env.createMessageHandler();

      const wideObject: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        wideObject[`prop${i}`] = `value${i}`;
      }

      env.markPerformancePoint('before_wide_send');
      env.sendTestMessage('DEBUG', wideObject);
      env.markPerformancePoint('after_wide_send');

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

      const binaryData = new Uint8Array(10 * 1024);
      for (let i = 0; i < binaryData.length; i++) {
        binaryData[i] = Math.floor(Math.random() * 256);
      }

      let binaryString = '';
      const chunkSize = 8192;
      for (let i = 0; i < binaryData.length; i += chunkSize) {
        const chunk = binaryData.slice(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64Data = btoa(binaryString);

      env.sendZipDataMessage(base64Data, 'binary-test-project');

      env.assertPortPostMessageCalled(1);
    });
  });

  describe('Stress Testing', () => {
    it('should handle message burst during disconnection-reconnection cycle', async () => {
      env.createMessageHandler();

      env.sendDebugMessage('Initial message');
      const initialPort = env.currentPort;

      const burstSize = 100;

      for (let i = 0; i < 10; i++) {
        env.sendDebugMessage(`Pre-disconnect message ${i}`);
      }

      env.simulatePortDisconnection();

      for (let i = 0; i < burstSize; i++) {
        env.sendDebugMessage(`Burst message ${i}`);
      }

      expect(env.messageHandler!.getConnectionStatus().queuedMessages).toBe(burstSize);

      env.updatePortConnection();
      await env.waitForQueueProcessing();

      env.assertQueueLength(0);

      const initialPortCount = initialPort?.getPostMessageCallCount() || 0;
      const reconnectedPortCount = env.currentPort?.getPostMessageCallCount() || 0;

      expect(initialPortCount).toBeGreaterThanOrEqual(11);
      expect(reconnectedPortCount).toBe(burstSize);
    });

    it('should handle alternating connection states with continuous messaging', async () => {
      env.createMessageHandler();

      const testDurationMs = 500;
      const stateChangeIntervalMs = 50;
      const messageIntervalMs = 10;

      let isConnected = true;
      let messageCount = 0;

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

      const messageSendPromise = (async () => {
        const startTime = Date.now();
        while (Date.now() - startTime < testDurationMs) {
          env.sendDebugMessage(`Alternating test ${messageCount++}`);
          await TimingHelpers.waitForMs(messageIntervalMs);
        }
      })();

      await Promise.all([stateChangePromise, messageSendPromise]);

      if (!isConnected) {
        env.updatePortConnection();
      }
      await env.waitForQueueProcessing();

      const status = env.messageHandler!.getConnectionStatus();
      expect(status.connected).toBeDefined();
      expect(status.queuedMessages).toBe(0);

      expect(env.currentPort?.getPostMessageCallCount()).toBeGreaterThan(0);
    });

    it('should handle memory pressure with large queued payloads', async () => {
      await env.setupPortDisconnectionScenario();

      const sizes = [1, 10, 100, 1000, 10000, 100000];

      for (const sizeKb of sizes) {
        const payload = 'x'.repeat(sizeKb * 1024);
        for (let i = 0; i < 5; i++) {
          env.sendZipDataMessage(payload, `large-${sizeKb}kb-${i}`);
        }
      }

      const totalMessages = sizes.length * 5;
      env.assertQueueLength(totalMessages);

      env.messageHandler!.clearQueue();
      env.assertQueueLength(0);
    });
  });

  describe('Recovery Scenarios', () => {
    it('should recover from corrupted port state', async () => {
      env.createMessageHandler();

      const port = env.currentPort as unknown as Record<string, unknown>;
      port.name = null;
      port.postMessage = undefined;

      env.sendDebugMessage('With corrupted port');
      env.assertQueueLength(1);

      env.updatePortConnection();
      await env.waitForQueueProcessing();

      env.assertQueueLength(0);
      env.assertConnectionState(true);
    });

    it('should handle partial queue processing failure', async () => {
      await env.setupPortDisconnectionScenario();

      for (let i = 0; i < 10; i++) {
        env.sendDebugMessage(`Queue message ${i}`);
      }

      let callCount = 0;
      const flakyPort = env.createHealthyPort();
      flakyPort.postMessage = vi.fn((_message) => {
        callCount++;
        if (callCount > 5) {
          throw new Error('Port failed mid-processing');
        }
      });

      env.updatePortConnection(flakyPort);

      await TimingHelpers.waitForMs(100);

      expect(callCount).toBeGreaterThanOrEqual(5);

      const queuedCount = env.messageHandler!.getConnectionStatus().queuedMessages;
      expect(queuedCount).toBeGreaterThan(0);
      expect(queuedCount).toBeLessThanOrEqual(5);

      env.updatePortConnection();
      await env.waitForQueueProcessing();

      env.assertQueueLength(0);
    });
  });
});
