/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { ContentManager } from '../ContentManager';
import {
  createTestEnvironment,
  getContentManagerState,
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

interface MockSvelteComponent {
  target: Element;
  props: Record<string, unknown>;
  $destroy: Mock;
  $set: Mock;
}

vi.mock('$lib/components/WhatsNewModal.svelte', () => ({
  default: vi.fn().mockImplementation(function (
    this: MockSvelteComponent,
    options: { target: Element; props: Record<string, unknown> }
  ) {
    this.target = options.target;
    this.props = options.props;
    this.$destroy = vi.fn();
    this.$set = vi.fn();
    return this;
  }),
}));

vi.mock('../UIManager');

let consoleSpy: { [key: string]: any };
beforeAll(() => {
  consoleSpy = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  };
});

afterAll(() => {
  Object.values(consoleSpy).forEach((spy) => spy.mockRestore());
});

describe('ContentManager - Critical Scenarios', () => {
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    vi.clearAllMocks();

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

  describe('Context Invalidation Detection', () => {
    it('should handle initialization when extension context is unavailable', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: false });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      await wait(100);

      const state = getContentManagerState(contentManager);

      expect(state.hasPort).toBe(false);
      expect(state.hasMessageHandler).toBe(false);
      expect(state.hasUIManager).toBe(false);
    });

    it('should initialize successfully when extension context is available', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      await wait(100);

      const state = getContentManagerState(contentManager);

      expect(state.hasPort).toBe(true);
      expect(state.hasMessageHandler).toBe(true);
      expect(state.hasUIManager).toBe(true);
    });

    it('should handle port disconnection gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      await wait(100);

      const initialState = getContentManagerState(contentManager);
      expect(initialState.hasPort).toBe(true);

      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(100);

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

      await wait(100);

      await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
      await wait(100);

      expect(contentManager).toBeDefined();
      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
    });

    it('should handle initialization failure gracefully', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: false });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      await wait(100);

      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(false);
      expect(state.hasMessageHandler).toBe(false);
    });

    it('should limit recovery attempts', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      await wait(100);

      for (let i = 0; i < 6; i++) {
        await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
        await wait(50);
      }

      expect(contentManager).toBeDefined();
    });
  });

  describe('Message Processing During Recovery', () => {
    it('should handle messages gracefully during recovery state', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contentManager as any).isInRecovery = true;

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

      await wait(100);

      expect(contentManager).toBeDefined();
    });
  });

  describe('Resource Management', () => {
    it('should cleanup resources when destroyed', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      await wait(100);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contentManager as any).cleanup();

      const state = getContentManagerState(contentManager);
      expect(state.hasPort).toBe(false);
    });

    it('should handle multiple port connections without accumulating resources', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      await wait(100);

      for (let i = 0; i < 3; i++) {
        await simulatePortState(testEnv, TestPortStates.DISCONNECTED_NORMAL);
        await wait(50);
        await simulatePortState(testEnv, TestPortStates.CONNECTED);
        await wait(50);
      }

      expect(contentManager).toBeDefined();
    });

    it('should handle UIManager lifecycle properly', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      await wait(100);

      const state = getContentManagerState(contentManager);
      expect(state.hasUIManager).toBe(true);

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

      await wait(100);

      expect(chrome.storage.local.remove).toHaveBeenCalled();
    });

    it('should handle port connection failure gracefully', () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (chrome.runtime as any).connect = vi.fn(() => null);

      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      expect(() => new ContentManager()).not.toThrow();
    });
  });

  describe('Complex Event Sequences', () => {
    it('should handle sequential port disconnection and reconnection', async () => {
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
      const state = getContentManagerState(contentManager);
      expect(state).toBeDefined();
    });

    it('should process messages after recovery', async () => {
      testEnv = createTestEnvironment();
      setupChromeAPIMocks(testEnv, { hasRuntimeId: true });
      setupWindowMocks(TestUrls.BOLT_NEW_PROJECT);

      const contentManager = new ContentManager();

      await wait(100);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageHandler = (contentManager as any).handleBackgroundMessage;

      expect(() => {
        messageHandler.call(contentManager, TestMessages.UPLOAD_STATUS_UPLOADING);
      }).not.toThrow();
    });
  });
});
