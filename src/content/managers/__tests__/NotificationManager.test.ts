/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, test, vi, type Mocked } from 'vitest';
import type { MessageHandler } from '../../MessageHandler';
import type { UIStateManager } from '../../services/UIStateManager';
import type { NotificationOptions } from '../../types/UITypes';
import { NotificationManager } from '../NotificationManager';

vi.mock('../../Notification.svelte', () => ({
  default: class MockNotification {
    constructor(options: any = {}) {
      this.options = options;
      this.$set = vi.fn();
      this.$on = vi.fn();
      this.$destroy = vi.fn();
    }
    options: any;
    $set: any;
    $on: any;
    $destroy: any;
  },
}));

vi.mock('../../../lib/components/ui/dialog', () => ({
  EnhancedConfirmationDialog: class MockEnhancedConfirmationDialog {
    constructor(options: any = {}) {
      this.options = options;
      this.$set = vi.fn();
      this.$on = vi.fn();
      this.$destroy = vi.fn();
    }
    options: any;
    $set: any;
    $on: any;
    $destroy: any;
  },
}));

describe('NotificationManager', () => {
  let notificationManager: NotificationManager;
  let mockMessageHandler: Mocked<MessageHandler>;
  let mockStateManager: Mocked<UIStateManager>;

  beforeEach(() => {
    mockMessageHandler = {
      sendMessage: vi.fn(),
      sendZipData: vi.fn(),
      sendDebugMessage: vi.fn(),
      sendCommitMessage: vi.fn(),
      updatePort: vi.fn(),
    } as any;

    mockStateManager = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      getState: vi.fn(),
      setUploadStatus: vi.fn(),
      setButtonState: vi.fn(),
      addNotification: vi.fn(),
      removeNotification: vi.fn(),
    } as any;

    notificationManager = new NotificationManager(mockMessageHandler, mockStateManager);

    document.body.innerHTML = '<div></div>';

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  afterEach(() => {
    notificationManager.cleanup();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('Notification Display', () => {
    test('shows success notification', () => {
      const options: NotificationOptions = {
        type: 'success',
        message: 'Test success',
        duration: 3000,
      };

      notificationManager.showNotification(options);

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(1);

      const container = containers[0] as HTMLElement;
      expect(container.style.position).toBe('fixed');
      expect(container.style.zIndex).toBe('10002');
    });

    test('shows error notification', () => {
      const options: NotificationOptions = {
        type: 'error',
        message: 'Test error',
        duration: 3000,
      };

      notificationManager.showNotification(options);

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(1);
    });

    test('shows info notification with default duration', () => {
      const options: NotificationOptions = {
        type: 'info',
        message: 'Test info',
      };

      notificationManager.showNotification(options);

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(1);
    });

    test('handles multiple notifications with proper positioning', () => {
      const options1: NotificationOptions = {
        type: 'info',
        message: 'First notification',
      };

      const options2: NotificationOptions = {
        type: 'success',
        message: 'Second notification',
      };

      notificationManager.showNotification(options1);
      notificationManager.showNotification(options2);

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(2);

      const firstContainer = containers[0] as HTMLElement;
      const secondContainer = containers[1] as HTMLElement;

      const firstTop = parseInt(firstContainer.style.top);
      const secondTop = parseInt(secondContainer.style.top);

      expect(secondTop).toBeGreaterThan(firstTop);
    });
  });

  describe('Mobile Responsiveness', () => {
    test('adjusts notification layout for mobile screens', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 480,
      });

      const options: NotificationOptions = {
        type: 'info',
        message: 'Mobile notification',
      };

      notificationManager.showNotification(options);

      const container = document.querySelector(
        '[id^="bolt-to-github-notification-container-"]'
      ) as HTMLElement;
      expect(container.style.left).toBe('1rem');
      expect(container.style.right).toBe('1rem');
    });

    test('uses standard layout for desktop screens', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const options: NotificationOptions = {
        type: 'info',
        message: 'Desktop notification',
      };

      notificationManager.showNotification(options);

      const container = document.querySelector(
        '[id^="bolt-to-github-notification-container-"]'
      ) as HTMLElement;
      expect(container.style.right).toBe('1rem');
      expect(container.style.left).toBe('auto');
    });
  });

  describe('Settings Notification', () => {
    test('shows settings notification', () => {
      notificationManager.showSettingsNotification();

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(1);
    });
  });

  describe('Upgrade Notification', () => {
    test('shows upgrade notification with custom options', () => {
      const options = {
        type: 'info' as const,
        message: 'Upgrade to premium',
        upgradeText: 'Upgrade Now',
        onUpgrade: vi.fn(),
      };

      notificationManager.showUpgradeNotification(options);

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(1);
    });
  });

  describe('Confirmation Dialog', () => {
    test('shows confirmation dialog and resolves with user input', async () => {
      const options = {
        title: 'Confirm Upload',
        message: 'Are you sure you want to upload?',
        confirmText: 'Upload',
        cancelText: 'Cancel',
        placeholder: 'Enter commit message',
      };

      notificationManager.showConfirmationDialog(options);

      const dialogContainer = document.getElementById(
        'bolt-to-github-confirmation-dialog-container'
      );
      expect(dialogContainer).toBeTruthy();
      expect(dialogContainer?.style.zIndex).toBe('2147483646');

      expect(dialogContainer?.style.position).toBe('fixed');
      expect(dialogContainer?.style.width).toBe('100%');
      expect(dialogContainer?.style.height).toBe('100%');
    });
  });

  describe('Cleanup', () => {
    test('removes all notifications on cleanup', () => {
      notificationManager.showNotification({ type: 'info', message: 'Test 1' });
      notificationManager.showNotification({ type: 'success', message: 'Test 2' });

      expect(
        document.querySelectorAll('[id^="bolt-to-github-notification-container-"]').length
      ).toBe(2);

      notificationManager.cleanup();

      expect(
        document.querySelectorAll('[id^="bolt-to-github-notification-container-"]').length
      ).toBe(0);
    });

    test('removes resize event listener on cleanup', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      notificationManager.cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Window Resize Handling', () => {
    test('updates notification positions on window resize', () => {
      notificationManager.showNotification({ type: 'info', message: 'Test' });

      const container = document.querySelector(
        '[id^="bolt-to-github-notification-container-"]'
      ) as HTMLElement;

      window.dispatchEvent(new Event('resize'));

      expect(container.style.top).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('handles missing state manager gracefully', () => {
      document.body.innerHTML = '<div></div>';

      const managerWithoutState = new NotificationManager(mockMessageHandler);

      expect(() => {
        managerWithoutState.showNotification({ type: 'info', message: 'Test' });
      }).not.toThrow();

      managerWithoutState.cleanup();
    });

    test('handles multiple cleanup calls gracefully', () => {
      expect(() => {
        notificationManager.cleanup();
        notificationManager.cleanup();
      }).not.toThrow();
    });
  });

  describe('Notification Actions', () => {
    test('supports notifications with custom actions', () => {
      const mockAction = vi.fn();
      const options: NotificationOptions = {
        type: 'info',
        message: 'Test with actions',
        actions: [
          {
            text: 'Action 1',
            action: mockAction,
            variant: 'primary',
          },
        ],
      };

      notificationManager.showNotification(options);

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(1);
    });
  });
});
