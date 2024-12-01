import type { ProcessingStatus } from '$lib/types';
import { SettingsService } from '../services/settings';
import type { MessageHandler } from './MessageHandler';
import UploadStatus from './UploadStatus.svelte';

export class UIManager {
  private static instance: UIManager | null = null;
  private uploadStatusComponent: UploadStatus | null = null;
  private uploadButton: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
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

  private async initializeUI() {
    await this.initializeUploadButton();
    this.initializeUploadStatus();
  }

  private initializeUploadStatus() {
    console.log('Initializing upload status');
    // Clean up existing instance if any
    if (this.uploadStatusComponent) {
      console.log('Destroying existing upload status component');
      this.uploadStatusComponent.$destroy();
      this.uploadStatusComponent = null;
    }

    // Remove existing container if any
    const existingContainer = document.getElementById('bolt-upload-status-container');
    if (existingContainer) {
      console.log('Removing existing upload status container');
      existingContainer.remove();
    }

    // Create new container and component
    const target = document.createElement('div');
    target.id = 'bolt-upload-status-container';
    
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
      target
    });
  }

  private async initializeUploadButton() {
    console.log('Initializing upload button');
    const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');
    if (!buttonContainer || document.querySelector('[data-github-upload]')) {
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
  }

  private createGitHubButton(): HTMLButtonElement {
    console.log('Creating GitHub button');
    const button = document.createElement('button');
    button.setAttribute('data-github-upload', 'true');
    button.setAttribute('data-testid', 'github-upload-button');
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
      'transition-opacity'
    ].join(' ');

    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 2px;">
        <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      GitHub
    `;

    button.addEventListener('click', async () => {
      await this.handleGitHubButtonClick();
    });

    return button;
  }

  private async handleGitHubButtonClick() {
    console.log('Handling GitHub button click');
    const settings = await SettingsService.getGitHubSettings();
    if (!settings.isSettingsValid) {
      this.showSettingsNotification();
      return;
    }

    const { confirmed, commitMessage } = await this.showGitHubConfirmation(settings.gitHubSettings?.projectSettings || {});
    console.log('GitHub confirmation:', { confirmed, commitMessage });
    if (!confirmed) return;

    this.isGitHubUpload = true;
    this.messageHandler.sendCommitMessage(commitMessage || 'Commit from Bolt to GitHub');
    
    // Trigger download
    const downloadBtn = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2 button:first-child') as HTMLButtonElement;
    if (downloadBtn) {
      downloadBtn.click();
    }

    setTimeout(() => {
      this.isGitHubUpload = false;
    }, 1000);
  }

  // Function to show confirmation dialog
  private showGitHubConfirmation = (projectSettings: Record<string, { repoName: string; branch: string }>): Promise<{ confirmed: boolean; commitMessage?: string }> => {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.zIndex = '9999';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      overlay.className = [
        'fixed',
        'inset-0',
        'flex',
        'items-center',
        'justify-center'
      ].join(' ');

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
        'relative'
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
        const commitMessage = (dialog.querySelector('#commit-message') as HTMLInputElement)?.value || 'Commit from Bolt to GitHub';
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
      'text-sm'
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
      chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
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

  public updateUploadStatus(status: ProcessingStatus) {
    if (!this.uploadStatusComponent) {
      this.initializeUploadStatus();
    }
    this.uploadStatusComponent?.$set({status: {status: 'processing'}});  // TODO: Fix this to include message and progress
  }

  public updateButtonState(isValid: boolean) {
    if (this.uploadButton) {
      this.uploadButton.classList.toggle('disabled', !isValid);
      // Update other button states as needed
    }
  }

  private setupClickListeners() {
    let clickSource: HTMLElement | null = null;

    document.addEventListener('click', async (e) => {
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
    }, true);
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
    
    // Create the observer
    this.observer = new MutationObserver(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        const button = document.querySelector('[data-github-upload]');
        const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');
        
        if (!button && buttonContainer) {
          this.initializeUploadButton();
        }
      }, 100);
    });

    // Wait for document.body to be available
    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } else {
      // If body isn't available, wait for it
      document.addEventListener('DOMContentLoaded', () => {
        this.observer?.observe(document.body, {
          childList: true,
          subtree: true
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
    this.uploadButton?.remove();
    this.uploadButton = null;
  }

  public reinitialize() {
    this.cleanup();
    this.initializeUI();
  }
}
