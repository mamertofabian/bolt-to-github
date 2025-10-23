import { debounce, throttle } from '../../lib/utils/debounce';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('PremiumService');

export interface PremiumStatus {
  isPremium: boolean;
  isAuthenticated: boolean;
  expiresAt?: number;
  features: {
    viewFileChanges: boolean;
    pushReminders: boolean;
    branchSelector: boolean;
    githubIssues: boolean;
    commitHistory: boolean;
  };
}

/**
 * PremiumService manages premium feature access and upgrade prompts
 */
export class PremiumService {
  private premiumStatus: PremiumStatus;
  private currentAuthPlan: 'free' | 'monthly' | 'yearly' = 'free';
  private lastSubscriptionCheck: number = 0;
  private readonly SUBSCRIPTION_CHECK_CACHE_DURATION = 300000; // 5 minutes cache for subscription checks

  // Message flooding prevention
  private lastSavedData: string = '';
  private debouncedSaveData: () => void;
  private throttledUpdatePremiumStatus: (status: Partial<PremiumStatus>) => void;
  private isSaving: boolean = false;
  private storageListener?: (
    changes: { [key: string]: chrome.storage.StorageChange },
    namespace: string
  ) => Promise<void>;
  private syncInProgress: boolean = false;

  constructor() {
    this.premiumStatus = {
      isPremium: false,
      isAuthenticated: false,
      features: {
        viewFileChanges: false,
        pushReminders: false,
        branchSelector: false,
        githubIssues: false,
        commitHistory: false,
      },
    };

    // Initialize debounced and throttled functions
    this.debouncedSaveData = debounce(() => this.saveDataImmediate(), 100); // 100ms as per ticket spec
    this.throttledUpdatePremiumStatus = throttle((status: Partial<PremiumStatus>) => {
      this.updatePremiumStatusImmediate(status);
    }, 1000);

    this.loadStoredData();
    this.initializeSupabaseAuth();
  }

  /**
   * Set UIManager reference for updating components when premium status changes
   * Note: Premium status updates have been simplified, so this is a no-op
   */
  public setUIManager(_uiManager: unknown): void {
    // No longer needed since we removed premium status update functionality
  }

  /**
   * Initialize Supabase auth integration
   */
  private async initializeSupabaseAuth(): Promise<void> {
    try {
      // Message handling is now done through ContentManager
      // to avoid conflicts with multiple message listeners
      logger.info('🔐 Supabase auth integration initialized (messages handled by ContentManager)');

      // Set up sync storage listener to watch for popup premium status changes
      this.setupPopupPremiumStatusSync();
    } catch (error) {
      logger.warn('Failed to initialize Supabase auth integration:', error);
    }
  }

  /**
   * Set up listener to sync premium status from popup to content scripts
   */
  private setupPopupPremiumStatusSync(): void {
    this.storageListener = async (changes, namespace) => {
      if (namespace === 'sync' && changes.popupPremiumStatus) {
        const newPopupStatus = changes.popupPremiumStatus.newValue;
        if (newPopupStatus && !this.syncInProgress) {
          // Prevent race conditions by setting sync flag
          this.syncInProgress = true;

          try {
            // Validate popup status data structure
            if (!this.isValidPopupPremiumStatus(newPopupStatus)) {
              logger.warn('⚠️ Invalid popup premium status data, skipping sync:', newPopupStatus);
              return;
            }

            logger.info('🔄 Syncing premium status from popup to content script:', newPopupStatus);

            // Update content script premium status to match popup status
            await this.updatePremiumStatusFromAuth({
              isAuthenticated: newPopupStatus.isAuthenticated,
              isPremium: newPopupStatus.isPremium,
              plan: newPopupStatus.plan || 'free',
              expiresAt: newPopupStatus.expiresAt
                ? new Date(newPopupStatus.expiresAt).toISOString()
                : undefined,
            });

            logger.info('✅ Premium status synced from popup to content script');
          } catch (error) {
            logger.error('❌ Error syncing premium status from popup:', error);
          } finally {
            this.syncInProgress = false;
          }
        }
      }
    };
    chrome.storage.onChanged.addListener(this.storageListener);
  }

