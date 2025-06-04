import { writable, derived, type Writable } from 'svelte/store';
import { GitHubService } from '../../services/GitHubService';
import type { GitHubSettingsInterface, ProjectSettings } from '../types';
import { GitHubAppsService } from '../../content/services/GitHubAppsService';

// GitHub Settings State Interface
export interface GitHubSettingsState {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  projectSettings: ProjectSettings;
  isValidatingToken: boolean;
  isTokenValid: boolean | null;
  validationError: string | null;
  hasInitialSettings: boolean;
  tokenType: 'classic' | 'fine-grained' | null;
  authMethod: 'pat' | 'github_app' | 'unknown';
  showMigrationPrompt: boolean;
  migrationDismissedAt: number | null;
  rateLimitWarnings: {
    lastWarningAt: number | null;
    criticalWarningShown: boolean;
  };
  githubAppStatus: {
    isAvailable: boolean;
    lastChecked: number | null;
    canMigrate: boolean;
    hasInstallationToken: boolean;
    installationId: number | null;
    hasUserAccessToken: boolean;
    userAccessTokenExpiry: Date | null;
  };
}

// Initial state
const initialState: GitHubSettingsState = {
  githubToken: '',
  repoOwner: '',
  repoName: '',
  branch: 'main',
  projectSettings: {},
  isValidatingToken: false,
  isTokenValid: null,
  validationError: null,
  hasInitialSettings: false,
  tokenType: null,
  authMethod: 'unknown',
  showMigrationPrompt: false,
  migrationDismissedAt: null,
  rateLimitWarnings: {
    lastWarningAt: null,
    criticalWarningShown: false,
  },
  githubAppStatus: {
    isAvailable: false,
    lastChecked: null,
    canMigrate: false,
    hasInstallationToken: false,
    installationId: null,
    hasUserAccessToken: false,
    userAccessTokenExpiry: null,
  },
};

// Create the writable store
export const githubSettingsStore: Writable<GitHubSettingsState> = writable(initialState);

// Derived store for any GitHub authentication (PAT or GitHub App)
export const hasGitHubAuthentication = derived(
  githubSettingsStore,
  ($settings) =>
    Boolean($settings.githubToken) ||
    Boolean($settings.githubAppStatus.hasInstallationToken) ||
    Boolean($settings.githubAppStatus.hasUserAccessToken)
);

// Derived store for settings validity
export const isSettingsValid = derived(
  githubSettingsStore,
  ($settings) =>
    Boolean(
      ($settings.githubToken ||
        $settings.githubAppStatus.hasInstallationToken ||
        $settings.githubAppStatus.hasUserAccessToken) &&
        $settings.repoOwner &&
        $settings.repoName &&
        $settings.branch
    ) &&
    !$settings.isValidatingToken &&
    ($settings.isTokenValid === true ||
      $settings.githubAppStatus.hasInstallationToken ||
      $settings.githubAppStatus.hasUserAccessToken)
);

// Derived store for user access token status
export const hasUserAccessToken = derived(githubSettingsStore, ($settings) =>
  Boolean($settings.githubAppStatus.hasUserAccessToken)
);

