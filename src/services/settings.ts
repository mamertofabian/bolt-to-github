import type { GitHubSettingsInterface } from '$lib/types';
import { createLogger } from '../lib/utils/logger';
import { ChromeStorageService } from '../lib/services/chromeStorage';

const logger = createLogger('SettingsService');

export interface SettingsCheckResult {
  isSettingsValid: boolean;
  gitHubSettings?: GitHubSettingsInterface;
}

export class SettingsService {
  static async getGitHubSettings(currentProjectId?: string): Promise<SettingsCheckResult> {
    try {
      // Use ChromeStorageService for thread-safe reads
      const [gitHubSettings, storedProjectId] = await Promise.all([
        ChromeStorageService.getGitHubSettings(),
        ChromeStorageService.getCurrentProjectId(),
      ]);

      // Use provided project ID or fall back to stored one
      const projectId = currentProjectId || storedProjectId;

      let projectSettings = projectId ? gitHubSettings.projectSettings?.[projectId] : undefined;

      // Auto-create project settings if needed
      if (
        !projectSettings &&
        projectId &&
        gitHubSettings.repoOwner &&
        gitHubSettings.githubAppInstallationId
      ) {
        projectSettings = { repoName: projectId, branch: 'main' };
        // Use ChromeStorageService for thread-safe writes to bundled format
        await ChromeStorageService.saveProjectSettings(
          projectId,
          projectSettings.repoName,
          projectSettings.branch
        );

        // Update the local gitHubSettings object to reflect the new project settings
        if (!gitHubSettings.projectSettings) {
          gitHubSettings.projectSettings = {};
        }
        gitHubSettings.projectSettings[projectId] = projectSettings;
      }

      const isSettingsValid = Boolean(
        gitHubSettings.githubAppInstallationId &&
        gitHubSettings.repoOwner &&
        gitHubSettings.projectSettings &&
        projectSettings
      );

      return {
        isSettingsValid,
        gitHubSettings,
      };
    } catch (error) {
      logger.error('Error checking GitHub settings:', error);
      return { isSettingsValid: false };
    }
  }

  static async getProjectId(): Promise<string | null> {
    try {
      // Use ChromeStorageService for thread-safe reads
      return await ChromeStorageService.getCurrentProjectId();
    } catch (error) {
      logger.error('Failed to get project ID:', error);
      return null;
    }
  }

  static async setProjectId(projectId: string): Promise<void> {
    try {
      // Use ChromeStorageService for thread-safe writes
      await ChromeStorageService.saveCurrentProjectId(projectId);
    } catch (error) {
      logger.error('Failed to set project ID:', error);
    }
  }
}
