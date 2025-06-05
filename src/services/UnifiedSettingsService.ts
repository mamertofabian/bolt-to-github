import { GitHubAppsService } from '../content/services/GitHubAppsService';

export interface SettingsCheckResult {
  isSettingsValid: boolean;
  gitHubSettings?: {
    githubToken: string;
    repoOwner: string;
    projectSettings?: { repoName: string; branch: string; projectTitle?: string };
  };
  authMethod?: 'pat' | 'github_app' | 'unknown';
  hasInstallationToken?: boolean;
  hasUserAccessToken?: boolean;
}

/**
 * Unified Settings Service that bridges the githubSettings store functionality
 * to content scripts and background scripts while supporting both PAT and GitHub App
 */
export class UnifiedSettingsService {
  private static githubAppService: GitHubAppsService | null = null;

  /**
   * Get GitHub App service instance (lazy initialization)
   */
  private static getGitHubAppService(): GitHubAppsService {
    if (!this.githubAppService) {
      this.githubAppService = GitHubAppsService.getInstance();
    }
    return this.githubAppService;
  }

  /**
   * Get GitHub settings with support for both PAT and GitHub App
   * This replaces the original SettingsService.getGitHubSettings()
   */
  static async getGitHubSettings(): Promise<SettingsCheckResult> {
    try {
      // Get basic storage data
      const [settings, projectId] = await Promise.all([
        chrome.storage.sync.get(['githubToken', 'repoOwner', 'projectSettings']),
        chrome.storage.sync.get('projectId'),
      ]);

      // Check for GitHub App tokens
      const [installationTokenData, userTokenData] = await Promise.all([
        chrome.storage.local.get(['github_installation_token']),
        chrome.storage.local.get(['github_user_access_token']),
      ]);

      // Check GitHub App token validity
      let hasValidInstallationToken = false;
      let hasValidUserToken = false;

      if (installationTokenData.github_installation_token) {
        const installationToken = installationTokenData.github_installation_token;
        const expiresAt = new Date(installationToken.expires_at);
        const timeUntilExpiry = expiresAt.getTime() - Date.now();
        hasValidInstallationToken = timeUntilExpiry > 5 * 60 * 1000; // More than 5 minutes left
      }

      if (userTokenData.github_user_access_token) {
        const userToken = userTokenData.github_user_access_token;
        const expiresAt = new Date(userToken.expires_at);
        const timeUntilExpiry = expiresAt.getTime() - Date.now();
        hasValidUserToken = timeUntilExpiry > 5 * 60 * 1000; // More than 5 minutes left
      }

      // Determine authentication method
      let authMethod: 'pat' | 'github_app' | 'unknown' = 'unknown';
      let effectiveToken = '';
      let effectiveRepoOwner = '';

      if (hasValidInstallationToken || hasValidUserToken) {
        authMethod = 'github_app';
        // For GitHub App, we get the token from the GitHub App service
        if (hasValidInstallationToken) {
          const installationToken = installationTokenData.github_installation_token;
          effectiveToken = installationToken.token;
          effectiveRepoOwner = installationToken.username;
        } else if (hasValidUserToken) {
          const userToken = userTokenData.github_user_access_token;
          effectiveToken = userToken.access_token;
          effectiveRepoOwner = userToken.github_username;
        }
      } else if (settings.githubToken && settings.repoOwner) {
        authMethod = 'pat';
        effectiveToken = settings.githubToken;
        effectiveRepoOwner = settings.repoOwner;
      }

      // Get project settings for current project
      let projectSettings = settings.projectSettings?.[projectId.projectId];

      // Auto-create project settings if needed
      if (
        !projectSettings &&
        projectId?.projectId &&
        effectiveRepoOwner &&
        (effectiveToken || hasValidInstallationToken || hasValidUserToken)
      ) {
        projectSettings = { repoName: projectId.projectId, branch: 'main' };
        await chrome.storage.sync.set({
          [`projectSettings.${projectId.projectId}`]: projectSettings,
        });
      }

      // Determine if settings are valid
      const isSettingsValid = Boolean(
        (effectiveToken || hasValidInstallationToken || hasValidUserToken) &&
          effectiveRepoOwner &&
          settings.projectSettings &&
          projectSettings
      );

      return {
        isSettingsValid,
        authMethod,
        hasInstallationToken: hasValidInstallationToken,
        hasUserAccessToken: hasValidUserToken,
        gitHubSettings: {
          githubToken: effectiveToken, // This will be the active token (PAT or GitHub App)
          repoOwner: effectiveRepoOwner, // This will be the active owner (PAT user or GitHub App username)
          projectSettings: projectSettings || undefined,
        },
      };
    } catch (error) {
      console.error('Error checking GitHub settings:', error);
      return {
        isSettingsValid: false,
        authMethod: 'unknown',
        hasInstallationToken: false,
        hasUserAccessToken: false,
      };
    }
  }

