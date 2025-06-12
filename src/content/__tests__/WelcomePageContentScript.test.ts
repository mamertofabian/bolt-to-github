/**
 * Tests for Welcome Page Content Script
 *
 * This test suite covers the content script that runs on bolt2github.com/welcome
 * and facilitates communication between the welcome page and the extension.
 */

describe('WelcomePageContentScript', () => {
  let mockRuntimeSendMessage: jest.Mock;
  let mockStorageGet: jest.Mock;
  let mockWindowPostMessage: jest.Mock;
  let mockAddEventListener: jest.Mock;
  let messageListeners: Array<(event: MessageEvent) => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    messageListeners = [];

    // Mock Chrome runtime API
    mockRuntimeSendMessage = jest.fn().mockImplementation((message, callback) => {
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

    mockStorageGet = jest.fn().mockImplementation((keys, callback) => {
      callback({
        extensionCapabilities: ['zip_upload', 'issue_management', 'branch_management'],
      });
      return Promise.resolve();
    });

    // Mock window.postMessage
    mockWindowPostMessage = jest.fn();

    // Mock addEventListener to capture listeners
    mockAddEventListener = jest.fn((event, listener) => {
      if (event === 'message') {
        messageListeners.push(listener);
      }
    });

    // Apply mocks
    chrome.runtime.sendMessage = mockRuntimeSendMessage;
    chrome.storage.local.get = mockStorageGet;
    window.postMessage = mockWindowPostMessage;
    window.addEventListener = mockAddEventListener;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Page Communication', () => {
    it('should initialize content script without exposing extension ID', () => {
      // Import the content script
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Verify no script was injected that exposes extension ID
      const scriptElement = document.querySelector('script[data-extension-id]');
      expect(scriptElement).toBeNull();
    });

    it('should listen for messages from the welcome page', () => {
      // Import the content script
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Verify message listener was added
      expect(mockAddEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should forward getExtensionStatus requests to background', async () => {
      // Import the content script
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener({
        source: window,
        origin: 'https://bolt2github.com',
        data: {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        },
      } as MessageEvent);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 20));

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
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener({
        source: window,
        origin: 'https://bolt2github.com',
        data: {
          source: 'bolt2github-welcome',
          type: 'completeOnboardingStep',
          step: 'authentication',
        },
      } as MessageEvent);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 20));

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
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener({
        source: window,
        origin: 'https://bolt2github.com',
        data: {
          source: 'bolt2github-welcome',
          type: 'initiateGitHubAuth',
          method: 'github-app',
        },
      } as MessageEvent);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 20));

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
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener({
        source: window,
        origin: 'https://bolt2github.com',
        data: {
          source: 'bolt2github-welcome',
          type: 'getExtensionCapabilities',
        },
      } as MessageEvent);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 20));

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
    it('should ignore messages from non-bolt2github origins', () => {
      // Import the content script
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Simulate message from malicious origin
      const messageListener = messageListeners[0];
      messageListener({
        source: window,
        origin: 'https://malicious-site.com',
        data: {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        },
      } as MessageEvent);

      // Verify no background message was sent
      expect(mockRuntimeSendMessage).not.toHaveBeenCalled();
      expect(mockWindowPostMessage).not.toHaveBeenCalled();
    });

    it('should ignore messages without proper source identifier', () => {
      // Import the content script
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Simulate message without source
      const messageListener = messageListeners[0];
      messageListener({
        source: window,
        origin: 'https://bolt2github.com',
        data: {
          type: 'getExtensionStatus',
        },
      } as MessageEvent);

      // Verify no background message was sent
      expect(mockRuntimeSendMessage).not.toHaveBeenCalled();
      expect(mockWindowPostMessage).not.toHaveBeenCalled();
    });

    it('should handle messages only from same window', () => {
      // Import the content script
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Create a mock iframe
      const iframe = document.createElement('iframe');

      // Simulate message from different source
      const messageListener = messageListeners[0];
      messageListener({
        source: iframe.contentWindow,
        origin: 'https://bolt2github.com',
        data: {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        },
      } as MessageEvent);

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
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener({
        source: window,
        origin: 'https://bolt2github.com',
        data: {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        },
      } as MessageEvent);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 20));

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
      mockRuntimeSendMessage.mockImplementation(() => {
        chrome.runtime.lastError = { message: 'Extension context invalidated' };
        return false;
      });

      // Import the content script
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener({
        source: window,
        origin: 'https://bolt2github.com',
        data: {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        },
      } as MessageEvent);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 20));

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
      chrome.runtime.lastError = null;
    });
  });

  describe('Logging', () => {
    it('should log content script initialization', () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Import the content script
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Verify initialization was logged
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Welcome page content script initialized'),
        expect.any(Object)
      );

      consoleInfoSpy.mockRestore();
    });

    it('should log incoming messages', async () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Import the content script
      jest.isolateModules(() => {
        require('../WelcomePageContentScript');
      });

      // Simulate message from page
      const messageListener = messageListeners[0];
      messageListener({
        source: window,
        origin: 'https://bolt2github.com',
        data: {
          source: 'bolt2github-welcome',
          type: 'getExtensionStatus',
        },
      } as MessageEvent);

      // Verify message was logged
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received message from welcome page'),
        expect.objectContaining({ type: 'getExtensionStatus' })
      );

      consoleInfoSpy.mockRestore();
    });
  });
});
