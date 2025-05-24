import { get } from 'svelte/store';
import type { GitHubSettingsInterface } from '../types';
import { githubSettingsStore, githubSettingsActions } from '../stores/githubSettings';
import { currentProjectId } from '../stores/projectSettings';
import { uiStateActions } from '../stores/uiState';

// Settings Management Composable
export function useSettings() {
  /**
   * Save all GitHub settings
   */
  async function saveGitHubSettings(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await githubSettingsActions.saveSettings();

      if (result.success) {
        uiStateActions.showStatus('Settings saved successfully!');

        // Update project settings if we have a project ID
        const projectId = get(currentProjectId);
        if (projectId) {
          const { repoName, branch } = get(githubSettingsStore);
          githubSettingsActions.setProjectSettings(projectId, repoName, branch);
        }
      } else {
        uiStateActions.showStatus(result.error || 'Failed to save settings');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      uiStateActions.showStatus(`Error saving settings: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Load settings for a specific project
   */
  async function loadProjectSettings(projectId: string): Promise<void> {
    try {
      githubSettingsActions.loadProjectSettings(projectId);
    } catch (error) {
      console.error('Error loading project settings:', error);
      uiStateActions.showStatus('Failed to load project settings');
    }
  }

  /**
   * Update GitHub token
   */
  function updateGitHubToken(token: string): void {
    githubSettingsActions.setGitHubToken(token);
  }

  /**
   * Update repository owner
   */
  function updateRepoOwner(owner: string): void {
    githubSettingsActions.setRepoOwner(owner);
  }

  /**
   * Update repository name
   */
  function updateRepoName(name: string): void {
    githubSettingsActions.setRepoName(name);
  }

  /**
   * Update repository branch
   */
  function updateBranch(branch: string): void {
    githubSettingsActions.setBranch(branch);
  }

  /**
   * Update multiple settings at once
   */
  function updateSettings(settings: Partial<GitHubSettingsInterface>): void {
    if (settings.githubToken !== undefined) {
      githubSettingsActions.setGitHubToken(settings.githubToken);
    }
    if (settings.repoOwner !== undefined) {
      githubSettingsActions.setRepoOwner(settings.repoOwner);
    }
  }

  /**
   * Reset all settings to defaults
   */
  function resetSettings(): void {
    githubSettingsActions.reset();
  }

  /**
   * Validate current settings
   */
  function validateSettings(): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const { githubToken, repoOwner, repoName, branch } = get(githubSettingsStore);

    // Validate GitHub token
    if (!githubToken || githubToken.trim().length === 0) {
      errors.push('GitHub token is required');
    } else if (githubToken.length < 10) {
      errors.push('GitHub token appears to be invalid (too short)');
    }

    // Validate repository owner
    if (!repoOwner || repoOwner.trim().length === 0) {
      errors.push('Repository owner is required');
    } else if (!/^[a-zA-Z0-9-]+$/.test(repoOwner)) {
      errors.push('Repository owner contains invalid characters');
    }

    // Validate repository name
    if (!repoName || repoName.trim().length === 0) {
      errors.push('Repository name is required');
    } else if (!/^[a-zA-Z0-9._-]+$/.test(repoName)) {
      errors.push('Repository name contains invalid characters');
    }

    // Validate branch
    if (!branch || branch.trim().length === 0) {
      errors.push('Branch name is required');
    } else if (!/^[a-zA-Z0-9._/-]+$/.test(branch)) {
      errors.push('Branch name contains invalid characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if settings are complete and valid
   */
  function areSettingsComplete(): boolean {
    const { githubToken, repoOwner, repoName, branch } = get(githubSettingsStore);
    return !!(githubToken && repoOwner && repoName && branch);
  }

  /**
   * Export settings for backup
   */
  function exportSettings(): GitHubSettingsInterface {
    const { githubToken, repoOwner, projectSettings } = get(githubSettingsStore);
    return {
      githubToken,
      repoOwner,
      projectSettings,
    };
  }

  /**
   * Import settings from backup
   */
  async function importSettings(
    settings: GitHubSettingsInterface
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate imported settings
      if (!settings || typeof settings !== 'object') {
        return { success: false, error: 'Invalid settings format' };
      }

      // Update settings
      updateSettings(settings);

      // Save to storage
      const result = await saveGitHubSettings();

      if (result.success) {
        uiStateActions.showStatus('Settings imported successfully!');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get settings validation status
   */
  function getValidationStatus(): {
    hasToken: boolean;
    hasOwner: boolean;
    hasRepo: boolean;
    hasBranch: boolean;
    isComplete: boolean;
    isValid: boolean;
  } {
    const { githubToken, repoOwner, repoName, branch } = get(githubSettingsStore);
    const validation = validateSettings();

    return {
      hasToken: !!githubToken,
      hasOwner: !!repoOwner,
      hasRepo: !!repoName,
      hasBranch: !!branch,
      isComplete: areSettingsComplete(),
      isValid: validation.isValid,
    };
  }

  /**
   * Create settings for a new project
   */
  async function createProjectSettings(
    projectId: string,
    repoName: string,
    branch: string = 'main'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Set project-specific settings
      githubSettingsActions.setProjectSettings(projectId, repoName, branch);

      // Update current settings
      githubSettingsActions.setRepoName(repoName);
      githubSettingsActions.setBranch(branch);

      // Save settings
      const result = await saveGitHubSettings();

      if (result.success) {
        uiStateActions.showStatus(`Project settings created for ${projectId}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Delete project settings (implemented as clearing the project from storage)
   */
  async function deleteProjectSettings(
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current settings and remove the project
      const currentSettings = get(githubSettingsStore);
      const updatedProjectSettings = { ...currentSettings.projectSettings };
      delete updatedProjectSettings[projectId];

      // Update the store with the new project settings
      githubSettingsStore.update((state) => ({
        ...state,
        projectSettings: updatedProjectSettings,
      }));

      const result = await saveGitHubSettings();

      if (result.success) {
        uiStateActions.showStatus(`Project settings deleted for ${projectId}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get all project settings
   */
  function getAllProjectSettings(): Record<string, { repoName: string; branch: string }> {
    const { projectSettings } = get(githubSettingsStore);
    return projectSettings || {};
  }

  /**
   * Check if a project has saved settings
   */
  function hasProjectSettings(projectId: string): boolean {
    const projectSettings = getAllProjectSettings();
    return projectId in projectSettings;
  }

  /**
   * Generate repository URL for current settings
   */
  function getRepositoryUrl(): string | null {
    const { repoOwner, repoName } = get(githubSettingsStore);

    if (!repoOwner || !repoName) {
      return null;
    }

    return `https://github.com/${repoOwner}/${repoName}`;
  }

  /**
   * Generate branch URL for current settings
   */
  function getBranchUrl(): string | null {
    const { repoOwner, repoName, branch } = get(githubSettingsStore);

    if (!repoOwner || !repoName || !branch) {
      return null;
    }

    return `https://github.com/${repoOwner}/${repoName}/tree/${branch}`;
  }

  return {
    // Actions
    saveGitHubSettings,
    loadProjectSettings,
    updateGitHubToken,
    updateRepoOwner,
    updateRepoName,
    updateBranch,
    updateSettings,
    resetSettings,
    importSettings,
    createProjectSettings,
    deleteProjectSettings,

    // Validation
    validateSettings,
    areSettingsComplete,
    getValidationStatus,

    // Project settings
    getAllProjectSettings,
    hasProjectSettings,

    // Utils
    exportSettings,
    getRepositoryUrl,
    getBranchUrl,
  };
}
