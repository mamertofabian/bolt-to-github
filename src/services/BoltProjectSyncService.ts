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
      logger.info(`💾 Saved ${projects.length} projects to local storage`, {
        projectIds: projects.map((p) => p.id),
        projects: projects.map((p) => ({
          id: p.id,
          boltProjectId: p.bolt_project_id,
          repoName: p.github_repo_name || 'none',
          syncStatus: p.sync_status || 'unknown',
          lastModified: p.last_modified || 'none',
        })),
      });
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
      logger.debug('🕒 Updated last sync timestamp', { timestamp });
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
    logger.info('🚀 Starting backend sync operation', { conflictResolution });

    const authToken = await this.authService.getAuthToken();
    if (!authToken) {
      logger.error('❌ Sync failed - user not authenticated');
      throw new Error('User not authenticated');
    }

    const localProjects = await this.getLocalProjects();
    const lastSyncTimestamp = await this.getLastSyncTimestamp();

    logger.debug('📋 Preparing sync request', {
      localProjectCount: localProjects.length,
      localProjectIds: localProjects.map((p) => p.id),
      lastSyncTimestamp: lastSyncTimestamp || 'none',
      conflictResolution,
    });

    const syncRequest: SyncRequest = {
      localProjects,
      lastSyncTimestamp: lastSyncTimestamp || undefined,
      conflictResolution,
    };

    try {
      logger.debug('🌐 Sending sync request to backend', {
        url: `${SUPABASE_CONFIG.URL}/functions/v1/sync-bolt-projects`,
        payloadSize: JSON.stringify(syncRequest).length,
      });

      const response = await fetch(`${SUPABASE_CONFIG.URL}/functions/v1/sync-bolt-projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(syncRequest),
      });

      logger.debug('📨 Received sync response', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error('❌ Sync request failed', {
          status: response.status,
          statusText: response.statusText,
          errorData,
        });
        throw new Error(`Sync failed: ${errorData.error || 'Unknown error'}`);
      }

      const syncResponse: SyncResponse = await response.json();

      logger.info('📊 Sync response summary', {
        success: syncResponse.success,
        updatedProjectCount: syncResponse.updatedProjects?.length || 0,
        conflictCount: syncResponse.conflicts?.length || 0,
        deletedProjectCount: syncResponse.deletedProjectIds?.length || 0,
        hasError: !!syncResponse.error,
      });

      if (syncResponse.conflicts && syncResponse.conflicts.length > 0) {
        logger.warn('⚠️ Sync conflicts detected', {
          conflicts: syncResponse.conflicts.map((c) => ({
            projectId: c.project?.id,
            error: c.error,
            conflict: c.conflict,
            message: c.message,
          })),
        });
      }

      // Update local projects with server response
      if (syncResponse.updatedProjects) {
        logger.debug('💾 Updating local projects with server response', {
          updatedProjectIds: syncResponse.updatedProjects.map((p) => p.id),
        });
        await this.saveLocalProjects(syncResponse.updatedProjects);
      }

      logger.info('✅ Backend sync completed successfully');
      return syncResponse;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        logger.error('🌐 Network error during sync', { error: error.message });
        throw new Error('Network error');
      }
      logger.error('💥 Unexpected error during sync', { error });
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

    logger.debug('🔍 Checking inward sync conditions', {
      projectCount: projects.length,
      projectIds: projects.map((p) => p.id),
    });

    // Original behavior: sync from server if no projects exist
    if (projects.length === 0) {
      logger.info('✅ Inward sync allowed - no projects exist locally');
      return true;
    }

    // Original behavior: don't sync if multiple projects exist
    if (projects.length > 1) {
      logger.info('🚫 Inward sync prevented - multiple projects exist locally', {
        projectCount: projects.length,
      });
      return false;
    }

    // NEW: For single project, check if it has an existing GitHub repository
    // If it has both repo name and owner, it's linked to GitHub - don't sync to protect it
    const singleProject = projects[0];
    const hasLinkedGitHubRepo = !!(
      singleProject.github_repo_name && singleProject.github_repo_owner
    );

    logger.debug('🔍 Analyzing single project for GitHub linkage', {
      projectId: singleProject.id,
      boltProjectId: singleProject.bolt_project_id,
      hasRepoName: !!singleProject.github_repo_name,
      hasRepoOwner: !!singleProject.github_repo_owner,
      hasLinkedGitHubRepo,
      repoName: singleProject.github_repo_name || 'none',
      repoOwner: singleProject.github_repo_owner || 'none',
    });

    if (hasLinkedGitHubRepo) {
      // Don't perform inward sync to protect user's important project
      logger.info('🛡️ Inward sync prevented - single project has linked GitHub repository', {
        projectId: singleProject.id,
        githubRepo: `${singleProject.github_repo_owner}/${singleProject.github_repo_name}`,
      });
      return false;
    }

    // Original behavior: sync if single project has no GitHub repository
    logger.info('✅ Inward sync allowed - single project has no GitHub repository', {
      projectId: singleProject.id,
    });
    return true;
  }

  /**
   * Perform outward sync (extension to server)
   * Only syncs if user is authenticated
   */
  async performOutwardSync(): Promise<SyncResponse | null> {
    logger.info('🔄 Starting outward sync operation');

    const localProjects = await this.getLocalProjects();
    logger.debug('📦 Local projects state', {
      projectCount: localProjects.length,
      projects: localProjects.map((p) => ({
        id: p.id,
        boltProjectId: p.bolt_project_id,
        repoName: p.github_repo_name || 'none',
        repoOwner: p.github_repo_owner || 'none',
        syncStatus: p.sync_status || 'unknown',
      })),
    });

    const authState = this.authService.getAuthState();
    if (!authState.isAuthenticated) {
      logger.info('🔐 Skipping outward sync - user not authenticated', {
        authState: {
          isAuthenticated: authState.isAuthenticated,
          authMethod: authState.authMethod,
        },
      });
      return null;
    }

    try {
      logger.info('⬆️ Performing outward sync to server', {
        authMethod: authState.authMethod,
        localProjectCount: localProjects.length,
      });
      const result = await this.syncWithBackend();

      // Update last sync timestamp
      const syncTimestamp = new Date().toISOString();
      await this.setLastSyncTimestamp(syncTimestamp);

      logger.info('🎉 Outward sync completed successfully', {
        updatedCount: result.updatedProjects.length,
        conflictCount: result.conflicts.length,
        deletedCount: result.deletedProjectIds.length,
        syncTimestamp,
      });

      return result;
    } catch (error) {
      logger.error('💥 Outward sync failed', { error });
      throw error;
    }
  }

  /**
   * Perform inward sync (server to extension)
   * Only syncs if conditions are met (empty or single project)
   */
  async performInwardSync(): Promise<SyncResponse | null> {
    logger.info('🔄 Starting inward sync operation');

    const shouldSync = await this.shouldPerformInwardSync();
    if (!shouldSync) {
      logger.info('⏭️ Skipping inward sync - conditions not met');
      return null;
    }

    const authState = this.authService.getAuthState();
    if (!authState.isAuthenticated) {
      logger.info('🔐 Skipping inward sync - user not authenticated', {
        authState: {
          isAuthenticated: authState.isAuthenticated,
          authMethod: authState.authMethod,
        },
      });
      return null;
    }

    try {
      logger.info('⬇️ Performing inward sync from server', {
        authMethod: authState.authMethod,
      });
      const result = await this.syncWithBackend();

      // Update last sync timestamp
      const syncTimestamp = new Date().toISOString();
      await this.setLastSyncTimestamp(syncTimestamp);

      logger.info('🎉 Inward sync completed successfully', {
        projectCount: result.updatedProjects.length,
        conflictCount: result.conflicts.length,
        deletedCount: result.deletedProjectIds.length,
        syncTimestamp,
      });

      return result;
    } catch (error) {
      logger.error('💥 Inward sync failed', { error });
      throw error;
    }
  }
}
