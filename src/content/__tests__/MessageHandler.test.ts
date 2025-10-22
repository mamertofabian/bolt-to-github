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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageHandlerTestEnvironment, TestData, TimingHelpers } from '../test-fixtures';

describe('MessageHandler', () => {
  let env: MessageHandlerTestEnvironment;

  beforeEach(async () => {
    env = new MessageHandlerTestEnvironment();
    await env.setup();
  });

  afterEach(async () => {
    await env.teardown();
  });

  describe('Message Queuing - Critical Business Logic', () => {
    describe('Basic Queuing Behavior', () => {
      it('should queue messages when port is disconnected', async () => {
        await env.setupPortDisconnectionScenario();

        env.sendDebugMessage('Message 1');
        env.sendZipDataMessage();
        env.sendCommitMessage('Test commit');

        env.assertQueueLength(3);
        env.assertPortPostMessageNotCalled();
      });

      it('should maintain message order in queue', async () => {
        await env.setupPortDisconnectionScenario();

        const messages: Array<{ type: MessageType; data?: any }> = [
          { type: 'DEBUG', data: { message: 'First' } },
          { type: 'ZIP_DATA', data: { data: 'test', projectId: 'p1' } },
          { type: 'SET_COMMIT_MESSAGE', data: { message: 'Last' } },
        ];

        messages.forEach((msg) => env.sendTestMessage(msg.type, msg.data));

        env.updatePortConnection();
        await env.waitForQueueProcessing();

        const port = env.currentPort!;
        expect(port.postMessage).toHaveBeenCalledTimes(3);
        expect(port.postMessage).toHaveBeenNthCalledWith(1, messages[0]);
        expect(port.postMessage).toHaveBeenNthCalledWith(2, messages[1]);
        expect(port.postMessage).toHaveBeenNthCalledWith(3, messages[2]);
      });

      it('should process queued messages on reconnection', async () => {
        await env.setupPortDisconnectionScenario();

        env.sendDebugMessage('Queued message 1');
        env.sendDebugMessage('Queued message 2');
        env.assertQueueLength(2);

        env.updatePortConnection();
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(2);
      });
    });

    describe('Extended Disconnection Scenarios', () => {
      it('should handle extended disconnections without message loss', async () => {
        await env.setupPortDisconnectionScenario();

        const messageCount = 100;

        for (let i = 0; i < messageCount; i++) {
          env.sendDebugMessage(`Message ${i + 1} during extended disconnection`);
        }

        env.assertQueueLength(messageCount);

        env.updatePortConnection();
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(messageCount);
      }, 10000);

      it('should handle multiple disconnection-reconnection cycles', async () => {
        env.createMessageHandler();

        for (let cycle = 0; cycle < 5; cycle++) {
          env.sendDebugMessage(`Connected message ${cycle}`);
          env.assertQueueLength(0);

          env.simulatePortDisconnection();

          env.sendDebugMessage(`Disconnected message ${cycle}`);
          env.assertQueueLength(1);

          env.updatePortConnection();
          await env.waitForQueueProcessing();
          env.assertQueueLength(0);
        }
      });
    });

    describe('Queue Memory Management', () => {
      it('should handle unbounded queue growth gracefully', async () => {
        await env.setupPortDisconnectionScenario();

        const largeMessageCount = 10000;
        for (let i = 0; i < largeMessageCount; i++) {
          env.sendDebugMessage(`Queue stress test message ${i}`);
        }

        env.assertQueueLength(largeMessageCount);

        const afterQueueMemory = env.getMemorySnapshot();

        expect(afterQueueMemory.queueSize).toBe(largeMessageCount);

        env.messageHandler!.clearQueue();
        env.assertQueueLength(0);

        await TimingHelpers.waitForMs(100);

        const finalMemory = env.getMemorySnapshot();
        expect(finalMemory.queueSize).toBe(0);
      });

      it('should not leak memory with large payloads in queue', async () => {
        await env.setupPortDisconnectionScenario();

        const largePayload = 'x'.repeat(1024 * 1024);

        for (let i = 0; i < 10; i++) {
          env.sendZipDataMessage(largePayload, `project-${i}`);
        }

        env.assertQueueLength(10);

        env.messageHandler!.clearQueue();
        env.assertQueueLength(0);
      });
    });
  });

  describe('Connection Health Monitoring - Critical Business Logic', () => {
    describe('Port Validation Accuracy', () => {
      it('should accurately detect healthy port connection', async () => {
        env.createMessageHandler();

        env.sendDebugMessage('Test message');
        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(1);
        env.assertConnectionState(true);
      });

      it('should detect disconnected port and queue messages', async () => {
        const port = env.createHealthyPort();
        env.createMessageHandler(port);

        port.disconnect();

        env.sendDebugMessage('Should be queued');
        env.assertQueueLength(1);
        env.assertConnectionState(false);
      });

      it('should detect invalid port (empty name) as disconnected', async () => {
        const invalidPort = env.mockEnvironment.createConnectedPort('', 123);
        env.createMessageHandler(invalidPort);

        env.sendDebugMessage('Should be queued due to invalid port');
        env.assertQueueLength(1);
        env.assertConnectionState(false);
      });

      it('should detect Chrome runtime unavailability', async () => {
        env.createMessageHandler();

        env.simulateExtensionContextInvalidation();

        env.sendDebugMessage('Should be queued due to runtime unavailability');
        env.assertQueueLength(1);
        env.assertConnectionState(false);
      });

      it('should handle Chrome runtime access errors gracefully', async () => {
        await env.teardown();
        env = new MessageHandlerTestEnvironment({
          runtimeOptions: { shouldThrowOnAccess: true },
        });
        await env.setup();

        env.createMessageHandler();

        env.sendDebugMessage('Should be queued due to runtime errors');

        const status = env.messageHandler!.getConnectionStatus();
        expect(status.connected).toBe(false);
        expect(status.queuedMessages).toBe(1);
      });
    });

    describe('Port State Consistency', () => {
      it('should maintain consistent state between validation checks and usage', async () => {
        env.createMessageHandler();

        const status1 = env.messageHandler!.getConnectionStatus();
        env.sendDebugMessage('Message 1');
        const status2 = env.messageHandler!.getConnectionStatus();

        expect(status1.connected).toBe(status2.connected);

        env.simulatePortDisconnection();

        const status3 = env.messageHandler!.getConnectionStatus();
        env.sendDebugMessage('Message 2');
        const status4 = env.messageHandler!.getConnectionStatus();

        expect(status3.connected).toBe(false);
        expect(status4.connected).toBe(false);
        expect(status4.queuedMessages).toBe(1);
      });

      it('should handle postMessage exceptions by updating connection state', async () => {
        env.createMessageHandler();

        env.assertConnectionState(true);

        const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

        env.simulatePortError('Port connection failed');

        env.sendDebugMessage('Will trigger exception');

        env.assertConnectionState(false);
        env.assertQueueLength(1);

        expect(dispatchEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'messageHandlerDisconnected',
            detail: { reason: 'Port connection failed' },
          })
        );

        dispatchEventSpy.mockRestore();
      });
    });

    describe('False Connection Detection Prevention', () => {
      it('should not have false positive connections', async () => {
        const invalidPort = env.createHealthyPort();
        (invalidPort as any).name = '';
        env.createMessageHandler(invalidPort);
        env.sendDebugMessage('Test for invalid port');
        env.assertConnectionState(false);
        env.assertQueueLength(1);

        await env.teardown();
        await env.setup();

        env.createMessageHandler();
        env.mockEnvironment.chrome.runtime.id = undefined;
        env.sendDebugMessage('Test for runtime without id');
        env.assertConnectionState(false);

        await env.teardown();
        await env.setup();

        const port = env.createHealthyPort();
        env.createMessageHandler(port);
        port.disconnect();
        env.sendDebugMessage('Test for disconnected port');
        env.assertConnectionState(false);
      });

      it('should not have false negative connections', async () => {
        env.createMessageHandler();

        for (let i = 0; i < 10; i++) {
          env.assertConnectionState(true);
          env.sendDebugMessage(`Check ${i}`);
          env.assertQueueLength(0);
        }

        env.assertPortPostMessageCalled(10);
      });
    });
  });

  describe('Memory Usage During High Message Volume', () => {
    it('should handle high-frequency message sending without memory leaks', async () => {
      await env.setupNormalOperationScenario();

      const initialMemory = env.getMemorySnapshot();

      await env.sendBurstMessages(1000, 'DEBUG', 1);

      const afterSendingMemory = env.getMemorySnapshot();

      expect(afterSendingMemory.eventListeners).toBeLessThanOrEqual(
        initialMemory.eventListeners + 2
      );
      expect(afterSendingMemory.timers).toBeLessThanOrEqual(initialMemory.timers + 2);

      env.assertQueueLength(0);
      env.assertPortPostMessageCalled(1000);
    });

    it('should handle mixed message types at high volume', async () => {
      await env.setupNormalOperationScenario();

      const messageTypes: MessageType[] = [
        'DEBUG',
        'ZIP_DATA',
        'SET_COMMIT_MESSAGE',
        'HEARTBEAT',
        'UPLOAD_STATUS',
        'GITHUB_SETTINGS_CHANGED',
      ];

      for (let i = 0; i < 100; i++) {
        for (const type of messageTypes) {
          env.sendTestMessage(type, { index: i, type });
        }
      }

      env.assertQueueLength(0);
      env.assertPortPostMessageCalled(600);
    });

    it('should prevent memory leaks during rapid port updates', async () => {
      env.createMessageHandler();

      const initialMemory = env.getMemorySnapshot();

      for (let i = 0; i < 100; i++) {
        const newPort = env.createHealthyPort();
        env.updatePortConnection(newPort);

        env.sendDebugMessage(`After update ${i}`);
      }

      const finalMemory = env.getMemorySnapshot();

      expect(finalMemory.eventListeners).toBeLessThanOrEqual(initialMemory.eventListeners + 1);
    });
  });

  describe('Edge Cases and Failure Scenarios', () => {
    describe('Rapid State Changes', () => {
      it('should handle rapid connect-disconnect-reconnect cycles', async () => {
        env.createMessageHandler();

        for (let i = 0; i < 10; i++) {
          env.sendDebugMessage(`Connected ${i}`);

          env.simulatePortDisconnection();

          env.sendDebugMessage(`Disconnected ${i}`);

          env.updatePortConnection();

          await TimingHelpers.waitForMs(10);
        }

        await env.waitForQueueProcessing();
        env.assertQueueLength(0);
      });

      it('should handle port disconnection during queue processing', async () => {
        await env.setupPortDisconnectionScenario();

        for (let i = 0; i < 100; i++) {
          env.sendDebugMessage(`Queued ${i}`);
        }

        env.assertQueueLength(100);

        const newPort = env.createHealthyPort();
        let messagesSent = 0;

        newPort.postMessage = vi.fn((_message) => {
          messagesSent++;
          if (messagesSent > 10) {
            throw new Error('Port disconnected during processing');
          }
        });

        env.updatePortConnection(newPort);

        const status = env.messageHandler!.getConnectionStatus();
        expect(status.connected).toBe(false);
        expect(messagesSent).toBeGreaterThan(10);
        expect(status.queuedMessages).toBeGreaterThan(0);
        expect(status.queuedMessages).toBeLessThanOrEqual(90);
      });
    });

    describe('Special Message Payloads', () => {
      it('should handle null and undefined data gracefully', async () => {
        env.createMessageHandler();

        env.sendTestMessage('DEBUG', null);
        env.sendTestMessage('DEBUG', undefined);
        env.sendTestMessage('DEBUG', {});
        env.sendTestMessage('DEBUG', []);

        env.assertPortPostMessageCalled(4);
        env.assertQueueLength(0);
      });

      it('should handle circular references in message data', async () => {
        env.createMessageHandler();

        const circularObj: any = { name: 'test' };
        circularObj.self = circularObj;

        expect(() => {
          env.sendTestMessage('DEBUG', circularObj);
        }).not.toThrow();
      });

      it('should handle very large message payloads', async () => {
        env.createMessageHandler();

        const largeData = 'x'.repeat(10 * 1024 * 1024);

        env.markPerformancePoint('before_large_send');
        env.sendZipDataMessage(largeData);
        env.markPerformancePoint('after_large_send');

        const duration = env.getPerformanceDuration('before_large_send', 'after_large_send');
        expect(duration).toBeLessThan(1000);

        env.assertPortPostMessageCalled(1);
      });
    });

    describe('Error Recovery', () => {
      it('should recover from Chrome runtime errors', async () => {
        env.createMessageHandler();

        env.mockEnvironment.chrome.runtime.id = undefined;

        env.sendDebugMessage('During error');
        env.assertQueueLength(1);

        env.mockEnvironment.chrome.runtime.id = 'test-extension-id';

        const newPort = env.createHealthyPort();
        env.updatePortConnection(newPort);
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertConnectionState(true);
      });

      it('should handle concurrent operations safely', async () => {
        env.createMessageHandler();

        const operations = [];

        for (let i = 0; i < 10; i++) {
          operations.push(Promise.resolve().then(() => env.sendDebugMessage(`Concurrent ${i}`)));
        }

        for (let i = 0; i < 5; i++) {
          operations.push(Promise.resolve().then(() => env.messageHandler!.getConnectionStatus()));
        }

        operations.push(TimingHelpers.waitForMs(5).then(() => env.updatePortConnection()));

        await Promise.all(operations);

        await env.waitForQueueProcessing();
        const finalStatus = env.messageHandler!.getConnectionStatus();
        expect(finalStatus.connected).toBeDefined();
        expect(finalStatus.queuedMessages).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Integration with Content Script Lifecycle', () => {
    it('should handle typical content script initialization flow', async () => {
      env.createMessageHandler();

      env.sendTestMessage('CONTENT_SCRIPT_READY');
      env.assertPortPostMessageCalled(1);

      env.sendTestMessage('GITHUB_SETTINGS_CHANGED', { isValid: true });

      const zipData = TestData.messages.zipData.data;
      env.sendZipDataMessage(zipData.data, zipData.projectId);

      env.assertQueueLength(0);
      env.assertPortPostMessageCalled(3);
    });

    it('should handle extension context invalidation with recovery', async () => {
      env.createMessageHandler();

      env.sendDebugMessage('Before invalidation');
      env.assertPortPostMessageCalled(1);

      env.simulateExtensionContextInvalidation();

      env.sendDebugMessage('During invalidation 1');
      env.sendDebugMessage('During invalidation 2');
      env.assertQueueLength(2);

      env.mockEnvironment.chrome.runtime.id = 'test-extension-id';
      const newPort = env.createHealthyPort();
      env.updatePortConnection(newPort);

      await env.waitForQueueProcessing();
      env.assertQueueLength(0);
      env.assertConnectionState(true);

      expect(newPort.postMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance targets for message sending', async () => {
      env.createMessageHandler();

      const messageCount = 1000;
      const startTime = performance.now();

      for (let i = 0; i < messageCount; i++) {
        env.sendDebugMessage(`Performance test ${i}`);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerMessage = totalTime / messageCount;

      expect(avgTimePerMessage).toBeLessThan(2);

      env.assertPortPostMessageCalled(messageCount);
    });

    it('should meet performance targets for queue processing', async () => {
      await env.setupPortDisconnectionScenario();

      const messageCount = 1000;
      for (let i = 0; i < messageCount; i++) {
        env.sendDebugMessage(`Queued performance test ${i}`);
      }

      env.assertQueueLength(messageCount);

      const startTime = performance.now();
      env.updatePortConnection();
      await env.waitForQueueProcessing();
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(50);
      env.assertQueueLength(0);
    });
  });
});
