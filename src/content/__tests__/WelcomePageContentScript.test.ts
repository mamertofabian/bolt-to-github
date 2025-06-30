/**
 * Tests for Welcome Page Content Script
 *
 * This test suite covers the content script that runs on bolt2github.com/welcome
 * and facilitates communication between the welcome page and the extension.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

describe('WelcomePageContentScript', () => {
  let mockRuntimeSendMessage: Mock;
  let mockStorageGet: Mock;
  let mockWindowPostMessage: Mock;
  let mockAddEventListener: Mock;
  let messageListeners: Array<(event: MessageEvent) => void>;

  // Helper function to create proper MessageEvent mocks
  const createMessageEvent = (source: Window, origin: string, data: unknown): MessageEvent => {
    return {
      source,
      origin,
      data,
      lastEventId: '',
      ports: [],
      type: 'message',
      bubbles: false,
      cancelBubble: false,
      cancelable: false,
      composed: false,
      currentTarget: window,
      defaultPrevented: false,
      eventPhase: Event.AT_TARGET,
      isTrusted: true,
      returnValue: true,
      srcElement: window,
      target: window,
      timeStamp: Date.now(),
      initEvent: vi.fn(),
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      stopPropagation: vi.fn(),
      initMessageEvent: vi.fn(),
      composedPath: vi.fn(() => []),
      AT_TARGET: Event.AT_TARGET,
      BUBBLING_PHASE: Event.BUBBLING_PHASE,
      CAPTURING_PHASE: Event.CAPTURING_PHASE,
      NONE: Event.NONE,
    } as unknown as MessageEvent;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    messageListeners = [];

    // Mock Chrome runtime API
    mockRuntimeSendMessage = vi.fn().mockImplementation((message, callback) => {
      // Simulate async response from background
      setTimeout(() => {
        if (message.type === 'getExtensionStatus') {
          callback({
            success: true,
            data: {
              installed: true,
              version: '1.3.5',
              authenticated: true,
              authMethod: 'github-app',
              installDate: '2024-01-15T10:00:00.000Z',
              onboardingCompleted: false,
            },
          });
        } else if (message.type === 'completeOnboardingStep') {
          callback({ success: true });
        } else if (message.type === 'initiateGitHubAuth') {
          callback({ success: true, authUrl: 'https://github.com/login/oauth/authorize' });
        }
      }, 10);
      return true;
    });

    mockStorageGet = vi.fn().mockImplementation((keys, callback) => {
      const result = {
        extensionCapabilities: ['zip_upload', 'issue_management', 'branch_management'],
      };
      if (callback) {
        callback(result);
        return undefined;
      }
      return Promise.resolve(result);
    });

    // Mock window.postMessage
    mockWindowPostMessage = vi.fn();

    // Mock addEventListener to capture listeners
    mockAddEventListener = vi.fn((event, listener) => {
      if (event === 'message') {
        messageListeners.push(listener);
      }
    });

    // Apply mocks before any imports
    chrome.runtime.sendMessage = mockRuntimeSendMessage;
    chrome.storage.local.get = mockStorageGet;
    window.postMessage = mockWindowPostMessage;
    window.addEventListener = mockAddEventListener;
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clear module cache to ensure fresh imports in each test
    vi.resetModules();
  });

  describe('Page Communication', () => {
    it('should initialize content script without exposing extension ID', async () => {
      // Import the content script
      await import('../WelcomePageContentScript');

      // Verify no script was injected that exposes extension ID
      const scriptElement = document.querySelector('script[data-extension-id]');
      expect(scriptElement).toBeNull();
    });

    it('should listen for messages from the welcome page', async () => {
      // Import the content script
      await import('../WelcomePageContentScript');

      // Verify message listener was added
      expect(mockAddEventListener).toHaveBeenCalledWith('message', expect.any(Function));
      expect(messageListeners.length).toBeGreaterThan(0);
    });

    it('should forward getExtensionStatus requests to background', async () => {
      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(window, 'https://bolt2github.com', {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        })
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify message was sent to background
      expect(mockRuntimeSendMessage).toHaveBeenCalledWith(
        { type: 'getExtensionStatus' },
        expect.any(Function)
      );

      // Verify response was posted back to page
      expect(mockWindowPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'bolt2github-extension',
          type: 'extensionStatus',
          data: {
            installed: true,
            version: '1.3.5',
            authenticated: true,
            authMethod: 'github-app',
            installDate: '2024-01-15T10:00:00.000Z',
            onboardingCompleted: false,
          },
        }),
        'https://bolt2github.com'
      );
    });

    it('should handle completeOnboardingStep requests', async () => {
      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(window, 'https://bolt2github.com', {
          source: 'bolt2github-welcome',
          type: 'completeOnboardingStep',
          step: 'authentication',
        })
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify message was sent to background
      expect(mockRuntimeSendMessage).toHaveBeenCalledWith(
        { type: 'completeOnboardingStep', step: 'authentication' },
        expect.any(Function)
      );

      // Verify success response
      expect(mockWindowPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'bolt2github-extension',
          type: 'onboardingStepCompleted',
          success: true,
        }),
        'https://bolt2github.com'
      );
    });

    it('should handle initiateGitHubAuth requests', async () => {
      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(window, 'https://bolt2github.com', {
          source: 'bolt2github-welcome',
          type: 'initiateGitHubAuth',
          method: 'github-app',
        })
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify message was sent to background
      expect(mockRuntimeSendMessage).toHaveBeenCalledWith(
        { type: 'initiateGitHubAuth', method: 'github-app' },
        expect.any(Function)
      );

      // Verify auth URL response
      expect(mockWindowPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'bolt2github-extension',
          type: 'authInitiated',
          authUrl: 'https://github.com/login/oauth/authorize',
        }),
        'https://bolt2github.com'
      );
    });

    it('should provide extension capabilities', async () => {
      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(window, 'https://bolt2github.com', {
          source: 'bolt2github-welcome',
          type: 'getExtensionCapabilities',
        })
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify storage was accessed
      expect(mockStorageGet).toHaveBeenCalledWith(['extensionCapabilities'], expect.any(Function));

      // Verify capabilities response
      expect(mockWindowPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'bolt2github-extension',
          type: 'extensionCapabilities',
          capabilities: ['zip_upload', 'issue_management', 'branch_management'],
        }),
        'https://bolt2github.com'
      );
    });
  });

  describe('Security', () => {
    it('should ignore messages from non-bolt2github origins', async () => {
      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Simulate message from malicious origin
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(window, 'https://malicious-site.com', {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        })
      );

      // Verify no background message was sent
      expect(mockRuntimeSendMessage).not.toHaveBeenCalled();
      expect(mockWindowPostMessage).not.toHaveBeenCalled();
    });

    it('should ignore messages without proper source identifier', async () => {
      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Simulate message without source
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(window, 'https://bolt2github.com', {
          type: 'getExtensionStatus',
        })
      );

      // Verify no background message was sent
      expect(mockRuntimeSendMessage).not.toHaveBeenCalled();
      expect(mockWindowPostMessage).not.toHaveBeenCalled();
    });

    it('should handle messages only from same window', async () => {
      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Create a mock iframe
      const iframe = document.createElement('iframe');

      // Simulate message from different source
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(iframe.contentWindow as Window, 'https://bolt2github.com', {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        })
      );

      // Verify no background message was sent
      expect(mockRuntimeSendMessage).not.toHaveBeenCalled();
      expect(mockWindowPostMessage).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle background script errors gracefully', async () => {
      // Mock runtime.sendMessage to simulate error
      mockRuntimeSendMessage.mockImplementation((message, callback) => {
        setTimeout(() => {
          callback({ success: false, error: 'Background script error' });
        }, 10);
        return true;
      });

      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(window, 'https://bolt2github.com', {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        })
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify error response was sent
      expect(mockWindowPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'bolt2github-extension',
          type: 'error',
          error: 'Background script error',
        }),
        'https://bolt2github.com'
      );
    });

    it('should handle runtime.lastError', async () => {
      // Mock runtime.sendMessage to simulate chrome.runtime.lastError
      mockRuntimeSendMessage.mockImplementation((message, callback) => {
        // Set lastError to simulate error
        chrome.runtime.lastError = { message: 'Extension context invalidated' };
        // Call callback with undefined to simulate error
        if (callback) {
          setTimeout(() => callback(undefined), 10);
        }
        return true;
      });

      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(window, 'https://bolt2github.com', {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        })
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify error response was sent
      expect(mockWindowPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'bolt2github-extension',
          type: 'error',
          error: 'Extension context invalidated',
        }),
        'https://bolt2github.com'
      );

      // Clean up
      delete chrome.runtime.lastError;
    });
  });

  describe('Logging', () => {
    it('should log content script initialization', async () => {
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      // Import the content script
      await import('../WelcomePageContentScript');

      // Verify initialization was logged
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[WelcomePageContentScript] [INFO]',
        'Welcome page content script initialized',
        expect.any(Object)
      );

      consoleInfoSpy.mockRestore();
    });

    it('should log incoming messages', async () => {
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      // Import the content script
      await import('../WelcomePageContentScript');

      // Ensure listener was added
      expect(messageListeners.length).toBeGreaterThan(0);

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener(
        createMessageEvent(window, 'https://bolt2github.com', {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        })
      );

      // Verify message was logged
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[WelcomePageContentScript] [INFO]',
        'Received message from welcome page',
        expect.objectContaining({ type: 'getExtensionStatus' })
      );

      consoleInfoSpy.mockRestore();
    });
  });
});
