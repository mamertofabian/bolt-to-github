// Base UI types for the content script components

export interface NotificationOptions {
  type: 'info' | 'error' | 'success';
  message: string;
  duration?: number;
}

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'error';
}

export interface ConfirmationResult {
  confirmed: boolean;
  commitMessage?: string;
}

export interface ButtonOptions {
  text: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  testId?: string;
}

export interface DropdownItem {
  label: string;
  action: () => void | Promise<void>;
  disabled?: boolean;
  icon?: string;
}

export interface DialogOptions {
  title: string;
  content: string | HTMLElement;
  actions?: {
    primary?: { text: string; action: () => void };
    secondary?: { text: string; action: () => void };
  };
}

// Define proper types for Svelte components
export type SvelteComponent = {
  $set: (props: Record<string, any>) => void;
  $destroy: () => void;
};

// UI State types
export interface UIState {
  uploadStatus: import('../../lib/types').UploadStatusState;
  buttonState: {
    isValid: boolean;
    isProcessing: boolean;
    isInitialized: boolean;
  };
  notifications: {
    active: number;
    lastType?: 'info' | 'error' | 'success';
  };
  dropdown: {
    isVisible: boolean;
    position?: { top: number; left: number };
  };
  components: {
    uploadStatusInitialized: boolean;
    notificationInitialized: boolean;
    buttonInitialized: boolean;
  };
}

export interface ComponentPosition {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: string;
}
