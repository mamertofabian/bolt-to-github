import type { GitHubSettingsInterface, ProjectSettings, BoltProject } from '../types';
import type { PushStatistics } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('chromeStorage');

/**
 * Queue for serializing storage write operations to prevent race conditions
 */
class StorageWriteQueue {
  private queue: Promise<void> = Promise.resolve();

  /**
   * Enqueue an async operation to be executed serially
   * @param operation The async operation to execute
   * @returns Promise resolving to the operation result
   */
  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    // Continue queue even if an operation fails
    this.queue = result.catch(() => {});
    return result;
  }
}

// Storage Keys
export const STORAGE_KEYS = {
  GITHUB_TOKEN: 'githubToken',
  REPO_OWNER: 'repoOwner',
  PROJECT_SETTINGS: 'projectSettings',
  PROJECT_ID: 'projectId',
  PENDING_FILE_CHANGES: 'pendingFileChanges',
  STORED_FILE_CHANGES: 'storedFileChanges',
  PUSH_STATISTICS: 'pushStatistics',
  // New authentication method keys
  AUTHENTICATION_METHOD: 'authenticationMethod',
  GITHUB_APP_INSTALLATION_ID: 'githubAppInstallationId',
  GITHUB_APP_ACCESS_TOKEN: 'githubAppAccessToken',
  GITHUB_APP_REFRESH_TOKEN: 'githubAppRefreshToken',
  GITHUB_APP_EXPIRES_AT: 'githubAppExpiresAt',
  GITHUB_APP_REFRESH_TOKEN_EXPIRES_AT: 'githubAppRefreshTokenExpiresAt',
  GITHUB_APP_USERNAME: 'githubAppUsername',
  GITHUB_APP_USER_ID: 'githubAppUserId',
  GITHUB_APP_AVATAR_URL: 'githubAppAvatarUrl',
  GITHUB_APP_SCOPES: 'githubAppScopes',
  MIGRATION_PROMPT_SHOWN: 'migrationPromptShown',
  LAST_MIGRATION_PROMPT: 'lastMigrationPrompt',
} as const;

// Chrome Storage Service
export class ChromeStorageService {
  // Singleton write queue instance to serialize all storage writes
  private static writeQueue = new StorageWriteQueue();

  /**
   * Get GitHub settings from sync storage (enhanced with authentication method)
   */
  static async getGitHubSettings(): Promise<GitHubSettingsInterface> {
    try {
      const syncResult = await chrome.storage.sync.get([
        STORAGE_KEYS.GITHUB_TOKEN,
        STORAGE_KEYS.REPO_OWNER,
        STORAGE_KEYS.PROJECT_SETTINGS,
      ]);

      const localResult = await chrome.storage.local.get([
        STORAGE_KEYS.AUTHENTICATION_METHOD,
        STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID,
        STORAGE_KEYS.GITHUB_APP_USERNAME,
        STORAGE_KEYS.GITHUB_APP_AVATAR_URL,
      ]);

      return {
        githubToken: syncResult[STORAGE_KEYS.GITHUB_TOKEN] || '',
        repoOwner: syncResult[STORAGE_KEYS.REPO_OWNER] || '',
        projectSettings: syncResult[STORAGE_KEYS.PROJECT_SETTINGS] || {},
        authenticationMethod: localResult[STORAGE_KEYS.AUTHENTICATION_METHOD] || 'pat',
        githubAppInstallationId: localResult[STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID],
        githubAppUsername: localResult[STORAGE_KEYS.GITHUB_APP_USERNAME],
        githubAppAvatarUrl: localResult[STORAGE_KEYS.GITHUB_APP_AVATAR_URL],
      };
    } catch (error) {
      logger.error('Error getting GitHub settings from storage:', error);
      return {
        githubToken: '',
        repoOwner: '',
        projectSettings: {},
        authenticationMethod: 'pat',
      };
    }
  }

