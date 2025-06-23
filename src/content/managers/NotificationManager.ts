import type {
  NotificationOptions,
  UpgradeNotificationOptions,
  ConfirmationOptions,
  ConfirmationResult,
  SvelteComponent,
} from '../types/UITypes';
import type { INotificationManager } from '../types/ManagerInterfaces';
import type { MessageHandler } from '../MessageHandler';
import type { UIStateManager } from '../services/UIStateManager';
import Notification from '../Notification.svelte';
import { EnhancedConfirmationDialog } from '../../lib/components/ui/dialog';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('NotificationManager');

interface NotificationInstance {
  component: SvelteComponent;
  container: HTMLElement;
  id: string;
  type?: 'reminder' | 'regular'; // Track notification type
  message?: string; // Track message for identification
}

/**
 * NotificationManager handles all notification-related functionality
 * Previously part of UIManager
 */
export class NotificationManager implements INotificationManager {
  private notifications: NotificationInstance[] = [];
  private messageHandler: MessageHandler;
  private stateManager?: UIStateManager;
  private notificationCounter = 0;
  private resizeListener?: () => void;

  constructor(messageHandler: MessageHandler, stateManager?: UIStateManager) {
    this.messageHandler = messageHandler;
    this.stateManager = stateManager;

    // Add resize listener for responsive updates
    this.resizeListener = () => this.updateNotificationPositions();
    window.addEventListener('resize', this.resizeListener);
  }

  /**
   * Show a notification with the given options
   * Replaces the previous showNotification method from UIManager
   */
  public showNotification(options: NotificationOptions): void {
    const notificationId = `notification-${++this.notificationCounter}`;

    // Check if this is a reminder notification
    const isReminderNotification =
      options.message.includes('unsaved changes') ||
      options.message.includes('Consider pushing to GitHub');

    // Remove existing reminder notifications before showing a new one
    if (isReminderNotification) {
      this.removeExistingReminderNotifications();
    }

    // Create container for notification
    const container = document.createElement('div');
    container.id = `bolt-to-github-notification-container-${notificationId}`;
    container.style.position = 'fixed';
    container.style.top = this.calculateNotificationTop() + 'px';
    container.style.right = '1rem';
    container.style.zIndex = '10002';
    container.style.pointerEvents = 'none';

    // Handle mobile responsiveness
    if (window.innerWidth <= 640) {
      container.style.left = '1rem';
      container.style.right = '1rem';
    }

    document.body.appendChild(container);

    // Create new notification component
    const notificationComponent = new Notification({
      target: container,
      props: {
        type: options.type,
        message: options.message,
        duration: options.duration || 5000,
        actions: options.actions || [],
        onClose: () => {
          this.removeNotification(notificationId);
        },
      },
    }) as SvelteComponent;

    // Store the notification instance
    const notificationInstance: NotificationInstance = {
      component: notificationComponent,
      container: container,
      id: notificationId,
      type: isReminderNotification ? 'reminder' : 'regular',
      message: options.message,
    };

    this.notifications.push(notificationInstance);

    // Update positions of all notifications
    this.updateNotificationPositions();
  }

  /**
   * Calculate the top position for a new notification
   */
  private calculateNotificationTop(): number {
    const baseTop = 16; // 1rem in pixels
    const notificationHeight = 88; // Increased height to account for enhanced styling
    const gap = 12; // Increased gap for better visual separation

    return baseTop + this.notifications.length * (notificationHeight + gap);
  }

  /**
   * Update positions of all notifications to maintain proper stacking
   */
  private updateNotificationPositions(): void {
    const baseTop = 16; // 1rem in pixels
    const notificationHeight = 88; // Increased height to account for enhanced styling
    const gap = 12; // Increased gap for better visual separation

    this.notifications.forEach((notification, index) => {
      const top = baseTop + index * (notificationHeight + gap);
      notification.container.style.top = top + 'px';

      // Update mobile responsiveness for existing notifications
      if (window.innerWidth <= 640) {
        notification.container.style.left = '1rem';
        notification.container.style.right = '1rem';
      } else {
        notification.container.style.left = 'auto';
        notification.container.style.right = '1rem';
      }
    });
  }

  /**
   * Remove a specific notification by ID
   */
  private removeNotification(notificationId: string): void {
    const index = this.notifications.findIndex((n) => n.id === notificationId);
    if (index === -1) return;

    const notification = this.notifications[index];

    // Destroy the component and remove the container
    notification.component.$destroy();
    notification.container.remove();

    // Remove from array
    this.notifications.splice(index, 1);

    // Update positions of remaining notifications
    this.updateNotificationPositions();
  }

