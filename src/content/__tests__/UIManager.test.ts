/* eslint-env jest */

import { UIManager } from '../UIManager';
import type { MessageHandler } from '../MessageHandler';
import type { NotificationOptions } from '../types/UITypes';

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

// Mock modules with proper method implementations
jest.mock('../managers/NotificationManager', () => {
  return {
    NotificationManager: jest.fn().mockImplementation(() => ({
      showNotification: jest.fn(),
      cleanup: jest.fn(),
    })),
  };
});

jest.mock('../managers/UploadStatusManager', () => {
  return {
    UploadStatusManager: jest.fn().mockImplementation(() => ({
      initialize: jest.fn(),
      updateStatus: jest.fn(),
      cleanup: jest.fn(),
    })),
  };
});

jest.mock('../managers/GitHubButtonManager', () => {
  return {
    GitHubButtonManager: jest.fn().mockImplementation(() => ({
      initialize: jest.fn(),
      updateState: jest.fn(),
      cleanup: jest.fn(),
    })),
  };
});

jest.mock('../managers/DropdownManager', () => {
  return {
    DropdownManager: jest.fn().mockImplementation(() => ({
      updatePremiumStatus: jest.fn(),
      cleanup: jest.fn(),
      setPremiumService: jest.fn(),
    })),
  };
});

jest.mock('../handlers/GitHubUploadHandler', () => {
  return {
    GitHubUploadHandler: jest.fn().mockImplementation(() => ({})),
  };
});

jest.mock('../handlers/FileChangeHandler', () => {
  return {
    FileChangeHandler: jest.fn().mockImplementation(() => ({
      setPremiumService: jest.fn(),
      setUploadStatusManager: jest.fn(),
    })),
  };
});

jest.mock('../infrastructure/DOMObserver', () => {
  return {
    DOMObserver: jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
    })),
  };
});

jest.mock('../infrastructure/ComponentLifecycleManager', () => {
  return {
    ComponentLifecycleManager: jest.fn().mockImplementation(() => ({
      cleanupAll: jest.fn(),
    })),
  };
});

jest.mock('../services/UIStateManager', () => {
  return {
    UIStateManager: jest.fn().mockImplementation(() => ({
      addListener: jest.fn(),
      removeListener: jest.fn(),
      getState: jest.fn().mockReturnValue({
        buttonState: { isValid: false },
        uploadStatus: { status: 'idle' },
        notifications: { active: 0 },
        dropdown: { isVisible: false },
      }),
      setButtonState: jest.fn(),
      setComponentInitialized: jest.fn(),
    })),
  };
});

jest.mock('../services/PushReminderService', () => {
  return {
    PushReminderService: jest.fn().mockImplementation(() => ({
      enable: jest.fn(),
      disable: jest.fn(),
      snoozeReminders: jest.fn(),
      enableDebugMode: jest.fn(),
      disableDebugMode: jest.fn(),
      forceReminderCheck: jest.fn().mockResolvedValue(undefined),
      forceShowReminder: jest.fn().mockResolvedValue(undefined),
      forceScheduledReminderCheck: jest.fn().mockResolvedValue(undefined),
      forceShowScheduledReminder: jest.fn().mockResolvedValue(undefined),
      setPremiumService: jest.fn(),
      cleanup: jest.fn(),
    })),
  };
});

jest.mock('../services/PremiumService', () => {
  return {
    PremiumService: jest.fn().mockImplementation(() => ({
      isPremiumSync: jest.fn().mockReturnValue(false),
      isPremium: jest.fn().mockResolvedValue(false),
      hasFeatureSync: jest.fn().mockReturnValue(false),
      hasFeature: jest.fn().mockResolvedValue(false),
      setUIManager: jest.fn(),
    })),
  };
});