  /**
   * Update premium status from Supabase auth service
   */
  public async updatePremiumStatusFromAuth(authData: {
    isAuthenticated: boolean;
    isPremium: boolean;
    plan: 'free' | 'monthly' | 'yearly';
    expiresAt?: string;
  }): Promise<void> {
    const expiresAt = authData.expiresAt ? new Date(authData.expiresAt).getTime() : undefined;

    // Store the plan info for better UI display
    this.currentAuthPlan = authData.plan;

    await this.updatePremiumStatus({
      isAuthenticated: authData.isAuthenticated,
      isPremium: authData.isPremium,
      expiresAt,
      features: {
        viewFileChanges: authData.isPremium,
        pushReminders: authData.isPremium,
        branchSelector: authData.isPremium,
        githubIssues: authData.isPremium,
        commitHistory: authData.isPremium,
      },
    });

    logger.info(
      `🔐 Premium status updated from auth: authenticated=${authData.isAuthenticated}, premium=${authData.isPremium} (${authData.plan})`
    );
  }

  /**
   * Load premium status and usage from storage
   */
  private async loadStoredData(): Promise<void> {
    try {
      // Load content script premium status from local storage
      const localResult = await chrome.storage.local.get(['premiumStatus']);

      // Also check popup premium status from sync storage for latest updates
      const syncResult = await chrome.storage.sync.get(['popupPremiumStatus']);

      let statusToUse = localResult.premiumStatus;

      // If popup has more recent premium status, use that instead
      if (
        syncResult.popupPremiumStatus &&
        this.isValidPopupPremiumStatus(syncResult.popupPremiumStatus) &&
        (!statusToUse ||
          (syncResult.popupPremiumStatus.lastUpdated || 0) >
            (((statusToUse as Record<string, unknown>)?.lastUpdated as number) || 0))
      ) {
        logger.info('🔄 Using more recent premium status from popup');
        statusToUse = {
          isPremium: syncResult.popupPremiumStatus.isPremium,
          isAuthenticated: syncResult.popupPremiumStatus.isAuthenticated,
          expiresAt: syncResult.popupPremiumStatus.expiresAt,
          features: syncResult.popupPremiumStatus.features,
        };
      }

      if (statusToUse) {
        this.premiumStatus = {
          ...this.premiumStatus,
          ...statusToUse,
          // Ensure isAuthenticated is always defined (default to false for backward compatibility)
          isAuthenticated: statusToUse.isAuthenticated ?? false,
        };
      }
    } catch (error) {
      logger.warn('Failed to load premium data:', error);
    }
  }

  /**
   * Save premium status and usage to storage (debounced)
   */
  private async saveData(): Promise<void> {
    // Check if data has actually changed to prevent unnecessary saves
    const currentData = JSON.stringify(this.premiumStatus);
    if (currentData === this.lastSavedData) {
      logger.debug('Premium data unchanged, skipping save');
      return;
    }

    this.debouncedSaveData();
  }

