import type { IGitHubUploadHandler } from '../types/HandlerInterfaces';
import type { INotificationManager } from '../types/ManagerInterfaces';
import type { MessageHandler } from '../MessageHandler';
import type { UIStateManager } from '../services/UIStateManager';
import type { FileChange } from '../../services/FilePreviewService';
import { SettingsService } from '../../services/settings';
import { DownloadService } from '../../services/DownloadService';
import { CommitTemplateService } from '../services/CommitTemplateService';

// Local interface to match actual structure returned by SettingsService
interface CurrentProjectSettings {
  repoName: string;
  branch: string;
}

interface LocalGitHubSettings {
  githubToken: string;
  repoOwner: string;
  projectSettings?: CurrentProjectSettings;
}

interface LocalSettingsResult {
  isSettingsValid: boolean;
  gitHubSettings?: LocalGitHubSettings;
}

/**
 * GitHubUploadHandler handles the GitHub upload workflow and related operations
 * Previously part of UIManager
 */
export class GitHubUploadHandler implements IGitHubUploadHandler {
  private messageHandler: MessageHandler;
  private downloadService: DownloadService;
  private notificationManager: INotificationManager;
  private stateManager?: UIStateManager;
  private commitTemplateService: CommitTemplateService;

  constructor(
    messageHandler: MessageHandler,
    notificationManager: INotificationManager,
    stateManager?: UIStateManager
  ) {
    this.messageHandler = messageHandler;
    this.notificationManager = notificationManager;
    this.stateManager = stateManager;
    this.downloadService = new DownloadService();
    this.commitTemplateService = CommitTemplateService.getInstance();
  }

  /**
   * Validate GitHub settings
   * Returns true if settings are valid and complete
   */
  public async validateSettings(): Promise<boolean> {
    const settings = (await SettingsService.getGitHubSettings()) as LocalSettingsResult;
    return settings.isSettingsValid;
  }

  /**
   * Handle GitHub push with fresh file comparison (for main interface)
   */
  public async handleGitHubPushWithFreshComparison(): Promise<void> {
    return this.handleGitHubPush(false, true);
  }

