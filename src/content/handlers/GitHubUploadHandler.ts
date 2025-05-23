import type { IGitHubUploadHandler } from '../types/HandlerInterfaces';
import type { INotificationManager } from '../types/ManagerInterfaces';
import type { MessageHandler } from '../MessageHandler';
import { SettingsService } from '../../services/settings';
import { DownloadService } from '../../services/DownloadService';

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
  private onButtonStateChangeCallback?: (isProcessing: boolean) => void;
  private onUploadStatusCallback?: (status: any) => void;

  constructor(
    messageHandler: MessageHandler,
    notificationManager: INotificationManager,
    onButtonStateChangeCallback?: (isProcessing: boolean) => void,
    onUploadStatusCallback?: (status: any) => void
  ) {
    this.messageHandler = messageHandler;
    this.notificationManager = notificationManager;
    this.downloadService = new DownloadService();
    this.onButtonStateChangeCallback = onButtonStateChangeCallback;
    this.onUploadStatusCallback = onUploadStatusCallback;
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
   * Handle the complete GitHub push workflow
   * Replaces the previous handleGitHubPushAction method from UIManager
   */
  public async handleGitHubPush(): Promise<void> {
    console.log('🔊 Handling GitHub push action');

    // Validate settings first
    const settings = (await SettingsService.getGitHubSettings()) as LocalSettingsResult;
    if (!settings.isSettingsValid) {
      this.notificationManager.showSettingsNotification();
      return;
    }

    // Show confirmation dialog
    const { confirmed, commitMessage } = await this.notificationManager.showConfirmationDialog({
      title: 'Confirm GitHub Upload',
      message: `Are you sure you want to upload this project to GitHub? <br />
        <span class="font-mono">${settings.gitHubSettings?.projectSettings?.repoName || 'N/A'} / ${settings.gitHubSettings?.projectSettings?.branch || 'N/A'}</span>`,
      confirmText: 'Upload',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    try {
      // Notify about button state change (processing)
      if (this.onButtonStateChangeCallback) {
        this.onButtonStateChangeCallback(true);
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

      // Reset button state
      if (this.onButtonStateChangeCallback) {
        this.onButtonStateChangeCallback(false);
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
        this.messageHandler.sendZipData(base64data);
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
    if (this.onUploadStatusCallback) {
      this.onUploadStatusCallback(status);
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
   * Check if upload is currently in progress
   */
  public isUploadInProgress(): boolean {
    // This would typically be managed by a state manager
    // For now, we rely on the button state callback
    return false; // TODO: Implement proper state tracking
  }
}
