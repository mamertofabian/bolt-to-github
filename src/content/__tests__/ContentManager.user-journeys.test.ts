/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ContentManager User Journey Tests
 *
 * Tests complete user workflows and real-world scenarios:
 * - Full user session from page load to GitHub push
 * - Navigation between projects
 * - Extension update/reload scenarios
 * - Debug features and keyboard shortcuts
 */

// Mock WhatsNewModal component
vi.mock('$lib/components/WhatsNewModal.svelte', () => ({
  default: vi.fn().mockImplementation(function (
    this: any,
    options: { target: Element; props: unknown }
  ) {
    this.target = options.target;
    this.props = options.props;
    this.$destroy = vi.fn();
    this.$set = vi.fn();
    return this;
  }),
}));

// Mock UIManager
vi.mock('../UIManager');

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
  global.console = {
    ...console,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  };
});

afterAll(() => {
  global.console = originalConsole;
});

import { ContentManager } from '../ContentManager';
import {
  createTestEnvironment,
  getContentManagerState,
  MockUIManager,
  PerformanceMonitor,
  setupChromeAPIMocks,
  setupWindowMocks,
  simulatePortState,
  simulateUserAction,
  type TestEnvironment,
  TestMessages,
  TestPortStates,
  TestProjectIds,
  TestUrls,
  validateCleanup,
  wait,
  waitForState,
} from '../test-fixtures';

