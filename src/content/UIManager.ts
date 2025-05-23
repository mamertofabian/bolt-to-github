import type { UploadStatusState } from '$lib/types';
import { SettingsService } from '../services/settings';
import { DownloadService } from '../services/DownloadService';
import { FilePreviewService, type FileChange } from '../services/FilePreviewService';
import type { MessageHandler } from './MessageHandler';
// Remove UploadStatus import since it's now handled by UploadStatusManager
// import UploadStatus from './UploadStatus.svelte';

// Import new types and managers
import type {
  NotificationOptions,
  SvelteComponent,
  ConfirmationOptions,
  ConfirmationResult,
} from './types/UITypes';
import { NotificationManager } from './managers/NotificationManager';
import { UploadStatusManager } from './managers/UploadStatusManager';

// Remove the old type definitions since they're now in UITypes
// type SvelteComponent = {
//   $set: (props: Record<string, any>) => void;
//   $destroy: () => void;
// };
//
// interface NotificationOptions {
//   type: 'info' | 'error' | 'success';
//   message: string;
//   duration?: number;
// }

export class UIManager {
  private static instance: UIManager | null = null;
  // Remove uploadStatusComponent since it's now in UploadStatusManager
  // private uploadStatusComponent: SvelteComponent | null = null;
  private uploadButton: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  // Remove the old notification component since it's now in NotificationManager
  // private notificationComponent: SvelteComponent | null = null;
  private isGitHubUpload = false;
  private messageHandler: MessageHandler;
  private downloadService: DownloadService;
  private filePreviewService: FilePreviewService;

  // Add the managers
  private notificationManager: NotificationManager;
  private uploadStatusManager: UploadStatusManager;

  private constructor(messageHandler: MessageHandler) {
    this.messageHandler = messageHandler;
    this.downloadService = new DownloadService();
    this.filePreviewService = FilePreviewService.getInstance();

    // Initialize NotificationManager
    this.notificationManager = new NotificationManager(messageHandler);

    // Initialize UploadStatusManager with callback for button state management
    this.uploadStatusManager = new UploadStatusManager((status: UploadStatusState) => {
      this.handleUploadStatusChange(status);
    });

    this.initializeUI();
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
    // Delegate to NotificationManager
    this.notificationManager.showNotification(options);
  }

