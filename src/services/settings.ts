import type { GitHubSettingsInterface, ProjectSettings } from "$lib/types";

export interface SettingsCheckResult {
    isSettingsValid: boolean;
    gitHubSettings?: GitHubSettingsInterface;
  }
    
  export class SettingsService {
    static async getGitHubSettings(): Promise<SettingsCheckResult> {
      try {
        const [settings, projectId] = await Promise.all([
          chrome.storage.sync.get([
            'githubToken',
            'repoOwner',
            'projectSettings'
          ]),
          chrome.storage.sync.get('projectId')
        ]);
  
        let projectSettings = settings.projectSettings?.[projectId.projectId];
  
        // Auto-create project settings if needed
        if (!projectSettings && projectId.projectId && settings.repoOwner && settings.githubToken) {
          projectSettings = { repoName: projectId.projectId, branch: 'main' };
          await chrome.storage.sync.set({ 
            [`projectSettings.${projectId.projectId}`]: projectSettings 
          });
        }
  
        const isSettingsValid = Boolean(
          settings.githubToken &&
          settings.repoOwner &&
          settings.projectSettings &&
          projectSettings
        );
  
        return { 
          isSettingsValid, 
          gitHubSettings: {
            githubToken: settings.githubToken,
            repoOwner: settings.repoOwner,
            projectSettings: projectSettings || undefined
          }
        };
      } catch (error) {
        console.error('Error checking GitHub settings:', error);
        return { isSettingsValid: false };
      }
    }

    static async getProjectId(): Promise<string | null> {
      try {
          const { projectId } = await chrome.storage.sync.get('projectId');
          return projectId || null;
      } catch (error) {
          console.error('Failed to get project ID:', error);
          return null;
      }
  }

  static async setProjectId(projectId: string): Promise<void> {
      try {
          await chrome.storage.sync.set({ projectId });
      } catch (error) {
          console.error('Failed to set project ID:', error);
      }
  }
}
