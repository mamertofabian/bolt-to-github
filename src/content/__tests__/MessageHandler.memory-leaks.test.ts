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

import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageHandler } from '../MessageHandler';
import { MessageHandlerTestEnvironment, TimingHelpers } from '../test-fixtures';

describe('MessageHandler - Memory Leak Detection', () => {
  let env: MessageHandlerTestEnvironment;

  beforeEach(async () => {
    env = new MessageHandlerTestEnvironment();
    await env.setup();
  });

  afterEach(async () => {
    await env.teardown();
  });

  describe('Event Listener Memory Leaks', () => {
    it('should not leak event listeners on port updates', async () => {
      env.createMessageHandler();

      const initialListenerCount = env.mockEnvironment.window.getEventListenerCount(
        'messageHandlerDisconnected'
      );

      for (let i = 0; i < 100; i++) {
        const newPort = env.createHealthyPort();
        env.updatePortConnection(newPort);
      }

      const finalListenerCount = env.mockEnvironment.window.getEventListenerCount(
        'messageHandlerDisconnected'
      );

      expect(finalListenerCount).toBeLessThanOrEqual(initialListenerCount + 1);
    });

    it('should cleanup port disconnect listeners properly', async () => {
      const ports = [];

      for (let i = 0; i < 50; i++) {
        const port = env.createHealthyPort();
        ports.push(port);

        const handler = new MessageHandler(port as any);

        handler.sendMessage('DEBUG', { data: `Handler ${i}` });

        const newPort = env.createHealthyPort();
        handler.updatePort(newPort as any);

        handler.clearQueue();
      }

      ports.forEach((port) => {
        const listenerCount = (port.onDisconnect.addListener as Mock).mock.calls.length;
        expect(listenerCount).toBeLessThanOrEqual(2);
      });
    });

    it('should not leak custom event listeners', async () => {
      env.createMessageHandler();

      const getListenerCounts = () => ({
        messageHandlerDisconnected: env.mockEnvironment.window.getEventListenerCount(
          'messageHandlerDisconnected'
        ),
        total: env.mockEnvironment.window['eventListeners']?.size || 0,
      });

      const initialCounts = getListenerCounts();

      for (let i = 0; i < 100; i++) {
        env.simulatePortError('Test error');
        env.sendDebugMessage(`Trigger event ${i}`);

        env.updatePortConnection();
      }

      const finalCounts = getListenerCounts();

      expect(finalCounts.messageHandlerDisconnected).toBeLessThanOrEqual(
        initialCounts.messageHandlerDisconnected + 10
      );
    });
  });

  describe('Queue Memory Management', () => {
    it('should not retain references to processed messages', async () => {
      await env.setupPortDisconnectionScenario();

      const largeMessages = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        payload: 'x'.repeat(100 * 1024),
        timestamp: Date.now(),
      }));

      largeMessages.forEach((msg) => {
        env.sendTestMessage('DEBUG', msg);
      });

      env.assertQueueLength(100);

      env.updatePortConnection();
      await env.waitForQueueProcessing();

      env.assertQueueLength(0);

      const handler = env.messageHandler as any;
      if (handler.messageQueue) {
        expect(handler.messageQueue.length).toBe(0);
      }
    });

    it('should handle queue clear without memory leaks', async () => {
      await env.setupPortDisconnectionScenario();

      for (let cycle = 0; cycle < 10; cycle++) {
        for (let i = 0; i < 1000; i++) {
          env.sendZipDataMessage('x'.repeat(10 * 1024), `cycle-${cycle}-msg-${i}`);
        }

        env.assertQueueLength(1000);

        env.messageHandler!.clearQueue();
        env.assertQueueLength(0);

        await TimingHelpers.waitForMs(10);
      }

      const finalMemory = env.getMemorySnapshot();
      expect(finalMemory.queueSize).toBe(0);
    });

    it('should not leak memory with circular references in messages', async () => {
      await env.setupPortDisconnectionScenario();

      for (let i = 0; i < 100; i++) {
        const circularData: any = {
          id: i,
          data: { nested: {} },
        };
        circularData.data.nested.parent = circularData;
        circularData.self = circularData;

        env.sendTestMessage('DEBUG', circularData);
      }

      env.assertQueueLength(100);

      env.updatePortConnection();
      await env.waitForQueueProcessing();

      env.assertQueueLength(0);
    });
  });

  describe('Port Reference Management', () => {
    it('should not retain references to old ports', async () => {
      env.createMessageHandler();

      const oldPorts = [];

      for (let i = 0; i < 100; i++) {
        const port = env.createHealthyPort();
        oldPorts.push(port);

        env.updatePortConnection(port);

        env.sendDebugMessage(`Port ${i} message`);
      }

      const handler = env.messageHandler as any;

      oldPorts.forEach((port, index) => {
        if (index < oldPorts.length - 1) {
          expect(handler.port).not.toBe(port);
        }
      });

      expect(handler.port).toBe(oldPorts[oldPorts.length - 1]);
    });

    it('should cleanup port listeners when port is replaced', async () => {
      env.createMessageHandler();

      const ports: any[] = [];

      for (let i = 0; i < 20; i++) {
        const port = env.createHealthyPort();
        const addListenerMock = port.onDisconnect.addListener as Mock;

        const initialCalls = addListenerMock.mock.calls.length;

        env.updatePortConnection(port);

        const afterCalls = addListenerMock.mock.calls.length;
        expect(afterCalls - initialCalls).toBe(1);

        ports.push(port);
      }

      ports.forEach((port) => {
        const listenerCount = (port.onDisconnect.addListener as Mock).mock.calls.length;
        expect(listenerCount).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Long-Running Operations', () => {
    it('should maintain stable memory during extended operation', async () => {
      env.createMessageHandler();

      const testDurationMs = 2000;
      const messageIntervalMs = 10;
      const snapshotIntervalMs = 500;

      const memorySnapshots: any[] = [];
      let messageCount = 0;

      memorySnapshots.push({
        time: 0,
        ...env.getMemorySnapshot(),
      });

      const startTime = Date.now();

      const messageSendPromise = (async () => {
        while (Date.now() - startTime < testDurationMs) {
          env.sendDebugMessage(`Long running test ${messageCount++}`);
          await TimingHelpers.waitForMs(messageIntervalMs);
        }
      })();

      const memoryMonitorPromise = (async () => {
        while (Date.now() - startTime < testDurationMs) {
          await TimingHelpers.waitForMs(snapshotIntervalMs);
          memorySnapshots.push({
            time: Date.now() - startTime,
            ...env.getMemorySnapshot(),
          });
        }
      })();

      await Promise.all([messageSendPromise, memoryMonitorPromise]);

      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];

      expect(lastSnapshot.eventListeners).toBeLessThanOrEqual(firstSnapshot.eventListeners + 1);
      expect(lastSnapshot.queueSize).toBe(0);
    }, 10000);

    it('should handle connection cycling without memory growth', async () => {
      env.createMessageHandler();

      const cycleCount = 100;
      const messagesPerCycle = 50;

      const initialMemory = env.getMemorySnapshot();

      for (let cycle = 0; cycle < cycleCount; cycle++) {
        env.simulatePortDisconnection();

        for (let i = 0; i < messagesPerCycle; i++) {
          env.sendDebugMessage(`Cycle ${cycle} message ${i}`);
        }

        env.updatePortConnection();
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
      }

      const finalMemory = env.getMemorySnapshot();

      expect(finalMemory.eventListeners).toBeLessThanOrEqual(initialMemory.eventListeners + 1);
      expect(finalMemory.queueSize).toBe(0);
      expect(finalMemory.timers).toBeLessThanOrEqual(initialMemory.timers + 1);
    });
  });

  describe('Memory Pressure Scenarios', () => {
    it('should handle memory pressure gracefully', async () => {
      await env.setupPortDisconnectionScenario();

      const pressureTestSize = 1000;
      const payloadSizeKb = 100;

      env.markPerformancePoint('pressure_start');

      for (let batch = 0; batch < 10; batch++) {
        for (let i = 0; i < pressureTestSize / 10; i++) {
          const largePayload = 'x'.repeat(payloadSizeKb * 1024);
          env.sendZipDataMessage(largePayload, `pressure-${batch}-${i}`);
        }

        await TimingHelpers.waitForMs(10);
      }

      env.markPerformancePoint('pressure_end');

      env.assertQueueLength(pressureTestSize);

      env.messageHandler!.clearQueue();
      env.assertQueueLength(0);

      const duration = env.getPerformanceDuration('pressure_start', 'pressure_end');
      expect(duration).toBeLessThan(10000);
    });

    it('should release memory after queue processing under pressure', async () => {
      await env.setupPortDisconnectionScenario();

      const heavyMessages = Array.from({ length: 500 }, (_, i) => ({
        type: 'ZIP_DATA' as const,
        data: {
          data: 'x'.repeat(200 * 1024),
          projectId: `heavy-${i}`,
          metadata: Array.from({ length: 100 }, (_, j) => ({
            key: `meta-${j}`,
            value: `value-${j}`,
          })),
        },
      }));

      heavyMessages.forEach((msg) => {
        env.sendTestMessage(msg.type, msg.data);
      });

      const afterQueueSnapshot = env.getMemorySnapshot();
      expect(afterQueueSnapshot.queueSize).toBe(500);

      env.updatePortConnection();
      await env.waitForQueueProcessing();

      const afterProcessSnapshot = env.getMemorySnapshot();
      expect(afterProcessSnapshot.queueSize).toBe(0);

      env.assertPortPostMessageCalled(500);
    });
  });
});
