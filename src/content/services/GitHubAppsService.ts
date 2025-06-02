/* eslint-disable no-console */

import { SUPABASE_CONFIG } from '../../lib/constants/supabase';

export interface GitHubInstallationToken {
  username: string;
  token: string;
  expires_at: string;
  installation_id: number;
  permissions?: Record<string, string>;
  repositories?: string;
}

export interface GitHubTokenInfo {
  token: string;
  type: 'user' | 'installation';
  rate_limit: number; // requests per hour
  expires_at?: string;
  installation_id?: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}

/**
 * GitHubAppsService handles GitHub App installation tokens for higher rate limits
 * Integrates with SupabaseAuthService for seamless authentication flow
 */
export class GitHubAppsService {
  private static instance: GitHubAppsService | null = null;
  private supabaseUrl: string;
  private anonKey: string;
  private cachedInstallationToken: GitHubInstallationToken | null = null;
  private userRateLimit: RateLimitInfo | null = null;
  private installationRateLimit: RateLimitInfo | null = null;

  /* Configuration - should match your SupabaseAuthService */
  private readonly SUPABASE_URL = SUPABASE_CONFIG.URL;
  private readonly SUPABASE_ANON_KEY = SUPABASE_CONFIG.ANON_KEY;

  /* Rate limit thresholds */
  private readonly USER_TOKEN_LIMIT = 5000; // per hour
  private readonly INSTALLATION_TOKEN_LIMIT = 12500; // per hour
  private readonly RATE_LIMIT_BUFFER = 100; // safety buffer

  private constructor() {
    this.supabaseUrl = this.SUPABASE_URL;
    this.anonKey = this.SUPABASE_ANON_KEY;
    this.initialize();
  }

  static getInstance(): GitHubAppsService {
    if (!GitHubAppsService.instance) {
      GitHubAppsService.instance = new GitHubAppsService();
    }
    return GitHubAppsService.instance;
  }

  private initialize(): void {
    console.log('🚀 Initializing GitHub Apps Service');
    this.loadCachedInstallationToken();
  }

