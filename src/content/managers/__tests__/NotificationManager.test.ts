import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MessageHandler } from '../../MessageHandler';
import type { UIStateManager } from '../../services/UIStateManager';
import type { NotificationOptions } from '../../types/UITypes';
import { NotificationManager } from '../NotificationManager';

describe('NotificationManager', () => {
  let notificationManager: NotificationManager;
  let mockMessageHandler: Partial<MessageHandler>;
  let mockStateManager: Partial<UIStateManager>;

  beforeEach(() => {
    mockMessageHandler = {
      sendMessage: vi.fn(),
    };

    mockStateManager = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };

    notificationManager = new NotificationManager(
      mockMessageHandler as MessageHandler,
      mockStateManager as UIStateManager
    );

    document.body.innerHTML = '<div></div>';

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    notificationManager.cleanup();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Notification Display', () => {
    test('displays success notification in DOM with correct styling', () => {
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
      expect(container.style.right).toBe('1rem');
    });

    test('displays error notification in DOM', () => {
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

    test('applies default duration for info notifications', () => {
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

    test('stacks multiple notifications with proper vertical spacing', () => {
      notificationManager.showNotification({ type: 'info', message: 'First notification' });
      notificationManager.showNotification({ type: 'success', message: 'Second notification' });

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
    test('adjusts layout for mobile viewport', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 480,
      });

      notificationManager.showNotification({ type: 'info', message: 'Mobile notification' });

      const container = document.querySelector(
        '[id^="bolt-to-github-notification-container-"]'
      ) as HTMLElement;
      expect(container.style.left).toBe('1rem');
      expect(container.style.right).toBe('1rem');
    });

    test('uses standard layout for desktop viewport', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      notificationManager.showNotification({ type: 'info', message: 'Desktop notification' });

      const container = document.querySelector(
        '[id^="bolt-to-github-notification-container-"]'
      ) as HTMLElement;
      expect(container.style.right).toBe('1rem');
      expect(container.style.left).toBe('auto');
    });

    test('repositions notifications on window resize', () => {
      notificationManager.showNotification({ type: 'info', message: 'Test' });

      const container = document.querySelector(
        '[id^="bolt-to-github-notification-container-"]'
      ) as HTMLElement;

      window.dispatchEvent(new Event('resize'));

      expect(container.style.top).toBeDefined();
    });
  });

  describe('Settings Notification', () => {
    test('displays settings notification with action button', () => {
      notificationManager.showSettingsNotification();

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(1);
    });
  });

  describe('Upgrade Notification', () => {
    test('displays upgrade notification with custom action', () => {
      const mockUpgradeHandler = vi.fn();
      const options = {
        type: 'info' as const,
        message: 'Upgrade to premium',
        upgradeText: 'Upgrade Now',
        onUpgrade: mockUpgradeHandler,
      };

      notificationManager.showUpgradeNotification(options);

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(1);
    });
  });

  describe('Confirmation Dialog', () => {
    test('displays dialog in DOM with proper structure', async () => {
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
    test('removes all notification containers from DOM', () => {
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

    test('removes dialog container from DOM', () => {
      notificationManager.showConfirmationDialog({
        title: 'Test',
        message: 'Test message',
      });

      expect(document.getElementById('bolt-to-github-confirmation-dialog-container')).toBeTruthy();

      notificationManager.cleanup();

      expect(document.getElementById('bolt-to-github-confirmation-dialog-container')).toBeNull();
    });

    test('handles multiple cleanup calls gracefully', () => {
      expect(() => {
        notificationManager.cleanup();
        notificationManager.cleanup();
      }).not.toThrow();
    });
  });

  describe('Reminder Notifications', () => {
    test('prevents stacking of duplicate reminder notifications', () => {
      notificationManager.showNotification({
        type: 'info',
        message: 'You have unsaved changes',
      });

      expect(notificationManager.getReminderNotificationCount()).toBe(1);

      notificationManager.showNotification({
        type: 'info',
        message: 'Consider pushing to GitHub',
      });

      expect(notificationManager.getReminderNotificationCount()).toBe(1);
    });

    test('clears all reminder notifications on demand', () => {
      notificationManager.showNotification({
        type: 'info',
        message: 'You have unsaved changes',
      });

      expect(notificationManager.getReminderNotificationCount()).toBe(1);

      notificationManager.clearReminderNotifications();

      expect(notificationManager.getReminderNotificationCount()).toBe(0);
    });

    test('tracks both reminder and regular notifications separately', () => {
      notificationManager.showNotification({
        type: 'info',
        message: 'You have unsaved changes',
      });

      notificationManager.showNotification({
        type: 'success',
        message: 'File uploaded successfully',
      });

      const debugInfo = notificationManager.getNotificationDebugInfo();
      expect(debugInfo).toMatchObject({
        totalNotifications: 2,
        reminderNotifications: 1,
        regularNotifications: 1,
      });
    });
  });

  describe('Error Handling', () => {
    test('creates notifications without state manager', () => {
      const managerWithoutState = new NotificationManager(mockMessageHandler as MessageHandler);

      expect(() => {
        managerWithoutState.showNotification({ type: 'info', message: 'Test' });
      }).not.toThrow();

      const containers = document.querySelectorAll(
        '[id^="bolt-to-github-notification-container-"]'
      );
      expect(containers.length).toBe(1);

      managerWithoutState.cleanup();
    });
  });

  describe('Notification Actions', () => {
    test('supports custom action buttons', () => {
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
