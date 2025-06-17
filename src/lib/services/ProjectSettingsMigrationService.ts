import { ChromeStorageService } from './chromeStorage';
import { GitHubCacheService } from './GitHubCacheService';
import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
import { createLogger } from '../utils/logger';

const logger = createLogger('ProjectSettingsMigration');

/**
 * Service for migrating existing projectSettings to include GitHub metadata
 */
export class ProjectSettingsMigrationService {
  private static readonly MIGRATION_VERSION_KEY = 'projectSettings_migration_version';
  private static readonly CURRENT_MIGRATION_VERSION = 1;

  /**
   * Check if migration is needed
   */
  static async needsMigration(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get([this.MIGRATION_VERSION_KEY]);
      const currentVersion = result[this.MIGRATION_VERSION_KEY] || 0;

      return currentVersion < this.CURRENT_MIGRATION_VERSION;
    } catch (error) {
      logger.error('Error checking migration status:', error);
      return true; // Err on the side of caution
    }
  }

  /**
   * Get migration statistics
   */
  static async getMigrationStats(): Promise<{
    totalProjects: number;
    projectsWithMetadata: number;
    projectsNeedingMigration: number;
  }> {
    try {
      const githubSettings = await ChromeStorageService.getGitHubSettings();
      const projectSettings = githubSettings.projectSettings || {};

      const totalProjects = Object.keys(projectSettings).length;
      let projectsWithMetadata = 0;

      for (const [, settings] of Object.entries(projectSettings)) {
        if (settings.metadata_last_updated) {
          projectsWithMetadata++;
        }
      }

      return {
        totalProjects,
        projectsWithMetadata,
        projectsNeedingMigration: totalProjects - projectsWithMetadata,
      };
    } catch (error) {
      logger.error('Error getting migration stats:', error);
      return { totalProjects: 0, projectsWithMetadata: 0, projectsNeedingMigration: 0 };
    }
  }

  /**
   * Migrate all existing projectSettings to include GitHub metadata
   */
  static async migrateProjectSettings(
    progressCallback?: (progress: {
      completed: number;
      total: number;
      currentProject: string;
    }) => void
  ): Promise<{
    success: boolean;
    migratedCount: number;
    failedCount: number;
    errors: string[];
  }> {
    logger.info('Starting projectSettings migration');

    const errors: string[] = [];
    let migratedCount = 0;
    let failedCount = 0;

    try {
      // Get current authentication method and settings
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      const githubSettings = await ChromeStorageService.getGitHubSettings();
      const projectSettings = githubSettings.projectSettings || {};
      const repoOwner = githubSettings.repoOwner;

      if (!repoOwner) {
        throw new Error('No repository owner configured');
      }

      // Create GitHub service
      let githubService: UnifiedGitHubService;
      if (authMethod === 'github_app') {
        githubService = new UnifiedGitHubService({ type: 'github_app' });
      } else {
        githubService = new UnifiedGitHubService(githubSettings.githubToken);
      }

      const projectEntries = Object.entries(projectSettings);
      const totalProjects = projectEntries.length;

      logger.info(`Found ${totalProjects} projects to migrate`);

      for (let i = 0; i < projectEntries.length; i++) {
        const [projectId, settings] = projectEntries[i];

        try {
          // Report progress
          if (progressCallback) {
            progressCallback({
              completed: i,
              total: totalProjects,
              currentProject: settings.repoName,
            });
          }

          // Skip if already has metadata
          if (settings.metadata_last_updated) {
            logger.info(`Project ${projectId} already has metadata, skipping`);
            continue;
          }

          logger.info(`Migrating project ${projectId} (${settings.repoName})`);

          // First try to get from cache
          let repoData = await GitHubCacheService.getRepoMetadata(repoOwner, settings.repoName);

          if (
            !repoData ||
            (await GitHubCacheService.isRepoMetadataStale(repoOwner, settings.repoName))
          ) {
            // Fetch fresh data from GitHub API
            const repoInfo = await githubService.getRepoInfo(repoOwner, settings.repoName);

            if (!repoInfo.exists) {
              logger.warn(`Repository ${settings.repoName} does not exist, skipping migration`);
              continue;
            }

            // Get commit count
            let commitCount: number | undefined;
            try {
              commitCount = await githubService.getCommitCount(
                repoOwner,
                settings.repoName,
                settings.branch
              );
            } catch (commitError) {
              logger.warn(`Could not fetch commit count for ${settings.repoName}:`, commitError);
            }

            // Get latest commit
            let latestCommit:
              | {
                  sha: string;
                  message: string;
                  date: string;
                  author: string;
                }
              | undefined;

            try {
              const commits = await githubService.request(
                'GET',
                `/repos/${repoOwner}/${settings.repoName}/commits?per_page=1`
              );
              if (commits[0]?.commit) {
                latestCommit = {
                  sha: commits[0].sha,
                  message: commits[0].commit.message,
                  date: commits[0].commit.committer.date,
                  author: commits[0].commit.author.name,
                };
              }
            } catch (commitError) {
              logger.warn(`Could not fetch latest commit for ${settings.repoName}:`, commitError);
            }

            // Create enhanced repo data
            repoData = GitHubCacheService.createEnhancedRepo(
              {
                name: settings.repoName,
                private: repoInfo.private,
                description: repoInfo.description,
                language: repoInfo.language,
                html_url: `https://github.com/${repoOwner}/${settings.repoName}`,
                created_at: repoInfo.created_at,
                updated_at: repoInfo.updated_at,
                default_branch: repoInfo.default_branch || 'main',
                open_issues_count: repoInfo.open_issues_count || 0,
              },
              commitCount,
              latestCommit
            );

            // Cache the data
            await GitHubCacheService.cacheRepoMetadata(repoOwner, settings.repoName, repoData);
          }

          // Update project settings with GitHub metadata
          await ChromeStorageService.updateProjectMetadata(projectId, {
            is_private: repoData.private,
            language: repoData.language || undefined,
            description: repoData.description || undefined,
            commit_count: repoData.commit_count,
            latest_commit_date: repoData.latest_commit?.date,
            latest_commit_message: repoData.latest_commit?.message,
            latest_commit_sha: repoData.latest_commit?.sha,
            latest_commit_author: repoData.latest_commit?.author,
            open_issues_count: repoData.open_issues_count,
            github_updated_at: repoData.updated_at,
            default_branch: repoData.default_branch,
            github_repo_url: repoData.html_url,
          });

          migratedCount++;
          logger.info(`Successfully migrated project ${projectId}`);

          // Add a small delay to avoid hitting rate limits
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          failedCount++;
          const errorMessage = `Failed to migrate project ${projectId}: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMessage);
          errors.push(errorMessage);
        }
      }

      // Mark migration as completed
      await chrome.storage.local.set({
        [this.MIGRATION_VERSION_KEY]: this.CURRENT_MIGRATION_VERSION,
        migration_completed_at: new Date().toISOString(),
      });

      // Final progress update
      if (progressCallback) {
        progressCallback({
          completed: totalProjects,
          total: totalProjects,
          currentProject: 'Migration completed',
        });
      }

      logger.info(`Migration completed: ${migratedCount} migrated, ${failedCount} failed`);

      return {
        success: failedCount === 0,
        migratedCount,
        failedCount,
        errors,
      };
    } catch (error) {
      logger.error('Migration failed:', error);
      return {
        success: false,
        migratedCount,
        failedCount: failedCount + 1,
        errors: [
          ...errors,
          `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  }

  /**
   * Migrate a single project
   */
  static async migrateSingleProject(
    projectId: string,
    repoOwner: string,
    _githubService: UnifiedGitHubService
  ): Promise<boolean> {
    try {
      const projectSettings = await ChromeStorageService.getProjectSettingsWithMetadata(projectId);

      if (!projectSettings) {
        logger.warn(`Project ${projectId} not found`);
        return false;
      }

      if (projectSettings.metadata_last_updated) {
        logger.info(`Project ${projectId} already has metadata`);
        return true;
      }

      logger.info(`Migrating single project ${projectId} (${projectSettings.repoName})`);

      // Sync with GitHub cache
      await ChromeStorageService.syncProjectWithGitHubCache(
        projectId,
        repoOwner,
        projectSettings.repoName
      );

      logger.info(`Successfully migrated project ${projectId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to migrate project ${projectId}:`, error);
      return false;
    }
  }

  /**
   * Reset migration status (for testing)
   */
  static async resetMigrationStatus(): Promise<void> {
    try {
      await chrome.storage.local.remove([this.MIGRATION_VERSION_KEY, 'migration_completed_at']);
      logger.info('Migration status reset');
    } catch (error) {
      logger.error('Error resetting migration status:', error);
    }
  }

  /**
   * Check if a specific project needs migration
   */
  static async projectNeedsMigration(projectId: string): Promise<boolean> {
    try {
      const projectSettings = await ChromeStorageService.getProjectSettingsWithMetadata(projectId);
      return !projectSettings?.metadata_last_updated;
    } catch (error) {
      logger.error(`Error checking if project ${projectId} needs migration:`, error);
      return true;
    }
  }
}
