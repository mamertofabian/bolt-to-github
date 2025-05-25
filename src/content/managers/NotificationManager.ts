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

/**
 * NotificationManager handles all notification-related functionality
 * Previously part of UIManager
 */
export class NotificationManager implements INotificationManager {
  private notificationComponent: SvelteComponent | null = null;
  private messageHandler: MessageHandler;
  private stateManager?: UIStateManager;

  constructor(messageHandler: MessageHandler, stateManager?: UIStateManager) {
    this.messageHandler = messageHandler;
    this.stateManager = stateManager;
  }

  /**
   * Show a notification with the given options
   * Replaces the previous showNotification method from UIManager
   */
  public showNotification(options: NotificationOptions): void {
    // Cleanup existing notification if any
    this.notificationComponent?.$destroy();

    // Create container for notification
    const container = document.createElement('div');
    container.id = 'bolt-to-github-notification-container';
    document.body.appendChild(container);

    // Create new notification component
    this.notificationComponent = new Notification({
      target: container,
      props: {
        type: options.type,
        message: options.message,
        duration: options.duration || 5000,
        actions: options.actions || [],
        onClose: () => {
          this.notificationComponent?.$destroy();
          this.notificationComponent = null;
          container.remove();
        },
      },
    }) as SvelteComponent;
  }

  /**
   * Show a confirmation dialog for GitHub uploads
   * Replaces the previous showGitHubConfirmation method from UIManager
   */
  public showConfirmationDialog(options: ConfirmationOptions): Promise<ConfirmationResult> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.zIndex = '9999';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      overlay.className = ['fixed', 'inset-0', 'flex', 'items-center', 'justify-center'].join(' ');

      const dialog = document.createElement('div');
      dialog.style.zIndex = '10000';
      dialog.style.width = '320px'; // Set fixed width
      dialog.style.backgroundColor = '#0f172a'; // Match bg-slate-900
      dialog.className = [
        'p-6',
        'rounded-lg',
        'shadow-xl',
        'mx-4',
        'space-y-4',
        'border',
        'border-slate-700',
        'relative',
      ].join(' ');

      dialog.innerHTML = `
        <h3 class="text-lg font-semibold text-white">${options.title}</h3>
        <p class="text-slate-300 text-sm">${options.message}</p>
        <div class="mt-4">
          <label for="commit-message" class="block text-sm text-slate-300 mb-2">Commit message (optional)</label>
          <input 
            type="text" 
            id="commit-message" 
            placeholder="Commit from Bolt to GitHub"
            class="w-full px-3 py-2 text-sm rounded-md bg-slate-800 text-white border border-slate-700 focus:border-blue-500 focus:outline-none"
          >
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button class="px-4 py-2 text-sm rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700" id="cancel-upload">
            ${options.cancelText || 'Cancel'}
          </button>
          <button class="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700" id="confirm-upload">
            ${options.confirmText || 'Confirm'}
          </button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Handle clicks
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve({ confirmed: false });
        }
      });

      dialog.querySelector('#cancel-upload')?.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve({ confirmed: false });
      });

      dialog.querySelector('#confirm-upload')?.addEventListener('click', () => {
        const commitMessage =
          (dialog.querySelector('#commit-message') as HTMLInputElement)?.value ||
          'Commit from Bolt to GitHub';
        document.body.removeChild(overlay);
        resolve({ confirmed: true, commitMessage });
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
    // Cleanup notification component
    if (this.notificationComponent) {
      this.notificationComponent.$destroy();
      this.notificationComponent = null;
    }

    // Remove notification container if it exists
    const container = document.getElementById('bolt-to-github-notification-container');
    if (container) {
      container.remove();
    }
  }
}
