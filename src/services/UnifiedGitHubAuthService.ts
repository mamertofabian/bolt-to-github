/* eslint-disable no-console */

import { GitHubAppsService } from '../content/services/GitHubAppsService';
import { SupabaseAuthService } from '../content/services/SupabaseAuthService';
import { SUPABASE_CONFIG } from '../lib/constants/supabase';

export interface AuthTokenInfo {
  token: string;
  type: 'github_app' | 'pat' | 'none';
  username?: string;
  rateLimit: number;
  expires_at?: string;
  installation_id?: number;
}

export interface AuthenticationStatus {
  hasGitHubApp: boolean;
  hasPAT: boolean;
  currentTokenType: 'github_app' | 'pat' | 'none';
  userAuthenticated: boolean;
  shouldEncourageGitHubApp: boolean;
}

/**
 * Unified GitHub Authentication Service
 *
 * Implements smart token switching:
 * 1. First priority: GitHub Apps integration (if available and user authenticated)
 * 2. Second priority: Personal Access Token (PAT)
 * 3. Third priority: Encourage GitHub App integration
 */
export class UnifiedGitHubAuthService {
  private static instance: UnifiedGitHubAuthService | null = null;
  private githubAppsService: GitHubAppsService;
  private supabaseAuthService: SupabaseAuthService;
  private cachedTokenInfo: AuthTokenInfo | null = null;
  private lastCheck: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.githubAppsService = GitHubAppsService.getInstance();
    this.supabaseAuthService = SupabaseAuthService.getInstance();
  }

  static getInstance(): UnifiedGitHubAuthService {
    if (!UnifiedGitHubAuthService.instance) {
      UnifiedGitHubAuthService.instance = new UnifiedGitHubAuthService();
    }
    return UnifiedGitHubAuthService.instance;
  }

  /**
   * Get the best available authentication token
   * Priority: GitHub Apps > PAT > None
   */
  public async getBestAuthToken(): Promise<AuthTokenInfo> {
    try {
      // Check cache first
      if (this.cachedTokenInfo && Date.now() - this.lastCheck < this.CACHE_DURATION) {
        console.log('🔄 Using cached auth token:', this.cachedTokenInfo.type);
        return this.cachedTokenInfo;
      }

      console.log('🔍 Determining best authentication method...');

      // Step 1: Check if user is authenticated with Supabase
      const authState = this.supabaseAuthService.getAuthState();
      const isUserAuthenticated = authState.isAuthenticated;

      console.log('🔐 User authentication status:', isUserAuthenticated);

      // Step 2: Try GitHub Apps first (if user is authenticated)
      if (isUserAuthenticated) {
        const installationToken = await this.githubAppsService.getInstallationToken();

        if (installationToken) {
          console.log('✅ GitHub Apps token available');

          const tokenInfo: AuthTokenInfo = {
            token: installationToken.token,
            type: 'github_app',
            rateLimit: 15000, // GitHub Apps get 15K/hour
            expires_at: installationToken.expires_at,
            installation_id: installationToken.installation_id,
          };

          this.cachedTokenInfo = tokenInfo;
          this.lastCheck = Date.now();
          return tokenInfo;
        } else {
          console.log('⚠️ No GitHub Apps integration found');
        }
      } else {
        console.log('⚠️ User not authenticated, skipping GitHub Apps check');
      }

      // Step 3: Fallback to Personal Access Token
      const patToken = await this.getPATToken();
      if (patToken) {
        console.log('✅ PAT token available');

        const tokenInfo: AuthTokenInfo = {
          token: patToken,
          type: 'pat',
          rateLimit: 5000, // PAT gets 5K/hour
        };

        this.cachedTokenInfo = tokenInfo;
        this.lastCheck = Date.now();
        return tokenInfo;
      }

      // Step 4: No authentication available
      console.log('❌ No authentication tokens available');

      const tokenInfo: AuthTokenInfo = {
        token: '',
        type: 'none',
        rateLimit: 0,
      };

      this.cachedTokenInfo = tokenInfo;
      this.lastCheck = Date.now();
      return tokenInfo;
    } catch (error) {
      console.error('Error getting best auth token:', error);

      // Fallback to PAT if GitHub Apps fails
      const patToken = await this.getPATToken();
      if (patToken) {
        console.log('🔄 Falling back to PAT token due to error');
        return {
          token: patToken,
          type: 'pat',
          rateLimit: 5000,
        };
      }

      return {
        token: '',
        type: 'none',
        rateLimit: 0,
      };
    }
  }

  /**
   * Get Personal Access Token from storage
   */
  private async getPATToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.sync.get(['githubToken']);
      return result.githubToken || null;
    } catch (error) {
      console.warn('Error getting PAT token:', error);
      return null;
    }
  }

  /**
   * Get current authentication status
   */
  public async getAuthenticationStatus(): Promise<AuthenticationStatus> {
    try {
      const authState = this.supabaseAuthService.getAuthState();
      const isUserAuthenticated = authState.isAuthenticated;

      // Check GitHub Apps availability
      let hasGitHubApp = false;
      if (isUserAuthenticated) {
        try {
          const installationToken = await this.githubAppsService.getInstallationToken();
          hasGitHubApp = !!installationToken;
        } catch (error) {
          console.warn('Error checking GitHub Apps availability:', error);
          hasGitHubApp = false;
        }
      }

      // Check PAT availability
      const patToken = await this.getPATToken();
      const hasPAT = !!patToken;

      // Determine current token type
      let currentTokenType: 'github_app' | 'pat' | 'none' = 'none';
      if (hasGitHubApp) {
        currentTokenType = 'github_app';
      } else if (hasPAT) {
        currentTokenType = 'pat';
      }

      // Should we encourage GitHub App integration?
      const shouldEncourageGitHubApp = !hasGitHubApp && (isUserAuthenticated || !hasPAT);

      return {
        hasGitHubApp,
        hasPAT,
        currentTokenType,
        userAuthenticated: isUserAuthenticated,
        shouldEncourageGitHubApp,
      };
    } catch (error) {
      console.error('Error getting authentication status:', error);
      return {
        hasGitHubApp: false,
        hasPAT: false,
        currentTokenType: 'none',
        userAuthenticated: false,
        shouldEncourageGitHubApp: true,
      };
    }
  }

  /**
   * Make GitHub API request with best available token
   */
  public async apiRequest(
    url: string,
    options: RequestInit = {},
    operationType: 'user_action' | 'repo_intensive' = 'repo_intensive'
  ): Promise<Response> {
    const tokenInfo = await this.getBestAuthToken();

    if (tokenInfo.type === 'none') {
      throw new Error('No GitHub authentication available. Please set up GitHub integration.');
    }

    console.log(
      `🔗 Making GitHub API request with ${tokenInfo.type} token (${tokenInfo.rateLimit}/hour limit)`
    );

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${tokenInfo.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Bolt-to-GitHub-Extension',
        ...options.headers,
      },
    });

    // Log rate limit usage
    if (response.headers.get('x-ratelimit-remaining')) {
      const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '0');
      const limit = parseInt(response.headers.get('x-ratelimit-limit') || '0');

      console.log(
        `📊 Rate limit after request: ${remaining}/${limit} remaining (${tokenInfo.type} token)`
      );

      // Warn if getting low on rate limit
      if (remaining < 100) {
        console.warn(`⚠️ Rate limit getting low: ${remaining} requests remaining`);
      }
    }

    // Handle authentication errors
    if (response.status === 401) {
      console.warn('🚫 Authentication failed, clearing cache');
      this.clearCache();

      // If GitHub App failed, try to encourage setup
      if (tokenInfo.type === 'github_app') {
        await this.showGitHubAppReconnectionPrompt();
      } else if (tokenInfo.type === 'pat') {
        await this.showPATUpdatePrompt();
      }
    }

    return response;
  }

  /**
   * Clear authentication cache
   */
  public clearCache(): void {
    this.cachedTokenInfo = null;
    this.lastCheck = 0;
    console.log('🧹 Cleared authentication cache');
  }

  /**
   * Prompt user to set up GitHub App integration
   */
  public async promptGitHubAppSetup(): Promise<void> {
    try {
      const url = 'https://bolt2github.com/settings?tab=github';
      await chrome.tabs.create({ url });

      // Show notification
      if (chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/assets/icons/icon48.png',
          title: 'GitHub Integration',
          message: 'Set up GitHub App integration for better rate limits and features.',
        });
      }

      console.log('📢 Opened GitHub integration setup page');
    } catch (error) {
      console.error('Error opening GitHub setup page:', error);
    }
  }

  /**
   * Show GitHub App reconnection prompt
   */
  private async showGitHubAppReconnectionPrompt(): Promise<void> {
    try {
      const url = 'https://bolt2github.com/settings?tab=github&action=reconnect';
      await chrome.tabs.create({ url });

      if (chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/assets/icons/icon48.png',
          title: 'GitHub App Reconnection Required',
          message: 'Your GitHub App integration has expired. Please reconnect.',
        });
      }
    } catch (error) {
      console.error('Error showing reconnection prompt:', error);
    }
  }

  /**
   * Show PAT update prompt
   */
  private async showPATUpdatePrompt(): Promise<void> {
    try {
      if (chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/assets/icons/icon48.png',
          title: 'GitHub Token Update Required',
          message:
            'Your Personal Access Token may be invalid or expired. Please update it in settings.',
        });
      }
    } catch (error) {
      console.error('Error showing PAT update prompt:', error);
    }
  }

  /**
   * Get human-readable authentication status message
   */
  public async getAuthStatusMessage(): Promise<string> {
    const status = await this.getAuthenticationStatus();

    if (status.hasGitHubApp) {
      return '🚀 Using GitHub App integration (15,000 requests/hour)';
    } else if (status.hasPAT) {
      return '🔑 Using Personal Access Token (5,000 requests/hour)';
    } else if (status.userAuthenticated) {
      return '⚠️ Authenticated but no GitHub integration. Set up GitHub App for better limits.';
    } else {
      return '❌ No GitHub authentication. Please set up GitHub integration or PAT.';
    }
  }

  /**
   * Force refresh of authentication status
   */
  public async forceRefresh(): Promise<void> {
    this.clearCache();
    await this.getBestAuthToken();
    console.log('🔄 Forced refresh of authentication status');
  }
}