  /**
   * Handle the complete GitHub push workflow
   * Replaces the previous handleGitHubPushAction method from UIManager
   * @param useStoredChanges Whether to use stored changes from recent comparison (default: true)
   * @param skipChangeDetection Whether to skip the pre-push change detection phase (default: false)
   */
  public async handleGitHubPush(
    useStoredChanges: boolean = true,
    skipChangeDetection: boolean = false
  ): Promise<void> {
    console.log('🔊 Handling GitHub push action');

    // Validate settings first
    const settings = (await SettingsService.getGitHubSettings()) as LocalSettingsResult;
    if (!settings.isSettingsValid) {
      this.notificationManager.showSettingsNotification();
      return;
    }

    // Skip change detection for direct pushes (GitHub button, Project Status)
    if (skipChangeDetection) {
      console.log('Skipping change detection for direct push');

      // Get commit message templates for the dialog
      const commitMessageTemplates = await this.commitTemplateService.getTemplateSuggestions();

      // Show simple confirmation dialog without change detection
      const { confirmed, commitMessage } = await this.notificationManager.showConfirmationDialog({
        title: 'Confirm GitHub Push',
        message: `Repository: <span class="font-mono">${settings.gitHubSettings?.projectSettings?.repoName || 'N/A'} / ${settings.gitHubSettings?.projectSettings?.branch || 'N/A'}</span><br><br>Push your changes to GitHub?<br><small class="text-gray-500">Only modified files will be uploaded.</small>`,
        confirmText: 'Push Changes',
        cancelText: 'Cancel',
        type: 'info',
        commitMessageTemplates,
      });

      if (!confirmed) return;

      // Record template usage if applicable
      if (commitMessage) {
        await this.commitTemplateService.recordTemplateUsage(commitMessage);
      }

      // Proceed directly to upload
      await this.proceedWithUpload(commitMessage);
      return;
    }

    // Original change detection flow for file changes view
    // Set detecting changes state before checking for changes
    if (this.stateManager) {
      this.stateManager.setButtonDetectingChanges();
    }

    // Show status notification to inform user about the process
    this.notificationManager.showNotification({
      type: 'info',
      message: 'Detecting changes before push...',
      duration: 8000,
    });

    // Check for file changes to provide better confirmation message
    let changesSummary = 'Checking for changes...';
    let hasChanges = false;

    try {
      let changes: Map<string, FileChange> | null = null;

      // Try to use stored changes first (if called from file changes view)
      if (useStoredChanges) {
        changes = await this.getStoredFileChanges();
        if (changes) {
          console.log('Using stored file changes (from recent comparison)');
        }
      }

      // If no stored changes found or not using stored changes, do fresh comparison
      if (!changes) {
        console.log('No stored changes found, performing fresh comparison');
        // Import FileChangeHandler to check for changes
        const { FileChangeHandler } = await import('./FileChangeHandler');
        const fileChangeHandler = new FileChangeHandler(
          this.messageHandler,
          this.notificationManager
        );

        // Get current changes without forcing UI display
        changes = await fileChangeHandler.getChangedFiles(true);
      }

      // Count changes
      const addedCount = Array.from(changes.values()).filter((f) => f.status === 'added').length;
      const modifiedCount = Array.from(changes.values()).filter(
        (f) => f.status === 'modified'
      ).length;
      const deletedCount = Array.from(changes.values()).filter(
        (f) => f.status === 'deleted'
      ).length;

      hasChanges = addedCount > 0 || modifiedCount > 0 || deletedCount > 0;

      if (hasChanges) {
        const changeParts = [];
        if (addedCount > 0) changeParts.push(`${addedCount} added`);
        if (modifiedCount > 0) changeParts.push(`${modifiedCount} modified`);
        if (deletedCount > 0) changeParts.push(`${deletedCount} deleted`);
        changesSummary = `Found changes: ${changeParts.join(', ')} file(s)`;
      } else {
        changesSummary = 'No changes detected - all files are up to date';
      }
    } catch (error) {
      console.warn('Could not check for file changes:', error);
      changesSummary = 'Unable to detect changes';
    }

    // Reset button state before showing confirmation dialog
    if (this.stateManager) {
      this.stateManager.resetButtonLoadingState();
    }

    // Get commit message templates for the dialog
    const commitMessageTemplates = await this.commitTemplateService.getTemplateSuggestions();

    // Show enhanced confirmation dialog
    const confirmationMessage = hasChanges
      ? `${changesSummary}<br><br>Do you want to push these changes to GitHub?`
      : `${changesSummary}<br><br>Do you still want to push to GitHub?`;

    const { confirmed, commitMessage } = await this.notificationManager.showConfirmationDialog({
      title: hasChanges ? 'Confirm GitHub Push' : 'No Changes - Confirm Push',
      message: `Repository: <span class="font-mono">${settings.gitHubSettings?.projectSettings?.repoName || 'N/A'} / ${settings.gitHubSettings?.projectSettings?.branch || 'N/A'}</span><br><br>${confirmationMessage}`,
      confirmText: hasChanges ? 'Push Changes' : 'Push Anyway',
      cancelText: 'Cancel',
      type: hasChanges ? 'info' : 'warning',
      commitMessageTemplates,
    });

    if (!confirmed) {
      // Reset button state if cancelled
      if (this.stateManager) {
        this.stateManager.resetButtonLoadingState();
      }
      return;
    }

    // Record template usage if applicable
    if (commitMessage) {
      await this.commitTemplateService.recordTemplateUsage(commitMessage);
    }

    await this.proceedWithUpload(commitMessage);
  }

