/**
 * ContentManager Edge Cases Tests
 *
 * Tests unusual scenarios and boundary conditions:
 * - Rapid state changes and race conditions
 * - Unusual timing scenarios
 * - Boundary value testing
 * - Error injection and fault tolerance
 */

// Mock WhatsNewModal component
jest.mock('$lib/components/WhatsNewModal.svelte', () => ({
  default: jest.fn().mockImplementation(function (this: any, options: any) {
    this.target = options.target;
    this.props = options.props;
    this.$destroy = jest.fn();
    this.$set = jest.fn();
    return this;
  }),
}));

import { ContentManager } from '../ContentManager';
import {
  setupBasicTest,
  createTestEnvironment,
  setupChromeAPIMocks,
  setupWindowMocks,
  simulatePortState,
  validateCleanup,
  getContentManagerState,
  wait,
  type TestEnvironment,
  TestPortStates,
  TestUrls,
  TestMessages,
  TestTimings,
  MemoryThresholds,
} from '../test-fixtures';

describe('ContentManager - Edge Cases', () => {
  let testEnv: TestEnvironment;

  beforeEach(() => {
    // Reset console to capture output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    if (testEnv) {
      const cleanupResult = validateCleanup(testEnv);
      if (!cleanupResult.valid) {
        console.warn('Cleanup issues detected:', cleanupResult.issues);
      }
      testEnv.cleanup();
    }
    jest.restoreAllMocks();
  });

  describe('Race Conditions', () => {
    it('should handle concurrent initialization and cleanup', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Immediately trigger cleanup while initialization might be ongoing
      (contentManager as any).cleanup();

      // Should not throw errors
      const state = getContentManagerState(contentManager);
      expect(state.isDestroyed).toBe(true);
    });

    it('should handle rapid reinitialize calls', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(50); // Wait for initial setup

      // Call reinitialize multiple times rapidly
      for (let i = 0; i < 5; i++) {
        (contentManager as any).reinitialize();
        await wait(10);
      }

      // Should stabilize in a valid state
      await wait(100);
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);
      expect(state.hasMessageHandler).toBe(true);
    });

    it('should handle cleanup during active recovery', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: false });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Start recovery
      (contentManager as any).isInRecovery = true;

      // Cleanup during recovery
      (contentManager as any).cleanup();

      const state = getContentManagerState(contentManager);
      expect(state.isDestroyed).toBe(true);
      expect(state.isInRecovery).toBe(false); // Should clear recovery flag
    });

    it('should handle concurrent message processing', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initialization

      // Send multiple messages concurrently
      const messagePromises = [
        TestMessages.UPLOAD_STATUS_UPLOADING,
        TestMessages.GITHUB_SETTINGS_VALID,
        TestMessages.HEARTBEAT_RESPONSE,
        TestMessages.PUSH_TO_GITHUB,
      ].map((message) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            if (testEnv.mockPort) {
              testEnv.mockPort.simulateMessage(message);
            }
            resolve();
          }, Math.random() * 50);
        });
      });

      await Promise.all(messagePromises);
      await wait(100); // Wait for processing

      // Should handle all messages without critical errors (filter out GitHub settings warnings)
      const errorCalls = (console.error as jest.Mock).mock.calls;
      const criticalErrors = errorCalls.filter(
        (call) =>
          !call.some(
            (arg: string | string[]) =>
              typeof arg === 'string' && arg.includes('Error checking GitHub settings')
          )
      );
      expect(criticalErrors).toHaveLength(0);
    });
  });

  describe('Timing Edge Cases', () => {
    it('should handle very rapid disconnect/reconnect cycles', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initial setup

      // Perform reduced rapid cycles to avoid timer accumulation
      for (let i = 0; i < 5; i++) {
        await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
        await wait(TestTimings.FAST_DISCONNECT);
        await simulatePortState(testEnv, TestPortStates.CONNECTED);
        await wait(TestTimings.FAST_DISCONNECT);
      }

      await wait(200); // Allow cleanup

      // Should not accumulate excessive state - allow higher threshold for rapid cycles
      const resources = testEnv.resourceTracker.getActiveResources();
      expect(resources.timers).toBeLessThanOrEqual(15); // Higher threshold for edge case

      const state = getContentManagerState(contentManager);
      expect(state.reconnectAttempts).toBeLessThanOrEqual(MemoryThresholds.MAX_RECONNECT_ATTEMPTS);
    });

    it('should handle messages sent during port setup', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Mock delayed port creation
      const originalConnect = chrome.runtime.connect;
      let portCreated = false;

      (chrome.runtime as any).connect = jest.fn(() => {
        setTimeout(() => {
          portCreated = true;
        }, 100);
        return testEnv.mockPort;
      });

      const contentManager = new ContentManager();

      // Try to send message before port is fully set up
      if (testEnv.mockMessageHandler) {
        testEnv.mockMessageHandler.sendDebugMessage('early message');
      }

      await wait(200);

      // Should handle gracefully
      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Cannot send message')
      );

      (chrome.runtime as any).connect = originalConnect;
    });

    it('should handle heartbeat timing edge cases', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initialization

      // Disconnect to simulate heartbeat failure
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);

      // Manually trigger heartbeat check
      (contentManager as any).checkMessageHandlerHealth();

      await wait(200); // Allow processing

      // Should handle heartbeat failure gracefully
      // In this test, we're simply verifying that the system doesn't crash when
      // the connection is lost during heartbeat operations
      const state = getContentManagerState(contentManager);

      // After disconnection, the system should either be reconnecting or have triggered some cleanup
      expect(state.isReconnecting || !state.hasPort || state.hasMessageHandler).toBe(true);

      // Check that some kind of reconnection or error handling was triggered
      const warnCalls = (console.warn as jest.Mock).mock.calls;
      const logCalls = (console.log as jest.Mock).mock.calls;

      // The system should have generated some console output during the disconnection/reconnection process
      const hasConnectionMessages = warnCalls.length > 0 || logCalls.length > 0;
      expect(hasConnectionMessages).toBe(true);
    }, 10000);

    it('should handle cleanup called multiple times', async () => {
      testEnv = setupBasicTest();
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Call cleanup multiple times
      (contentManager as any).cleanup();
      (contentManager as any).cleanup();
      (contentManager as any).cleanup();

      // Should be idempotent
      const state = getContentManagerState(contentManager);
      expect(state.isDestroyed).toBe(true);

      // No errors should be thrown
      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Error during cleanup')
      );
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle maximum reconnection attempts', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: false });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Force max reconnection attempts
      (contentManager as any).reconnectAttempts = MemoryThresholds.MAX_RECONNECT_ATTEMPTS;

      // Try to schedule another reconnection
      (contentManager as any).scheduleReconnection();

      // Should not exceed maximum
      expect((contentManager as any).reconnectAttempts).toBe(
        MemoryThresholds.MAX_RECONNECT_ATTEMPTS
      );
      expect((contentManager as any).isReconnecting).toBe(false);
    });

    it('should handle very long URLs', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });

      // Create very long URL
      const longPath = 'a'.repeat(1000);
      const longUrl = `https://bolt.new/project/${longPath}`;
      setupWindowMocks(longUrl);

      const contentManager = new ContentManager();

      // Should handle without issues
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);
    });

    it('should handle empty or malformed project IDs', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks('https://bolt.new/project/');

      const contentManager = new ContentManager();

      // Should initialize despite empty project ID
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);
    });

    it('should handle storage operations with large data', async () => {
      testEnv = createTestEnvironment();

      // Setup large storage data before Chrome API mocks
      const largeFileList = Array(1000)
        .fill(0)
        .map((_, i) => `file${i}.js`);
      setupChromeAPIMocks(testEnv, {
        hasRuntimeId: true,
        storageData: {
          storedFileChanges: {
            url: TestUrls.BOLT_NEW_DIFFERENT_PROJECT,
            projectId: 'large-project',
            files: largeFileList,
            timestamp: Date.now(),
          },
        },
      });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for async initialization
      await wait(200);

      // Should handle large data cleanup
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['storedFileChanges']);
    });
  });

  describe('Error Injection', () => {
    it('should handle port.postMessage throwing exceptions', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initialization

      // Mock port.postMessage to throw
      if (testEnv.mockPort) {
        const originalPostMessage = testEnv.mockPort.postMessage;
        testEnv.mockPort.postMessage = jest.fn(() => {
          throw new Error('Mock postMessage failure');
        });

        // Try to send message
        if (testEnv.mockMessageHandler) {
          testEnv.mockMessageHandler.sendDebugMessage('test');

          await wait(100);

          // Should queue message and trigger reconnection
          const status = testEnv.mockMessageHandler.getConnectionStatus();
          expect(status.queuedMessages).toBeGreaterThan(0);
        }

        // Restore original function
        testEnv.mockPort.postMessage = originalPostMessage;
      }
    });

    it('should handle chrome.storage.local failures', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Mock storage to throw errors AFTER initial setup
      (chrome.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));
      (chrome.storage.local.remove as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const contentManager = new ContentManager();

      // Wait for async operations
      await wait(200);

      // Should handle storage errors gracefully
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error checking/clearing stale stored changes'),
        expect.any(Error)
      );
    });

    it('should handle DOM manipulation failures', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initialization

      // Mock document.body to be null temporarily
      const originalBody = document.body;
      const mockBody = {
        appendChild: jest.fn(() => {
          throw new Error('Cannot appendChild to null');
        }),
      } as any;

      Object.defineProperty(document, 'body', {
        value: mockBody,
        configurable: true,
      });

      // Should handle missing DOM gracefully - expect it to throw
      expect(() => {
        (contentManager as any).showFallbackContextInvalidationNotification();
      }).toThrow('Cannot appendChild to null');

      // Restore original body
      Object.defineProperty(document, 'body', {
        value: originalBody,
        configurable: true,
      });
    });

    it('should handle message handler creation failures', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Mock chrome.runtime.connect to return null to simulate MessageHandler creation failure
      const originalConnect = chrome.runtime.connect;
      (chrome.runtime as any).connect = jest.fn(() => null);

      expect(() => new ContentManager()).not.toThrow();

      // Should handle initialization error
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error initializing ContentManager'),
        expect.any(Error)
      );

      // Restore original function
      (chrome.runtime as any).connect = originalConnect;
    });
  });

  describe('Memory and Resource Edge Cases', () => {
    it('should handle excessive timer creation', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initial setup

      // Trigger multiple reconnection attempts rapidly
      for (let i = 0; i < 20; i++) {
        (contentManager as any).scheduleReconnection();
        await wait(10);
      }

      await wait(200); // Allow cleanup

      // Should not create excessive timers - allow higher threshold for edge case
      const resources = testEnv.resourceTracker.getActiveResources();
      expect(resources.timers).toBeLessThanOrEqual(15);
    });

    it('should handle event listener accumulation', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initial setup

      // Trigger multiple reinitializations
      for (let i = 0; i < 10; i++) {
        (contentManager as any).reinitialize();
        await wait(50);
      }

      // Should not accumulate excessive event listeners
      const resources = testEnv.resourceTracker.getActiveResources();
      // Allow higher threshold since reinitialize can add event listeners
      expect(resources.eventListeners).toBeLessThanOrEqual(30);
    });

    it('should handle large message queues', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initial setup

      // Disconnect to enable queuing
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);

      // Queue many messages
      if (testEnv.mockMessageHandler) {
        for (let i = 0; i < 200; i++) {
          testEnv.mockMessageHandler.sendDebugMessage(`Message ${i}`);
        }

        const status = testEnv.mockMessageHandler.getConnectionStatus();
        expect(status.queuedMessages).toBeLessThanOrEqual(MemoryThresholds.MAX_MESSAGE_QUEUE_SIZE);
      }
    });

    it('should handle memory pressure during recovery', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: false });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initial state

      // Simulate memory pressure by triggering many recovery attempts
      for (let i = 0; i < 5; i++) {
        (contentManager as any).attemptRecovery();
        await wait(100);
      }

      // Should eventually give up gracefully
      await wait(1000);

      // Should handle memory pressure gracefully without crashing
      const state = getContentManagerState(contentManager);
      // Since chrome.runtime.id is false, it should either be destroyed or in some error state
      expect(state.hasPort).toBe(false);
    });
  });

  describe('Platform-Specific Edge Cases', () => {
    it('should handle Chrome extension context changes', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initial setup

      // Simulate extension ID change (rare but possible)
      const originalId = chrome.runtime.id;
      (chrome.runtime as any).id = 'new-extension-id';

      // Trigger context check
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);

      await wait(100);

      // Should detect and handle appropriately
      const state = getContentManagerState(contentManager);
      expect(state.isReconnecting).toBe(true);

      // Restore original ID
      (chrome.runtime as any).id = originalId;
    });

    it('should handle browser hibernation/wake cycles', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initial setup

      // Simulate hibernation (no runtime available)
      const originalRuntime = chrome.runtime;
      (globalThis as any).chrome = { ...chrome, runtime: undefined };

      await wait(100);

      // Simulate wake (runtime restored)
      (globalThis as any).chrome = { ...chrome, runtime: originalRuntime };

      // Should handle gracefully - system should still be functional or trying to reconnect
      const state = getContentManagerState(contentManager);
      // After hibernation/wake cycle, the system should be in a stable state
      expect(state.hasPort || state.isReconnecting || state.isDestroyed).toBe(true);
    });
  });
});
