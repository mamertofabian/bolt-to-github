import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageHandler } from '../MessageHandler';
import type { NotificationOptions } from '../types/UITypes';
import { UIManager } from '../UIManager';
import type { UploadStatusState } from '$lib/types';

vi.mock('../../services/settings', () => ({
  SettingsService: {
    setProjectId: vi.fn().mockResolvedValue(undefined),
    getGitHubSettings: vi.fn().mockResolvedValue({
      isSettingsValid: true,
      gitHubSettings: {},
    }),
  },
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('$lib/utils/projectId', () => ({
  getCurrentProjectId: vi.fn(() => 'test-project'),
}));

global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    getManifest: vi.fn(() => ({
      version: '1.0.0',
    })),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}) as unknown as typeof chrome.storage.local.get,
      set: vi.fn().mockResolvedValue(undefined) as unknown as typeof chrome.storage.local.set,
      remove: vi.fn().mockResolvedValue(undefined) as unknown as typeof chrome.storage.local.remove,
    },
  },
  tabs: {
    create: vi.fn(),
  },
} as unknown as typeof chrome;

describe('UIManager', () => {
  let mockMessageHandler: MessageHandler;

  beforeEach(() => {
    UIManager.resetInstance();

    mockMessageHandler = {
      sendMessage: vi.fn(),
      sendZipData: vi.fn(),
      sendDebugMessage: vi.fn(),
      sendCommitMessage: vi.fn(),
      updatePort: vi.fn(),
    } as unknown as MessageHandler;

    document.body.innerHTML = '<div id="root"></div>';

    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://bolt.new/~/sb1-test-project',
        hostname: 'bolt.new',
        pathname: '/~/sb1-test-project',
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'history', {
      value: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    UIManager.resetInstance();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should create and return a single instance when initialized', () => {
      const instance1 = UIManager.initialize(mockMessageHandler);
      const instance2 = UIManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(UIManager);
    });

    it('should return the same instance on subsequent calls to initialize', () => {
      const instance1 = UIManager.initialize(mockMessageHandler);
      const instance2 = UIManager.initialize(mockMessageHandler);
      const instance3 = UIManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });

    it('should throw error when accessing instance without initialization', () => {
      expect(() => UIManager.getInstance()).toThrow(
        'UIManager must be initialized with a MessageHandler first'
      );
    });

    it('should allow reinitialization after reset', () => {
      UIManager.initialize(mockMessageHandler);
      UIManager.resetInstance();

      expect(() => UIManager.getInstance()).toThrow();

      const newInstance = UIManager.initialize(mockMessageHandler);
      expect(newInstance).toBeInstanceOf(UIManager);
      expect(() => UIManager.getInstance()).not.toThrow();
    });
  });

  describe('Notification API', () => {
    it('should expose showNotification method', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const notification: NotificationOptions = {
        type: 'success',
        message: 'Test notification',
        duration: 3000,
      };

      expect(() => uiManager.showNotification(notification)).not.toThrow();
    });
  });

  describe('Upload Status API', () => {
    it('should expose updateUploadStatus method', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const status: UploadStatusState = {
        status: 'uploading',
        progress: 50,
        message: 'Uploading...',
      };

      expect(() => uiManager.updateUploadStatus(status)).not.toThrow();
    });
  });

  describe('Button State API', () => {
    it('should expose updateButtonState method', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      expect(() => uiManager.updateButtonState(true)).not.toThrow();
      expect(() => uiManager.updateButtonState(false)).not.toThrow();
    });
  });

  describe('File Changes API', () => {
    it('should expose handleShowChangedFiles method', async () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      await expect(uiManager.handleShowChangedFiles()).resolves.not.toThrow();
    });
  });

  describe('Upgrade Prompt API', () => {
    it('should send upgrade modal message for feature upgrade prompt', async () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      await uiManager.handleUpgradePrompt('file-changes');

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SHOW_UPGRADE_MODAL',
        feature: 'fileChanges',
      });
    });

    it('should map different features to correct modal types', async () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      const featureMap = {
        'file-changes': 'fileChanges',
        issues: 'issues',
        'quick-issue': 'issues',
        'push-reminders': 'pushReminders',
        'branch-selector': 'branchSelector',
        unknown: 'general',
      };

      for (const [feature, expectedModalType] of Object.entries(featureMap)) {
        vi.clearAllMocks();
        await uiManager.handleUpgradePrompt(feature);

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: 'SHOW_UPGRADE_MODAL',
          feature: expectedModalType,
        });
      }
    });
  });

  describe('Push Reminder Service API', () => {
    it('should provide access to PushReminderService', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const pushReminderService = uiManager.getPushReminderService();

      expect(pushReminderService).toBeDefined();
      expect(typeof pushReminderService.enable).toBe('function');
      expect(typeof pushReminderService.disable).toBe('function');
    });

    it('should expose push reminder control methods', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      expect(() => uiManager.enablePushReminders()).not.toThrow();
      expect(() => uiManager.disablePushReminders()).not.toThrow();
      expect(() => uiManager.snoozePushReminders()).not.toThrow();
      expect(() => uiManager.enablePushReminderDebugMode()).not.toThrow();
      expect(() => uiManager.disablePushReminderDebugMode()).not.toThrow();
    });

    it('should expose push reminder force methods', async () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      await expect(uiManager.forceReminderCheck()).resolves.not.toThrow();
      await expect(uiManager.forceShowReminder()).resolves.not.toThrow();
      await expect(uiManager.forceScheduledReminderCheck()).resolves.not.toThrow();
      await expect(uiManager.forceShowScheduledReminder()).resolves.not.toThrow();
    });
  });

  describe('Premium Service API', () => {
    it('should provide access to PremiumService', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const premiumService = uiManager.getPremiumService();

      expect(premiumService).toBeDefined();
      expect(typeof premiumService.isPremiumSync).toBe('function');
      expect(typeof premiumService.isPremium).toBe('function');
    });

    it('should expose premium status check methods', async () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      const isPremiumSync = uiManager.isPremium();
      expect(typeof isPremiumSync).toBe('boolean');

      const isPremiumValidated = await uiManager.isPremiumValidated();
      expect(typeof isPremiumValidated).toBe('boolean');
    });

    it('should expose feature check methods', async () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      const hasFeatureSync = uiManager.hasFeature('pushReminders');
      expect(typeof hasFeatureSync).toBe('boolean');

      const hasFeatureValidated = await uiManager.hasFeatureValidated('pushReminders');
      expect(typeof hasFeatureValidated).toBe('boolean');
    });
  });

  describe('WhatsNew Manager API', () => {
    it('should provide access to WhatsNewManager', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);
      const whatsNewManager = uiManager.getWhatsNewManager();

      expect(whatsNewManager).toBeDefined();
    });
  });

  describe('Lifecycle Management', () => {
    it('should initialize without errors', () => {
      expect(() => UIManager.initialize(mockMessageHandler)).not.toThrow();
    });

    it('should cleanup without errors', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      expect(() => uiManager.cleanup()).not.toThrow();
    });

    it('should reinitialize after cleanup', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      expect(() => uiManager.cleanup()).not.toThrow();
      expect(() => uiManager.reinitialize()).not.toThrow();
    });

    it('should restore window.history functions after cleanup', () => {
      const originalPushState = window.history.pushState;
      const originalReplaceState = window.history.replaceState;

      const uiManager = UIManager.initialize(mockMessageHandler);

      expect(window.history.pushState).not.toBe(originalPushState);
      expect(window.history.replaceState).not.toBe(originalReplaceState);

      uiManager.cleanup();

      expect(window.history.pushState).toBe(originalPushState);
      expect(window.history.replaceState).toBe(originalReplaceState);
    });
  });

  describe('Re-authentication Modal', () => {
    it('should display re-authentication modal with provided data', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      const modalData = {
        message: 'Please sign in again',
        actionText: 'Sign In',
        actionUrl: 'https://example.com/signin',
      };

      uiManager.showReauthenticationModal(modalData);

      const modalElement = document.querySelector('.bolt-auth-modal-overlay');
      expect(modalElement).toBeTruthy();

      expect(modalElement?.textContent).toContain(modalData.message);
      expect(modalElement?.textContent).toContain(modalData.actionText);
    });

    it('should remove modal when dismissed', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      uiManager.showReauthenticationModal({
        message: 'Test message',
        actionText: 'Action',
        actionUrl: 'https://example.com',
      });

      const modalElement = document.querySelector('.bolt-auth-modal-overlay');
      expect(modalElement).toBeTruthy();

      const dismissButton = document.querySelector('[data-action="dismiss"]') as HTMLButtonElement;
      dismissButton?.click();

      expect(document.querySelector('.bolt-auth-modal-overlay')).toBeFalsy();
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization with missing DOM elements gracefully', () => {
      document.body.innerHTML = '';

      expect(() => UIManager.initialize(mockMessageHandler)).not.toThrow();
    });

    it('should handle initialization on non-project pages', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://bolt.new/',
          hostname: 'bolt.new',
          pathname: '/',
        },
        writable: true,
        configurable: true,
      });

      expect(() => UIManager.initialize(mockMessageHandler)).not.toThrow();
    });
  });

  describe('Integration with MessageHandler', () => {
    it('should initialize with MessageHandler', () => {
      const uiManager = UIManager.initialize(mockMessageHandler);

      expect(uiManager).toBeInstanceOf(UIManager);
    });
  });
});
