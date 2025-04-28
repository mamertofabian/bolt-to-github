import type { ProgressCallback } from '../types/common';

/**
 * Interface for GitHub token validation and management
 */
export interface ITokenService {
  /**
   * Validates if the token is valid
   * @returns Promise resolving to true if token is valid, false otherwise
   */
  validateToken(): Promise<boolean>;

  /**
   * Checks if the token is a classic GitHub token
   * @returns True if token is a classic token, false otherwise
   */
  isClassicToken(): boolean;

  /**
   * Checks if the token is a fine-grained GitHub token
   * @returns True if token is a fine-grained token, false otherwise
   */
  isFineGrainedToken(): boolean;

  /**
   * Validates if the token has access to the specified username
   * @param username GitHub username or organization
   * @returns Promise resolving to validation result with optional error message
   */
  validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }>;

  /**
   * Verifies if the token has the required permissions for the specified username
   * @param username GitHub username or organization
   * @param onProgress Optional callback for progress updates
   * @returns Promise resolving to validation result with optional error message
   */
  verifyTokenPermissions(
    username: string,
    onProgress?: ProgressCallback
  ): Promise<{ isValid: boolean; error?: string }>;
}
