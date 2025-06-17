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

      // Get authentication method
      const authMethod = gitHubSettings.authenticationMethod || 'pat';

      // Auto-create project settings if needed
      if (!projectSettings && projectId && gitHubSettings.repoOwner) {
        // For GitHub App, we don't need githubToken
        const hasRequiredAuth =
          authMethod === 'github_app'
            ? gitHubSettings.githubAppInstallationId
            : gitHubSettings.githubToken;

        if (hasRequiredAuth) {
          projectSettings = { repoName: projectId, branch: 'main' };
          // Use ChromeStorageService for thread-safe writes to bundled format
          await ChromeStorageService.saveProjectSettings(
            projectId,
            projectSettings.repoName,
            projectSettings.branch
          );
        }
      }

      // Check settings validity based on authentication method
      let isSettingsValid = false;
      if (authMethod === 'github_app') {
        // For GitHub App: need installation ID, repoOwner, and project settings
        isSettingsValid = Boolean(
          gitHubSettings.githubAppInstallationId &&
            gitHubSettings.repoOwner &&
            gitHubSettings.projectSettings &&
            projectSettings
        );
      } else {
        // For PAT: need token, repoOwner, and project settings (original logic)
        isSettingsValid = Boolean(
          gitHubSettings.githubToken &&
            gitHubSettings.repoOwner &&
            gitHubSettings.projectSettings &&
            projectSettings
        );
      }

      return {
        isSettingsValid,
        gitHubSettings: {
          githubToken: gitHubSettings.githubToken,
          repoOwner: gitHubSettings.repoOwner,
          projectSettings: projectSettings || undefined,
        },
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
