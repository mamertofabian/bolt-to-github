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
    const notification = document.createElement('div');
    notification.style.zIndex = '10000';
    notification.className = [
      'fixed',
      'top-4',
      'right-4',
      'p-4',
      'bg-red-500',
      'text-white',
      'rounded-md',
      'shadow-lg',
      'flex',
      'items-center',
      'gap-2',
      'text-sm',
    ].join(' ');

    // Create icon SVG element
    const iconSvg = document.createElement('svg');
    iconSvg.setAttribute('width', '20');
    iconSvg.setAttribute('height', '20');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor');
    iconSvg.innerHTML = `
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    `;

    // Create text content
    const textSpan = document.createElement('span');
    textSpan.textContent = 'Please configure your GitHub settings first. ';

    // Create settings button
    const settingsButton = document.createElement('button');
    settingsButton.className =
      'text-white font-medium hover:text-white/90 underline underline-offset-2';
    settingsButton.textContent = 'Open Settings';

    // Assemble notification
    notification.appendChild(iconSvg);
    notification.appendChild(textSpan);
    notification.appendChild(settingsButton);

    // Add click handler for settings button
    settingsButton.addEventListener('click', () => {
      this.messageHandler.sendMessage('OPEN_SETTINGS');
      document.body.removeChild(notification);
    });

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.className = 'ml-2 text-white hover:text-white/90 font-medium text-lg leading-none';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => {
      document.body.removeChild(notification);
    });
    notification.appendChild(closeButton);

    // Add to body and remove after 5 seconds
    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 5000);
  }

  /**
   * Show an upgrade notification with a clickable upgrade button
   */
  public showUpgradeNotification(options: UpgradeNotificationOptions): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 10000;
      padding: 1rem;
      background-color: #2563eb;
      color: white;
      border-radius: 8px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      max-width: 24rem;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.4;
    `;

    // Create icon SVG element
    const iconSvg = document.createElement('svg');
    iconSvg.setAttribute('width', '20');
    iconSvg.setAttribute('height', '20');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor');
    iconSvg.setAttribute('stroke-width', '2');
    iconSvg.style.cssText = 'flex-shrink: 0; margin-right: 8px;';
    iconSvg.innerHTML = `
      <circle cx="12" cy="12" r="10"></circle>
      <path d="m9 12 2 2 4-4"></path>
    `;

    // Create main content container
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'display: flex; align-items: flex-start; gap: 8px;';

    // Create text and button container
    const textButtonContainer = document.createElement('div');
    textButtonContainer.style.cssText = 'flex: 1;';

    // Create message text
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = 'margin-bottom: 12px; color: white; line-height: 1.4;';
    messageDiv.textContent = options.message;

    // Create upgrade button
    const upgradeButton = document.createElement('button');
    upgradeButton.style.cssText = `
      background-color: white;
      color: #2563eb;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      transition: background-color 0.2s ease;
      font-family: inherit;
    `;
    upgradeButton.textContent = options.upgradeText || 'Upgrade Now';

    // Add hover effect
    upgradeButton.addEventListener('mouseenter', () => {
      upgradeButton.style.backgroundColor = '#f1f5f9';
    });
    upgradeButton.addEventListener('mouseleave', () => {
      upgradeButton.style.backgroundColor = 'white';
    });

    // Add click handler for upgrade button
    upgradeButton.addEventListener('click', () => {
      if (options.onUpgrade) {
        options.onUpgrade();
      }
      document.body.removeChild(notification);
    });

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.style.cssText = `
      margin-left: 8px;
      color: white;
      background: none;
      border: none;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      line-height: 1;
      padding: 2px 4px;
      flex-shrink: 0;
      opacity: 0.8;
      font-family: inherit;
    `;
    closeButton.textContent = '×';
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.opacity = '1';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.opacity = '0.8';
    });
    closeButton.addEventListener('click', () => {
      document.body.removeChild(notification);
    });

    // Assemble the notification
    textButtonContainer.appendChild(messageDiv);
    textButtonContainer.appendChild(upgradeButton);
    contentDiv.appendChild(iconSvg);
    contentDiv.appendChild(textButtonContainer);
    contentDiv.appendChild(closeButton);
    notification.appendChild(contentDiv);

    // Add to body and remove after duration
    document.body.appendChild(notification);

    const duration = options.duration || 8000;
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, duration);
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

    // Remove any settings notifications
    const settingsNotifications = document.querySelectorAll(
      '[class*="fixed"][class*="top-4"][class*="right-4"]'
    );
    settingsNotifications.forEach((notification) => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });
  }
}
