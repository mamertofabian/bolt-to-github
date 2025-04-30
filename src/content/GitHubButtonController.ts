import type {
  IContentNotificationRenderer,
  IContentUIElementFactory,
  IGitHubButtonController,
} from './interfaces/ContentUIInterfaces';
import type { MessageHandler } from './MessageHandler';
import { SettingsService } from '../services/settings';
import { DownloadService } from '../services/DownloadService';
import { FilePreviewService } from '../services/FilePreviewService';
import type { ChromeStorageAdapter } from '../services/interfaces/ChromeStorageAdapter';
import { DefaultChromeStorageAdapter } from '../services/interfaces/ChromeStorageAdapter';
import { GitHubService } from '../services/GitHubService';

export class GitHubButtonController implements IGitHubButtonController {
  private uploadButton: HTMLButtonElement | null = null;
  private observer: MutationObserver | null = null;
  private isGitHubUpload = false;
  private isInitialized = false; // Flag to track button initialization
  private messageHandler: MessageHandler;
  private elementFactory: IContentUIElementFactory;
  private notificationRenderer: IContentNotificationRenderer;
  private downloadService: DownloadService;
  private filePreviewService: FilePreviewService;
  private chromeStorage: ChromeStorageAdapter;

  constructor(
    messageHandler: MessageHandler,
    elementFactory: IContentUIElementFactory,
    notificationRenderer: IContentNotificationRenderer,
    chromeStorage?: ChromeStorageAdapter
  ) {
    this.messageHandler = messageHandler;
    this.elementFactory = elementFactory;
    this.notificationRenderer = notificationRenderer;
    this.downloadService = new DownloadService();
    this.filePreviewService = FilePreviewService.getInstance();
    this.chromeStorage = chromeStorage || new DefaultChromeStorageAdapter();
    this.setupMutationObserver();
  }