  /**
   * Show a confirmation dialog for GitHub uploads
   * Replaces the previous showGitHubConfirmation method from UIManager
   */
  public showConfirmationDialog(options: ConfirmationOptions): Promise<ConfirmationResult> {
    return new Promise((resolve) => {
      // Create container for the enhanced dialog
      const container = document.createElement('div');
      container.id = 'bolt-to-github-confirmation-dialog-container';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.zIndex = '2147483646';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);

      // Create the enhanced confirmation dialog component
      const dialogComponent = new EnhancedConfirmationDialog({
        target: container,
        props: {
          show: true,
          title: options.title,
          message: options.message,
          confirmText: options.confirmText || 'Push to GitHub',
          cancelText: options.cancelText || 'Cancel',
          placeholder: options.placeholder || 'Commit from Bolt to GitHub',
          showFilePreview: options.showFilePreview || false,
          fileChangesSummary: options.fileChangesSummary || null,
          commitMessageTemplates: options.commitMessageTemplates || [],
          isLoading: false,
          repoInfo: options.repoInfo || null,
        },
      }) as SvelteComponent;

      // Handle dialog events
      dialogComponent.$on?.('confirm', (event: CustomEvent<{ commitMessage: string }>) => {
        dialogComponent.$destroy();
        container.remove();
        resolve({ confirmed: true, commitMessage: event.detail.commitMessage });
      });

      dialogComponent.$on?.('cancel', () => {
        dialogComponent.$destroy();
        container.remove();
        resolve({ confirmed: false });
      });
    });
  }

  /**
   * Show settings notification when GitHub settings are not configured
   * Replaces the previous showSettingsNotification method from UIManager
   */
  public showSettingsNotification(): void {
    // Use the unified Svelte notification component instead of direct DOM manipulation
    this.showNotification({
      type: 'error',
      message: 'Please configure your GitHub settings first.',
      duration: 5000,
      actions: [
        {
          text: 'Open Settings',
          variant: 'primary',
          action: () => {
            this.messageHandler.sendMessage('OPEN_SETTINGS');
          },
        },
      ],
    });
  }

  /**
   * Show an upgrade notification with a clickable upgrade button
   */
  public showUpgradeNotification(options: UpgradeNotificationOptions): void {
    // Use the unified Svelte notification component instead of direct DOM manipulation
    this.showNotification({
      type: options.type || 'info',
      message: options.message,
      duration: options.duration || 8000,
      actions: [
        {
          text: options.upgradeText || 'Upgrade Now',
          variant: 'primary',
          action: () => {
            if (options.onUpgrade) {
              options.onUpgrade();
            }
          },
        },
      ],
    });
  }

  /**
   * Cleanup all notification components and resources
   */
  public cleanup(): void {
    const debugInfo = this.getNotificationDebugInfo();
    logger.info('🧹 NotificationManager cleanup:', debugInfo);

    // Cleanup all notification components
    this.notifications.forEach((notification) => {
      notification.component.$destroy();
      notification.container.remove();
    });
    this.notifications = [];

    // Remove resize listener
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = undefined;
    }

    // Remove confirmation dialog container if it exists
    const dialogContainer = document.getElementById('bolt-to-github-confirmation-dialog-container');
    if (dialogContainer) {
      dialogContainer.remove();
    }
  }

  /**
   * Remove all existing reminder notifications to prevent stacking
   */
  private removeExistingReminderNotifications(): void {
    const reminderNotifications = this.notifications.filter((n) => n.type === 'reminder');

    if (reminderNotifications.length > 0) {
      logger.info(
        `🧹 Removing ${reminderNotifications.length} existing reminder notification(s) to prevent stacking`
      );

      reminderNotifications.forEach((notification) => {
        this.removeNotification(notification.id);
      });
    }
  }

  /**
   * Manually clear all reminder notifications (public method)
   */
  public clearReminderNotifications(): void {
    this.removeExistingReminderNotifications();
  }

  /**
   * Get the count of active reminder notifications
   */
  public getReminderNotificationCount(): number {
    return this.notifications.filter((n) => n.type === 'reminder').length;
  }

  /**
   * Get debug information about active notifications
   */
  public getNotificationDebugInfo(): object {
    return {
      totalNotifications: this.notifications.length,
      reminderNotifications: this.notifications.filter((n) => n.type === 'reminder').length,
      regularNotifications: this.notifications.filter((n) => n.type === 'regular').length,
      notifications: this.notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message?.substring(0, 50) + (n.message && n.message.length > 50 ? '...' : ''),
      })),
    };
  }
}
