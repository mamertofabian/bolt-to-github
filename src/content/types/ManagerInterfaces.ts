// Interfaces for manager classes

import type { UploadStatusState } from '../../lib/types';
import type {
  NotificationOptions,
  ConfirmationOptions,
  ConfirmationResult,
  UIState,
} from './UITypes';

export interface INotificationManager {
  showNotification(options: NotificationOptions): void;
  showConfirmationDialog(options: ConfirmationOptions): Promise<ConfirmationResult>;
  showSettingsNotification(): void;
  cleanup(): void;
}

export interface IUploadStatusManager {
  updateStatus(status: UploadStatusState): void;
  initialize(): void;
  cleanup(): void;
}

export interface IGitHubButtonManager {
  initialize(): Promise<void>;
  updateState(isValid: boolean): void;
  setProcessingState(): void;
  resetState(): void;
  getButton(): HTMLElement | null;
  isInitialized(): boolean;
  buttonExists(): boolean;
  cleanup(): void;
}

export interface IDropdownManager {
  show(button: HTMLButtonElement): Promise<void>;
  hide(): void;
  createContent(): HTMLElement;
  cleanup(): void;
}

export interface IUIStateManager {
  setUploadStatus(status: UploadStatusState): void;
  setButtonState(isValid: boolean): void;
  getState(): UIState;
}

// Base interface for all managers
export interface IBaseManager {
  initialize?(): void | Promise<void>;
  cleanup(): void;
}
