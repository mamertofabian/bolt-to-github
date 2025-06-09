/**
 * MessageHandler.memory-leaks.test.ts
 * 
 * Dedicated memory leak detection tests for MessageHandler
 * Focuses on identifying and preventing memory leaks in:
 * - Event listener accumulation
 * - Timer management
 * - Queue growth patterns
 * - Port reference cleanup
 */

import { MessageHandler } from '../MessageHandler';
import {
  MessageHandlerTestEnvironment,
  TimingHelpers,
  TestData,
} from '../test-fixtures';

describe('MessageHandler - Memory Leak Detection', () => {
  let env: MessageHandlerTestEnvironment;

  beforeEach(async () => {
    env = new MessageHandlerTestEnvironment();
    await env.setup();
  });

  afterEach(async () => {
    await env.teardown();
  });

  // =============================================================================
  // EVENT LISTENER LEAK DETECTION
  // =============================================================================

  describe('Event Listener Memory Leaks', () => {
    it('should not leak event listeners on port updates', async () => {
      env.createMessageHandler();
      
      // Get initial counts
      const initialListenerCount = env.mockEnvironment.window.getEventListenerCount('messageHandlerDisconnected');
      
      // Perform many port updates
      for (let i = 0; i < 100; i++) {
        const newPort = env.createHealthyPort();
        env.updatePortConnection(newPort);
      }
      
      // Check listener count hasn't grown
      const finalListenerCount = env.mockEnvironment.window.getEventListenerCount('messageHandlerDisconnected');
      
      // Should not accumulate listeners
      expect(finalListenerCount).toBeLessThanOrEqual(initialListenerCount + 1);
    });

    it('should cleanup port disconnect listeners properly', async () => {
      const ports = [];
      
      // Create multiple MessageHandler instances (simulating page navigation)
      for (let i = 0; i < 50; i++) {
        const port = env.createHealthyPort();
        ports.push(port);
        
        const handler = new MessageHandler(port as any);
        
        // Simulate usage
        handler.sendMessage('DEBUG', { data: `Handler ${i}` });
        
        // Update port to trigger listener setup
        const newPort = env.createHealthyPort();
        handler.updatePort(newPort as any);
        
        // Clear queue to simulate cleanup
        handler.clearQueue();
      }
      
      // Check that old ports don't accumulate listeners
      ports.forEach(port => {
        const listenerCount = (port.onDisconnect.addListener as jest.Mock).mock.calls.length;
        expect(listenerCount).toBeLessThanOrEqual(2); // Initial + one update max
      });
    });

    it('should not leak custom event listeners', async () => {
      env.createMessageHandler();
      
      // Measure initial state
      const getListenerCounts = () => ({
        messageHandlerDisconnected: env.mockEnvironment.window.getEventListenerCount('messageHandlerDisconnected'),
        total: env.mockEnvironment.window['eventListeners']?.size || 0,
      });
      
      const initialCounts = getListenerCounts();
      
      // Trigger many disconnection events
      for (let i = 0; i < 100; i++) {
        env.simulatePortError('Test error');
        env.sendDebugMessage(`Trigger event ${i}`);
        
        // Reset connection
        env.updatePortConnection();
      }
      
      const finalCounts = getListenerCounts();
      
      // Listener counts should not grow significantly
      expect(finalCounts.messageHandlerDisconnected).toBeLessThanOrEqual(
        initialCounts.messageHandlerDisconnected + 10
      );
    });
  });

  // =============================================================================
  // QUEUE MEMORY MANAGEMENT
  // =============================================================================

  describe('Queue Memory Management', () => {
    it('should not retain references to processed messages', async () => {
      await env.setupPortDisconnectionScenario();
      
      // Create messages with unique large payloads
      const largeMessages = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        payload: 'x'.repeat(100 * 1024), // 100KB each
        timestamp: Date.now(),
      }));
      
      // Queue all messages
      largeMessages.forEach(msg => {
        env.sendTestMessage('DEBUG', msg);
      });
      
      env.assertQueueLength(100);
      
      // Process queue
      env.updatePortConnection();
      await env.waitForQueueProcessing();
      
      // Queue should be completely empty
      env.assertQueueLength(0);
      
      // Verify internal queue array is actually empty
      // (This would require exposing internals or using reflection)
      const handler = env.messageHandler as any;
      if (handler.messageQueue) {
        expect(handler.messageQueue.length).toBe(0);
      }
    });

    it('should handle queue clear without memory leaks', async () => {
      await env.setupPortDisconnectionScenario();
      
      // Repeatedly fill and clear queue
      for (let cycle = 0; cycle < 10; cycle++) {
        // Fill queue with large messages
        for (let i = 0; i < 1000; i++) {
          env.sendZipDataMessage('x'.repeat(10 * 1024), `cycle-${cycle}-msg-${i}`);
        }
        
        env.assertQueueLength(1000);
        
        // Clear queue
        env.messageHandler!.clearQueue();
        env.assertQueueLength(0);
        
        // Small delay to allow GC
        await TimingHelpers.waitForMs(10);
      }
      
      // Final memory check
      const finalMemory = env.getMemorySnapshot();
      expect(finalMemory.queueSize).toBe(0);
    });

    it('should not leak memory with circular references in messages', async () => {
      await env.setupPortDisconnectionScenario();
      
      // Create messages with circular references
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
      
      // Process all messages
      env.updatePortConnection();
      await env.waitForQueueProcessing();
      
      // Verify cleanup
      env.assertQueueLength(0);
    });
  });

  // =============================================================================
  // PORT REFERENCE MANAGEMENT
  // =============================================================================

  describe('Port Reference Management', () => {
    it('should not retain references to old ports', async () => {
      env.createMessageHandler();
      
      const oldPorts = [];
      
      // Create and update many ports
      for (let i = 0; i < 100; i++) {
        const port = env.createHealthyPort();
        oldPorts.push(port);
        
        env.updatePortConnection(port);
        
        // Send a message to exercise the port
        env.sendDebugMessage(`Port ${i} message`);
      }
      
      // Handler should only retain current port
      const handler = env.messageHandler as any;
      
      // Check that old ports can be garbage collected
      // (In real scenario, we'd use weak references to verify)
      oldPorts.forEach((port, index) => {
        if (index < oldPorts.length - 1) {
          // Old ports should not be referenced
          expect(handler.port).not.toBe(port);
        }
      });
      
      // Current port should be the last one
      expect(handler.port).toBe(oldPorts[oldPorts.length - 1]);
    });

    it('should cleanup port listeners when port is replaced', async () => {
      env.createMessageHandler();
      
      // Track listener additions
      const listenerCalls: any[] = [];
      
      for (let i = 0; i < 20; i++) {
        const port = env.createHealthyPort();
        
        // Track this port's listener calls
        const addListenerMock = port.onDisconnect.addListener as jest.Mock;
        listenerCalls.push({
          port,
          calls: addListenerMock.mock.calls.length,
        });
        
        env.updatePortConnection(port);
      }
      
      // Each port should have exactly one listener added
      listenerCalls.forEach(({ calls }) => {
        expect(calls).toBe(1);
      });
    });
  });

  // =============================================================================
  // LONG-RUNNING OPERATION MEMORY TESTS
  // =============================================================================

  describe('Long-Running Operations', () => {
    it('should maintain stable memory during extended operation', async () => {
      env.createMessageHandler();
      
      const testDurationMs = 5000; // 5 seconds
      const messageIntervalMs = 10;
      const snapshotIntervalMs = 1000;
      
      const memorySnapshots: any[] = [];
      let messageCount = 0;
      
      // Take initial snapshot
      memorySnapshots.push({
        time: 0,
        ...env.getMemorySnapshot(),
      });
      
      // Start time
      const startTime = Date.now();
      
      // Message sending loop
      const messageSendPromise = (async () => {
        while (Date.now() - startTime < testDurationMs) {
          env.sendDebugMessage(`Long running test ${messageCount++}`);
          await TimingHelpers.waitForMs(messageIntervalMs);
        }
      })();
      
      // Memory monitoring loop
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
      
      // Analyze memory growth
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      
      // Memory should not grow significantly
      expect(lastSnapshot.eventListeners).toBeLessThanOrEqual(
        firstSnapshot.eventListeners + 1
      );
      expect(lastSnapshot.queueSize).toBe(0); // Should not accumulate
    });

    it('should handle connection cycling without memory growth', async () => {
      env.createMessageHandler();
      
      const cycleCount = 100;
      const messagesPerCycle = 50;
      
      const initialMemory = env.getMemorySnapshot();
      
      for (let cycle = 0; cycle < cycleCount; cycle++) {
        // Disconnect
        env.simulatePortDisconnection();
        
        // Send messages while disconnected
        for (let i = 0; i < messagesPerCycle; i++) {
          env.sendDebugMessage(`Cycle ${cycle} message ${i}`);
        }
        
        // Reconnect and process
        env.updatePortConnection();
        await env.waitForQueueProcessing();
        
        // Verify queue is empty after each cycle
        env.assertQueueLength(0);
      }
      
      const finalMemory = env.getMemorySnapshot();
      
      // Memory should return to baseline
      expect(finalMemory.eventListeners).toBeLessThanOrEqual(
        initialMemory.eventListeners + 1
      );
      expect(finalMemory.queueSize).toBe(0);
      expect(finalMemory.timers).toBeLessThanOrEqual(initialMemory.timers + 1);
    });
  });

  // =============================================================================
  // MEMORY PRESSURE TESTS
  // =============================================================================

  describe('Memory Pressure Scenarios', () => {
    it('should handle memory pressure gracefully', async () => {
      await env.setupPortDisconnectionScenario();
      
      // Simulate memory pressure by creating many large messages
      const pressureTestSize = 1000;
      const payloadSizeKb = 100; // 100KB per message
      
      env.markPerformancePoint('pressure_start');
      
      // Add messages in batches to avoid blocking
      for (let batch = 0; batch < 10; batch++) {
        for (let i = 0; i < pressureTestSize / 10; i++) {
          const largePayload = 'x'.repeat(payloadSizeKb * 1024);
          env.sendZipDataMessage(largePayload, `pressure-${batch}-${i}`);
        }
        
        // Allow event loop to process
        await TimingHelpers.waitForMs(10);
      }
      
      env.markPerformancePoint('pressure_end');
      
      // Should handle without crashing
      env.assertQueueLength(pressureTestSize);
      
      // Clear to free memory
      env.messageHandler!.clearQueue();
      env.assertQueueLength(0);
      
      // Verify reasonable performance
      const duration = env.getPerformanceDuration('pressure_start', 'pressure_end');
      expect(duration).toBeLessThan(10000); // Less than 10 seconds
    });

    it('should release memory after queue processing under pressure', async () => {
      await env.setupPortDisconnectionScenario();
      
      // Create memory pressure
      const heavyMessages = Array.from({ length: 500 }, (_, i) => ({
        type: 'ZIP_DATA' as const,
        data: {
          data: 'x'.repeat(200 * 1024), // 200KB each
          projectId: `heavy-${i}`,
          metadata: Array.from({ length: 100 }, (_, j) => ({
            key: `meta-${j}`,
            value: `value-${j}`,
          })),
        },
      }));
      
      // Queue all heavy messages
      heavyMessages.forEach(msg => {
        env.sendTestMessage(msg.type, msg.data);
      });
      
      const afterQueueSnapshot = env.getMemorySnapshot();
      expect(afterQueueSnapshot.queueSize).toBe(500);
      
      // Process all messages
      env.updatePortConnection();
      await env.waitForQueueProcessing();
      
      // Memory should be released
      const afterProcessSnapshot = env.getMemorySnapshot();
      expect(afterProcessSnapshot.queueSize).toBe(0);
      
      // Verify messages were actually sent
      env.assertPortPostMessageCalled(500);
    });
  });
});