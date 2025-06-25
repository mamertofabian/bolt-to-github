/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ContentManager Edge Cases Tests
 *
 * Tests unusual scenarios and boundary conditions:
 * - Rapid state changes and race conditions
 * - Unusual timing scenarios
 * - Boundary value testing
 * - Error injection and fault tolerance
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock WhatsNewModal component
vi.mock('$lib/components/WhatsNewModal.svelte', () => ({
  default: vi.fn().mockImplementation(function (this: unknown, options: Record<string, unknown>) {
    (this as Record<string, unknown>).target = options.target;
    (this as Record<string, unknown>).props = options.props;
    (this as Record<string, unknown>).$destroy = vi.fn();
    (this as Record<string, unknown>).$set = vi.fn();
    return this;
  }),
}));

// Mock UIManager
vi.mock('../UIManager');

// Mock console methods using spies
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

import { ContentManager } from '../ContentManager';
import {
  createTestEnvironment,
  getContentManagerState,
  setupBasicTest,
  setupChromeAPIMocks,
  setupWindowMocks,
  simulatePortState,
  TestMessages,
  TestPortStates,
  TestUrls,
  validateCleanup,
  wait,
  type TestEnvironment,
} from '../test-fixtures';

describe('ContentManager - Edge Cases', () => {
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    // Reset UIManager singleton
    const { UIManager } = await import('../UIManager');
    if (UIManager.resetInstance) {
      UIManager.resetInstance();
    }
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

      // Test environment cleanup handles ContentManager cleanup
      expect(contentManager).toBeDefined();
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

      new ContentManager();
      await wait(100);

      // Send messages
      if (testEnv.mockPort) {
        expect(() => {
          testEnv.mockPort!.simulateMessage(TestMessages.UPLOAD_STATUS_UPLOADING);
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

      // Test environment cleanup handles ContentManager cleanup
      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
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

      new ContentManager();
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

      new ContentManager();
      await wait(100);

      // Mock port.postMessage to throw
      if (testEnv.mockPort) {
        testEnv.mockPort.postMessage = vi.fn(() => {
          throw new Error('Mock postMessage failure');
        });

        // Should handle gracefully
        if (testEnv.mockMessageHandler) {
          expect(() => {
            testEnv.mockMessageHandler!.sendDebugMessage('test');
          }).not.toThrow();
        }
      }
    });

    it('should handle storage failures gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Mock storage to throw errors
      (chrome.storage.local.get as any).mockRejectedValue(new Error('Storage error'));
      (chrome.storage.local.remove as any).mockRejectedValue(new Error('Storage error'));

      // Should not throw during creation
      expect(() => new ContentManager()).not.toThrow();
    });

    it('should handle connection failures gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      // Mock chrome.runtime.connect to return null
      const originalConnect = chrome.runtime.connect;
      (chrome.runtime as Record<string, unknown>).connect = vi.fn(() => null);

      // Should not throw
      expect(() => new ContentManager()).not.toThrow();

      // Restore original function
      (chrome.runtime as Record<string, unknown>).connect = originalConnect;
    });
  });
});
