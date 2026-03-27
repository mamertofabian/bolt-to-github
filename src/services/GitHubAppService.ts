/**
 * GitHub App Service for handling GitHub App authentication
 * Communicates with Supabase Edge Functions for OAuth flow and token management
 */

import { SUPABASE_CONFIG } from '../lib/constants/supabase';
import { createLogger } from '../lib/utils/logger';
import type {
  GitHubAppConfig,
  GitHubAppErrorResponse,
  GitHubAppTokenResponse,
  PermissionCheckResult,
  TokenValidationResult,
} from './types/authentication';

const logger = createLogger('GitHubAppService');

export class GitHubAppService {
  private readonly supabaseUrl: string;
  private userToken: string | null = null;

  constructor() {
    this.supabaseUrl = SUPABASE_CONFIG.URL;
  }

  /**
   * Set the user token for Supabase authentication
   */
  setUserToken(token: string): void {
    this.userToken = token;
  }

  /**
   * Get the user token, extracting from Supabase auth if needed.
   * Always reads fresh from storage to avoid using stale tokens after
   * service worker restarts or token refreshes by SupabaseAuthService.
   */
  private async getUserToken(): Promise<string> {
    // If explicitly set via setUserToken(), use it (short-lived caller context)
    if (this.userToken) {
      return this.userToken;
    }

    // Try to extract from Supabase auth storage
    try {
      const authKey = `sb-${SUPABASE_CONFIG.URL.split('//')[1].split('.')[0]}-auth-token`;
      const result = await chrome.storage.local.get([
        authKey,
        'supabaseToken',
        'supabaseTokenExpiry',
        'refreshTokenIssuedAt',
      ]);

      const now = Date.now();
      const tokenExpiry = result.supabaseTokenExpiry || 0;

      // Prefer the managed supabaseToken (refreshed by SupabaseAuthService) if it's still valid
      if (result.supabaseToken && tokenExpiry > now + 60 * 1000) {
        return result.supabaseToken;
      }

      // Fall back to the Supabase auth-key token
      const authData = result[authKey];
      if (authData?.access_token) {
        // If token is expired, check refresh token age before using
        if (tokenExpiry > 0 && tokenExpiry < now) {
          if (result.refreshTokenIssuedAt) {
            const refreshTokenAge = now - result.refreshTokenIssuedAt;
            const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

            if (refreshTokenAge > REFRESH_TOKEN_MAX_AGE) {
              logger.warn(
                `🕐 Supabase refresh token is very old (${Math.round(
                  refreshTokenAge / (24 * 60 * 60 * 1000)
                )} days). User needs to re-authenticate.`
              );
              throw new Error(
                'Supabase authentication expired. Please re-authenticate via bolt2github.com.'
              );
            }
          }

          logger.warn(
            '⚠️ Supabase token is expired but refresh token might work. ' +
              'Allowing through - SupabaseAuthService will handle refresh.'
          );
        }

        // Do NOT cache in this.userToken — always read fresh from storage
        return authData.access_token;
      }
    } catch (error) {
      logger.error('Failed to get user token from storage:', error);
      // Re-throw the error if it's our custom expiration error
      if (error instanceof Error && error.message.includes('Supabase authentication expired')) {
        throw error;
      }
    }

    throw new Error('No user token available. Please authenticate with bolt2github.com first.');
  }