  public async initializeButton(): Promise<void> {
    // Check for existing button first - don't reinitialize if it exists
    const existingButton = document.querySelector('[data-github-upload]');
    if (existingButton) {
      this.uploadButton = existingButton as HTMLButtonElement;
      this.isInitialized = true; // Mark as initialized
      return;
    }

    // Try multiple possible selectors to find the button container
    const buttonContainers = [
      document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2'),
      document.querySelector('div.flex.grow-1 div.flex.gap-2'),
      // More generic selector that might catch UI changes
      document.querySelector('div[class*="grow-1"] div[class*="flex"][class*="gap"]'),
      // Last resort: try to find something close to where the button should be
      document.querySelector('div.flex div.flex.gap-2'),
    ].filter(Boolean); // Remove null values

    const buttonContainer = buttonContainers[0];
    if (!buttonContainer) {
      return;
    }

    try {
      const settings = await SettingsService.getGitHubSettings();
      const button = this.elementFactory.createUploadButton();
      this.updateButtonState(settings.isSettingsValid);
      this.uploadButton = button;

      // Add click handler to the button
      button.addEventListener('click', async () => {
        await this.handleGitHubDropdownClick(button);
      });

      const deployButton = buttonContainer.querySelector('button:last-child');
      if (deployButton) {
        deployButton.before(button);
      } else {
        // Fallback: just append to the container if we can't find the deploy button
        buttonContainer.appendChild(button);
      }

      this.isInitialized = true; // Mark as initialized
    } catch (error) {
      console.error('Error initializing button:', error);
      this.notificationRenderer.renderNotification({
        type: 'error',
        message: `Failed to initialize GitHub button: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });
    }
  }

  private async handleGitHubDropdownClick(button: HTMLButtonElement) {
    // Dispatch keydown event to open dropdown
    const keydownEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(keydownEvent);

    // Wait a bit for the dropdown content to render
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create dropdown content if it doesn't exist
    let dropdownContent = document.querySelector('#github-dropdown-content') as HTMLElement;
    if (!dropdownContent) {
      dropdownContent = this.elementFactory.createGitHubDropdown();
      document.body.appendChild(dropdownContent);
      // Set initial position (will be updated below)
      dropdownContent.style.position = 'fixed';
      dropdownContent.style.zIndex = '9999';

      // Add event listeners to dropdown buttons
      const pushButton = dropdownContent.querySelector('.dropdown-item:nth-child(1)');
      if (pushButton) {
        pushButton.addEventListener('click', async () => {
          (dropdownContent as HTMLElement).style.display = 'none';
          await this.handleButtonClick();
        });
      }

      const changedFilesButton = dropdownContent.querySelector('.dropdown-item:nth-child(2)');
      if (changedFilesButton) {
        changedFilesButton.addEventListener('click', async () => {
          (dropdownContent as HTMLElement).style.display = 'none';
          await this.handleShowChangedFiles();
        });
      }

      const settingsButton = dropdownContent.querySelector('.dropdown-item:nth-child(3)');
      if (settingsButton) {
        settingsButton.addEventListener('click', () => {
          (dropdownContent as HTMLElement).style.display = 'none';
          this.messageHandler.sendMessage('OPEN_SETTINGS');
        });
      }
    }

    // Always update position when showing the dropdown
    if (dropdownContent) {
      dropdownContent.style.display = 'block';

      // Position the dropdown below the button
      const updatePosition = () => {
        const buttonRect = button.getBoundingClientRect();
        dropdownContent.style.top = `${buttonRect.bottom}px`;
        dropdownContent.style.left = `${buttonRect.left}px`;
      };

      // Update position immediately
      updatePosition();

      // Add window resize listener to keep dropdown aligned with button
      const resizeListener = () => updatePosition();
      window.addEventListener('resize', resizeListener);

      // Clean up resize listener when dropdown is closed
      const removeResizeListener = () => {
        if (dropdownContent.style.display === 'none') {
          window.removeEventListener('resize', resizeListener);
          document.removeEventListener('click', removeResizeListener);
        }
      };

      // Add listener to clean up when dropdown is closed
      document.addEventListener('click', removeResizeListener);
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

  public async handleButtonClick(): Promise<void> {
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
      // Update button state to processing
      if (this.uploadButton) {
        this.uploadButton.innerHTML = `
          <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Pushing to GitHub...
          <svg width="12" height="12" viewBox="0 0 24 24" style="margin-left: 4px;">
            <path fill="currentColor" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
          </svg>
        `;
        this.uploadButton.disabled = true;
      }

      this.isGitHubUpload = true;
      this.messageHandler.sendCommitMessage(commitMessage || 'Commit from Bolt to GitHub');

      // Update status to show we're downloading
      this.messageHandler.sendMessage('UPLOAD_STATUS', {
        status: 'uploading',
        progress: 5,
        message: 'Downloading project files...',
      });

      try {
        // Use the DownloadService to get the project files (using cache if available)
        const blob = await this.downloadService.downloadProjectZip();

        // Convert blob to base64 and send to background script
        const base64data = await this.downloadService.blobToBase64(blob);
        if (base64data) {
          this.messageHandler.sendZipData(base64data);
        } else {
          throw new Error('Failed to convert ZIP file to base64');
        }
      } catch (error) {
        // If download fails, try to use cached files as fallback
        console.warn('Download failed, trying to use cached files:', error);
        this.messageHandler.sendMessage('UPLOAD_STATUS', {
          status: 'uploading',
          progress: 5,
          message: 'Using cached project files...',
        });

        // Get cached project files and convert to base64
        const files = await this.downloadService.getProjectFiles(false);
        if (files && files.size > 0) {
          // We need to convert the files back to a ZIP format
          // This will be handled by the background script
          this.messageHandler.sendMessage('USE_CACHED_FILES', { files: Object.fromEntries(files) });
        } else {
          throw new Error('No cached files available and download failed');
        }
      }
    } catch (error) {
      console.error('Error during GitHub upload:', error);
      this.notificationRenderer.renderNotification({
        type: 'error',
        message: `Failed to download project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });

      // Reset button state
      this.isGitHubUpload = false; // Make sure this flag is reset

      if (this.uploadButton) {
        // Force reset the button state completely
        this.updateButtonState(true);
      }
    }
  }

