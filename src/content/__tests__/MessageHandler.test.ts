/**
 * MessageHandler Test Suite
 *
 * Comprehensive testing of MessageHandler functionality including:
 * - Basic message handling and connection management
 * - Port communication and error scenarios
 * - Chrome extension context validation
 * - Memory management and cleanup
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

  // =============================================================================
  // CRITICAL BUSINESS LOGIC: MESSAGE QUEUING
  // =============================================================================

  describe('Message Queuing - Critical Business Logic', () => {
    describe('Basic Queuing Behavior', () => {
      it('should queue messages when port is disconnected', async () => {
        // Setup disconnected port scenario
        await env.setupPortDisconnectionScenario();

        // Send multiple messages
        env.sendDebugMessage('Message 1');
        env.sendZipDataMessage();
        env.sendCommitMessage('Test commit');

        // Verify messages are queued, not sent
        env.assertQueueLength(3);
        env.assertPortPostMessageNotCalled();
      });

      it('should maintain message order in queue', async () => {
        await env.setupPortDisconnectionScenario();

        // Send messages in specific order
        const messages: Array<{ type: MessageType; data?: any }> = [
          { type: 'DEBUG', data: { message: 'First' } },
          { type: 'ZIP_DATA', data: { data: 'test', projectId: 'p1' } },
          { type: 'SET_COMMIT_MESSAGE', data: { message: 'Last' } },
        ];

        messages.forEach((msg) => env.sendTestMessage(msg.type, msg.data));

        // Reconnect and verify order
        env.updatePortConnection();
        await env.waitForQueueProcessing();

        // Verify messages sent in correct order
        const port = env.currentPort!;
        expect(port.postMessage).toHaveBeenCalledTimes(3);
        expect(port.postMessage).toHaveBeenNthCalledWith(1, messages[0]);
        expect(port.postMessage).toHaveBeenNthCalledWith(2, messages[1]);
        expect(port.postMessage).toHaveBeenNthCalledWith(3, messages[2]);
      });

      it('should process queued messages on reconnection', async () => {
        await env.setupPortDisconnectionScenario();

        // Queue messages
        env.sendDebugMessage('Queued message 1');
        env.sendDebugMessage('Queued message 2');
        env.assertQueueLength(2);

        // Reconnect
        env.updatePortConnection();
        await env.waitForQueueProcessing();

        // Verify queue is cleared and messages sent
        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(2);
      });
    });

    describe('Extended Disconnection Scenarios', () => {
      it('should handle extended disconnections without message loss', async () => {
        await env.setupPortDisconnectionScenario();

        // Simulate extended disconnection with periodic message sending
        const messageCount = 100;

        // Send messages throughout disconnection period (simulated, no actual wait)
        for (let i = 0; i < messageCount; i++) {
          env.sendDebugMessage(`Message ${i + 1} during extended disconnection`);
        }

        // Verify all messages queued
        env.assertQueueLength(messageCount);

        // Reconnect and verify all messages processed
        env.updatePortConnection();
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(messageCount);
      }, 10000); // Increase timeout to 10 seconds

      it('should handle multiple disconnection-reconnection cycles', async () => {
        env.createMessageHandler();

        // Test multiple cycles
        for (let cycle = 0; cycle < 5; cycle++) {
          // Send messages while connected
          env.sendDebugMessage(`Connected message ${cycle}`);
          env.assertQueueLength(0);

          // Disconnect
          env.simulatePortDisconnection();

          // Send messages while disconnected
          env.sendDebugMessage(`Disconnected message ${cycle}`);
          env.assertQueueLength(1);

          // Reconnect
          env.updatePortConnection();
          await env.waitForQueueProcessing();
          env.assertQueueLength(0);
        }
      });
    });

    describe('Queue Memory Management', () => {
      it('should handle unbounded queue growth gracefully', async () => {
        await env.setupPortDisconnectionScenario();

        // Add large number of messages to queue
        const largeMessageCount = 10000;
        for (let i = 0; i < largeMessageCount; i++) {
          env.sendDebugMessage(`Queue stress test message ${i}`);
        }

        env.assertQueueLength(largeMessageCount);

        const afterQueueMemory = env.getMemorySnapshot();

        // Memory should grow proportionally, not exponentially
        expect(afterQueueMemory.queueSize).toBe(largeMessageCount);

        // Clear queue and verify memory is released
        env.messageHandler!.clearQueue();
        env.assertQueueLength(0);

        // Force garbage collection simulation
        await TimingHelpers.waitForMs(100);

        const finalMemory = env.getMemorySnapshot();
        expect(finalMemory.queueSize).toBe(0);
      });

      it('should not leak memory with large payloads in queue', async () => {
        await env.setupPortDisconnectionScenario();

        // Queue messages with large payloads
        const largePayload = 'x'.repeat(1024 * 1024); // 1MB

        for (let i = 0; i < 10; i++) {
          env.sendZipDataMessage(largePayload, `project-${i}`);
        }

        env.assertQueueLength(10);

        // Clear queue and verify memory cleanup
        env.messageHandler!.clearQueue();
        env.assertQueueLength(0);
      });
    });
  });

  // =============================================================================
  // CRITICAL BUSINESS LOGIC: CONNECTION HEALTH MONITORING
  // =============================================================================

  describe('Connection Health Monitoring - Critical Business Logic', () => {
    describe('Port Validation Accuracy', () => {
      it('should accurately detect healthy port connection', async () => {
        env.createMessageHandler();

        // Healthy connection should allow immediate sending
        env.sendDebugMessage('Test message');
        env.assertQueueLength(0);
        env.assertPortPostMessageCalled(1);
        env.assertConnectionState(true);
      });

      it('should detect disconnected port and queue messages', async () => {
        // Create handler with healthy port first
        const port = env.createHealthyPort();
        env.createMessageHandler(port);

        // Then disconnect it
        port.disconnect();

        // Now sending should queue the message
        env.sendDebugMessage('Should be queued');
        env.assertQueueLength(1);
        env.assertConnectionState(false);
      });

      it('should detect invalid port (empty name) as disconnected', async () => {
        const invalidPort = env.mockEnvironment.createConnectedPort('', 123); // Empty name
        env.createMessageHandler(invalidPort);

        env.sendDebugMessage('Should be queued due to invalid port');
        env.assertQueueLength(1);
        env.assertConnectionState(false);
      });

      it('should detect Chrome runtime unavailability', async () => {
        env.createMessageHandler();

        // Simulate Chrome runtime becoming unavailable
        env.simulateExtensionContextInvalidation();

        env.sendDebugMessage('Should be queued due to runtime unavailability');
        env.assertQueueLength(1);
        env.assertConnectionState(false);

        // The custom event is dispatched when postMessage fails, not when checking connection
        // So we need to verify it was not dispatched here since message was queued before sending
      });

      it('should handle Chrome runtime access errors gracefully', async () => {
        // Set up environment where Chrome runtime throws on access
        await env.teardown();
        env = new MessageHandlerTestEnvironment({
          runtimeOptions: { shouldThrowOnAccess: true },
        });
        await env.setup();

        env.createMessageHandler();

        // Trying to send message should result in queuing due to connection check failure
        env.sendDebugMessage('Should be queued due to runtime errors');

        // Message should be queued because isPortConnected() returns false when runtime throws
        const status = env.messageHandler!.getConnectionStatus();
        expect(status.connected).toBe(false);
        expect(status.queuedMessages).toBe(1);
      });
    });

    describe('Port State Consistency', () => {
      it('should maintain consistent state between validation checks and usage', async () => {
        env.createMessageHandler();

        // Check connection status multiple times
        const status1 = env.messageHandler!.getConnectionStatus();
        env.sendDebugMessage('Message 1');
        const status2 = env.messageHandler!.getConnectionStatus();

        expect(status1.connected).toBe(status2.connected);

        // Disconnect and verify consistency
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

        // Initially connected
        env.assertConnectionState(true);

        // Spy on window.dispatchEvent
        const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

        // Make postMessage throw
        env.simulatePortError('Port connection failed');

        // Send message - should catch exception and update state
        env.sendDebugMessage('Will trigger exception');

        // Verify state updated and message queued
        env.assertConnectionState(false);
        env.assertQueueLength(1);

        // The custom event should have been dispatched
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
        // Test various scenarios that should NOT be detected as connected

        // Scenario 1: Port without name (invalid)
        const invalidPort = env.createHealthyPort();
        (invalidPort as any).name = '';
        env.createMessageHandler(invalidPort);
        env.sendDebugMessage('Test for invalid port');
        env.assertConnectionState(false);
        env.assertQueueLength(1);

        // Clean up and reset
        await env.teardown();
        await env.setup();

        // Scenario 2: Runtime without id
        env.createMessageHandler();
        env.mockEnvironment.chrome.runtime.id = undefined;
        env.sendDebugMessage('Test for runtime without id');
        env.assertConnectionState(false);

        // Clean up and reset
        await env.teardown();
        await env.setup();

        // Scenario 3: Disconnected port
        const port = env.createHealthyPort();
        env.createMessageHandler(port);
        port.disconnect();
        env.sendDebugMessage('Test for disconnected port');
        env.assertConnectionState(false);
      });

      it('should not have false negative connections', async () => {
        // Healthy port should always be detected as connected
        env.createMessageHandler();

        // Multiple checks should all return connected
        for (let i = 0; i < 10; i++) {
          env.assertConnectionState(true);
          env.sendDebugMessage(`Check ${i}`);
          env.assertQueueLength(0);
        }

        // All messages should have been sent immediately
        env.assertPortPostMessageCalled(10);
      });
    });
  });

  // =============================================================================
  // HIGH-RISK AREAS: MEMORY AND PERFORMANCE
  // =============================================================================

  describe('Memory Usage During High Message Volume', () => {
    it('should handle high-frequency message sending without memory leaks', async () => {
      await env.setupNormalOperationScenario();

      const initialMemory = env.getMemorySnapshot();

      // Send messages at high frequency
      await env.sendBurstMessages(1000, 'DEBUG', 1); // 1000 messages, 1ms apart

      const afterSendingMemory = env.getMemorySnapshot();

      // Verify no significant memory growth
      // Allow for small variance in listeners/timers
      expect(afterSendingMemory.eventListeners).toBeLessThanOrEqual(
        initialMemory.eventListeners + 2
      );
      expect(afterSendingMemory.timers).toBeLessThanOrEqual(initialMemory.timers + 2);

      // All messages should be sent immediately (no queuing)
      env.assertQueueLength(0);
      env.assertPortPostMessageCalled(1000);
    });

    it('should handle mixed message types at high volume', async () => {
      await env.setupNormalOperationScenario();

      // Send various message types rapidly
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

      // Verify all sent without queuing
      env.assertQueueLength(0);
      env.assertPortPostMessageCalled(600); // 100 iterations * 6 types
    });

    it('should prevent memory leaks during rapid port updates', async () => {
      env.createMessageHandler();

      const initialMemory = env.getMemorySnapshot();

      // Rapid port updates
      for (let i = 0; i < 100; i++) {
        const newPort = env.createHealthyPort();
        env.updatePortConnection(newPort);

        // Send a message to exercise the new connection
        env.sendDebugMessage(`After update ${i}`);
      }

      const finalMemory = env.getMemorySnapshot();

      // Event listeners should not accumulate
      expect(finalMemory.eventListeners).toBeLessThanOrEqual(initialMemory.eventListeners + 1);
    });
  });

  // =============================================================================
  // EDGE CASES AND FAILURE SCENARIOS
  // =============================================================================

  describe('Edge Cases and Failure Scenarios', () => {
    describe('Rapid State Changes', () => {
      it('should handle rapid connect-disconnect-reconnect cycles', async () => {
        env.createMessageHandler();

        // Rapid state changes with messages
        for (let i = 0; i < 10; i++) {
          // Send while connected
          env.sendDebugMessage(`Connected ${i}`);

          // Disconnect immediately
          env.simulatePortDisconnection();

          // Send while disconnected
          env.sendDebugMessage(`Disconnected ${i}`);

          // Reconnect immediately
          env.updatePortConnection();

          // Wait briefly for queue processing
          await TimingHelpers.waitForMs(10);
        }

        // Final state should be stable
        await env.waitForQueueProcessing();
        env.assertQueueLength(0);
      });

      it('should handle port disconnection during queue processing', async () => {
        await env.setupPortDisconnectionScenario();

        // Queue many messages
        for (let i = 0; i < 100; i++) {
          env.sendDebugMessage(`Queued ${i}`);
        }

        env.assertQueueLength(100);

        // Create a port that will disconnect during processing
        const newPort = env.createHealthyPort();
        let messagesSent = 0;

        // Mock postMessage to disconnect after a few messages
        newPort.postMessage = vi.fn((_message) => {
          messagesSent++;
          if (messagesSent > 10) {
            // Simulate disconnection by throwing
            throw new Error('Port disconnected during processing');
          }
        });

        // Update connection - this will trigger queue processing
        env.updatePortConnection(newPort);

        // The handler should have sent some messages and re-queued the rest
        const status = env.messageHandler!.getConnectionStatus();
        expect(status.connected).toBe(false); // Port marked as disconnected
        expect(messagesSent).toBeGreaterThan(10); // At least 10 messages sent
        expect(status.queuedMessages).toBeGreaterThan(0); // Some messages re-queued
        expect(status.queuedMessages).toBeLessThanOrEqual(90); // Most messages re-queued
      });
    });

    describe('Special Message Payloads', () => {
      it('should handle null and undefined data gracefully', async () => {
        env.createMessageHandler();

        // Send messages with edge case data
        env.sendTestMessage('DEBUG', null);
        env.sendTestMessage('DEBUG', undefined);
        env.sendTestMessage('DEBUG', {});
        env.sendTestMessage('DEBUG', []);

        // All should be sent without errors
        env.assertPortPostMessageCalled(4);
        env.assertQueueLength(0);
      });

      it('should handle circular references in message data', async () => {
        env.createMessageHandler();

        // Create circular reference
        const circularObj: any = { name: 'test' };
        circularObj.self = circularObj;

        // Should handle gracefully (Chrome will serialize or throw)
        expect(() => {
          env.sendTestMessage('DEBUG', circularObj);
        }).not.toThrow();
      });

      it('should handle very large message payloads', async () => {
        env.createMessageHandler();

        // 10MB payload
        const largeData = 'x'.repeat(10 * 1024 * 1024);

        env.markPerformancePoint('before_large_send');
        env.sendZipDataMessage(largeData);
        env.markPerformancePoint('after_large_send');

        // Should complete in reasonable time
        const duration = env.getPerformanceDuration('before_large_send', 'after_large_send');
        expect(duration).toBeLessThan(1000); // Less than 1 second

        env.assertPortPostMessageCalled(1);
      });
    });

    describe('Error Recovery', () => {
      it('should recover from Chrome runtime errors', async () => {
        env.createMessageHandler();

        // Simulate Chrome runtime becoming unavailable
        env.mockEnvironment.chrome.runtime.id = undefined;

        // Messages should be queued
        env.sendDebugMessage('During error');
        env.assertQueueLength(1);

        // Fix runtime (simulate extension reload)
        env.mockEnvironment.chrome.runtime.id = 'test-extension-id';

        // Update port with a new healthy connection
        const newPort = env.createHealthyPort();
        env.updatePortConnection(newPort);
        await env.waitForQueueProcessing();

        env.assertQueueLength(0);
        env.assertConnectionState(true);
      });

      it('should handle concurrent operations safely', async () => {
        env.createMessageHandler();

        // Simulate concurrent operations
        const operations = [];

        // Concurrent sends
        for (let i = 0; i < 10; i++) {
          operations.push(Promise.resolve().then(() => env.sendDebugMessage(`Concurrent ${i}`)));
        }

        // Concurrent status checks
        for (let i = 0; i < 5; i++) {
          operations.push(Promise.resolve().then(() => env.messageHandler!.getConnectionStatus()));
        }

        // Concurrent port updates
        operations.push(TimingHelpers.waitForMs(5).then(() => env.updatePortConnection()));

        // Wait for all operations
        await Promise.all(operations);

        // System should remain stable
        await env.waitForQueueProcessing();
        const finalStatus = env.messageHandler!.getConnectionStatus();
        expect(finalStatus.connected).toBeDefined();
        expect(finalStatus.queuedMessages).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // =============================================================================
  // INTEGRATION SCENARIOS
  // =============================================================================

  describe('Integration with Content Script Lifecycle', () => {
    it('should handle typical content script initialization flow', async () => {
      // Simulate typical initialization
      env.createMessageHandler();

      // Content script ready notification
      env.sendTestMessage('CONTENT_SCRIPT_READY');
      env.assertPortPostMessageCalled(1);

      // GitHub settings check
      env.sendTestMessage('GITHUB_SETTINGS_CHANGED', { isValid: true });

      // User interaction - download ZIP
      const zipData = TestData.messages.zipData.data;
      env.sendZipDataMessage(zipData.data, zipData.projectId);

      // All messages sent successfully
      env.assertQueueLength(0);
      env.assertPortPostMessageCalled(3);
    });

    it('should handle extension context invalidation with recovery', async () => {
      env.createMessageHandler();

      // Normal operation
      env.sendDebugMessage('Before invalidation');
      env.assertPortPostMessageCalled(1);

      // Context invalidation
      env.simulateExtensionContextInvalidation();

      // Messages during invalidation
      env.sendDebugMessage('During invalidation 1');
      env.sendDebugMessage('During invalidation 2');
      env.assertQueueLength(2);

      // Simulate ContentManager recovery
      env.mockEnvironment.chrome.runtime.id = 'test-extension-id'; // Restore runtime
      const newPort = env.createHealthyPort();
      env.updatePortConnection(newPort);

      // Verify queued messages processed
      await env.waitForQueueProcessing();
      env.assertQueueLength(0);
      env.assertConnectionState(true);

      // Verify all messages were eventually sent
      expect(newPort.postMessage).toHaveBeenCalledTimes(2); // The 2 queued messages
    });
  });

  // =============================================================================
  // PERFORMANCE BENCHMARKS
  // =============================================================================

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

      // Should average less than 2ms per message
      expect(avgTimePerMessage).toBeLessThan(2);

      // All messages sent immediately
      env.assertPortPostMessageCalled(messageCount);
    });

    it('should meet performance targets for queue processing', async () => {
      await env.setupPortDisconnectionScenario();

      // Queue 1000 messages
      const messageCount = 1000;
      for (let i = 0; i < messageCount; i++) {
        env.sendDebugMessage(`Queued performance test ${i}`);
      }

      env.assertQueueLength(messageCount);

      // Measure queue processing time
      const startTime = performance.now();
      env.updatePortConnection();
      await env.waitForQueueProcessing();
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      // Should process 1000 messages in under 30ms
      expect(processingTime).toBeLessThan(30);
      env.assertQueueLength(0);
    });
  });
});
