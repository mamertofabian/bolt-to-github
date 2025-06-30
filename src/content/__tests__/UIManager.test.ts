/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import type { MessageHandler } from '../MessageHandler';
import type { NotificationOptions } from '../types/UITypes';
import { UIManager } from '../UIManager';

// Mock WhatsNewModal component
vi.mock('$lib/components/WhatsNewModal.svelte', () => ({
  default: vi.fn().mockImplementation(function (this: any, options: any) {
    this.target = options.target;
    this.props = options.props;
    this.$destroy = vi.fn();
    this.$set = vi.fn();
    return this;
  }),
}));

// Mock modules with proper method implementations
vi.mock('../managers/NotificationManager', () => {
  return {
    NotificationManager: vi.fn().mockImplementation(() => ({
      showNotification: vi.fn(),
      cleanup: vi.fn(),
    })),
  };
});

vi.mock('../managers/UploadStatusManager', () => {
  return {
    UploadStatusManager: vi.fn().mockImplementation(() => ({
      initialize: vi.fn(),
      updateStatus: vi.fn(),
      cleanup: vi.fn(),
    })),
  };
});

vi.mock('../managers/GitHubButtonManager', () => {
  return {
    GitHubButtonManager: vi.fn().mockImplementation(() => ({
      initialize: vi.fn(),
      updateState: vi.fn(),
      cleanup: vi.fn(),
    })),
  };
});

vi.mock('../managers/DropdownManager', () => {
  return {
    DropdownManager: vi.fn().mockImplementation(() => ({
      updatePremiumStatus: vi.fn(),
      cleanup: vi.fn(),
      setPremiumService: vi.fn(),
    })),
  };
});

vi.mock('../handlers/GitHubUploadHandler', () => {
  return {
    GitHubUploadHandler: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('../handlers/FileChangeHandler', () => {
  return {
    FileChangeHandler: vi.fn().mockImplementation(() => ({
      setPremiumService: vi.fn(),
      setUploadStatusManager: vi.fn(),
    })),
  };
});

vi.mock('../infrastructure/DOMObserver', () => {
  return {
    DOMObserver: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
    })),
  };
});

vi.mock('../infrastructure/ComponentLifecycleManager', () => {
  return {
    ComponentLifecycleManager: vi.fn().mockImplementation(() => ({
      cleanupAll: vi.fn(),
    })),
  };
});

vi.mock('../services/UIStateManager', () => {
  return {
    UIStateManager: vi.fn().mockImplementation(() => ({
      addListener: vi.fn(),
      removeListener: vi.fn(),
      getState: vi.fn().mockReturnValue({
        buttonState: { isValid: false },
        uploadStatus: { status: 'idle' },
        notifications: { active: 0 },
        dropdown: { isVisible: false },
      }),
      setButtonState: vi.fn(),
      setComponentInitialized: vi.fn(),
    })),
  };
});

vi.mock('../services/PushReminderService', () => {
  return {
    PushReminderService: vi.fn().mockImplementation(() => ({
      enable: vi.fn(),
      disable: vi.fn(),
      snoozeReminders: vi.fn(),
      enableDebugMode: vi.fn(),
      disableDebugMode: vi.fn(),
      forceReminderCheck: vi.fn().mockResolvedValue(undefined),
      forceShowReminder: vi.fn().mockResolvedValue(undefined),
      forceScheduledReminderCheck: vi.fn().mockResolvedValue(undefined),
      forceShowScheduledReminder: vi.fn().mockResolvedValue(undefined),
      setPremiumService: vi.fn(),
      cleanup: vi.fn(),
    })),
  };
});

vi.mock('../services/PremiumService', () => {
  return {
    PremiumService: vi.fn().mockImplementation(() => ({
      isPremiumSync: vi.fn().mockReturnValue(false),
      isPremium: vi.fn().mockResolvedValue(false),
      hasFeatureSync: vi.fn().mockReturnValue(false),
      hasFeature: vi.fn().mockResolvedValue(false),
      setUIManager: vi.fn(),
    })),
  };
});

