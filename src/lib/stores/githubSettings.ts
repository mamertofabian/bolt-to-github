import { writable, derived, type Writable } from 'svelte/store';
import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
import type { GitHubSettingsInterface, ProjectSettings } from '../types';

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
  // New GitHub App fields
  authenticationMethod: 'pat' | 'github_app';
  githubAppInstallationId: number | null;
  githubAppUsername: string | null;
  githubAppAvatarUrl: string | null;
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
  // New GitHub App fields
  authenticationMethod: 'github_app',
  githubAppInstallationId: null,
  githubAppUsername: null,
  githubAppAvatarUrl: null,
};

// Create the writable store
export const githubSettingsStore: Writable<GitHubSettingsState> = writable(initialState);

// Derived store for settings validity
export const isSettingsValid = derived(githubSettingsStore, ($settings) => {
  const hasRepoInfo = Boolean($settings.repoOwner && $settings.repoName && $settings.branch);
  const hasValidAuth =
    $settings.authenticationMethod === 'github_app'
      ? Boolean($settings.githubAppInstallationId)
      : Boolean($settings.githubToken && $settings.isTokenValid === true);

  return hasRepoInfo && hasValidAuth && !$settings.isValidatingToken;
});

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

      const localSettings = await chrome.storage.local.get([
        'authenticationMethod',
        'githubAppInstallationId',
        'githubAppUsername',
        'githubAppAvatarUrl',
      ]);

      const authMethod = localSettings.authenticationMethod || 'pat';
      const hasGitHubApp = authMethod === 'github_app' && localSettings.githubAppInstallationId;
      const hasPAT = Boolean(storedSettings.githubToken && storedSettings.repoOwner);

      // For GitHub App, automatically use the authenticated username as repoOwner
      let repoOwner = storedSettings.repoOwner || '';
      if (authMethod === 'github_app' && localSettings.githubAppUsername) {
        repoOwner = localSettings.githubAppUsername;
        // Save the detected repoOwner to sync storage for consistency
        if (repoOwner && repoOwner !== storedSettings.repoOwner) {
          await chrome.storage.sync.set({ repoOwner });
        }
      }

      githubSettingsStore.update((state) => ({
        ...state,
        githubToken: storedSettings.githubToken || '',
        repoOwner,
        projectSettings: storedSettings.projectSettings || {},
        authenticationMethod: authMethod,
        githubAppInstallationId: localSettings.githubAppInstallationId || null,
        githubAppUsername: localSettings.githubAppUsername || null,
        githubAppAvatarUrl: localSettings.githubAppAvatarUrl || null,
        hasInitialSettings: hasGitHubApp || hasPAT,
      }));

      // Validate existing token if using PAT
      if (authMethod === 'pat' && storedSettings.githubToken && storedSettings.repoOwner) {
        await this.validateToken(storedSettings.githubToken, storedSettings.repoOwner);
      } else if (authMethod === 'github_app' && hasGitHubApp) {
        // For GitHub App, we assume it's valid if we have an installation ID
        githubSettingsStore.update((state) => ({
          ...state,
          isTokenValid: true,
        }));
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
    // Get current authentication method first
    let currentState: GitHubSettingsState;
    const unsubscribe = githubSettingsStore.subscribe((state) => {
      currentState = state;
    });
    unsubscribe();

    // For GitHub App authentication, token is not required
    if (currentState!.authenticationMethod === 'github_app') {
      // Validate GitHub App authentication instead
      if (!currentState!.githubAppInstallationId) {
        githubSettingsStore.update((state) => ({
          ...state,
          isTokenValid: false,
          validationError: 'GitHub App installation not found',
          isValidatingToken: false,
        }));
        return false;
      }
    } else {
      // For PAT authentication, token is required
      if (!token) {
        githubSettingsStore.update((state) => ({
          ...state,
          isTokenValid: false,
          validationError: 'GitHub token is required',
          isValidatingToken: false,
        }));
        return false;
      }
    }

    githubSettingsStore.update((state) => ({
      ...state,
      isValidatingToken: true,
      validationError: null,
    }));

    try {
      let githubService: UnifiedGitHubService;

      if (currentState!.authenticationMethod === 'github_app') {
        // Use GitHub App authentication
        githubService = new UnifiedGitHubService({
          type: 'github_app',
        });
      } else {
        // Use PAT authentication (backward compatible)
        githubService = new UnifiedGitHubService(token);
      }

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

      // Validate authentication before saving
      let isValid = false;
      if (currentState!.authenticationMethod === 'github_app') {
        // For GitHub App, just check if we have required data
        isValid = Boolean(currentState!.githubAppInstallationId && currentState!.repoOwner);
        if (!isValid) {
          return {
            success: false,
            error: 'GitHub App authentication or repository owner missing',
          };
        }
      } else {
        console.log(
          '🚀 Validating token for PAT',
          currentState!.githubToken,
          currentState!.repoOwner
        );
        // For PAT, validate token and username
        isValid = await githubSettingsActions.validateToken(
          currentState!.githubToken,
          currentState!.repoOwner
        );
        console.log('🚀 Validated token for PAT', isValid);
        if (!isValid) {
          return {
            success: false,
            error: currentState!.validationError || 'Validation failed',
          };
        }
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
   * Set authentication method
   */
  setAuthenticationMethod(method: 'pat' | 'github_app'): void {
    githubSettingsStore.update((state) => ({
      ...state,
      authenticationMethod: method,
      isTokenValid: null,
      validationError: null,
    }));
  },

  /**
   * Update GitHub App settings
   */
  setGitHubAppSettings(
    installationId: number | null,
    username: string | null,
    avatarUrl: string | null
  ): void {
    githubSettingsStore.update((state) => ({
      ...state,
      githubAppInstallationId: installationId,
      githubAppUsername: username,
      githubAppAvatarUrl: avatarUrl,
      authenticationMethod: 'github_app',
      isTokenValid: installationId ? true : null,
    }));
  },

  /**
   * Clear GitHub App settings
   */
  clearGitHubAppSettings(): void {
    githubSettingsStore.update((state) => ({
      ...state,
      githubAppInstallationId: null,
      githubAppUsername: null,
      githubAppAvatarUrl: null,
      authenticationMethod: 'pat',
      isTokenValid: null,
    }));
  },

  /**
   * Sync GitHub App settings from storage
   */
  async syncGitHubAppFromStorage(): Promise<void> {
    try {
      const localSettings = await chrome.storage.local.get([
        'authenticationMethod',
        'githubAppInstallationId',
        'githubAppUsername',
        'githubAppAvatarUrl',
      ]);

      if (localSettings.authenticationMethod === 'github_app') {
        this.setGitHubAppSettings(
          localSettings.githubAppInstallationId,
          localSettings.githubAppUsername,
          localSettings.githubAppAvatarUrl
        );

        // Re-initialize settings to auto-populate repoOwner
        await this.initialize();
      }
    } catch (error) {
      console.error('Error syncing GitHub App from storage:', error);
    }
  },

  /**
   * Reset all settings to initial state
   */
  reset(): void {
    githubSettingsStore.set(initialState);
  },
};
