import { writable, type Writable } from 'svelte/store';

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
