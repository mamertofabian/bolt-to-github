/**
 * Tests for post-installation welcome flow functionality
 *
 * This test suite covers the Chrome extension's ability to:
 * - Detect first-time installation
 * - Open the welcome page with proper tracking parameters
 * - Initialize onboarding data in storage
 * - Handle various installation scenarios
 */

// Mock all dependencies before importing
jest.mock('../../services/UnifiedGitHubService');
jest.mock('../StateManager');
jest.mock('../../services/zipHandler');
jest.mock('../TempRepoManager');
jest.mock('../../content/services/SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: jest.fn(() => ({
      forceCheck: jest.fn(),
      getAuthState: jest.fn().mockReturnValue({ isAuthenticated: false }),
      addAuthStateListener: jest.fn(),
      removeAuthStateListener: jest.fn(),
    })),
  },
}));
jest.mock('../../content/services/OperationStateManager');
jest.mock('../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
  getLogStorage: () => ({
    rotateLogs: jest.fn(),
    getLogs: jest.fn().mockResolvedValue([]),
  }),
}));

import { BackgroundService } from '../BackgroundService';

describe('BackgroundService - Welcome Flow', () => {
  let backgroundService: BackgroundService;
  let mockTabsCreate: jest.Mock;
  let mockStorageSet: jest.Mock;
  let mockStorageGet: jest.Mock;
  let mockRuntimeGetManifest: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

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
    chrome.storage.onChanged = {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };

    // Mock other Chrome APIs that BackgroundService uses
    chrome.runtime.onConnect = {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };
    chrome.runtime.onStartup = {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };
    chrome.runtime.onInstalled = {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };
    chrome.runtime.onMessage = {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };
    chrome.tabs.onRemoved = {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };
    chrome.tabs.onUpdated = {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };
    chrome.alarms.onAlarm = {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };
    chrome.alarms.create = jest.fn();
    chrome.alarms.clear = jest.fn();

    // Create BackgroundService instance
    backgroundService = new BackgroundService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('First-Time Installation', () => {
    it('should register onInstalled listener', () => {
      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    });

    it('should open welcome page on first install', async () => {
      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as jest.Mock).mock
        .calls[0][0];

      // Simulate first-time installation
      await onInstalledHandler({
        reason: 'install',
        previousVersion: undefined,
      });

      // Verify welcome page was opened
      expect(mockTabsCreate).toHaveBeenCalledWith({
        url: 'https://bolt2github.com/welcome?utm_source=extension_install',
      });
    });

    it('should initialize onboarding data on first install', async () => {
      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as jest.Mock).mock
        .calls[0][0];

      // Simulate first-time installation
      await onInstalledHandler({
        reason: 'install',
        previousVersion: undefined,
      });

      // Verify onboarding data was stored
      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          installDate: expect.any(String),
          onboardingCompleted: false,
          installedVersion: '1.3.5',
          completedSteps: [],
          welcomePageViewed: false,
        })
      );

      // Verify the installDate is a valid ISO string
      const storedData = mockStorageSet.mock.calls.find(
        (call) => call[0].installDate !== undefined
      )?.[0];
      expect(new Date(storedData.installDate).toISOString()).toBe(storedData.installDate);
    });

    it('should not open welcome page on extension update', async () => {
      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as jest.Mock).mock
        .calls[0][0];

      // Simulate extension update
      await onInstalledHandler({
        reason: 'update',
        previousVersion: '1.3.4',
      });

      // Verify welcome page was NOT opened
      expect(mockTabsCreate).not.toHaveBeenCalled();
    });

    it('should not open welcome page on browser update', async () => {
      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as jest.Mock).mock
        .calls[0][0];

      // Simulate browser update
      await onInstalledHandler({
        reason: 'chrome_update',
        previousVersion: undefined,
      });

      // Verify welcome page was NOT opened
      expect(mockTabsCreate).not.toHaveBeenCalled();
    });

    it('should not open welcome page on shared module update', async () => {
      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as jest.Mock).mock
        .calls[0][0];

      // Simulate shared module update
      await onInstalledHandler({
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

      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as jest.Mock).mock
        .calls[0][0];

      // Call handler and ensure it doesn't throw
      await onInstalledHandler({
        reason: 'install',
        previousVersion: undefined,
      });

      // Verify onboarding data was still stored despite tab creation failure
      expect(mockStorageSet).toHaveBeenCalled();
    });

    it('should handle storage failure gracefully', async () => {
      // Mock storage failure
      mockStorageSet.mockRejectedValue(new Error('Storage quota exceeded'));

      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as jest.Mock).mock
        .calls[0][0];

      // Call handler and ensure it doesn't throw
      await onInstalledHandler({
        reason: 'install',
        previousVersion: undefined,
      });

      // Verify tab creation was still attempted despite storage failure
      expect(mockTabsCreate).toHaveBeenCalled();
    });
  });

  describe('Welcome Page Message Handlers', () => {
    it('should respond to getExtensionStatus message', async () => {
      // Mock SupabaseAuthService
      const mockSupabaseAuthService = {
        getAuthState: jest.fn().mockReturnValue({
          isAuthenticated: true,
          subscription: { isActive: false },
        }),
      };
      (backgroundService as any).supabaseAuthService = mockSupabaseAuthService;

      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = jest.fn();

      // Simulate message from welcome page
      const result = await onMessageHandler(
        { type: 'getExtensionStatus' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      // Should return true for async response
      expect(result).toBe(true);

      // Wait a bit for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify response was sent
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          installed: true,
          version: '1.3.5',
          authenticated: true,
          installDate: '2024-01-15T10:00:00.000Z',
          onboardingCompleted: false,
          installedVersion: '1.3.5',
        },
      });
    });

    it('should respond to completeOnboardingStep message', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = jest.fn();

      // Simulate message from welcome page
      const result = await onMessageHandler(
        { type: 'completeOnboardingStep', step: 'authentication' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      // Should return true for async response
      expect(result).toBe(true);

      // Wait a bit for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify storage was updated
      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          completedSteps: ['step1', 'authentication'],
        })
      );

      // Verify response
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
      });
    });

    it('should ignore messages from non-bolt2github domains', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = jest.fn();

      // Simulate message from malicious site
      await onMessageHandler(
        { type: 'getExtensionStatus' },
        { url: 'https://malicious-site.com', tab: { id: 123 } },
        sendResponse
      );

      // Verify no response was sent for getExtensionStatus
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installed: true,
          }),
        })
      );
    });

    it('should ignore messages not from tabs', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = jest.fn();

      // Simulate message without tab (e.g., from popup or other extension context)
      await onMessageHandler(
        { type: 'getExtensionStatus' },
        { url: 'https://bolt2github.com/welcome' }, // No tab property
        sendResponse
      );

      // Verify no response was sent
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installed: true,
          }),
        })
      );
    });

    it('should validate onboarding steps', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = jest.fn();

      // Simulate message with invalid step
      await onMessageHandler(
        { type: 'completeOnboardingStep', step: 'invalid_step' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      // Wait a bit for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify error response
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid onboarding step: invalid_step',
      });
    });

    it('should handle GitHub auth initiation', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = jest.fn();

      // Simulate GitHub App auth request
      await onMessageHandler(
        { type: 'initiateGitHubAuth', method: 'github_app' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      // Wait a bit for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify auth URL response
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        authUrl: 'https://github.com/apps/bolt-to-github/installations/new',
        method: 'github_app',
      });
    });
  });

  describe('Logging', () => {
    it('should process installation without errors', async () => {
      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as jest.Mock).mock
        .calls[0][0];

      // Simulate extension installation - this test verifies no errors occur
      await onInstalledHandler({
        reason: 'install',
        previousVersion: undefined,
      });

      // Verify the key operations occurred
      expect(mockTabsCreate).toHaveBeenCalled();
      expect(mockStorageSet).toHaveBeenCalled();
    });
  });
});
