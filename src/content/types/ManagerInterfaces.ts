// Interfaces for manager classes

import type { UploadStatusState } from '../../lib/types';
import type {
  NotificationOptions,
  UpgradeNotificationOptions,
  ConfirmationOptions,
  ConfirmationResult,
  UIState,
} from './UITypes';

export interface INotificationManager {
  showNotification(options: NotificationOptions): void;
  showUpgradeNotification(options: UpgradeNotificationOptions): void;
  showConfirmationDialog(options: ConfirmationOptions): Promise<ConfirmationResult>;
  showSettingsNotification(): void;
  clearReminderNotifications(): void;
  getReminderNotificationCount(): number;
  getNotificationDebugInfo(): object;
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
  setDetectingChangesState(): void;
  setPushingState(): void;
  setLoadingState(text: string): void;
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
  setButtonDetectingChanges(): void;
  setButtonPushing(): void;
  setButtonLoadingState(text: string): void;
  resetButtonLoadingState(): void;
  getState(): UIState;
}

// Base interface for all managers
export interface IBaseManager {
  initialize?(): void | Promise<void>;
  cleanup(): void;
}
