import type { GitHubSettingsInterface, ProjectSettings } from '../types';

// Storage Keys
export const STORAGE_KEYS = {
  GITHUB_TOKEN: 'githubToken',
  REPO_OWNER: 'repoOwner',
  PROJECT_SETTINGS: 'projectSettings',
  PROJECT_ID: 'projectId',
  PENDING_FILE_CHANGES: 'pendingFileChanges',
  STORED_FILE_CHANGES: 'storedFileChanges',
} as const;

// Chrome Storage Service
export class ChromeStorageService {
  /**
   * Get GitHub settings from sync storage
   */
  static async getGitHubSettings(): Promise<GitHubSettingsInterface> {
    try {
      const result = await chrome.storage.sync.get([
        STORAGE_KEYS.GITHUB_TOKEN,
        STORAGE_KEYS.REPO_OWNER,
        STORAGE_KEYS.PROJECT_SETTINGS,
      ]);

      return {
        githubToken: result[STORAGE_KEYS.GITHUB_TOKEN] || '',
        repoOwner: result[STORAGE_KEYS.REPO_OWNER] || '',
        projectSettings: result[STORAGE_KEYS.PROJECT_SETTINGS] || {},
      };
    } catch (error) {
      console.error('Error getting GitHub settings from storage:', error);
      return {
        githubToken: '',
        repoOwner: '',
        projectSettings: {},
      };
    }
  }

  /**
   * Save GitHub settings to sync storage
   */
  static async saveGitHubSettings(settings: GitHubSettingsInterface): Promise<void> {
    try {
      const dataToSave = {
        [STORAGE_KEYS.GITHUB_TOKEN]: settings.githubToken,
        [STORAGE_KEYS.REPO_OWNER]: settings.repoOwner,
        [STORAGE_KEYS.PROJECT_SETTINGS]: settings.projectSettings || {},
      };

      await chrome.storage.sync.set(dataToSave);
    } catch (error) {
      console.error('Error saving GitHub settings to storage:', error);
      throw error;
    }
  }

  /**
   * Get project settings for a specific project
   */
  static async getProjectSettings(
    projectId: string
  ): Promise<{ repoName: string; branch: string } | null> {
    try {
      const result = await chrome.storage.sync.get(STORAGE_KEYS.PROJECT_SETTINGS);
      const projectSettings: ProjectSettings = result[STORAGE_KEYS.PROJECT_SETTINGS] || {};
      return projectSettings[projectId] || null;
    } catch (error) {
      console.error('Error getting project settings from storage:', error);
      return null;
    }
  }

  /**
   * Save project settings for a specific project
   */
  static async saveProjectSettings(
    projectId: string,
    repoName: string,
    branch: string
  ): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(STORAGE_KEYS.PROJECT_SETTINGS);
      const projectSettings: ProjectSettings = result[STORAGE_KEYS.PROJECT_SETTINGS] || {};

      projectSettings[projectId] = { repoName, branch };

      await chrome.storage.sync.set({
        [STORAGE_KEYS.PROJECT_SETTINGS]: projectSettings,
      });
    } catch (error) {
      console.error('Error saving project settings to storage:', error);
      throw error;
    }
  }

  /**
   * Get current project ID from sync storage
   */
  static async getCurrentProjectId(): Promise<string | null> {
    try {
      const result = await chrome.storage.sync.get(STORAGE_KEYS.PROJECT_ID);
      return result[STORAGE_KEYS.PROJECT_ID] || null;
    } catch (error) {
      console.error('Error getting current project ID from storage:', error);
      return null;
    }
  }

  /**
   * Save current project ID to sync storage
   */
  static async saveCurrentProjectId(projectId: string): Promise<void> {
    try {
      await chrome.storage.sync.set({
        [STORAGE_KEYS.PROJECT_ID]: projectId,
      });
    } catch (error) {
      console.error('Error saving current project ID to storage:', error);
      throw error;
    }
  }

  /**
   * Get pending file changes from local storage
   */
  static async getPendingFileChanges(): Promise<any> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_FILE_CHANGES);
      return result[STORAGE_KEYS.PENDING_FILE_CHANGES] || null;
    } catch (error) {
      console.error('Error getting pending file changes from storage:', error);
      return null;
    }
  }

  /**
   * Save pending file changes to local storage
   */
  static async savePendingFileChanges(fileChanges: any): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.PENDING_FILE_CHANGES]: fileChanges,
      });
    } catch (error) {
      console.error('Error saving pending file changes to storage:', error);
      throw error;
    }
  }

  /**
   * Clear pending file changes from local storage
   */
  static async clearPendingFileChanges(): Promise<void> {
    try {
      await chrome.storage.local.remove(STORAGE_KEYS.PENDING_FILE_CHANGES);
    } catch (error) {
      console.error('Error clearing pending file changes from storage:', error);
      throw error;
    }
  }

  /**
   * Get stored file changes from local storage
   */
  static async getStoredFileChanges(): Promise<any> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.STORED_FILE_CHANGES);
      return result[STORAGE_KEYS.STORED_FILE_CHANGES] || null;
    } catch (error) {
      console.error('Error getting stored file changes from storage:', error);
      return null;
    }
  }

  /**
   * Save stored file changes to local storage
   */
  static async saveStoredFileChanges(fileChanges: any, projectId?: string): Promise<void> {
    try {
      const dataToSave = projectId ? { projectId, changes: fileChanges } : fileChanges;

      await chrome.storage.local.set({
        [STORAGE_KEYS.STORED_FILE_CHANGES]: dataToSave,
      });
    } catch (error) {
      console.error('Error saving stored file changes to storage:', error);
      throw error;
    }
  }

  /**
   * Clear stored file changes from local storage
   */
  static async clearStoredFileChanges(): Promise<void> {
    try {
      await chrome.storage.local.remove(STORAGE_KEYS.STORED_FILE_CHANGES);
    } catch (error) {
      console.error('Error clearing stored file changes from storage:', error);
      throw error;
    }
  }

  /**
   * Get data from storage by key
   */
  static async get(keys: string | string[], useLocal = false): Promise<any> {
    try {
      const storage = useLocal ? chrome.storage.local : chrome.storage.sync;
      return await storage.get(keys);
    } catch (error) {
      console.error('Error getting data from storage:', error);
      return {};
    }
  }

  /**
   * Set data in storage
   */
  static async set(data: Record<string, any>, useLocal = false): Promise<void> {
    try {
      const storage = useLocal ? chrome.storage.local : chrome.storage.sync;
      await storage.set(data);
    } catch (error) {
      console.error('Error setting data in storage:', error);
      throw error;
    }
  }

  /**
   * Remove data from storage
   */
  static async remove(keys: string | string[], useLocal = false): Promise<void> {
    try {
      const storage = useLocal ? chrome.storage.local : chrome.storage.sync;
      await storage.remove(keys);
    } catch (error) {
      console.error('Error removing data from storage:', error);
      throw error;
    }
  }

  /**
   * Clear all data from storage
   */
  static async clear(useLocal = false): Promise<void> {
    try {
      const storage = useLocal ? chrome.storage.local : chrome.storage.sync;
      await storage.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
      throw error;
    }
  }

  /**
   * Get all data from storage
   */
  static async getAll(useLocal = false): Promise<Record<string, any>> {
    try {
      const storage = useLocal ? chrome.storage.local : chrome.storage.sync;
      return await storage.get(null);
    } catch (error) {
      console.error('Error getting all data from storage:', error);
      return {};
    }
  }
}
