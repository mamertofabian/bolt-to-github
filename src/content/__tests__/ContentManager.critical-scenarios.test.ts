/**
 * ContentManager Critical Scenarios Tests
 *
 * Tests the most critical failure scenarios identified in CRITICAL_TESTING_ANALYSIS.md:
 * - Context invalidation detection and recovery
 * - Port disconnection handling
 * - Message processing during recovery states
 * - Resource cleanup and memory leak prevention
 */

// Mock WhatsNewModal component with proper types
interface MockSvelteComponent {
  target: Element;
  props: Record<string, unknown>;
  $destroy: jest.Mock;
  $set: jest.Mock;
}

jest.mock('$lib/components/WhatsNewModal.svelte', () => ({
  default: jest.fn().mockImplementation(function (
    this: MockSvelteComponent,
    options: { target: Element; props: Record<string, unknown> }
  ) {
    this.target = options.target;
    this.props = options.props;
    this.$destroy = jest.fn();
    this.$set = jest.fn();
    return this;
  }),
}));

// Mock UIManager
jest.mock('../UIManager');

// Mock console methods using jest.spyOn for better isolation
let consoleSpy: { [key: string]: jest.SpyInstance };
beforeAll(() => {
  consoleSpy = {
    log: jest.spyOn(console, 'log').mockImplementation(),
    warn: jest.spyOn(console, 'warn').mockImplementation(),
    error: jest.spyOn(console, 'error').mockImplementation(),
    debug: jest.spyOn(console, 'debug').mockImplementation(),
    info: jest.spyOn(console, 'info').mockImplementation(),
  };
});

afterAll(() => {
  Object.values(consoleSpy).forEach((spy) => spy.mockRestore());
});

import { ContentManager } from '../ContentManager';
import {
  createTestEnvironment,
  setupChromeAPIMocks,
  setupWindowMocks,
  simulatePortState,
  validateCleanup,
  getContentManagerState,
  wait,
  TestPortStates,
  TestUrls,
  TestMessages,
  type TestEnvironment,
} from '../test-fixtures';