  /**
   * Complete GitHub App OAuth flow
   */
  async completeOAuthFlow(
    code: string,
    state?: string
  ): Promise<{
    success: boolean;
    github_username: string;
    avatar_url: string;
    scopes: string[];
    installation_id: number | null;
    installation_found: boolean;
  }> {
    const userToken = await this.getUserToken();

    const response = await fetch(`${this.supabaseUrl}/functions/v1/github-app-auth`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, state }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'GitHub App authentication failed');
    }

    return data;
  }

  /**
   * Get GitHub access token (with automatic refresh)
   */
  async getAccessToken(): Promise<GitHubAppTokenResponse> {
    const userToken = await this.getUserToken();

    const response = await fetch(`${this.supabaseUrl}/functions/v1/get-github-token`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorData = data as GitHubAppErrorResponse;

      // Handle specific error codes
      switch (errorData.code) {
        case 'NO_GITHUB_APP':
        case 'NO_ACCESS_TOKEN':
        case 'TOKEN_EXPIRED_NO_REFRESH':
        case 'TOKEN_RENEWAL_FAILED':
          // These errors require re-authentication
          throw new Error(`Re-authentication required: ${errorData.error}`);
        default:
          throw new Error(errorData.error || 'Failed to get GitHub token');
      }
    }

    return data as GitHubAppTokenResponse;
  }

  /**
   * Get installation-specific access token
   */
  async getInstallationToken(): Promise<{
    github_username: string;
    token: string;
    expires_at: string;
    type: 'installation';
    installation_id: number;
    permissions: object;
    repositories: 'all' | object[];
  }> {
    const userToken = await this.getUserToken();

    const response = await fetch(`${this.supabaseUrl}/functions/v1/get-installation-token`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorData = data as GitHubAppErrorResponse;
      throw new Error(errorData.error || 'Failed to get installation token');
    }

    return data;
  }

  /**
   * Validate GitHub App authentication
   */
  async validateAuth(): Promise<TokenValidationResult> {
    try {
      const tokenResponse = await this.getAccessToken();

      // Test the token by making a user request
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenResponse.access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!userResponse.ok) {
        return {
          isValid: false,
          error: 'Token validation failed',
        };
      }

      const userData = await userResponse.json();

      return {
        isValid: true,
        userInfo: {
          login: userData.login,
          id: userData.id,
          avatar_url: userData.avatar_url,
        },
        scopes: tokenResponse.scopes,
        type: 'github_app',
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Authentication validation failed',
      };
    }
  }

  /**
   * Check permissions for GitHub App installation
   */
  async checkPermissions(_repoOwner: string): Promise<PermissionCheckResult> {
    try {
      const installationToken = await this.getInstallationToken();

      // GitHub Apps have predefined permissions based on installation
      // We can check the permissions object returned from the installation token
      const permissions = installationToken.permissions as Record<string, string>;

      return {
        isValid: true,
        permissions: {
          allRepos: permissions.contents === 'write' && permissions.metadata === 'read',
          admin: permissions.administration === 'write',
          contents: permissions.contents === 'write',
        },
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Permission check failed',
        permissions: {
          allRepos: false,
          admin: false,
          contents: false,
        },
      };
    }
  }

  /**
   * Get GitHub App configuration from storage
   */
  async getConfig(): Promise<GitHubAppConfig | null> {
    try {
      const storage = await chrome.storage.local.get([
        'githubAppInstallationId',
        'githubAppAccessToken',
        'githubAppRefreshToken',
        'githubAppExpiresAt',
        'githubAppRefreshTokenExpiresAt',
        'githubAppUsername',
        'githubAppUserId',
        'githubAppAvatarUrl',
        'githubAppScopes',
      ]);

      if (!storage.githubAppInstallationId) {
        return null;
      }

      return {
        installationId: storage.githubAppInstallationId,
        accessToken: storage.githubAppAccessToken,
        refreshToken: storage.githubAppRefreshToken,
        expiresAt: storage.githubAppExpiresAt,
        refreshTokenExpiresAt: storage.githubAppRefreshTokenExpiresAt,
        githubUsername: storage.githubAppUsername,
        githubUserId: storage.githubAppUserId,
        avatarUrl: storage.githubAppAvatarUrl,
        scopes: storage.githubAppScopes,
      };
    } catch (error) {
      logger.error('Failed to get GitHub App config:', error);
      return null;
    }
  }

  /**
   * Store GitHub App configuration
   */
  async storeConfig(config: GitHubAppConfig): Promise<void> {
    try {
      await chrome.storage.local.set({
        githubAppInstallationId: config.installationId,
        githubAppAccessToken: config.accessToken,
        githubAppRefreshToken: config.refreshToken,
        githubAppExpiresAt: config.expiresAt,
        githubAppRefreshTokenExpiresAt: config.refreshTokenExpiresAt,
        githubAppUsername: config.githubUsername,
        githubAppUserId: config.githubUserId,
        githubAppAvatarUrl: config.avatarUrl,
        githubAppScopes: config.scopes,
      });
    } catch (error) {
      logger.error('Failed to store GitHub App config:', error);
      throw new Error('Failed to store GitHub App configuration');
    }
  }

  /**
   * Clear GitHub App configuration
   */
  async clearConfig(): Promise<void> {
    try {
      await chrome.storage.local.remove([
        'githubAppInstallationId',
        'githubAppAccessToken',
        'githubAppRefreshToken',
        'githubAppExpiresAt',
        'githubAppRefreshTokenExpiresAt',
        'githubAppUsername',
        'githubAppUserId',
        'githubAppAvatarUrl',
        'githubAppScopes',
      ]);
    } catch (error) {
      logger.error('Failed to clear GitHub App config:', error);
      throw new Error('Failed to clear GitHub App configuration');
    }
  }

  /**
   * Check if GitHub App is configured
   */
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return config !== null && config.installationId !== undefined;
  }

  /**
   * Check if token needs renewal
   */
  async needsRenewal(): Promise<boolean> {
    const config = await this.getConfig();

    if (!config?.expiresAt) {
      return true;
    }

    const expirationTime = new Date(config.expiresAt).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    // Renew if token expires within 5 minutes
    return expirationTime - now < fiveMinutes;
  }

  /**
   * Generate GitHub App OAuth URL
   */
  generateOAuthUrl(clientId: string, redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'user:email',
    });

    if (state) {
      params.append('state', state);
    }

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }
}
