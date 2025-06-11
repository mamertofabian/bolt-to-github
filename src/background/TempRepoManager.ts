import type { UnifiedGitHubService } from '../services/UnifiedGitHubService';
import type { UploadStatusState } from '../lib/types';
import { OperationStateManager } from '../content/services/OperationStateManager';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('TempRepoManager');

export const STORAGE_KEY = 'bolt_temp_repos';

interface TempRepoMetadata {
  originalRepo: string;
  tempRepo: string;
  createdAt: number;
  owner: string;
  branch: string;
}

export class BackgroundTempRepoManager {
  private static CLEANUP_INTERVAL = 30 * 1000; // 30 seconds
  private static MAX_AGE = 60 * 1000; // 60 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;
  private operationStateManager: OperationStateManager;

  constructor(
    private githubService: UnifiedGitHubService,
    private owner: string,
    private broadcastStatus: (status: UploadStatusState) => void
  ) {
    this.operationStateManager = OperationStateManager.getInstance();
    // Start cleanup interval only if there are existing temp repos
    this.initializeCleanup();
  }

  private async initializeCleanup(): Promise<void> {
    const tempRepos = await this.getTempRepos();
    logger.info(
      `🔍 TempRepoManager: Found ${tempRepos.length} temporary repositories on initialization`
    );
    if (tempRepos.length > 0) {
      logger.info('⏰ TempRepoManager: Starting cleanup interval');
      this.startCleanupInterval();
    }
  }

  async handlePrivateRepoImport(sourceRepo: string, branch?: string): Promise<void> {
    // Generate unique operation ID for this import
    const operationId = `import-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    let tempRepoName: string | undefined;

    try {
      // Start tracking the import operation
      await this.operationStateManager.startOperation(
        'import',
        operationId,
        `Importing private repository: ${sourceRepo}`,
        { sourceRepo, branch }
      );

      this.broadcastStatus({
        status: 'uploading',
        message: 'Creating temporary repository...',
        progress: 10,
      });

      // First, determine the default branch if none is provided
      let branchToUse: string = branch || 'main';
      if (!branch) {
        try {
          const branches = await this.githubService.listBranches(this.owner, sourceRepo);
          const defaultBranch = branches.find(
            (b: { name: string; isDefault: boolean }) => b.isDefault
          );
          branchToUse = defaultBranch ? defaultBranch.name : 'main';
          logger.info(`Using detected default branch: ${branchToUse}`);
        } catch (error) {
          logger.warn('Failed to detect default branch, falling back to main:', error);
          branchToUse = 'main';
        }
      }

      tempRepoName = await this.githubService.createTemporaryPublicRepo(
        this.owner,
        sourceRepo,
        branchToUse
      );
      await this.saveTempRepo(sourceRepo, tempRepoName, branchToUse);

      this.broadcastStatus({
        status: 'uploading',
        message: `Copying repository contents from branch '${branchToUse}'...`,
        progress: 30,
      });

      await this.githubService.cloneRepoContents(
        this.owner,
        sourceRepo,
        this.owner,
        tempRepoName,
        branchToUse,
        (progress) => {
          this.broadcastStatus({
            status: 'uploading',
            message: `Copying repository contents from branch '${branchToUse}'...`,
            progress: Math.floor(30 + progress * 0.4), // Adjust progress to fit within 30-70 range
          });
        }
      );

      this.broadcastStatus({
        status: 'uploading',
        message: 'Making repository public...',
        progress: 70,
      });

      // Make repo public only after content is copied
      await this.githubService.updateRepoVisibility(this.owner, tempRepoName, false);

      this.broadcastStatus({
        status: 'uploading',
        message: 'Opening Bolt...',
        progress: 90,
      });

      // Open Bolt in new tab
      chrome.tabs.create({
        url: `https://bolt.new/~/github.com/${this.owner}/${tempRepoName}`,
        active: true, // Focus the new tab
      });

      this.broadcastStatus({
        status: 'success',
        message: 'Repository imported successfully',
        progress: 100,
      });

      // Mark operation as completed
      await this.operationStateManager.completeOperation(operationId);

      // Start cleanup interval if not already running
      if (!this.cleanupInterval) {
        this.startCleanupInterval();
      }
    } catch (error) {
      logger.error('Failed to import private repository:', error);

      // Mark operation as failed
      await this.operationStateManager.failOperation(
        operationId,
        error instanceof Error ? error : new Error('Unknown error')
      );

      this.broadcastStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to import repository',
        progress: 100,
      });
    }
  }

  private async saveTempRepo(
    originalRepo: string,
    tempRepo: string,
    branch: string
  ): Promise<void> {
    const tempRepos = await this.getTempRepos();
    const newRepo = {
      originalRepo,
      tempRepo,
      createdAt: Date.now(),
      owner: this.owner,
      branch,
    };
    tempRepos.push(newRepo);
    await chrome.storage.local.set({
      [STORAGE_KEY]: tempRepos,
    });
    logger.info(
      `💾 TempRepoManager: Saved temporary repo ${tempRepo} (created at ${new Date(newRepo.createdAt).toISOString()})`
    );
  }

  async getTempRepos(): Promise<TempRepoMetadata[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  }

  async cleanupTempRepos(forceCleanUp?: boolean): Promise<void> {
    const tempRepos = await this.getTempRepos();
    const now = Date.now();
    const remaining = [];

    logger.info(
      `🧹 TempRepoManager: Cleanup check - found ${tempRepos.length} repositories${forceCleanUp ? ' (forced)' : ''}`
    );

    for (const repo of tempRepos) {
      const age = now - repo.createdAt;
      const shouldDelete = forceCleanUp || age > BackgroundTempRepoManager.MAX_AGE;

      if (shouldDelete) {
        try {
          logger.info(
            `🗑️ TempRepoManager: Deleting temporary repo ${repo.tempRepo} (age: ${Math.floor(age / 1000)}s, max: ${BackgroundTempRepoManager.MAX_AGE / 1000}s)`
          );
          await this.githubService.deleteRepo(repo.owner, repo.tempRepo);
          logger.info(`✅ TempRepoManager: Successfully deleted ${repo.tempRepo}`);
        } catch (error) {
          logger.error(
            `❌ TempRepoManager: Failed to delete temporary repo ${repo.tempRepo}:`,
            error
          );
          // Keep failed deletions in the list for retry
          remaining.push(repo);
        }
      } else {
        logger.info(
          `⏳ TempRepoManager: Keeping ${repo.tempRepo} (age: ${Math.floor(age / 1000)}s, max: ${BackgroundTempRepoManager.MAX_AGE / 1000}s)`
        );
        remaining.push(repo);
      }
    }

    await chrome.storage.local.set({
      [STORAGE_KEY]: remaining,
    });

    logger.info(
      `📊 TempRepoManager: Cleanup complete - ${tempRepos.length - remaining.length} deleted, ${remaining.length} remaining`
    );

    // Only stop the cleanup interval if there are no more repos to clean up
    if (remaining.length === 0) {
      logger.info('🛑 TempRepoManager: No more temporary repos - stopping cleanup interval');
      this.stopCleanupInterval();
    }
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      logger.info('⚠️  TempRepoManager: Cleanup interval already running');
      return;
    }

    logger.info(
      `⏰ TempRepoManager: Starting cleanup interval (every ${BackgroundTempRepoManager.CLEANUP_INTERVAL / 1000}s)`
    );
    this.cleanupInterval = setInterval(
      () => this.cleanupTempRepos(),
      BackgroundTempRepoManager.CLEANUP_INTERVAL
    );
  }

  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      logger.info('🛑 TempRepoManager: Stopping cleanup interval');
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