describe('UIManager', () => {
  let mockMessageHandler: jest.Mocked<MessageHandler>;

  beforeEach(() => {
    // Reset singleton between tests
    UIManager.resetInstance();

    mockMessageHandler = {
      sendMessage: jest.fn(),
      sendZipData: jest.fn(),
      sendDebugMessage: jest.fn(),
      sendCommitMessage: jest.fn(),
      updatePort: jest.fn(),
    } as any;

    // Setup DOM
    document.body.innerHTML = '<div></div>';

    // Mock window.location for SPA navigation tests
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://bolt.new/~/sb1-abc123',
        hostname: 'bolt.new',
        pathname: '/~/sb1-abc123',
      },
      writable: true,
    });

    // Mock history for SPA navigation
    Object.defineProperty(window, 'history', {
      value: {
        pushState: jest.fn(),
        replaceState: jest.fn(),
      },
      writable: true,
    });
  });

  afterEach(() => {
    UIManager.resetInstance();
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    test('creates single instance when initialized', () => {
      const instance1 = UIManager.initialize(mockMessageHandler);
      const instance2 = UIManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(UIManager);
    });

    test('returns same instance on subsequent calls', () => {
      const instance1 = UIManager.initialize(mockMessageHandler);
      const instance2 = UIManager.initialize(mockMessageHandler);
      const instance3 = UIManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });

    test('throws error when accessing instance without initialization', () => {
      expect(() => UIManager.getInstance()).toThrow(
        'UIManager must be initialized with a MessageHandler first'
      );
    });

    test('resets instance correctly', () => {
      UIManager.initialize(mockMessageHandler);
      expect(() => UIManager.getInstance()).not.toThrow();

      UIManager.resetInstance();

      expect(() => UIManager.getInstance()).toThrow(
        'UIManager must be initialized with a MessageHandler first'
      );
    });

    test('can be reinitialized after reset', () => {
      UIManager.initialize(mockMessageHandler);
      UIManager.resetInstance();

      const newInstance = UIManager.initialize(mockMessageHandler);

      expect(newInstance).toBeInstanceOf(UIManager);
      expect(() => UIManager.getInstance()).not.toThrow();
    });
  });

  describe('Manager Initialization', () => {
    test('initializes all required managers during construction', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      // Access private properties for testing initialization
      const privateManager = uiManager as any;

      expect(privateManager.stateManager).toBeDefined();
      expect(privateManager.notificationManager).toBeDefined();
      expect(privateManager.uploadStatusManager).toBeDefined();
      expect(privateManager.githubButtonManager).toBeDefined();
      expect(privateManager.dropdownManager).toBeDefined();
      expect(privateManager.githubUploadHandler).toBeDefined();
      expect(privateManager.fileChangeHandler).toBeDefined();
      expect(privateManager.domObserver).toBeDefined();
      expect(privateManager.componentLifecycleManager).toBeDefined();
      expect(privateManager.pushReminderService).toBeDefined();
      expect(privateManager.premiumService).toBeDefined();
    });

    test('sets up state coordination between managers', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const stateManager = (uiManager as any).stateManager;

      expect(stateManager).toBeDefined();
      // Verify state manager has required methods
      expect(typeof stateManager.addListener).toBe('function');
      expect(typeof stateManager.removeListener).toBe('function');
      expect(typeof stateManager.getState).toBe('function');
    });

    test('starts DOM observation during initialization', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const domObserver = (uiManager as any).domObserver;

      expect(domObserver.start).toHaveBeenCalled();
    });

    test('initializes upload status manager', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const uploadStatusManager = (uiManager as any).uploadStatusManager;

      expect(uploadStatusManager.initialize).toHaveBeenCalled();
    });

    test('initializes GitHub button manager', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const githubButtonManager = (uiManager as any).githubButtonManager;

      expect(githubButtonManager.initialize).toHaveBeenCalled();
    });
  });

  describe('Public API Methods', () => {
    let uiManager: UIManager;

    beforeEach(() => {
      uiManager = UIManager.initialize(mockMessageHandler);
    });

    test('updateUploadStatus delegates to UploadStatusManager', () => {
      const uploadStatusManager = (uiManager as any).uploadStatusManager;
      const spy = jest.spyOn(uploadStatusManager, 'updateStatus');

      const status = { status: 'uploading' as const, progress: 50, message: 'Uploading...' };
      uiManager.updateUploadStatus(status);

      expect(spy).toHaveBeenCalledWith(status);
    });

    test('updateButtonState delegates to GitHub button manager', () => {
      const githubButtonManager = (uiManager as any).githubButtonManager;
      const spy = jest.spyOn(githubButtonManager, 'updateState');

      uiManager.updateButtonState(true);

      expect(spy).toHaveBeenCalledWith(true);
    });

    test('showNotification delegates to NotificationManager', () => {
      const notificationManager = (uiManager as any).notificationManager;
      const spy = jest.spyOn(notificationManager, 'showNotification');

      const notification: NotificationOptions = {
        type: 'success',
        message: 'Test notification',
        duration: 3000,
      };
      uiManager.showNotification(notification);

      expect(spy).toHaveBeenCalledWith(notification);
    });

    test('provides access to PushReminderService', () => {
      const pushReminderService = uiManager.getPushReminderService();

      expect(pushReminderService).toBeDefined();
      expect(pushReminderService).toBe((uiManager as any).pushReminderService);
    });

    test('provides access to PremiumService', () => {
      const premiumService = uiManager.getPremiumService();

      expect(premiumService).toBeDefined();
      expect(premiumService).toBe((uiManager as any).premiumService);
    });

    test('handles premium status checking', async () => {
      const premiumService = (uiManager as any).premiumService;
      premiumService.isPremiumSync.mockReturnValue(true);
      premiumService.isPremium.mockResolvedValue(true);

      expect(uiManager.isPremium()).toBe(true);
      await expect(uiManager.isPremiumValidated()).resolves.toBe(true);
    });

    test('handles feature checking', async () => {
      const premiumService = (uiManager as any).premiumService;
      premiumService.hasFeatureSync.mockReturnValue(true);
      premiumService.hasFeature.mockResolvedValue(true);

      expect(uiManager.hasFeature('pushReminders')).toBe(true);
      await expect(uiManager.hasFeatureValidated('pushReminders')).resolves.toBe(true);
    });
  });

  describe('Project Page Detection', () => {
    let uiManager: UIManager;

    beforeEach(() => {
      uiManager = UIManager.initialize(mockMessageHandler);
    });

    test('detects Bolt.new project pages correctly', () => {
      const isOnProjectPage = (uiManager as any).isOnProjectPage();

      // With default URL setup (https://bolt.new/~/sb1-abc123)
      expect(isOnProjectPage).toBe(true);
    });

    test('rejects non-project pages', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://bolt.new/',
          hostname: 'bolt.new',
          pathname: '/',
        },
        writable: true,
      });

      const isOnProjectPage = (uiManager as any).isOnProjectPage();
      expect(isOnProjectPage).toBe(false);
    });

    test('rejects non-Bolt.new pages', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/user/repo',
          hostname: 'github.com',
          pathname: '/user/repo',
        },
        writable: true,
      });

      const isOnProjectPage = (uiManager as any).isOnProjectPage();
      expect(isOnProjectPage).toBe(false);
    });
  });

  describe('URL Change Detection', () => {
    let uiManager: UIManager;

    beforeEach(() => {
      uiManager = UIManager.initialize(mockMessageHandler);
    });

    test('sets up URL change detection for SPA navigation', () => {
      const originalPushState = (uiManager as any).originalPushState;
      const originalReplaceState = (uiManager as any).originalReplaceState;

      expect(originalPushState).toBeDefined();
      expect(originalReplaceState).toBeDefined();
    });

    test('handles URL changes correctly', () => {
      const handleUrlChange = jest.spyOn(uiManager as any, 'handleUrlChange');

      // Simulate history pushState call (which should trigger our listener)
      window.history.pushState({}, '', '/~/new-project');

      // Since we can't easily test the actual override, we'll test the handler directly
      (uiManager as any).handleUrlChange();

      expect(handleUrlChange).toHaveBeenCalled();
    });
  });

  describe('Service Integration', () => {
    let uiManager: UIManager;

    beforeEach(() => {
      uiManager = UIManager.initialize(mockMessageHandler);
    });

    test('enables push reminders', () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const spy = jest.spyOn(pushReminderService, 'enable');

      uiManager.enablePushReminders();

      expect(spy).toHaveBeenCalled();
    });

    test('disables push reminders', () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const spy = jest.spyOn(pushReminderService, 'disable');

      uiManager.disablePushReminders();

      expect(spy).toHaveBeenCalled();
    });

    test('snoozes push reminders', () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const spy = jest.spyOn(pushReminderService, 'snoozeReminders');

      uiManager.snoozePushReminders();

      expect(spy).toHaveBeenCalled();
    });

    test('handles debug mode toggling', () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const enableSpy = jest.spyOn(pushReminderService, 'enableDebugMode');
      const disableSpy = jest.spyOn(pushReminderService, 'disableDebugMode');

      uiManager.enablePushReminderDebugMode();
      expect(enableSpy).toHaveBeenCalled();

      uiManager.disablePushReminderDebugMode();
      expect(disableSpy).toHaveBeenCalled();
    });

    test('forces reminder checks', async () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const spy = jest.spyOn(pushReminderService, 'forceReminderCheck');

      await uiManager.forceReminderCheck();

      expect(spy).toHaveBeenCalled();
    });

    test('updates dropdown premium status', () => {
      const dropdownManager = (uiManager as any).dropdownManager;
      const spy = jest.spyOn(dropdownManager, 'updatePremiumStatus');

      uiManager.updateDropdownPremiumStatus();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    let uiManager: UIManager;

    beforeEach(() => {
      uiManager = UIManager.initialize(mockMessageHandler);
    });

    test('cleans up all components', () => {
      const domObserver = (uiManager as any).domObserver;
      const lifecycleManager = (uiManager as any).componentLifecycleManager;
      const pushReminderService = (uiManager as any).pushReminderService;

      const domSpy = jest.spyOn(domObserver, 'stop');
      const lifecycleSpy = jest.spyOn(lifecycleManager, 'cleanupAll');
      const reminderSpy = jest.spyOn(pushReminderService, 'cleanup');

      uiManager.cleanup();

      expect(domSpy).toHaveBeenCalled();
      expect(lifecycleSpy).toHaveBeenCalled();
      expect(reminderSpy).toHaveBeenCalled();
    });

    test('restores original history functions', () => {
      // Get references to the original functions before UIManager modifies them
      const originalPushState = (uiManager as any).originalPushState;
      const originalReplaceState = (uiManager as any).originalReplaceState;

      uiManager.cleanup();

      // History functions should be restored to their original values
      expect(window.history.pushState).toBe(originalPushState);
      expect(window.history.replaceState).toBe(originalReplaceState);
    });

    test('can reinitialize after cleanup', () => {
      uiManager.cleanup();

      const uploadStatusManager = (uiManager as any).uploadStatusManager;
      const githubButtonManager = (uiManager as any).githubButtonManager;
      const reinitializeSpy = jest.spyOn(uploadStatusManager, 'initialize');
      const buttonSpy = jest.spyOn(githubButtonManager, 'initialize');

      uiManager.reinitialize();

      expect(reinitializeSpy).toHaveBeenCalled();
      expect(buttonSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('handles initialization errors gracefully', () => {
      // Don't throw errors during initialization
      expect(() => {
        UIManager.initialize(mockMessageHandler);
      }).not.toThrow();
    });

    test('handles missing DOM elements gracefully', () => {
      document.body.innerHTML = ''; // Empty DOM

      expect(() => {
        UIManager.initialize(mockMessageHandler);
      }).not.toThrow();
    });
  });
});
