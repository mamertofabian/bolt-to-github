/**
 * Tests for post-installation welcome flow functionality
 *
 * This test suite covers the Chrome extension's observable behaviors for:
 * - First-time installation (welcome page, onboarding data initialization)
 * - Extension updates (no welcome page, version tracking)
 * - Welcome page communication (status requests, onboarding steps, auth initiation)
 * - Security validations (origin checks, parameter validation)
 *
 * Tests focus on observable behaviors and state changes rather than implementation details,
 * following the unit-testing-rules.md guidelines.
 */

import { type Mock, vi } from 'vitest';
import { BackgroundService } from '../BackgroundService';

// Mock all dependencies before importing
vi.mock('../../services/UnifiedGitHubService');
vi.mock('../StateManager', () => ({
  StateManager: {
    getInstance: vi.fn(() => ({
      getGitHubSettings: vi.fn().mockResolvedValue({ gitHubSettings: {} }),
    })),
  },
}));
vi.mock('../../services/zipHandler');
vi.mock('../TempRepoManager');
vi.mock('../UsageTracker', () => ({
  UsageTracker: vi.fn(() => ({
    initializeUsageData: vi.fn().mockResolvedValue(undefined),
    updateUsageStats: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../../services/BoltProjectSyncService');

// Create a mock that can be dynamically updated during tests
const mockSupabaseAuthService = {
  forceCheck: vi.fn(),
  getAuthState: vi.fn().mockReturnValue({ isAuthenticated: false }),
  addAuthStateListener: vi.fn(),
  removeAuthStateListener: vi.fn(),
};

vi.mock('../../content/services/SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: vi.fn(() => mockSupabaseAuthService),
  },
}));
vi.mock('../../content/services/OperationStateManager', () => ({
  OperationStateManager: {
    getInstance: vi.fn(() => ({})),
  },
}));
vi.mock('../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  getLogStorage: () => ({
    rotateLogs: vi.fn(),
    getLogs: vi.fn().mockResolvedValue([]),
  }),
}));

// Helper function to create a proper Chrome Event mock
function createMockChromeEvent<T extends (...args: unknown[]) => void>(): chrome.events.Event<T> {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
    hasListeners: vi.fn(),
    getRules: vi.fn().mockImplementation((callback) => {
      callback([]);
    }),
    removeRules: vi.fn().mockImplementation((callback) => {
      callback();
    }),
    addRules: vi.fn().mockImplementation((rules, callback) => {
      callback();
    }),
  };
}

