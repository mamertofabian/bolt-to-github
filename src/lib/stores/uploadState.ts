import { writable, type Writable } from 'svelte/store';
import type { ProcessingStatus } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('UploadStateStore');

// Upload State Interface
export interface UploadState {
  uploadProgress: number;
  uploadStatus: ProcessingStatus;
  uploadMessage: string;
  port: chrome.runtime.Port | null;
}

// Initial state
const initialState: UploadState = {
  uploadProgress: 0,
  uploadStatus: 'idle',
  uploadMessage: '',
  port: null,
};

// Create the writable store
export const uploadStateStore: Writable<UploadState> = writable(initialState);

// Store actions
export const uploadStateActions = {
  /**
   * Initialize the Chrome runtime port connection
   */
  initializePort(): void {
    try {
      const port = chrome.runtime.connect({ name: 'popup' });
      uploadStateStore.update((state) => ({
        ...state,
        port,
      }));
    } catch (error) {
      logger.error('Error initializing Chrome runtime port:', error);
    }
  },

  /**
   * Update upload progress
   */
  setUploadProgress(progress: number): void {
    uploadStateStore.update((state) => ({
      ...state,
      uploadProgress: Math.max(0, Math.min(100, progress)),
    }));
  },

  /**
   * Update upload status
   */
  setUploadStatus(status: ProcessingStatus): void {
    uploadStateStore.update((state) => ({
      ...state,
      uploadStatus: status,
    }));
  },

  /**
   * Update upload message
   */
  setUploadMessage(message: string): void {
    uploadStateStore.update((state) => ({
      ...state,
      uploadMessage: message,
    }));
  },

  /**
   * Update all upload state at once
   */
  updateUploadState(status: ProcessingStatus, progress?: number, message?: string): void {
    uploadStateStore.update((state) => ({
      ...state,
      uploadStatus: status,
      uploadProgress:
        progress !== undefined ? Math.max(0, Math.min(100, progress)) : state.uploadProgress,
      uploadMessage: message || state.uploadMessage,
    }));
  },

  /**
   * Send message to background script via port
   */
  sendMessage(message: any): void {
    uploadStateStore.update((state) => {
      if (state.port) {
        try {
          state.port.postMessage(message);
        } catch (error) {
          logger.error('Error sending message to background script:', error);
        }
      } else {
        logger.warn('No port connection available to send message');
      }
      return state;
    });
  },

  /**
   * Handle upload status messages from background script
   */
  handleUploadStatusMessage(message: any): void {
    if (message.type === 'UPLOAD_STATUS') {
      this.updateUploadState(message.status || 'idle', message.progress, message.message);
    }
  },

  /**
   * Reset upload state to initial values
   */
  resetUploadState(): void {
    uploadStateStore.update((state) => ({
      ...state,
      uploadProgress: 0,
      uploadStatus: 'idle',
      uploadMessage: '',
    }));
  },

  /**
   * Get current upload state
   */
  async getCurrentState(): Promise<UploadState> {
    return new Promise((resolve) => {
      const unsubscribe = uploadStateStore.subscribe((state) => {
        unsubscribe();
        resolve(state);
      });
    });
  },

  /**
   * Disconnect port and reset
   */
  disconnect(): void {
    uploadStateStore.update((state) => {
      if (state.port) {
        try {
          state.port.disconnect();
        } catch (error) {
          logger.error('Error disconnecting port:', error);
        }
      }
      return {
        ...initialState,
      };
    });
  },

  /**
   * Check if upload is in progress
   */
  isUploading(): Promise<boolean> {
    return new Promise((resolve) => {
      const unsubscribe = uploadStateStore.subscribe((state) => {
        unsubscribe();
        resolve(state.uploadStatus === 'uploading');
      });
    });
  },
};
