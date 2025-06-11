import { writable, type Writable } from 'svelte/store';
import type { FileChange } from '../../services/FilePreviewService';
import { createLogger } from '../utils/logger';

const logger = createLogger('FileChangesStore');

// File Changes State Interface
export interface FileChangesState {
  showModal: boolean;
  fileChanges: Map<string, FileChange> | null;
}

// Initial state
const initialState: FileChangesState = {
  showModal: false,
  fileChanges: null,
};

// Create the writable store
export const fileChangesStore: Writable<FileChangesState> = writable(initialState);

// Store actions
export const fileChangesActions = {
  /**
   * Show file changes modal
   */
  showModal(fileChanges?: Map<string, FileChange>): void {
    fileChangesStore.update((state) => ({
      ...state,
      showModal: true,
      fileChanges: fileChanges || state.fileChanges,
    }));
  },

  /**
   * Hide file changes modal
   */
  hideModal(): void {
    fileChangesStore.update((state) => ({
      ...state,
      showModal: false,
    }));
  },

  /**
   * Set file changes data
   */
  setFileChanges(fileChanges: Map<string, FileChange> | null): void {
    fileChangesStore.update((state) => ({
      ...state,
      fileChanges,
    }));
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
    this.showModal();
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
            this.showModal();
            return true;
          }
        } else {
          // Legacy format without projectId - use it for backward compatibility
          const fileChangesMap = new Map(
            Object.entries(result.storedFileChanges as Record<string, FileChange>)
          );
          this.setFileChanges(fileChangesMap);
          this.showModal();
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error loading stored file changes:', error);
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
            logger.info(
              'Received response from content script with projectId:',
              response.projectId
            );
          }
        });
      } else {
        throw new Error('No active tab found');
      }
    } catch (error) {
      logger.error('Error requesting file changes:', error);
      throw error; // Re-throw so caller can handle
    }
  },

  /**
   * Get current file changes state
   */
  async getCurrentState(): Promise<FileChangesState> {
    return new Promise((resolve) => {
      const unsubscribe = fileChangesStore.subscribe((state) => {
        unsubscribe();
        resolve(state);
      });
    });
  },

  /**
   * Reset file changes state to initial values
   */
  reset(): void {
    fileChangesStore.set(initialState);
  },

  /**
   * Debug helper to log current file changes
   */
  debugFileChanges(): void {
    fileChangesStore.subscribe((state) => {
      if (state.fileChanges) {
        logger.info('Current file changes:', {
          totalFiles: state.fileChanges.size,
          byStatus: {
            added: Array.from(state.fileChanges.values()).filter((f) => f.status === 'added')
              .length,
            modified: Array.from(state.fileChanges.values()).filter((f) => f.status === 'modified')
              .length,
            deleted: Array.from(state.fileChanges.values()).filter((f) => f.status === 'deleted')
              .length,
            unchanged: Array.from(state.fileChanges.values()).filter(
              (f) => f.status === 'unchanged'
            ).length,
          },
          files: Array.from(state.fileChanges.entries()).map(([path, change]) => ({
            path,
            status: change.status,
            hasContent: !!change.content,
            hasPreviousContent: !!change.previousContent,
            contentLength: change.content?.length || 0,
            previousContentLength: change.previousContent?.length || 0,
          })),
        });
      }
    })();
  },
};