  /**
   * Get active authentication token (PAT or GitHub App token)
   * This is a new method that returns the currently active token regardless of auth method
   */
  static async getActiveToken(): Promise<string | null> {
    try {
      const result = await this.getGitHubSettings();
      return result.gitHubSettings?.githubToken || null;
    } catch (error) {
      console.error('Error getting active token:', error);
      return null;
    }
  }

  /**
   * Get active repository owner (PAT user or GitHub App username)
   */
  static async getActiveRepoOwner(): Promise<string | null> {
    try {
      const result = await this.getGitHubSettings();
      return result.gitHubSettings?.repoOwner || null;
    } catch (error) {
      console.error('Error getting active repo owner:', error);
      return null;
    }
  }

  /**
   * Get project ID (unchanged from original SettingsService)
   */
  static async getProjectId(): Promise<string | null> {
    try {
      const { projectId } = await chrome.storage.sync.get('projectId');
      return projectId || null;
    } catch (error) {
      console.error('Failed to get project ID:', error);
      return null;
    }
  }

  /**
   * Set project ID (unchanged from original SettingsService)
   */
  static async setProjectId(projectId: string): Promise<void> {
    try {
      await chrome.storage.sync.set({ projectId });
    } catch (error) {
      console.error('Failed to set project ID:', error);
    }
  }

  /**
   * Get effective GitHub authentication info (supports both PAT and GitHub App)
   * This is a new helper method that provides authentication details
   */
  static async getAuthInfo(): Promise<{
    hasAuth: boolean;
    authMethod: 'pat' | 'github_app' | 'unknown';
    token: string | null;
    repoOwner: string | null;
    canCreateRepos: boolean;
  }> {
    try {
      const result = await this.getGitHubSettings();

      return {
        hasAuth: result.isSettingsValid,
        authMethod: result.authMethod || 'unknown',
        token: result.gitHubSettings?.githubToken || null,
        repoOwner: result.gitHubSettings?.repoOwner || null,
        canCreateRepos: result.isSettingsValid, // Both PAT and GitHub App can create repos if properly configured
      };
    } catch (error) {
      console.error('Error getting auth info:', error);
      return {
        hasAuth: false,
        authMethod: 'unknown',
        token: null,
        repoOwner: null,
        canCreateRepos: false,
      };
    }
  }

  /**
   * Refresh GitHub App tokens if needed
   * This is a new method specific to GitHub App functionality
   */
  static async refreshGitHubAppTokens(): Promise<boolean> {
    try {
      const githubAppService = this.getGitHubAppService();

      // Try to refresh installation token
      const installationToken = await githubAppService.getInstallationToken();
      if (installationToken) {
        console.log('✅ GitHub App installation token refreshed');
        return true;
      }

      // Try to refresh user access token
      const userToken = await githubAppService.getUserAccessToken();
      if (userToken) {
        console.log('✅ GitHub App user access token refreshed');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error refreshing GitHub App tokens:', error);
      return false;
    }
  }

  /**
   * Check if GitHub App is available and configured
   */
  static async isGitHubAppAvailable(): Promise<boolean> {
    try {
      const result = await this.getGitHubSettings();
      return result.hasInstallationToken || result.hasUserAccessToken || false;
    } catch (error) {
      console.error('Error checking GitHub App availability:', error);
      return false;
    }
  }
}