// Store actions
export const githubSettingsActions = {
  /**
   * Initialize settings from Chrome storage
   */
  async initialize(): Promise<void> {
    try {
      const storedSettings = (await chrome.storage.sync.get([
        'githubToken',
        'repoOwner',
        'projectSettings',
      ])) as GitHubSettingsInterface;

      githubSettingsStore.update((state) => ({
        ...state,
        githubToken: storedSettings.githubToken || '',
        repoOwner: storedSettings.repoOwner || '',
        projectSettings: storedSettings.projectSettings || {},
        hasInitialSettings: Boolean(storedSettings.githubToken && storedSettings.repoOwner),
      }));

      // Update GitHub App status
      await this.updateGitHubAppStatus();

      // Check for GitHub App installation token
      await this.checkGitHubAppStatus();

      // Initialize user access token for GitHub App users
      await this.initializeUserAccessToken();

      // Validate existing token if available
      if (storedSettings.githubToken && storedSettings.repoOwner) {
        await this.validateToken(storedSettings.githubToken, storedSettings.repoOwner);

        // Detect authentication method for existing users
        await this.detectAuthMethod();
      }
    } catch (error) {
      console.error('Error initializing GitHub settings:', error);
    }
  },

  /**
   * Update GitHub token
   */
  setGitHubToken(token: string): void {
    githubSettingsStore.update((state) => ({
      ...state,
      githubToken: token,
      isTokenValid: null,
      validationError: null,
    }));
  },

  /**
   * Update repository owner
   */
  setRepoOwner(owner: string): void {
    githubSettingsStore.update((state) => ({
      ...state,
      repoOwner: owner,
      isTokenValid: null,
      validationError: null,
    }));
  },

  /**
   * Update repository name
   */
  setRepoName(name: string): void {
    githubSettingsStore.update((state) => ({
      ...state,
      repoName: name,
    }));
  },

  /**
   * Update branch name
   */
  setBranch(branch: string): void {
    githubSettingsStore.update((state) => ({
      ...state,
      branch,
    }));
  },

  /**
   * Update project settings for a specific project
   */
  setProjectSettings(
    projectId: string,
    repoName: string,
    branch: string,
    projectTitle?: string
  ): void {
    githubSettingsStore.update((state) => ({
      ...state,
      projectSettings: {
        ...state.projectSettings,
        [projectId]: { repoName, branch, ...(projectTitle && { projectTitle }) },
      },
    }));
  },

  /**
   * Load project settings for a specific project
   */
  loadProjectSettings(projectId: string): void {
    githubSettingsStore.update((state) => {
      const projectSetting = state.projectSettings[projectId];
      if (projectSetting) {
        return {
          ...state,
          repoName: projectSetting.repoName,
          branch: projectSetting.branch,
        };
      }
      return {
        ...state,
        repoName: projectId, // Use project ID as default repo name
        branch: 'main',
      };
    });
  },

  /**
   * Validate GitHub token and username
   */
  async validateToken(token: string, username: string): Promise<boolean> {
    if (!token) {
      githubSettingsStore.update((state) => ({
        ...state,
        isTokenValid: false,
        validationError: 'GitHub token is required',
        isValidatingToken: false,
      }));
      return false;
    }

    githubSettingsStore.update((state) => ({
      ...state,
      isValidatingToken: true,
      validationError: null,
    }));

    try {
      const githubService = new GitHubService(token);
      const result = await githubService.validateTokenAndUser(username);

      githubSettingsStore.update((state) => ({
        ...state,
        isTokenValid: result.isValid,
        validationError: result.error || null,
        isValidatingToken: false,
      }));

      return result.isValid;
    } catch (error) {
      console.error('Error validating GitHub token:', error);
      githubSettingsStore.update((state) => ({
        ...state,
        isTokenValid: false,
        validationError: 'Validation failed',
        isValidatingToken: false,
      }));
      return false;
    }
  },

  /**
   * Save settings to Chrome storage
   */
  async saveSettings(): Promise<{ success: boolean; error?: string }> {
    try {
      let currentState: GitHubSettingsState;

      // Get current state from store
      const unsubscribe = githubSettingsStore.subscribe((state) => {
        currentState = state;
      });
      unsubscribe();

      // Validate token before saving
      const isValid = await githubSettingsActions.validateToken(
        currentState!.githubToken,
        currentState!.repoOwner
      );
      if (!isValid) {
        return {
          success: false,
          error: currentState!.validationError || 'Validation failed',
        };
      }

      const settings = {
        githubToken: currentState!.githubToken,
        repoOwner: currentState!.repoOwner,
        projectSettings: currentState!.projectSettings,
      };

      await chrome.storage.sync.set(settings);

      githubSettingsStore.update((state) => ({
        ...state,
        hasInitialSettings: true,
      }));

      return { success: true };
    } catch (error) {
      console.error('Error saving GitHub settings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  /**
   * Reset all settings to initial state
   */
  reset(): void {
    githubSettingsStore.set(initialState);
  },

  /**
   * Check if user should see GitHub App migration prompt
   */
  async checkMigrationPrompt(): Promise<void> {
    let currentState: GitHubSettingsState = initialState;
    const unsubscribe = githubSettingsStore.subscribe((state) => {
      currentState = state;
    });
    unsubscribe();

    // Don't show if already dismissed recently (within 7 days)
    if (currentState.migrationDismissedAt) {
      const daysSinceDismissal =
        (Date.now() - currentState.migrationDismissedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissal < 7) {
        return;
      }
    }

    // Only show for PAT users
    if (currentState.authMethod !== 'pat' || !currentState.githubToken) {
      return;
    }

    try {
      const { GitHubService } = await import('../../services/GitHubService');
      const authStatus = await GitHubService.getAuthenticationStatus(currentState.githubToken);

      githubSettingsStore.update((state) => ({
        ...state,
        githubAppStatus: {
          isAvailable: authStatus.hasGitHubApp,
          lastChecked: Date.now(),
          canMigrate: authStatus.canUseGitHubApp,
          hasInstallationToken: false,
          installationId: null,
          hasUserAccessToken: false,
          userAccessTokenExpiry: null,
        },
        showMigrationPrompt: authStatus.canUseGitHubApp && authStatus.recommended === 'github_app',
      }));
    } catch (error) {
      console.error('Error checking migration status:', error);
    }
  },

  /**
   * Dismiss migration prompt
   */
  dismissMigrationPrompt(): void {
    githubSettingsStore.update((state) => ({
      ...state,
      showMigrationPrompt: false,
      migrationDismissedAt: Date.now(),
    }));
  },

  /**
   * Complete migration to GitHub App
   */
  completeMigration(): void {
    githubSettingsStore.update((state) => ({
      ...state,
      authMethod: 'github_app',
      showMigrationPrompt: false,
      githubAppStatus: {
        ...state.githubAppStatus,
        isAvailable: true,
        canMigrate: false,
        hasInstallationToken: true,
        installationId: state.githubAppStatus.installationId,
        hasUserAccessToken: false,
        userAccessTokenExpiry: null,
      },
    }));
  },

  /**
   * Update rate limit warning status
   */
  updateRateLimitWarnings(options: {
    showCriticalWarning?: boolean;
    resetWarnings?: boolean;
  }): void {
    githubSettingsStore.update((state) => ({
      ...state,
      rateLimitWarnings: {
        lastWarningAt: options.resetWarnings ? null : Date.now(),
        criticalWarningShown: options.resetWarnings
          ? false
          : (options.showCriticalWarning ?? state.rateLimitWarnings.criticalWarningShown),
      },
    }));
  },

  /**
   * Detect authentication method based on current setup
   */
  async detectAuthMethod(): Promise<void> {
    let currentState: GitHubSettingsState = initialState;
    const unsubscribe = githubSettingsStore.subscribe((state) => {
      currentState = state;
    });
    unsubscribe();

    if (!currentState.githubToken) {
      githubSettingsStore.update((state) => ({
        ...state,
        authMethod: 'unknown',
      }));
      return;
    }

    try {
      const { GitHubService } = await import('../../services/GitHubService');
      const authStatus = await GitHubService.getAuthenticationStatus(currentState.githubToken);

      // Prioritize GitHub App if available and recommended
      if (authStatus.canUseGitHubApp && authStatus.recommended === 'github_app') {
        githubSettingsStore.update((state) => ({
          ...state,
          authMethod: 'github_app',
          githubAppStatus: {
            isAvailable: authStatus.hasGitHubApp,
            lastChecked: Date.now(),
            canMigrate: false, // Already migrated if we're here
            hasInstallationToken: true, // Assume true for GitHub App users
            installationId: null, // Will be populated by checkGitHubAppStatus
            hasUserAccessToken: false,
            userAccessTokenExpiry: null,
          },
        }));
      } else if (currentState.githubToken) {
        // Fall back to PAT if GitHub App is not available or not recommended
        githubSettingsStore.update((state) => ({
          ...state,
          authMethod: 'pat',
          githubAppStatus: {
            isAvailable: authStatus.hasGitHubApp,
            lastChecked: Date.now(),
            canMigrate: authStatus.canUseGitHubApp,
            hasInstallationToken: false, // PAT users don't have installation tokens
            installationId: null,
            hasUserAccessToken: false,
            userAccessTokenExpiry: null,
          },
        }));
      }
    } catch (error) {
      console.error('Error detecting authentication method:', error);
      // Default to PAT for existing users with tokens as fallback
      if (currentState.githubToken) {
        githubSettingsStore.update((state) => ({
          ...state,
          authMethod: 'pat',
        }));
      }
    }
  },

  /**
   * Check for GitHub App installation token and update status
   */
  async checkGitHubAppStatus(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['github_installation_token']);
      const installationToken = result.github_installation_token;

      if (installationToken) {
        // Check if token is still valid (not expired)
        const expiresAt = new Date(installationToken.expires_at);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();

        const isValid = timeUntilExpiry > 5 * 60 * 1000; // More than 5 minutes left

        githubSettingsStore.update((state) => ({
          ...state,
          githubAppStatus: {
            ...state.githubAppStatus,
            hasInstallationToken: isValid,
            installationId: isValid ? installationToken.installation_id : null,
            isAvailable: isValid,
            lastChecked: Date.now(),
            hasUserAccessToken: false,
            userAccessTokenExpiry: null,
          },
          authMethod: isValid ? 'github_app' : state.authMethod,
        }));
      } else {
        githubSettingsStore.update((state) => ({
          ...state,
          githubAppStatus: {
            ...state.githubAppStatus,
            hasInstallationToken: false,
            installationId: null,
            lastChecked: Date.now(),
            hasUserAccessToken: false,
            userAccessTokenExpiry: null,
          },
        }));
      }
    } catch (error) {
      console.error('Error checking GitHub App status:', error);
    }
  },

  async updateGitHubAppStatus(): Promise<void> {
    try {
      const installationToken = await GitHubAppsService.getInstance().getInstallationToken();
      if (installationToken) {
        githubSettingsStore.update((state) => ({
          ...state,
          githubAppStatus: { ...state.githubAppStatus, hasInstallationToken: true },
        }));
      }
    } catch (error) {
      console.error('Error updating GitHub App status:', error);
    }
  },

  /**
   * Fetch and store user access token
   */
  async fetchUserAccessToken(): Promise<boolean> {
    try {
      console.log('Fetching user access token');

      const userToken = await GitHubAppsService.getInstance().getUserAccessToken();

      console.log('User token:', userToken);

      if (userToken && userToken.access_token) {
        // Store user access token in local storage
        await chrome.storage.local.set({
          github_user_access_token: {
            access_token: userToken.access_token,
            github_username: userToken.github_username,
            expires_at: userToken.expires_at,
            stored_at: new Date().toISOString(),
          },
        });

        console.log('User access token stored in local storage');

        // Update store
        githubSettingsStore.update((state) => ({
          ...state,
          githubAppStatus: {
            ...state.githubAppStatus,
            hasUserAccessToken: true,
            userAccessTokenExpiry: new Date(userToken.expires_at),
          },
        }));

        console.log('✅ User access token fetched and stored:', {
          username: userToken.github_username,
          expires_at: userToken.expires_at,
        });

        return true;
      } else {
        console.log('❌ No user access token available');
        return false;
      }
    } catch (error) {
      console.error('Error fetching user access token:', error);
      return false;
    }
  },

  /**
   * Check if stored user access token is still valid
   */
  async checkUserAccessToken(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(['github_user_access_token']);
      const storedToken = result.github_user_access_token;

      console.log('Checking user access token:', storedToken);

      if (storedToken && storedToken.access_token) {
        const expiresAt = new Date(storedToken.expires_at);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();

        // Check if token expires within 5 minutes
        const isValid = timeUntilExpiry > 5 * 60 * 1000;

        githubSettingsStore.update((state) => ({
          ...state,
          githubAppStatus: {
            ...state.githubAppStatus,
            hasUserAccessToken: isValid,
            userAccessTokenExpiry: isValid ? expiresAt : null,
          },
        }));

        console.log('User access token status:', {
          isValid,
          expiresAt: storedToken.expires_at,
          timeUntilExpiry: timeUntilExpiry,
        });

        if (!isValid) {
          console.log('⏰ User access token expired or expiring soon');
          // Attempt to refresh the token
          return await this.fetchUserAccessToken();
        }

        console.log('✅ User access token is valid:', {
          username: storedToken.github_username,
          expires_at: storedToken.expires_at,
        });

        return true;
      } else {
        console.log('❌ No stored user access token found');
        return false;
      }
    } catch (error) {
      console.error('Error checking user access token:', error);
      return false;
    }
  },

  /**
   * Initialize user access token on startup
   */
  async initializeUserAccessToken(): Promise<void> {
    try {
      console.log('Initializing user access token');

      // First check if we have a stored token
      const hasValid = await this.checkUserAccessToken();

      if (!hasValid) {
        // Try to fetch a new token
        await this.fetchUserAccessToken();
      }
    } catch (error) {
      console.error('Error initializing user access token:', error);
    }
  },
};
