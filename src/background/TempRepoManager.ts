import { GitHubService } from '../services/GitHubService';
import type { UploadStatusState } from '../lib/types';

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
    try {
      this.broadcastStatus({
        status: 'uploading',
        message: 'Creating temporary repository...',
        progress: 10
      });

      const tempRepoName = await this.githubService.createTemporaryPublicRepo(sourceRepo);
      this.saveTempRepo(sourceRepo, tempRepoName);

      this.broadcastStatus({
        status: 'uploading',
        message: 'Copying repository contents...',
        progress: 30
      });

      await this.githubService.cloneRepoContents(this.owner, sourceRepo, this.owner, tempRepoName);

      this.broadcastStatus({
        status: 'uploading',
        message: 'Making repository public...',
        progress: 70
      });

      // Make repo public only after content is copied
      await this.githubService.updateRepoVisibility(this.owner, tempRepoName, false);

      this.broadcastStatus({
        status: 'uploading',
        message: 'Opening Bolt...',
        progress: 90
      });

      // Open Bolt in new window
      chrome.windows.create({
        url: `https://bolt.new/~/github.com/${this.owner}/${tempRepoName}`,
        type: 'popup',
        width: 1200,
        height: 800
      });

      this.broadcastStatus({
        status: 'success',
        message: 'Repository imported successfully',
        progress: 100
      });

    } catch (error) {
      console.error('Failed to import private repository:', error);
      this.broadcastStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to import repository',
        progress: 100
      });
    }
  }

  private saveTempRepo(originalRepo: string, tempRepo: string): void {
    const tempRepos = this.getTempRepos();
    tempRepos.push({
      originalRepo,
      tempRepo,
      createdAt: Date.now(),
      owner: this.owner
    });
    localStorage.setItem(BackgroundTempRepoManager.STORAGE_KEY, JSON.stringify(tempRepos));
  }

  private getTempRepos(): Array<{
    originalRepo: string;
    tempRepo: string;
    createdAt: number;
    owner: string;
  }> {
    const stored = localStorage.getItem(BackgroundTempRepoManager.STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  async cleanupTempRepos(): Promise<void> {
    const tempRepos = this.getTempRepos();
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

    localStorage.setItem(BackgroundTempRepoManager.STORAGE_KEY, JSON.stringify(remaining));
  }

  private startCleanupInterval(): void {
    setInterval(() => this.cleanupTempRepos(), BackgroundTempRepoManager.CLEANUP_INTERVAL);
  }
}
