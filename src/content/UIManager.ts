import type { UploadStatusState } from '$lib/types';
import { SettingsService } from '../services/settings';
import type { MessageHandler } from './MessageHandler';
import UploadStatus from './UploadStatus.svelte';
import Notification from './Notification.svelte';

interface NotificationOptions {
  type: 'info' | 'error' | 'success';
  message: string;
  duration?: number;
}

export class UIManager {
  private static instance: UIManager | null = null;
  private uploadStatusComponent: UploadStatus | null = null;
  private uploadButton: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private notificationComponent: Notification | null = null;
  private isGitLabUpload = false;
  private messageHandler: MessageHandler;

  private constructor(messageHandler: MessageHandler) {
    this.messageHandler = messageHandler;
    this.initializeUI();
    this.setupClickListeners();
    this.setupMutationObserver();
  }

  static getInstance(messageHandler?: MessageHandler): UIManager {
    if (!UIManager.instance && messageHandler) {
      UIManager.instance = new UIManager(messageHandler);
    } else if (!UIManager.instance) {
      throw new Error('UIManager must be initialized with a MessageHandler first');
    }
    return UIManager.instance;
  }

  // Method to explicitly initialize with MessageHandler
  static initialize(messageHandler: MessageHandler): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager(messageHandler);
    }
    return UIManager.instance;
  }

  // Reset instance (useful for testing or cleanup)
  static resetInstance(): void {
    if (UIManager.instance) {
      UIManager.instance.cleanup();
      UIManager.instance = null;
    }
  }

  public showNotification(options: NotificationOptions): void {
    // Cleanup existing notification if any
    this.notificationComponent?.$destroy();

    // Create container for notification
    const container = document.createElement('div');
    container.id = 'bolt-to-gitlab-notification-container';
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
    });
  }

  private async initializeUI() {
    console.log('🔊 Initializing UI');
    await this.initializeUploadButton();
    this.initializeUploadStatus();
  }

  private initializeUploadStatus() {
    console.log('🔊 Initializing upload status');
    // Clean up existing instance if any
    if (this.uploadStatusComponent) {
      console.log('Destroying existing upload status component');
      this.uploadStatusComponent.$destroy();
      this.uploadStatusComponent = null;
    }

    // Remove existing container if any
    const existingContainer = document.getElementById('bolt-to-gitlab-upload-status-container');
    if (existingContainer) {
      console.log('Removing existing upload status container');
      existingContainer.remove();
    }

    // Create new container and component
    const target = document.createElement('div');
    target.id = 'bolt-to-gitlab-upload-status-container';

    // Wait for document.body to be available
    if (document.body) {
      console.log('Appending upload status container to body');
      document.body.appendChild(target);
    } else {
      // If body isn't available, wait for it
      console.log('Waiting for body to be available');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('Appending upload status container to body');
        document.body?.appendChild(target);
      });
    }

    this.uploadStatusComponent = new UploadStatus({
      target,
    });
  }

  private async initializeUploadButton() {
    console.log('🔊 Initializing upload button');
    const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');
    console.log('Button container found:', !!buttonContainer);

    const existingButton = document.querySelector('[data-gitlab-upload]');
    console.log('Existing GitLab button found:', !!existingButton);

    if (!buttonContainer || existingButton) {
      console.log('Exiting initializeUploadButton early');
      return;
    }

    const settings = await SettingsService.getGitLabSettings();
    const button = this.createGitLabButton();
    this.updateButtonState(settings.isSettingsValid);
    this.uploadButton = button;

    const deployButton = buttonContainer.querySelector('button:last-child');
    if (deployButton) {
      deployButton.before(button);
    }

    console.log('Upload button initialized');
  }

  private createGitLabButton(): HTMLButtonElement {
    console.log('Creating GitLab button');
    const button = document.createElement('button');
    button.setAttribute('data-gitlab-upload', 'true');
    button.setAttribute('data-testid', 'gitlab-upload-button');
    button.className = [
      'rounded-md',
      'items-center',
      'justify-center',
      'outline-accent-600',
      'px-3',
      'py-1.25',
      'disabled:cursor-not-allowed',
      'text-xs',
      'bg-bolt-elements-button-secondary-background',
      'text-bolt-elements-button-secondary-text',
      'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover',
      'flex',
      'gap-1.7',
      'transition-opacity',
    ].join(' ');

    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" style="margin-right: 2px;">
        <path fill="currentColor" d="M23.6 9.5L13.3.2c-.4-.4-1.1-.4-1.5 0L8.7 3.3 5.5.2c-.4-.4-1.1-.4-1.5 0l-3.7 3.7c-.4.4-.4 1.1 0 1.5l3.2 3.2-3.2 3.2c-.4.4-.4 1.1 0 1.5l3.7 3.7c.4.4 1.1.4 1.5 0l3.2-3.2 3.2 3.2c.4.4 1.1.4 1.5 0l10.3-10.3c.4-.5.4-1.2 0-1.6zm-15.9 9.9l-3.7-3.7 3.2-3.2 3.7 3.7-3.2 3.2zm5.2-5.2l-3.7-3.7 3.2-3.2 3.7 3.7-3.2 3.2z"/>
      </svg>
      GitLab
    `;

    button.addEventListener('click', async () => {
      await this.handleGitLabButtonClick();
    });

    console.log('GitLab button created');

    return button;
  }

  private async handleGitLabButtonClick() {
    console.log('Handling GitLab button click');
    const settings = await SettingsService.getGitLabSettings();
    if (!settings.isSettingsValid) {
      this.showSettingsNotification();
      return;
    }

    const { confirmed, commitMessage } = await this.showGitLabConfirmation(
      settings.gitLabSettings?.projectSettings || {}
    );
    if (!confirmed) return;

    try {
      // Update button state to processing
      if (this.uploadButton) {
        this.uploadButton.innerHTML = `
          <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Pushing to GitLab...
        `;
        (this.uploadButton as HTMLButtonElement).disabled = true;
      }

      this.isGitLabUpload = true;
      this.messageHandler.sendCommitMessage(commitMessage || 'Commit from Bolt to GitLab');

      await this.findAndClickDownloadButton();
    } catch (error) {
      console.error('Error during GitLab upload:', error);
      throw new Error('Failed to trigger download. The page structure may have changed.');
    }
  }

  private findAndClickExportButton() {
    const exportButton = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]')).find(
      (btn) => btn.textContent?.includes('Export') && btn.querySelector('.i-ph\\:export')
    ) as HTMLButtonElement;

    if (!exportButton) {
      throw new Error('Export button not found');
    }
    console.log('Found export button:', exportButton);

    // Dispatch keydown event to open dropdown
    const keydownEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    exportButton.dispatchEvent(keydownEvent);
    console.log('Dispatched keydown to export button');
  }

  async findAndClickDownloadButton() {
    this.findAndClickExportButton();

    // Wait a bit for the dropdown content to render
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Find the dropdown content
    const dropdownContent = document.querySelector('[role="menu"], [data-radix-menu-content]');
    if (!dropdownContent) {
      throw new Error('Dropdown content not found');
    }

    // Find download button
    const downloadButton = Array.from(dropdownContent.querySelectorAll('button')).find((button) => {
      const hasIcon = button.querySelector('.i-ph\\:download-simple');
      const hasText = button.textContent?.toLowerCase().includes('download');
      return hasIcon || hasText;
    });

    if (!downloadButton) {
      throw new Error('Download button not found in dropdown');
    }

    console.log('Found download button, clicking...');
    downloadButton.click();
  }

  // Function to show confirmation dialog
  private showGitLabConfirmation = (
    projectSettings: Record<string, { repoName: string; branch: string }>
  ): Promise<{ confirmed: boolean; commitMessage?: string }> => {
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
        <h3 class="text-lg font-semibold text-white">Confirm GitLab Upload</h3>
        <p class="text-slate-300 text-sm">Are you sure you want to upload this project to GitLab? <br />
          <span class="font-mono">${projectSettings.repoName} / ${projectSettings.branch}</span>
        </p>
        <div class="mt-4">
          <label for="commit-message" class="block text-sm text-slate-300 mb-2">Commit message (optional)</label>
          <input 
            type="text" 
            id="commit-message" 
            placeholder="Commit from Bolt to GitLab"
            class="w-full px-3 py-2 text-sm rounded-md bg-slate-800 text-white border border-slate-700 focus:border-blue-500 focus:outline-none"
          >
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button class="px-4 py-2 text-sm rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700" id="cancel-upload">
            Cancel
          </button>
          <button class="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700" id="confirm-upload">
            Upload
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
          'Commit from Bolt to GitLab';
        document.body.removeChild(overlay);
        resolve({ confirmed: true, commitMessage });
      });
    });
  };

  // Also update the notification z-index
  private showSettingsNotification = () => {
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

    notification.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>
        Please configure your GitLab settings first. 
        <button class="text-white font-medium hover:text-white/90 underline underline-offset-2" data-testid="open-settings-button">Open Settings</button>
      </span>
    `;

    // Add click handler for settings button
    const settingsButton = notification.querySelector('button');
    settingsButton?.addEventListener('click', () => {
      this.messageHandler.sendMessage('OPEN_SETTINGS');
      document.body.removeChild(notification);
    });

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.className = 'ml-2 text-white hover:text-white/90 font-medium text-lg leading-none';
    closeButton.innerHTML = '×';
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
  };

  public updateUploadStatus(status: UploadStatusState) {
    // console.log('🔊 Updating upload status:', status);
    if (!this.uploadStatusComponent) {
      console.log('🔊 Upload status component not found, initializing');
      this.initializeUploadStatus();
    }

    // console.log('🔊 Setting upload status:', status);
    this.uploadStatusComponent?.$set({ status });

    // Reset GitLab button when upload is complete
    if (status.status !== 'uploading' && this.isGitLabUpload && this.uploadButton) {
      this.isGitLabUpload = false;
      this.uploadButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" style="margin-right: 2px;">
          <path fill="currentColor" d="M23.6 9.5L13.3.2c-.4-.4-1.1-.4-1.5 0L8.7 3.3 5.5.2c-.4-.4-1.1-.4-1.5 0l-3.7 3.7c-.4.4-.4 1.1 0 1.5l3.2 3.2-3.2 3.2c-.4.4-.4 1.1 0 1.5l3.7 3.7c.4.4 1.1.4 1.5 0l3.2-3.2 3.2 3.2c.4.4 1.1.4 1.5 0l10.3-10.3c.4-.5.4-1.2 0-1.6zm-15.9 9.9l-3.7-3.7 3.2-3.2 3.7 3.7-3.2 3.2zm5.2-5.2l-3.7-3.7 3.2-3.2 3.7 3.7-3.2 3.2z"/>
        </svg>
        GitLab
      `;
      (this.uploadButton as HTMLButtonElement).disabled = false;
    }
  }

  public updateButtonState(isValid: boolean) {
    if (this.uploadButton) {
      this.uploadButton.classList.toggle('disabled', !isValid);
      // Update other button states as needed
    }
  }

  private setupClickListeners() {
    let clickSource: HTMLElement | null = null;

    document.addEventListener(
      'click',
      async (e) => {
        const target = e.target as HTMLElement;
        clickSource = target;

        if (target instanceof HTMLElement) {
          const downloadElement = target.closest('a[download], button[download]');
          if (downloadElement) {
            const isFromGitLabButton = target.closest('[data-gitlab-upload]') !== null;

            if (isFromGitLabButton || this.isGitLabUpload) {
              e.preventDefault();
              e.stopPropagation();
              await this.handleDownloadInterception();
            }
          }
        }
      },
      true
    );
  }

  private async handleDownloadInterception() {
    const downloadLinks = document.querySelectorAll('a[download][href^="blob:"]');
    for (const link of Array.from(downloadLinks)) {
      const blobUrl = (link as HTMLAnchorElement).href;
      await this.handleBlobUrl(blobUrl);
    }
  }

  private async handleBlobUrl(blobUrl: string) {
    try {
      const response = await fetch(blobUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const blob = await response.blob();
      const base64data = await this.blobToBase64(blob);

      if (base64data) {
        this.messageHandler.sendZipData(base64data);
      }
    } catch (error) {
      console.error('Error processing blob:', error);
    }
  }

  private blobToBase64(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64data = reader.result?.toString().split(',')[1] || null;
        resolve(base64data);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  private setupMutationObserver() {
    let timeoutId: number;
    let retryCount = 0;
    const maxRetries = 3;

    const attemptInitialization = () => {
      const button = document.querySelector('[data-gitlab-upload]');
      const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');

      if (!button && buttonContainer) {
        this.initializeUploadButton();
        retryCount = 0; // Reset count on success
      } else if (!buttonContainer && retryCount < maxRetries) {
        retryCount++;
        timeoutId = window.setTimeout(attemptInitialization, 1000); // 1 second between retries
      } else if (retryCount >= maxRetries) {
        this.showNotification({
          type: 'error',
          message:
            'Failed to initialize GitLab upload button. Please try to refresh the page. If the issue persists, please submit an issue on GitLab.',
          duration: 7000,
        });
        retryCount = 0; // Reset for future attempts
      }
    };

    this.observer = new MutationObserver(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(attemptInitialization, 500);
    });

    // Wait for document.body to be available
    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      // If body isn't available, wait for it
      document.addEventListener('DOMContentLoaded', () => {
        this.observer?.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
    }
  }

  public cleanup() {
    this.observer?.disconnect();
    if (this.uploadStatusComponent) {
      this.uploadStatusComponent.$destroy();
      this.uploadStatusComponent = null;
    }
    if (this.notificationComponent) {
      this.notificationComponent.$destroy();
      this.notificationComponent = null;
    }
    this.uploadButton?.remove();
    this.uploadButton = null;

    // Clean up notification container if it exists
    const notificationContainer = document.getElementById('bolt-to-gitlab-notification-container');
    notificationContainer?.remove();
  }

  public reinitialize() {
    console.log('🔊 Reinitializing UI manager');
    this.cleanup();
    this.initializeUI();
  }
}
