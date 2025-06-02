import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import { GitHubApiClient } from './GitHubApiClient';
import { GitHubAppsApiClient } from './GitHubAppsApiClient';
import { GitHubAppsService } from '../content/services/GitHubAppsService';

/**
 * Factory for creating the appropriate GitHub API client
 * Handles the choice between PAT and GitHub App authentication
 */
export class GitHubApiClientFactory {
  /**
   * Creates the best available GitHub API client
   * Priority: GitHub App (if available) > PAT (for compatibility)
   *
   * @param patToken Optional PAT token for backward compatibility
   * @param preferGitHubApp Whether to prefer GitHub App over PAT when both are available
   * @returns Promise resolving to the appropriate API client
   */
  static async createApiClient(
    patToken?: string,
    preferGitHubApp: boolean = true
  ): Promise<IGitHubApiClient> {
    try {
      // Check GitHub App availability
      const githubAppsService = GitHubAppsService.getInstance();
      const installationToken = await githubAppsService.getInstallationToken();

      // If GitHub App is available and preferred (or no PAT provided)
      if (installationToken && (preferGitHubApp || !patToken)) {
        console.log('🚀 Using GitHub App API client with installation token');
        return new GitHubAppsApiClient();
      }

      // Fall back to PAT if provided
      if (patToken) {
        console.log('🔑 Using PAT API client for backward compatibility');
        return new GitHubApiClient(patToken);
      }

      // If no PAT but GitHub App service exists, try to use it anyway
      // (it might have user tokens from SupabaseAuth)
      console.log('⚠️ No PAT provided, attempting GitHub App API client');
      return new GitHubAppsApiClient();
    } catch (error) {
      console.error('Error creating GitHub API client:', error);

      // Final fallback to PAT if provided
      if (patToken) {
        console.log('🔄 Falling back to PAT API client due to GitHub App error');
        return new GitHubApiClient(patToken);
      }

      // If no PAT and GitHub App failed, still return GitHub App client
      // (it will handle the error gracefully when making requests)
      console.log('⚠️ Creating GitHub App API client despite initialization error');
      return new GitHubAppsApiClient();
    }
  }

  /**
   * Creates a GitHub API client specifically for new users (GitHub App preferred)
   * @returns Promise resolving to GitHub App API client
   */
  static async createApiClientForNewUser(): Promise<IGitHubApiClient> {
    console.log('👤 Creating API client for new user (GitHub App preferred)');
    return new GitHubAppsApiClient();
  }

  /**
   * Creates a GitHub API client for existing users with PAT
   * @param patToken The user's PAT token
   * @param allowUpgrade Whether to allow upgrading to GitHub App if available
   * @returns Promise resolving to the appropriate API client
   */
  static async createApiClientForExistingUser(
    patToken: string,
    allowUpgrade: boolean = false
  ): Promise<IGitHubApiClient> {
    if (allowUpgrade) {
      console.log('🔄 Creating API client for existing user with upgrade option');
      return this.createApiClient(patToken, true);
    } else {
      console.log('🔑 Creating PAT API client for existing user');
      return new GitHubApiClient(patToken);
    }
  }

  /**
   * Get authentication status and recommendations
   * @param patToken Optional PAT token to check
   * @param checkBothMethods Whether to check both auth methods (for migration scenarios)
   * @returns Promise resolving to authentication status
   */
  static async getAuthenticationStatus(
    patToken?: string,
    checkBothMethods: boolean = false
  ): Promise<{
    hasGitHubApp: boolean;
    hasPAT: boolean;
    canUseGitHubApp: boolean;
    canUsePAT: boolean;
    recommended: 'github_app' | 'pat' | 'none';
    rateLimits: {
      githubApp?: { limit: number; remaining: number };
      pat?: { limit: number; remaining: number };
    };
    currentRateLimit?: { limit: number; remaining: number; reset: number };
  }> {
    const result = {
      hasGitHubApp: false,
      hasPAT: !!patToken,
      canUseGitHubApp: false,
      canUsePAT: !!patToken,
      recommended: 'none' as 'github_app' | 'pat' | 'none',
      rateLimits: {} as any,
      currentRateLimit: undefined as
        | { limit: number; remaining: number; reset: number }
        | undefined,
    };

    try {
      // Always check GitHub App availability first (it's the preferred method)
      const githubAppsService = GitHubAppsService.getInstance();
      const installationToken = await githubAppsService.getInstallationToken();

      if (installationToken) {
        result.hasGitHubApp = true;
        result.canUseGitHubApp = true;

        // Get rate limit for GitHub App
        try {
          const appRateLimit = await githubAppsService.checkRateLimit(
            installationToken.token,
            'installation'
          );
          if (appRateLimit) {
            result.rateLimits.githubApp = {
              limit: appRateLimit.limit,
              remaining: appRateLimit.remaining,
            };
            result.currentRateLimit = {
              limit: appRateLimit.limit,
              remaining: appRateLimit.remaining,
              reset: appRateLimit.reset,
            };
          }
        } catch (error) {
          console.warn('Failed to check GitHub App rate limit:', error);
        }

        // If GitHub App is available, it's the recommended method
        result.recommended = 'github_app';

        // If we're not checking both methods and GitHub App is available,
        // we don't need to check PAT rate limits (GitHub App is primary)
        if (!checkBothMethods) {
          return result;
        }
      }

      // Check PAT status if provided and either:
      // 1. We're checking both methods explicitly, OR
      // 2. GitHub App is not available (PAT as fallback)
      if (patToken && (checkBothMethods || !result.canUseGitHubApp)) {
        try {
          const patClient = new GitHubApiClient(patToken);
          const patRateLimit = await patClient.getRateLimit();
          if (patRateLimit?.rate) {
            result.rateLimits.pat = {
              limit: patRateLimit.rate.limit,
              remaining: patRateLimit.rate.remaining,
            };

            // Only use PAT as current rate limit if GitHub App is not available
            if (!result.currentRateLimit) {
              result.currentRateLimit = {
                limit: patRateLimit.rate.limit,
                remaining: patRateLimit.rate.remaining,
                reset: patRateLimit.rate.reset,
              };
              // If GitHub App is not available, recommend PAT
              if (!result.canUseGitHubApp) {
                result.recommended = 'pat';
              }
            }
          }
        } catch (error) {
          console.warn('Failed to check PAT rate limit:', error);
          result.canUsePAT = false;
        }
      }

      // Final recommendation logic:
      // 1. GitHub App if available (preferred)
      // 2. PAT if GitHub App not available
      // 3. None if neither available
      if (result.canUseGitHubApp) {
        result.recommended = 'github_app';
      } else if (result.canUsePAT) {
        result.recommended = 'pat';
      } else {
        result.recommended = 'none';
      }
    } catch (error) {
      console.error('Error checking authentication status:', error);
    }

    return result;
  }

  /**
   * Migrate from PAT to GitHub App (if possible)
   * @param currentPatToken The current PAT token
   * @returns Promise resolving to new API client or null if migration not possible
   */
  static async migrateToGitHubApp(currentPatToken: string): Promise<IGitHubApiClient | null> {
    try {
      console.log('🔄 Attempting to migrate from PAT to GitHub App...');

      const githubAppsService = GitHubAppsService.getInstance();
      const installationToken = await githubAppsService.getInstallationToken();

      if (installationToken) {
        console.log('✅ Migration successful - GitHub App is available');
        return new GitHubAppsApiClient();
      } else {
        console.log('❌ Migration not possible - GitHub App not installed');
        return null;
      }
    } catch (error) {
      console.error('Error during migration to GitHub App:', error);
      return null;
    }
  }
}
