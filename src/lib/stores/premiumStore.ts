import { writable, derived, get } from 'svelte/store';
import { createLogger } from '../utils/logger';

const logger = createLogger('premiumStore');

/**
 * Premium Store for Popup UI
 *
 * Handles both authentication status and premium status to provide
 * appropriate UI elements:
 *
 * - isAuthenticated: false, isPremium: false → Show "Sign in" + "Upgrade" buttons
 * - isAuthenticated: true, isPremium: false → Show only "Upgrade" button
 * - isAuthenticated: true, isPremium: true → Show "PRO" badge
 */

export interface PopupPremiumStatus {
  isAuthenticated: boolean;
  isPremium: boolean;
  plan: string;
  expiresAt?: number;
  features: {
    viewFileChanges: boolean;
    pushReminders: boolean;
    branchSelector: boolean;
    githubIssues: boolean;
  };
  lastUpdated: number;
}

// Create the writable store
const premiumStatusStore = writable<PopupPremiumStatus>({
  isAuthenticated: false,
  isPremium: false,
  plan: 'free',
  features: {
    viewFileChanges: false,
    pushReminders: false,
    branchSelector: false,
    githubIssues: false,
  },
  lastUpdated: 0,
});

// Derived store for easy access to specific values
export const isAuthenticated = derived(premiumStatusStore, ($store) => $store.isAuthenticated);
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
        // Ensure backward compatibility - if isAuthenticated is not present, default to false
        const status = {
          ...result.popupPremiumStatus,
          isAuthenticated: result.popupPremiumStatus.isAuthenticated ?? false,
        };
        premiumStatusStore.set(status);
        logger.info('📊 Loaded premium status:', status);
      }
    } catch (error) {
      logger.error('Failed to load premium status:', error);
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
          logger.info('📊 Premium status updated from storage:', newStatus);
        }
      }
    });
  },

  /**
   * Get current premium status value
   */
  getCurrentStatus(): Promise<PopupPremiumStatus> {
    return Promise.resolve(get(premiumStatusStore));
  },

  /**
   * Force refresh premium status from storage
   */
  async refresh() {
    await this.loadPremiumStatus();
  },

  /**
   * Logout user and clear authentication tokens
   */
  async logout() {
    try {
      logger.info('🚪 Logout initiated from popup...');

      // Send message to background script to trigger logout
      await chrome.runtime.sendMessage({ type: 'USER_LOGOUT' });

      // Clear the popup premium status from sync storage
      await chrome.storage.sync.remove(['popupPremiumStatus']);

      // Clear local premium status
      premiumStatusStore.set({
        isAuthenticated: false,
        isPremium: false,
        plan: 'free',
        features: {
          viewFileChanges: false,
          pushReminders: false,
          branchSelector: false,
          githubIssues: false,
        },
        lastUpdated: Date.now(),
      });

      logger.info('✅ Logout completed from popup');
    } catch (error) {
      logger.error('❌ Error during logout:', error);
      throw error;
    }
  },
};

// Export the main store
export default premiumStatusStore;
