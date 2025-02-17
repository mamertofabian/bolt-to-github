import type { GitLabSettingsInterface, ProjectSettings } from '$lib/types';

export interface SettingsCheckResult {
  isSettingsValid: boolean;

  gitLabSettings?: GitLabSettingsInterface;
}

export class SettingsService {
  static async needsGitLabMigration(): Promise<boolean> {
    try {
      const settings = await chrome.storage.sync.get(['gitlabToken']);
      return !settings.gitlabToken;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  static async clearOldSettings(): Promise<void> {
    try {
      await chrome.storage.sync.remove(['githubToken']); // Remove legacy GitHub token during migration
    } catch (error) {
      console.error('Error clearing old settings:', error);
    }
  }
  private static async encryptToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return JSON.stringify({
      encrypted: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
      key: await crypto.subtle.exportKey('jwk', key)
    });
  }

  private static async decryptToken(encryptedData: string): Promise<string> {
    try {
      const { encrypted, iv, key } = JSON.parse(encryptedData);
      const importedKey = await crypto.subtle.importKey(
        'jwk',
        key,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        importedKey,
        new Uint8Array(encrypted)
      );
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Error decrypting token:', error);
      return '';
    }
  }

  static async initializeGitLabSettings(): Promise<void> {
    try {
      const settings = await chrome.storage.sync.get(['repoOwner', 'projectSettings']);
      
      // Initialize with empty settings
      const encryptedToken = await this.encryptToken('');  // Empty token for security
      await chrome.storage.sync.set({
        gitlabToken: encryptedToken,
        repoOwner: settings.repoOwner || '',
        projectSettings: settings.projectSettings || {}
      });
    } catch (error) {
      console.error('Error initializing GitLab settings:', error);
      throw new Error('Failed to initialize GitLab settings');
    }
  }

  // Main settings getter
  static async getSettings(): Promise<SettingsCheckResult> {
    try {
      const [settings, projectId] = await Promise.all([
        chrome.storage.sync.get(['gitlabToken', 'repoOwner', 'projectSettings']),
        chrome.storage.sync.get('projectId'),
      ]);

      let projectSettings = settings.projectSettings?.[projectId.projectId];
      let decryptedToken: string | undefined;

      if (settings.gitlabToken) {
        try {
          decryptedToken = await this.decryptToken(settings.gitlabToken);
        } catch (error) {
          console.error('Error decrypting GitLab token:', error);
          return { isSettingsValid: false, gitLabSettings: undefined };
        }
      }

      if (!projectSettings && projectId?.projectId && settings.repoOwner && decryptedToken) {
        projectSettings = { repoName: projectId.projectId, branch: 'main' };
        await chrome.storage.sync.set({
          [`projectSettings.${projectId.projectId}`]: projectSettings,
        });
      }

      const isSettingsValid = Boolean(
        decryptedToken && settings.repoOwner && settings.projectSettings && projectSettings
      );

      return {
        isSettingsValid,
        gitLabSettings: isSettingsValid ? {
          gitlabToken: decryptedToken!,
          repoOwner: settings.repoOwner,
          projectSettings: projectSettings || undefined,
        } : undefined,
      };
    } catch (error) {
      console.error('Error checking GitLab settings:', error);
      return { isSettingsValid: false, gitLabSettings: undefined };
    }
  }
  static async getGitLabSettings(): Promise<SettingsCheckResult> {
    try {
      const [settings, projectId] = await Promise.all([
        chrome.storage.sync.get(['gitlabToken', 'repoOwner', 'projectSettings']),
        chrome.storage.sync.get('projectId'),
      ]);

      let projectSettings = settings.projectSettings?.[projectId.projectId];
      let decryptedToken: string | undefined;

      if (settings.gitlabToken) {
        try {
          decryptedToken = await this.decryptToken(settings.gitlabToken);
        } catch (error) {
          console.error('Error decrypting GitLab token:', error);
          return { isSettingsValid: false, gitLabSettings: undefined };
        }
      }

      // Auto-create project settings if needed
      if (!projectSettings && projectId?.projectId && settings.repoOwner && decryptedToken) {
        projectSettings = { repoName: projectId.projectId, branch: 'main' };
        await chrome.storage.sync.set({
          [`projectSettings.${projectId.projectId}`]: projectSettings,
        });
      }

      const isSettingsValid = Boolean(
        decryptedToken && settings.repoOwner && settings.projectSettings && projectSettings
      );

      return {
        isSettingsValid,
        gitLabSettings: isSettingsValid ? {
          gitlabToken: decryptedToken!,
          repoOwner: settings.repoOwner,
          projectSettings: projectSettings || undefined,
        } : undefined,
      };
    } catch (error) {
      console.error('Error checking GitLab settings:', error);
      return { isSettingsValid: false, gitLabSettings: undefined };
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
