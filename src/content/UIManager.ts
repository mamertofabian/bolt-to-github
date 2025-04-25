import type { UploadStatusState } from '$lib/types';
import { SettingsService } from '../services/settings';
import type { MessageHandler } from './MessageHandler';
import UploadStatus from './UploadStatus.svelte';
import Notification from './Notification.svelte';

// Define proper types for Svelte components
type SvelteComponent = {
  $set: (props: Record<string, any>) => void;
  $destroy: () => void;
};

interface NotificationOptions {
  type: 'info' | 'error' | 'success';
  message: string;
  duration?: number;
}

export class UIManager {
  private static instance: UIManager | null = null;
  private uploadStatusComponent: SvelteComponent | null = null;
  private uploadButton: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private notificationComponent: SvelteComponent | null = null;
  private isGitHubUpload = false;
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
    const existingContainer = document.getElementById('bolt-to-github-upload-status-container');
    if (existingContainer) {
      console.log('Removing existing upload status container');
      existingContainer.remove();
    }

    // Create new container and component
    const target = document.createElement('div');
    target.id = 'bolt-to-github-upload-status-container';
    target.style.zIndex = '10000'; // Ensure high z-index

    const initComponent = () => {
      if (!document.body.contains(target)) {
        console.log('Appending upload status container to body');
        document.body.appendChild(target);
      }

      this.uploadStatusComponent = new UploadStatus({
        target,
      }) as SvelteComponent;

      // Initialize with idle state to ensure component is properly mounted
      this.updateUploadStatus({
        status: 'idle',
        progress: 0,
        message: '',
      });
    };

