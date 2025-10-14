/**
 * Pure business logic functions for ConfirmationDialog component
 * These functions contain no UI dependencies and can be unit tested in isolation
 */

export type DialogType = 'warning' | 'info' | 'danger';

export interface DialogConfig {
  type: DialogType;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
}

/**
 * Determines the appropriate icon component based on dialog type
 */
export function getIconComponent(type: DialogType): 'AlertTriangle' | 'Info' {
  return type === 'warning' || type === 'danger' ? 'AlertTriangle' : 'Info';
}

/**
 * Determines the appropriate icon color class based on dialog type
 */
export function getIconColor(type: DialogType): string {
  if (type === 'danger') return 'text-red-500';
  if (type === 'warning') return 'text-yellow-500';
  return 'text-blue-500';
}

/**
 * Determines the appropriate confirm button class based on dialog type
 */
export function getConfirmButtonClass(type: DialogType): string {
  if (type === 'danger') return 'bg-red-600 hover:bg-red-700';
  if (type === 'warning') return 'bg-yellow-600 hover:bg-yellow-700';
  return 'bg-blue-600 hover:bg-blue-700';
}

/**
 * Handles keyboard events for dialog interaction
 */
export function handleKeydown(
  event: KeyboardEvent,
  onConfirm: () => void,
  onCancel: () => void
): void {
  if (event.key === 'Escape') {
    onCancel();
  } else if (event.key === 'Enter') {
    onConfirm();
  }
}

/**
 * Handles confirm action with dialog state management
 */
export function handleConfirm(onConfirm: () => void): { show: boolean } {
  onConfirm();
  return { show: false };
}

/**
 * Handles cancel action with dialog state management
 */
export function handleCancel(onCancel: () => void): { show: boolean } {
  onCancel();
  return { show: false };
}

/**
 * Validates dialog configuration
 */
export function validateDialogConfig(config: Partial<DialogConfig>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.title || config.title.trim() === '') {
    errors.push('Title is required');
  }

  if (!config.message || config.message.trim() === '') {
    errors.push('Message is required');
  }

  if (config.type && !['warning', 'info', 'danger'].includes(config.type)) {
    errors.push('Type must be one of: warning, info, danger');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Gets default dialog configuration
 */
export function getDefaultDialogConfig(): DialogConfig {
  return {
    type: 'info',
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
  };
}

/**
 * Merges user configuration with defaults
 */
export function mergeDialogConfig(userConfig: Partial<DialogConfig>): DialogConfig {
  const defaults = getDefaultDialogConfig();
  return {
    type: userConfig.type ?? defaults.type,
    title: userConfig.title ?? defaults.title,
    message: userConfig.message ?? defaults.message,
    confirmText: userConfig.confirmText ?? defaults.confirmText,
    cancelText: userConfig.cancelText ?? defaults.cancelText,
  };
}
