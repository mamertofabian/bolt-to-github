import type { UploadStatusState } from '$lib/types';
import type { FileChange } from '../../services/FilePreviewService';

export interface NotificationOptions {
  type: 'info' | 'error' | 'success';
  message: string;
  duration?: number;
}

export interface IContentNotificationRenderer {
  renderNotification(options: NotificationOptions): void;
  cleanup(): void;
}

export interface IUploadStatusRenderer {
  renderUploadStatus(status: UploadStatusState): void;
  cleanup(): void;
}

export interface IGitHubButtonController {
  initializeButton(): Promise<void>;
  handleButtonClick(): Promise<void>;
  updateButtonState(isValid: boolean): void;
  handleShowChangedFiles(): Promise<void>;
  cleanup(): void;
}

export interface IFileChangeDisplayController {
  displayFileChanges(): Promise<void>;
  cleanup(): void;
}

export interface IContentUIElementFactory {
  createUploadButton(): HTMLButtonElement;
  createGitHubDropdown(): HTMLElement;
  createNotificationElement(options: NotificationOptions): HTMLElement;
  createUploadStatusContainer(): HTMLElement;
  createGitHubConfirmationDialog(
    projectSettings: Record<string, { repoName: string; branch: string }>
  ): HTMLElement;
}