    // Wait for document.body to be available
    if (document.body) {
      initComponent();
    } else {
      // If body isn't available, wait for it
      console.log('Waiting for body to be available');
      document.addEventListener('DOMContentLoaded', initComponent);
    }
  }

  private async initializeUploadButton() {
    console.log('🔊 Initializing upload button');
    const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');
    console.log('Button container found:', !!buttonContainer);

    const existingButton = document.querySelector('[data-github-upload]');
    console.log('Existing GitHub button found:', !!existingButton);

    if (!buttonContainer || existingButton) {
      console.log('Exiting initializeUploadButton early');
      return;
    }

    const settings = await SettingsService.getGitHubSettings();
    const button = this.createGitHubButton();
    this.updateButtonState(settings.isSettingsValid);
    this.uploadButton = button;

    const deployButton = buttonContainer.querySelector('button:last-child');
    if (deployButton) {
      deployButton.before(button);
    }

    console.log('Upload button initialized');
  }

  private createGitHubButton(): HTMLButtonElement {
    console.log('Creating GitHub button');
    const button = document.createElement('button');
    button.setAttribute('data-github-upload', 'true');
    button.setAttribute('data-testid', 'github-upload-button');
    button.setAttribute('aria-haspopup', 'menu');
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
      <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 2px;">
        <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      GitHub
      <svg width="12" height="12" viewBox="0 0 24 24" style="margin-left: 2px;">
        <path fill="currentColor" d="M7 10l5 5 5-5z"/>
      </svg>
    `;

    button.addEventListener('click', async () => {
      await this.handleGitHubDropdownClick(button);
    });

    console.log('GitHub button created');

    return button;
  }

  private async handleGitHubDropdownClick(button: HTMLButtonElement) {
    console.log('Handling GitHub dropdown click');

    // Dispatch keydown event to open dropdown
    const keydownEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(keydownEvent);
    console.log('Dispatched keydown to GitHub button');

    // Wait a bit for the dropdown content to render
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create dropdown content if it doesn't exist
    let dropdownContent = document.querySelector('#github-dropdown-content') as HTMLElement;
    if (!dropdownContent) {
      dropdownContent = this.createGitHubDropdownContent();
      document.body.appendChild(dropdownContent);

      // Position the dropdown below the button
      const buttonRect = button.getBoundingClientRect();
      dropdownContent.style.position = 'absolute';
      dropdownContent.style.top = `${buttonRect.bottom + window.scrollY}px`;
      dropdownContent.style.left = `${buttonRect.left + window.scrollX}px`;
      dropdownContent.style.zIndex = '9999';
    } else {
      dropdownContent.style.display = 'block';
    }

    // Add click event listener to close dropdown when clicking outside
    const closeDropdown = (e: MouseEvent) => {
      if (
        e.target !== button &&
        e.target !== dropdownContent &&
        !dropdownContent?.contains(e.target as Node)
      ) {
        (dropdownContent as HTMLElement).style.display = 'none';
        document.removeEventListener('click', closeDropdown);
      }
    };

    // Add the event listener with a slight delay to avoid immediate closing
    setTimeout(() => {
      document.addEventListener('click', closeDropdown);
    }, 100);
  }

  private createGitHubDropdownContent(): HTMLElement {
    const dropdownContent = document.createElement('div');
    dropdownContent.id = 'github-dropdown-content';
    dropdownContent.setAttribute('role', 'menu');
    dropdownContent.className = [
      'rounded-md',
      'shadow-lg',
      'overflow-hidden',
      'min-w-[180px]',
      'animate-fadeIn',
    ].join(' ');

    // Add some custom styles for animation and better appearance
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fadeIn {
        animation: fadeIn 0.2s ease-out forwards;
      }
      #github-dropdown-content {
        background-color: #1a1a1a; /* Match the Export dropdown background */
        border: none;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      }
      #github-dropdown-content button {
        color: #ffffff;
        padding: 8px 16px;
        width: 100%;
        text-align: left;
        border: none;
        background: transparent;
        font-size: 12px;
      }
      #github-dropdown-content button:hover {
        background-color: #333333; /* Match the Export dropdown hover state */
      }
      #github-dropdown-content button svg {
        transition: transform 0.15s ease;
        margin-right: 8px;
      }
      #github-dropdown-content button:hover svg {
        transform: scale(1.05);
      }
      /* Remove border between items to match Export dropdown */
      #github-dropdown-content button:first-child {
        border-bottom: none;
      }
    `;
    document.head.appendChild(style);

    // Push option
    const pushButton = document.createElement('button');
    pushButton.className = 'dropdown-item flex items-center';
    pushButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
      <span>Push to GitHub</span>
    `;
    pushButton.addEventListener('click', async () => {
      (dropdownContent as HTMLElement).style.display = 'none';
      await this.handleGitHubPushAction();
    });

    // Settings option
    const settingsButton = document.createElement('button');
    settingsButton.className = 'dropdown-item flex items-center';
    settingsButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span>Settings</span>
    `;
    settingsButton.addEventListener('click', () => {
      (dropdownContent as HTMLElement).style.display = 'none';
      // Directly send the OPEN_SETTINGS message instead of showing the notification
      this.messageHandler.sendMessage('OPEN_SETTINGS');
    });

    dropdownContent.appendChild(pushButton);
    dropdownContent.appendChild(settingsButton);

    return dropdownContent;
  }

  private async handleGitHubPushAction() {
    console.log('Handling GitHub push action');
    const settings = await SettingsService.getGitHubSettings();
    if (!settings.isSettingsValid) {
      this.showSettingsNotification();
      return;
    }

    const { confirmed, commitMessage } = await this.showGitHubConfirmation(
      settings.gitHubSettings?.projectSettings || {}
    );
    if (!confirmed) return;

    try {
      // Trigger the download button click
      await this.findAndClickDownloadButton();

      // Update button state to processing
      if (this.uploadButton) {
        this.uploadButton.innerHTML = `
          <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Pushing to GitHub...
          <svg width="12" height="12" viewBox="0 0 24 24" style="margin-left: 2px;">
            <path fill="currentColor" d="M7 10l5 5 5-5z"/>
          </svg>
        `;
        (this.uploadButton as HTMLButtonElement).disabled = true;
      }

      this.isGitHubUpload = true;
      this.messageHandler.sendCommitMessage(commitMessage || 'Commit from Bolt to GitHub');

      // We don't need to call findAndClickDownloadButton again
      // The download process is already triggered by the first call
    } catch (error) {
      console.error('Error during GitHub upload:', error);
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
    try {
      // Try to find and click the export button
      this.findAndClickExportButton();

      // Wait for the dropdown content to render with increasing timeouts
      let attempts = 0;
      const maxAttempts = 3;
      let exportDropdown = null;

      while (attempts < maxAttempts && !exportDropdown) {
        // Increase wait time with each attempt
        const waitTime = 200 * (attempts + 1);
        console.log(
          `Waiting ${waitTime}ms for dropdown to appear (attempt ${attempts + 1}/${maxAttempts})`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Find all dropdowns
        const allDropdowns = Array.from(
          document.querySelectorAll('[role="menu"], [data-radix-menu-content]')
        );
        console.log('Found dropdowns:', allDropdowns.length);

        if (allDropdowns.length === 0) {
          console.log('No dropdowns found, will retry');
          attempts++;
          continue;
        }

        // Find the dropdown that contains download-related buttons
        exportDropdown = allDropdowns.find((dropdown) => {
          const buttons = dropdown.querySelectorAll('button');
          console.log('Checking dropdown with buttons:', buttons.length);

          // Check if any button in this dropdown has download text or icon
          return Array.from(buttons).some((button) => {
            const hasDownloadText = button.textContent?.toLowerCase().includes('download');
            const hasDownloadIcon = button.querySelector('[class*="i-ph:download-simple"]');
            return hasDownloadText || hasDownloadIcon;
          });
        });

        if (!exportDropdown) {
          console.log('No export dropdown found in this attempt, will retry');
          attempts++;
        }
      }

      if (!exportDropdown) {
        throw new Error('Export dropdown content not found after multiple attempts');
      }
      console.log('Found export dropdown:', exportDropdown);

      // Find download button within the identified export dropdown
      const downloadButton = Array.from(exportDropdown.querySelectorAll('button')).find(
        (button) => {
          // Search for the icon class anywhere within the button's descendants
          const hasIcon = button.querySelector('[class*="i-ph:download-simple"]');
          const hasText = button.textContent?.toLowerCase().includes('download');
          return hasIcon || hasText;
        }
      );

      if (!downloadButton) {
        throw new Error('Download button not found in dropdown');
      }

      console.log('Found download button, clicking...');
      downloadButton.click();

      // Close the dropdown by clicking outside or pressing Escape
      setTimeout(() => {
        try {
          console.log('Closing export dropdown...');
          // Method 1: Try to dispatch Escape key to close the dropdown
          const escapeEvent = new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(escapeEvent);

          // Method 2: As a fallback, click outside the dropdown
          setTimeout(() => {
            // If dropdown is still open, click on the body element to close it
            const dropdowns = document.querySelectorAll('[role="menu"], [data-radix-menu-content]');
            if (dropdowns.length > 0) {
              console.log('Dropdown still open, clicking outside to close it');
              // Click in an empty area of the page
              const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
              });
              document.body.dispatchEvent(clickEvent);
            }
          }, 100);
        } catch (closeError) {
          console.warn('Error while trying to close dropdown:', closeError);
          // Non-critical error, don't throw
        }
      }, 300); // Wait a bit after clicking the download button
    } catch (error) {
      console.error('Error finding or clicking download button:', error);
      throw error; // Re-throw to allow caller to handle
    }
  }

  // Function to show confirmation dialog
  private showGitHubConfirmation = (
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
        <h3 class="text-lg font-semibold text-white">Confirm GitHub Upload</h3>
        <p class="text-slate-300 text-sm">Are you sure you want to upload this project to GitHub? <br />
          <span class="font-mono">${projectSettings.repoName} / ${projectSettings.branch}</span>
        </p>
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
          'Commit from Bolt to GitHub';
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
        Please configure your GitHub settings first. 
        <button class="text-white font-medium hover:text-white/90 underline underline-offset-2">Open Settings</button>
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
    console.log('🔊 Updating upload status:', status);

    // If component doesn't exist, initialize it first
    if (!this.uploadStatusComponent) {
      console.log('🔊 Upload status component not found, initializing');
      this.initializeUploadStatus();

      // Add a small delay to ensure component is mounted before updating
      setTimeout(() => {
        this.updateUploadStatusInternal(status);
      }, 50);
      return;
    }

    this.updateUploadStatusInternal(status);
  }

  private updateUploadStatusInternal(status: UploadStatusState) {
    // Ensure the container is visible in the DOM
    const container = document.getElementById('bolt-to-github-upload-status-container');
    if (!container || !document.body.contains(container)) {
      console.log('🔊 Upload status container not in DOM, reinitializing');
      this.initializeUploadStatus();
    }

    console.log('🔊 Setting upload status:', status);

    // Force a small delay to ensure component is ready
    setTimeout(() => {
      this.uploadStatusComponent?.$set({ status });
    }, 0);

    // Reset GitHub button when upload is complete
    if (status.status !== 'uploading' && this.isGitHubUpload && this.uploadButton) {
      this.isGitHubUpload = false;
      this.uploadButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 2px;">
          <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        GitHub
        <svg width="12" height="12" viewBox="0 0 24 24" style="margin-left: 2px;">
          <path fill="currentColor" d="M7 10l5 5 5-5z"/>
        </svg>
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
            const isFromGitHubButton = target.closest('[data-github-upload]') !== null;

            if (isFromGitHubButton || this.isGitHubUpload) {
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
      const button = document.querySelector('[data-github-upload]');
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
            'Failed to initialize GitHub upload button. Please try to refresh the page. If the issue persists, please submit an issue on GitHub.',
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
    const notificationContainer = document.getElementById('bolt-to-github-notification-container');
    notificationContainer?.remove();
  }

  public reinitialize() {
    console.log('🔊 Reinitializing UI manager');
    this.cleanup();
    this.initializeUI();
  }
}
