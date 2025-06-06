/**
 * Personal Access Token (PAT) Authentication Strategy
 * Implements the existing PAT-based authentication logic
 */

import type { IAuthenticationStrategy } from './interfaces/IAuthenticationStrategy';
import type { 
  AuthenticationType, 
  TokenValidationResult, 
  PermissionCheckResult 
} from './types/authentication';
import { GitHubService } from './GitHubService';

export class PATAuthenticationStrategy implements IAuthenticationStrategy {
  readonly type: AuthenticationType = 'pat';
  private githubService: GitHubService | null = null;
  private token: string | null = null;

  constructor(token?: string) {
    if (token) {
      this.token = token;
      this.githubService = new GitHubService(token);
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
      this.githubService = new GitHubService(this.token);
      return this.token;
    } catch (error) {
      throw new Error('Failed to get GitHub token from storage');
    }
  }

  /**
   * Validate PAT authentication
   */
  async validateAuth(): Promise<TokenValidationResult> {
    try {
      if (!this.githubService) {
        await this.getToken(); // This will initialize githubService
      }

      const storage = await chrome.storage.sync.get('repoOwner');
      const repoOwner = storage.repoOwner || '';

      const result = await this.githubService!.validateTokenAndUser(repoOwner);
      
      if (!result.isValid) {
        return {
          isValid: false,
          error: result.error || 'Token validation failed',
        };
      }

      // Determine token type
      const token = await this.getToken();
      const isClassic = await this.githubService!.isClassicToken();
      const tokenType = isClassic ? 'classic' : 'fine-grained';

      return {
        isValid: true,
        userInfo: result.userInfo,
        type: tokenType,
        scopes: result.scopes,
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
      if (!this.githubService) {
        await this.getToken();
      }

      const result = await this.githubService!.verifyTokenPermissions(repoOwner);
      
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
    throw new Error('Personal Access Tokens cannot be automatically refreshed. Please generate a new token.');
  }

  /**
   * Clear PAT authentication data
   */
  async clearAuth(): Promise<void> {
    try {
      await chrome.storage.sync.remove(['githubToken']);
      this.token = null;
      this.githubService = null;
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
      if (!this.githubService) {
        await this.getToken();
      }

      const token = await this.getToken();
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
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
      if (!this.githubService) {
        await this.getToken();
      }

      const token = await this.getToken();
      
      // Get token scopes from GitHub API
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      const scopes: string[] = [];
      if (response.ok) {
        const scopeHeader = response.headers.get('x-oauth-scopes');
        if (scopeHeader) {
          scopes.push(...scopeHeader.split(',').map(s => s.trim()));
        }
      }

      const isClassic = await this.githubService!.isClassicToken();

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
    this.githubService = new GitHubService(token);
  }
}