  /**
   * Load cached installation token from storage
   */
  private async loadCachedInstallationToken(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['github_installation_token']);
      if (result.github_installation_token) {
        const cached = result.github_installation_token;

        // Check if token is still valid (not expired)
        const expiresAt = new Date(cached.expires_at);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();

        if (timeUntilExpiry > 5 * 60 * 1000) {
          // More than 5 minutes left
          this.cachedInstallationToken = cached;
          console.log('📦 Loaded cached installation token, expires at:', cached.expires_at);
        } else {
          console.log('⏰ Cached installation token expired, will refresh');
          await chrome.storage.local.remove(['github_installation_token']);
        }
      }
    } catch (error) {
      console.warn('Failed to load cached installation token:', error);
    }
  }

  /**
   * Get the best available GitHub token based on operation type and rate limits
   */
  public async getBestToken(
    operationType: 'user_action' | 'repo_intensive' = 'repo_intensive'
  ): Promise<GitHubTokenInfo | null> {
    try {
      // For user actions (issues, PRs), prefer user tokens for proper attribution
      if (operationType === 'user_action') {
        const userToken = await this.getUserToken();
        if (userToken) {
          const rateLimitInfo = await this.checkRateLimit(userToken, 'user');

          // If user token has enough remaining requests, use it
          if (rateLimitInfo && rateLimitInfo.remaining > this.RATE_LIMIT_BUFFER) {
            return {
              token: userToken,
              type: 'user',
              rate_limit: this.USER_TOKEN_LIMIT,
            };
          }

          console.log(
            `⚠️ User token low on rate limit (${rateLimitInfo?.remaining || 0} remaining), checking installation token...`
          );
        }
      }

      // For repo-intensive operations or when user token is rate limited, prefer installation tokens
      const installationToken = await this.getInstallationToken();
      if (installationToken) {
        const rateLimitInfo = await this.checkRateLimit(installationToken.token, 'installation');

        if (rateLimitInfo && rateLimitInfo.remaining > this.RATE_LIMIT_BUFFER) {
          return {
            token: installationToken.token,
            type: 'installation',
            rate_limit: this.INSTALLATION_TOKEN_LIMIT,
            expires_at: installationToken.expires_at,
            installation_id: installationToken.installation_id,
          };
        }

        console.log(
          `⚠️ Installation token low on rate limit (${rateLimitInfo?.remaining || 0} remaining)`
        );
      }

      // Fall back to user token if available, even if rate limited
      const userToken = await this.getUserToken();
      if (userToken) {
        console.log('📉 Using user token as fallback (may be rate limited)');
        return {
          token: userToken,
          type: 'user',
          rate_limit: this.USER_TOKEN_LIMIT,
        };
      }

      console.log('❌ No GitHub tokens available');
      return null;
    } catch (error) {
      console.error('Error getting best token:', error);
      return null;
    }
  }

  /**
   * Get installation token (15K/hour rate limit)
   */
  public async getInstallationToken(): Promise<GitHubInstallationToken | null> {
    try {
      // Check if we have a valid cached token
      if (this.cachedInstallationToken) {
        const expiresAt = new Date(this.cachedInstallationToken.expires_at);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();

        if (timeUntilExpiry > 5 * 60 * 1000) {
          // More than 5 minutes left
          console.log('✅ Using cached installation token');
          return this.cachedInstallationToken;
        } else {
          console.log('⏰ Cached installation token expired, refreshing...');
          this.cachedInstallationToken = null;
        }
      }

      // Get fresh installation token from Supabase function
      console.log('🔄 Fetching fresh installation token...');
      const authToken = await this.getUserToken();
      if (!authToken) {
        console.log('❌ No user authentication token available');
        return null;
      }

      const response = await fetch(`${this.supabaseUrl}/functions/v1/get-installation-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          apikey: this.anonKey,
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.token) {
          const installationToken: GitHubInstallationToken = {
            username: data.github_username,
            token: data.token,
            expires_at: data.expires_at,
            installation_id: data.installation_id,
            permissions: data.permissions,
            repositories: data.repositories,
          };

          // Cache the token
          this.cachedInstallationToken = installationToken;
          await chrome.storage.local.set({ github_installation_token: installationToken });

          // Save the repoOwner as the username for backwards compatibility
          await chrome.storage.sync.set({ repoOwner: installationToken.username });

          console.log('✅ Fresh installation token obtained:', {
            installation_id: data.installation_id,
            expires_at: data.expires_at,
          });

          return installationToken;
        } else {
          console.log('❌ No installation token in response:', data);
          return null;
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Failed to get installation token:', response.status, errorData);

        // Handle specific errors
        if (errorData.code === 'NO_INSTALLATION') {
          console.log('💡 GitHub App not installed - user needs to install the app first');
        } else if (errorData.code === 'KEY_VALIDATION_ERROR') {
          console.log('🔑 Private key configuration issue on server');
        }

        return null;
      }
    } catch (error) {
      console.error('Error getting installation token:', error);
      return null;
    }
  }

  /**
   * Get user token from SupabaseAuthService
   */
  private async getUserToken(): Promise<string | null> {
    try {
      // Get token from storage (same as SupabaseAuthService)
      const result = await chrome.storage.local.get(['supabaseToken']);
      return result.supabaseToken || null;
    } catch (error) {
      console.warn('Error getting user token:', error);
      return null;
    }
  }

  /**
   * Check rate limit for a given token
   */
  public async checkRateLimit(
    token: string,
    tokenType: 'user' | 'installation'
  ): Promise<RateLimitInfo | null> {
    try {
      const response = await fetch('https://api.github.com/rate_limit', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const rateLimit = data.rate;

        // Cache rate limit info
        if (tokenType === 'user') {
          this.userRateLimit = rateLimit;
        } else {
          this.installationRateLimit = rateLimit;
        }

        console.log(`📊 ${tokenType} token rate limit:`, {
          remaining: rateLimit.remaining,
          limit: rateLimit.limit,
          reset: new Date(rateLimit.reset * 1000).toLocaleTimeString(),
        });

        return rateLimit;
      } else {
        console.warn(`Failed to check ${tokenType} rate limit:`, response.status);
        return null;
      }
    } catch (error) {
      console.error(`Error checking ${tokenType} rate limit:`, error);
      return null;
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
    const tokenInfo = await this.getBestToken(operationType);

    if (!tokenInfo) {
      throw new Error('No GitHub authentication token available');
    }

    console.log(
      `🔗 Making GitHub API request with ${tokenInfo.type} token (${tokenInfo.rate_limit}/hour limit)`
    );

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${tokenInfo.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });

    // Log rate limit usage after request
    if (response.headers.get('x-ratelimit-remaining')) {
      const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '0');
      const limit = parseInt(response.headers.get('x-ratelimit-limit') || '0');

      console.log(
        `📊 Rate limit after request: ${remaining}/${limit} remaining (${tokenInfo.type} token)`
      );

      // Warn if getting low on rate limit
      if (remaining < this.RATE_LIMIT_BUFFER) {
        console.warn(`⚠️ Rate limit getting low: ${remaining} requests remaining`);
      }
    }

    return response;
  }

  /**
   * Get repository contents (optimized for large repositories)
   */
  public async getRepositoryContents(owner: string, repo: string, path: string = ''): Promise<any> {
    try {
      console.log(`📁 Fetching repository contents: ${owner}/${repo}${path ? `/${path}` : ''}`);

      const response = await this.apiRequest(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {},
        'repo_intensive'
      );

      if (response.ok) {
        return await response.json();
      } else {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to fetch repository contents: ${response.status} - ${error.message || 'Unknown error'}`
        );
      }
    } catch (error) {
      console.error('Error fetching repository contents:', error);
      throw error;
    }
  }

  /**
   * Get repository tree (efficient for large repositories)
   */
  public async getRepositoryTree(
    owner: string,
    repo: string,
    sha: string = 'HEAD',
    recursive: boolean = true
  ): Promise<any> {
    try {
      console.log(`🌳 Fetching repository tree: ${owner}/${repo} (${sha}) recursive=${recursive}`);

      const response = await this.apiRequest(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}${recursive ? '?recursive=1' : ''}`,
        {},
        'repo_intensive'
      );

      if (response.ok) {
        return await response.json();
      } else {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to fetch repository tree: ${response.status} - ${error.message || 'Unknown error'}`
        );
      }
    } catch (error) {
      console.error('Error fetching repository tree:', error);
      throw error;
    }
  }

  /**
   * Create an issue (user action)
   */
  public async createIssue(
    owner: string,
    repo: string,
    title: string,
    body?: string
  ): Promise<any> {
    try {
      console.log(`📝 Creating issue: ${owner}/${repo} - "${title}"`);

      const response = await this.apiRequest(
        `https://api.github.com/repos/${owner}/${repo}/issues`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, body }),
        },
        'user_action' // Use user token for proper attribution
      );

      if (response.ok) {
        const issue = await response.json();
        console.log(`✅ Created issue #${issue.number}`);
        return issue;
      } else {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to create issue: ${response.status} - ${error.message || 'Unknown error'}`
        );
      }
    } catch (error) {
      console.error('Error creating issue:', error);
      throw error;
    }
  }

  /**
   * Get current rate limit status for both token types
   */
  public async getRateLimitStatus(): Promise<{
    user: RateLimitInfo | null;
    installation: RateLimitInfo | null;
  }> {
    const promises = [];

    // Check user token rate limit
    const userToken = await this.getUserToken();
    if (userToken) {
      promises.push(this.checkRateLimit(userToken, 'user'));
    } else {
      promises.push(Promise.resolve(null));
    }

    // Check installation token rate limit
    const installationToken = await this.getInstallationToken();
    if (installationToken) {
      promises.push(this.checkRateLimit(installationToken.token, 'installation'));
    } else {
      promises.push(Promise.resolve(null));
    }

    const [userRateLimit, installationRateLimit] = await Promise.all(promises);

    return {
      user: userRateLimit,
      installation: installationRateLimit,
    };
  }

  /**
   * Clear cached installation token (useful for debugging)
   */
  public async clearInstallationTokenCache(): Promise<void> {
    this.cachedInstallationToken = null;
    await chrome.storage.local.remove(['github_installation_token']);
    console.log('🧹 Cleared installation token cache');
  }

  /**
   * Get GitHub App installation status
   */
  public async getInstallationStatus(): Promise<{
    hasInstallationAccess: boolean;
    installationId?: number;
    rateLimitComparison: {
      user: number;
      installation: number;
      benefit: string;
    };
  }> {
    const installationToken = await this.getInstallationToken();
    const userToken = await this.getUserToken();

    return {
      hasInstallationAccess: !!installationToken,
      installationId: installationToken?.installation_id,
      rateLimitComparison: {
        user: this.USER_TOKEN_LIMIT,
        installation: this.INSTALLATION_TOKEN_LIMIT,
        benefit: `${this.INSTALLATION_TOKEN_LIMIT - this.USER_TOKEN_LIMIT} additional requests/hour`,
      },
    };
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.cachedInstallationToken = null;
    console.log('🧹 GitHub Apps service cleaned up');
  }
}

/* Export the GitHubAppsService class */
export default GitHubAppsService;
