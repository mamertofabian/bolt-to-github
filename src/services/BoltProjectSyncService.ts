import { ChromeStorageService } from '$lib/services/chromeStorage';
import { SupabaseAuthService } from '../content/services/SupabaseAuthService';
import { SUPABASE_CONFIG } from '$lib/constants/supabase';
import { createLogger } from '$lib/utils/logger';
import type {
  BoltProject,
  SyncRequest,
  SyncResponse,
  GitHubSettingsInterface,
  ProjectSettings,
} from '$lib/types';

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
            if (token && token.trim().length > 0 && token.split('.').length === 3) {
              return token;
            }
          }
        } catch (error) {
          logger.debug(`Failed to get token from key ${key}:`, error);
          // Continue to next key instead of failing completely
        }
      }

      logger.warn('No auth token found in storage');
      return null;
    } catch (error) {
      logger.error('Failed to get auth token:', error);
      throw new Error('Authentication token retrieval failed');
    }
  }

  /**
   * Validate if a project ID is compatible with backend requirements
   * Backend only accepts alphanumeric characters, hyphens, and underscores
   */
  private isValidProjectId(projectId: string): boolean {
    // Backend validation pattern: only alphanumeric, hyphens, and underscores
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(projectId);
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
    conflictResolution: 'auto-resolve' | 'keep-local' | 'keep-remote' = 'auto-resolve',
    updateLocalStorage: boolean = true
  ): Promise<SyncResponse> {
    logger.info('🚀 Starting backend sync operation', { conflictResolution });

    const authToken = await this.getAuthToken();
    if (!authToken) {
      logger.error('❌ Sync failed - user not authenticated');
      throw new Error('User not authenticated');
    }

    const localProjects = await this.getLocalProjects();
    const lastSyncTimestamp = await this.getLastSyncTimestamp();

    // Filter out projects with invalid IDs (e.g., temporary import projects like "github.com")
    const validProjects = localProjects.filter((project) => {
      const isValid = this.isValidProjectId(project.bolt_project_id);
      if (!isValid) {
        logger.debug('🚫 Skipping project with invalid ID during sync', {
          projectId: project.id,
          boltProjectId: project.bolt_project_id,
          reason:
            'Contains invalid characters (backend only accepts alphanumeric, hyphens, underscores)',
        });
      }
      return isValid;
    });

    if (validProjects.length !== localProjects.length) {
      logger.info('🔍 Filtered out invalid projects from sync', {
        totalProjects: localProjects.length,
        validProjects: validProjects.length,
        filteredOut: localProjects.length - validProjects.length,
        invalidProjectIds: localProjects
          .filter((p) => !this.isValidProjectId(p.bolt_project_id))
          .map((p) => p.bolt_project_id),
      });
    }

    // Prepare projects for backend (remove local-only fields)
    const backendProjects = validProjects.map((project) => this.prepareProjectForBackend(project));

    logger.debug('📋 Preparing sync request', {
      localProjectCount: localProjects.length,
      validProjectCount: validProjects.length,
      localProjectIds: localProjects.map((p) => p.id),
      validProjectIds: validProjects.map((p) => p.id),
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

      // Update local projects with server response (if requested)
      if (
        updateLocalStorage &&
        syncResponse.updatedProjects &&
        syncResponse.updatedProjects.length > 0
      ) {
        logger.debug('💾 Updating local projects with server response', {
          updatedProjectIds: syncResponse.updatedProjects.map((p) => p.id),
          updateLocalStorage,
        });
        await this.saveLocalProjects(syncResponse.updatedProjects);
      } else if (!updateLocalStorage) {
        logger.debug('⏭️ Skipping local storage update (updateLocalStorage=false)', {
          serverProjectCount: syncResponse.updatedProjects?.length || 0,
        });
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
   * Simplified approach: allow sync if user has 0-1 projects total
   * Let backend handle duplicates/conflicts, user can delete duplicates manually
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

    // Simple rule: allow sync if user has 0-1 projects total
    // Let backend handle conflicts/duplicates intelligently
    if (totalProjectCount <= 1) {
      logger.info('✅ Inward sync allowed - user has 0-1 projects total', {
        totalProjectCount,
        syncProjects: projects.length,
        activeProjects: existingProjectCount,
      });
      return true;
    }

    // Block sync if user has multiple projects to avoid overwhelming them
    logger.info('🚫 Inward sync prevented - user has multiple projects', {
      totalProjectCount,
      reason: 'User can manually import projects if needed',
    });
    return false;
  }

  /**
   * Detect if this is a fresh install where server data should take precedence
   * Returns true if extension appears to be freshly installed and has minimal data
   */
  private async isFreshInstall(): Promise<boolean> {
    try {
      // Check multiple indicators of fresh install
      const [gitHubSettings, lastSync, installCheckResult] = await Promise.all([
        ChromeStorageService.getGitHubSettings(),
        this.getLastSyncTimestamp(),
        chrome.storage.local.get(['extensionInstallDate', 'totalProjectsCreated']),
      ]);

      const legacyProjects = gitHubSettings.projectSettings || {};
      const legacyProjectCount = Object.keys(legacyProjects).length;
      const boltProjects = await this.getLocalProjects();
      const boltProjectCount = boltProjects.length;

      // Indicators of fresh install:
      const hasNeverSynced = !lastSync;
      const hasMinimalProjects = legacyProjectCount + boltProjectCount <= 1;
      const isRecentInstall = installCheckResult.extensionInstallDate
        ? Date.now() - installCheckResult.extensionInstallDate < 7 * 24 * 60 * 60 * 1000 // 7 days
        : false;
      const hasLowUsage = (installCheckResult.totalProjectsCreated || 0) <= 2;

      const isFresh = hasNeverSynced && hasMinimalProjects && (isRecentInstall || hasLowUsage);

      logger.info('🔍 Fresh install detection', {
        hasNeverSynced,
        hasMinimalProjects,
        isRecentInstall,
        hasLowUsage,
        legacyProjectCount,
        boltProjectCount,
        installDate: installCheckResult.extensionInstallDate,
        totalCreated: installCheckResult.totalProjectsCreated,
        decision: isFresh ? 'FRESH_INSTALL' : 'ESTABLISHED_EXTENSION',
      });

      return isFresh;
    } catch (error) {
      logger.error(
        '❌ Failed to detect fresh install, defaulting to established extension:',
        error
      );
      return false; // Default to established extension to be safe
    }
  }

  /**
   * Update projects that are missing the project_name field
   */
  private async updateIncompleteProjects(existingBoltProjects: BoltProject[]): Promise<boolean> {
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
      return true;
    }
    return false;
  }

  /**
   * Handle the case when no legacy projects exist
   */
  private async handleEmptyLegacyProjects(
    forOutwardSync: boolean,
    existingBoltProjects: BoltProject[]
  ): Promise<boolean> {
    if (forOutwardSync && existingBoltProjects.length > 0) {
      const isFresh = await this.isFreshInstall();

      if (isFresh) {
        // Fresh install: preserve existing server projects, don't clear them
        logger.info(
          '🍼 Fresh install detected - preserving existing projects despite empty legacy storage',
          {
            preservedProjectCount: existingBoltProjects.length,
            preservedProjectIds: existingBoltProjects.map((p) => p.id),
            reason: 'Extension is too new to be authoritative - server data takes precedence',
          }
        );
        // No need to save - projects are already preserved
      } else {
        // Established extension: clear bolt projects to sync deletions
        logger.info('🗑️ Clearing bolt projects for outward sync (no legacy projects found)', {
          removedProjectCount: existingBoltProjects.length,
          removedProjectIds: existingBoltProjects.map((p) => p.id),
          reason: 'Established extension with empty legacy storage - syncing deletions',
        });
        await this.saveLocalProjects([]);
      }
    } else {
      logger.debug('🔄 No legacy projects found, sync not needed');
    }
    return true;
  }

  /**
   * Process legacy projects and convert them to BoltProject format
   */
  private async processLegacyProjects(
    legacyProjects: ProjectSettings,
    existingBoltProjectsMap: Map<string, BoltProject>,
    gitHubSettings: GitHubSettingsInterface
  ): Promise<{
    updatedProjects: BoltProject[];
    newProjects: BoltProject[];
    allBoltProjects: BoltProject[];
  }> {
    const updatedProjects: BoltProject[] = [];
    const newProjects: BoltProject[] = [];
    const allBoltProjects: BoltProject[] = [];

    for (const projectId of Object.keys(legacyProjects)) {
      const legacyProject = legacyProjects[projectId];

      // Skip github.com projects - these are temporary import projects that shouldn't be synced
      if (legacyProject.repoName === 'github.com') {
        logger.debug(`🚫 Skipping github.com project during sync: ${projectId}`, {
          projectId,
          repoName: legacyProject.repoName,
          reason: 'Temporary import project - not suitable for sync',
        });
        continue;
      }

      const existingBoltProject = existingBoltProjectsMap.get(projectId);

      if (existingBoltProject) {
        // Update existing project with latest values from projectSettings
        const updatedProject: BoltProject = {
          ...existingBoltProject,
          // ALWAYS use latest values from projectSettings (source of truth)
          project_name: legacyProject.projectTitle || existingBoltProject.project_name || projectId,
          github_repo_name:
            legacyProject.repoName || existingBoltProject.github_repo_name || projectId,
          github_repo_owner: gitHubSettings.repoOwner || existingBoltProject.github_repo_owner,
          github_branch: legacyProject.branch || existingBoltProject.github_branch || 'main',
          is_private: legacyProject.is_private ?? existingBoltProject.is_private ?? true,
          last_modified: new Date().toISOString(),
          // Enhanced metadata fields from projectSettings
          project_description: legacyProject.description || existingBoltProject.project_description,
          github_repo_url: legacyProject.github_repo_url || existingBoltProject.github_repo_url,
          // Update local compatibility fields
          repoName: legacyProject.repoName || projectId,
          branch: legacyProject.branch || 'main',
        };
        updatedProjects.push(updatedProject);
        allBoltProjects.push(updatedProject);
      } else {
        // Create new project (migration)
        const newProject: BoltProject = {
          id: projectId, // Local extension field
          bolt_project_id: projectId, // Backend field
          project_name: legacyProject.projectTitle || projectId, // Backend field
          github_repo_name: legacyProject.repoName || projectId, // Backend field
          github_repo_owner: gitHubSettings.repoOwner || undefined, // Backend field
          github_branch: legacyProject.branch || 'main', // Backend field (was 'branch')
          is_private: legacyProject.is_private ?? true, // Backend field - from projectSettings or default to true for new repos
          last_modified: new Date().toISOString(), // Backend field
          // Enhanced metadata fields from projectSettings
          project_description: legacyProject.description,
          github_repo_url: legacyProject.github_repo_url,
          // Local compatibility fields (for ProjectSetting inheritance)
          repoName: legacyProject.repoName || projectId,
          branch: legacyProject.branch || 'main',
          // Local sync metadata
          version: 1,
          sync_status: 'pending',
        };
        newProjects.push(newProject);
        allBoltProjects.push(newProject);
      }
    }

    return { updatedProjects, newProjects, allBoltProjects };
  }

  /**
   * Handle server-only projects based on sync direction and fresh install status
   */
  private async handleServerOnlyProjects(
    forOutwardSync: boolean,
    existingBoltProjects: BoltProject[],
    legacyProjectIds: string[],
    allBoltProjects: BoltProject[]
  ): Promise<BoltProject[]> {
    const deletedProjects = existingBoltProjects.filter(
      (project) => !legacyProjectIds.includes(project.bolt_project_id)
    );

    if (!forOutwardSync) {
      // For inward sync or general operations: preserve server-only projects
      for (const boltProject of existingBoltProjects) {
        if (!legacyProjectIds.includes(boltProject.bolt_project_id)) {
          // Keep server-only projects in the bolt format
          allBoltProjects.push(boltProject);
        }
      }
      logger.debug('🔄 Preserved server-only projects for non-outward sync', {
        preservedCount: deletedProjects.length,
        preservedProjectIds: deletedProjects.map((p) => p.id),
      });
    } else {
      // For outward sync: check if this is a fresh install
      const isFresh = await this.isFreshInstall();

      if (isFresh) {
        // Fresh install: preserve server projects, don't let empty extension be king yet
        for (const boltProject of existingBoltProjects) {
          if (!legacyProjectIds.includes(boltProject.bolt_project_id)) {
            allBoltProjects.push(boltProject);
          }
        }
        logger.info('🍼 Fresh install detected - preserving server projects during outward sync', {
          preservedCount: deletedProjects.length,
          preservedProjectIds: deletedProjects.map((p) => p.id),
          reason: 'Extension is too new to be authoritative - server data takes precedence',
          totalLegacyProjects: legacyProjectIds.length,
          totalServerProjects: existingBoltProjects.length,
        });
      } else {
        // Established extension: extension is king, remove server-only projects to sync deletions
        logger.info(
          '👑 Established extension is source of truth for outward sync - removing server-only projects',
          {
            removedCount: deletedProjects.length,
            removedProjectIds: deletedProjects.map((p) => p.id),
            reason: 'Projects not found in legacy storage will be deleted from server',
            totalLegacyProjects: legacyProjectIds.length,
          }
        );
      }
    }

    return deletedProjects;
  }

  /**
   * Sync existing projects from old storage format to new sync format
   * This bridges the gap between projectSettings and boltProjects
   * Updates existing projects and migrates new ones
   * @param forOutwardSync - If true, treats extension as source of truth and removes server-only projects
   * IMPORTANT: This is a one-way sync from projectSettings -> boltProjects
   */
  private async syncProjectsFromLegacyFormat(
    forOutwardSync: boolean = false,
    options: { propagateErrors?: boolean } = {}
  ): Promise<void> {
    try {
      // Check if we already have projects in the new format
      const existingBoltProjects = await this.getLocalProjects();

      // Check if existing bolt projects need project_name field update
      const wasUpdated = await this.updateIncompleteProjects(existingBoltProjects);
      if (wasUpdated) {
        return;
      }

      // ALWAYS read fresh projectSettings to ensure we have the latest user changes
      const gitHubSettings = await ChromeStorageService.getGitHubSettings();
      const legacyProjects = gitHubSettings.projectSettings || {};
      const legacyProjectIds = Object.keys(legacyProjects);

      if (legacyProjectIds.length === 0) {
        await this.handleEmptyLegacyProjects(forOutwardSync, existingBoltProjects);
        return;
      }

      // Check for recent changes to ensure we're working with fresh data
      const recentChanges = await this.getRecentProjectChanges();
      if (recentChanges.size > 0) {
        logger.info('📝 Detected recent project changes during legacy sync', {
          recentChangeCount: recentChanges.size,
          recentProjectIds: Array.from(recentChanges.keys()),
        });
      }

      // Create a map of existing bolt projects for easier lookup
      const existingBoltProjectsMap = new Map<string, BoltProject>();
      existingBoltProjects.forEach((project) => {
        existingBoltProjectsMap.set(project.bolt_project_id, project);
      });

      // Process all legacy projects - update existing ones and create new ones
      const { updatedProjects, newProjects, allBoltProjects } = await this.processLegacyProjects(
        legacyProjects,
        existingBoltProjectsMap,
        gitHubSettings
      );

      // Handle server-only projects based on sync direction
      const deletedProjects = await this.handleServerOnlyProjects(
        forOutwardSync,
        existingBoltProjects,
        legacyProjectIds,
        allBoltProjects
      );

      // Save all projects to new format
      await this.saveLocalProjects(allBoltProjects);

      const syncDirectionLabel = forOutwardSync
        ? (await this.isFreshInstall())
          ? 'outward (fresh install - server preserved)'
          : 'outward (established extension is king)'
        : 'general (preserve server)';

      const serverProjectsHandling = forOutwardSync
        ? (await this.isFreshInstall())
          ? 'preserved (fresh install protection)'
          : 'removed for deletion sync'
        : 'preserved';

      logger.info('✅ Successfully synced legacy projects to bolt format', {
        syncDirection: syncDirectionLabel,
        totalLegacyProjects: legacyProjectIds.length,
        previousBoltProjects: existingBoltProjects.length,
        updatedCount: updatedProjects.length,
        newlyMigratedCount: newProjects.length,
        deletedFromLegacy: deletedProjects.length,
        totalBoltProjects: allBoltProjects.length,
        updatedProjectIds: updatedProjects.map((p) => p.id),
        newProjectIds: newProjects.map((p) => p.id),
        handledServerProjects: serverProjectsHandling,
      });
    } catch (error) {
      logger.error('💥 Failed to sync projects from legacy format', {
        error,
        forOutwardSync,
        context: 'Error occurred during legacy format sync',
      });

      if (options?.propagateErrors) {
        throw new Error(
          `Legacy format sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
      // Otherwise, don't throw - sync failure shouldn't block the main operation
    }
  }

  /**
   * Perform outward sync (extension to server)
   * Only syncs if user is authenticated
   */
  async performOutwardSync(): Promise<SyncResponse | null> {
    logger.info('🔄 Starting outward sync operation');

    // First, sync projects from legacy format to ensure we have latest data
    await this.syncProjectsFromLegacyFormat(true, { propagateErrors: false });

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
      const result = await this.syncWithBackend('auto-resolve', false);

      // Do NOT sync back to active storage during outward sync
      // The extension data is the source of truth and should not be overwritten
      // await this.syncBackToActiveStorage();

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
   * Implements race condition prevention by checking for recent user changes
   * @param options - Options for error handling
   */
  private async syncBackToActiveStorage(
    options: { propagateErrors?: boolean } = {}
  ): Promise<void> {
    try {
      const boltProjects = await this.getLocalProjects();

      if (boltProjects.length === 0) {
        logger.debug('🔄 No bolt projects to sync back to active storage');
        return;
      }

      // Check for recent user changes to prevent race conditions
      const recentChanges = await this.getRecentProjectChanges();
      const hasRecentChanges = recentChanges.size > 0;

      if (hasRecentChanges) {
        logger.info('⏸️ Detected recent user changes, using merge strategy for sync back', {
          recentChangeCount: recentChanges.size,
          recentProjectIds: Array.from(recentChanges.keys()),
        });
      }

      logger.info('🔄 Syncing bolt projects back to active storage format', {
        projectCount: boltProjects.length,
        projectIds: boltProjects.map((p) => p.id),
        mergeMode: hasRecentChanges,
      });

      // Get current active storage
      const gitHubSettings = await ChromeStorageService.getGitHubSettings();
      const updatedProjectSettings = { ...gitHubSettings.projectSettings };

      // Convert bolt projects back to project settings format with merge logic
      for (const boltProject of boltProjects) {
        const projectId = boltProject.bolt_project_id;
        const hasRecentChange = recentChanges.has(projectId);

        if (hasRecentChange) {
          // Preserve recent user changes for this project
          const recentChange = recentChanges.get(projectId)!;
          logger.debug(`🛡️ Preserving recent user changes for project ${projectId}`, {
            userValues: recentChange,
            serverValues: {
              repoName: boltProject.github_repo_name,
              branch: boltProject.github_branch,
              projectTitle: boltProject.project_name,
            },
          });
          // Skip updating this project to preserve user changes
          continue;
        }

        // No recent changes, safe to update from bolt project
        updatedProjectSettings[projectId] = {
          repoName:
            boltProject.github_repo_name || boltProject.repoName || boltProject.bolt_project_id,
          branch: boltProject.github_branch || boltProject.branch || 'main',
          projectTitle: boltProject.project_name || boltProject.bolt_project_id,
          is_private: boltProject.is_private,
          // Include any additional metadata fields that might be in the enhanced format
          ...(gitHubSettings.projectSettings?.[projectId] && {
            language: gitHubSettings.projectSettings[projectId].language,
            description: gitHubSettings.projectSettings[projectId].description,
            commit_count: gitHubSettings.projectSettings[projectId].commit_count,
            latest_commit_date: gitHubSettings.projectSettings[projectId].latest_commit_date,
            latest_commit_message: gitHubSettings.projectSettings[projectId].latest_commit_message,
            latest_commit_sha: gitHubSettings.projectSettings[projectId].latest_commit_sha,
            latest_commit_author: gitHubSettings.projectSettings[projectId].latest_commit_author,
            open_issues_count: gitHubSettings.projectSettings[projectId].open_issues_count,
            github_updated_at: gitHubSettings.projectSettings[projectId].github_updated_at,
            default_branch: gitHubSettings.projectSettings[projectId].default_branch,
            github_repo_url: gitHubSettings.projectSettings[projectId].github_repo_url,
            metadata_last_updated: gitHubSettings.projectSettings[projectId].metadata_last_updated,
          }),
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
        preservedProjects: Array.from(recentChanges.keys()),
      });
    } catch (error) {
      logger.error('💥 Failed to sync back to active storage format', {
        error,
        context: 'Error occurred during bolt projects sync back to active storage',
      });

      if (options?.propagateErrors) {
        throw new Error(
          `Active storage sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
      // Otherwise, don't throw - reverse sync failure shouldn't block the main sync operation
    }
  }

  /**
   * Get recent project changes from storage to detect potential race conditions
   * Returns a map of projectId -> recent change data for changes within the last 30 seconds
   */
  private async getRecentProjectChanges(): Promise<Map<string, any>> {
    const recentChanges = new Map<string, any>();
    const RECENT_CHANGE_THRESHOLD = 30000; // 30 seconds

    try {
      // Check for the lastSettingsUpdate timestamp
      const result = await chrome.storage.local.get(['lastSettingsUpdate', 'recentProjectChanges']);
      const now = Date.now();

      // Check single project update (from RepoSettings save)
      if (result.lastSettingsUpdate) {
        const { timestamp, projectId, repoName, branch, projectTitle } = result.lastSettingsUpdate;
        const age = now - timestamp;

        if (
          typeof timestamp === 'number' &&
          timestamp > 0 &&
          age < RECENT_CHANGE_THRESHOLD &&
          projectId
        ) {
          recentChanges.set(projectId, {
            repoName,
            branch,
            projectTitle,
            timestamp,
            age: Math.round(age / 1000),
          });

          logger.debug(`🕒 Found recent change for project ${projectId}`, {
            age: `${Math.round(age / 1000)}s`,
            data: { repoName, branch, projectTitle },
          });
        }
      }

      // Check for multiple project updates (future enhancement)
      if (result.recentProjectChanges && Array.isArray(result.recentProjectChanges)) {
        for (const change of result.recentProjectChanges) {
          const age = now - change.timestamp;
          if (age < RECENT_CHANGE_THRESHOLD && change.projectId) {
            recentChanges.set(change.projectId, {
              ...change,
              age: Math.round(age / 1000),
            });
          }
        }
      }

      return recentChanges;
    } catch (error) {
      logger.warn('Failed to check for recent project changes', { error });
      return recentChanges;
    }
  }

  /**
   * Perform inward sync (server to extension)
   * Only syncs if conditions are met (empty or single project)
   * IMPORTANT: This ADDS server projects to existing local projects (does not replace)
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
      // First, sync projects from legacy format to ensure we have latest local data
      await this.syncProjectsFromLegacyFormat(false);

      logger.info('⬇️ Performing inward sync from server', {
        isAuthenticated: authState.isAuthenticated,
      });

      // Get server projects but DON'T update local storage yet
      const result = await this.syncWithBackend('keep-remote', false);

      if (result.success && result.updatedProjects && result.updatedProjects.length > 0) {
        // Merge server projects with existing local projects
        await this.addServerProjectsToLocal(result.updatedProjects);

        logger.info('✅ Added server projects to local storage', {
          serverProjectCount: result.updatedProjects.length,
          serverProjectIds: result.updatedProjects.map((p) => p.bolt_project_id),
        });
      }

      // Sync back to active storage format (reverse bridge)
      await this.syncBackToActiveStorage({ propagateErrors: false });

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

  /**
   * Add server projects to existing local projects (merge, don't replace)
   * Handles duplicates by preferring server data for existing projects
   */
  private async addServerProjectsToLocal(serverProjects: BoltProject[]): Promise<void> {
    try {
      const existingLocalProjects = await this.getLocalProjects();
      const mergedProjects = new Map<string, BoltProject>();

      // Add existing local projects first
      for (const localProject of existingLocalProjects) {
        mergedProjects.set(localProject.bolt_project_id, localProject);
      }

      // Add/merge server projects (server data takes precedence for duplicates)
      for (const serverProject of serverProjects) {
        const projectId = serverProject.bolt_project_id;
        const existingProject = mergedProjects.get(projectId);

        if (existingProject) {
          // Merge: preserve local ID but use server data
          const mergedProject: BoltProject = {
            ...serverProject,
            id: existingProject.id, // Keep local ID for consistency
            repoName: serverProject.github_repo_name || existingProject.repoName,
            branch: serverProject.github_branch || existingProject.branch,
          };
          mergedProjects.set(projectId, mergedProject);

          logger.debug(`🔀 Merged server project with existing local project: ${projectId}`);
        } else {
          // Add: new server project
          const newProject: BoltProject = {
            ...serverProject,
            id: serverProject.bolt_project_id, // Use server ID for new projects
            repoName: serverProject.github_repo_name || serverProject.bolt_project_id,
            branch: serverProject.github_branch || 'main',
          };
          mergedProjects.set(projectId, newProject);

          logger.debug(`➕ Added new server project: ${projectId}`);
        }
      }

      const finalProjects = Array.from(mergedProjects.values());
      await this.saveLocalProjects(finalProjects);

      logger.info('✅ Successfully merged server projects with local projects', {
        originalLocalCount: existingLocalProjects.length,
        serverProjectCount: serverProjects.length,
        finalProjectCount: finalProjects.length,
        addedProjects: serverProjects.filter(
          (sp) => !existingLocalProjects.some((lp) => lp.bolt_project_id === sp.bolt_project_id)
        ).length,
        updatedProjects: serverProjects.filter((sp) =>
          existingLocalProjects.some((lp) => lp.bolt_project_id === sp.bolt_project_id)
        ).length,
      });
    } catch (error) {
      logger.error('💥 Failed to add server projects to local storage', { error });
      throw error;
    }
  }
}
