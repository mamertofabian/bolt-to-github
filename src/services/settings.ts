import type { ProjectSettings } from "$lib/types";

export interface SettingsCheckResult {
    isSettingsValid: boolean;
    projectSettings?: ProjectSettings;
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
          projectSettings: projectSettings || undefined 
        };
      } catch (error) {
        console.error('Error checking GitHub settings:', error);
        return { isSettingsValid: false };
      }
    }
  }
