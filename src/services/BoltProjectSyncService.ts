import { ChromeStorageService } from '$lib/services/chromeStorage';
import { SupabaseAuthService } from '../content/services/SupabaseAuthService';
import { SUPABASE_CONFIG } from '$lib/constants/supabase';
import { logger } from '$lib/utils/logger';
import type { BoltProject, SyncRequest, SyncResponse } from '$lib/types';

export class BoltProjectSyncService {
  private storageService: ChromeStorageService;
  private authService: SupabaseAuthService;

  constructor() {
    this.storageService = new ChromeStorageService();
    this.authService = SupabaseAuthService.getInstance();
  }

  /**
   * Get local projects from chrome storage
   */
  async getLocalProjects(): Promise<BoltProject[]> {
    try {
      const result = await this.storageService.get('boltProjects');
      return result.boltProjects || [];
    } catch (error) {
      logger.error('Failed to get local projects', { error });
      return [];
    }
  }

  /**
   * Save projects to chrome storage
   */
  async saveLocalProjects(projects: BoltProject[]): Promise<void> {
    try {
      await this.storageService.set({ boltProjects: projects });
      logger.info(`Saved ${projects.length} projects to local storage`);
    } catch (error) {
      logger.error('Failed to save local projects', { error });
      throw error;
    }
  }

  /**
   * Get last sync timestamp from storage
   */
  async getLastSyncTimestamp(): Promise<string | null> {
    try {
      const result = await this.storageService.get('lastSyncTimestamp');
      return result.lastSyncTimestamp || null;
    } catch (error) {
      logger.error('Failed to get last sync timestamp', { error });
      return null;
    }
  }

  /**
   * Set last sync timestamp in storage
   */
  async setLastSyncTimestamp(timestamp: string): Promise<void> {
    try {
      await this.storageService.set({ lastSyncTimestamp: timestamp });
    } catch (error) {
      logger.error('Failed to set last sync timestamp', { error });
      throw error;
    }
  }

  /**
   * Sync projects with backend
   */
  async syncWithBackend(
    conflictResolution: 'auto-resolve' | 'keep-local' | 'keep-remote' = 'auto-resolve'
  ): Promise<SyncResponse> {
    const authToken = await this.authService.getAuthToken();
    if (!authToken) {
      throw new Error('User not authenticated');
    }

    const localProjects = await this.getLocalProjects();
    const lastSyncTimestamp = await this.getLastSyncTimestamp();

    const syncRequest: SyncRequest = {
      localProjects,
      lastSyncTimestamp: lastSyncTimestamp || undefined,
      conflictResolution,
    };

    try {
      const response = await fetch(`${SUPABASE_CONFIG.URL}/functions/v1/sync-bolt-projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(syncRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Sync failed: ${errorData.error || 'Unknown error'}`);
      }

      const syncResponse: SyncResponse = await response.json();

      // Update local projects with server response
      if (syncResponse.updatedProjects) {
        await this.saveLocalProjects(syncResponse.updatedProjects);
      }

      return syncResponse;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        throw new Error('Network error');
      }
      throw error;
    }
  }

  /**
   * Check if inward sync should be performed
   * Original behavior: sync if projects.length <= 1
   * New behavior: also prevent sync if single project has existing GitHub repository
   */
  async shouldPerformInwardSync(): Promise<boolean> {
    const projects = await this.getLocalProjects();

    // Original behavior: sync from server if no projects exist
    if (projects.length === 0) {
      return true;
    }

    // Original behavior: don't sync if multiple projects exist
    if (projects.length > 1) {
      return false;
    }

    // NEW: For single project, check if it has an existing GitHub repository
    // If it has both repo name and owner, it's linked to GitHub - don't sync to protect it
    const singleProject = projects[0];
    const hasLinkedGitHubRepo = !!(
      singleProject.github_repo_name && singleProject.github_repo_owner
    );

    if (hasLinkedGitHubRepo) {
      // Don't perform inward sync to protect user's important project
      return false;
    }

    // Original behavior: sync if single project has no GitHub repository
    return true;
  }

  /**
   * Perform outward sync (extension to server)
   * Only syncs if user is authenticated
   */
  async performOutwardSync(): Promise<SyncResponse | null> {
    const authState = this.authService.getAuthState();
    if (!authState.isAuthenticated) {
      logger.info('Skipping outward sync - user not authenticated');
      return null;
    }

    try {
      logger.info('Performing outward sync to server');
      const result = await this.syncWithBackend();

      // Update last sync timestamp
      await this.setLastSyncTimestamp(new Date().toISOString());

      logger.info('Outward sync completed successfully', {
        updatedCount: result.updatedProjects.length,
        conflictCount: result.conflicts.length,
        deletedCount: result.deletedProjectIds.length,
      });

      return result;
    } catch (error) {
      logger.error('Outward sync failed', { error });
      throw error;
    }
  }

  /**
   * Perform inward sync (server to extension)
   * Only syncs if conditions are met (empty or single project)
   */
  async performInwardSync(): Promise<SyncResponse | null> {
    const shouldSync = await this.shouldPerformInwardSync();
    if (!shouldSync) {
      logger.info('Skipping inward sync - multiple projects exist locally');
      return null;
    }

    const authState = this.authService.getAuthState();
    if (!authState.isAuthenticated) {
      logger.info('Skipping inward sync - user not authenticated');
      return null;
    }

    try {
      logger.info('Performing inward sync from server');
      const result = await this.syncWithBackend();

      // Update last sync timestamp
      await this.setLastSyncTimestamp(new Date().toISOString());

      logger.info('Inward sync completed successfully', {
        projectCount: result.updatedProjects.length,
      });

      return result;
    } catch (error) {
      logger.error('Inward sync failed', { error });
      throw error;
    }
  }
}
