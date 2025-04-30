import type { UploadStatusState } from '$lib/types';
import { FilePreviewService } from '../services/FilePreviewService';
import type { MessageHandler } from './MessageHandler';
import { ContentNotificationRenderer } from './ContentNotificationRenderer';
import { UploadStatusRenderer } from './UploadStatusRenderer';
import { GitHubButtonController } from './GitHubButtonController';
import { FileChangeDisplayController } from './FileChangeDisplayController';
import { ContentUIElementFactory } from './ContentUIElementFactory';
import type { NotificationOptions } from './interfaces/ContentUIInterfaces';

export class UIManager {
  private static instance: UIManager | null = null;
  private notificationRenderer: ContentNotificationRenderer;
  private uploadStatusRenderer: UploadStatusRenderer;
  private gitHubButtonController: GitHubButtonController;
  private fileChangeDisplayController: FileChangeDisplayController;
  private elementFactory: ContentUIElementFactory;

  private constructor(messageHandler: MessageHandler) {
    this.elementFactory = new ContentUIElementFactory();
    this.notificationRenderer = new ContentNotificationRenderer(this.elementFactory);
    this.uploadStatusRenderer = new UploadStatusRenderer(this.elementFactory);
    this.gitHubButtonController = new GitHubButtonController(
      messageHandler,
      this.elementFactory,
      this.notificationRenderer
    );
    this.fileChangeDisplayController = new FileChangeDisplayController(
      messageHandler,
      FilePreviewService.getInstance(),
      this.notificationRenderer
    );

    this.initializeUI();
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
    console.log('🔊 Initializing UI');
    try {
      // Initialize UI components with proper error handling
      await this.gitHubButtonController.initializeButton().catch((err) => {
        console.error('Error initializing GitHub button:', err);
      });

      console.log('🔊 UI initialization complete');
    } catch (error) {
      console.error('Error during UI initialization:', error);
    }
  }

  public showNotification(options: NotificationOptions): void {
    this.notificationRenderer.renderNotification(options);
  }

  public updateUploadStatus(status: UploadStatusState): void {
    this.uploadStatusRenderer.renderUploadStatus(status);

    // Reset GitHub button when upload is complete
    if (status.status !== 'uploading') {
      this.gitHubButtonController.updateButtonState(true);
    }
  }

  public handleGitHubPushAction(): Promise<void> {
    return this.gitHubButtonController.handleButtonClick();
  }

  public async handleShowChangedFiles(): Promise<void> {
    return this.fileChangeDisplayController.displayFileChanges();
  }

  public updateButtonState(isValid: boolean): void {
    this.gitHubButtonController.updateButtonState(isValid);
  }

  public cleanup(): void {
    this.notificationRenderer.cleanup();
    this.uploadStatusRenderer.cleanup();
    this.gitHubButtonController.cleanup();
    this.fileChangeDisplayController.cleanup();
  }

  public reinitialize(): void {
    console.log('🔊 Reinitializing UI manager');
    try {
      // Perform cleanup first
      this.cleanup();

      // Re-initialize UI
      setTimeout(() => {
        // Use a short delay to allow the DOM to update
        this.initializeUI();
      }, 500);
    } catch (error) {
      console.error('Error reinitializing UI manager:', error);
    }
  }
}
