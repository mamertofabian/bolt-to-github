import { writable, type Writable } from 'svelte/store';
import type { FileChange } from '../../services/FilePreviewService';

// Temp Repo Metadata Interface
export interface TempRepoMetadata {
  originalRepo: string;
  tempRepo: string;
  createdAt: number;
  owner: string;
}

// UI State Interface
export interface UIState {
  activeTab: string;
  status: string;
  hasStatus: boolean;
  showTempRepoModal: boolean;
  showFileChangesModal: boolean;
  fileChanges: Map<string, FileChange> | null;
  tempRepoData: TempRepoMetadata | null;
  hasDeletedTempRepo: boolean;
  hasUsedTempRepoName: boolean;
}

// Initial state
const initialState: UIState = {
  activeTab: 'home',
  status: '',
  hasStatus: false,
  showTempRepoModal: false,
  showFileChangesModal: false,
  fileChanges: null,
  tempRepoData: null,
  hasDeletedTempRepo: false,
  hasUsedTempRepoName: false,
};

// Create the writable store
export const uiStateStore: Writable<UIState> = writable(initialState);

// Store actions
export const uiStateActions = {
  /**
   * Set the active tab
   */
  setActiveTab(tab: string): void {
    uiStateStore.update((state) => ({
      ...state,
      activeTab: tab,
    }));
  },

  /**
   * Show a status message with automatic timeout
   */
  showStatus(message: string, duration: number = 3000): void {
    uiStateStore.update((state) => ({
      ...state,
      status: message,
      hasStatus: true,
    }));

    // Auto-clear status after duration
    setTimeout(() => {
      uiStateStore.update((state) => ({
        ...state,
        status: '',
        hasStatus: false,
      }));
    }, duration);
  },

  /**
   * Clear status message immediately
   */
  clearStatus(): void {
    uiStateStore.update((state) => ({
      ...state,
      status: '',
      hasStatus: false,
    }));
  },

  /**
   * Show file changes modal
   */
  showFileChangesModal(fileChanges?: Map<string, FileChange>): void {
    uiStateStore.update((state) => ({
      ...state,
      showFileChangesModal: true,
      fileChanges: fileChanges || state.fileChanges,
    }));
  },

  /**
   * Hide file changes modal
   */
  hideFileChangesModal(): void {
    uiStateStore.update((state) => ({
      ...state,
      showFileChangesModal: false,
    }));
  },

  /**
   * Set file changes data
   */
  setFileChanges(fileChanges: Map<string, FileChange> | null): void {
    uiStateStore.update((state) => ({
      ...state,
      fileChanges,
    }));
  },

  /**
   * Show temp repo modal
   */
  showTempRepoModal(tempRepoData: TempRepoMetadata): void {
    uiStateStore.update((state) => ({
      ...state,
      showTempRepoModal: true,
      tempRepoData,
      hasDeletedTempRepo: false,
      hasUsedTempRepoName: false,
    }));
  },

  /**
   * Hide temp repo modal
   */
  hideTempRepoModal(): void {
    uiStateStore.update((state) => ({
      ...state,
      showTempRepoModal: false,
      tempRepoData: null,
      hasDeletedTempRepo: false,
      hasUsedTempRepoName: false,
    }));
  },

  /**
   * Mark temp repo as deleted
   */
  markTempRepoDeleted(): void {
    uiStateStore.update((state) => ({
      ...state,
      hasDeletedTempRepo: true,
    }));
  },

  /**
   * Mark temp repo name as used
   */
  markTempRepoNameUsed(): void {
    uiStateStore.update((state) => ({
      ...state,
      hasUsedTempRepoName: true,
    }));
  },

  /**
   * Check if both temp repo actions are completed
   */
  canCloseTempRepoModal(): Promise<boolean> {
    return new Promise((resolve) => {
      const unsubscribe = uiStateStore.subscribe((state) => {
        unsubscribe();
        resolve(state.hasDeletedTempRepo && state.hasUsedTempRepoName);
      });
    });
  },

  /**
   * Process file changes from Chrome message
   */
  async processFileChangesMessage(
    changes: Record<string, FileChange>,
    projectId: string
  ): Promise<void> {
    // Store file changes in local storage for future access
    await chrome.storage.local.set({
      storedFileChanges: {
        projectId,
        changes,
      },
    });

    // Convert to Map and show modal
    const fileChangesMap = new Map(Object.entries(changes));
    this.setFileChanges(fileChangesMap);
    this.showFileChangesModal();
  },

  /**
   * Load stored file changes from Chrome storage
   */
  async loadStoredFileChanges(currentProjectId: string | null): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get('storedFileChanges');

      if (result.storedFileChanges) {
        // Check if the stored file changes have the new format with projectId
        if (result.storedFileChanges.projectId && result.storedFileChanges.changes) {
          // Check if stored projectId matches the current project
          if (!currentProjectId || currentProjectId === result.storedFileChanges.projectId) {
            const fileChangesMap = new Map(
              Object.entries(result.storedFileChanges.changes as Record<string, FileChange>)
            );
            this.setFileChanges(fileChangesMap);
            this.showFileChangesModal();
            return true;
          }
        } else {
          // Legacy format without projectId - use it for backward compatibility
          const fileChangesMap = new Map(
            Object.entries(result.storedFileChanges as Record<string, FileChange>)
          );
          this.setFileChanges(fileChangesMap);
          this.showFileChangesModal();
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error loading stored file changes:', error);
      return false;
    }
  },

  /**
   * Request file changes from content script
   */
  async requestFileChangesFromContentScript(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'REQUEST_FILE_CHANGES' }, (response) => {
          if (response && response.success) {
            console.log(
              'Received response from content script with projectId:',
              response.projectId
            );
          }
        });

        this.showStatus('Calculating file changes...', 5000);
      } else {
        throw new Error('No active tab found');
      }
    } catch (error) {
      console.error('Error requesting file changes:', error);
      this.showStatus('Cannot show file changes: Not on a Bolt project page');
    }
  },

  /**
   * Get current UI state
   */
  async getCurrentState(): Promise<UIState> {
    return new Promise((resolve) => {
      const unsubscribe = uiStateStore.subscribe((state) => {
        unsubscribe();
        resolve(state);
      });
    });
  },

  /**
   * Reset UI state to initial values
   */
  reset(): void {
    uiStateStore.set(initialState);
  },
};
