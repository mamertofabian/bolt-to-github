/* eslint-disable no-console */
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

  /* Configuration - replace with your actual Supabase project details */
  private readonly SUPABASE_URL = 'https://gapvjcqybzabnrjnxzhg.supabase.co';
  private readonly SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhcHZqY3F5YnphYm5yam54emhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3MjMwMzQsImV4cCI6MjA2MzI5OTAzNH0.6bpYH1nccYIEKbQmctojedbrzMVBGcHhgjCyKXVUgzc';
  private readonly CHECK_INTERVAL_UNAUTHENTICATED = 30000; /* 30 seconds when not authenticated */
  private readonly CHECK_INTERVAL_AUTHENTICATED = 3600000; /* 1 hour when authenticated */

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

    /* Load cached auth state */
    await this.loadCachedAuthState();

    /* Setup immediate authentication detection */
    this.setupImmediateAuthDetection();

    /* Start periodic checks */
    this.startPeriodicChecks();

    /* Initial check */
    await this.checkAuthStatus();
  }

  /**   * Load cached authentication state from storage   */
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
   * Setup immediate authentication detection for faster response to user sign-ins
   */
  private setupImmediateAuthDetection(): void {
    try {
      /* Listen for tab updates on bolt2github.com */
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes('bolt2github.com')) {
          console.log('🔍 Detected bolt2github.com tab update, checking for auth...');
          await this.checkForImmediateAuth(tabId);
        }
      });

      /* Listen for tab navigation events */
      chrome.tabs.onActivated.addListener(async (activeInfo) => {
        try {
          const tab = await chrome.tabs.get(activeInfo.tabId);
          if (tab.url && tab.url.includes('bolt2github.com')) {
            console.log('🔍 Detected bolt2github.com tab activation, checking for auth...');
            await this.checkForImmediateAuth(activeInfo.tabId);
          }
        } catch (error) {
          /* Tab might be closed or inaccessible, ignore */
        }
      });

      console.log('🎯 Setup immediate auth detection listeners');
    } catch (error) {
      console.warn('Failed to setup immediate auth detection:', error);
    }
  }

  /**
   * Check for immediate authentication when bolt2github.com tabs are accessed
   */
  private async checkForImmediateAuth(tabId: number): Promise<void> {
    try {
      console.log('⚡ Performing immediate auth check...');

      /* Try to get token from the specific tab */
      const tokenData = await this.getTokenDataFromTab(tabId);

      if (tokenData && tokenData.access_token) {
        console.log('✅ Found fresh auth token, updating immediately');

        /* Store the new token data */
        await this.storeTokenData(tokenData);

        /* Force an immediate auth status check */
        await this.checkAuthStatus();

        /* If we just became authenticated, restart periodic checks with longer interval */
        if (this.authState.isAuthenticated) {
          console.log('🔄 User authenticated - switching to longer check interval');
          this.startPeriodicChecks();
        }
      } else {
        console.log('⏳ No auth token found yet, continuing existing checks');
      }
    } catch (error) {
      console.warn('Error in immediate auth check:', error);
    }
  }

  /**
   * Start periodic authentication checks
   */
  private startPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    const interval = this.authState.isAuthenticated
      ? this.CHECK_INTERVAL_AUTHENTICATED
      : this.CHECK_INTERVAL_UNAUTHENTICATED;

    this.checkInterval = setInterval(() => {
      this.checkAuthStatus();
    }, interval);
    console.log(`🔄 Started auth checks every ${interval / 1000}s`);
  }

  /**
   * Check authentication status by looking for Supabase session
   */
  private async checkAuthStatus(): Promise<void> {
    try {
      console.log('🔄 Checking authentication status...');

      /* Try to get authentication token from various sources */
      const token = await this.getAuthToken();

      if (token) {
        console.log('🔐 Found authentication token');

        /* Verify token and get user info */
        const user = await this.verifyTokenAndGetUser(token);
        if (user) {
          console.log(`👤 Verified user: ${user.email}`);

          /* Get subscription status using the user info */
          const subscription = await this.getSubscriptionStatus(token, user);

          console.log(
            `💰 Subscription status: ${subscription.isActive ? 'active' : 'inactive'} (${subscription.plan})`
          );

          this.updateAuthState({
            isAuthenticated: true,
            user,
            subscription,
          });
        } else {
          console.log('❌ Token verification failed');
          this.updateAuthState({
            isAuthenticated: false,
            user: null,
            subscription: { isActive: false, plan: 'free' },
          });
        }
      } else {
        console.log('❌ No authentication token found');
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

  /**   * Try to get authentication token from various sources   */
  private async getAuthToken(): Promise<string | null> {
    try {
      /* Method 1: Check stored tokens first (for independent operation) */
      const storedTokens = await chrome.storage.local.get([
        'supabaseToken',
        'supabaseRefreshToken',
        'supabaseTokenExpiry',
      ]);
      if (storedTokens.supabaseToken) {
        /* Check if token is still valid */
        const now = Date.now();
        const expiry = storedTokens.supabaseTokenExpiry || 0;
        if (expiry > now + 5 * 60 * 1000) {
          /* Token valid for more than 5 minutes */
          console.log('✅ Using stored access token (valid)');
          return storedTokens.supabaseToken;
        } else if (storedTokens.supabaseRefreshToken) {
          /* Token expired or expires soon, try to refresh */
          console.log('🔄 Stored token expired/expiring, refreshing...');
          const refreshedToken = await this.refreshStoredToken();
          if (refreshedToken) {
            return refreshedToken;
          }
        }
      }
      /* Method 2: Check if user is on your domain and has session */
      const tabs = await chrome.tabs.query({ url: 'https://bolt2github.com/*' });
      if (tabs.length > 0) {
        const tokenData = await this.getTokenDataFromTab(tabs[0].id!);
        if (tokenData) {
          await this.storeTokenData(tokenData);
          return tokenData.access_token;
        }
      }
      /* Method 3: Check localStorage in any tab (if user visited your site) */
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (tab.id && tab.url?.includes('bolt2github.com')) {
          const tokenData = await this.getTokenDataFromTab(tab.id);
          if (tokenData) {
            await this.storeTokenData(tokenData);
            return tokenData.access_token;
          }
        }
      }
      /* Method 4: Final fallback - use stored refresh token if available */
      if (storedTokens.supabaseRefreshToken) {
        console.log('🔄 No valid access token, attempting refresh with stored refresh token...');
        const refreshedToken = await this.refreshStoredToken();
        if (refreshedToken) {
          return refreshedToken;
        }
      }
      return null;
    } catch (error) {
      console.warn('Error getting auth token:', error);
      return null;
    }
  }

  /**   * Store token data securely in chrome storage   */
  private async storeTokenData(tokenData: any): Promise<void> {
    try {
      const expiresAt = tokenData.expires_at
        ? tokenData.expires_at * 1000
        : Date.now() + 3600 * 1000; /* 1 hour default */
      await chrome.storage.local.set({
        supabaseToken: tokenData.access_token,
        supabaseRefreshToken: tokenData.refresh_token,
        supabaseTokenExpiry: expiresAt,
      });
      console.log('💾 Stored token data in chrome storage');
    } catch (error) {
      console.warn('Failed to store token data:', error);
    }
  }
  /**   * Get token data from a specific tab   */
  private async getTokenDataFromTab(tabId: number): Promise<any> {
    try {
      /* Extract project reference from Supabase URL */
      const projectRef = this.supabaseUrl.split('://')[1].split('.')[0];
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (projectRef: string) => {
          /* Check for Supabase session in localStorage with project-specific key */
          const sessionKey = `sb-${projectRef}-auth-token`;
          const session = localStorage.getItem(sessionKey);
          console.log(`🔍 Checking for auth token with key: ${sessionKey}`);
          if (session) {
            console.log('✅ Found auth token with project-specific key');
            try {
              const parsed = JSON.parse(session);
              return {
                access_token: parsed.access_token || parsed.token,
                refresh_token: parsed.refresh_token,
                expires_at: parsed.expires_at,
                expires_in: parsed.expires_in,
              };
            } catch {
              return { access_token: session, refresh_token: null };
            }
          }
          /* Fallback: check for generic key (older format) */
          console.log('🔍 Checking fallback key: supabase.auth.token');
          const fallbackSession = localStorage.getItem('supabase.auth.token');
          if (fallbackSession) {
            console.log('✅ Found auth token with fallback key');
            try {
              const parsed = JSON.parse(fallbackSession);
              return {
                access_token: parsed.access_token || parsed.token,
                refresh_token: parsed.refresh_token,
                expires_at: parsed.expires_at,
                expires_in: parsed.expires_in,
              };
            } catch {
              return { access_token: fallbackSession, refresh_token: null };
            }
          }
          console.log('❌ No auth token found in localStorage');
          return null;
        },
        args: [projectRef],
      });
      return result[0]?.result || null;
    } catch (error) {
      console.warn('Failed to get token data from tab:', error);
      return null;
    }
  }
  /**   * Refresh stored token using refresh token   */
  private async refreshStoredToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(['supabaseRefreshToken']);
      const refreshToken = result.supabaseRefreshToken;
      if (!refreshToken) {
        console.warn('❌ No stored refresh token available');
        return null;
      }
      console.log('🔄 Attempting to refresh stored token...');
      const response = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.anonKey,
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Stored token refresh successful');
        // Store the new tokens
        if (data.access_token) {
          const expiresAt = data.expires_at ? data.expires_at * 1000 : Date.now() + 3600 * 1000;
          await chrome.storage.local.set({
            supabaseToken: data.access_token,
            supabaseRefreshToken: data.refresh_token || refreshToken,
            // Keep old refresh token if new one not provided
            supabaseTokenExpiry: expiresAt,
          });
        }
        return data.access_token;
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.warn('❌ Stored token refresh failed:', response.status, errorData);
        // If refresh failed, clear stored tokens
        await chrome.storage.local.remove([
          'supabaseToken',
          'supabaseRefreshToken',
          'supabaseTokenExpiry',
        ]);
        return null;
      }
    } catch (error) {
      console.error('❌ Error refreshing stored token:', error);
      return null;
    }
  }
  /**   * Get authentication token from a specific tab with refresh token support   */
  private async getTokenFromTab(tabId: number): Promise<string | null> {
    try {
      // Extract project reference from Supabase URL
      const projectRef = this.supabaseUrl.split('://')[1].split('.')[0];

      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (projectRef: string) => {
          // Check for Supabase session in localStorage with project-specific key
          const sessionKey = `sb-${projectRef}-auth-token`;
          const session = localStorage.getItem(sessionKey);

          console.log(`🔍 Checking for auth token with key: ${sessionKey}`);

          if (session) {
            console.log('✅ Found auth token with project-specific key');
            try {
              const parsed = JSON.parse(session);
              return {
                access_token: parsed.access_token || parsed.token,
                refresh_token: parsed.refresh_token,
                expires_at: parsed.expires_at,
                expires_in: parsed.expires_in,
              };
            } catch {
              return { access_token: session, refresh_token: null };
            }
          }

          // Fallback: check for generic key (older format)
          console.log('🔍 Checking fallback key: supabase.auth.token');
          const fallbackSession = localStorage.getItem('supabase.auth.token');
          if (fallbackSession) {
            console.log('✅ Found auth token with fallback key');
            try {
              const parsed = JSON.parse(fallbackSession);
              return {
                access_token: parsed.access_token || parsed.token,
                refresh_token: parsed.refresh_token,
                expires_at: parsed.expires_at,
                expires_in: parsed.expires_in,
              };
            } catch {
              return { access_token: fallbackSession, refresh_token: null };
            }
          }

          console.log('❌ No auth token found in localStorage');
          return null;
        },
        args: [projectRef],
      });

      const tokenData = result[0]?.result || null;
      if (tokenData?.access_token) {
        console.log('🔐 Successfully retrieved auth token from tab');
        // Store the token data for independent operation
        await this.storeTokenData(tokenData);
        // Check if token is expired and attempt refresh if needed
        if (tokenData.expires_at && tokenData.refresh_token) {
          const expiresAt = new Date(tokenData.expires_at * 1000);
          const now = new Date();
          const timeUntilExpiry = expiresAt.getTime() - now.getTime();
          // If token expires in less than 5 minutes, try to refresh
          if (timeUntilExpiry < 5 * 60 * 1000) {
            console.log('🔄 Token expires soon, attempting refresh...');
            const refreshedToken = await this.refreshToken(tokenData.refresh_token, tabId);
            if (refreshedToken) {
              return refreshedToken;
            }
          }
        }
        return tokenData.access_token;
      }

      return null;
    } catch (error) {
      // Tab might not be accessible or script injection failed
      console.warn('Failed to get token from tab:', error);
      return null;
    }
  }

  /**
   * Refresh an expired access token using the refresh token
   */
  private async refreshToken(refreshToken: string, tabId?: number): Promise<string | null> {
    try {
      console.log('🔄 Attempting to refresh access token...');

      const response = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.anonKey,
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Token refresh successful');

        // Update localStorage with new token if we have tab access
        if (tabId && data.access_token) {
          try {
            const projectRef = this.supabaseUrl.split('://')[1].split('.')[0];
            await chrome.scripting.executeScript({
              target: { tabId },
              func: (projectRef: string, tokenData: any) => {
                const sessionKey = `sb-${projectRef}-auth-token`;
                const newSession = {
                  access_token: tokenData.access_token,
                  refresh_token: tokenData.refresh_token,
                  expires_at: tokenData.expires_at,
                  expires_in: tokenData.expires_in,
                  user: tokenData.user,
                };
                localStorage.setItem(sessionKey, JSON.stringify(newSession));
                console.log('🔄 Updated localStorage with refreshed token');
              },
              args: [projectRef, data],
            });
          } catch (error) {
            console.warn('Could not update localStorage with refreshed token:', error);
          }
        }

        // Store the new token data properly
        if (data.access_token) {
          await this.storeTokenData(data);
        }

        return data.access_token;
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.warn('❌ Token refresh failed:', response.status, errorData);
        return null;
      }
    } catch (error) {
      console.error('❌ Error refreshing token:', error);
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

        /* Store valid token for future use */
        await chrome.storage.local.set({ supabaseToken: token });

        return {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          updated_at: user.updated_at,
        };
      } else if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        console.warn('🔐 Token verification failed (403):', errorData);
        /* Check if session is completely invalidated (user logged out) */
        if (errorData.error_code === 'session_not_found') {
          console.log('🚫 Session invalidated - user logged out from bolt2github.com');
          /* Clear all stored tokens since session is invalid */
          await this.clearStoredTokens();
          /* Show re-authentication modal */
          await this.showReauthenticationModal();
          return null;
        }
        /* Check if it's an expired token error that can be refreshed */
        if (errorData.error_code === 'bad_jwt' || errorData.msg?.includes('expired')) {
          console.log('🔄 Token expired, attempting to refresh from localStorage...');
          /* Try to get refresh token and refresh */
          const refreshedToken = await this.attemptTokenRefresh();
          if (refreshedToken) {
            console.log('✅ Token refreshed successfully, retrying verification');
            return this.verifyTokenAndGetUser(refreshedToken);
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error verifying token:', error);
      return null;
    }
  }

  /**   * Attempt to refresh token using available refresh tokens from localStorage   */
  private async attemptTokenRefresh(): Promise<string | null> {
    try {
      // First priority: Use stored refresh token for independent operation
      const refreshedToken = await this.refreshStoredToken();
      if (refreshedToken) {
        return refreshedToken;
      }
      // Fallback: Try to get refresh token from browser tabs
      const tabs = await chrome.tabs.query({ url: 'https://bolt2github.com/*' });
      for (const tab of tabs) {
        if (tab.id) {
          const refreshToken = await this.getRefreshTokenFromTab(tab.id);
          if (refreshToken) {
            const newAccessToken = await this.refreshToken(refreshToken, tab.id);
            if (newAccessToken) {
              return newAccessToken;
            }
          }
        }
      }
      // Also try other tabs where user might have visited bolt2github.com
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (tab.id && tab.url?.includes('bolt2github.com')) {
          const refreshToken = await this.getRefreshTokenFromTab(tab.id);
          if (refreshToken) {
            const newAccessToken = await this.refreshToken(refreshToken, tab.id);
            if (newAccessToken) {
              return newAccessToken;
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error attempting token refresh:', error);
      return null;
    }
  }

  /**
   * Get refresh token from a specific tab
   */
  private async getRefreshTokenFromTab(tabId: number): Promise<string | null> {
    try {
      const projectRef = this.supabaseUrl.split('://')[1].split('.')[0];

      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (projectRef: string) => {
          const sessionKey = `sb-${projectRef}-auth-token`;
          const session = localStorage.getItem(sessionKey);

          if (session) {
            try {
              const parsed = JSON.parse(session);
              return parsed.refresh_token;
            } catch {
              return null;
            }
          }

          // Fallback: check for generic key
          const fallbackSession = localStorage.getItem('supabase.auth.token');
          if (fallbackSession) {
            try {
              const parsed = JSON.parse(fallbackSession);
              return parsed.refresh_token;
            } catch {
              return null;
            }
          }

          return null;
        },
        args: [projectRef],
      });

      return result[0]?.result || null;
    } catch (error) {
      console.warn('Failed to get refresh token from tab:', error);
      return null;
    }
  }

  /**
   * Get subscription status from Supabase RPC function
   */
  private async getSubscriptionStatus(
    token: string,
    user?: SupabaseUser
  ): Promise<SubscriptionStatus> {
    try {
      /* Use provided user or get from token */
      let userInfo = user;
      if (!userInfo) {
        const fetchedUser = await this.verifyTokenAndGetUser(token);
        if (!fetchedUser) {
          return { isActive: false, plan: 'free' };
        }
        userInfo = fetchedUser;
      }

      const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/get_subscription_status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          apikey: this.anonKey,
        },
        body: JSON.stringify({
          input_user_id: userInfo.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Raw subscription response:', data);

        // Handle array response from RPC function
        const subscriptionData = Array.isArray(data) ? data[0] : data;

        if (!subscriptionData) {
          console.log('⚠️ No subscription data found in response');
          return { isActive: false, plan: 'free' };
        }

        console.log('📋 Parsed subscription data:', subscriptionData);

        // Map the response to our SubscriptionStatus interface
        const isActive = subscriptionData.subscription_status === 'active';
        const plan = this.mapPlanName(subscriptionData.plan_name);

        console.log(`💰 Subscription parsed: isActive=${isActive}, plan=${plan}`);

        return {
          isActive,
          plan,
          expiresAt: subscriptionData.current_period_end,
          subscriptionId: undefined, // Not provided in this response
          customerId: undefined, // Not provided in this response
        };
      } else if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        console.warn('🔐 Subscription check failed (403):', errorData);
        /* Check if session is completely invalidated */
        if (errorData.error_code === 'session_not_found') {
          console.log('🚫 Session invalidated during subscription check');
          /* Clear stored tokens and show re-auth modal */
          await this.clearStoredTokens();
          await this.showReauthenticationModal();
          return { isActive: false, plan: 'free' };
        }
        /* Check if it's an expired token error that can be refreshed */
        if (errorData.error_code === 'bad_jwt' || errorData.msg?.includes('expired')) {
          console.log('🔄 Token expired during subscription check, attempting to refresh...');
          const refreshedToken = await this.attemptTokenRefresh();
          if (refreshedToken) {
            console.log('✅ Token refreshed, retrying subscription check');
            return this.getSubscriptionStatus(refreshedToken, user);
          }
        }
      }

      return { isActive: false, plan: 'free' };
    } catch (error) {
      console.error('Error getting subscription status:', error);
      return { isActive: false, plan: 'free' };
    }
  }

  /**
   * Map plan names from your backend to our internal plan types
   */
  private mapPlanName(planName: string | null): 'free' | 'monthly' | 'yearly' {
    if (!planName) return 'free';

    const lowerPlan = planName.toLowerCase();
    console.log(`🔍 Mapping plan name: "${planName}" -> "${lowerPlan}"`);

    if (
      lowerPlan.includes('yearly') ||
      lowerPlan.includes('annual') ||
      lowerPlan.includes('pro annual')
    ) {
      console.log('📅 Mapped to yearly plan');
      return 'yearly';
    } else if (lowerPlan.includes('monthly') || lowerPlan.includes('pro monthly')) {
      console.log('📅 Mapped to monthly plan');
      return 'monthly';
    }

    console.log('📅 Mapped to free plan (fallback)');
    return 'free';
  }

  /**
   * Update authentication state and notify listeners
   */
  private updateAuthState(newState: Partial<AuthState>): void {
    const previousState = { ...this.authState };
    this.authState = { ...this.authState, ...newState };

    /* Save to storage */
    this.saveAuthState();

    /* Log changes */
    if (previousState.isAuthenticated !== this.authState.isAuthenticated) {
      console.log(
        `🔐 Auth status changed: ${this.authState.isAuthenticated ? 'authenticated' : 'unauthenticated'}`
      );

      /* Restart periodic checks with appropriate interval when auth status changes */
      this.startPeriodicChecks();
    }

    if (previousState.subscription.isActive !== this.authState.subscription.isActive) {
      console.log(
        `💰 Subscription status changed: ${this.authState.subscription.isActive ? 'active' : 'inactive'} (${this.authState.subscription.plan})`
      );
    }

    /* Notify premium service of subscription changes */
    this.notifyPremiumService();
  }

  /**
   * Notify premium service of subscription status changes
   */
  private async notifyPremiumService(): Promise<void> {
    try {
      /* Send message to content script to update premium status */
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
              /* Tab might not have content script injected */
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
   * Get token expiration info for debugging
   */
  public async getTokenExpiration(): Promise<{
    expiresAt: number | null;
    timeUntilExpiry: number | null;
    isExpired: boolean;
  } | null> {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://bolt2github.com/*' });
      if (tabs.length > 0) {
        const projectRef = this.supabaseUrl.split('://')[1].split('.')[0];
        const result = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id! },
          func: (projectRef: string) => {
            const sessionKey = `sb-${projectRef}-auth-token`;
            const session = localStorage.getItem(sessionKey);
            if (session) {
              try {
                const parsed = JSON.parse(session);
                return parsed.expires_at;
              } catch {
                return null;
              }
            }
            return null;
          },
          args: [projectRef],
        });

        const expiresAt = result[0]?.result;
        if (expiresAt) {
          const expiresAtMs = expiresAt * 1000; /* Convert to milliseconds */
          const now = Date.now();
          const timeUntilExpiry = expiresAtMs - now;
          return {
            expiresAt: expiresAtMs,
            timeUntilExpiry,
            isExpired: timeUntilExpiry <= 0,
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting token expiration:', error);
      return null;
    }
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
      url: 'https://bolt2github.com/register',
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

  /**   * Clear all stored authentication tokens   */ private async clearStoredTokens(): Promise<void> {
    try {
      await chrome.storage.local.remove([
        'supabaseToken',
        'supabaseRefreshToken',
        'supabaseTokenExpiry',
        'supabaseAuthState',
      ]);
      /* Reset internal auth state */ this.authState = {
        isAuthenticated: false,
        user: null,
        subscription: { isActive: false, plan: 'free' },
      };
      console.log('🧹 Cleared all stored tokens and auth state');
    } catch (error) {
      console.warn('Failed to clear stored tokens:', error);
    }
  }
  /**   * Show re-authentication modal to user   */
  private async showReauthenticationModal(): Promise<void> {
    try {
      /* Send message to all bolt.new tabs to show re-authentication modal */
      const tabs = await chrome.tabs.query({ url: 'https://bolt.new/*' });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'SHOW_REAUTHENTICATION_MODAL',
              data: {
                message:
                  'Your session has expired. Please sign in again to continue using premium features.',
                actionText: 'Sign In',
                actionUrl: 'https://bolt2github.com/login',
              },
            })
            .catch(() => {
              /* Tab might not have content script injected, ignore error */
            });
        }
      }
      console.log('📢 Sent re-authentication modal requests to bolt.new tabs');
    } catch (error) {
      console.warn('Failed to show re-authentication modal:', error);
    }
  }
  /**   * Clean up resources   */
  public cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
