import type { MessageHandler } from '../MessageHandler';

export class UIManager {
  private static instance: UIManager | null = null;
  private messageHandler: MessageHandler;

  constructor(messageHandler: MessageHandler) {
    this.messageHandler = messageHandler;
  }

  static getInstance(messageHandler?: MessageHandler): UIManager {
    if (!UIManager.instance && messageHandler) {
      UIManager.instance = new UIManager(messageHandler);
    } else if (!UIManager.instance) {
      throw new Error('UIManager must be initialized with a MessageHandler first');
    }
    return UIManager.instance;
  }

  static resetInstance(): void {
    UIManager.instance = null;
  }

  cleanup(): void {
    // Mock cleanup
  }

  handleUploadStatus(status: any): void {
    // Mock implementation
  }

  updateUploadStatus(status: any): void {
    // Mock implementation
  }

  handleGitHubSettingsChanged(isValid: boolean): void {
    // Mock implementation
  }

  handleShowChangedFiles(): void {
    // Mock implementation
  }

  handlePushToGitHub(): void {
    // Mock implementation
  }

  handlePremiumStatusUpdate(isPremium: boolean): void {
    // Mock implementation
  }

  notifyUserOfExtensionReload(): void {
    // Mock implementation
  }

  showNotification(options: any): void {
    // Mock implementation
  }

  snoozePushReminders(): void {
    // Mock implementation
  }

  getPushReminderService(): any {
    // Mock implementation
    return null;
  }
}
