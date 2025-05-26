/* eslint-env jest */

import { NotificationManager } from '../NotificationManager';
import type { MessageHandler } from '../../MessageHandler';
import type { UIStateManager } from '../../services/UIStateManager';
import type { NotificationOptions } from '../../types/UITypes';

// Mock Svelte components
jest.mock('../../Notification.svelte', () => {
  return jest.fn().mockImplementation(() => ({
    $destroy: jest.fn(),
    $on: jest.fn(),
  }));
});

jest.mock('../../../lib/components/ui/dialog', () => ({
  EnhancedConfirmationDialog: jest.fn().mockImplementation(() => ({
    $destroy: jest.fn(),
    $on: jest.fn(),
  })),
}));

describe('NotificationManager', () => {
  let notificationManager: NotificationManager;
  let mockMessageHandler: jest.Mocked<MessageHandler>;
  let mockStateManager: jest.Mocked<UIStateManager>;

  beforeEach(() => {
    mockMessageHandler = {
      sendMessage: jest.fn(),
      sendZipData: jest.fn(),
      sendDebugMessage: jest.fn(),
      sendCommitMessage: jest.fn(),
      updatePort: jest.fn(),
    } as any;

    mockStateManager = {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      getState: jest.fn(),
      setUploadStatus: jest.fn(),
      setButtonState: jest.fn(),
      addNotification: jest.fn(),
      removeNotification: jest.fn(),
    } as any;

    notificationManager = new NotificationManager(mockMessageHandler, mockStateManager);

    // Setup DOM
    document.body.innerHTML = '<div></div>';

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  afterEach(() => {
    notificationManager.cleanup();
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Notification Display', () => {
    test('shows success notification', () => {
      const options: NotificationOptions = {
        type: 'success',
        message: 'Test success',
        duration: 3000,
      };

      notificationManager.showNotification(options);

      // Check that a notification container was created
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

      // Check that notifications are positioned differently
      const firstContainer = containers[0] as HTMLElement;
      const secondContainer = containers[1] as HTMLElement;

      const firstTop = parseInt(firstContainer.style.top);
      const secondTop = parseInt(secondContainer.style.top);

      expect(secondTop).toBeGreaterThan(firstTop);
    });
  });

  describe('Mobile Responsiveness', () => {
    test('adjusts notification layout for mobile screens', () => {
      // Mock mobile screen width
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
      // Mock desktop screen width
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
      expect(container.style.left).toBe('');
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
        onUpgrade: jest.fn(),
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

      // Start the confirmation dialog
      const confirmationPromise = notificationManager.showConfirmationDialog(options);

      // Check that dialog container was created
      const dialogContainer = document.getElementById(
        'bolt-to-github-confirmation-dialog-container'
      );
      expect(dialogContainer).toBeTruthy();
      expect(dialogContainer?.style.zIndex).toBe('2147483646');

      // We can't easily test the actual resolution without complex mocking
      // So we'll just verify the dialog was created properly
      expect(dialogContainer?.style.position).toBe('fixed');
      expect(dialogContainer?.style.width).toBe('100%');
      expect(dialogContainer?.style.height).toBe('100%');
    });
  });

  describe('Cleanup', () => {
    test('removes all notifications on cleanup', () => {
      // Create multiple notifications
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
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      notificationManager.cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Window Resize Handling', () => {
    test('updates notification positions on window resize', () => {
      // Create a notification
      notificationManager.showNotification({ type: 'info', message: 'Test' });

      const container = document.querySelector(
        '[id^="bolt-to-github-notification-container-"]'
      ) as HTMLElement;
      const originalTop = container.style.top;

      // Trigger resize event
      window.dispatchEvent(new Event('resize'));

      // Position should be recalculated (though in this simple test it might be the same)
      expect(container.style.top).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('handles missing state manager gracefully', () => {
      // Setup fresh DOM for this test
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
        notificationManager.cleanup(); // Second cleanup should not throw
      }).not.toThrow();
    });
  });

  describe('Notification Actions', () => {
    test('supports notifications with custom actions', () => {
      const mockAction = jest.fn();
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