  private async initializeUI() {
    console.log('🔊 Initializing UI');
    await this.initializeUploadButton();
    // Use UploadStatusManager instead of direct initialization
    this.uploadStatusManager.initialize();
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
      <svg width="12" height="12" viewBox="0 0 24 24" style="margin-left: 4px;">
        <path fill="currentColor" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
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
      // Set initial position (will be updated below)
      dropdownContent.style.position = 'fixed';
      dropdownContent.style.zIndex = '9999';
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
        position: fixed; /* Use fixed positioning to avoid scroll issues */
        z-index: 9999;
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

    // Show Changed Files option
    const changedFilesButton = document.createElement('button');
    changedFilesButton.className = 'dropdown-item flex items-center';
    changedFilesButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="9" y1="15" x2="15" y2="15"></line>
      </svg>
      <span>Show Changed Files</span>
    `;
    changedFilesButton.addEventListener('click', async () => {
      (dropdownContent as HTMLElement).style.display = 'none';
      await this.handleShowChangedFiles();
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
    dropdownContent.appendChild(changedFilesButton);
    dropdownContent.appendChild(settingsButton);

    return dropdownContent;
  }

  public async handleGitHubPushAction() {
    console.log('🔊 Handling GitHub push action');

    const settings = await SettingsService.getGitHubSettings();
    if (!settings.isSettingsValid) {
      this.notificationManager.showSettingsNotification();
      return;
    }

    const { confirmed, commitMessage } = await this.notificationManager.showConfirmationDialog({
      title: 'Confirm GitHub Upload',
      message: `Are you sure you want to upload this project to GitHub? <br />
        <span class="font-mono">${settings.gitHubSettings?.projectSettings?.repoName || 'N/A'} / ${settings.gitHubSettings?.projectSettings?.branch || 'N/A'}</span>`,
      confirmText: 'Upload',
      cancelText: 'Cancel',
    });
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
        (this.uploadButton as HTMLButtonElement).disabled = true;
      }

      this.isGitHubUpload = true;
      this.messageHandler.sendCommitMessage(commitMessage || 'Commit from Bolt to GitHub');

      // Update status to show we're downloading
      this.updateUploadStatus({
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
        this.updateUploadStatus({
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
      this.showNotification({
        type: 'error',
        message: `Failed to download project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });

      // Reset button state
      if (this.uploadButton) {
        this.updateButtonState(true);
      }
      this.isGitHubUpload = false;
    }
  }

  public updateUploadStatus(status: UploadStatusState) {
    // Delegate to UploadStatusManager
    this.uploadStatusManager.updateStatus(status);
  }

  public updateButtonState(isValid: boolean) {
    if (this.uploadButton) {
      this.uploadButton.classList.toggle('disabled', !isValid);
      // Update other button states as needed
    }
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

  /**
   * Handle the "Show Changed Files" button click
   * This will download the project files (or use cache) and show changed files in the console
   */
  public async handleShowChangedFiles() {
    try {
      // Show notification that we're refreshing and loading files
      this.showNotification({
        type: 'info',
        message: 'Refreshing and loading project files...',
        duration: 3000,
      });

      console.group('Changed Files');
      console.log('Refreshing and loading project files...');

      // Load the current project files with a forced refresh (invalidate cache)
      // since this is a user-driven action, we always want the latest files
      const startTime = performance.now();
      await this.filePreviewService.loadProjectFiles(true); // Pass true to force refresh
      const loadTime = performance.now() - startTime;
      console.log(`Files loaded in ${loadTime.toFixed(2)}ms`);

      // Get settings to determine if we should compare with GitHub
      const { repoOwner, projectSettings } = await chrome.storage.sync.get([
        'repoOwner',
        'projectSettings',
      ]);

      // Get the current project ID from the URL
      const projectId = window.location.pathname.split('/').pop() || '';

      let changedFiles: Map<string, FileChange>;

      // Check if GitHub comparison is possible
      if (repoOwner && projectSettings?.[projectId]) {
        const { repoName, branch } = projectSettings[projectId];
        const targetBranch = branch || 'main';

        console.log('Comparing with GitHub repository...');
        console.log(`Repository: ${repoOwner}/${repoName}, Branch: ${targetBranch}`);

        // Use GitHub comparison
        try {
          // Import GitHubService dynamically to avoid circular dependencies
          const { GitHubService } = await import('../services/GitHubService');

          // Create a new instance of GitHubService
          const token = await chrome.storage.sync.get(['githubToken']);
          const githubService = new GitHubService(token.githubToken);

          // Compare with GitHub
          changedFiles = await this.filePreviewService.compareWithGitHub(
            repoOwner,
            repoName,
            targetBranch,
            githubService
          );

          console.log('Successfully compared with GitHub repository');
        } catch (githubError) {
          console.warn(
            'Failed to compare with GitHub, falling back to local comparison:',
            githubError
          );
          // Fall back to local comparison
          changedFiles = await this.filePreviewService.getChangedFiles();
        }
      } else {
        console.log('No GitHub settings found, using local comparison only');
        // Use local comparison only
        changedFiles = await this.filePreviewService.getChangedFiles();
      }

      // Count files by status
      let addedCount = 0;
      let modifiedCount = 0;
      let unchangedCount = 0;
      let deletedCount = 0;

      changedFiles.forEach((file) => {
        switch (file.status) {
          case 'added':
            addedCount++;
            break;
          case 'modified':
            modifiedCount++;
            break;
          case 'unchanged':
            unchangedCount++;
            break;
          case 'deleted':
            deletedCount++;
            break;
        }
      });

      // Log summary
      console.log('Change Summary:');
      console.log(`- Total files: ${changedFiles.size}`);
      console.log(`- Added: ${addedCount}`);
      console.log(`- Modified: ${modifiedCount}`);
      console.log(`- Unchanged: ${unchangedCount}`);
      console.log(`- Deleted: ${deletedCount}`);

      // Log details of changed files (added and modified)
      if (addedCount > 0 || modifiedCount > 0) {
        console.log('\nChanged Files:');
        changedFiles.forEach((file, path) => {
          if (file.status === 'added' || file.status === 'modified') {
            console.log(`${file.status === 'added' ? '➕' : '✏️'} ${path}`);
          }
        });
      }

      // Log deleted files if any
      if (deletedCount > 0) {
        console.log('\nDeleted Files:');
        changedFiles.forEach((file, path) => {
          if (file.status === 'deleted') {
            console.log(`❌ ${path}`);
          }
        });
      }

      console.groupEnd();

      // Show notification with summary
      this.showNotification({
        type: 'success',
        message: `Found ${addedCount + modifiedCount} changed files. Opening file changes view...`,
        duration: 5000,
      });

      // Send file changes to popup for display
      // Convert Map to object for message passing
      const changesObject: Record<string, FileChange> = {};
      changedFiles.forEach((value, key) => {
        changesObject[key] = value;
      });

      // Send message to open the popup with file changes
      this.messageHandler.sendMessage('OPEN_FILE_CHANGES', {
        changes: changesObject,
        projectId, // Include the projectId to identify which project these changes belong to
      });

      // Also store the changes in local storage for future retrieval
      try {
        await chrome.storage.local.set({
          storedFileChanges: { projectId, changes: changesObject },
        });
        console.log('File changes stored in local storage for future retrieval');
      } catch (storageError) {
        console.error('Failed to store file changes in local storage:', storageError);
      }
    } catch (error) {
      console.error('Error showing changed files:', error);
      this.showNotification({
        type: 'error',
        message: `Failed to show changed files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });
    }
  }

  /**
   * Handle upload status changes - callback from UploadStatusManager
   * This manages the button state when upload status changes
   */
  private handleUploadStatusChange(status: UploadStatusState): void {
    // Reset GitHub button when upload is complete
    if (status.status !== 'uploading' && this.isGitHubUpload && this.uploadButton) {
      this.isGitHubUpload = false;
      this.uploadButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 2px;">
          <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        GitHub
        <svg width="12" height="12" viewBox="0 0 24 24" style="margin-left: 4px;">
          <path fill="currentColor" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
        </svg>
      `;
      (this.uploadButton as HTMLButtonElement).disabled = false;
    }
  }

  public cleanup() {
    this.observer?.disconnect();
    this.uploadButton?.remove();
    this.uploadButton = null;

    // Use NotificationManager cleanup instead of manual cleanup
    this.notificationManager.cleanup();

    // Use UploadStatusManager cleanup
    this.uploadStatusManager.cleanup();
  }

  public reinitialize() {
    console.log('🔊 Reinitializing UI manager');
    this.cleanup();
    this.initializeUI();
  }
}
