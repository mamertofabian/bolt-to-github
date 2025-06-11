/**
 * GitHub App Authentication Strategy
 * Implements GitHub App-based authentication with automatic token refresh
 */

import type { IAuthenticationStrategy } from './interfaces/IAuthenticationStrategy';
import type {
  AuthenticationType,
  TokenValidationResult,
  PermissionCheckResult,
} from './types/authentication';
import { GitHubAppService } from './GitHubAppService';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('GitHubAppAuthenticationStrategy');

export class GitHubAppAuthenticationStrategy implements IAuthenticationStrategy {
  readonly type: AuthenticationType = 'github_app';
  private githubAppService: GitHubAppService;
  private cachedToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor() {
    this.githubAppService = new GitHubAppService();
  }

  /**
   * Check if GitHub App strategy is properly configured
   */
  async isConfigured(): Promise<boolean> {
    return await this.githubAppService.isConfigured();
  }

  /**
   * Get GitHub App access token with automatic refresh
   */
  async getToken(): Promise<string> {
    // Check if we have a cached token that's still valid
    if (this.cachedToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.cachedToken;
    }

    try {
      const tokenResponse = await this.githubAppService.getAccessToken();

      this.cachedToken = tokenResponse.access_token;
      this.tokenExpiresAt = new Date(tokenResponse.expires_at);

      return this.cachedToken;
    } catch (error) {
      this.cachedToken = null;
      this.tokenExpiresAt = null;

      if (error instanceof Error && error.message.includes('Re-authentication required')) {
        throw new Error(
          'GitHub App authentication expired. Please re-authenticate via bolt2github.com'
        );
      }

      throw new Error(
        `Failed to get GitHub App token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validate GitHub App authentication
   * @param username Optional username parameter (ignored for GitHub App authentication)
   */
  async validateAuth(username?: string): Promise<TokenValidationResult> {
    // Note: The username parameter is intentionally not used here.
    // GitHub App authentication is tied to the app installation and the authenticated user,
    // not to a specific username. The username validation happens automatically
    // through the GitHub App's installation context.

    try {
      const result = await this.githubAppService.validateAuth();
      return result;
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'GitHub App validation failed',
      };
    }
  }

  /**
   * Check permissions for GitHub App
   */
  async checkPermissions(repoOwner: string): Promise<PermissionCheckResult> {
    try {
      const result = await this.githubAppService.checkPermissions(repoOwner);
      return result;
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
   * Refresh GitHub App token
   */
  async refreshToken(): Promise<string> {
    try {
      // Clear cached token to force refresh
      this.cachedToken = null;
      this.tokenExpiresAt = null;

      const tokenResponse = await this.githubAppService.getAccessToken();

      this.cachedToken = tokenResponse.access_token;
      this.tokenExpiresAt = new Date(tokenResponse.expires_at);

      return this.cachedToken;
    } catch (error) {
      throw new Error(
        `Failed to refresh GitHub App token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clear GitHub App authentication data
   */
  async clearAuth(): Promise<void> {
    try {
      await this.githubAppService.clearConfig();
      this.cachedToken = null;
      this.tokenExpiresAt = null;
    } catch (error) {
      logger.error('Failed to clear GitHub App auth:', error);
      throw new Error('Failed to clear GitHub App authentication');
    }
  }

  /**
   * Get user information for GitHub App
   */
  async getUserInfo(): Promise<{
    login: string;
    id: number;
    avatar_url: string;
  } | null> {
    try {
      const config = await this.githubAppService.getConfig();

      if (config?.githubUsername && config?.githubUserId && config?.avatarUrl) {
        return {
          login: config.githubUsername,
          id: config.githubUserId,
          avatar_url: config.avatarUrl,
        };
      }

      // Fallback: get from API
      const token = await this.getToken();
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const userData = await response.json();

      // Update config with user info
      const currentConfig = await this.githubAppService.getConfig();
      if (currentConfig) {
        await this.githubAppService.storeConfig({
          ...currentConfig,
          githubUsername: userData.login,
          githubUserId: userData.id,
          avatarUrl: userData.avatar_url,
        });
      }

      return {
        login: userData.login,
        id: userData.id,
        avatar_url: userData.avatar_url,
      };
    } catch (error) {
      logger.error('Failed to get user info:', error);
      return null;
    }
  }

  /**
   * Check if GitHub App token needs renewal
   */
  async needsRenewal(): Promise<boolean> {
    return await this.githubAppService.needsRenewal();
  }

  /**
   * Get GitHub App metadata
   */
  async getMetadata(): Promise<{
    scopes?: string[];
    expiresAt?: string;
    lastUsed?: string;
    [key: string]: any;
  }> {
    try {
      const config = await this.githubAppService.getConfig();

      if (!config) {
        return {};
      }

      return {
        scopes: config.scopes,
        expiresAt: config.expiresAt,
        refreshTokenExpiresAt: config.refreshTokenExpiresAt,
        installationId: config.installationId,
        lastUsed: new Date().toISOString(),
        tokenType: 'github_app',
      };
    } catch (error) {
      logger.error('Failed to get GitHub App metadata:', error);
      return {};
    }
  }

  /**
   * Set user token for Supabase authentication
   */
  setUserToken(token: string): void {
    this.githubAppService.setUserToken(token);
  }

  /**
   * Complete OAuth flow and store configuration
   */
  async completeOAuth(code: string, state?: string): Promise<void> {
    try {
      const result = await this.githubAppService.completeOAuthFlow(code, state);

      if (result.success) {
        // Store the installation data
        await this.githubAppService.storeConfig({
          installationId: result.installation_id || undefined,
          githubUsername: result.github_username,
          avatarUrl: result.avatar_url,
          scopes: result.scopes,
        });

        // Clear cached token to force fresh fetch
        this.cachedToken = null;
        this.tokenExpiresAt = null;
      } else {
        throw new Error('OAuth flow was not successful');
      }
    } catch (error) {
      throw new Error(
        `Failed to complete OAuth flow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate OAuth URL for GitHub App
   */
  generateOAuthUrl(clientId: string, redirectUri: string, state?: string): string {
    return this.githubAppService.generateOAuthUrl(clientId, redirectUri, state);
  }
}
