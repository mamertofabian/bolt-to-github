/**
 * Tests for post-installation welcome flow functionality
 *
 * This test suite covers the Chrome extension's ability to:
 * - Detect first-time installation
 * - Open the welcome page with proper tracking parameters
 * - Initialize onboarding data in storage
 * - Handle various installation scenarios
 */

describe('BackgroundService - Welcome Flow', () => {
  let mockTabsCreate: jest.Mock;
  let mockStorageSet: jest.Mock;
  let mockRuntimeGetManifest: jest.Mock;
  let mockStorageGet: jest.Mock;
  let onInstalledListeners: Array<(details: chrome.runtime.InstalledDetails) => void>;
  let onMessageListeners: Array<
    (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => boolean | void
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset listener arrays
    onInstalledListeners = [];
    onMessageListeners = [];

    // Set up Chrome API mocks
    mockTabsCreate = jest.fn().mockResolvedValue({ id: 123 });
    mockStorageSet = jest.fn().mockImplementation((data, callback) => {
      if (callback) callback();
      return Promise.resolve();
    });
    mockStorageGet = jest.fn().mockImplementation((keys, callback) => {
      const result = {
        installDate: '2024-01-15T10:00:00.000Z',
        onboardingCompleted: false,
        installedVersion: '1.3.5',
        completedSteps: ['step1'],
      };
      if (callback) callback(result);
      return Promise.resolve(result);
    });
    mockRuntimeGetManifest = jest.fn().mockReturnValue({
      version: '1.3.5',
      name: 'Bolt to GitHub',
    });

    // Apply mocks to Chrome API
    chrome.tabs.create = mockTabsCreate;
    chrome.storage.local.set = mockStorageSet;
    chrome.storage.local.get = mockStorageGet;
    chrome.runtime.getManifest = mockRuntimeGetManifest;

    // Capture onInstalled listeners
    chrome.runtime.onInstalled.addListener = jest.fn((listener) => {
      onInstalledListeners.push(listener);
    });

    // Capture onMessage listeners
    chrome.runtime.onMessage.addListener = jest.fn((listener) => {
      onMessageListeners.push(listener);
      return true; // Indicate async response
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('First-Time Installation', () => {
    it('should open welcome page on first install', async () => {
      // Import the module to trigger onInstalled listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Verify listener was registered
      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();

      // Simulate extension installation
      const onInstalledCallback = onInstalledListeners[0];
      await onInstalledCallback({
        reason: 'install',
        previousVersion: undefined,
      });

      // Verify welcome page was opened
      expect(mockTabsCreate).toHaveBeenCalledWith({
        url: 'https://bolt2github.com/welcome?utm_source=extension_install',
      });
    });

    it('should initialize onboarding data on first install', async () => {
      // Import the module to trigger onInstalled listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Simulate extension installation
      const onInstalledCallback = onInstalledListeners[0];
      await onInstalledCallback({
        reason: 'install',
        previousVersion: undefined,
      });

      // Verify onboarding data was stored
      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          installDate: expect.any(String),
          onboardingCompleted: false,
          installedVersion: '1.3.5',
        }),
        expect.any(Function)
      );

      // Verify the installDate is a valid ISO string
      const storedData = mockStorageSet.mock.calls.find(
        (call) => call[0].installDate !== undefined
      )?.[0];
      expect(new Date(storedData.installDate).toISOString()).toBe(storedData.installDate);
    });

    it('should not open welcome page on extension update', async () => {
      // Import the module to trigger onInstalled listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Simulate extension update
      const onInstalledCallback = onInstalledListeners[0];
      await onInstalledCallback({
        reason: 'update',
        previousVersion: '1.3.4',
      });

      // Verify welcome page was NOT opened
      expect(mockTabsCreate).not.toHaveBeenCalled();
    });

    it('should not open welcome page on browser update', async () => {
      // Import the module to trigger onInstalled listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Simulate browser update
      const onInstalledCallback = onInstalledListeners[0];
      await onInstalledCallback({
        reason: 'chrome_update',
        previousVersion: undefined,
      });

      // Verify welcome page was NOT opened
      expect(mockTabsCreate).not.toHaveBeenCalled();
    });

    it('should not open welcome page on shared module update', async () => {
      // Import the module to trigger onInstalled listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Simulate shared module update
      const onInstalledCallback = onInstalledListeners[0];
      await onInstalledCallback({
        reason: 'shared_module_update',
        previousVersion: undefined,
      });

      // Verify welcome page was NOT opened
      expect(mockTabsCreate).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle tab creation failure gracefully', async () => {
      // Mock tab creation failure
      mockTabsCreate.mockRejectedValue(new Error('Popup blocked'));

      // Import the module to trigger onInstalled listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Simulate extension installation
      const onInstalledCallback = onInstalledListeners[0];

      // Should not throw
      await expect(
        onInstalledCallback({
          reason: 'install',
          previousVersion: undefined,
        })
      ).resolves.not.toThrow();

      // Verify onboarding data was still stored
      expect(mockStorageSet).toHaveBeenCalled();
    });

    it('should handle storage failure gracefully', async () => {
      // Mock storage failure
      mockStorageSet.mockRejectedValue(new Error('Storage quota exceeded'));

      // Import the module to trigger onInstalled listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Simulate extension installation
      const onInstalledCallback = onInstalledListeners[0];

      // Should not throw
      await expect(
        onInstalledCallback({
          reason: 'install',
          previousVersion: undefined,
        })
      ).resolves.not.toThrow();

      // Verify tab creation was still attempted
      expect(mockTabsCreate).toHaveBeenCalled();
    });
  });

  describe('Welcome Page Message Handlers', () => {
    it('should respond to getExtensionStatus message', async () => {
      // Import the module to trigger onMessage listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Verify listener was registered
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();

      // Simulate message from welcome page
      const sendResponse = jest.fn();
      const onMessageCallback = onMessageListeners[0];

      const result = await onMessageCallback(
        { type: 'getExtensionStatus' },
        { url: 'https://bolt2github.com/welcome' },
        sendResponse
      );

      // Wait for async response
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify response was sent
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          installed: true,
          version: '1.3.5',
          authenticated: expect.any(Boolean),
          authMethod: expect.any(String),
          installDate: '2024-01-15T10:00:00.000Z',
          onboardingCompleted: false,
        },
      });
    });

    it('should respond to completeOnboardingStep message', async () => {
      // Import the module to trigger onMessage listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Simulate message from welcome page
      const sendResponse = jest.fn();
      const onMessageCallback = onMessageListeners[0];

      await onMessageCallback(
        { type: 'completeOnboardingStep', step: 'step2' },
        { url: 'https://bolt2github.com/welcome' },
        sendResponse
      );

      // Wait for async response
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify storage was updated
      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          completedSteps: ['step1', 'step2'],
        }),
        expect.any(Function)
      );

      // Verify response
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
      });
    });

    it('should ignore messages from non-bolt2github domains', async () => {
      // Import the module to trigger onMessage listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      const sendResponse = jest.fn();
      const onMessageCallback = onMessageListeners[0];

      await onMessageCallback(
        { type: 'getExtensionStatus' },
        { url: 'https://malicious-site.com' },
        sendResponse
      );

      // Wait a bit to ensure no response
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify no response was sent
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('Logging', () => {
    it('should log extension installation', async () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Import the module to trigger onInstalled listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Simulate extension installation
      const onInstalledCallback = onInstalledListeners[0];
      await onInstalledCallback({
        reason: 'install',
        previousVersion: undefined,
      });

      // Verify installation was logged
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Extension installed'),
        expect.any(Object)
      );

      consoleInfoSpy.mockRestore();
    });

    it('should log welcome page opening', async () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Import the module to trigger onInstalled listener registration
      jest.isolateModules(() => {
        require('../BackgroundService');
      });

      // Simulate extension installation
      const onInstalledCallback = onInstalledListeners[0];
      await onInstalledCallback({
        reason: 'install',
        previousVersion: undefined,
      });

      // Verify welcome page opening was logged
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Opening welcome page'),
        expect.any(Object)
      );

      consoleInfoSpy.mockRestore();
    });
  });
});
