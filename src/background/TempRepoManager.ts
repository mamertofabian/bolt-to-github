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
          const defaultBranch = branches.find(
            (b: { name: string; isDefault: boolean }) => b.isDefault
          );
          branchToUse = defaultBranch ? defaultBranch.name : 'main';
          console.log(`Using detected default branch: ${branchToUse}`);
        } catch (error) {
          console.warn('Failed to detect default branch, falling back to main:', error);
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

  private async saveTempRepo(
    originalRepo: string,
    tempRepo: string,
    branch: string
  ): Promise<void> {
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

  /**
   * Static methods for popup integration
   */

  /**
   * Get the most recent temp repository for a project
   */
  public static async getMostRecentTempRepo(projectId: string): Promise<TempRepoMetadata | null> {
    try {
      const tempRepos = await BackgroundTempRepoManager.getAllTempRepos();

      // Filter by project (we'll need to enhance metadata to include projectId)
      // For now, we'll return the most recent repo overall
      if (tempRepos.length === 0) {
        return null;
      }

      // Sort by timestamp (most recent first) and return the first one
      const sortedRepos = tempRepos.sort((a, b) => b.createdAt - a.createdAt);
      return sortedRepos[0];
    } catch (error) {
      console.error('Error getting most recent temp repo:', error);
      return null;
    }
  }

  /**
   * Get all temp repositories
   */
  public static async getAllTempRepos(): Promise<TempRepoMetadata[]> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return result[STORAGE_KEY] || [];
    } catch (error) {
      console.error('Error getting temp repositories:', error);
      return [];
    }
  }

  /**
   * Request temp repo deletion (for popup use)
   */
  public static async requestTempRepoDeletion(owner: string, tempRepo: string): Promise<boolean> {
    try {
      // Send message to background script to handle deletion
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_TEMP_REPO',
        data: {
          owner,
          tempRepo,
          timestamp: Date.now(),
        },
      });

      if (response?.success) {
        console.log('Temp repo deletion requested successfully');
        return true;
      } else {
        console.warn('Background script did not confirm temp repo deletion');
        return false;
      }
    } catch (error) {
      console.error('Error requesting temp repo deletion:', error);
      return false;
    }
  }

  /**
   * Remove a temp repository from storage (for background script use)
   */
  public static async removeTempRepository(owner: string, tempRepo: string): Promise<boolean> {
    try {
      const tempRepos = await BackgroundTempRepoManager.getAllTempRepos();

      const filteredRepos = tempRepos.filter(
        (repo: TempRepoMetadata) => !(repo.owner === owner && repo.tempRepo === tempRepo)
      );

      if (filteredRepos.length !== tempRepos.length) {
        await chrome.storage.local.set({
          [STORAGE_KEY]: filteredRepos,
        });

        console.log('Temp repository removed:', { owner, tempRepo });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error removing temp repository:', error);
      return false;
    }
  }

  /**
   * Format temp repository for display
   */
  public static formatTempRepositoryForDisplay(repo: TempRepoMetadata): {
    displayName: string;
    fullName: string;
    originalName: string;
    age: string;
    isOld: boolean;
  } {
    const now = Date.now();
    const timestamp = repo.createdAt || now;
    const ageMs = now - timestamp;
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);

    let age: string;
    if (ageDays > 0) {
      age = `${ageDays} day${ageDays > 1 ? 's' : ''} ago`;
    } else if (ageHours > 0) {
      age = `${ageHours} hour${ageHours > 1 ? 's' : ''} ago`;
    } else {
      age = 'Just now';
    }

    const isOld = ageDays > 7; // Consider old if more than 7 days

    return {
      displayName: repo.tempRepo || 'Unknown',
      fullName: `${repo.owner}/${repo.tempRepo}`,
      originalName: repo.originalRepo || 'Unknown',
      age,
      isOld,
    };
  }
}
