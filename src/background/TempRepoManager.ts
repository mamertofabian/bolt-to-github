import { GitHubService } from '../services/GitHubService';
import type { UploadStatusState } from '../lib/types';

interface TempRepoMetadata {
  originalRepo: string;
  tempRepo: string;
  createdAt: number;
  owner: string;
}

export class BackgroundTempRepoManager {
  private static STORAGE_KEY = 'bolt_temp_repos';
  private static CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static MAX_AGE = 30 * 60 * 1000; // 30 minutes

  constructor(
    private githubService: GitHubService,
    private owner: string,
    private broadcastStatus: (status: UploadStatusState) => void
  ) {
    this.startCleanupInterval();
  }

  async handlePrivateRepoImport(sourceRepo: string): Promise<void> {
    let tempRepoName: string | undefined;
    try {
      this.broadcastStatus({
        status: 'uploading',
        message: 'Creating temporary repository...',
        progress: 10,
      });

      tempRepoName = await this.githubService.createTemporaryPublicRepo(sourceRepo);
      await this.saveTempRepo(sourceRepo, tempRepoName);

      this.broadcastStatus({
        status: 'uploading',
        message: 'Copying repository contents...',
        progress: 30,
      });

      await this.githubService.cloneRepoContents(this.owner, sourceRepo, this.owner, tempRepoName);

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

      // Open Bolt in new window
      chrome.windows.create({
        url: `https://bolt.new/~/github.com/${this.owner}/${tempRepoName}`,
        type: 'popup',
        width: 1200,
        height: 800,
      });

      this.broadcastStatus({
        status: 'success',
        message: 'Repository imported successfully',
        progress: 100,
      });
    } catch (error) {
      console.error('Failed to import private repository:', error);
      this.broadcastStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to import repository',
        progress: 100,
      });
    }
  }

  private async saveTempRepo(originalRepo: string, tempRepo: string): Promise<void> {
    const tempRepos = await this.getTempRepos();
    tempRepos.push({
      originalRepo,
      tempRepo,
      createdAt: Date.now(),
      owner: this.owner,
    });
    await chrome.storage.local.set({
      [BackgroundTempRepoManager.STORAGE_KEY]: tempRepos,
    });
  }

  private async getTempRepos(): Promise<TempRepoMetadata[]> {
    const result = await chrome.storage.local.get(BackgroundTempRepoManager.STORAGE_KEY);
    return result[BackgroundTempRepoManager.STORAGE_KEY] || [];
  }

  async cleanupTempRepos(): Promise<void> {
    const tempRepos = await this.getTempRepos();
    const now = Date.now();
    const remaining = [];

    for (const repo of tempRepos) {
      if (now - repo.createdAt > BackgroundTempRepoManager.MAX_AGE) {
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
      [BackgroundTempRepoManager.STORAGE_KEY]: remaining,
    });
  }

  private startCleanupInterval(): void {
    setInterval(() => this.cleanupTempRepos(), BackgroundTempRepoManager.CLEANUP_INTERVAL);
  }
}