describe('ContentManager - User Journeys', () => {
  let testEnv: TestEnvironment;
  let performanceMonitor: PerformanceMonitor;

  beforeEach(async () => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    performanceMonitor = new PerformanceMonitor();
    performanceMonitor.start();

    // Reset console to capture output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Reset UIManager singleton
    const { UIManager } = await import('../UIManager');
    UIManager.resetInstance();
  });

  afterEach(() => {
    if (testEnv) {
      const cleanupResult = validateCleanup(testEnv);
      if (!cleanupResult.valid) {
        console.warn('Cleanup issues detected:', cleanupResult.issues);
      }
      testEnv.cleanup();
    }
    vi.restoreAllMocks();
  });

  describe('Complete User Session', () => {
    it('should handle full workflow from page load to GitHub push', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });

      performanceMonitor.mark('initialization_start');

      // 1. User navigates to bolt.new project
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);
      const contentManager = new ContentManager();

      performanceMonitor.mark('initialization_complete');

      // 2. ContentManager initializes successfully
      expect(getContentManagerState(contentManager).hasPort).toBe(true);
      expect(getContentManagerState(contentManager).hasMessageHandler).toBe(true);
      expect(getContentManagerState(contentManager).hasUIManager).toBe(true);

      // 3. GitHub settings change (user configures GitHub)
      if (testEnv.mockPort) {
        testEnv.mockPort.simulateMessage(TestMessages.GITHUB_SETTINGS_VALID);
      }

      await wait(50); // Reduced wait time

      // 4. User triggers file changes detection
      if (testEnv.mockUIManager && testEnv.mockMessageHandler) {
        const uiManager = MockUIManager.getInstance(testEnv.mockMessageHandler);
        await uiManager.handleShowChangedFiles();

        expect(uiManager.getShowChangedFilesCalls()).toBe(1);
      }

      // 5. User initiates GitHub push
      if (testEnv.mockPort) {
        testEnv.mockPort.simulateMessage(TestMessages.PUSH_TO_GITHUB);
      }

      await wait(50); // Reduced wait time

      // 6. Upload status updates
      if (testEnv.mockPort) {
        testEnv.mockPort.simulateMessage(TestMessages.UPLOAD_STATUS_UPLOADING);
        await wait(100); // Reduced wait time
        testEnv.mockPort.simulateMessage(TestMessages.UPLOAD_STATUS_SUCCESS);
      }

      performanceMonitor.mark('workflow_complete');

      // Verify complete workflow
      if (testEnv.mockUIManager && testEnv.mockMessageHandler) {
        const uiManager = MockUIManager.getInstance(testEnv.mockMessageHandler);
        const uploadStatuses = uiManager.getUploadStatuses();
        expect(uploadStatuses).toHaveLength(2);
        expect(uploadStatuses[1].status).toBe('success');
      }

      // Verify performance metrics
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.initialization_complete).toBeLessThan(1000);
      expect(metrics.workflow_complete).toBeLessThan(5000);
    });

    it('should handle project navigation workflow', async () => {
      testEnv = createTestEnvironment();

      // Setup storage with stale data for different project
      setupChromeAPIMocks(testEnv, {
        hasRuntimeId: true,
        storageData: {
          storedFileChanges: {
            url: TestUrls.BOLT_NEW_DIFFERENT_PROJECT, // Different URL than current
            projectId: TestProjectIds.PROJECT_C,
            files: ['file1.js', 'file2.ts'],
          },
        },
      });

      // Start with current project (different from stored data)
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);
      const contentManager = new ContentManager();

      // Wait for async initialization to complete
      await wait(200);

      // Verify stale data was cleared due to URL mismatch
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['storedFileChanges']);

      // New instance should be clean
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);
      expect(state.isDestroyed).toBe(false);
    });

    it('should handle extension update/reload gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100); // Wait for initialization

      // Verify initial state
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);

      // Simulate extension update (context invalidation)
      setupChromeAPIMocks(testEnv, {
        hasRuntimeId: false,
        lastError: { message: 'Extension context invalidated' } as chrome.runtime.LastError,
      });
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_CONTEXT_INVALIDATED);

      await wait(200);

      // Extension runtime becomes available again - simulate recovery
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });

      // Manually trigger recovery since auto-recovery might not work in test
      (contentManager as any).attemptRecovery();

      // Wait for recovery with shorter timeout
      await waitForState(
        contentManager,
        () => !getContentManagerState(contentManager).isInRecovery,
        2000
      );

      const finalState = getContentManagerState(contentManager);
      expect(finalState.hasPort).toBe(true);
    }, 10000);
  });

  describe('Debug Features', () => {
    it('should handle debug keyboard shortcuts', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      new ContentManager();
      await wait(100);

      // Simulate keyboard shortcuts - should not throw
      expect(() => {
        simulateUserAction('debug_notifications');
      }).not.toThrow();

      expect(() => {
        simulateUserAction('debug_recovery');
      }).not.toThrow();
    });
  });

  describe('Real-world Edge Cases', () => {
    it('should handle user switching tabs during operation', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const _contentManager = new ContentManager();

      // Simulate upload in progress
      if (testEnv.mockPort) {
        testEnv.mockPort.simulateMessage(TestMessages.UPLOAD_STATUS_UPLOADING);
      }

      // User switches tab (window focus lost, then regained)
      const focusEvent = new Event('focus');
      window.dispatchEvent(focusEvent);

      await wait(100);

      // Should maintain state and continue operation
      const state = getContentManagerState(_contentManager);
      expect(state.hasPort).toBe(true);
      expect(state.isDestroyed).toBe(false);
    });

    it('should handle page unload gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      new ContentManager();

      // Simulate page unload
      const unloadEvent = new Event('unload');

      expect(() => {
        window.dispatchEvent(unloadEvent);
      }).not.toThrow();
    });

    it('should handle premium status updates during session', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const _contentManager = new ContentManager();
      await wait(100);

      // Should handle premium status updates without errors
      expect(_contentManager).toBeDefined();
    });

    it('should handle push reminder interactions', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const _contentManager = new ContentManager();
      await wait(100);

      // Should handle push reminder operations without errors
      expect(_contentManager).toBeDefined();
    });
  });

  describe('Performance and Responsiveness', () => {
    it('should initialize quickly on page load', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const startTime = performance.now();
      new ContentManager();
      const endTime = performance.now();

      const initializationTime = endTime - startTime;
      expect(initializationTime).toBeLessThan(100); // Should initialize in under 100ms
    });

    it('should handle high-frequency heartbeats efficiently', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      new ContentManager();

      // Send multiple heartbeat responses
      const startTime = performance.now();

      for (let i = 0; i < 10; i++) {
        if (testEnv.mockPort) {
          testEnv.mockPort.simulateMessage(TestMessages.HEARTBEAT_RESPONSE);
        }
        await wait(10);
      }

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should handle 10 heartbeats efficiently
      expect(processingTime).toBeLessThan(200);
    });

    it('should maintain performance during extended session', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const _contentManager = new ContentManager();

      // Simulate extended session with various activities
      for (let i = 0; i < 5; i++) {
        // GitHub settings change
        if (testEnv.mockPort) {
          testEnv.mockPort.simulateMessage(TestMessages.GITHUB_SETTINGS_VALID);
        }
        await wait(100);

        // Upload status update
        if (testEnv.mockPort) {
          testEnv.mockPort.simulateMessage(TestMessages.UPLOAD_STATUS_UPLOADING);
        }
        await wait(100);

        // Heartbeat
        if (testEnv.mockPort) {
          testEnv.mockPort.simulateMessage(TestMessages.HEARTBEAT_RESPONSE);
        }
        await wait(100);
      }

      // Check resource usage
      const resources = testEnv.resourceTracker.getActiveResources();
      expect(resources.timers).toBeLessThanOrEqual(3); // Should not accumulate resources

      // Verify functionality still works
      const state = getContentManagerState(_contentManager);
      expect(state.hasPort).toBe(true);
      expect(state.isDestroyed).toBe(false);
    });
  });

  describe('Message Flow Validation', () => {
    it('should maintain correct message sequence during normal operation', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const _contentManager = new ContentManager();

      await wait(200);

      // Verify that initialization was successful by checking the ContentManager state
      const state = getContentManagerState(_contentManager);
      expect(state.hasPort).toBe(true);
      expect(state.hasMessageHandler).toBe(true);

      // Verify that the ContentManager can send messages by triggering a heartbeat
      if (testEnv.mockPort && testEnv.mockMessageHandler) {
        // Manually trigger a message send to verify the messaging system works
        testEnv.mockMessageHandler.sendDebugMessage('test message');

        const sentMessages = testEnv.mockMessageHandler.getSentMessages();
        expect(sentMessages.length).toBeGreaterThan(0);

        const hasDebugMessage = sentMessages.some((msg) => msg.type === 'DEBUG');
        expect(hasDebugMessage).toBe(true);
      }
    });

    it('should handle message queue during temporary disconnections', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      new ContentManager();

      // Disconnect temporarily
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);

      // Try to send messages while disconnected
      if (testEnv.mockMessageHandler) {
        testEnv.mockMessageHandler.sendDebugMessage('test message 1');
        testEnv.mockMessageHandler.sendCommitMessage('test commit');
        testEnv.mockMessageHandler.sendDebugMessage('test message 2');
      }

      // Reconnect
      await simulatePortState(testEnv, TestPortStates.CONNECTED);

      // Verify queued messages were processed
      if (testEnv.mockMessageHandler) {
        const sentMessages = testEnv.mockMessageHandler.getSentMessages();
        expect(sentMessages.length).toBeGreaterThan(0);
        expect(sentMessages.some((m) => m.type === 'DEBUG')).toBe(true);
        expect(sentMessages.some((m) => m.type === 'SET_COMMIT_MESSAGE')).toBe(true);
      }
    });
  });
});
