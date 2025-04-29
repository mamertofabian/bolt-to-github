import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import type {
  IRepositoryService,
  RepoInfo,
  RepoCreateOptions,
  RepoSummary,
} from './interfaces/IRepositoryService';
import { Queue } from '../lib/Queue';
import { RateLimitHandler } from './RateLimitHandler';

/**
 * Service for GitHub repository management operations
 */
export class RepositoryService implements IRepositoryService {
  /**
   * Creates a new RepositoryService instance
   * @param apiClient GitHub API client
   */
  constructor(private apiClient: IGitHubApiClient) {}

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
      console.error('Failed to create repository:', error);
      throw new Error(
        `Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
      let isOrg = false;
      try {
        const ownerInfo = await this.apiClient.request('GET', `/users/${owner}`);
        isOrg = ownerInfo.type === 'Organization';
      } catch (error) {
        // If we can't determine, proceed assuming it's a user
        console.warn(`Could not determine if ${owner} is an organization:`, error);
      }

      await this.createRepo({
        name: repo,
        private: true,
        auto_init: true,
        description: 'Repository created by Bolt to GitHub extension',
        org: isOrg ? owner : undefined,
      });

      // Wait a bit for GitHub to initialize the repository
      await new Promise((resolve) => setTimeout(resolve, 2000));
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
      console.log('error', error);
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

    await this.pushFile({
      owner,
      repo,
      path: 'README.md',
      content: btoa(readmeContent),
      branch,
      message: 'Initialize repository with auto-generated README',
    });
  }

  /**
   * Helper method to push a file to a repository
   * @param params File push parameters
   * @returns Promise resolving to the API response
   */
  private async pushFile(params: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    branch: string;
    message: string;
    checkExisting?: boolean;
  }) {
    const { owner, repo, path, content, branch, message, checkExisting = true } = params;

    try {
      // Try to get existing file if needed
      let sha: string | undefined;
      if (checkExisting) {
        try {
          const response = await this.apiClient.request(
            'GET',
            `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
          );
          sha = response.sha;
        } catch (error) {
          // File doesn't exist, which is fine
          console.log('File does not exist yet, will create new');
        }
      }

      // Create or update file
      const body = {
        message,
        content,
        branch,
        ...(sha ? { sha } : {}),
      };

      return await this.apiClient.request('PUT', `/repos/${owner}/${repo}/contents/${path}`, body);
    } catch (error) {
      console.error('GitHub API Error:', error);
      throw new Error(
        `Failed to push file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets the commit count for a repository branch
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param branch Branch name
   * @returns Promise resolving to the commit count
   */
  async getCommitCount(owner: string, repo: string, branch: string): Promise<number> {
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
          return parseInt(match[1], 10);
        }
      }

      // If no pagination, count the commits manually
      return commits.length;
    } catch (error) {
      console.error('Failed to fetch commit count:', error);
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
    let isOrg = false;
    try {
      const ownerInfo = await this.apiClient.request('GET', `/users/${ownerName}`);
      isOrg = ownerInfo.type === 'Organization';
    } catch (error) {
      // If we can't determine, proceed assuming it's a user
      console.warn(`Could not determine if ${ownerName} is an organization:`, error);
    }

    // Create repo without auto-init
    await this.createRepo({
      name: tempRepoName,
      private: true,
      auto_init: false,
      description: 'Temporary repository for Bolt import - will be deleted automatically',
      org: isOrg ? ownerName : undefined,
    });

    // Initialize with an empty commit to create the specified branch
    await this.pushFile({
      owner: ownerName,
      repo: tempRepoName,
      path: '.gitkeep',
      content: btoa(''), // Empty file
      branch: branch,
      message: `Initialize repository with branch '${branch}'`,
      checkExisting: false,
    });

    return tempRepoName;
  }

  /**
   * Deletes a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving when deletion is complete
   */
  async deleteRepo(owner: string, repo: string): Promise<void> {
    await this.apiClient.request('DELETE', `/repos/${owner}/${repo}`);
  }

  /**
   * Updates a repository's visibility
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param makePrivate Whether to make the repository private
   * @returns Promise resolving when update is complete
   */
  async updateRepoVisibility(owner: string, repo: string, makePrivate: boolean): Promise<void> {
    await this.apiClient.request('PATCH', `/repos/${owner}/${repo}`, {
      private: makePrivate,
    });
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
            console.warn(`Failed to fetch repos for organization ${org.login}:`, error);
          }
        }
      } catch (error) {
        console.warn('Failed to fetch organizations:', error);
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
      console.error('Failed to fetch repositories:', error);
      throw new Error(
        `Failed to fetch repositories: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
      console.error(`Failed to fetch branches for ${owner}/${repo}:`, error);
      throw new Error(
        `Failed to fetch branches: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clones repository contents from one repository to another
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
    // Use a rate limit handler to prevent hitting GitHub API rate limits
    const rateLimitHandler = new RateLimitHandler();
    const queue = new Queue(1); // Using a queue for serial execution

    try {
      // Check rate limits before starting
      await rateLimitHandler.beforeRequest();
      const rateLimit = await this.apiClient.request('GET', '/rate_limit');
      const remainingRequests = rateLimit.resources.core.remaining;
      const resetTime = rateLimit.resources.core.reset;

      if (remainingRequests < 10) {
        const now = Math.floor(Date.now() / 1000);
        const waitTime = resetTime - now;

        // If reset is happening soon (within 2 minutes), wait for it
        if (waitTime <= 120) {
          console.log(`Waiting ${waitTime} seconds for rate limit reset...`);
          await rateLimitHandler.sleep(waitTime * 1000);
          // Recheck rate limit after waiting
          const newRateLimit = await this.apiClient.request('GET', '/rate_limit');
          if (newRateLimit.resources.core.remaining < 10) {
            throw new Error('Insufficient API rate limit remaining even after waiting for reset');
          }
        } else {
          throw new Error(
            `Insufficient API rate limit remaining. Reset in ${Math.ceil(waitTime / 60)} minutes`
          );
        }
      }

      // Get all files from source repo
      const response = await this.apiClient.request(
        'GET',
        `/repos/${sourceOwner}/${sourceRepo}/git/trees/${branch}?recursive=1`
      );

      const files = response.tree.filter((item: any) => item.type === 'blob');
      const totalFiles = files.length;

      // Reset rate limit handler counter before starting batch
      rateLimitHandler.resetRequestCount();

      // Process files serially through queue
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        await queue.add(async () => {
          let success = false;
          while (!success) {
            try {
              // Get file content
              await rateLimitHandler.beforeRequest();
              const content = await this.apiClient.request(
                'GET',
                `/repos/${sourceOwner}/${sourceRepo}/contents/${file.path}?ref=${branch}`
              );

              // Push file content
              await rateLimitHandler.beforeRequest();
              await this.pushFile({
                owner: targetOwner,
                repo: targetRepo,
                path: file.path,
                content: content.content,
                branch,
                message: `Copy ${file.path} from ${sourceRepo}`,
                checkExisting: false,
              });

              success = true;
              rateLimitHandler.resetRetryCount();

              // Reset request counter every 10 files to maintain burst behavior
              if ((i + 1) % 10 === 0) {
                rateLimitHandler.resetRequestCount();
              }

              if (onProgress) {
                const progress = ((i + 1) / totalFiles) * 100;
                onProgress(progress);
              }
            } catch (error) {
              if (error instanceof Response && error.status === 403) {
                await rateLimitHandler.handleRateLimit(error);
              } else {
                throw error;
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to clone repository contents:', error);
      throw new Error(
        `Failed to clone repository contents: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