describe('BackgroundService - Welcome Flow', () => {
  let service: BackgroundService;
  let mockTabsCreate: Mock;
  let mockStorageSet: Mock;
  let mockStorageGet: Mock;
  let mockRuntimeGetManifest: Mock;
  // Track storage state for testing observable behaviors
  let storageState: Record<string, unknown> = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    storageState = {};

    // Set up Chrome API mocks
    mockTabsCreate = vi.fn().mockResolvedValue({ id: 123 });

    // Mock storage with state tracking for observable behavior testing
    mockStorageSet = vi.fn().mockImplementation((data, callback) => {
      // Update our tracked storage state
      Object.assign(storageState, data);
      if (callback) callback();
      return Promise.resolve();
    });

    mockStorageGet = vi.fn().mockImplementation((keys, callback) => {
      // Return data from our tracked state
      const result =
        Array.isArray(keys) || typeof keys === 'string'
          ? Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys])
                .filter((key) => key in storageState)
                .map((key) => [key, storageState[key]])
            )
          : { ...storageState };

      if (callback) callback(result);
      return Promise.resolve(result);
    });

    mockRuntimeGetManifest = vi.fn().mockReturnValue({
      version: '1.3.5',
      name: 'Bolt to GitHub',
    });

    // Apply mocks to Chrome API
    chrome.tabs.create = mockTabsCreate;
    chrome.storage.local.set = mockStorageSet;
    chrome.storage.local.get = mockStorageGet;
    chrome.runtime.getManifest = mockRuntimeGetManifest;
    chrome.storage.onChanged = createMockChromeEvent();

    // Mock other Chrome APIs that BackgroundService uses
    chrome.runtime.onConnect = createMockChromeEvent();
    chrome.runtime.onStartup = createMockChromeEvent();
    chrome.runtime.onInstalled = createMockChromeEvent();
    chrome.runtime.onMessage = createMockChromeEvent();
    chrome.tabs.onRemoved = createMockChromeEvent();
    chrome.tabs.onUpdated = createMockChromeEvent();
    chrome.tabs.onActivated = createMockChromeEvent();
    chrome.alarms.onAlarm = createMockChromeEvent();
    chrome.alarms.create = vi.fn().mockImplementation((name, alarmInfo, callback) => {
      if (callback) callback();
    });
    chrome.alarms.clear = vi.fn().mockImplementation((name, callback) => {
      if (callback) callback(true);
    });

    // Initialize the service to register the event listeners
    service = new BackgroundService();

    // Wait for async initialization
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  afterEach(() => {
    if (service) {
      service.destroy();
    }
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('First-Time Installation', () => {
    it('should open welcome page and initialize onboarding data on first install', async () => {
      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      // Simulate first-time installation
      await onInstalledHandler({
        reason: 'install',
        previousVersion: undefined,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify welcome page was opened (observable behavior)
      expect(mockTabsCreate).toHaveBeenCalledWith({
        url: 'https://bolt2github.com/welcome?utm_source=extension_install',
      });

      // Verify onboarding data is present in storage (observable state change)
      expect(storageState).toMatchObject({
        onboardingCompleted: false,
        installedVersion: '1.3.5',
        completedSteps: [],
        welcomePageViewed: false,
      });

      // Verify installDate is a valid ISO string
      expect(typeof storageState.installDate).toBe('string');
      expect(new Date(storageState.installDate as string).toISOString()).toBe(
        storageState.installDate
      );

      // Verify version tracking was initialized
      expect(storageState.lastKnownVersion).toBe('1.3.5');
    });

    it('should not open welcome page on extension update', async () => {
      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      // Simulate extension update
      await onInstalledHandler({
        reason: 'update',
        previousVersion: '1.3.4',
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify welcome page was NOT opened (observable behavior)
      expect(mockTabsCreate).not.toHaveBeenCalled();

      // Verify version was updated in storage (observable state change)
      expect(storageState.lastKnownVersion).toBe('1.3.5');
    });

    it('should not open welcome page on browser update', async () => {
      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      // Simulate browser update
      await onInstalledHandler({
        reason: 'chrome_update',
        previousVersion: undefined,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify welcome page was NOT opened (observable behavior)
      expect(mockTabsCreate).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle tab creation failure gracefully during install', async () => {
      // Mock tab creation failure
      mockTabsCreate.mockRejectedValueOnce(new Error('Popup blocked'));

      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      // Call handler and ensure it doesn't throw
      await expect(
        onInstalledHandler({
          reason: 'install',
          previousVersion: undefined,
        })
      ).resolves.not.toThrow();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify that even when tab creation fails, the startup tracking data was stored
      // Note: Onboarding data is NOT stored when tab creation fails (it happens after tab.create)
      // But startup tracking data from constructor is already stored
      expect(storageState).toMatchObject({
        installDate: expect.any(Number), // From startup tracking in constructor
        lastVersion: '1.3.5',
      });

      // Verify onboarding-specific data was NOT stored since tab creation failed
      expect(storageState.installedVersion).toBeUndefined();
      expect(storageState.onboardingCompleted).toBeUndefined();
    });

    it('should handle storage failure gracefully during install', async () => {
      // Mock storage failure
      mockStorageSet.mockRejectedValueOnce(new Error('Storage quota exceeded'));

      // Get the onInstalled handler
      const onInstalledHandler = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];

      // Call handler and ensure it doesn't throw
      await expect(
        onInstalledHandler({
          reason: 'install',
          previousVersion: undefined,
        })
      ).resolves.not.toThrow();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify tab creation was still attempted (observable behavior)
      expect(mockTabsCreate).toHaveBeenCalled();
    });
  });

  describe('Welcome Page Message Handlers', () => {
    it('should respond with extension status for valid bolt2github.com requests', async () => {
      // Pre-populate storage with onboarding data
      storageState = {
        installDate: '2024-01-15T10:00:00.000Z',
        onboardingCompleted: false,
        installedVersion: '1.3.5',
        completedSteps: ['step1'],
      };

      // Update auth state for this test
      mockSupabaseAuthService.getAuthState.mockReturnValueOnce({
        isAuthenticated: true,
        subscription: { isActive: false },
      });

      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = vi.fn();

      // Simulate message from welcome page
      const result = await onMessageHandler(
        { type: 'getExtensionStatus' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      // Should return true for async response
      expect(result).toBe(true);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify response contains expected data (observable output)
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

    it('should update storage when completing onboarding steps', async () => {
      // Pre-populate storage with initial completed steps
      storageState = {
        completedSteps: ['step1'],
      };

      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = vi.fn();

      // Simulate message from welcome page
      const result = await onMessageHandler(
        { type: 'completeOnboardingStep', step: 'authentication' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      // Should return true for async response
      expect(result).toBe(true);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify storage was updated with new step (observable state change)
      expect(storageState.completedSteps).toEqual(['step1', 'authentication']);

      // Verify success response
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
      });
    });

    it('should reject invalid onboarding steps', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = vi.fn();

      // Simulate message with invalid step
      onMessageHandler(
        { type: 'completeOnboardingStep', step: 'invalid_step' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify error response (observable output)
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid onboarding step: invalid_step',
      });
    });

    it('should provide GitHub App auth URL when requested', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = vi.fn();

      // Simulate GitHub App auth request
      onMessageHandler(
        { type: 'initiateGitHubAuth', method: 'github_app' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify auth URL response (observable output)
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        authUrl: 'https://github.com/apps/bolt-to-github/installations/new',
        method: 'github_app',
      });
    });

    it('should reject messages from non-bolt2github.com domains', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = vi.fn();

      // Simulate message from malicious site
      onMessageHandler(
        { type: 'getExtensionStatus' },
        { url: 'https://malicious-site.com', tab: { id: 123 } },
        sendResponse
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify no extension status was sent (security validation)
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installed: true,
          }),
        })
      );
    });

    it('should reject messages not from tabs', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = vi.fn();

      // Simulate message without tab
      onMessageHandler(
        { type: 'getExtensionStatus' },
        { url: 'https://bolt2github.com/welcome' }, // No tab property
        sendResponse
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify no extension status was sent (security validation)
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installed: true,
          }),
        })
      );
    });

    it('should reject invalid authentication methods', async () => {
      // Get the onMessage handler
      const onMessageHandler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];

      // Create a mock sendResponse function
      const sendResponse = vi.fn();

      // Simulate request with invalid auth method
      onMessageHandler(
        { type: 'initiateGitHubAuth', method: 'invalid_method' },
        { url: 'https://bolt2github.com/welcome', tab: { id: 123 } },
        sendResponse
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify error response (security validation)
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid authentication method: invalid_method',
      });
    });
  });
});
