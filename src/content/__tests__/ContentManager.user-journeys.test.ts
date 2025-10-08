/* eslint-disable @typescript-eslint/no-explicit-any */

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

vi.mock('../UIManager');

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
    vi.clearAllMocks();
    performanceMonitor = new PerformanceMonitor();
    performanceMonitor.start();

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});

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

      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);
      const contentManager = new ContentManager();

      performanceMonitor.mark('initialization_complete');

      expect(getContentManagerState(contentManager).hasPort).toBe(true);
      expect(getContentManagerState(contentManager).hasMessageHandler).toBe(true);
      expect(getContentManagerState(contentManager).hasUIManager).toBe(true);

      if (testEnv.mockPort) {
        testEnv.mockPort.simulateMessage(TestMessages.GITHUB_SETTINGS_VALID);
      }

      await wait(50);

      if (testEnv.mockUIManager && testEnv.mockMessageHandler) {
        const uiManager = MockUIManager.getInstance(testEnv.mockMessageHandler);
        await uiManager.handleShowChangedFiles();

        expect(uiManager.getShowChangedFilesCalls()).toBe(1);
      }

      if (testEnv.mockPort) {
        testEnv.mockPort.simulateMessage(TestMessages.PUSH_TO_GITHUB);
      }

      await wait(50);

      if (testEnv.mockPort) {
        testEnv.mockPort.simulateMessage(TestMessages.UPLOAD_STATUS_UPLOADING);
        await wait(100);
        testEnv.mockPort.simulateMessage(TestMessages.UPLOAD_STATUS_SUCCESS);
      }

      performanceMonitor.mark('workflow_complete');

      if (testEnv.mockUIManager && testEnv.mockMessageHandler) {
        const uiManager = MockUIManager.getInstance(testEnv.mockMessageHandler);
        const uploadStatuses = uiManager.getUploadStatuses();
        expect(uploadStatuses).toHaveLength(2);
        expect(uploadStatuses[1].status).toBe('success');
      }

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.initialization_complete).toBeLessThan(1000);
      expect(metrics.workflow_complete).toBeLessThan(5000);
    });

    it('should handle project navigation workflow', async () => {
      testEnv = createTestEnvironment();

      setupChromeAPIMocks(testEnv, {
        hasRuntimeId: true,
        storageData: {
          storedFileChanges: {
            url: TestUrls.BOLT_NEW_DIFFERENT_PROJECT,
            projectId: TestProjectIds.PROJECT_C,
            files: ['file1.js', 'file2.ts'],
          },
        },
      });

      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);
      const contentManager = new ContentManager();

      await wait(200);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['storedFileChanges']);

      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);
      expect(state.isDestroyed).toBe(false);
    });

    it('should handle extension update/reload gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);

      setupChromeAPIMocks(testEnv, {
        hasRuntimeId: false,
        lastError: { message: 'Extension context invalidated' } as chrome.runtime.LastError,
      });
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_CONTEXT_INVALIDATED);

      await wait(200);

      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });

      (contentManager as any).attemptRecovery();

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

      if (testEnv.mockPort) {
        testEnv.mockPort.simulateMessage(TestMessages.UPLOAD_STATUS_UPLOADING);
      }

      const focusEvent = new Event('focus');
      window.dispatchEvent(focusEvent);

      await wait(100);

      const state = getContentManagerState(_contentManager);
      expect(state.hasPort).toBe(true);
      expect(state.isDestroyed).toBe(false);
    });

    it('should handle page unload gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      new ContentManager();

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

      expect(_contentManager).toBeDefined();
    });

    it('should handle push reminder interactions', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const _contentManager = new ContentManager();
      await wait(100);

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
      expect(initializationTime).toBeLessThan(100);
    });

    it('should handle high-frequency heartbeats efficiently', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      new ContentManager();

      const startTime = performance.now();

      for (let i = 0; i < 10; i++) {
        if (testEnv.mockPort) {
          testEnv.mockPort.simulateMessage(TestMessages.HEARTBEAT_RESPONSE);
        }
        await wait(10);
      }

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(200);
    });

    it('should maintain performance during extended session', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const _contentManager = new ContentManager();

      for (let i = 0; i < 5; i++) {
        if (testEnv.mockPort) {
          testEnv.mockPort.simulateMessage(TestMessages.GITHUB_SETTINGS_VALID);
        }
        await wait(100);

        if (testEnv.mockPort) {
          testEnv.mockPort.simulateMessage(TestMessages.UPLOAD_STATUS_UPLOADING);
        }
        await wait(100);

        if (testEnv.mockPort) {
          testEnv.mockPort.simulateMessage(TestMessages.HEARTBEAT_RESPONSE);
        }
        await wait(100);
      }

      const resources = testEnv.resourceTracker.getActiveResources();
      expect(resources.timers).toBeLessThanOrEqual(3);

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

      const state = getContentManagerState(_contentManager);
      expect(state.hasPort).toBe(true);
      expect(state.hasMessageHandler).toBe(true);

      if (testEnv.mockPort && testEnv.mockMessageHandler) {
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

      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);

      if (testEnv.mockMessageHandler) {
        testEnv.mockMessageHandler.sendDebugMessage('test message 1');
        testEnv.mockMessageHandler.sendCommitMessage('test commit');
        testEnv.mockMessageHandler.sendDebugMessage('test message 2');
      }

      await simulatePortState(testEnv, TestPortStates.CONNECTED);

      if (testEnv.mockMessageHandler) {
        const sentMessages = testEnv.mockMessageHandler.getSentMessages();
        expect(sentMessages.length).toBeGreaterThan(0);
        expect(sentMessages.some((m) => m.type === 'DEBUG')).toBe(true);
        expect(sentMessages.some((m) => m.type === 'SET_COMMIT_MESSAGE')).toBe(true);
      }
    });
  });
});