  /**
   * Save GitHub settings to sync storage (enhanced with authentication method, thread-safe)
   */
  static async saveGitHubSettings(settings: GitHubSettingsInterface): Promise<void> {
    return this.writeQueue.enqueue(async () => {
      try {
        logger.debug('Saving GitHub settings');

        // Save sync data (shared across devices)
        const syncDataToSave = {
          [STORAGE_KEYS.GITHUB_TOKEN]: settings.githubToken,
          [STORAGE_KEYS.REPO_OWNER]: settings.repoOwner,
          [STORAGE_KEYS.PROJECT_SETTINGS]: settings.projectSettings || {},
        };

        // Save local data (device-specific)
        const localDataToSave: Record<string, any> = {};

        if (settings.authenticationMethod !== undefined) {
          localDataToSave[STORAGE_KEYS.AUTHENTICATION_METHOD] = settings.authenticationMethod;
        }

        if (settings.githubAppInstallationId !== undefined) {
          localDataToSave[STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID] =
            settings.githubAppInstallationId;
        }

        if (settings.githubAppUsername !== undefined) {
          localDataToSave[STORAGE_KEYS.GITHUB_APP_USERNAME] = settings.githubAppUsername;
        }

        if (settings.githubAppAvatarUrl !== undefined) {
          localDataToSave[STORAGE_KEYS.GITHUB_APP_AVATAR_URL] = settings.githubAppAvatarUrl;
        }

        // Save to both storages atomically
        await Promise.all([
          chrome.storage.sync.set(syncDataToSave),
          Object.keys(localDataToSave).length > 0
            ? chrome.storage.local.set(localDataToSave)
            : Promise.resolve(),
        ]);

        logger.info('GitHub settings saved successfully');
      } catch (error) {
        logger.error('Error saving GitHub settings to storage:', error);
        throw error;
      }
    });
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
      logger.error('Error getting project settings from storage:', error);
      return null;
    }
  }

  /**
   * Save project settings for a specific project (thread-safe)
   */
  static async saveProjectSettings(
    projectId: string,
    repoName: string,
    branch: string,
    projectTitle?: string
  ): Promise<void> {
    return this.writeQueue.enqueue(async () => {
      try {
        logger.debug('Saving project settings for:', projectId);

        const result = await chrome.storage.sync.get(STORAGE_KEYS.PROJECT_SETTINGS);
        const projectSettings: ProjectSettings = result[STORAGE_KEYS.PROJECT_SETTINGS] || {};

        projectSettings[projectId] = {
          repoName,
          branch,
          ...(projectTitle && { projectTitle }),
        };

        await chrome.storage.sync.set({
          [STORAGE_KEYS.PROJECT_SETTINGS]: projectSettings,
        });

        logger.info(`Project settings saved successfully for ${projectId}`);
      } catch (error) {
        logger.error('Error saving project settings to storage:', error);
        throw error;
      }
    });
  }

  /**
   * Set up storage change listener for reactive updates
   */
  static setupStorageListener(
    callback: (changes: Record<string, chrome.storage.StorageChange>) => void
  ): void {
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        // Only listen to sync storage changes for projectSettings
        if (namespace === 'sync' && changes.projectSettings) {
          logger.debug('Storage change detected for projectSettings');
          callback(changes);
        }
      });
    }
  }

  /**
   * Remove all storage change listeners
   * Note: This is a placeholder implementation. In practice, you would need to
   * store the listener reference to properly remove it.
   */
  static removeStorageListeners(): void {
    // Implementation would require storing listener references
    // For now, this is just a placeholder for the API
    logger.debug('Storage listener removal requested');
  }

  /**
   * Get current project ID from sync storage
   */
  static async getCurrentProjectId(): Promise<string | null> {
    try {
      const result = await chrome.storage.sync.get(STORAGE_KEYS.PROJECT_ID);
      return result[STORAGE_KEYS.PROJECT_ID] || null;
    } catch (error) {
      logger.error('Error getting current project ID from storage:', error);
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
      logger.error('Error saving current project ID to storage:', error);
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
      logger.error('Error getting pending file changes from storage:', error);
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
      logger.error('Error saving pending file changes to storage:', error);
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
      logger.error('Error clearing pending file changes from storage:', error);
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
      logger.error('Error getting stored file changes from storage:', error);
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
      logger.error('Error saving stored file changes to storage:', error);
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
      logger.error('Error clearing stored file changes from storage:', error);
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
      logger.error('Error getting data from storage:', error);
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
      logger.error('Error setting data in storage:', error);
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
      logger.error('Error removing data from storage:', error);
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
      logger.error('Error clearing storage:', error);
      throw error;
    }
  }

  /**
   * Get push statistics from local storage
   */
  static async getPushStatistics(): Promise<PushStatistics> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.PUSH_STATISTICS);
      return (
        result[STORAGE_KEYS.PUSH_STATISTICS] || {
          totalAttempts: 0,
          totalSuccesses: 0,
          totalFailures: 0,
          records: [],
        }
      );
    } catch (error) {
      logger.error('Error getting push statistics from storage:', error);
      return {
        totalAttempts: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        records: [],
      };
    }
  }

  /**
   * Save push statistics to local storage
   */
  static async savePushStatistics(statistics: PushStatistics): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.PUSH_STATISTICS]: statistics,
      });
    } catch (error) {
      logger.error('Error saving push statistics to storage:', error);
      throw error;
    }
  }

  /**
   * Clear push statistics from local storage
   */
  static async clearPushStatistics(): Promise<void> {
    try {
      await chrome.storage.local.remove(STORAGE_KEYS.PUSH_STATISTICS);
    } catch (error) {
      logger.error('Error clearing push statistics from storage:', error);
      throw error;
    }
  }

  // ========================================
  // Authentication Method Management
  // ========================================

  /**
   * Get the current authentication method
   */
  static async getAuthenticationMethod(): Promise<'pat' | 'github_app'> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.AUTHENTICATION_METHOD);
      return result[STORAGE_KEYS.AUTHENTICATION_METHOD] || 'pat';
    } catch (error) {
      logger.error('Error getting authentication method from storage:', error);
      return 'pat';
    }
  }

  /**
   * Set the authentication method
   */
  static async setAuthenticationMethod(method: 'pat' | 'github_app'): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.AUTHENTICATION_METHOD]: method,
      });
    } catch (error) {
      logger.error('Error setting authentication method in storage:', error);
      throw error;
    }
  }

  /**
   * Check if user has both authentication methods configured
   */
  static async hasMultipleAuthMethods(): Promise<{
    hasPAT: boolean;
    hasGitHubApp: boolean;
    hasMultiple: boolean;
  }> {
    try {
      const syncResult = await chrome.storage.sync.get(STORAGE_KEYS.GITHUB_TOKEN);
      const localResult = await chrome.storage.local.get(STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID);

      const hasPAT = !!syncResult[STORAGE_KEYS.GITHUB_TOKEN];
      const hasGitHubApp = !!localResult[STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID];

      return {
        hasPAT,
        hasGitHubApp,
        hasMultiple: hasPAT && hasGitHubApp,
      };
    } catch (error) {
      logger.error('Error checking multiple auth methods:', error);
      return {
        hasPAT: false,
        hasGitHubApp: false,
        hasMultiple: false,
      };
    }
  }

  // ========================================
  // GitHub App Specific Storage
  // ========================================

  /**
   * Get GitHub App configuration
   */
  static async getGitHubAppConfig(): Promise<{
    installationId?: number;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    refreshTokenExpiresAt?: string;
    username?: string;
    userId?: number;
    avatarUrl?: string;
    scopes?: string[];
  }> {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID,
        STORAGE_KEYS.GITHUB_APP_ACCESS_TOKEN,
        STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN,
        STORAGE_KEYS.GITHUB_APP_EXPIRES_AT,
        STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN_EXPIRES_AT,
        STORAGE_KEYS.GITHUB_APP_USERNAME,
        STORAGE_KEYS.GITHUB_APP_USER_ID,
        STORAGE_KEYS.GITHUB_APP_AVATAR_URL,
        STORAGE_KEYS.GITHUB_APP_SCOPES,
      ]);

      return {
        installationId: result[STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID],
        accessToken: result[STORAGE_KEYS.GITHUB_APP_ACCESS_TOKEN],
        refreshToken: result[STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN],
        expiresAt: result[STORAGE_KEYS.GITHUB_APP_EXPIRES_AT],
        refreshTokenExpiresAt: result[STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN_EXPIRES_AT],
        username: result[STORAGE_KEYS.GITHUB_APP_USERNAME],
        userId: result[STORAGE_KEYS.GITHUB_APP_USER_ID],
        avatarUrl: result[STORAGE_KEYS.GITHUB_APP_AVATAR_URL],
        scopes: result[STORAGE_KEYS.GITHUB_APP_SCOPES],
      };
    } catch (error) {
      logger.error('Error getting GitHub App config from storage:', error);
      return {};
    }
  }

  /**
   * Save GitHub App configuration
   */
  static async saveGitHubAppConfig(config: {
    installationId?: number;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    refreshTokenExpiresAt?: string;
    username?: string;
    userId?: number;
    avatarUrl?: string;
    scopes?: string[];
  }): Promise<void> {
    try {
      const dataToSave: Record<string, any> = {};

      if (config.installationId !== undefined) {
        dataToSave[STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID] = config.installationId;
      }
      if (config.accessToken !== undefined) {
        dataToSave[STORAGE_KEYS.GITHUB_APP_ACCESS_TOKEN] = config.accessToken;
      }
      if (config.refreshToken !== undefined) {
        dataToSave[STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN] = config.refreshToken;
      }
      if (config.expiresAt !== undefined) {
        dataToSave[STORAGE_KEYS.GITHUB_APP_EXPIRES_AT] = config.expiresAt;
      }
      if (config.refreshTokenExpiresAt !== undefined) {
        dataToSave[STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN_EXPIRES_AT] = config.refreshTokenExpiresAt;
      }
      if (config.username !== undefined) {
        dataToSave[STORAGE_KEYS.GITHUB_APP_USERNAME] = config.username;
      }
      if (config.userId !== undefined) {
        dataToSave[STORAGE_KEYS.GITHUB_APP_USER_ID] = config.userId;
      }
      if (config.avatarUrl !== undefined) {
        dataToSave[STORAGE_KEYS.GITHUB_APP_AVATAR_URL] = config.avatarUrl;
      }
      if (config.scopes !== undefined) {
        dataToSave[STORAGE_KEYS.GITHUB_APP_SCOPES] = config.scopes;
      }

      if (Object.keys(dataToSave).length > 0) {
        await chrome.storage.local.set(dataToSave);
      }
    } catch (error) {
      logger.error('Error saving GitHub App config to storage:', error);
      throw error;
    }
  }

  /**
   * Clear GitHub App configuration
   */
  static async clearGitHubAppConfig(): Promise<void> {
    try {
      await chrome.storage.local.remove([
        STORAGE_KEYS.GITHUB_APP_INSTALLATION_ID,
        STORAGE_KEYS.GITHUB_APP_ACCESS_TOKEN,
        STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN,
        STORAGE_KEYS.GITHUB_APP_EXPIRES_AT,
        STORAGE_KEYS.GITHUB_APP_REFRESH_TOKEN_EXPIRES_AT,
        STORAGE_KEYS.GITHUB_APP_USERNAME,
        STORAGE_KEYS.GITHUB_APP_USER_ID,
        STORAGE_KEYS.GITHUB_APP_AVATAR_URL,
        STORAGE_KEYS.GITHUB_APP_SCOPES,
      ]);
    } catch (error) {
      logger.error('Error clearing GitHub App config from storage:', error);
      throw error;
    }
  }

  // ========================================
  // Migration Status Management
  // ========================================

  /**
   * Check if migration prompt has been shown
   */
  static async getMigrationPromptStatus(): Promise<{
    shown: boolean;
    lastPrompt?: string;
  }> {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.MIGRATION_PROMPT_SHOWN,
        STORAGE_KEYS.LAST_MIGRATION_PROMPT,
      ]);

      return {
        shown: result[STORAGE_KEYS.MIGRATION_PROMPT_SHOWN] || false,
        lastPrompt: result[STORAGE_KEYS.LAST_MIGRATION_PROMPT],
      };
    } catch (error) {
      logger.error('Error getting migration prompt status:', error);
      return { shown: false };
    }
  }

  /**
   * Mark migration prompt as shown
   */
  static async markMigrationPromptShown(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.MIGRATION_PROMPT_SHOWN]: true,
        [STORAGE_KEYS.LAST_MIGRATION_PROMPT]: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error marking migration prompt as shown:', error);
      throw error;
    }
  }

  /**
   * Reset migration prompt status (for testing or re-showing)
   */
  static async resetMigrationPromptStatus(): Promise<void> {
    try {
      await chrome.storage.local.remove([
        STORAGE_KEYS.MIGRATION_PROMPT_SHOWN,
        STORAGE_KEYS.LAST_MIGRATION_PROMPT,
      ]);
    } catch (error) {
      logger.error('Error resetting migration prompt status:', error);
      throw error;
    }
  }

  // ========================================
  // Instance Methods for Generic Storage
  // ========================================

  /**
   * Generic get method for chrome.storage.local
   */
  async get(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Generic set method for chrome.storage.local
   */
  async set(data: Record<string, any>): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  // ========================================
  // BoltProject Management
  // ========================================

  /**
   * Get all bolt projects from storage
   */
  async getBoltProjects(): Promise<BoltProject[]> {
    try {
      const result = await this.get('boltProjects');
      return result.boltProjects || [];
    } catch (error) {
      logger.error('Error getting bolt projects:', error);
      throw error;
    }
  }

  /**
   * Save bolt projects to storage
   */
  async saveBoltProjects(projects: BoltProject[]): Promise<void> {
    try {
      await this.set({ boltProjects: projects });
    } catch (error) {
      logger.error('Error saving bolt projects:', error);
      throw error;
    }
  }

  /**
   * Get a specific bolt project by id
   */
  async getBoltProject(id: string): Promise<BoltProject | null> {
    try {
      const projects = await this.getBoltProjects();
      return projects.find((p) => p.id === id) || null;
    } catch (error) {
      logger.error(`Error getting bolt project ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update a specific bolt project
   */
  async updateBoltProject(id: string, updates: Partial<BoltProject>): Promise<void> {
    try {
      const projects = await this.getBoltProjects();
      const index = projects.findIndex((p) => p.id === id);

      if (index === -1) {
        throw new Error(`Project with id ${id} not found`);
      }

      projects[index] = { ...projects[index], ...updates };
      await this.saveBoltProjects(projects);
    } catch (error) {
      logger.error(`Error updating bolt project ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a bolt project by id
   */
  async deleteBoltProject(id: string): Promise<void> {
    try {
      const projects = await this.getBoltProjects();
      const filteredProjects = projects.filter((p) => p.id !== id);
      await this.saveBoltProjects(filteredProjects);
    } catch (error) {
      logger.error(`Error deleting bolt project ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get last sync timestamp
   */
  async getLastSyncTimestamp(): Promise<string | null> {
    try {
      const result = await this.get('lastSyncTimestamp');
      return result.lastSyncTimestamp || null;
    } catch (error) {
      logger.error('Error getting last sync timestamp:', error);
      throw error;
    }
  }

  /**
   * Set last sync timestamp
   */
  async setLastSyncTimestamp(timestamp: string): Promise<void> {
    try {
      await this.set({ lastSyncTimestamp: timestamp });
    } catch (error) {
      logger.error('Error setting last sync timestamp:', error);
      throw error;
    }
  }
}