  // Function to show confirmation dialog
  private showGitHubConfirmation = (
    projectSettings: Record<string, { repoName: string; branch: string }>
  ): Promise<{ confirmed: boolean; commitMessage?: string }> => {
    return new Promise((resolve) => {
      const overlay = this.elementFactory.createGitHubConfirmationDialog(projectSettings);
      document.body.appendChild(overlay);

      // Handle clicks
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve({ confirmed: false });
        }
      });

      const cancelButton = overlay.querySelector('#cancel-upload');
      if (cancelButton) {
        cancelButton.addEventListener('click', () => {
          document.body.removeChild(overlay);
          resolve({ confirmed: false });
        });
      }

      const confirmButton = overlay.querySelector('#confirm-upload');
      if (confirmButton) {
        confirmButton.addEventListener('click', () => {
          const commitMessage =
            (overlay.querySelector('#commit-message') as HTMLInputElement)?.value ||
            'Commit from Bolt to GitHub';
          document.body.removeChild(overlay);
          resolve({ confirmed: true, commitMessage });
        });
      }
    });
  };

  // Also update the notification z-index
  private showSettingsNotification = () => {
    this.notificationRenderer.renderNotification({
      type: 'error',
      message: 'Please configure your GitHub settings first.',
      duration: 5000,
    });
  };

  public updateButtonState(isValid: boolean): void {
    if (this.uploadButton) {
      // If this was called after a completed upload, reset the isGitHubUpload flag
      if (this.isGitHubUpload && isValid) {
        this.isGitHubUpload = false;
      }

      // Update button inner HTML based on state
      if (this.isGitHubUpload) {
        // Don't change the button if we're still uploading
        return;
      }

      this.uploadButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 2px;">
          <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        GitHub
        <svg width="12" height="12" viewBox="0 0 24 24" style="margin-left: 4px;">
          <path fill="currentColor" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
        </svg>
      `;

      this.uploadButton.disabled = !isValid;
      this.uploadButton.classList.toggle('disabled', !isValid);
    }
  }

  private setupMutationObserver(): void {
    let timeoutId: number;
    let retryCount = 0;
    const maxRetries = 10;
    let totalRetries = 0;

    const attemptInitialization = () => {
      // First check if button already exists to avoid duplicate work
      const existingButton = document.querySelector('[data-github-upload]');
      if (existingButton) {
        this.isInitialized = true;
        return; // Exit early if button already exists
      }

      const buttonContainer =
        document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2') ||
        document.querySelector('div.flex.grow-1 div.flex.gap-2') ||
        document.querySelector('div[class*="grow-1"] div[class*="flex"][class*="gap"]');

      if (!existingButton && buttonContainer) {
        this.initializeButton();
        this.isInitialized = true; // Mark as initialized
        retryCount = 0; // Reset count on success
      } else if (!this.isInitialized && retryCount < maxRetries) {
        retryCount++;
        totalRetries++;
        const delay = Math.min(2000, 500 + Math.floor(Math.random() * 500));
        timeoutId = window.setTimeout(attemptInitialization, delay);
      } else if (!this.isInitialized && retryCount >= maxRetries) {
        console.error('Failed to find button container after maximum retries');
        this.notificationRenderer.renderNotification({
          type: 'error',
          message:
            'Failed to initialize GitHub upload button. Please try to refresh the page. If the issue persists, please submit an issue on GitHub.',
          duration: 7000,
        });
        retryCount = 0; // Reset for future attempts

        // One final attempt after a longer delay
        setTimeout(() => {
          if (!this.isInitialized) {
            retryCount = 0; // Reset retry count for this final attempt
            attemptInitialization();
          }
        }, 5000);
      }
    };

    // Initial attempt
    attemptInitialization();

    this.observer = new MutationObserver(() => {
      // Only process DOM changes if we haven't successfully initialized yet
      if (!this.isInitialized) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(attemptInitialization, 500);
      }
    });

    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        this.observer?.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
    }
  }

  public async handleShowChangedFiles(): Promise<void> {
    try {
      // Show loading notification first
      this.notificationRenderer.renderNotification({
        type: 'info',
        message: 'Refreshing and loading project files...',
        duration: 3000,
      });

      // Extract project ID from URL - handle multiple possible URL formats
      const pathname = window.location.pathname;

      // Try different URL patterns
      // 1. Standard project format: /projects/{projectId}
      // 2. New format: /~/projects/{projectId}
      // 3. Tilde format: bolt.new/~/{projectId}
      let projectId =
        pathname.match(/\/projects\/([^/]+)/)?.[1] ||
        pathname.match(/\/~\/projects\/([^/]+)/)?.[1] ||
        pathname.match(/\/~\/([^/]+)/)?.[1];

      // One more attempt - try to get from the last segment
      if (!projectId && pathname.length > 1) {
        const segments = pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          projectId = segments[segments.length - 1];
        }
      }

      if (!projectId) {
        throw new Error('Could not determine project ID from URL: ' + pathname);
      }

      // Get GitHub settings
      const storageData = await this.chromeStorage.syncGet(['repoOwner', 'projectSettings']);

      const repoOwner = storageData.repoOwner;
      const projectSettings = storageData.projectSettings?.[projectId];

      if (!repoOwner || !projectSettings) {
        throw new Error('GitHub settings not configured for this project');
      }

      // Get latest files from project
      await this.filePreviewService.loadProjectFiles();

      // First try to get settings which include the token
      const settings = await SettingsService.getGitHubSettings();
      const token = settings.gitHubSettings?.githubToken;

      if (!token) {
        throw new Error('GitHub token not found. Please configure your GitHub settings.');
      }

      const githubService = new GitHubService(token);

      // Compare with GitHub repository using the initialized service
      await this.filePreviewService.compareWithGitHub(
        repoOwner,
        projectSettings.repoName,
        projectSettings.branch,
        githubService // Pass the initialized GitHub service
      );

      // Get changed files
      const changedFiles = await this.filePreviewService.getChangedFiles();

      if (changedFiles.size === 0) {
        this.notificationRenderer.renderNotification({
          type: 'success',
          message: 'No changes found between project and GitHub repository',
          duration: 5000,
        });
        return;
      }

      // Success notification before opening popup
      this.notificationRenderer.renderNotification({
        type: 'success',
        message: 'File comparison complete. Opening file changes...',
        duration: 3000,
      });

      // Convert Map to object for message transport
      const changes: Record<string, { status: string; content: string }> = {};
      changedFiles.forEach((value, key) => {
        changes[key] = value;
      });

      // Delay slightly before opening the popup to allow notification to be seen
      setTimeout(() => {
        this.messageHandler.sendMessage('OPEN_FILE_CHANGES', {
          changes,
          projectId,
        });
      }, 1000);
    } catch (error) {
      console.error('Error showing changed files:', error);
      this.notificationRenderer.renderNotification({
        type: 'error',
        message: `Failed to show changed files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });
    }
  }

  public cleanup(): void {
    // Reset state variables
    this.isInitialized = false;

    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Remove all instances of our buttons
    const existingButtons = document.querySelectorAll('[data-github-upload]');
    existingButtons.forEach((button) => button.remove());

    // Remove dropdown if it exists
    const dropdownContent = document.querySelector('#github-dropdown-content');
    if (dropdownContent) {
      dropdownContent.remove();
    }

    // Reset state
    this.uploadButton = null;
    this.isGitHubUpload = false;
  }
}
