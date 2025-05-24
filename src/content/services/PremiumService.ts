export interface PremiumStatus {
  isPremium: boolean;
  expiresAt?: number;
  features: {
    viewFileChanges: boolean;
    pushReminders: boolean;
    branchSelector: boolean;
  };
}

/**
 * PremiumService manages premium feature access and upgrade prompts
 */
export class PremiumService {
  private premiumStatus: PremiumStatus;
  private supabaseAuthService: any; // Will be imported dynamically
  private currentAuthPlan: 'free' | 'monthly' | 'yearly' = 'free';
  private uiManager?: any; // Reference to UIManager for updating components

  constructor() {
    this.premiumStatus = {
      isPremium: false,
      features: {
        viewFileChanges: false,
        pushReminders: false,
        branchSelector: false,
      },
    };

    this.loadStoredData();
    this.initializeSupabaseAuth();
  }

  /**
   * Set UIManager reference for updating components when premium status changes
   */
  public setUIManager(uiManager: any): void {
    this.uiManager = uiManager;
  }

  /**
   * Initialize Supabase auth integration
   */
  private async initializeSupabaseAuth(): Promise<void> {
    try {
      // Message handling is now done through ContentManager
      // to avoid conflicts with multiple message listeners
      console.log('🔐 Supabase auth integration initialized (messages handled by ContentManager)');
    } catch (error) {
      console.warn('Failed to initialize Supabase auth integration:', error);
    }
  }

  /**
   * Update premium status from Supabase auth service
   */
  public async updatePremiumStatusFromAuth(authData: {
    isPremium: boolean;
    plan: 'free' | 'monthly' | 'yearly';
    expiresAt?: string;
  }): Promise<void> {
    const expiresAt = authData.expiresAt ? new Date(authData.expiresAt).getTime() : undefined;

    // Store the plan info for better UI display
    this.currentAuthPlan = authData.plan;

    await this.updatePremiumStatus({
      isPremium: authData.isPremium,
      expiresAt,
      features: {
        viewFileChanges: authData.isPremium,
        pushReminders: authData.isPremium,
        branchSelector: authData.isPremium,
      },
    });

    // Update dropdown manager with new premium status
    if (this.uiManager) {
      this.uiManager.updateDropdownPremiumStatus();
    }

    console.log(
      `🔐 Premium status updated from auth: ${authData.isPremium ? 'active' : 'inactive'} (${authData.plan})`
    );
  }

  /**
   * Load premium status and usage from storage
   */
  private async loadStoredData(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['premiumStatus']);

      if (result.premiumStatus) {
        this.premiumStatus = { ...this.premiumStatus, ...result.premiumStatus };
      }
    } catch (error) {
      console.warn('Failed to load premium data:', error);
    }
  }

  /**
   * Save premium status and usage to storage
   */
  private async saveData(): Promise<void> {
    try {
      await chrome.storage.local.set({
        premiumStatus: this.premiumStatus,
      });

      // Also save to sync storage for popup access
      await chrome.storage.sync.set({
        popupPremiumStatus: {
          isPremium: this.premiumStatus.isPremium,
          plan: this.getCurrentPlan(),
          expiresAt: this.premiumStatus.expiresAt,
          features: this.premiumStatus.features,
          lastUpdated: Date.now(),
        },
      });
    } catch (error) {
      console.warn('Failed to save premium data:', error);
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
   */
  public isPremium(): boolean {
    // Check if premium has expired
    if (this.premiumStatus.expiresAt && Date.now() > this.premiumStatus.expiresAt) {
      this.premiumStatus.isPremium = false;
      this.updateFeatureAccess();
      this.saveData();
    }

    return this.premiumStatus.isPremium;
  }

  /**
   * Check if specific feature is available
   */
  public hasFeature(feature: keyof PremiumStatus['features']): boolean {
    return this.premiumStatus.features[feature];
  }

  /**
   * Check if user can use file changes feature
   */
  public canUseFileChanges(): { allowed: boolean; reason?: string; remaining?: number } {
    if (this.hasFeature('viewFileChanges')) {
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
   * Get usage information for display
   */
  public getUsageInfo(): PremiumStatus {
    return { ...this.premiumStatus };
  }

  /**
   * Update premium status (called when user upgrades/downgrades)
   */
  public async updatePremiumStatus(status: Partial<PremiumStatus>): Promise<void> {
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
      };
    } else {
      this.premiumStatus.features = {
        viewFileChanges: false,
        pushReminders: false,
        branchSelector: false,
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
    console.log('🔄 Triggering premium status refresh...');

    // Force auth service to check again
    try {
      await chrome.runtime.sendMessage({ type: 'FORCE_AUTH_CHECK' });
    } catch (error) {
      console.warn('Failed to trigger auth check:', error);
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
      console.warn('Error checking authentication status, redirecting to signup:', error);
      // Default to signup if we can't determine auth status
      chrome.tabs.create({ url: 'https://bolt2github.com/register' });
    }
  }
}
