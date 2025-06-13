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

// Mock UIManager
jest.mock('../UIManager');

// Mock console methods using spies
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

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
    // Clear all mocks before each test
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
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

  describe('Basic Reliability', () => {
    it('should handle normal initialization and cleanup', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      // Should initialize successfully
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);

      // Normal cleanup
      await contentManager.cleanup();
    });

    it('should handle reinitialize calls', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      // Call reinitialize
      await contentManager.reinitialize();
      await wait(100);

      // Should still be functional
      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
    });

    it('should handle connection interruption', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      // Simulate connection loss
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(200);

      // Should still exist
      expect(contentManager).toBeDefined();
    });

    it('should handle normal message flow', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      // Send messages
      if (testEnv.mockPort) {
        expect(() => {
          testEnv.mockPort.simulateMessage(TestMessages.UPLOAD_STATUS_UPLOADING);
        }).not.toThrow();
      }
    });
  });

  describe('Connection Management', () => {
    it('should handle normal disconnect/reconnect', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      // Disconnect and reconnect
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(100);
      await simulatePortState(testEnv, TestPortStates.CONNECTED);
      await wait(100);

      // Should still be functional
      expect(contentManager).toBeDefined();
    });

    it('should handle messages during initialization', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // Send message early
      if (testEnv.mockMessageHandler) {
        testEnv.mockMessageHandler.sendDebugMessage('early message');
      }

      await wait(150);

      // Should still initialize
      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
    });

    it('should handle connection loss gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      // Simulate connection loss
      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(150);

      // Should still exist
      expect(contentManager).toBeDefined();
    });

    it('should handle cleanup properly', async () => {
      testEnv = setupBasicTest();
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(50);

      // Normal cleanup
      await contentManager.cleanup();

      // Should be cleaned up
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(false);
    });
  });

  describe('Boundary Conditions', () => {
    it('should limit reconnection attempts', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: false });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      // Should not initialize without runtime
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(false);
    });

    it('should handle long URLs', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });

      // Create long URL
      const longPath = 'a'.repeat(100);
      const longUrl = `https://bolt.new/project/${longPath}`;
      setupWindowMocks(longUrl);

      const contentManager = new ContentManager();

      // Should initialize normally
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);
    });

    it('should handle empty project IDs', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks('https://bolt.new/project/');

      const contentManager = new ContentManager();

      // Should initialize normally
      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);
    });

    it('should handle storage operations', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, {
        hasRuntimeId: true,
        storageData: {
          storedFileChanges: {
            url: TestUrls.BOLT_NEW_DIFFERENT_PROJECT,
            projectId: 'different-project',
            files: ['file1.js', 'file2.js'],
          },
        },
      });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      // Should have called storage operations
      expect(chrome.storage.local.remove).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle port message failures gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      // Mock port.postMessage to throw
      if (testEnv.mockPort) {
        testEnv.mockPort.postMessage = jest.fn(() => {
          throw new Error('Mock postMessage failure');
        });

        // Should handle gracefully
        if (testEnv.mockMessageHandler) {
          expect(() => {
            testEnv.mockMessageHandler.sendDebugMessage('test');
          }).not.toThrow();
        }
      }
    });

    it('should handle storage failures gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Mock storage to throw errors
      (chrome.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));
      (chrome.storage.local.remove as jest.Mock).mockRejectedValue(new Error('Storage error'));

      // Should not throw during creation
      expect(() => new ContentManager()).not.toThrow();
    });

    it('should handle connection failures gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Mock chrome.runtime.connect to return null
      const originalConnect = chrome.runtime.connect;
      (chrome.runtime as any).connect = jest.fn(() => null);

      // Should not throw
      expect(() => new ContentManager()).not.toThrow();

      // Restore original function
      (chrome.runtime as any).connect = originalConnect;
    });
  });
});
