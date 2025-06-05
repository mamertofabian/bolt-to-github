import { GitHubService } from '../services/GitHubService';
import type { UploadStatusState } from '../lib/types';
import { OperationStateManager } from '../content/services/OperationStateManager';

export const STORAGE_KEY = 'bolt_temp_repos';

interface TempRepoMetadata {
  originalRepo: string;
  tempRepo: string;
  createdAt: number;
  owner: string;
  branch: string;
  // ✅ NEW: Enhanced metadata for better tracking
  authMethod?: 'pat' | 'github_app' | 'unknown';
  operationId?: string;
}

export class BackgroundTempRepoManager {
  private static CLEANUP_INTERVAL = 30 * 1000; // 30 seconds
  private static MAX_AGE = 60 * 1000; // 60 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;
  private operationStateManager: OperationStateManager;

  // ✅ NEW: Track authentication status for better error handling
  private lastAuthStatus: {
    currentAuth: 'pat' | 'github_app' | 'unknown' | null;
    rateLimits?: any;
  } | null = null;

  constructor(
    private githubService: GitHubService,
    private owner: string,
    private broadcastStatus: (status: UploadStatusState) => void
  ) {
    this.operationStateManager = OperationStateManager.getInstance();
    this.lastAuthStatus = null;
    // Start cleanup interval only if there are existing temp repos
    this.initializeCleanup();
  }

  private async initializeCleanup(): Promise<void> {
    const tempRepos = await this.getTempRepos();
    console.log(
      `🔍 TempRepoManager: Found ${tempRepos.length} temporary repositories on initialization`
    );

    // ✅ NEW: Update auth status on initialization
    await this.updateAuthStatus();

    if (tempRepos.length > 0) {
      console.log('⏰ TempRepoManager: Starting cleanup interval');
      this.startCleanupInterval();
    }
  }

  // ✅ NEW: Track authentication status for better operations
  private async updateAuthStatus(): Promise<void> {
    try {
      this.lastAuthStatus = await this.githubService.getAuthStatus();
      console.log(`🔐 TempRepoManager: Auth status updated - ${this.lastAuthStatus?.currentAuth}`);
    } catch (error) {
      console.warn('Failed to update auth status:', error);
      this.lastAuthStatus = { currentAuth: 'unknown' };
    }
  }

