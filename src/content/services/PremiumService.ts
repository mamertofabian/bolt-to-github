export interface PremiumStatus {
  isPremium: boolean;
  expiresAt?: number;
  features: {
    unlimitedFileChanges: boolean;
    pushReminders: boolean;
    branchSelector: boolean;
  };
}

export interface UsageLimits {
  fileChangesDaily: {
    used: number;
    limit: number;
    resetTime: number; // timestamp when daily limit resets
  };
}

export interface PremiumFeature {
  id: string;
  name: string;
  description: string;
  icon: string;
}

/**
 * PremiumService manages premium feature access, usage limits, and upgrade prompts
 */
export class PremiumService {
  private premiumStatus: PremiumStatus;
  private usageLimits: UsageLimits;
  private supabaseAuthService: any; // Will be imported dynamically
  private currentAuthPlan: 'free' | 'monthly' | 'yearly' = 'free';

  // Free tier limits
  private readonly FREE_DAILY_FILE_CHANGES = 3;

  constructor() {
    this.premiumStatus = {
      isPremium: false,
      features: {
        unlimitedFileChanges: false,
        pushReminders: false,
        branchSelector: false,
      },
    };

    this.usageLimits = {
      fileChangesDaily: {
        used: 0,
        limit: this.FREE_DAILY_FILE_CHANGES,
        resetTime: this.getNextMidnight(),
      },
    };

    this.loadStoredData();
    this.initializeSupabaseAuth();
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
        unlimitedFileChanges: authData.isPremium,
        pushReminders: authData.isPremium,
        branchSelector: authData.isPremium,
      },
    });

    console.log(
      `🔐 Premium status updated from auth: ${authData.isPremium ? 'active' : 'inactive'} (${authData.plan})`
    );
  }

  /**
   * Load premium status and usage from storage
   */
  private async loadStoredData(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['premiumStatus', 'usageLimits']);

      if (result.premiumStatus) {
        this.premiumStatus = { ...this.premiumStatus, ...result.premiumStatus };
      }

      if (result.usageLimits) {
        this.usageLimits = { ...this.usageLimits, ...result.usageLimits };

        // Reset daily limits if needed
        this.checkAndResetDailyLimits();
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
        usageLimits: this.usageLimits,
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
   * Check if daily limits need to be reset
   */
  private checkAndResetDailyLimits(): void {
    const now = Date.now();
    if (now >= this.usageLimits.fileChangesDaily.resetTime) {
      this.usageLimits.fileChangesDaily.used = 0;
      this.usageLimits.fileChangesDaily.resetTime = this.getNextMidnight();
      this.saveData();
    }
  }

  /**
   * Get timestamp for next midnight (daily reset)
   */
  private getNextMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
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
    this.checkAndResetDailyLimits();

    if (this.hasFeature('unlimitedFileChanges')) {
      return { allowed: true };
    }

    const { used, limit } = this.usageLimits.fileChangesDaily;
    if (used >= limit) {
      return {
        allowed: false,
        reason: 'Daily limit reached',
        remaining: 0,
      };
    }

    return {
      allowed: true,
      remaining: limit - used,
    };
  }

  /**
   * Use one file changes check (for free users)
   */
  public async useFileChanges(): Promise<void> {
    if (!this.hasFeature('unlimitedFileChanges')) {
      this.checkAndResetDailyLimits();
      this.usageLimits.fileChangesDaily.used++;
      await this.saveData();
    }
  }

  /**
   * Get usage information for display
   */
  public getUsageInfo(): UsageLimits {
    this.checkAndResetDailyLimits();
    return { ...this.usageLimits };
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
        unlimitedFileChanges: true,
        pushReminders: true,
        branchSelector: true,
      };
    } else {
      this.premiumStatus.features = {
        unlimitedFileChanges: false,
        pushReminders: false,
        branchSelector: false,
      };
    }
  }

  /**
   * Get time until daily limit resets
   */
  public getTimeUntilReset(): number {
    this.checkAndResetDailyLimits();
    return this.usageLimits.fileChangesDaily.resetTime - Date.now();
  }

  /**
   * Get premium features list for marketing
   */
  public getPremiumFeatures(): PremiumFeature[] {
    return [
      {
        id: 'unlimited-file-changes',
        name: 'Unlimited File Changes',
        description: 'View and compare unlimited file changes per day',
        icon: '📁',
      },
      {
        id: 'push-reminders',
        name: 'Smart Push Reminders',
        description: 'Intelligent reminders to push your changes when idle or on schedule',
        icon: '⏰',
      },
      {
        id: 'branch-selector',
        name: 'Branch Selector',
        description: 'Choose specific branches when importing private repositories',
        icon: '🌿',
      },
    ];
  }

  /**
   * Get current premium status for display
   */
  public getStatus(): PremiumStatus {
    return { ...this.premiumStatus };
  }

  /**
   * Check premium status from server (placeholder for future SSO)
   */
  public async checkPremiumStatusFromServer(): Promise<void> {
    // TODO: Implement when SSO is ready
    // This will validate premium status with your backend
    console.log('Premium status check from server not yet implemented');
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