  /**
   * Proceed with the actual upload process
   */
  private async proceedWithUpload(commitMessage?: string): Promise<void> {
    try {
      // Set pushing state when user confirms
      if (this.stateManager) {
        this.stateManager.setButtonPushing();
      }

      // Send commit message to background
      this.messageHandler.sendCommitMessage(commitMessage || 'Commit from Bolt to GitHub');

      // Update status to show we're downloading
      this.updateUploadStatus({
        status: 'uploading',
        progress: 5,
        message: 'Downloading project files...',
      });

      // Handle file download and upload
      await this.handleFileDownloadAndUpload();
    } catch (error) {
      console.error('Error during GitHub upload:', error);

      // Show error notification
      this.notificationManager.showNotification({
        type: 'error',
        message: `Failed to download project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });

      // Reset button state on error
      if (this.stateManager) {
        this.stateManager.resetButtonLoadingState();
      }
    }
  }

  /**
   * Handle the file download and upload process
   */
  private async handleFileDownloadAndUpload(): Promise<void> {
    try {
      // Use the DownloadService to get the project files (using cache if available)
      const blob = await this.downloadService.downloadProjectZip();

      // Convert blob to base64 and send to background script
      const base64data = await this.downloadService.blobToBase64(blob);
      if (base64data) {
        // Get current project ID from URL to ensure we're pushing to the correct project
        const currentProjectId = this.getCurrentProjectId();
        this.messageHandler.sendZipData(base64data, currentProjectId || undefined);
      } else {
        throw new Error('Failed to convert ZIP file to base64');
      }
    } catch (error) {
      // If download fails, try to use cached files as fallback
      console.warn('Download failed, trying to use cached files:', error);
      await this.handleCachedFilesFallback();
    }
  }

  /**
   * Handle fallback to cached files when download fails
   */
  private async handleCachedFilesFallback(): Promise<void> {
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

  /**
   * Update upload status through callback
   */
  private updateUploadStatus(status: any): void {
    if (this.stateManager) {
      this.stateManager.setUploadStatus(status);
    }
  }

  /**
   * Get current project settings for display
   */
  public async getProjectInfo(): Promise<{ repoName?: string; branch?: string } | null> {
    const settings = (await SettingsService.getGitHubSettings()) as LocalSettingsResult;
    if (settings.isSettingsValid && settings.gitHubSettings?.projectSettings) {
      return {
        repoName: settings.gitHubSettings.projectSettings.repoName,
        branch: settings.gitHubSettings.projectSettings.branch,
      };
    }
    return null;
  }

  /**
   * Get stored file changes from local storage if they exist and are recent
   */
  private async getStoredFileChanges(): Promise<Map<string, FileChange> | null> {
    try {
      const result = await chrome.storage.local.get(['storedFileChanges']);
      const storedData = result.storedFileChanges;

      if (!storedData || !storedData.changes || !storedData.timestamp) {
        console.log('No valid stored file changes found');
        return null;
      }

      // Get current project ID and URL to ensure we're using changes for the right context
      const currentProjectId = window.location.pathname.split('/').pop() || '';
      const currentUrl = window.location.href;

      // Check if project ID matches
      if (storedData.projectId !== currentProjectId) {
        console.log('Stored changes are for different project, ignoring');
        await this.clearStoredFileChanges();
        return null;
      }

      // Check if URL has changed (different project or navigation)
      if (storedData.url !== currentUrl) {
        console.log('URL changed since storing changes, invalidating cache');
        await this.clearStoredFileChanges();
        return null;
      }

      // Check if stored changes are recent (within 10 minutes)
      const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
      const age = Date.now() - storedData.timestamp;

      if (age > CACHE_DURATION) {
        console.log(`Stored changes are too old (${Math.round(age / 60000)} minutes), ignoring`);
        await this.clearStoredFileChanges();
        return null;
      }

      // Convert stored object back to Map
      const changesMap = new Map();
      Object.entries(storedData.changes).forEach(([key, value]) => {
        changesMap.set(key, value);
      });

      const ageMinutes = Math.round(age / 60000);
      console.log(
        `Retrieved ${changesMap.size} stored file changes for project ${currentProjectId} (${ageMinutes} min old)`
      );
      return changesMap;
    } catch (error) {
      console.warn('Error retrieving stored file changes:', error);
      return null;
    }
  }

  /**
   * Clear stored file changes from local storage
   */
  private async clearStoredFileChanges(): Promise<void> {
    try {
      await chrome.storage.local.remove(['storedFileChanges']);
      console.log('Cleared stored file changes');
    } catch (error) {
      console.warn('Error clearing stored file changes:', error);
    }
  }

  /**
   * Check if upload is currently in progress
   */
  public isUploadInProgress(): boolean {
    // This would typically be managed by a state manager
    // For now, we rely on the button state callback
    return false; // TODO: Implement proper state tracking
  }

  /**
   * Get current project ID from URL
   */
  private getCurrentProjectId(): string | null {
    const url = window.location.href;
    const match = url.match(/bolt\.new\/~\/([^/?#]+)/);
    return match ? match[1] : null;
  }
}