  async handlePrivateRepoImport(sourceRepo: string, branch?: string): Promise<void> {
    // Generate unique operation ID for this import
    const operationId = `import-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    let tempRepoName: string | undefined;

    try {
      // ✅ ENHANCED: Update auth status before operation
      await this.updateAuthStatus();

      // Start tracking the import operation with auth context
      await this.operationStateManager.startOperation(
        'import',
        operationId,
        `Importing private repository: ${sourceRepo}`,
        {
          sourceRepo,
          branch,
          authMethod: this.lastAuthStatus?.currentAuth || 'unknown',
        }
      );

      this.broadcastStatus({
        status: 'uploading',
        message: 'Creating temporary repository...',
        progress: 10,
      });

      // ✅ ENHANCED: Better branch detection with error handling
      let branchToUse: string = branch || 'main';
      if (!branch) {
        try {
          console.log(`🔍 Detecting default branch for ${sourceRepo}...`);

          // ✅ UPDATED: Use new GitHubService method for listing branches
          const branches = await this.githubService.listBranches(this.owner, sourceRepo);

          const defaultBranch = branches.find(
            (b: { name: string; default?: boolean }) =>
              b.default || b.name === 'main' || b.name === 'master'
          );

          branchToUse = defaultBranch ? defaultBranch.name : 'main';
          console.log(`✅ Using detected default branch: ${branchToUse}`);
        } catch (error) {
          console.warn('Failed to detect default branch, falling back to main:', error);
          branchToUse = 'main';
        }
      }

      // ✅ UPDATED: Enhanced temporary repo creation with auth method tracking
      console.log(
        `🏗️ Creating temporary public repo for ${sourceRepo} (branch: ${branchToUse})...`
      );

      tempRepoName = await this.createTemporaryPublicRepo(sourceRepo, branchToUse);

      await this.saveTempRepo(sourceRepo, tempRepoName, branchToUse, operationId);

      this.broadcastStatus({
        status: 'uploading',
        message: `Copying repository contents from branch '${branchToUse}'...`,
        progress: 30,
      });

      // ✅ UPDATED: Enhanced repo cloning with better progress tracking
      await this.cloneRepositoryContents(sourceRepo, tempRepoName, branchToUse, (progress) => {
        this.broadcastStatus({
          status: 'uploading',
          message: `Copying repository contents from branch '${branchToUse}'... (${Math.floor(progress)}%)`,
          progress: Math.floor(30 + progress * 0.4), // Adjust progress to fit within 30-70 range
        });
      });

      this.broadcastStatus({
        status: 'uploading',
        message: 'Making repository public...',
        progress: 70,
      });

      // ✅ UPDATED: Enhanced visibility update
      console.log(`🌐 Making ${tempRepoName} public...`);
      await this.updateRepositoryVisibility(tempRepoName, false);

      this.broadcastStatus({
        status: 'uploading',
        message: 'Opening Bolt...',
        progress: 90,
      });

      // Open Bolt in new tab
      const boltUrl = `https://bolt.new/~/github.com/${this.owner}/${tempRepoName}`;
      console.log(`🚀 Opening Bolt with URL: ${boltUrl}`);

      chrome.tabs.create({
        url: boltUrl,
        active: true, // Focus the new tab
      });

      this.broadcastStatus({
        status: 'success',
        message: 'Repository imported successfully',
        progress: 100,
      });

      // Mark operation as completed
      await this.operationStateManager.completeOperation(operationId);

      console.log(`✅ Private repo import completed: ${sourceRepo} -> ${tempRepoName}`);

      // Start cleanup interval if not already running
      if (!this.cleanupInterval) {
        this.startCleanupInterval();
      }
    } catch (error) {
      console.error('Failed to import private repository:', error);

      // ✅ ENHANCED: Better error handling with auth context
      const errorMessage = this.getEnhancedErrorMessage(error);

      // Mark operation as failed
      await this.operationStateManager.failOperation(
        operationId,
        error instanceof Error ? error : new Error(errorMessage)
      );

      this.broadcastStatus({
        status: 'error',
        message: errorMessage,
        progress: 100,
      });

      // ✅ NEW: Cleanup failed temp repo if it was created
      if (tempRepoName) {
        try {
          console.log(`🧹 Cleaning up failed temp repo: ${tempRepoName}`);
          await this.deleteRepository(tempRepoName);
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp repo after error:', cleanupError);
        }
      }
    }
  }

  // ✅ NEW: Enhanced temporary repo creation
  private async createTemporaryPublicRepo(sourceRepo: string, branch: string): Promise<string> {
    try {
      // Generate unique temp repo name
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const tempRepoName = `temp-${sourceRepo}-${timestamp}-${randomSuffix}`;

      console.log(`🏗️ Creating temporary repo: ${tempRepoName}`);

      // ✅ UPDATED: Use GitHubService direct API call for repo creation
      await this.githubService.request('POST', '/user/repos', {
        name: tempRepoName,
        description: `Temporary public copy of ${this.owner}/${sourceRepo} for Bolt import`,
        private: false,
        auto_init: false,
      });

      return tempRepoName;
    } catch (error) {
      throw new Error(
        `Failed to create temporary repository: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ✅ NEW: Enhanced repository content cloning
  private async cloneRepositoryContents(
    sourceRepo: string,
    tempRepo: string,
    branch: string,
    progressCallback: (progress: number) => void
  ): Promise<void> {
    try {
      console.log(`📋 Cloning contents from ${sourceRepo}:${branch} to ${tempRepo}`);

      // Get source repository contents
      progressCallback(10);

      const sourceContents = await this.githubService.request(
        'GET',
        `/repos/${this.owner}/${sourceRepo}/contents`,
        { ref: branch }
      );

      if (!Array.isArray(sourceContents)) {
        throw new Error('Failed to retrieve repository contents');
      }

      progressCallback(30);

      // Process contents in batches for better performance
      const batchSize = 10;
      const totalItems = sourceContents.length;

      for (let i = 0; i < sourceContents.length; i += batchSize) {
        const batch = sourceContents.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (item: any) => {
            if (item.type === 'file') {
              try {
                // Get file content
                const fileContent = await this.githubService.request(
                  'GET',
                  `/repos/${this.owner}/${sourceRepo}/contents/${item.path}`,
                  { ref: branch }
                );

                // Create file in temp repo
                await this.githubService.request(
                  'PUT',
                  `/repos/${this.owner}/${tempRepo}/contents/${item.path}`,
                  {
                    message: `Copy ${item.path} from ${sourceRepo}`,
                    content: fileContent.content,
                    encoding: fileContent.encoding,
                  }
                );
              } catch (error) {
                console.warn(`Failed to copy file ${item.path}:`, error);
                // Continue with other files even if one fails
              }
            }
          })
        );

        // Update progress
        const progress = 30 + ((i + batchSize) / totalItems) * 60;
        progressCallback(Math.min(progress, 90));
      }

      progressCallback(100);
      console.log(`✅ Repository contents cloned successfully`);
    } catch (error) {
      throw new Error(
        `Failed to clone repository contents: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ✅ NEW: Enhanced repository visibility update
  private async updateRepositoryVisibility(repoName: string, isPrivate: boolean): Promise<void> {
    try {
      await this.githubService.request('PATCH', `/repos/${this.owner}/${repoName}`, {
        private: isPrivate,
      });

      console.log(
        `✅ Repository ${repoName} visibility updated to ${isPrivate ? 'private' : 'public'}`
      );
    } catch (error) {
      throw new Error(
        `Failed to update repository visibility: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ✅ NEW: Enhanced repository deletion
  private async deleteRepository(repoName: string): Promise<void> {
    try {
      await this.githubService.request('DELETE', `/repos/${this.owner}/${repoName}`);
      console.log(`✅ Repository ${repoName} deleted successfully`);
    } catch (error) {
      throw new Error(
        `Failed to delete repository: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ✅ NEW: Enhanced error message generation
  private getEnhancedErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message;

      // Check for common GitHub API errors
      if (message.includes('404')) {
        return 'Repository not found. Please check if the repository exists and you have access to it.';
      } else if (message.includes('403')) {
        const authMethod = this.lastAuthStatus?.currentAuth || 'unknown';
        return `Access denied. Your ${authMethod === 'pat' ? 'Personal Access Token may need additional permissions' : 'GitHub App may need additional permissions'} or the repository may be private.`;
      } else if (message.includes('401')) {
        return 'Authentication failed. Please check your GitHub authentication settings.';
      } else if (message.includes('rate limit')) {
        const rateLimits = this.lastAuthStatus?.rateLimits;
        return `GitHub API rate limit exceeded. ${rateLimits ? `Remaining: ${rateLimits.remaining}/${rateLimits.limit}` : 'Please try again later.'}`;
      }

      return message;
    }

    return 'Failed to import repository. Please try again.';
  }

  // ✅ ENHANCED: Better temporary repo metadata tracking
  private async saveTempRepo(
    originalRepo: string,
    tempRepo: string,
    branch: string,
    operationId: string
  ): Promise<void> {
    const tempRepos = await this.getTempRepos();
    const newRepo: TempRepoMetadata = {
      originalRepo,
      tempRepo,
      createdAt: Date.now(),
      owner: this.owner,
      branch,
      authMethod: this.lastAuthStatus?.currentAuth || 'unknown',
      operationId,
    };

    tempRepos.push(newRepo);
    await chrome.storage.local.set({
      [STORAGE_KEY]: tempRepos,
    });

    console.log(
      `💾 TempRepoManager: Saved temporary repo ${tempRepo} (created at ${new Date(newRepo.createdAt).toISOString()}, auth: ${newRepo.authMethod})`
    );
  }

  async getTempRepos(): Promise<TempRepoMetadata[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  }

  // ✅ ENHANCED: Improved cleanup with better error handling and auth awareness
  async cleanupTempRepos(forceCleanUp?: boolean): Promise<void> {
    const tempRepos = await this.getTempRepos();
    const now = Date.now();
    const remaining = [];

    console.log(
      `🧹 TempRepoManager: Cleanup check - found ${tempRepos.length} repositories${forceCleanUp ? ' (forced)' : ''}`
    );

    // ✅ NEW: Update auth status before cleanup
    await this.updateAuthStatus();

    for (const repo of tempRepos) {
      const age = now - repo.createdAt;
      const shouldDelete = forceCleanUp || age > BackgroundTempRepoManager.MAX_AGE;

      if (shouldDelete) {
        try {
          console.log(
            `🗑️ TempRepoManager: Deleting temporary repo ${repo.tempRepo} (age: ${Math.floor(age / 1000)}s, max: ${BackgroundTempRepoManager.MAX_AGE / 1000}s, auth: ${repo.authMethod || 'unknown'})`
          );

          // ✅ UPDATED: Use enhanced delete method
          await this.deleteRepository(repo.tempRepo);

          console.log(`✅ TempRepoManager: Successfully deleted ${repo.tempRepo}`);
        } catch (error) {
          console.error(
            `❌ TempRepoManager: Failed to delete temporary repo ${repo.tempRepo}:`,
            error
          );

          // ✅ ENHANCED: Better retry logic for failed deletions
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (errorMessage.includes('404')) {
            // Repository already deleted, don't keep in list
            console.log(
              `📝 TempRepoManager: ${repo.tempRepo} already deleted (404), removing from list`
            );
          } else {
            // Keep failed deletions in the list for retry, but update attempt count
            const updatedRepo = {
              ...repo,
              lastCleanupAttempt: now,
              cleanupAttempts: (repo as any).cleanupAttempts
                ? (repo as any).cleanupAttempts + 1
                : 1,
            };

            // Only retry up to 3 times
            if ((updatedRepo as any).cleanupAttempts < 3) {
              remaining.push(updatedRepo);
            } else {
              console.warn(
                `⚠️ TempRepoManager: Giving up on ${repo.tempRepo} after 3 failed cleanup attempts`
              );
            }
          }
        }
      } else {
        console.log(
          `⏳ TempRepoManager: Keeping ${repo.tempRepo} (age: ${Math.floor(age / 1000)}s, max: ${BackgroundTempRepoManager.MAX_AGE / 1000}s)`
        );
        remaining.push(repo);
      }
    }

    await chrome.storage.local.set({
      [STORAGE_KEY]: remaining,
    });

    console.log(
      `📊 TempRepoManager: Cleanup complete - ${tempRepos.length - remaining.length} deleted, ${remaining.length} remaining`
    );

    // Only stop the cleanup interval if there are no more repos to clean up
    if (remaining.length === 0) {
      console.log('🛑 TempRepoManager: No more temporary repos - stopping cleanup interval');
      this.stopCleanupInterval();
    }
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      console.log('⚠️  TempRepoManager: Cleanup interval already running');
      return;
    }

    console.log(
      `⏰ TempRepoManager: Starting cleanup interval (every ${BackgroundTempRepoManager.CLEANUP_INTERVAL / 1000}s)`
    );
    this.cleanupInterval = setInterval(
      () => this.cleanupTempRepos(),
      BackgroundTempRepoManager.CLEANUP_INTERVAL
    );
  }

  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      console.log('🛑 TempRepoManager: Stopping cleanup interval');
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ✅ NEW: Get current auth status for external use
  public getAuthStatus(): {
    currentAuth: 'pat' | 'github_app' | 'unknown' | null;
    rateLimits?: any;
  } | null {
    return this.lastAuthStatus;
  }

  // ✅ NEW: Force auth status refresh
  public async refreshAuthStatus(): Promise<void> {
    await this.updateAuthStatus();
  }
}
