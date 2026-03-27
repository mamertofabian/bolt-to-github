/* eslint-disable no-console */

import { SUPABASE_CONFIG } from '../../lib/constants/supabase';
import { githubSettingsActions } from '../../lib/stores/githubSettings';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('SupabaseAuthService');

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

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
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

  // Message flooding prevention
  private lastPremiumStatusHash: string = '';
  private lastPremiumStatusUpdate: number = 0;
  private readonly PREMIUM_STATUS_UPDATE_COOLDOWN = 1000; // 1 second cooldown

  /* Auth state change listeners */
  private authStateListeners: Array<(authState: AuthState, previousState: AuthState) => void> = [];

  /* Configuration - replace with your actual Supabase project details */
  private readonly SUPABASE_URL = SUPABASE_CONFIG.URL;
  private readonly SUPABASE_ANON_KEY = SUPABASE_CONFIG.ANON_KEY;
  private readonly CHECK_INTERVAL_UNAUTHENTICATED = 30000; /* 30 seconds when not authenticated */
  private readonly CHECK_INTERVAL_AUTHENTICATED = 3600000; /* 1 hour when authenticated */
  private readonly CHECK_INTERVAL_PREMIUM = 900000; /* 15 minutes for premium users (more frequent validation) */

  /* New aggressive detection intervals for better onboarding experience */
  private readonly CHECK_INTERVAL_INITIAL_ONBOARDING = 2000; /* 2 seconds during initial onboarding */
  private readonly CHECK_INTERVAL_POST_CONNECTION = 1000; /* 1 second after user clicks connect */
  private readonly AGGRESSIVE_DETECTION_DURATION = 60000; /* 1 minute of aggressive detection (reduced from 2 min) */

  /* State tracking for aggressive detection */
  private isInitialOnboarding: boolean = true;
  private isPostConnectionMode: boolean = false;
  private postConnectionStartTime: number = 0;
  private aggressiveDetectionInterval: number | null = null;

  /* Guards against duplicate Chrome event listener registration */
  private initialAuthDetectionSetup: boolean = false;
  private subscriptionDetectionSetup: boolean = false;

  /* Extension reload tracking for self-healing */
  private consecutiveAuthFailures: number = 0;
  private lastReloadTimestamp: number = 0;
  private reloadRequested: boolean = false;
  private readonly MAX_AUTH_FAILURES_BEFORE_RELOAD = 3;
  private readonly MIN_TIME_BETWEEN_RELOADS = 5 * 60 * 1000; /* 5 minutes */

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
    logger.info('🔐 Initializing Supabase auth service (hybrid mode)');

    /* Load cached auth state */
    await this.loadCachedAuthState();

    /* Load last reload timestamp to prevent reload loops across restarts */
    await this.loadLastReloadTimestamp();

    /* Setup subscription upgrade detection (only for premium feature responsiveness) */
    this.setupSubscriptionUpgradeDetection();

    /* Setup initial authentication detection if not authenticated */
    this.setupInitialAuthDetection();

    /* Start periodic checks */
    this.startPeriodicChecks();

    /* Initial check */
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
        logger.info('📋 Loaded cached auth state:', this.authState.isAuthenticated);
      }
    } catch (error) {
      logger.error('Failed to load cached auth state:', error);
    }
  }

  /**
   * Load last reload timestamp from storage
   * This prevents reload loops after extension restarts
   */
  private async loadLastReloadTimestamp(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['lastExtensionReloadTimestamp']);
      if (result.lastExtensionReloadTimestamp) {
        this.lastReloadTimestamp = result.lastExtensionReloadTimestamp;
        const timeSinceReload = Date.now() - this.lastReloadTimestamp;
        logger.info(`📋 Loaded last reload timestamp: ${Math.round(timeSinceReload / 1000)}s ago`);
      }
    } catch (error) {
      logger.warn('Failed to load last reload timestamp:', error);
      // Not critical - default to 0 (no previous reload)
    }
  }

  /**
   * Save authentication state to storage
   */
  private async saveAuthState(): Promise<void> {
    try {
      await chrome.storage.local.set({ supabaseAuthState: this.authState });
    } catch (error) {
      logger.error('Failed to save auth state:', error);
    }
  }

  /**
   * Start periodic authentication checks with aggressive detection during onboarding.
   *
   * Uses chrome.alarms for long-running intervals (authenticated/premium modes)
   * since they survive service worker termination in MV3. Falls back to setInterval
   * for short aggressive detection modes (1-2s) where alarms aren't practical
   * (chrome.alarms minimum is 1 minute) and the modes only last ~60 seconds anyway.
   */
  private startPeriodicChecks(): void {
    /* Clear any existing interval timer */
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    /* Use different intervals based on authentication and subscription status */
    let interval: number;
    let mode: string;
    let useAlarm = false;

    if (!this.authState.isAuthenticated) {
      /* Check if we're in post-connection aggressive mode */
      if (this.isPostConnectionMode) {
        const timeSincePostConnection = Date.now() - this.postConnectionStartTime;
        if (timeSincePostConnection < this.AGGRESSIVE_DETECTION_DURATION) {
          interval = this.CHECK_INTERVAL_POST_CONNECTION;
          mode = 'post-connection';
        } else {
          /* Exit post-connection mode after timeout */
          this.isPostConnectionMode = false;
          this.stopAggressiveDetection();
          interval = this.isInitialOnboarding
            ? this.CHECK_INTERVAL_INITIAL_ONBOARDING
            : this.CHECK_INTERVAL_UNAUTHENTICATED;
          mode = this.isInitialOnboarding ? 'initial-onboarding' : 'unauthenticated';
        }
      } else if (this.isInitialOnboarding) {
        interval = this.CHECK_INTERVAL_INITIAL_ONBOARDING;
        mode = 'initial-onboarding';
      } else {
        interval = this.CHECK_INTERVAL_UNAUTHENTICATED;
        mode = 'unauthenticated';
      }
    } else {
      /* User is authenticated - disable aggressive detection */
      this.isInitialOnboarding = false;
      this.isPostConnectionMode = false;
      this.stopAggressiveDetection();

      if (this.authState.subscription.isActive) {
        interval = this.CHECK_INTERVAL_PREMIUM;
        mode = 'premium';
      } else {
        interval = this.CHECK_INTERVAL_AUTHENTICATED;
        mode = 'authenticated';
      }
      /* Use chrome.alarms for long-running authenticated modes (survives SW termination) */
      useAlarm = true;
    }

    if (useAlarm) {
      /* chrome.alarms survives service worker termination — reliable for long intervals.
       * The alarm handler in BackgroundService.setupAlarms() dispatches to checkAuthStatus(). */
      const periodInMinutes = Math.max(interval / 60000, 1); // chrome.alarms minimum is 1 minute
      try {
        chrome.alarms?.create?.('auth-periodic-check', { periodInMinutes });
        logger.info(
          `🔄 Started auth checks via chrome.alarms every ${periodInMinutes}min (${mode})`
        );
      } catch {
        /* Fallback to setInterval if alarms API unavailable (e.g. content script context) */
        this.checkInterval = setInterval(() => {
          this.checkAuthStatus();
        }, interval);
        logger.info(`🔄 Started auth checks via setInterval every ${interval / 1000}s (${mode})`);
      }
    } else {
      /* Short intervals for aggressive detection — setInterval is fine for these
       * since they only last ~60 seconds and the service worker stays alive during active use */
      this.checkInterval = setInterval(() => {
        this.checkAuthStatus();
      }, interval);
      /* Clear the alarm if we're switching to short-interval mode */
      chrome.alarms?.clear?.('auth-periodic-check')?.catch?.(() => {
        /* Alarm might not exist — ignore */
      });
      logger.info(`🔄 Started auth checks every ${interval / 1000}s (${mode})`);
    }
  }

  /**
   * Stop aggressive detection timers
   */
  private stopAggressiveDetection(): void {
    if (this.aggressiveDetectionInterval) {
      clearInterval(this.aggressiveDetectionInterval);
      this.aggressiveDetectionInterval = null;
      logger.info('🛑 Stopped aggressive detection');
    }
  }

  /**
   * Enter post-connection aggressive detection mode
   */
  public enterPostConnectionMode(): void {
    logger.info('🚀 Entering post-connection aggressive detection mode');
    this.isPostConnectionMode = true;
    this.postConnectionStartTime = Date.now();

    /* Start immediate aggressive detection */
    this.startAggressiveDetection();

    /* Restart periodic checks with new interval */
    this.startPeriodicChecks();
  }

  /**
   * Start aggressive token detection with progressive backoff for performance
   */
  private startAggressiveDetection(): void {
    this.stopAggressiveDetection();

    let attemptCount = 0;
    const maxAttempts = 60; // 1 minute max duration

    logger.info('⚡ Starting aggressive token detection with progressive backoff');
    this.aggressiveDetectionInterval = setInterval(async () => {
      try {
        attemptCount++;

        if (!this.authState.isAuthenticated) {
          const tokenData = await this.extractTokenFromActiveTabs();
          if (tokenData?.access_token) {
            logger.info('🎯 Aggressive detection found tokens!');
            await this.storeTokenData(tokenData);
            await this.checkAuthStatus();

            if (this.authState.isAuthenticated) {
              this.stopAggressiveDetection();
              return;
            }
          }
        }

        // Stop after max attempts to prevent indefinite polling
        if (attemptCount >= maxAttempts) {
          logger.info('⏰ Aggressive detection timeout reached, stopping');
          this.stopAggressiveDetection();
        }
      } catch (error) {
        logger.error('Error in aggressive detection:', error);
      }
    }, 1000) as unknown as number; /* Check every 1 second (improved from 500ms) */
  }

  /**
   * Setup initial authentication detection (enhanced for better onboarding)
   * This monitors bolt2github.com to capture initial login tokens
   */
  private setupInitialAuthDetection(): void {
    try {
      /* Only monitor if user is not authenticated */
      if (this.authState.isAuthenticated) {
        logger.info('🔐 User already authenticated, skipping initial auth detection');
        return;
      }

      /* Prevent duplicate Chrome event listener registration.
       * Chrome listeners accumulate — they cannot be removed without a reference,
       * and re-calling addListener adds another copy. */
      if (this.initialAuthDetectionSetup) {
        logger.info('🔐 Initial auth detection listeners already registered, skipping');
        return;
      }
      this.initialAuthDetectionSetup = true;

      logger.info('🔍 Setting up enhanced initial authentication detection for bolt2github.com');

      /* Enhanced tab monitoring - check on any tab update, not just complete loads */
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (!this.authState.isAuthenticated && tab.url && tab.url.includes('bolt2github.com')) {
          /* Check on both loading and complete states for faster detection */
          if (changeInfo.status === 'complete' || changeInfo.status === 'loading') {
            logger.info(
              `🔍 Detected bolt2github.com ${changeInfo.status}, checking for authentication...`
            );

            /* Reduced delay for faster detection */
            setTimeout(
              async () => {
                const tokenData = await this.extractTokenFromTab(tabId);
                if (tokenData?.access_token) {
                  logger.info('✅ Found authentication tokens on bolt2github.com, storing...');
                  await this.storeTokenData(tokenData);

                  /* Force immediate auth check with new tokens */
                  await this.checkAuthStatus();

                  /* If now authenticated, exit onboarding mode */
                  if (this.authState.isAuthenticated) {
                    logger.info('🎉 Initial authentication successful - extension now independent');
                    this.isInitialOnboarding = false;
                    this.stopAggressiveDetection();
                  }
                }
              },
              changeInfo.status === 'complete' ? 500 : 1500
            ); /* Faster for complete loads */
          }

          /* Also check on URL changes (for SPA navigation) */
          if (changeInfo.url) {
            logger.info('🔍 Detected bolt2github.com URL change, checking for authentication...');
            setTimeout(async () => {
              const tokenData = await this.extractTokenFromTab(tabId);
              if (tokenData?.access_token) {
                logger.info('✅ Found authentication tokens after URL change, storing...');
                await this.storeTokenData(tokenData);
                await this.checkAuthStatus();

                if (this.authState.isAuthenticated) {
                  this.isInitialOnboarding = false;
                  this.stopAggressiveDetection();
                }
              }
            }, 1000);
          }
        }
      });

      /* Monitor tab activation (when user switches to bolt2github.com tab) */
      chrome.tabs.onActivated.addListener(async (activeInfo: chrome.tabs.TabActiveInfo) => {
        if (!this.authState.isAuthenticated) {
          try {
            const tab = await chrome.tabs.get(activeInfo.tabId);
            if (tab.url && tab.url.includes('bolt2github.com')) {
              logger.info(
                '🔍 User switched to bolt2github.com tab, checking for authentication...'
              );
              setTimeout(async () => {
                const tokenData = await this.extractTokenFromTab(activeInfo.tabId);
                if (tokenData?.access_token) {
                  logger.info('✅ Found authentication tokens on tab activation, storing...');
                  await this.storeTokenData(tokenData);
                  await this.checkAuthStatus();

                  if (this.authState.isAuthenticated) {
                    this.isInitialOnboarding = false;
                    this.stopAggressiveDetection();
                  }
                }
              }, 500);
            }
          } catch {
            /* Tab might not exist or be accessible */
          }
        }
      });

      logger.info(
        '🔍 Enhanced initial authentication detection active (monitoring bolt2github.com)'
      );
    } catch (error) {
      logger.error('Failed to setup initial authentication detection:', error);
    }
  }

  /**
   * Setup subscription upgrade detection (only watches upgrade/billing pages)
   * This maintains independence while allowing quick premium feature activation
   */
  private setupSubscriptionUpgradeDetection(): void {
    try {
      /* Prevent duplicate Chrome event listener registration */
      if (this.subscriptionDetectionSetup) {
        logger.info('💰 Subscription detection listeners already registered, skipping');
        return;
      }
      this.subscriptionDetectionSetup = true;

      /* Only listen for specific upgrade/billing related pages */
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        /* Only check if user is authenticated and on upgrade/billing pages */
        if (
          this.authState.isAuthenticated &&
          changeInfo.status === 'complete' &&
          tab.url &&
          (tab.url.includes('bolt2github.com/upgrade') ||
            tab.url.includes('bolt2github.com/billing') ||
            tab.url.includes('bolt2github.com/checkout') ||
            tab.url.includes('bolt2github.com/subscription'))
        ) {
          logger.info('💰 Detected upgrade/billing page, checking subscription status...');

          /* Give a moment for any backend processing to complete */
          setTimeout(async () => {
            const wasActive = this.authState.subscription.isActive;
            await this.validateSubscriptionStatus();

            /* If subscription status changed, notify user immediately */
            if (!wasActive && this.authState.subscription.isActive) {
              logger.info('🎉 Subscription upgraded! Notifying user...');
              await this.notifySubscriptionUpgrade();
            }
          }, 2000); /* 2 second delay for backend processing */
        }
      });

      logger.info('💰 Setup subscription upgrade detection for billing pages');
    } catch (error) {
      logger.error('Failed to setup subscription upgrade detection:', error);
    }
  }

  /**
   * Notify user about successful subscription upgrade
   */
  private async notifySubscriptionUpgrade(): Promise<void> {
    try {
      /* Send message to all bolt.new tabs about upgrade */
      const tabs = await chrome.tabs.query({ url: 'https://bolt.new/*' });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'SUBSCRIPTION_UPGRADED',
              data: {
                message:
                  '🎉 Subscription upgraded successfully! Premium features are now available.',
                plan: this.authState.subscription.plan,
                showSuccessMessage: true,
              },
            })
            .catch(() => {
              /* Tab might not have content script injected */
            });
        }
      }
      logger.info('📢 Sent subscription upgrade notifications');
    } catch (error) {
      logger.error('Failed to send subscription upgrade notification:', error);
    }
  }

  /**
   * Check authentication status by looking for Supabase session
   */
  private async checkAuthStatus(): Promise<void> {
    try {
      logger.info('🔄 Checking authentication status...');

      /* Try to get authentication token from various sources */
      const token = await this.getAuthToken();

      if (token) {
        logger.info('🔐 Found authentication token');

        /* Verify token and get user info */
        const user = await this.verifyTokenAndGetUser(token);
        if (user) {
          logger.info(`👤 Verified user: ${user.email}`);

          /* Get subscription status using the user info */
          const subscription = await this.getSubscriptionStatus(token, user);

          logger.info(
            `💰 Subscription status: ${subscription.isActive ? 'active' : 'inactive'} (${subscription.plan})`
          );

          this.updateAuthState({
            isAuthenticated: true,
            user,
            subscription,
          });

          /* Check for GitHub App installation and sync */
          await this.checkGitHubAppInstallation(token);

          /* Trigger GitHub settings store re-initialization to update hasInitialSettings */
          try {
            await githubSettingsActions.initialize();
            logger.info('✅ GitHub settings store re-initialized after authentication');
          } catch (initError) {
            logger.warn('Failed to re-initialize GitHub settings store:', initError);
          }
        } else {
          logger.error('❌ Token verification failed');
          this.updateAuthState({
            isAuthenticated: false,
            user: null,
            subscription: { isActive: false, plan: 'free' },
          });

          // Proactively trigger re-authentication flow so the user is guided to sign back in
          if (!this.isPostConnectionMode) {
            await this.triggerReAuthentication('Token verification failed');
          }
        }
      } else {
        logger.error('❌ No authentication token found');
        this.updateAuthState({
          isAuthenticated: false,
          user: null,
          subscription: { isActive: false, plan: 'free' },
        });

        // No token at all – kick off onboarding / re-auth automatically
        if (!this.isPostConnectionMode) {
          await this.triggerReAuthentication('No authentication token found');
        }
      }
    } catch (error) {
      logger.error('Error checking auth status:', error);
    }
  }

  /**
   * Trigger re-authentication: logout, enter aggressive detection, show modal and
   * ask the background script to open bolt2github.com so the user can connect.
   */
  private async triggerReAuthentication(reason: string): Promise<void> {
    try {
      logger.info(`🔐 Triggering re-authentication flow – reason: ${reason}`);

      // Don't increment or proceed if reload has already been requested
      if (this.reloadRequested) {
        logger.info('⏸️ Extension reload already requested, skipping re-auth flow');
        return;
      }

      // Increment failure counter
      this.consecutiveAuthFailures++;
      logger.info(
        `📊 Consecutive auth failures: ${this.consecutiveAuthFailures}/${this.MAX_AUTH_FAILURES_BEFORE_RELOAD}`
      );

      // Check if we've hit the threshold for extension reload
      if (this.consecutiveAuthFailures >= this.MAX_AUTH_FAILURES_BEFORE_RELOAD) {
        // Set flag immediately to prevent race conditions with concurrent calls
        if (this.reloadRequested) {
          logger.info('⏸️ Extension reload already in progress, skipping duplicate request');
          return;
        }
        this.reloadRequested = true;

        logger.warn(
          `⚠️ Reached maximum auth failures (${this.MAX_AUTH_FAILURES_BEFORE_RELOAD}). ` +
            `Requesting extension reload to clear stale state.`
        );
        await this.requestExtensionReload();
        return; // Don't proceed with normal re-auth flow - reload will handle it
      }

      // Ensure we start from a clean state
      await this.logout();

      // Aggressive detection for fast token pickup once user connects
      this.enterPostConnectionMode();

      // Show in-page modal prompting sign-in
      await this.showReauthenticationModal();

      // Ask background to open bolt2github.com (service-worker context handles window/tab)
      try {
        if (chrome.runtime?.id) {
          await chrome.runtime.sendMessage({
            type: 'OPEN_REAUTHENTICATION',
            data: {
              reason,
              action: 'reconnect_github',
            },
          });
        }
      } catch (msgError) {
        logger.warn('Could not request background to open re-auth page:', msgError);
      }
    } catch (err) {
      logger.error('Error during triggerReAuthentication:', err);
    }
  }

  /**
   * Get authentication token (hybrid mode - stored tokens + bolt2github.com fallback when not authenticated)
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      logger.info('🔐 Getting auth token (hybrid mode)');

      /* Method 1: Check stored tokens first */
      const storedToken = await this.getValidStoredToken();
      if (storedToken) {
        return storedToken;
      }

      /* Method 2: Attempt refresh with stored refresh token */
      const refreshedToken = await this.refreshStoredToken();
      if (refreshedToken) {
        return refreshedToken;
      }

      /* Method 3: If not authenticated, check bolt2github.com tabs as fallback */
      if (!this.authState.isAuthenticated) {
        logger.info('🔍 No stored tokens found, checking bolt2github.com tabs...');
        const tabToken = await this.extractTokenFromActiveTabs();
        if (tabToken) {
          logger.info('✅ Found token in bolt2github.com tab, storing for future use');
          await this.storeTokenData(tabToken);
          return tabToken.access_token;
        }
      }

      /* No tokens available - user needs to authenticate */
      logger.error('❌ No authentication tokens available - user needs to authenticate');
      return null;
    } catch (error) {
      logger.error('Error getting auth token:', error);
      return null;
    }
  }

  /**
   * Get valid stored token or refresh if expired
   */
  private async getValidStoredToken(): Promise<string | null> {
    try {
      const storedTokens = await chrome.storage.local.get([
        'supabaseToken',
        'supabaseRefreshToken',
        'supabaseTokenExpiry',
        'refreshTokenIssuedAt', // Track when refresh token was issued
      ]);

      if (!storedTokens.supabaseToken) {
        return null;
      }

      /* Check if token is still valid */
      const now = Date.now();
      const expiry = storedTokens.supabaseTokenExpiry || 0;

      if (expiry > now + 5 * 60 * 1000) {
        /* Token valid for more than 5 minutes */
        logger.info('✅ Using stored access token (valid)');
        return storedTokens.supabaseToken;
      } else if (storedTokens.supabaseRefreshToken) {
        /* Check if refresh token might be too old (Supabase refresh tokens expire after ~30 days of inactivity) */
        const refreshTokenAge = storedTokens.refreshTokenIssuedAt
          ? now - storedTokens.refreshTokenIssuedAt
          : 0;
        const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

        if (refreshTokenAge > REFRESH_TOKEN_MAX_AGE) {
          logger.warn(
            `🕐 Refresh token is very old (${Math.round(
              refreshTokenAge / (24 * 60 * 60 * 1000)
            )} days). Likely expired. Clearing tokens to force re-authentication.`
          );
          /* Clear tokens immediately if refresh token is too old */
          await chrome.storage.local.remove([
            'supabaseToken',
            'supabaseRefreshToken',
            'supabaseTokenExpiry',
            'refreshTokenIssuedAt',
          ]);
          return null;
        }

        /* Token expired or expires soon, try to refresh */
        logger.info('🔄 Stored token expired/expiring, refreshing...');
        return await this.refreshStoredToken();
      }

      return null;
    } catch (error) {
      logger.error('Error getting valid stored token:', error);
      return null;
    }
  }

  /**
   * Store token data securely in chrome storage
   */
  private async storeTokenData(tokenData: TokenData): Promise<void> {
    try {
      const expiresAt = tokenData.expires_at
        ? tokenData.expires_at * 1000
        : Date.now() + 3600 * 1000; /* 1 hour default */

      const storageData: Record<string, unknown> = {
        supabaseToken: tokenData.access_token,
        supabaseTokenExpiry: expiresAt,
      };

      /* Only store refresh token if it exists and is not empty */
      if (tokenData.refresh_token && tokenData.refresh_token.trim() !== '') {
        storageData.supabaseRefreshToken = tokenData.refresh_token;
        /* Track when refresh token was issued to detect expired refresh tokens */
        storageData.refreshTokenIssuedAt = Date.now();
        logger.info('💾 Storing refresh token (length:', tokenData.refresh_token.length, ')');
      } else {
        logger.error('⚠️ No valid refresh token to store');
      }

      await chrome.storage.local.set(storageData);

      logger.info('💾 Stored token data in chrome storage:', {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresAt: new Date(expiresAt),
      });
    } catch (error) {
      logger.error('Failed to store token data:', error);
    }
  }

  /**
   * Extract tokens from currently active bolt2github.com tabs
   */
  private async extractTokenFromActiveTabs(): Promise<TokenData | null> {
    try {
      logger.info('🔍 Looking for authentication tokens in bolt2github.com tabs...');

      const tabs = await chrome.tabs.query({ url: 'https://bolt2github.com/*' });
      logger.info(`🔍 Found ${tabs.length} bolt2github.com tabs`);

      if (tabs.length === 0) {
        logger.error('❌ No bolt2github.com tabs found');
        return null;
      }

      for (const tab of tabs) {
        if (tab.id) {
          logger.info(`🔍 Checking tab ${tab.id}: ${tab.url}`);
          const tokenData = await this.extractTokenFromTab(tab.id);

          if (tokenData?.access_token) {
            logger.info('✅ Found valid tokens in tab');
            return tokenData;
          }
        }
      }

      logger.error('❌ No valid tokens found in any bolt2github.com tabs');
      return null;
    } catch (error) {
      logger.error('Error extracting tokens from active tabs:', error);
      return null;
    }
  }

  /**
   * Extract token data from a specific tab's localStorage
   */
  private async extractTokenFromTab(tabId: number): Promise<TokenData | null> {
    try {
      /* Extract project reference from Supabase URL */
      const projectRef = this.supabaseUrl.split('://')[1].split('.')[0];

      /* Context Separation: chrome.scripting.executeScript runs the function 
      in the target web page's JavaScript context, not in the Chrome extension's context. 
      Missing Dependencies: The logger object is created in the extension context 
      with createLogger('SupabaseAuthService') but doesn't exist in the web page context. */
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (projectRef: string) => {
          /* Collect logs to return to extension */
          const logs: Array<{ level: 'info' | 'error'; message: string; data?: unknown }> = [];
          const log = (message: string, data?: unknown) => {
            const logEntry: { level: 'info' | 'error'; message: string; data?: unknown } = {
              level: 'info',
              message,
            };
            if (data !== undefined) {
              logEntry.data = data;
            }
            logs.push(logEntry);
            if (data !== undefined) {
              console.log(message, data);
            } else {
              console.log(message);
            }
          };
          const logError = (message: string, data?: unknown) => {
            const logEntry: { level: 'info' | 'error'; message: string; data?: unknown } = {
              level: 'error',
              message,
            };
            if (data !== undefined) {
              logEntry.data = data;
            }
            logs.push(logEntry);
            if (data !== undefined) {
              console.error(message, data);
            } else {
              console.error(message);
            }
          };

          log(`🔍 Starting token extraction for project: ${projectRef}`);

          /* List all localStorage keys for debugging */
          const allKeys = Object.keys(localStorage);
          const supabaseKeys = allKeys.filter(
            (key) => key.includes('supabase') || key.includes('sb-') || key.includes('auth')
          );
          log(
            `🔍 Found ${allKeys.length} localStorage keys, ${supabaseKeys.length} Supabase-related:`,
            supabaseKeys
          );

          /* Method 1: Check for project-specific auth token */
          const sessionKey = `sb-${projectRef}-auth-token`;
          let session = localStorage.getItem(sessionKey);
          log(`🔍 Checking key: ${sessionKey}`, session ? 'Found' : 'Not found');

          if (session) {
            log('✅ Found auth token with project-specific key');
            try {
              const parsed = JSON.parse(session);
              log('📋 Parsed session structure:', Object.keys(parsed));

              return {
                tokenData: {
                  access_token: parsed.access_token || parsed.token,
                  refresh_token: parsed.refresh_token,
                  expires_at: parsed.expires_at,
                  expires_in: parsed.expires_in,
                },
                logs,
              };
            } catch (error) {
              logError('❌ Failed to parse project-specific session:', error);
              return {
                tokenData: { access_token: session, refresh_token: undefined },
                logs,
              };
            }
          }

          /* Method 2: Check for session in user object format */
          const userSessionKey = `sb-${projectRef}-auth-user`;
          const userSession = localStorage.getItem(userSessionKey);
          log(
            `🔍 Checking user session key: ${userSessionKey}`,
            userSession ? 'Found' : 'Not found'
          );

          if (userSession) {
            try {
              const userParsed = JSON.parse(userSession);
              log('📋 User session structure:', Object.keys(userParsed));

              if (userParsed.session) {
                const sessionData = userParsed.session;
                log('📋 Session data structure:', Object.keys(sessionData));

                return {
                  tokenData: {
                    access_token: sessionData.access_token,
                    refresh_token: sessionData.refresh_token,
                    expires_at: sessionData.expires_at,
                    expires_in: sessionData.expires_in,
                  },
                  logs,
                };
              }
            } catch (error) {
              logError('❌ Failed to parse user session:', error);
            }
          }

          /* Method 3: Check for generic Supabase session keys */
          const genericKeys = [
            'supabase.auth.token',
            'supabase.session',
            `sb.${projectRef}.session`,
            'supabase.auth.session',
          ];

          for (const key of genericKeys) {
            session = localStorage.getItem(key);
            log(`🔍 Checking generic key: ${key}`, session ? 'Found' : 'Not found');

            if (session) {
              try {
                const parsed = JSON.parse(session);
                log('📋 Generic session structure:', Object.keys(parsed));

                /* Handle different session structures */
                const sessionData = parsed.session || parsed;

                if (sessionData.access_token || sessionData.token) {
                  return {
                    tokenData: {
                      access_token: sessionData.access_token || sessionData.token,
                      refresh_token: sessionData.refresh_token,
                      expires_at: sessionData.expires_at,
                      expires_in: sessionData.expires_in,
                    },
                    logs,
                  };
                }
              } catch (error) {
                logError(`❌ Failed to parse session for key ${key}:`, error);
                /* If JSON parsing fails but we have a string, treat as direct token */
                if (typeof session === 'string' && session.length > 20) {
                  return {
                    tokenData: { access_token: session, refresh_token: undefined },
                    logs,
                  };
                }
              }
            }
          }

          /* Method 4: Search through all localStorage for Supabase patterns */
          log('🔍 Searching all localStorage keys for Supabase sessions...');
          for (const key of allKeys) {
            if ((key.includes('supabase') || key.includes('sb-')) && key.includes('auth')) {
              const value = localStorage.getItem(key);
              if (value) {
                try {
                  const parsed = JSON.parse(value);
                  if (parsed && (parsed.access_token || parsed.token || parsed.session)) {
                    log(`✅ Found potential session in key: ${key}`);

                    const sessionData = parsed.session || parsed;
                    if (sessionData.access_token || sessionData.token) {
                      return {
                        tokenData: {
                          access_token: sessionData.access_token || sessionData.token,
                          refresh_token: sessionData.refresh_token,
                          expires_at: sessionData.expires_at,
                          expires_in: sessionData.expires_in,
                        },
                        logs,
                      };
                    }
                  }
                } catch {
                  /* Not JSON, skip */
                }
              }
            }
          }

          logError('❌ No auth token found in localStorage after exhaustive search');
          return { tokenData: null, logs };
        },
        args: [projectRef],
      });

      const scriptResult = result[0]?.result || null;

      if (scriptResult) {
        /* Process logs from injected script */
        if (scriptResult.logs) {
          for (const logEntry of scriptResult.logs) {
            if (logEntry.level === 'error') {
              if (logEntry.data !== undefined) {
                logger.error(logEntry.message, logEntry.data);
              } else {
                logger.error(logEntry.message);
              }
            } else {
              if (logEntry.data !== undefined) {
                logger.info(logEntry.message, logEntry.data);
              } else {
                logger.info(logEntry.message);
              }
            }
          }
        }

        /* Extract token data */
        const tokenData = scriptResult.tokenData;

        if (tokenData) {
          logger.info('🎯 Successfully extracted token data:', {
            hasAccessToken: !!tokenData.access_token,
            hasRefreshToken: !!tokenData.refresh_token,
            expiresAt: tokenData.expires_at,
          });
        }

        return tokenData;
      }

      return null;
    } catch (error) {
      logger.error('Failed to extract token from tab:', error);
      return null;
    }
  }

  /**
   * Refresh stored token using stored refresh token
   */
  private async refreshStoredToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get([
        'supabaseRefreshToken',
        'refreshTokenIssuedAt',
      ]);
      const refreshToken = result.supabaseRefreshToken;

      if (!refreshToken) {
        logger.warn('❌ No stored refresh token available');
        return null;
      }

      logger.info('🔄 Attempting to refresh stored token...');
      const refreshedToken = await this.performTokenRefresh(refreshToken);

      /* If refresh was successful, update the refresh token issue timestamp */
      if (refreshedToken) {
        await chrome.storage.local.set({ refreshTokenIssuedAt: Date.now() });
      }

      return refreshedToken;
    } catch (error) {
      logger.error('❌ Error refreshing stored token:', error);
      return null;
    }
  }

  /**
   * Perform actual token refresh with Supabase API
   */
  private async performTokenRefresh(refreshToken: string): Promise<string | null> {
    try {
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
        logger.info('✅ Token refresh successful');

        /* Store the new tokens */
        if (data.access_token) {
          const tokenData: TokenData = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || refreshToken,
            expires_at: data.expires_at,
            expires_in: data.expires_in,
          };
          await this.storeTokenData(tokenData);
        }

        return data.access_token;
      } else {
        const errorData = await response.json().catch(() => ({}));
        logger.warn('❌ Token refresh failed:', response.status, errorData);

        /* Check if refresh token itself is expired or invalid */
        const isRefreshTokenExpired =
          response.status === 400 && errorData.error_description?.includes('refresh');
        const isInvalidGrant =
          errorData.error === 'invalid_grant' || errorData.error_description?.includes('invalid');

        if (isRefreshTokenExpired || isInvalidGrant) {
          logger.error(
            '🕐 Refresh token is expired or invalid. Both access and refresh tokens need re-authentication.'
          );
        }

        /* If refresh failed, clear stored tokens */
        await chrome.storage.local.remove([
          'supabaseToken',
          'supabaseRefreshToken',
          'supabaseTokenExpiry',
          'refreshTokenIssuedAt',
        ]);
        return null;
      }
    } catch (error) {
      logger.error('❌ Error performing token refresh:', error);
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
      } else if (response.status === 401 || response.status === 403) {
        /* Supabase can return either 401 or 403 for expired/invalid tokens */
        const errorData = await response.json().catch(() => ({}));
        logger.warn(`🔐 Token verification failed (${response.status}):`, errorData);

        /* Check if session is completely invalidated (user logged out) */
        if (errorData.error_code === 'session_not_found') {
          logger.info('🚫 Session invalidated - user logged out from bolt2github.com');
          await this.handleSessionInvalidation();
          return null;
        }

        /* Check if it's an expired token error that can be refreshed */
        if (
          errorData.error_code === 'bad_jwt' ||
          errorData.msg?.includes('expired') ||
          errorData.error_description?.includes('expired') ||
          response.status === 401
        ) {
          logger.info('🔄 Token expired, attempting to refresh...');
          const refreshedToken = await this.refreshStoredToken();
          if (refreshedToken) {
            logger.info('✅ Token refreshed successfully, retrying verification');
            return this.verifyTokenAndGetUser(refreshedToken);
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Error verifying token:', error);
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
        logger.info('🔍 Raw subscription response:', data);

        /* Handle array response from RPC function */
        const subscriptionData = Array.isArray(data) ? data[0] : data;

        if (!subscriptionData) {
          logger.warn('⚠️ No subscription data found in response');
          return { isActive: false, plan: 'free' };
        }

        logger.info('📋 Parsed subscription data:', subscriptionData);

        /* Map the response to our SubscriptionStatus interface */
        const isActive = subscriptionData.subscription_status === 'active';
        const plan = this.mapPlanName(subscriptionData.plan_name);

        logger.info(`💰 Subscription parsed: isActive=${isActive}, plan=${plan}`);

        return {
          isActive,
          plan,
          expiresAt: subscriptionData.current_period_end,
          subscriptionId: undefined /* Not provided in this response */,
          customerId: undefined /* Not provided in this response */,
        };
      } else if (response.status === 401 || response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        logger.warn(`🔐 Subscription check failed (${response.status}):`, errorData);

        /* Check if session is completely invalidated */
        if (errorData.error_code === 'session_not_found') {
          logger.info('🚫 Session invalidated during subscription check');
          await this.handleSessionInvalidation();
          return { isActive: false, plan: 'free' };
        }

        /* Check if it's an expired token error that can be refreshed */
        if (
          errorData.error_code === 'bad_jwt' ||
          errorData.msg?.includes('expired') ||
          errorData.error_description?.includes('expired') ||
          response.status === 401
        ) {
          logger.info('🔄 Token expired during subscription check, attempting to refresh...');
          const refreshedToken = await this.refreshStoredToken();
          if (refreshedToken) {
            logger.info('✅ Token refreshed, retrying subscription check');
            return this.getSubscriptionStatus(refreshedToken, user);
          }
        }
      }

      return { isActive: false, plan: 'free' };
    } catch (error) {
      logger.error('Error getting subscription status:', error);
      return { isActive: false, plan: 'free' };
    }
  }

  /**
   * Handle session invalidation by clearing tokens and showing re-auth modal
   */
  private async handleSessionInvalidation(): Promise<void> {
    /* Clear all stored tokens including refresh token issue date */
    await chrome.storage.local.remove([
      'supabaseToken',
      'supabaseRefreshToken',
      'supabaseTokenExpiry',
      'refreshTokenIssuedAt',
    ]);
    /* Reset internal auth state */
    this.authState = {
      isAuthenticated: false,
      user: null,
      subscription: { isActive: false, plan: 'free' },
    };
    /* Show re-authentication modal */
    await this.showReauthenticationModal();
  }

  /**
   * Map plan names from backend to internal plan types
   */
  private mapPlanName(planName: string | null): 'free' | 'monthly' | 'yearly' {
    if (!planName) return 'free';

    const lowerPlan = planName.toLowerCase();
    logger.info(`🔍 Mapping plan name: "${planName}" -> "${lowerPlan}"`);

    if (
      lowerPlan.includes('yearly') ||
      lowerPlan.includes('annual') ||
      lowerPlan.includes('pro annual')
    ) {
      logger.info('📅 Mapped to yearly plan');
      return 'yearly';
    } else if (lowerPlan.includes('monthly') || lowerPlan.includes('pro monthly')) {
      logger.info('📅 Mapped to monthly plan');
      return 'monthly';
    }

    logger.info('📅 Mapped to free plan (fallback)');
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
      logger.info(
        `🔐 Auth status changed: ${this.authState.isAuthenticated ? 'authenticated' : 'unauthenticated'}`
      );

      /* Restart periodic checks with appropriate interval when auth status changes */
      this.startPeriodicChecks();

      /* If user became authenticated, they no longer need initial auth detection */
      /* If user became unauthenticated, restart initial auth detection */
      if (this.authState.isAuthenticated && !previousState.isAuthenticated) {
        logger.info('🎉 User authenticated - extension now independent from bolt2github.com');
        /* Reset failure counter and reload flag on successful authentication */
        this.consecutiveAuthFailures = 0;
        this.reloadRequested = false;
        logger.info('✅ Reset consecutive auth failures counter after successful authentication');
      } else if (!this.authState.isAuthenticated && previousState.isAuthenticated) {
        logger.info('🔄 User unauthenticated - restarting initial auth detection');
        this.setupInitialAuthDetection();
      }
    }

    if (previousState.subscription.isActive !== this.authState.subscription.isActive) {
      logger.info(
        `💰 Subscription status changed: ${this.authState.subscription.isActive ? 'active' : 'inactive'} (${this.authState.subscription.plan})`
      );
    }

    /* Notify auth state listeners */
    this.notifyAuthStateListeners(previousState);

    /* Notify premium service of subscription changes */
    this.notifyPremiumService();
  }

  /**
   * Notify premium service of subscription status changes (with flooding prevention)
   */
  private async notifyPremiumService(): Promise<void> {
    try {
      const premiumStatusData = {
        isAuthenticated: this.authState.isAuthenticated,
        isPremium: this.authState.subscription.isActive,
        plan: this.authState.subscription.plan,
        expiresAt: this.authState.subscription.expiresAt,
      };

      // Create hash to detect actual changes
      const statusHash = JSON.stringify(premiumStatusData);
      const now = Date.now();

      // Check if status has actually changed or if we're within cooldown period
      if (
        statusHash === this.lastPremiumStatusHash ||
        now - this.lastPremiumStatusUpdate < this.PREMIUM_STATUS_UPDATE_COOLDOWN
      ) {
        logger.debug('Premium status unchanged or within cooldown period, skipping update');
        return;
      }

      this.lastPremiumStatusHash = statusHash;
      this.lastPremiumStatusUpdate = now;

      /* Always update popup premium status directly in sync storage */
      try {
        await chrome.storage.sync.set({
          popupPremiumStatus: {
            isAuthenticated: premiumStatusData.isAuthenticated,
            isPremium: premiumStatusData.isPremium,
            plan: this.mapPlanToDisplayName(premiumStatusData.plan),
            expiresAt: premiumStatusData.expiresAt
              ? new Date(premiumStatusData.expiresAt).getTime()
              : undefined,
            features: {
              viewFileChanges: premiumStatusData.isPremium,
              pushReminders: premiumStatusData.isPremium,
              branchSelector: premiumStatusData.isPremium,
              githubIssues: premiumStatusData.isPremium,
            },
            lastUpdated: Date.now(),
          },
        });
        logger.info('✅ Updated popup premium status directly in storage:', premiumStatusData);
      } catch (storageError) {
        logger.warn('Failed to update popup premium status in storage:', storageError);
      }

      /* Send message to content script to update premium status on bolt.new tabs */
      /* Only send to active tab to reduce message flooding */
      /* Note: This is intentional - inactive tabs will get the update when they become active */
      const tabs = await chrome.tabs.query({ active: true, url: 'https://bolt.new/*' });
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            type: 'UPDATE_PREMIUM_STATUS',
            data: premiumStatusData,
            messageId: `premium-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Add unique message ID with random component
          })
          .catch(() => {
            /* Tab might not have content script injected */
            logger.debug('Could not send premium status update to active tab');
          });

        logger.debug('Premium status update sent to active tab only');
      } else {
        logger.debug('No active bolt.new tabs found for premium status update');
      }
    } catch (error) {
      logger.error('Error notifying premium service:', error);
    }
  }

  /**
   * Map internal plan names to display names
   */
  private mapPlanToDisplayName(plan: 'free' | 'monthly' | 'yearly'): string {
    switch (plan) {
      case 'yearly':
        return 'pro annual';
      case 'monthly':
        return 'pro monthly';
      case 'free':
      default:
        return 'free';
    }
  }

  /**
   * Force a manual check of authentication status
   */
  public async forceCheck(): Promise<void> {
    logger.info('🔄 Forcing auth status check');
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

  /**
   * Clear all stored authentication tokens
   */
  private async clearStoredTokens(): Promise<void> {
    try {
      await chrome.storage.local.remove([
        'supabaseToken',
        'supabaseRefreshToken',
        'supabaseTokenExpiry',
        'supabaseAuthState',
        'refreshTokenIssuedAt',
      ]);

      /* Reset internal auth state */
      this.authState = {
        isAuthenticated: false,
        user: null,
        subscription: { isActive: false, plan: 'free' },
      };

      logger.info('🧹 Cleared all stored tokens and auth state');
    } catch (error) {
      logger.warn('Failed to clear stored tokens:', error);
    }
  }

  /**
   * Show re-authentication modal to user
   */
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
      logger.info('📢 Sent re-authentication modal requests to bolt.new tabs');
    } catch (error) {
      logger.warn('Failed to show re-authentication modal:', error);
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    /* Clear the auth alarm if active */
    chrome.alarms?.clear?.('auth-periodic-check')?.catch?.(() => {
      /* Alarm might not exist — ignore */
    });

    this.stopAggressiveDetection();

    /* Reset aggressive detection state */
    this.isInitialOnboarding = true;
    this.isPostConnectionMode = false;
    this.postConnectionStartTime = 0;

    /* Reset listener guards so they can be re-registered after cleanup */
    this.initialAuthDetectionSetup = false;
    this.subscriptionDetectionSetup = false;

    /* Reset failure counter and reload flag (but preserve reload timestamp to prevent loops) */
    this.consecutiveAuthFailures = 0;
    this.reloadRequested = false;

    logger.info('🧹 Cleaned up SupabaseAuthService including aggressive detection');
  }

  /**
   * Validate current subscription status with server
   * Used before allowing premium features
   */
  public async validateSubscriptionStatus(): Promise<boolean> {
    try {
      logger.info('🔍 Validating subscription status with server...');

      const token = await this.getAuthToken();
      if (!token) {
        logger.warn('❌ No auth token available for subscription validation');
        return false;
      }

      const user = await this.verifyTokenAndGetUser(token);
      if (!user) {
        logger.warn('❌ Token verification failed during subscription validation');
        return false;
      }

      const subscription = await this.getSubscriptionStatus(token, user);

      /* Check if subscription status has changed */
      if (subscription.isActive !== this.authState.subscription.isActive) {
        logger.info(
          `💰 Subscription status changed during validation: ${subscription.isActive ? 'activated' : 'deactivated'}`
        );

        this.updateAuthState({
          subscription,
        });

        /* If subscription was deactivated, handle graceful downgrade */
        if (!subscription.isActive && this.authState.subscription.isActive) {
          await this.handleSubscriptionDowngrade();
        }
      }

      return subscription.isActive;
    } catch (error) {
      logger.error('Error validating subscription status:', error);
      return false;
    }
  }

  /**
   * Handle subscription downgrade (expired/cancelled)
   */
  private async handleSubscriptionDowngrade(): Promise<void> {
    logger.info('📉 Handling subscription downgrade...');

    /* Show notification to user about subscription change */
    await this.notifySubscriptionDowngrade();

    /* Force immediate auth status check to update all components */
    await this.checkAuthStatus();
  }

  /**
   * Notify user about subscription downgrade
   */
  private async notifySubscriptionDowngrade(): Promise<void> {
    try {
      /* Send message to all bolt.new tabs to show downgrade notification */
      const tabs = await chrome.tabs.query({ url: 'https://bolt.new/*' });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'SHOW_SUBSCRIPTION_DOWNGRADE',
              data: {
                message:
                  'Your premium subscription has expired or been cancelled. Premium features are no longer available.',
                actionText: 'Renew Subscription',
                actionUrl: 'https://bolt2github.com/upgrade',
              },
            })
            .catch(() => {
              /* Tab might not have content script injected, ignore error */
            });
        }
      }
      logger.info('📢 Sent subscription downgrade notifications to bolt.new tabs');
    } catch (error) {
      logger.warn('Failed to send subscription downgrade notification:', error);
    }
  }

  /**
   * Force subscription revalidation (for immediate checks)
   */
  public async forceSubscriptionRevalidation(): Promise<boolean> {
    logger.info('🔄 Forcing subscription revalidation...');
    return await this.validateSubscriptionStatus();
  }

  /**
   * Initial authentication - manually extract tokens from bolt2github.com
   * This is the ONLY time the extension looks at bolt2github.com
   */
  public async authenticateFromBolt2GitHub(): Promise<boolean> {
    try {
      logger.info('🔐 Starting initial authentication from bolt2github.com...');

      const tabs = await chrome.tabs.query({ url: 'https://bolt2github.com/*' });
      if (tabs.length === 0) {
        logger.warn('❌ No bolt2github.com tabs found. Please open bolt2github.com and sign in.');
        return false;
      }

      for (const tab of tabs) {
        if (tab.id) {
          logger.info(`🔍 Checking tab ${tab.id}: ${tab.url}`);
          const tokenData = await this.extractTokenFromTab(tab.id);

          if (tokenData?.access_token) {
            logger.info('✅ Successfully extracted tokens from bolt2github.com');
            await this.storeTokenData(tokenData);

            /* Verify the tokens work */
            await this.checkAuthStatus();

            if (this.authState.isAuthenticated) {
              logger.info('✅ Initial authentication successful - extension is now independent');
              /* Switch to authenticated interval */
              this.startPeriodicChecks();
              return true;
            }
          }
        }
      }

      logger.warn('❌ Failed to extract valid tokens from bolt2github.com');
      return false;
    } catch (error) {
      logger.error('Error in initial authentication:', error);
      return false;
    }
  }

  /**
   * Public logout method - clears all authentication data and notifies users
   */
  public async logout(): Promise<void> {
    try {
      logger.info('🚪 User initiated logout - clearing all authentication data');

      /* Clear all stored tokens and auth state */
      await this.clearStoredTokens();

      /* Stop periodic checks since we're no longer authenticated */
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }

      /* Restart with unauthenticated interval */
      this.startPeriodicChecks();

      /* Restart initial authentication detection since user is now unauthenticated */
      this.setupInitialAuthDetection();

      /* Notify all content scripts about logout */
      await this.notifyLogout();

      logger.info('✅ Logout completed successfully - extension back to unauthenticated state');
    } catch (error) {
      logger.error('Error during logout:', error);
    }
  }

  /**
   * Notify content scripts and UI about logout
   */
  private async notifyLogout(): Promise<void> {
    try {
      /* Send message to all bolt.new tabs about logout */
      const tabs = await chrome.tabs.query({ url: 'https://bolt.new/*' });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'USER_LOGGED_OUT',
              data: {
                message: 'You have been logged out. Sign in again to access premium features.',
                showLoginPrompt: true,
              },
            })
            .catch(() => {
              /* Tab might not have content script injected */
            });
        }
      }

      /* Also clear any GitHub Apps cache since user changed */
      await this.clearGitHubAppsCache();

      logger.info('📢 Sent logout notifications to all tabs');
    } catch (error) {
      logger.warn('Error sending logout notifications:', error);
    }
  }

  /**
   * Check and sync GitHub App installation from web app
   */
  private async checkGitHubAppInstallation(token: string): Promise<void> {
    try {
      logger.info('🔍 Checking for GitHub App installation...');

      // Call the get-github-token endpoint to see if user has GitHub App connected
      const response = await fetch(`${this.supabaseUrl}/functions/v1/get-github-token`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();

        if (data.type === 'github_app' && data.access_token) {
          logger.info('✅ GitHub App installation found, syncing to extension...');

          // Store GitHub App data in extension storage
          await chrome.storage.local.set({
            githubAppInstallationId: data.installation_id || Date.now(), // Fallback ID
            githubAppUsername: data.github_username,
            githubAppAccessToken: data.access_token,
            githubAppExpiresAt: data.expires_at,
            githubAppScopes: data.scopes,
            authenticationMethod: 'github_app',
          });

          // Trigger settings store sync to auto-populate repoOwner
          try {
            await githubSettingsActions.syncGitHubAppFromStorage();
            logger.info('✅ GitHub settings store synced with GitHub App data');
          } catch (syncError) {
            logger.warn('Could not sync GitHub settings store:', syncError);
          }

          // Also get user profile data for avatar
          try {
            const userResponse = await fetch('https://api.github.com/user', {
              headers: {
                Authorization: `Bearer ${data.access_token}`,
                Accept: 'application/vnd.github.v3+json',
              },
            });

            if (userResponse.ok) {
              const userData = await userResponse.json();
              await chrome.storage.local.set({
                githubAppAvatarUrl: userData.avatar_url,
                githubAppUserId: userData.id,
              });
            }
          } catch (userError) {
            logger.warn('Could not fetch GitHub user data:', userError);
          }

          logger.info('🎉 GitHub App installation synced successfully!');

          // Notify content scripts about the new authentication method
          await this.notifyGitHubAppSync();
        }
      } else if (response.status === 404) {
        // User doesn't have GitHub App connected yet
        logger.info('ℹ️ No GitHub App installation found for user');
      } else {
        logger.warn('Failed to check GitHub App status:', response.status);
      }
    } catch (error) {
      logger.warn('Error checking GitHub App installation:', error);
    }
  }

  /**
   * Notify content scripts about GitHub App sync
   */
  private async notifyGitHubAppSync(): Promise<void> {
    try {
      // Send message to background script to handle tab messaging
      // Content scripts don't have access to chrome.tabs API
      chrome.runtime
        .sendMessage({
          type: 'NOTIFY_GITHUB_APP_SYNC',
          data: {
            message: '🔗 GitHub App authentication synced successfully!',
            authMethod: 'github_app',
          },
        })
        .catch(() => {
          // Background script might not be ready
        });
      logger.info('📢 Sent GitHub App sync notification request to background');
    } catch (error) {
      logger.warn('Failed to send GitHub App sync notification:', error);
    }
  }

  /**
   * Manually trigger GitHub App sync check (can be called from popup/settings)
   */
  public async syncGitHubApp(): Promise<boolean> {
    try {
      logger.info('🔄 Manually triggered GitHub App sync...');

      const token = await this.getAuthToken();
      if (!token) {
        logger.warn('❌ No authentication token available for GitHub App sync');
        return false;
      }

      await this.checkGitHubAppInstallation(token);
      return true;
    } catch (error) {
      logger.error('❌ Error during manual GitHub App sync:', error);
      return false;
    }
  }

  /**
   * Check if user has GitHub App configured
   */
  public async hasGitHubApp(): Promise<boolean> {
    try {
      const storage = await chrome.storage.local.get([
        'githubAppInstallationId',
        'authenticationMethod',
      ]);
      return storage.authenticationMethod === 'github_app' && !!storage.githubAppInstallationId;
    } catch (error) {
      logger.warn('Error checking GitHub App status:', error);
      return false;
    }
  }

  /**
   * Force sync authentication status to popup storage
   * This method can be called directly from popup or background script
   */
  public async forceSyncToPopup(): Promise<void> {
    logger.info('🔄 Force syncing authentication status to popup...');
    await this.notifyPremiumService();
  }

  /**
   * Add listener for auth state changes
   */
  public addAuthStateListener(
    listener: (authState: AuthState, previousState: AuthState) => void
  ): void {
    this.authStateListeners.push(listener);
    logger.debug('➕ Added auth state listener, total listeners:', this.authStateListeners.length);
  }

  /**
   * Remove auth state listener
   */
  public removeAuthStateListener(
    listener: (authState: AuthState, previousState: AuthState) => void
  ): void {
    const index = this.authStateListeners.indexOf(listener);
    if (index > -1) {
      this.authStateListeners.splice(index, 1);
      logger.debug(
        '➖ Removed auth state listener, total listeners:',
        this.authStateListeners.length
      );
    }
  }

  /**
   * Notify all auth state listeners
   */
  private notifyAuthStateListeners(previousState: AuthState): void {
    if (this.authStateListeners.length === 0) {
      return;
    }

    logger.debug('📢 Notifying auth state listeners', {
      listenerCount: this.authStateListeners.length,
      wasAuthenticated: previousState.isAuthenticated,
      nowAuthenticated: this.authState.isAuthenticated,
    });

    this.authStateListeners.forEach((listener, index) => {
      try {
        listener(this.authState, previousState);
      } catch (error) {
        logger.error(`Failed to notify auth state listener ${index}:`, error);
      }
    });
  }

  /**
   * Clear GitHub Apps cache when user logs out
   */
  private async clearGitHubAppsCache(): Promise<void> {
    try {
      const storage = await chrome.storage.local.get();
      const keysToRemove = Object.keys(storage).filter(
        (key) => key.startsWith('github_app_token_') || key.startsWith('github_app_installation_')
      );

      // Also clear the new GitHub App storage keys
      keysToRemove.push(
        'githubAppInstallationId',
        'githubAppUsername',
        'githubAppAccessToken',
        'githubAppExpiresAt',
        'githubAppRefreshToken',
        'githubAppRefreshTokenExpiresAt',
        'githubAppUserId',
        'githubAppAvatarUrl',
        'githubAppScopes',
        'authenticationMethod'
      );

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        logger.info('🧹 Cleared GitHub Apps cache on logout');
      }
    } catch (error) {
      logger.warn('Error clearing GitHub Apps cache:', error);
    }
  }

  /**
   * Request extension reload to clear stale state
   * This is a "nuclear option" when authentication repeatedly fails after user has logged in
   * Replicates the effect of manually disabling/enabling the extension
   */
  private async requestExtensionReload(): Promise<void> {
    try {
      // Check if minimum time has passed since last reload (prevent reload loops)
      const timeSinceLastReload = Date.now() - this.lastReloadTimestamp;
      if (timeSinceLastReload < this.MIN_TIME_BETWEEN_RELOADS) {
        logger.warn(
          `⏸️ Reload requested too soon after previous reload (${Math.round(timeSinceLastReload / 1000)}s ago). ` +
            `Minimum interval: ${this.MIN_TIME_BETWEEN_RELOADS / 1000}s. Skipping reload to prevent loops.`
        );
        return;
      }

      logger.info(
        '🔄 Requesting extension reload to clear stale authentication state (after multiple failures)'
      );

      // Record reload timestamp BEFORE sending message (to prevent race conditions)
      this.lastReloadTimestamp = Date.now();

      // Persist timestamp to storage to survive extension restarts and prevent reload loops
      try {
        await chrome.storage.local.set({ lastExtensionReloadTimestamp: this.lastReloadTimestamp });
        logger.debug('💾 Persisted reload timestamp to storage');
      } catch (storageError) {
        logger.warn('Failed to persist reload timestamp:', storageError);
        // Continue anyway - timestamp in memory is better than nothing
      }

      // Send message to background service to handle the reload
      // The background service will show a notification and then call chrome.runtime.reload()
      try {
        if (chrome.runtime?.id) {
          await chrome.runtime.sendMessage({
            type: 'RELOAD_EXTENSION',
            data: {
              reason: 'Multiple authentication failures - clearing stale state',
            },
          });
          logger.info('✅ Extension reload requested successfully');
        }
      } catch (error) {
        logger.error('❌ Failed to send extension reload message:', error);
        // Don't throw - this is best effort
      }
    } catch (error) {
      logger.error('❌ Error requesting extension reload:', error);
    }
  }
}
