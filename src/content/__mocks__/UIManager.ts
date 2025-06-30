/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

export class UIManager {
  private static instance: UIManager | null = null;
  private initCallCount = 0;
  private cleanupCallCount = 0;
  private projectId: string | null = null;
  private destroyed = false;

  constructor() {
    // Mock constructor
  }

  static getInstance(): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  static resetInstance(): void {
    UIManager.instance = null;
  }

  init(projectId: string): void {
    if (this.destroyed) {
      throw new Error('UIManager used after cleanup');
    }
    this.initCallCount++;
    this.projectId = projectId;
  }

  cleanup(): void {
    this.cleanupCallCount++;
    this.destroyed = true;
    this.projectId = null;
  }

  getInitCallCount(): number {
    return this.initCallCount;
  }

  getCleanupCallCount(): number {
    return this.cleanupCallCount;
  }

  getProjectId(): string | null {
    return this.projectId;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  showNotification(options: any): void {
    // Mock implementation
  }

  updateUploadStatus(status: any): void {
    // Mock implementation
  }

  showFileChanges(changes: any): void {
    // Mock implementation
  }

  handleGitHubAppSync(data: any): void {
    // Mock implementation
  }

  updatePremiumStatus(isPremium: boolean): void {
    // Mock implementation
  }

  handleShowPushReminder(): void {
    // Mock implementation
  }

  handleDismissPushReminder(): void {
    // Mock implementation
  }
}

export default UIManager;