  /**
   * Save premium status and usage to storage immediately
   */
  private async saveDataImmediate(): Promise<void> {
    // Prevent concurrent saves
    if (this.isSaving) {
      logger.debug('Save already in progress, skipping');
      return;
    }

    try {
      this.isSaving = true;
      const currentData = JSON.stringify(this.premiumStatus);

      // Double-check if data has changed since debounce started
      if (currentData === this.lastSavedData) {
        logger.debug('Premium data unchanged during debounce, skipping save');
        return;
      }

      await chrome.storage.local.set({
        premiumStatus: this.premiumStatus,
      });

      // Also save to sync storage for popup access
      await chrome.storage.sync.set({
        popupPremiumStatus: {
          isAuthenticated: this.premiumStatus.isAuthenticated,
          isPremium: this.premiumStatus.isPremium,
          plan: this.getCurrentPlan(),
          expiresAt: this.premiumStatus.expiresAt,
          features: this.premiumStatus.features,
          lastUpdated: Date.now(),
        },
      });

      this.lastSavedData = currentData;
      logger.debug('Premium data saved successfully');
    } catch (error) {
      logger.warn('Failed to save premium data:', error);
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Get current plan name for display
   */
  private getCurrentPlan(): string {
    if (!this.premiumStatus.isPremium) return 'free';

    // Use the actual plan from auth if available
    if (this.currentAuthPlan === 'yearly') {
      return 'pro annual';
    } else if (this.currentAuthPlan === 'monthly') {
      return 'pro monthly';
    }

    // Fallback to generic 'pro' for premium users
    return 'pro';
  }

  /**
   * Check if user has premium access
   * Now includes server-side validation for active subscriptions
   */
  public async isPremium(): Promise<boolean> {
    /* Check if premium has expired locally first */
    if (this.premiumStatus.expiresAt && Date.now() > this.premiumStatus.expiresAt) {
      logger.info('⏰ Premium subscription expired locally');
      this.premiumStatus.isPremium = false;
      this.updateFeatureAccess();
      this.saveData();
      return false;
    }

    /* If user appears to have premium, validate with server */
    if (this.premiumStatus.isPremium) {
      const serverValidation = await this.validateSubscriptionWithServer();
      return serverValidation;
    }

    return false;
  }

  /**
   * Check if user has premium access (synchronous version for backwards compatibility)
   * Note: This doesn't include server validation and should be used sparingly
   */
  public isPremiumSync(): boolean {
    /* Check if premium has expired */
    if (this.premiumStatus.expiresAt && Date.now() > this.premiumStatus.expiresAt) {
      this.premiumStatus.isPremium = false;
      this.updateFeatureAccess();
      this.saveData();
    }

    return this.premiumStatus.isPremium;
  }

  /**
   * Check if specific feature is available
   * Now includes server-side validation for premium features
   */
  public async hasFeature(feature: keyof PremiumStatus['features']): Promise<boolean> {
    /* For premium features, validate subscription status */
    if (this.premiumStatus.features[feature] && this.premiumStatus.isPremium) {
      const isValid = await this.isPremium();
      return isValid;
    }

    return this.premiumStatus.features[feature];
  }

  /**
   * Check if specific feature is available (synchronous version)
   * Note: This doesn't include server validation and should be used sparingly
   */
  public hasFeatureSync(feature: keyof PremiumStatus['features']): boolean {
    return this.premiumStatus.features[feature];
  }

  /**
   * Check if user can use file changes feature
   * Now includes server-side validation
   */
  public async canUseFileChanges(): Promise<{
    allowed: boolean;
    reason?: string;
    remaining?: number;
  }> {
    const hasAccess = await this.hasFeature('viewFileChanges');

    if (hasAccess) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Premium feature required',
      remaining: 0,
    };
  }

  /**
   * Use one file changes check (for free users)
   */
  public async useFileChanges(): Promise<void> {
    if (!this.hasFeature('viewFileChanges')) {
      await this.saveData();
    }
  }

  /**
   * Check if user can use commit history feature
   * Now includes server-side validation
   */
  public async canUseCommitHistory(): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const hasAccess = await this.hasFeature('commitHistory');

    if (hasAccess) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Premium feature required',
    };
  }

  /**
   * Get usage information for display
   */
  public getUsageInfo(): PremiumStatus {
    return { ...this.premiumStatus };
  }

  /**
   * Update premium status (called when user upgrades/downgrades) - throttled
   */
  public async updatePremiumStatus(status: Partial<PremiumStatus>): Promise<void> {
    this.throttledUpdatePremiumStatus(status);
  }

  /**
   * Update premium status immediately (internal method)
   */
  private async updatePremiumStatusImmediate(status: Partial<PremiumStatus>): Promise<void> {
    this.premiumStatus = { ...this.premiumStatus, ...status };
    this.updateFeatureAccess();
    await this.saveData();
  }

  /**
   * Update feature access based on premium status
   */
  private updateFeatureAccess(): void {
    if (this.premiumStatus.isPremium) {
      this.premiumStatus.features = {
        viewFileChanges: true,
        pushReminders: true,
        branchSelector: true,
        githubIssues: true,
        commitHistory: true,
      };
    } else {
      this.premiumStatus.features = {
        viewFileChanges: false,
        pushReminders: false,
        branchSelector: false,
        githubIssues: false,
        commitHistory: false,
      };
    }
  }

  /**
   * Get current premium status for display
   */
  public getStatus(): PremiumStatus {
    return { ...this.premiumStatus };
  }

  /**
   * Check premium status from server
   * Currently triggers auth service to re-check Supabase status
   */
  public async checkPremiumStatusFromServer(): Promise<void> {
    logger.info('🔄 Triggering premium status refresh...');

    // Force auth service to check again
    try {
      await chrome.runtime.sendMessage({ type: 'FORCE_AUTH_CHECK' });
    } catch (error) {
      logger.warn('Failed to trigger auth check:', error);
    }
  }

  /**
   * Open upgrade page (or sign up if not authenticated)
   */
  public openUpgradePage(): void {
    // Check if user is authenticated first
    this.checkAuthenticationAndRedirect();
  }

  /**
   * Check authentication status and redirect appropriately
   */
  private async checkAuthenticationAndRedirect(): Promise<void> {
    try {
      // Check if user has valid Supabase session
      const result = await chrome.storage.local.get(['supabaseAuthState']);
      const authState = result.supabaseAuthState;

      if (authState && authState.isAuthenticated) {
        // User is authenticated, go to upgrade page
        chrome.tabs.create({ url: 'https://bolt2github.com/upgrade' });
      } else {
        // User needs to sign up first
        chrome.tabs.create({ url: 'https://bolt2github.com/register' });
      }
    } catch (error) {
      logger.warn('Error checking authentication status, redirecting to signup:', error);
      // Default to signup if we can't determine auth status
      chrome.tabs.create({ url: 'https://bolt2github.com/register' });
    }
  }

  /**
   * Validate subscription status with server before allowing premium features
   */
  private async validateSubscriptionWithServer(): Promise<boolean> {
    try {
      // Use cache to avoid too frequent server calls
      const now = Date.now();
      if (now - this.lastSubscriptionCheck < this.SUBSCRIPTION_CHECK_CACHE_DURATION) {
        logger.info('✅ Using cached subscription status (within 5 minutes)');
        return this.premiumStatus.isPremium;
      }

      // Get Supabase auth service instance and validate subscription
      const authServiceModule = await import('./SupabaseAuthService');
      const authService = authServiceModule.SupabaseAuthService.getInstance();

      const isSubscriptionValid = await authService.validateSubscriptionStatus();
      this.lastSubscriptionCheck = now;

      if (!isSubscriptionValid && this.premiumStatus.isPremium) {
        logger.info('📉 Server validation failed - subscription is no longer active');
        await this.handleSubscriptionInvalidation();
      }

      return isSubscriptionValid;
    } catch (error) {
      logger.warn('Failed to validate subscription with server:', error);
      // Fall back to current status if server validation fails
      return this.premiumStatus.isPremium;
    }
  }

  /**
   * Handle subscription invalidation (expired/cancelled)
   */
  private async handleSubscriptionInvalidation(): Promise<void> {
    logger.info('🚫 Handling subscription invalidation...');

    // Update premium status to inactive
    await this.updatePremiumStatus({
      isAuthenticated: false, // Session is likely invalid if subscription validation failed
      isPremium: false,
      features: {
        viewFileChanges: false,
        pushReminders: false,
        branchSelector: false,
        githubIssues: false,
        commitHistory: false,
      },
    });
  }

  /**
   * Validate popup premium status data structure
   */
  private isValidPopupPremiumStatus(data: unknown): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const obj = data as Record<string, unknown>;

    // Check required boolean properties
    if (typeof obj.isAuthenticated !== 'boolean' || typeof obj.isPremium !== 'boolean') {
      return false;
    }

    // Check features object structure
    if (!obj.features || typeof obj.features !== 'object') {
      return false;
    }

    const features = obj.features as Record<string, unknown>;
    const requiredFeatures = [
      'viewFileChanges',
      'pushReminders',
      'branchSelector',
      'githubIssues',
      'commitHistory',
    ];
    for (const feature of requiredFeatures) {
      if (typeof features[feature] !== 'boolean') {
        return false;
      }
    }

    // Check optional properties have correct types when present
    if (obj.expiresAt !== undefined && typeof obj.expiresAt !== 'number') {
      return false;
    }

    if (obj.plan !== undefined && typeof obj.plan !== 'string') {
      return false;
    }

    if (obj.lastUpdated !== undefined && typeof obj.lastUpdated !== 'number') {
      return false;
    }

    return true;
  }

  /**
   * Cleanup method to remove listeners and prevent memory leaks
   */
  public cleanup(): void {
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener);
      this.storageListener = undefined;
    }
    this.syncInProgress = false;
  }
}