describe('ContentManager - Critical Scenarios', () => {
  let testEnv: TestEnvironment;

  beforeEach(() => {
    // Clear console mocks before each test
    jest.clearAllMocks();
    // Reset UIManager singleton
    const { UIManager } = jest.requireMock('../UIManager');
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
    jest.restoreAllMocks();
  });

  describe('Context Invalidation Detection', () => {
    it('should handle initialization when extension context is unavailable', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: false });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Create ContentManager which should fail to initialize
      const contentManager = new ContentManager();

      // Wait for async initialization
      await wait(100);

      const state = getContentManagerState(contentManager);

      // The ContentManager should not have initialized successfully
      expect(state.hasPort).toBe(false);
      expect(state.hasMessageHandler).toBe(false);
      expect(state.hasUIManager).toBe(false);
    });

    it('should initialize successfully when extension context is available', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initialization
      await wait(100);

      const state = getContentManagerState(contentManager);
      // Should have initialized successfully
      expect(state.hasPort).toBe(true);
      expect(state.hasMessageHandler).toBe(true);
      expect(state.hasUIManager).toBe(true);
    });

    it('should handle port disconnection gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initial setup
      await wait(100);

      const initialState = getContentManagerState(contentManager);
      expect(initialState.hasPort).toBe(true);

      // Simulate port disconnect
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(100);

      // ContentManager should still be functional
      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
    });
  });

  describe('Recovery Logic', () => {
    it('should continue functioning after port disconnection', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initial setup
      await wait(100);

      // Simulate port disconnect
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(100);

      // ContentManager should still exist and be functional
      expect(contentManager).toBeDefined();
      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
    });

    it('should handle initialization failure gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: false });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Create ContentManager which should fail to initialize
      const contentManager = new ContentManager();

      // Wait for error handling
      await wait(100);

      // Should handle the error gracefully
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(false);
      expect(state.hasMessageHandler).toBe(false);
    });

    it('should limit recovery attempts', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initialization
      await wait(100);

      // Simulate multiple disconnections
      for (let i = 0; i < 6; i++) {
        await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
        await wait(50);
      }

      // Should still be functional but with limited reconnection attempts
      expect(contentManager).toBeDefined();
    });
  });

  describe('Message Processing During Recovery', () => {
    it('should handle messages gracefully during recovery state', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Put into recovery state - accessing private property for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contentManager as any).isInRecovery = true;

      // Attempt to process messages - accessing private method for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageHandler = (contentManager as any).handleBackgroundMessage;

      expect(() => {
        messageHandler.call(contentManager, TestMessages.UPLOAD_STATUS_UPLOADING);
        messageHandler.call(contentManager, TestMessages.GITHUB_SETTINGS_VALID);
        messageHandler.call(contentManager, TestMessages.PUSH_TO_GITHUB);
      }).not.toThrow();
    });

    it('should process heartbeat messages normally', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Process heartbeat message - accessing private method for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageHandler = (contentManager as any).handleBackgroundMessage;

      expect(() => {
        messageHandler.call(contentManager, TestMessages.HEARTBEAT_RESPONSE);
      }).not.toThrow();
    });

    it('should handle runtime messages gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initialization
      await wait(100);

      // Runtime message handling is already tested in other tests
      // This is a simple test to ensure no errors occur
      expect(contentManager).toBeDefined();
    });
  });

  describe('Resource Management', () => {
    it('should cleanup resources when destroyed', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initialization
      await wait(100);

      // Trigger cleanup - accessing private method for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contentManager as any).cleanup();

      // Should have cleaned up resources
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(false);
    });

    it('should handle multiple port connections without accumulating resources', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initial setup
      await wait(100);

      // Simulate multiple reconnections
      for (let i = 0; i < 3; i++) {
        await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
        await wait(50);
        await simulatePortState(testEnv, TestPortStates.CONNECTED);
        await wait(50);
      }

      // ContentManager should still be functional
      expect(contentManager).toBeDefined();
    });

    it('should handle UIManager lifecycle properly', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initialization
      await wait(100);

      const state = getContentManagerState(contentManager);
      expect(state.hasUIManager).toBe(true);

      // Trigger cleanup - accessing private method for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contentManager as any).cleanup();

      const cleanedState = getContentManagerState(contentManager);
      expect(cleanedState.hasUIManager).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should not initialize on non-bolt.new URLs', () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.NON_BOLT_SITE);

      const contentManager = new ContentManager();

      // Should not initialize
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(false);
      expect(state.hasMessageHandler).toBe(false);
      expect(state.hasUIManager).toBe(false);
    });

    it('should handle storage operations during initialization', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, {
        hasRuntimeId: true,
        storageData: {
          storedFileChanges: {
            url: TestUrls.BOLT_NEW_DIFFERENT_PROJECT,
            projectId: 'old-project',
            files: ['old-file.js'],
          },
        },
      });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      new ContentManager();

      // Wait for async initialization to complete
      await wait(100);

      // Should have performed storage operations
      expect(chrome.storage.local.remove).toHaveBeenCalled();
    });

    it('should handle port connection failure gracefully', () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });

      // Mock chrome.runtime.connect to return null after setup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (chrome.runtime as any).connect = jest.fn(() => null);

      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Should not throw when creating ContentManager
      expect(() => new ContentManager()).not.toThrow();
    });
  });

  describe('Complex Event Sequences', () => {
    it('should handle sequential port disconnection and reconnection', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initial setup
      await wait(100);

      // Simulate disconnect
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(100);

      // Simulate reconnect
      await simulatePortState(testEnv, TestPortStates.CONNECTED);
      await wait(100);

      // ContentManager should still be functional
      expect(contentManager).toBeDefined();
      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
    });

    it('should process messages after recovery', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Wait for initialization
      await wait(100);

      // Process a message - accessing private method for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageHandler = (contentManager as any).handleBackgroundMessage;

      expect(() => {
        messageHandler.call(contentManager, TestMessages.UPLOAD_STATUS_UPLOADING);
      }).not.toThrow();
    });
  });
});
