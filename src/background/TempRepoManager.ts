import { GitHubService } from '../services/GitHubService';
import type { UploadStatusState } from '../lib/types';

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

  constructor(
    private githubService: GitHubService,
    private owner: string,
    private broadcastStatus: (status: UploadStatusState) => void
  ) {
    this.startCleanupInterval();
  }

  async handlePrivateRepoImport(sourceRepo: string, branch?: string): Promise<void> {
    let tempRepoName: string | undefined;
    try {
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
          const defaultBranch = branches.find((b: {name: string; isDefault: boolean}) => b.isDefault);
          branchToUse = defaultBranch ? defaultBranch.name : 'main';
          console.log(`Using detected default branch: ${branchToUse}`);
        } catch (error) {
          console.warn('Failed to detect default branch, falling back to main:', error);
          branchToUse = 'main';
        }
      }

      tempRepoName = await this.githubService.createTemporaryPublicRepo(this.owner, sourceRepo, branchToUse);
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

      // Cleanup temp repo after 30 seconds to make sure the project is opened
      setTimeout(() => {
        if (!this.cleanupInterval) {
          this.startCleanupInterval();
        }
      }, 30000);
    } catch (error) {
      console.error('Failed to import private repository:', error);
      this.broadcastStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to import repository',
        progress: 100,
      });
    }
  }

  private async saveTempRepo(originalRepo: string, tempRepo: string, branch: string): Promise<void> {
    const tempRepos = await this.getTempRepos();
    tempRepos.push({
      originalRepo,
      tempRepo,
      createdAt: Date.now(),
      owner: this.owner,
      branch,
    });
    await chrome.storage.local.set({
      [STORAGE_KEY]: tempRepos,
    });
  }

  async getTempRepos(): Promise<TempRepoMetadata[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  }

  async cleanupTempRepos(forceCleanUp?: boolean): Promise<void> {
    const tempRepos = await this.getTempRepos();
    const now = Date.now();
    const remaining = [];

    for (const repo of tempRepos) {
      if (forceCleanUp || now - repo.createdAt > BackgroundTempRepoManager.MAX_AGE) {
        try {
          await this.githubService.deleteRepo(repo.owner, repo.tempRepo);
        } catch (error) {
          console.error(`Failed to delete temporary repo ${repo.tempRepo}:`, error);
        }
      } else {
        remaining.push(repo);
      }
    }

    await chrome.storage.local.set({
      [STORAGE_KEY]: remaining,
    });

    this.stopCleanupInterval();
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanupTempRepos(),
      BackgroundTempRepoManager.CLEANUP_INTERVAL
    );
  }

  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
