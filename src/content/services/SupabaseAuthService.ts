export interface SupabaseUser {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionStatus {
  isActive: boolean;
  plan: 'free' | 'monthly' | 'yearly';
  expiresAt?: string;
  subscriptionId?: string;
  customerId?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: SupabaseUser | null;
  subscription: SubscriptionStatus;
}

/**
 * SupabaseAuthService handles authentication detection and subscription status
 * by communicating with the Supabase edge functions
 */
export class SupabaseAuthService {
  private static instance: SupabaseAuthService | null = null;
  private authState: AuthState;
  private supabaseUrl: string;
  private anonKey: string;
  private checkInterval: NodeJS.Timeout | null = null;

  // Configuration - replace with your actual Supabase project details
  private readonly SUPABASE_URL = 'https://your-project.supabase.co';
  private readonly SUPABASE_ANON_KEY = 'your-anon-key';
  private readonly CHECK_INTERVAL = 30000; // Check every 30 seconds

  private constructor() {
    this.supabaseUrl = this.SUPABASE_URL;
    this.anonKey = this.SUPABASE_ANON_KEY;

    this.authState = {
      isAuthenticated: false,
      user: null,
      subscription: {
        isActive: false,
        plan: 'free',
      },
    };

    this.initialize();
  }

  static getInstance(): SupabaseAuthService {
    if (!SupabaseAuthService.instance) {
      SupabaseAuthService.instance = new SupabaseAuthService();
    }
    return SupabaseAuthService.instance;
  }

  /**
   * Initialize the service and start checking for authentication
   */
  private async initialize(): Promise<void> {
    console.log('🔐 Initializing Supabase auth service');

    // Load cached auth state
    await this.loadCachedAuthState();

    // Start periodic checks
    this.startPeriodicChecks();

    // Initial check
    await this.checkAuthStatus();
  }

  /**
   * Load cached authentication state from storage
   */
  private async loadCachedAuthState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['supabaseAuthState']);
      if (result.supabaseAuthState) {
        this.authState = { ...this.authState, ...result.supabaseAuthState };
        console.log('📋 Loaded cached auth state:', this.authState.isAuthenticated);
      }
    } catch (error) {
      console.warn('Failed to load cached auth state:', error);
    }
  }

  /**
   * Save authentication state to storage
   */
  private async saveAuthState(): Promise<void> {
    try {
      await chrome.storage.local.set({ supabaseAuthState: this.authState });
    } catch (error) {
      console.warn('Failed to save auth state:', error);
    }
  }

  /**
   * Start periodic authentication checks
   */
  private startPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkAuthStatus();
    }, this.CHECK_INTERVAL);

    console.log(`🔄 Started auth checks every ${this.CHECK_INTERVAL / 1000}s`);
  }

  /**
   * Check authentication status by looking for Supabase session
   */
  private async checkAuthStatus(): Promise<void> {
    try {
      // Try to get authentication token from various sources
      const token = await this.getAuthToken();

      if (token) {
        // Verify token and get user info
        const user = await this.verifyTokenAndGetUser(token);
        if (user) {
          // Get subscription status
          const subscription = await this.getSubscriptionStatus(token);

          this.updateAuthState({
            isAuthenticated: true,
            user,
            subscription,
          });
        } else {
          this.updateAuthState({
            isAuthenticated: false,
            user: null,
            subscription: { isActive: false, plan: 'free' },
          });
        }
      } else {
        this.updateAuthState({
          isAuthenticated: false,
          user: null,
          subscription: { isActive: false, plan: 'free' },
        });
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  }

  /**
   * Try to get authentication token from various sources
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      // Method 1: Check if user is on your domain and has session
      const tabs = await chrome.tabs.query({ url: 'https://bolt2github.com/*' });
      if (tabs.length > 0) {
        const token = await this.getTokenFromTab(tabs[0].id!);
        if (token) return token;
      }

      // Method 2: Check localStorage in any tab (if user visited your site)
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (tab.id && tab.url?.includes('bolt2github.com')) {
          const token = await this.getTokenFromTab(tab.id);
          if (token) return token;
        }
      }

      // Method 3: Check stored token
      const result = await chrome.storage.local.get(['supabaseToken']);
      if (result.supabaseToken) {
        return result.supabaseToken;
      }

      return null;
    } catch (error) {
      console.warn('Error getting auth token:', error);
      return null;
    }
  }

  /**
   * Get authentication token from a specific tab
   */
  private async getTokenFromTab(tabId: number): Promise<string | null> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Check for Supabase session in localStorage
          const session = localStorage.getItem('supabase.auth.token');
          if (session) {
            try {
              const parsed = JSON.parse(session);
              return parsed.access_token || parsed.token;
            } catch {
              return session;
            }
          }
          return null;
        },
      });

      return result[0]?.result || null;
    } catch (error) {
      // Tab might not be accessible or script injection failed
      return null;
    }
  }

  /**
   * Verify token with Supabase and get user information
   */
  private async verifyTokenAndGetUser(token: string): Promise<SupabaseUser | null> {
    try {
      const response = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: this.anonKey,
        },
      });

      if (response.ok) {
        const user = await response.json();

        // Store valid token for future use
        await chrome.storage.local.set({ supabaseToken: token });

        return {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          updated_at: user.updated_at,
        };
      }

      return null;
    } catch (error) {
      console.error('Error verifying token:', error);
      return null;
    }
  }

  /**
   * Get subscription status from your edge function
   */
  private async getSubscriptionStatus(token: string): Promise<SubscriptionStatus> {
    try {
      const response = await fetch(`${this.supabaseUrl}/functions/v1/check-subscription`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          isActive: data.isActive || false,
          plan: data.plan || 'free',
          expiresAt: data.expiresAt,
          subscriptionId: data.subscriptionId,
          customerId: data.customerId,
        };
      }

      return { isActive: false, plan: 'free' };
    } catch (error) {
      console.error('Error getting subscription status:', error);
      return { isActive: false, plan: 'free' };
    }
  }

  /**
   * Update authentication state and notify listeners
   */
  private updateAuthState(newState: Partial<AuthState>): void {
    const previousState = { ...this.authState };
    this.authState = { ...this.authState, ...newState };

    // Save to storage
    this.saveAuthState();

    // Log changes
    if (previousState.isAuthenticated !== this.authState.isAuthenticated) {
      console.log(
        `🔐 Auth status changed: ${this.authState.isAuthenticated ? 'authenticated' : 'unauthenticated'}`
      );
    }

    if (previousState.subscription.isActive !== this.authState.subscription.isActive) {
      console.log(
        `💰 Subscription status changed: ${this.authState.subscription.isActive ? 'active' : 'inactive'} (${this.authState.subscription.plan})`
      );
    }

    // Notify premium service of subscription changes
    this.notifyPremiumService();
  }

  /**
   * Notify premium service of subscription status changes
   */
  private async notifyPremiumService(): Promise<void> {
    try {
      // Send message to content script to update premium status
      const tabs = await chrome.tabs.query({ url: 'https://bolt.new/*' });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'UPDATE_PREMIUM_STATUS',
              data: {
                isPremium: this.authState.subscription.isActive,
                plan: this.authState.subscription.plan,
                expiresAt: this.authState.subscription.expiresAt,
              },
            })
            .catch(() => {
              // Tab might not have content script injected
            });
        }
      }
    } catch (error) {
      console.warn('Error notifying premium service:', error);
    }
  }

  /**
   * Force a manual check of authentication status
   */
  public async forceCheck(): Promise<void> {
    console.log('🔄 Forcing auth status check');
    await this.checkAuthStatus();
  }

  /**
   * Get current authentication state
   */
  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Check if user has premium access
   */
  public isPremium(): boolean {
    return this.authState.subscription.isActive;
  }

  /**
   * Get current subscription plan
   */
  public getSubscriptionPlan(): 'free' | 'monthly' | 'yearly' {
    return this.authState.subscription.plan;
  }

  /**
   * Open sign up page
   */
  public openSignUpPage(): void {
    chrome.tabs.create({
      url: 'https://bolt2github.com/signup',
    });
  }

  /**
   * Open upgrade page (requires authentication)
   */
  public openUpgradePage(): void {
    chrome.tabs.create({
      url: 'https://bolt2github.com/upgrade',
    });
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