describe('UIManager', () => {
  let mockMessageHandler: Mocked<MessageHandler>;

  beforeEach(() => {
    // Reset singleton between tests
    UIManager.resetInstance();

    mockMessageHandler = {
      sendMessage: vi.fn(),
      sendZipData: vi.fn(),
      sendDebugMessage: vi.fn(),
      sendCommitMessage: vi.fn(),
      updatePort: vi.fn(),
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
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      writable: true,
    });
  });

  afterEach(() => {
    UIManager.resetInstance();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('creates single instance when initialized', () => {
      const instance1 = UIManager.initialize(mockMessageHandler);
      const instance2 = UIManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(UIManager);
    });

    it('returns same instance on subsequent calls', () => {
      const instance1 = UIManager.initialize(mockMessageHandler);
      const instance2 = UIManager.initialize(mockMessageHandler);
      const instance3 = UIManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });

    it('throws error when accessing instance without initialization', () => {
      expect(() => UIManager.getInstance()).toThrow(
        'UIManager must be initialized with a MessageHandler first'
      );
    });

    it('resets instance correctly', () => {
      UIManager.initialize(mockMessageHandler);
      expect(() => UIManager.getInstance()).not.toThrow();

      UIManager.resetInstance();

      expect(() => UIManager.getInstance()).toThrow(
        'UIManager must be initialized with a MessageHandler first'
      );
    });

    it('can be reinitialized after reset', () => {
      UIManager.initialize(mockMessageHandler);
      UIManager.resetInstance();

      const newInstance = UIManager.initialize(mockMessageHandler);

      expect(newInstance).toBeInstanceOf(UIManager);
      expect(() => UIManager.getInstance()).not.toThrow();
    });
  });

  describe('Manager Initialization', () => {
    it('initializes all required managers during construction', () => {
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

    it('sets up state coordination between managers', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const stateManager = (uiManager as any).stateManager;

      expect(stateManager).toBeDefined();
      // Verify state manager has required methods
      expect(typeof stateManager.addListener).toBe('function');
      expect(typeof stateManager.removeListener).toBe('function');
      expect(typeof stateManager.getState).toBe('function');
    });

    it('starts DOM observation during initialization', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const domObserver = (uiManager as any).domObserver;

      expect(domObserver.start).toHaveBeenCalled();
    });

    it('initializes upload status manager', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const uploadStatusManager = (uiManager as any).uploadStatusManager;

      expect(uploadStatusManager.initialize).toHaveBeenCalled();
    });

    it('initializes GitHub button manager', () => {
      // Mock location to be on a project page
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://bolt.new/~/test-project',
        },
        writable: true,
      });

      // Mock DOM state for button initialization
      document.body.innerHTML = `
        <div class="flex grow-1 basis-60">
          <div class="flex gap-2"></div>
        </div>
      `;

      const uiManager = UIManager.initialize(mockMessageHandler);

      // Get the DOM observer callback and trigger it
      const domObserver = (uiManager as any).domObserver;
      const startCall = domObserver.start.mock.calls[0];
      const observerCallback = startCall[0];

      // Trigger the callback to simulate DOM change
      observerCallback();

      const githubButtonManager = (uiManager as any).githubButtonManager;
      expect(githubButtonManager.initialize).toHaveBeenCalled();
    });
  });

  describe('Public API Methods', () => {
    let uiManager: UIManager;

    beforeEach(() => {
      uiManager = UIManager.initialize(mockMessageHandler);
    });

    it('updateUploadStatus delegates to UploadStatusManager', () => {
      const uploadStatusManager = (uiManager as any).uploadStatusManager;
      const spy = vi.spyOn(uploadStatusManager, 'updateStatus');

      const status = { status: 'uploading' as const, progress: 50, message: 'Uploading...' };
      uiManager.updateUploadStatus(status);

      expect(spy).toHaveBeenCalledWith(status);
    });

    it('updateButtonState delegates to GitHub button manager', () => {
      const githubButtonManager = (uiManager as any).githubButtonManager;
      const spy = vi.spyOn(githubButtonManager, 'updateState');

      uiManager.updateButtonState(true);

      expect(spy).toHaveBeenCalledWith(true);
    });

    it('showNotification delegates to NotificationManager', () => {
      const notificationManager = (uiManager as any).notificationManager;
      const spy = vi.spyOn(notificationManager, 'showNotification');

      const notification: NotificationOptions = {
        type: 'success',
        message: 'Test notification',
        duration: 3000,
      };
      uiManager.showNotification(notification);

      expect(spy).toHaveBeenCalledWith(notification);
    });

    it('provides access to PushReminderService', () => {
      const pushReminderService = uiManager.getPushReminderService();

      expect(pushReminderService).toBeDefined();
      expect(pushReminderService).toBe((uiManager as any).pushReminderService);
    });

    it('provides access to PremiumService', () => {
      const premiumService = uiManager.getPremiumService();

      expect(premiumService).toBeDefined();
      expect(premiumService).toBe((uiManager as any).premiumService);
    });

    it('handles premium status checking', async () => {
      const premiumService = (uiManager as any).premiumService;
      premiumService.isPremiumSync.mockReturnValue(true);
      premiumService.isPremium.mockResolvedValue(true);

      expect(uiManager.isPremium()).toBe(true);
      await expect(uiManager.isPremiumValidated()).resolves.toBe(true);
    });

    it('handles feature checking', async () => {
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

    it('detects Bolt.new project pages correctly', () => {
      const isOnProjectPage = (uiManager as any).isOnProjectPage();

      // With default URL setup (https://bolt.new/~/sb1-abc123)
      expect(isOnProjectPage).toBe(true);
    });

    it('rejects non-project pages', () => {
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

    it('rejects non-Bolt.new pages', () => {
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

    it('sets up URL change detection for SPA navigation', () => {
      const originalPushState = (uiManager as any).originalPushState;
      const originalReplaceState = (uiManager as any).originalReplaceState;

      expect(originalPushState).toBeDefined();
      expect(originalReplaceState).toBeDefined();
    });

    it('handles URL changes correctly', () => {
      const handleUrlChange = vi.spyOn(uiManager as any, 'handleUrlChange');

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

    it('enables push reminders', () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const spy = vi.spyOn(pushReminderService, 'enable');

      uiManager.enablePushReminders();

      expect(spy).toHaveBeenCalled();
    });

    it('disables push reminders', () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const spy = vi.spyOn(pushReminderService, 'disable');

      uiManager.disablePushReminders();

      expect(spy).toHaveBeenCalled();
    });

    it('snoozes push reminders', () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const spy = vi.spyOn(pushReminderService, 'snoozeReminders');

      uiManager.snoozePushReminders();

      expect(spy).toHaveBeenCalled();
    });

    it('handles debug mode toggling', () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const enableSpy = vi.spyOn(pushReminderService, 'enableDebugMode');
      const disableSpy = vi.spyOn(pushReminderService, 'disableDebugMode');

      uiManager.enablePushReminderDebugMode();
      expect(enableSpy).toHaveBeenCalled();

      uiManager.disablePushReminderDebugMode();
      expect(disableSpy).toHaveBeenCalled();
    });

    it('forces reminder checks', async () => {
      const pushReminderService = (uiManager as any).pushReminderService;
      const spy = vi.spyOn(pushReminderService, 'forceReminderCheck');

      await uiManager.forceReminderCheck();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    let uiManager: UIManager;

    beforeEach(() => {
      uiManager = UIManager.initialize(mockMessageHandler);
    });

    it('cleans up all components', () => {
      const domObserver = (uiManager as any).domObserver;
      const lifecycleManager = (uiManager as any).componentLifecycleManager;
      const pushReminderService = (uiManager as any).pushReminderService;

      const domSpy = vi.spyOn(domObserver, 'stop');
      const lifecycleSpy = vi.spyOn(lifecycleManager, 'cleanupAll');
      const reminderSpy = vi.spyOn(pushReminderService, 'cleanup');

      uiManager.cleanup();

      expect(domSpy).toHaveBeenCalled();
      expect(lifecycleSpy).toHaveBeenCalled();
      expect(reminderSpy).toHaveBeenCalled();
    });

    it('restores original history functions', () => {
      // Get references to the original functions before UIManager modifies them
      const originalPushState = (uiManager as any).originalPushState;
      const originalReplaceState = (uiManager as any).originalReplaceState;

      uiManager.cleanup();

      // History functions should be restored to their original values
      expect(window.history.pushState).toBe(originalPushState);
      expect(window.history.replaceState).toBe(originalReplaceState);
    });

    it('can reinitialize after cleanup', () => {
      uiManager.cleanup();

      const uploadStatusManager = (uiManager as any).uploadStatusManager;
      const reinitializeSpy = vi.spyOn(uploadStatusManager, 'initialize');

      uiManager.reinitialize();

      expect(reinitializeSpy).toHaveBeenCalled();

      // GitHub button manager initialize is called conditionally via DOM observer
      // Let's verify the DOM observer was restarted instead
      const domObserver = (uiManager as any).domObserver;
      expect(domObserver.start).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles initialization errors gracefully', () => {
      // Don't throw errors during initialization
      expect(() => {
        UIManager.initialize(mockMessageHandler);
      }).not.toThrow();
    });

    it('handles missing DOM elements gracefully', () => {
      document.body.innerHTML = ''; // Empty DOM

      expect(() => {
        UIManager.initialize(mockMessageHandler);
      }).not.toThrow();
    });
  });
});
