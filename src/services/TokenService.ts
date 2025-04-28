import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import type { ITokenService } from './interfaces/ITokenService';
import type { ProgressCallback } from './types/common';

/**
 * Service for GitHub token validation and management
 */
export class TokenService implements ITokenService {
  /**
   * Creates a new TokenService instance
   * @param apiClient GitHub API client
   */
  constructor(private apiClient: IGitHubApiClient) {}

  /**
   * Validates if the token is valid
   * @returns Promise resolving to true if token is valid, false otherwise
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.apiClient.request('GET', '/user');
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  /**
   * Checks if the token is a classic GitHub token
   * @returns True if token is a classic token, false otherwise
   */
  isClassicToken(): boolean {
    // This is a property of the token itself, so we can implement it directly
    // We're assuming the token is stored in the apiClient
    // In a real implementation, we might need to pass the token to this service
    // or have a way to access it from the apiClient
    const token = (this.apiClient as any).token;
    return token?.startsWith('ghp_') || false;
  }

  /**
   * Checks if the token is a fine-grained GitHub token
   * @returns True if token is a fine-grained token, false otherwise
   */
  isFineGrainedToken(): boolean {
    const token = (this.apiClient as any).token;
    return token?.startsWith('github_pat_') || false;
  }

  /**
   * Helper method to delay execution
   * @param ms Milliseconds to delay
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validates if the token has access to the specified username
   * @param username GitHub username or organization
   * @returns Promise resolving to validation result with optional error message
   */
  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      return await this.validateClassicToken(username);
    } catch (error) {
      console.error('Validation failed:', error);
      return { isValid: false, error: 'Validation failed' };
    }
  }

  /**
   * Validates if a classic token has access to the specified username
   * @param username GitHub username or organization
   * @returns Promise resolving to validation result with optional error message
   */
  private async validateClassicToken(
    username: string
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const authUser = await this.apiClient.request('GET', '/user');

      if (!authUser.login) {
        return { isValid: false, error: 'Invalid GitHub token' };
      }

      if (authUser.login.toLowerCase() === username.toLowerCase()) {
        return { isValid: true };
      }

      // Check if username refers to an organization
      try {
        const targetUser = await this.apiClient.request('GET', `/users/${username}`);
        if (targetUser.type === 'Organization') {
          const orgs = await this.apiClient.request('GET', '/user/orgs');
          const hasOrgAccess = orgs.some(
            (org: any) => org.login.toLowerCase() === username.toLowerCase()
          );
          if (hasOrgAccess) {
            return { isValid: true };
          }
          return { isValid: false, error: 'Token does not have access to this organization' };
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
          return { isValid: false, error: 'Invalid GitHub username or organization' };
        }
        throw error;
      }

      return {
        isValid: false,
        error:
          'Token can only be used with your GitHub username or organizations you have access to',
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return { isValid: false, error: 'Invalid GitHub username or organization' };
      }
      return { isValid: false, error: 'Invalid GitHub token' };
    }
  }

  /**
   * Verifies if the token has the required permissions for the specified username
   * @param username GitHub username or organization
   * @param onProgress Optional callback for progress updates
   * @returns Promise resolving to validation result with optional error message
   */
  async verifyTokenPermissions(
    username: string,
    onProgress?: ProgressCallback
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      // First determine if username refers to an organization
      let isOrg = false;
      let testOwner = username;
      let authUser;

      try {
        authUser = await this.apiClient.request('GET', '/user');

        // Check if the owner is not the current user
        if (username.toLowerCase() !== authUser.login.toLowerCase()) {
          try {
            const targetUser = await this.apiClient.request('GET', `/users/${username}`);
            isOrg = targetUser.type === 'Organization';

            // If it's an org, check if the user is a member
            if (isOrg) {
              const orgs = await this.apiClient.request('GET', '/user/orgs');
              const hasOrgAccess = orgs.some(
                (org: any) => org.login.toLowerCase() === username.toLowerCase()
              );

              if (!hasOrgAccess) {
                return {
                  isValid: false,
                  error: 'Token does not have access to this organization',
                };
              }
            } else {
              // If not an org and not the current user, they can't create repos here
              return {
                isValid: false,
                error:
                  'Token can only be used with your GitHub username or organizations you have access to',
              };
            }
          } catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
              return { isValid: false, error: 'Invalid GitHub username or organization' };
            }
            throw error;
          }
        }
      } catch (error) {
        return { isValid: false, error: 'Invalid GitHub token' };
      }

      // Create a temporary test repo
      const timestamp = Date.now();
      const repoName = `test-repo-${timestamp}`;

      // Test repository creation (All repositories access)
      try {
        if (isOrg) {
          // Create in organization
          await this.apiClient.request('POST', `/orgs/${username}/repos`, {
            name: repoName,
            private: true,
            auto_init: true,
          });
        } else {
          // Create in user account
          await this.apiClient.request('POST', '/user/repos', {
            name: repoName,
            private: true,
            auto_init: true,
          });
        }
        await this.delay(2000);
        onProgress?.({ permission: 'repos', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'repos', isValid: false });
        console.error('Repository creation failed:', error);
        return {
          isValid: false,
          error: `Token lacks repository creation permission${isOrg ? ' for this organization' : ''}`,
        };
      }

      // Test visibility change (Admin Write)
      try {
        await this.apiClient.request('PATCH', `/repos/${username}/${repoName}`, {
          private: false,
        });
        await this.delay(2000);
        onProgress?.({ permission: 'admin', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'admin', isValid: false });
        console.error('Repo visibility change failed:', error);
        // Cleanup repo before returning
        try {
          await this.apiClient.request('DELETE', `/repos/${username}/${repoName}`);
        } catch (cleanupError) {
          console.error('Failed to cleanup repository after admin check:', cleanupError);
        }
        return {
          isValid: false,
          error: `Token lacks repository administration permission${isOrg ? ' for this organization' : ''}`,
        };
      }

      try {
        // Test contents read by listing contents
        await this.apiClient.request('GET', `/repos/${username}/${repoName}/contents`);

        // Test contents write with a small .gitkeep file
        const content = btoa(''); // empty file in base64
        await this.apiClient.request('PUT', `/repos/${username}/${repoName}/contents/.gitkeep`, {
          message: 'Test write permission',
          content: content,
        });
        onProgress?.({ permission: 'code', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'code', isValid: false });
        console.error('Content read/write check failed:', error);
        // Cleanup repo before returning
        try {
          await this.apiClient.request('DELETE', `/repos/${username}/${repoName}`);
        } catch (cleanupError) {
          console.error('Failed to cleanup repository after contents check:', cleanupError);
        }
        return {
          isValid: false,
          error: `Token lacks repository contents read/write permission${isOrg ? ' for this organization' : ''}`,
        };
      }

      // Cleanup: Delete the test repository
      try {
        await this.apiClient.request('DELETE', `/repos/${username}/${repoName}`, undefined, {
          // Add accept header to handle empty response
          headers: {
            accept: 'application/vnd.github+json',
          },
        });
      } catch (error) {
        console.error('Failed to cleanup test repository:', error);
        // Don't return error here as permissions were already verified
      }

      return { isValid: true };
    } catch (error) {
      console.error('Permission verification failed:', error);
      return {
        isValid: false,
        error: `Permission verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
