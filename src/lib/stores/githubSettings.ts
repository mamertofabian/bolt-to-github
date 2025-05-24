import { writable, derived, type Writable } from 'svelte/store';
import { GitHubService } from '../../services/GitHubService';
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
};

// Create the writable store
export const githubSettingsStore: Writable<GitHubSettingsState> = writable(initialState);

// Derived store for settings validity
export const isSettingsValid = derived(
  githubSettingsStore,
  ($settings) =>
    Boolean(
      $settings.githubToken && $settings.repoOwner && $settings.repoName && $settings.branch
    ) &&
    !$settings.isValidatingToken &&
    $settings.isTokenValid === true
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

      // Validate existing token if available
      if (storedSettings.githubToken && storedSettings.repoOwner) {
        await this.validateToken(storedSettings.githubToken, storedSettings.repoOwner);
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
  setProjectSettings(projectId: string, repoName: string, branch: string): void {
    githubSettingsStore.update((state) => ({
      ...state,
      projectSettings: {
        ...state.projectSettings,
        [projectId]: { repoName, branch },
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
};
