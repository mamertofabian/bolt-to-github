/**
 * Authentication strategy interface for unified GitHub authentication
 * Implements strategy pattern for PAT and GitHub App authentication
 */

import type {
  TokenValidationResult,
  PermissionCheckResult,
  AuthenticationType,
} from '../types/authentication';

export interface IAuthenticationStrategy {
  /**
   * Get the authentication type this strategy handles
   */
  readonly type: AuthenticationType;

  /**
   * Check if this strategy is properly configured and ready to use
   */
  isConfigured(): Promise<boolean>;

  /**
   * Get a valid access token for GitHub API calls
   * Handles automatic refresh if needed
   */
  getToken(): Promise<string>;

  /**
   * Validate the current authentication and return user info
   * @param username Optional username to validate against (for PAT authentication)
   */
  validateAuth(username?: string): Promise<TokenValidationResult>;

  /**
   * Check permissions for the authenticated user
   */
  checkPermissions(repoOwner: string): Promise<PermissionCheckResult>;

  /**
   * Refresh the authentication token if possible
   * Returns new token or throws if refresh is not possible
   */
  refreshToken(): Promise<string>;

  /**
   * Clear stored authentication data
   */
  clearAuth(): Promise<void>;

  /**
   * Get user information associated with this authentication
   */
  getUserInfo(): Promise<{
    login: string;
    id: number;
    avatar_url: string;
  } | null>;

  /**
   * Check if the authentication needs renewal (e.g., token expired)
   */
  needsRenewal(): Promise<boolean>;

  /**
   * Get authentication metadata (scopes, expiration, etc.)
   */
  getMetadata(): Promise<{
    scopes?: string[];
    expiresAt?: string;
    lastUsed?: string;
    [key: string]: unknown;
  }>;
}

/**
 * Factory interface for creating authentication strategies
 */
export interface IAuthenticationStrategyFactory {
  /**
   * Create an authentication strategy for the given type
   */
  createStrategy(type: AuthenticationType): IAuthenticationStrategy;

  /**
   * Get the default authentication strategy for new users
   */
  getDefaultStrategy(): IAuthenticationStrategy;

  /**
   * Get the currently configured authentication strategy
   */
  getCurrentStrategy(): Promise<IAuthenticationStrategy>;
}
