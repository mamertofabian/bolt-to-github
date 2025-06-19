import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import type {
  IRepositoryService,
  RepoInfo,
  RepoCreateOptions,
  RepoSummary,
} from './interfaces/IRepositoryService';
import type { IFileService } from './interfaces/IFileService';
import type { IRepoCloneService } from './interfaces/IRepoCloneService';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('RepositoryService');

/**
 * Service for GitHub repository management operations
 */
export class RepositoryService implements IRepositoryService {
  // Consistent timeout duration for repository initialization
  private static readonly REPO_INIT_WAIT_MS = 2000;

  /**
   * Creates a new RepositoryService instance
   * @param apiClient GitHub API client
   * @param fileService File service
   * @param repoCloneService Repository clone service
   */
  constructor(
    private apiClient: IGitHubApiClient,
    private fileService: IFileService,
    private repoCloneService?: IRepoCloneService
  ) {}

  /**
   * Checks if a repository exists
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving to true if repository exists, false otherwise
   */
  async repoExists(owner: string, repo: string): Promise<boolean> {
    try {
      await this.apiClient.request('GET', `/repos/${owner}/${repo}`);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets information about a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving to repository information
   */
  async getRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
    try {
      const response: RepoInfo = await this.apiClient.request('GET', `/repos/${owner}/${repo}`);
      return {
        name: response.name,
        description: response.description,
        private: response.private,
        exists: true,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return { name: repo, exists: false };
      }
      throw error;
    }
  }

  /**
   * Creates a new repository
   * @param options Repository creation options
   * @returns Promise resolving to the created repository
   */
  async createRepo(options: RepoCreateOptions): Promise<any> {
    const { auto_init = true, org, ...repoOptions } = options;

    try {
      // If org is specified, create in organization
      if (org) {
        return await this.apiClient.request('POST', `/orgs/${org}/repos`, {
          ...repoOptions,
          auto_init,
        });
      } else {
        // Otherwise create in user's account
        return await this.apiClient.request('POST', '/user/repos', {
          ...repoOptions,
          auto_init,
        });
      }
    } catch (error) {
      throw this.createServiceError('Failed to create repository', error);
    }
  }

  /**
   * Ensures a repository exists, creating it if necessary
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving when repository exists
   */
  async ensureRepoExists(owner: string, repo: string): Promise<void> {
    const exists = await this.repoExists(owner, repo);
    if (!exists) {
      // First determine if the owner is an organization
      const isOrg = await this.isOrganization(owner);

      await this.createRepo({
        name: repo,
        private: true,
        auto_init: true,
        description: 'Repository created by Bolt to GitHub extension',
        org: isOrg ? owner : undefined,
      });

      // Wait a bit for GitHub to initialize the repository
      await new Promise((resolve) => setTimeout(resolve, RepositoryService.REPO_INIT_WAIT_MS));
    }
  }

  /**
   * Checks if a repository is empty (has no commits)
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving to true if repository is empty, false otherwise
   */
  async isRepoEmpty(owner: string, repo: string): Promise<boolean> {
    try {
      const commits = await this.apiClient.request('GET', `/repos/${owner}/${repo}/commits`);
      return commits.length === 0;
    } catch (error) {
      if (error instanceof Error && error.message.includes('409')) {
        // 409 is returned for empty repositories
        return true;
      }
      throw error;
    }
  }

  /**
   * Initializes an empty repository with a README file
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param branch Branch name
   * @returns Promise resolving when initialization is complete
   */
  async initializeEmptyRepo(owner: string, repo: string, branch: string): Promise<void> {
    // Create a more informative README.md to initialize the repository
    const readmeContent = `# ${repo}

## Feel free to delete this file and replace it with your own content.

## Repository Initialization Notice

This repository was automatically initialized by the Bolt to GitHub extension.

**Auto-Generated Repository**
- Created to ensure a valid Git repository structure
- Serves as an initial commit point for your project`;

    await this.fileService.writeFile(
      owner,
      repo,
      'README.md',
      readmeContent,
      branch,
      'Initialize repository with auto-generated README'
    );
  }

  /**
   * Gets the commit count for a repository branch
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param branch Branch name
   * @param maxCommits Maximum number of commits to fetch (optional, default: 100)
   * @returns Promise resolving to the commit count
   */
  async getCommitCount(
    owner: string,
    repo: string,
    branch: string,
    maxCommits: number = 100
  ): Promise<number> {
    try {
      const commits = await this.apiClient.request('GET', `/repos/${owner}/${repo}/commits`, null, {
        headers: {
          per_page: '1', // We only need the count from headers
        },
      });

      // GitHub returns the total count in the Link header
      const linkHeader = commits.headers?.get('link');
      if (linkHeader) {
        const match = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (match) {
          const totalCommits = parseInt(match[1], 10);
          return Math.min(totalCommits, maxCommits); // Respect the maxCommits limit
        }
      }

      // If no pagination, count the commits manually
      return Math.min(commits.length, maxCommits);
    } catch (error) {
      logger.error('Failed to fetch commit count:', error);
      return 0;
    }
  }

  /**
   * Creates a temporary public repository for migration purposes
   * @param ownerName Repository owner (username or organization)
   * @param sourceRepoName Source repository name
   * @param branch Branch name to use (default: 'main')
   * @returns Promise resolving to the name of the created temporary repository
   */
  async createTemporaryPublicRepo(
    ownerName: string,
    sourceRepoName: string,
    branch: string = 'main'
  ): Promise<string> {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const tempRepoName = `temp-${sourceRepoName}-${timestamp}-${randomStr}`;

    // First determine if the owner is an organization
    const isOrg = await this.isOrganization(ownerName);

    // Create repo without auto-init
    await this.createRepo({
      name: tempRepoName,
      private: true,
      auto_init: false,
      description: 'Temporary repository for Bolt import - will be deleted automatically',
      org: isOrg ? ownerName : undefined,
    });

    // Initialize with an empty commit to create the specified branch
    await this.fileService.writeFile(
      ownerName,
      tempRepoName,
      '.gitkeep',
      '',
      branch,
      `Initialize repository with branch '${branch}'`
    );

    return tempRepoName;
  }

  /**
   * Deletes a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving when deletion is complete
   */
  async deleteRepo(owner: string, repo: string): Promise<void> {
    try {
      await this.apiClient.request('DELETE', `/repos/${owner}/${repo}`);
    } catch (error) {
      throw this.createServiceError(`Failed to delete repository ${owner}/${repo}`, error);
    }
  }

  /**
   * Updates a repository's visibility
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param makePrivate Whether to make the repository private
   * @returns Promise resolving when update is complete
   */
  async updateRepoVisibility(owner: string, repo: string, makePrivate: boolean): Promise<void> {
    try {
      await this.apiClient.request('PATCH', `/repos/${owner}/${repo}`, {
        private: makePrivate,
      });
    } catch (error) {
      throw this.createServiceError(
        `Failed to update repository visibility for ${owner}/${repo}`,
        error
      );
    }
  }

  /**
   * Lists repositories the user has access to
   * @returns Promise resolving to an array of repository summaries
   */
  async listRepos(): Promise<Array<RepoSummary>> {
    try {
      // Get repos from user account
      let repos = await this.apiClient.request('GET', `/user/repos?per_page=100&sort=updated`);

      // Get org repos the user has access to
      try {
        const orgs = await this.apiClient.request('GET', '/user/orgs');

        for (const org of orgs) {
          try {
            const orgRepos = await this.apiClient.request(
              'GET',
              `/orgs/${org.login}/repos?per_page=100&sort=updated`
            );
            repos = repos.concat(orgRepos);
          } catch (error) {
            logger.warn(`Failed to fetch repos for organization ${org.login}:`, error);
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch organizations:', error);
      }

      return repos.map((repo: any) => ({
        name: repo.name,
        description: repo.description,
        private: repo.private,
        html_url: repo.html_url,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        language: repo.language,
      }));
    } catch (error) {
      throw this.createServiceError('Failed to fetch repositories', error);
    }
  }

  /**
   * Lists branches for a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving to an array of branch names and their details
   */
  async listBranches(
    owner: string,
    repo: string
  ): Promise<Array<{ name: string; isDefault: boolean }>> {
    try {
      // Get repository information to determine the default branch
      const repoInfo = await this.apiClient.request('GET', `/repos/${owner}/${repo}`);
      const defaultBranch = repoInfo.default_branch;

      // Get all branches for the repository
      const branches = await this.apiClient.request(
        'GET',
        `/repos/${owner}/${repo}/branches?per_page=100`
      );

      return branches.map((branch: any) => ({
        name: branch.name,
        isDefault: branch.name === defaultBranch,
      }));
    } catch (error) {
      throw this.createServiceError(`Failed to fetch branches for ${owner}/${repo}`, error);
    }
  }

  /**
   * Clones repository contents from one repository to another
   * This method is now a proxy to the RepoCloneService
   * @param sourceOwner Source repository owner
   * @param sourceRepo Source repository name
   * @param targetOwner Target repository owner
   * @param targetRepo Target repository name
   * @param branch Branch name (default: 'main')
   * @param onProgress Progress callback
   * @returns Promise resolving when cloning is complete
   */
  async cloneRepoContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string = 'main',
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!this.repoCloneService) {
      throw new Error('RepoCloneService is required for cloning repository contents');
    }

    await this.repoCloneService.cloneRepoContents(
      sourceOwner,
      sourceRepo,
      targetOwner,
      targetRepo,
      branch,
      onProgress
    );
  }

  /**
   * Checks if an owner is an organization
   * @param owner Owner name (username or organization)
   * @returns Promise resolving to true if the owner is an organization, false otherwise
   * @private
   */
  private async isOrganization(owner: string): Promise<boolean> {
    try {
      const ownerInfo = await this.apiClient.request('GET', `/users/${owner}`);
      return ownerInfo.type === 'Organization';
    } catch (error) {
      // If we can't determine, proceed assuming it's a user
      logger.warn(`Could not determine if ${owner} is an organization:`, error);
      return false;
    }
  }

  /**
   * Creates a standardized error with consistent formatting
   * @param message Base error message
   * @param error Original error
   * @returns Error with consistent format
   * @private
   */
  private createServiceError(message: string, error: unknown): Error {
    logger.error(`${message}:`, error);
    return new Error(`${message}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
