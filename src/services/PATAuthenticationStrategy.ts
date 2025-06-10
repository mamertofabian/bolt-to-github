/**
 * Personal Access Token (PAT) Authentication Strategy
 * Implements the existing PAT-based authentication logic
 */

import type { IAuthenticationStrategy } from './interfaces/IAuthenticationStrategy';
import type {
  AuthenticationType,
  TokenValidationResult,
  PermissionCheckResult,
} from './types/authentication';

export class PATAuthenticationStrategy implements IAuthenticationStrategy {
  readonly type: AuthenticationType = 'pat';
  private token: string | null = null;

  constructor(token?: string) {
    if (token) {
      this.token = token;
    }
  }

  /**
   * Check if PAT strategy is properly configured
   */
  async isConfigured(): Promise<boolean> {
    if (this.token) {
      return true;
    }

    // Check if token exists in storage
    try {
      const storage = await chrome.storage.sync.get('githubToken');
      return !!storage.githubToken;
    } catch (error) {
      console.error('Failed to check PAT configuration:', error);
      return false;
    }
  }

  /**
   * Get the PAT token
   */
  async getToken(): Promise<string> {
    if (this.token) {
      return this.token;
    }

    // Load from storage
    try {
      const storage = await chrome.storage.sync.get('githubToken');
      if (!storage.githubToken) {
        throw new Error('No GitHub token found. Please configure your Personal Access Token.');
      }

      this.token = storage.githubToken;
      return storage.githubToken;
    } catch (error) {
      throw new Error('Failed to get GitHub token from storage');
    }
  }

  /**
   * Validate PAT authentication
   */
  async validateAuth(username?: string): Promise<TokenValidationResult> {
    try {
      const token = await this.getToken();

      // Use provided username or fall back to storage
      let repoOwner = username;
      if (!repoOwner) {
        const storage = await chrome.storage.sync.get('repoOwner');
        repoOwner = storage.repoOwner || '';
      }

      // Ensure we have a username to validate
      if (!repoOwner) {
        return {
          isValid: false,
          error: 'Repository owner (username) is required for validation',
        };
      }

      // Validate token and username
      const result = await this.validateTokenAndUser(token, repoOwner);

      if (!result.isValid) {
        return {
          isValid: false,
          error: result.error || 'Token validation failed',
        };
      }

      // Get user info and metadata separately
      const userInfo = await this.getUserInfo();
      const metadata = await this.getMetadata();

      // Determine token type
      const isClassic = this.isClassicToken(token);
      const tokenType = isClassic ? 'classic' : 'fine-grained';

      return {
        isValid: true,
        userInfo: userInfo || undefined,
        type: tokenType,
        scopes: metadata.scopes,
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Authentication validation failed',
      };
    }
  }

  /**
   * Check permissions for PAT
   */
  async checkPermissions(repoOwner: string): Promise<PermissionCheckResult> {
    try {
      const result = await this.verifyTokenPermissions(repoOwner);

      return {
        isValid: result.isValid,
        error: result.error,
        permissions: {
          allRepos: result.isValid, // PAT-based check
          admin: result.isValid,
          contents: result.isValid,
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
   * PAT tokens don't auto-refresh, so this throws
   */
  async refreshToken(): Promise<string> {
    throw new Error(
      'Personal Access Tokens cannot be automatically refreshed. Please generate a new token.'
    );
  }

  /**
   * Clear PAT authentication data
   */
  async clearAuth(): Promise<void> {
    try {
      await chrome.storage.sync.remove(['githubToken']);
      this.token = null;
    } catch (error) {
      console.error('Failed to clear PAT auth:', error);
      throw new Error('Failed to clear PAT authentication');
    }
  }

  /**
   * Get user information for PAT
   */
  async getUserInfo(): Promise<{
    login: string;
    id: number;
    avatar_url: string;
  } | null> {
    try {
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
      return {
        login: userData.login,
        id: userData.id,
        avatar_url: userData.avatar_url,
      };
    } catch (error) {
      console.error('Failed to get user info:', error);
      return null;
    }
  }

  /**
   * PAT tokens don't have automatic expiration, so always false
   */
  async needsRenewal(): Promise<boolean> {
    return false;
  }

  /**
   * Get PAT metadata
   */
  async getMetadata(): Promise<{
    scopes?: string[];
    expiresAt?: string;
    lastUsed?: string;
    [key: string]: any;
  }> {
    try {
      const token = await this.getToken();

      // Get token scopes from GitHub API
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const scopes: string[] = [];
      if (response.ok) {
        const scopeHeader = response.headers.get('x-oauth-scopes');
        if (scopeHeader) {
          scopes.push(...scopeHeader.split(',').map((s) => s.trim()));
        }
      }

      const isClassic = this.isClassicToken(token);

      return {
        scopes,
        tokenType: isClassic ? 'classic' : 'fine-grained',
        lastUsed: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Failed to get PAT metadata:', error);
      return {};
    }
  }

  /**
   * Initialize with token if provided
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Check if token is a classic PAT
   */
  private isClassicToken(token: string): boolean {
    return token.startsWith('ghp_');
  }

  /**
   * Validate token and username
   */
  private async validateTokenAndUser(
    token: string,
    username: string
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const response = await fetch(`https://api.github.com/users/${username}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (response.status === 401) {
        return { isValid: false, error: 'Invalid token' };
      }

      if (response.status === 404) {
        return { isValid: false, error: 'User not found' };
      }

      if (!response.ok) {
        return { isValid: false, error: `GitHub API error: ${response.status}` };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Token validation failed',
      };
    }
  }

  /**
   * Verify token permissions
   */
  private async verifyTokenPermissions(
    repoOwner: string
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const token = await this.getToken();

      // Check if we can access user's repos
      const response = await fetch(`https://api.github.com/user/repos`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return {
          isValid: false,
          error: 'Insufficient permissions. Token needs repo scope.',
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Permission check failed',
      };
    }
  }
}
