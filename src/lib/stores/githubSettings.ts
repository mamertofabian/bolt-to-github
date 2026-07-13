import { writable, derived, type Writable } from 'svelte/store';
import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
import type { GitHubSettingsInterface, ProjectSettings } from '../types';
import { createLogger } from '../utils/logger';
import { ChromeStorageService } from '../services/chromeStorage';

const logger = createLogger('githubSettings');

// GitHub Settings State Interface
export interface GitHubSettingsState {
  repoOwner: string;
  repoName: string;
  branch: string;
  projectSettings: ProjectSettings;
  isValidatingToken: boolean;
  isTokenValid: boolean | null;
  validationError: string | null;
  hasInitialSettings: boolean;
  githubAppInstallationId: number | null;
  githubAppUsername: string | null;
  githubAppAvatarUrl: string | null;
}

// Initial state
const initialState: GitHubSettingsState = {
  repoOwner: '',
  repoName: '',
  branch: 'main',
  projectSettings: {},
  isValidatingToken: false,
  isTokenValid: null,
  validationError: null,
  hasInitialSettings: false,
  githubAppInstallationId: null,
  githubAppUsername: null,
  githubAppAvatarUrl: null,
};

// Create the writable store
export const githubSettingsStore: Writable<GitHubSettingsState> = writable(initialState);

// Derived store for authentication validity (without requiring project-specific settings)
export const isAuthenticationValid = derived(githubSettingsStore, ($settings) => {
  const hasValidAuth = Boolean(
    $settings.githubAppInstallationId && $settings.repoOwner && $settings.isTokenValid === true
  );

  return hasValidAuth && !$settings.isValidatingToken;
});

// Derived store for settings validity (includes project-specific settings)
export const isSettingsValid = derived(githubSettingsStore, ($settings) => {
  const hasRepoInfo = Boolean($settings.repoOwner && $settings.repoName && $settings.branch);
  const hasValidAuth = Boolean(
    $settings.githubAppInstallationId && $settings.isTokenValid === true
  );

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
        'repoOwner',
        'projectSettings',
      ])) as GitHubSettingsInterface;

      const localSettings = await chrome.storage.local.get([
        'githubAppInstallationId',
        'githubAppUsername',
        'githubAppAvatarUrl',
      ]);

      const hasGitHubApp = Boolean(localSettings.githubAppInstallationId);

      // For GitHub App, automatically use the authenticated username as repoOwner
      let repoOwner = storedSettings.repoOwner || '';
      if (hasGitHubApp && localSettings.githubAppUsername) {
        repoOwner = localSettings.githubAppUsername;
        // Save the detected repoOwner to sync storage for consistency
        if (repoOwner && repoOwner !== storedSettings.repoOwner) {
          // Use thread-safe method to update settings
          await ChromeStorageService.saveGitHubSettings({
            repoOwner,
            projectSettings: storedSettings.projectSettings || {},
            githubAppInstallationId: localSettings.githubAppInstallationId,
            githubAppUsername: localSettings.githubAppUsername,
            githubAppAvatarUrl: localSettings.githubAppAvatarUrl,
          });
        }
      }

      githubSettingsStore.update((state) => ({
        ...state,
        repoOwner,
        projectSettings: storedSettings.projectSettings || {},
        githubAppInstallationId: localSettings.githubAppInstallationId || null,
        githubAppUsername: hasGitHubApp ? localSettings.githubAppUsername || null : null,
        githubAppAvatarUrl: hasGitHubApp ? localSettings.githubAppAvatarUrl || null : null,
        hasInitialSettings: hasGitHubApp,
        isTokenValid: hasGitHubApp ? true : null,
      }));
    } catch (error) {
      logger.error('Error initializing GitHub settings:', error);
    }
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

  /** Validate the current GitHub App connection and username. */
  async validateGitHubApp(username: string): Promise<boolean> {
    let currentState: GitHubSettingsState;
    const unsubscribe = githubSettingsStore.subscribe((state) => {
      currentState = state;
    });
    unsubscribe();

    if (!currentState!.githubAppInstallationId) {
      githubSettingsStore.update((state) => ({
        ...state,
        isTokenValid: false,
        validationError: 'GitHub App installation not found',
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
      const githubService = new UnifiedGitHubService({ type: 'github_app' });

      const result = await githubService.validateTokenAndUser(username);

      githubSettingsStore.update((state) => ({
        ...state,
        isTokenValid: result.isValid,
        validationError: result.error || null,
        isValidatingToken: false,
      }));

      return result.isValid;
    } catch (error) {
      logger.error('Error validating GitHub token:', error);
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

      if (!currentState!.githubAppInstallationId || !currentState!.repoOwner) {
        return {
          success: false,
          error: 'GitHub App authentication or repository owner missing',
        };
      }

      const settings: GitHubSettingsInterface = {
        repoOwner: currentState!.repoOwner,
        projectSettings: currentState!.projectSettings,
        githubAppInstallationId: currentState!.githubAppInstallationId ?? undefined,
        githubAppUsername: currentState!.githubAppUsername ?? undefined,
        githubAppAvatarUrl: currentState!.githubAppAvatarUrl ?? undefined,
      };

      await ChromeStorageService.saveGitHubSettings(settings);

      githubSettingsStore.update((state) => ({
        ...state,
        hasInitialSettings: true,
      }));

      return { success: true };
    } catch (error) {
      logger.error('Error saving GitHub settings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
      isTokenValid: null,
    }));
  },

  /**
   * Sync GitHub App settings from storage
   */
  async syncGitHubAppFromStorage(): Promise<void> {
    try {
      const localSettings = await chrome.storage.local.get([
        'githubAppInstallationId',
        'githubAppUsername',
        'githubAppAvatarUrl',
      ]);

      if (localSettings.githubAppInstallationId) {
        this.setGitHubAppSettings(
          localSettings.githubAppInstallationId,
          localSettings.githubAppUsername,
          localSettings.githubAppAvatarUrl
        );

        // Re-initialize settings to auto-populate repoOwner
        await this.initialize();
      }
    } catch (error) {
      logger.error('Error syncing GitHub App from storage:', error);
    }
  },

  /**
   * Reset all settings to initial state
   */
  reset(): void {
    githubSettingsStore.set(initialState);
  },
};
