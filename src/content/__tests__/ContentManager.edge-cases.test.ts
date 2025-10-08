/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/components/WhatsNewModal.svelte', () => ({
  default: vi.fn().mockImplementation(function (this: unknown, options: Record<string, unknown>) {
    (this as Record<string, unknown>).target = options.target;
    (this as Record<string, unknown>).props = options.props;
    (this as Record<string, unknown>).$destroy = vi.fn();
    (this as Record<string, unknown>).$set = vi.fn();
    return this;
  }),
}));

vi.mock('../UIManager');

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
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});

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

      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);

      expect(contentManager).toBeDefined();
    });

    it('should handle reinitialize calls', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      await contentManager.reinitialize();
      await wait(100);

      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
    });

    it('should handle connection interruption', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(200);

      expect(contentManager).toBeDefined();
    });

    it('should handle normal message flow', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      new ContentManager();
      await wait(100);

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

      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(100);
      await simulatePortState(testEnv, TestPortStates.CONNECTED);
      await wait(100);

      expect(contentManager).toBeDefined();
    });

    it('should handle messages during initialization', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      if (testEnv.mockMessageHandler) {
        testEnv.mockMessageHandler.sendDebugMessage('early message');
      }

      await wait(150);

      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
    });

    it('should handle connection loss gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(100);

      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(150);

      expect(contentManager).toBeDefined();
    });

    it('should handle cleanup properly', async () => {
      testEnv = setupBasicTest();
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();
      await wait(50);

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

      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(false);
    });

    it('should handle long URLs', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });

      const longPath = 'a'.repeat(100);
      const longUrl = `https://bolt.new/project/${longPath}`;
      setupWindowMocks(longUrl);

      const contentManager = new ContentManager();

      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(true);
    });

    it('should handle empty project IDs', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks('https://bolt.new/project/');

      const contentManager = new ContentManager();

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

      if (testEnv.mockPort) {
        testEnv.mockPort.postMessage = vi.fn(() => {
          throw new Error('Mock postMessage failure');
        });

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

      (chrome.storage.local.get as any).mockRejectedValue(new Error('Storage error'));
      (chrome.storage.local.remove as any).mockRejectedValue(new Error('Storage error'));

      expect(() => new ContentManager()).not.toThrow();
    });

    it('should handle connection failures gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const originalConnect = chrome.runtime.connect;
      (chrome.runtime as Record<string, unknown>).connect = vi.fn(() => null);

      expect(() => new ContentManager()).not.toThrow();

      (chrome.runtime as Record<string, unknown>).connect = originalConnect;
    });
  });
});
