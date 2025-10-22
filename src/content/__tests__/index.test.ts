import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockContentManagerType {
  reinitialize: ReturnType<typeof vi.fn>;
}

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

const mockContentManagerInstance: MockContentManagerType = {
  reinitialize: vi.fn(),
};

const MockContentManager = vi.fn(() => mockContentManagerInstance);

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

vi.mock('../ContentManager', () => ({
  ContentManager: MockContentManager,
}));

describe('content/index.ts', () => {
  let chromeRuntimeSendMessageSpy: ReturnType<typeof vi.fn>;
  let chromeRuntimeOnStartupListeners: Array<() => void>;
  let chromeRuntimeOnConnectListeners: Array<() => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContentManagerInstance.reinitialize.mockClear();
    MockContentManager.mockClear();

    Object.defineProperty(document, 'readyState', {
      writable: true,
      configurable: true,
      value: 'loading',
    });

    Object.defineProperty(document, 'visibilityState', {
      writable: true,
      configurable: true,
      value: 'visible',
    });

    chromeRuntimeSendMessageSpy = vi.fn();
    chromeRuntimeOnStartupListeners = [];
    chromeRuntimeOnConnectListeners = [];

    global.chrome = {
      runtime: {
        id: 'test-extension-id',
        sendMessage: chromeRuntimeSendMessageSpy,
        onStartup: {
          addListener: vi.fn((listener: () => void) => {
            chromeRuntimeOnStartupListeners.push(listener);
          }),
        },
        onConnect: {
          addListener: vi.fn((listener: () => void) => {
            chromeRuntimeOnConnectListeners.push(listener);
          }),
        },
        onMessage: {
          addListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        href: 'https://bolt.new/~/test-project',
        pathname: '/~/test-project',
      },
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Module initialization', () => {
    it('should log initialization message on module load', async () => {
      await import('../index');

      expect(mockLogger.info).toHaveBeenCalledWith('🚀 Content script initializing...');
    });

    it('should not throw errors during module initialization', async () => {
      await expect(import('../index')).resolves.toBeDefined();
    });
  });

  describe('ContentManager initialization', () => {
    it('should initialize ContentManager when DOM is ready', async () => {
      Object.defineProperty(document, 'readyState', {
        writable: true,
        value: 'interactive',
      });

      await import('../index');

      await vi.waitFor(
        () => {
          expect(MockContentManager).toHaveBeenCalled();
        },
        { timeout: 200 }
      );
    });

    it('should register DOMContentLoaded listener when readyState is loading', async () => {
      Object.defineProperty(document, 'readyState', {
        writable: true,
        value: 'loading',
      });

      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      await import('../index');

      expect(addEventListenerSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function), {
        once: true,
      });
    });

    it('should handle chrome runtime unavailability', async () => {
      (global.chrome.runtime as { id?: string }).id = undefined;

      Object.defineProperty(document, 'readyState', {
        writable: true,
        value: 'interactive',
      });

      await import('../index');

      await vi.waitFor(
        () => {
          expect(mockLogger.warn).toHaveBeenCalledWith(
            '🔊 Chrome runtime not available, extension context may be invalidated'
          );
        },
        { timeout: 200 }
      );
    });

    it('should handle extension context invalidation errors', async () => {
      MockContentManager.mockImplementation(() => {
        throw new Error('Extension context invalidated');
      });

      Object.defineProperty(document, 'readyState', {
        writable: true,
        value: 'interactive',
      });

      await import('../index');

      await vi.waitFor(
        () => {
          expect(mockLogger.info).toHaveBeenCalledWith(
            '🔊 Extension context invalidated during initialization - user should refresh page'
          );
        },
        { timeout: 200 }
      );
    });
  });

  describe('Event listener registration', () => {
    it('should register visibilitychange listener', async () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      await import('../index');

      expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    it('should register window focus listener', async () => {
      const windowAddEventListenerSpy = vi.spyOn(window, 'addEventListener');

      await import('../index');

      expect(windowAddEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    });
  });

  describe('Extension lifecycle events', () => {
    it('should register extension startup listener', async () => {
      await import('../index');

      expect(chrome.runtime.onStartup.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should trigger reinitialize on extension startup event', async () => {
      await import('../index');

      chromeRuntimeOnStartupListeners.forEach((listener) => listener());

      await vi.waitFor(
        () => {
          expect(mockLogger.info).toHaveBeenCalledWith(
            '🔊 Extension startup detected, reinitializing...'
          );
        },
        { timeout: 100 }
      );
    });
  });

  describe('onExecute function', () => {
    it('should log reinitialize message with performance data', async () => {
      const module = await import('../index');

      if (module && typeof module.onExecute === 'function') {
        module.onExecute({ perf: { injectTime: 100, loadTime: 200 } });

        expect(mockLogger.info).toHaveBeenCalledWith('🚀 Content script reinitializing...', {
          injectTime: 100,
          loadTime: 200,
        });
      }
    });

    it('should be exported and callable', async () => {
      const module = await import('../index');

      expect(module).toHaveProperty('onExecute');
      expect(typeof module.onExecute).toBe('function');
    });
  });

  describe('Error handling', () => {
    it('should log errors when ContentManager initialization fails', async () => {
      MockContentManager.mockImplementation(() => {
        throw new Error('Test initialization error');
      });

      Object.defineProperty(document, 'readyState', {
        writable: true,
        value: 'interactive',
      });

      await import('../index');

      await vi.waitFor(
        () => {
          expect(mockLogger.error).toHaveBeenCalledWith(
            '🔊 Error initializing ContentManager:',
            expect.any(Error)
          );
        },
        { timeout: 200 }
      );
    });

    it('should handle chrome-extension://invalid/ errors', async () => {
      MockContentManager.mockImplementation(() => {
        throw new Error('chrome-extension://invalid/');
      });

      Object.defineProperty(document, 'readyState', {
        writable: true,
        value: 'interactive',
      });

      await import('../index');

      await vi.waitFor(
        () => {
          expect(mockLogger.info).toHaveBeenCalledWith(
            '🔊 Extension context invalidated during initialization - user should refresh page'
          );
        },
        { timeout: 200 }
      );
    });
  });
});
