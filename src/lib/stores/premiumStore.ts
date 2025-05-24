import { writable, derived } from 'svelte/store';

export interface PopupPremiumStatus {
  isPremium: boolean;
  plan: string;
  expiresAt?: number;
  features: {
    unlimitedFileChanges: boolean;
    pushReminders: boolean;
    branchSelector: boolean;
  };
  lastUpdated: number;
}

// Create the writable store
const premiumStatusStore = writable<PopupPremiumStatus>({
  isPremium: false,
  plan: 'free',
  features: {
    unlimitedFileChanges: false,
    pushReminders: false,
    branchSelector: false,
  },
  lastUpdated: 0,
});

// Derived store for easy access to specific values
export const isPremium = derived(premiumStatusStore, ($store) => $store.isPremium);
export const premiumPlan = derived(premiumStatusStore, ($store) => $store.plan);
export const premiumFeatures = derived(premiumStatusStore, ($store) => $store.features);

// Actions for managing premium status
export const premiumStatusActions = {
  /**
   * Load premium status from Chrome storage
   */
  async loadPremiumStatus() {
    try {
      const result = await chrome.storage.sync.get(['popupPremiumStatus']);
      if (result.popupPremiumStatus) {
        premiumStatusStore.set(result.popupPremiumStatus);
        console.log('📊 Loaded premium status:', result.popupPremiumStatus);
      }
    } catch (error) {
      console.error('Failed to load premium status:', error);
    }
  },

  /**
   * Initialize premium status loading and set up storage listener
   */
  async initialize() {
    // Load initial status
    await this.loadPremiumStatus();

    // Set up listener for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.popupPremiumStatus) {
        const newStatus = changes.popupPremiumStatus.newValue;
        if (newStatus) {
          premiumStatusStore.set(newStatus);
          console.log('📊 Premium status updated from storage:', newStatus);
        }
      }
    });
  },

  /**
   * Get current premium status value
   */
  getCurrentStatus(): Promise<PopupPremiumStatus> {
    return new Promise((resolve) => {
      const unsubscribe = premiumStatusStore.subscribe((status) => {
        unsubscribe();
        resolve(status);
      });
    });
  },

  /**
   * Force refresh premium status from storage
   */
  async refresh() {
    await this.loadPremiumStatus();
  },
};

// Export the main store
export default premiumStatusStore;
