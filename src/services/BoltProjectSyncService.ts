import { ChromeStorageService } from '$lib/services/chromeStorage';
import { SupabaseAuthService } from '../content/services/SupabaseAuthService';
import { SUPABASE_CONFIG } from '$lib/constants/supabase';
import { createLogger } from '$lib/utils/logger';
import type { BoltProject, SyncRequest, SyncResponse } from '$lib/types';

const logger = createLogger('BoltProjectSyncService');

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
   * Get auth token from storage - similar pattern to UnifiedGitHubService
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      // Check if SupabaseAuthService has a stored token
      const potentialKeys = ['supabaseToken', 'supabaseAuthState'];

      for (const key of potentialKeys) {
        try {
          const result = await chrome.storage.local.get([key]);
          const data = result[key];

          if (data) {
            let token: string | null = null;

            // Handle different token storage formats
            if (typeof data === 'string') {
              token = data;
            } else if (data.access_token) {
              token = data.access_token;
            } else if (data.session?.access_token) {
              token = data.session.access_token;
            }

            // Validate token format (basic JWT check)
            if (token && token.split('.').length === 3) {
              return token;
            }
          }
        } catch (error) {
          logger.debug(`Failed to get token from key ${key}:`, error);
        }
      }

      logger.warn('No auth token found in storage');
      return null;
    } catch (error) {
      logger.error('Failed to get auth token:', error);
      return null;
    }
  }

  /**
   * Convert BoltProject to backend-compatible format
   * Removes local-only fields and ensures compatibility with ExtensionProject schema
   */
  private prepareProjectForBackend(project: BoltProject): any {
    // Only include fields that match the backend ExtensionProject schema
    return {
      bolt_project_id: project.bolt_project_id,
      project_name: project.project_name,
      project_description: project.project_description,
      github_repo_owner: project.github_repo_owner,
      github_repo_name: project.github_repo_name,
      github_branch: project.github_branch,
      github_repo_url: project.github_repo_url,
      is_private: project.is_private,
      last_modified: project.last_modified,
      // Exclude local-only fields: id, repoName, branch, version, sync_status
    };
  }

  /**
   * Sync projects with backend
   */
  async syncWithBackend(
    conflictResolution: 'auto-resolve' | 'keep-local' | 'keep-remote' = 'auto-resolve'
  ): Promise<SyncResponse> {
    logger.info('🚀 Starting backend sync operation', { conflictResolution });

    const authToken = await this.getAuthToken();
    if (!authToken) {
      logger.error('❌ Sync failed - user not authenticated');
      throw new Error('User not authenticated');
    }

    const localProjects = await this.getLocalProjects();
    const lastSyncTimestamp = await this.getLastSyncTimestamp();

    // Prepare projects for backend (remove local-only fields)
    const backendProjects = localProjects.map((project) => this.prepareProjectForBackend(project));

    logger.debug('📋 Preparing sync request', {
      localProjectCount: localProjects.length,
      localProjectIds: localProjects.map((p) => p.id),
      lastSyncTimestamp: lastSyncTimestamp || 'none',
      conflictResolution,
      backendProjectSample: backendProjects[0] || 'none',
    });

    const syncRequest: SyncRequest = {
      localProjects: backendProjects,
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
        deletedProjectCount: syncResponse.deletedProjects?.length || 0,
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
      if (syncResponse.updatedProjects && syncResponse.updatedProjects.length > 0) {
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
   * Enhanced: also check existing ProjectSettings storage format
   */
  async shouldPerformInwardSync(): Promise<boolean> {
    const projects = await this.getLocalProjects();

    logger.debug('🔍 Checking inward sync conditions', {
      projectCount: projects.length,
      projectIds: projects.map((p) => p.id),
    });

    // Also check existing ProjectSettings storage format (current active format)
    let existingProjectCount = 0;
    try {
      const gitHubSettings = await ChromeStorageService.getGitHubSettings();
      const existingProjects = gitHubSettings.projectSettings || {};
      existingProjectCount = Object.keys(existingProjects).length;

      logger.debug('🗂️ Found existing projects in current storage format', {
        existingProjectCount,
        existingProjectIds: Object.keys(existingProjects),
      });
    } catch (error) {
      logger.warn('Failed to check existing project storage:', error);
    }

    const totalProjectCount = projects.length + existingProjectCount;

    logger.debug('📊 Total project count analysis', {
      syncFormatProjects: projects.length,
      currentFormatProjects: existingProjectCount,
      totalProjects: totalProjectCount,
    });

    // If we have existing projects in current format, don't perform inward sync to avoid conflicts
    if (existingProjectCount > 0) {
      logger.info('🛡️ Inward sync prevented - existing projects found in current storage format', {
        existingProjectCount,
        syncProjectCount: projects.length,
      });
      return false;
    }

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
   * Migrate existing projects from old storage format to new sync format
   * This bridges the gap between projectSettings and boltProjects
   */
  private async migrateExistingProjects(): Promise<void> {
    try {
      // Check if we already have projects in the new format
      const existingBoltProjects = await this.getLocalProjects();

      // Check if existing bolt projects need project_name field update
      const incompleteProjects = existingBoltProjects.filter((project) => !project.project_name);
      if (incompleteProjects.length > 0) {
        logger.info('🔄 Updating existing bolt projects with missing project_name field', {
          incompleteCount: incompleteProjects.length,
          incompleteProjectIds: incompleteProjects.map((p) => p.id),
        });

        // Add project_name field to incomplete projects
        const updatedProjects = existingBoltProjects.map((project) => {
          if (!project.project_name) {
            return {
              ...project,
              project_name: project.id, // Use ID as project name fallback
            };
          }
          return project;
        });

        await this.saveLocalProjects(updatedProjects);
        logger.info('✅ Successfully updated bolt projects with project_name field');
        return;
      }

      if (existingBoltProjects.length > 0) {
        logger.debug('🔄 Sync format already has complete projects, skipping migration', {
          existingCount: existingBoltProjects.length,
        });
        return;
      }

      // Check for projects in the old format
      const gitHubSettings = await ChromeStorageService.getGitHubSettings();
      const legacyProjects = gitHubSettings.projectSettings || {};
      const legacyProjectIds = Object.keys(legacyProjects);

      if (legacyProjectIds.length === 0) {
        logger.debug('🔄 No legacy projects found, migration not needed');
        return;
      }

      logger.info('🔄 Migrating legacy projects to sync format', {
        legacyProjectCount: legacyProjectIds.length,
        legacyProjectIds,
      });

      // Convert legacy projects to new format
      const migratedProjects: BoltProject[] = legacyProjectIds.map((projectId) => {
        const legacyProject = legacyProjects[projectId];

        // Create a new BoltProject from the legacy ProjectSetting
        return {
          id: projectId, // Local extension field
          bolt_project_id: projectId, // Backend field
          project_name: legacyProject.projectTitle || projectId, // Backend field
          github_repo_name: legacyProject.repoName || projectId, // Backend field
          github_repo_owner: gitHubSettings.repoOwner || undefined, // Backend field
          github_branch: legacyProject.branch || 'main', // Backend field (was 'branch')
          is_private: false, // Backend field - default assumption
          last_modified: new Date().toISOString(), // Backend field
          // Local compatibility fields (for ProjectSetting inheritance)
          repoName: legacyProject.repoName || projectId,
          branch: legacyProject.branch || 'main',
          // Local sync metadata
          version: 1,
          sync_status: 'pending',
        };
      });

      // Save migrated projects to new format
      await this.saveLocalProjects(migratedProjects);

      logger.info('✅ Successfully migrated legacy projects to sync format', {
        migratedCount: migratedProjects.length,
        migratedProjectIds: migratedProjects.map((p) => p.id),
      });
    } catch (error) {
      logger.error('💥 Failed to migrate existing projects', { error });
      // Don't throw - migration failure shouldn't block sync
    }
  }

  /**
   * Perform outward sync (extension to server)
   * Only syncs if user is authenticated
   */
  async performOutwardSync(): Promise<SyncResponse | null> {
    logger.info('🔄 Starting outward sync operation');

    // First, migrate existing projects if needed
    await this.migrateExistingProjects();

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
          isPremium: authState.subscription.isActive,
        },
      });
      return null;
    }

    try {
      logger.info('⬆️ Performing outward sync to server', {
        isAuthenticated: authState.isAuthenticated,
        localProjectCount: localProjects.length,
      });
      const result = await this.syncWithBackend();

      // Sync back to active storage format (reverse bridge)
      await this.syncBackToActiveStorage();

      // Update last sync timestamp
      const syncTimestamp = new Date().toISOString();
      await this.setLastSyncTimestamp(syncTimestamp);

      logger.info('🎉 Outward sync completed successfully', {
        updatedCount: result.updatedProjects?.length || 0,
        conflictCount: result.conflicts?.length || 0,
        deletedCount: result.deletedProjects?.length || 0,
        syncTimestamp,
      });

      return result;
    } catch (error) {
      logger.error('💥 Outward sync failed', { error });
      throw error;
    }
  }

  /**
   * Sync back from boltProjects to active storage format (reverse bridge)
   * This ensures the extension continues to work with existing project data
   */
  private async syncBackToActiveStorage(): Promise<void> {
    try {
      const boltProjects = await this.getLocalProjects();

      if (boltProjects.length === 0) {
        logger.debug('🔄 No bolt projects to sync back to active storage');
        return;
      }

      logger.info('🔄 Syncing bolt projects back to active storage format', {
        projectCount: boltProjects.length,
        projectIds: boltProjects.map((p) => p.id),
      });

      // Get current active storage
      const gitHubSettings = await ChromeStorageService.getGitHubSettings();
      const updatedProjectSettings = { ...gitHubSettings.projectSettings };

      // Convert bolt projects back to project settings format
      for (const boltProject of boltProjects) {
        updatedProjectSettings[boltProject.bolt_project_id] = {
          repoName:
            boltProject.github_repo_name || boltProject.repoName || boltProject.bolt_project_id,
          branch: boltProject.github_branch || boltProject.branch || 'main',
          projectTitle: boltProject.project_name || boltProject.bolt_project_id,
        };
      }

      // Update the active storage with converted projects
      const updatedGitHubSettings = {
        ...gitHubSettings,
        projectSettings: updatedProjectSettings,
      };

      await ChromeStorageService.saveGitHubSettings(updatedGitHubSettings);

      logger.info('✅ Successfully synced projects back to active storage format', {
        updatedProjectCount: boltProjects.length,
        totalActiveProjects: Object.keys(updatedProjectSettings).length,
      });
    } catch (error) {
      logger.error('💥 Failed to sync back to active storage format', { error });
      // Don't throw - reverse sync failure shouldn't block the main sync operation
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
          isPremium: authState.subscription.isActive,
        },
      });
      return null;
    }

    try {
      logger.info('⬇️ Performing inward sync from server', {
        isAuthenticated: authState.isAuthenticated,
      });
      const result = await this.syncWithBackend();

      // Sync back to active storage format (reverse bridge)
      await this.syncBackToActiveStorage();

      // Update last sync timestamp
      const syncTimestamp = new Date().toISOString();
      await this.setLastSyncTimestamp(syncTimestamp);

      logger.info('🎉 Inward sync completed successfully', {
        projectCount: result.updatedProjects?.length || 0,
        conflictCount: result.conflicts?.length || 0,
        deletedCount: result.deletedProjects?.length || 0,
        syncTimestamp,
      });

      return result;
    } catch (error) {
      logger.error('💥 Inward sync failed', { error });
      throw error;
    }
  }
}
