import { GitHubService } from './GitHubService';

interface TempRepoMetadata {
  originalRepo: string;
  tempRepo: string;
  createdAt: number;
  owner: string;
}

export class TempRepoManager {
  private static STORAGE_KEY = 'bolt_temp_repos';
  private static CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static MAX_AGE = 30 * 60 * 1000; // 30 minutes

  constructor(private githubService: GitHubService, private owner: string) {
    this.startCleanupInterval();
  }

  private getTempRepos(): TempRepoMetadata[] {
    const stored = localStorage.getItem(TempRepoManager.STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  private saveTempRepos(repos: TempRepoMetadata[]): void {
    localStorage.setItem(TempRepoManager.STORAGE_KEY, JSON.stringify(repos));
  }

  async createTemporaryPublicRepo(originalRepo: string): Promise<string> {
    const tempRepoName = await this.githubService.createTemporaryPublicRepo(originalRepo);
    
    const tempRepos = this.getTempRepos();
    tempRepos.push({
      originalRepo,
      tempRepo: tempRepoName,
      createdAt: Date.now(),
      owner: this.owner
    });
    this.saveTempRepos(tempRepos);

    return tempRepoName;
  }

  async cleanupTempRepos(): Promise<void> {
    const tempRepos = this.getTempRepos();
    const now = Date.now();
    const remaining = [];

    for (const repo of tempRepos) {
      if (now - repo.createdAt > TempRepoManager.MAX_AGE) {
        try {
          await this.githubService.deleteRepo(repo.owner, repo.tempRepo);
        } catch (error) {
          console.error(`Failed to delete temporary repo ${repo.tempRepo}:`, error);
        }
      } else {
        remaining.push(repo);
      }
    }

    this.saveTempRepos(remaining);
  }

  private startCleanupInterval(): void {
    setInterval(() => this.cleanupTempRepos(), TempRepoManager.CLEANUP_INTERVAL);
  }
}
