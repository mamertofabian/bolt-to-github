import { GitLabService } from '../services/GitLabService';
import type { UploadStatusState } from '../lib/types';

export const STORAGE_KEY = 'bolt_temp_repos';

interface TempRepoMetadata {
  originalRepo: string;
  tempRepo: string;
  createdAt: number;
  owner: string;
}

export class BackgroundTempRepoManager {
  private static CLEANUP_INTERVAL = 30 * 1000; // 30 seconds
  private static MAX_AGE = 60 * 1000; // 60 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private gitlabService: GitLabService,
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

      tempRepoName = await this.gitlabService.createTemporaryPublicProject(this.owner, sourceRepo);
      await this.saveTempRepo(sourceRepo, tempRepoName);

      this.broadcastStatus({
        status: 'uploading',
        message: 'Copying repository contents...',
        progress: 30,
      });

      await this.gitlabService.cloneProjectContents(
        this.owner,
        sourceRepo,
        this.owner,
        tempRepoName,
        'main',
        (progress) => {
          this.broadcastStatus({
            status: 'uploading',
            message: 'Copying repository contents...',
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
      await this.gitlabService.updateProjectVisibility(this.owner, tempRepoName, 'public');

      this.broadcastStatus({
        status: 'uploading',
        message: 'Opening Bolt...',
        progress: 90,
      });

      // Open Bolt in new tab
      chrome.tabs.create({
        url: `https://bolt.new/~/gitlab.com/${this.owner}/${tempRepoName}`,
        active: true, // Focus the new tab
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
          await this.gitlabService.deleteProject(repo.owner, repo.tempRepo);
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
