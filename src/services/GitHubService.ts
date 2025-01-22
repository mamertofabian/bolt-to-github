export const GITHUB_SIGNUP_URL = 'https://github.com/signup';
export const CREATE_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=delete_repo,repo&description=Bolt%20to%20GitHub&default_expires_at=none';
export const CREATE_FINE_GRAINED_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new';

import { BaseGitHubService, type ProgressCallback } from './BaseGitHubService';
import { GitHubTokenValidator } from './GitHubTokenValidator';

interface GitHubFileResponse {
  sha?: string;
  content?: string;
}

interface RepoCreateOptions {
  name: string;
  private?: boolean;
  auto_init?: boolean;
  description?: string;
}

export class GitHubService extends BaseGitHubService {
  private tokenValidator: GitHubTokenValidator;

  constructor(token: string) {
    super(token);
    this.tokenValidator = new GitHubTokenValidator(token);
  }

  async validateToken(): Promise<boolean> {
    return this.tokenValidator.validateToken();
  }

  async isClassicToken(): Promise<boolean> {
    return this.tokenValidator.isClassicToken();
  }

  async isFineGrainedToken(): Promise<boolean> {
    return this.tokenValidator.isFineGrainedToken();
  }

  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    return this.tokenValidator.validateTokenAndUser(username);
  }

  async verifyFineGrainedPermissions(
    username: string,
    onProgress?: ProgressCallback
  ): Promise<{ isValid: boolean; error?: string }> {
    return this.tokenValidator.verifyFineGrainedPermissions(username, onProgress);
  }

  async repoExists(owner: string, repo: string): Promise<boolean> {
    try {
      await this.request('GET', `/repos/${owner}/${repo}`);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  async createRepo(options: RepoCreateOptions & { auto_init?: boolean }) {
    const { auto_init = true, ...repoOptions } = options;

    try {
      // Try creating in user's account first
      try {
        return await this.request('POST', '/user/repos', {
          ...repoOptions,
          auto_init, // Use the provided value or default to true
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
          // If user endpoint fails, try organization endpoint
          return await this.request('POST', `/orgs/${options.name}/repos`, {
            ...repoOptions,
            auto_init,
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Failed to create repository:', error);
      throw new Error(
        `Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async ensureRepoExists(owner: string, repo: string): Promise<void> {
    const exists = await this.repoExists(owner, repo);
    if (!exists) {
      await this.createRepo({
        name: repo,
        private: false, // Make public by default so bolt.new can load the repo
        auto_init: true,
        description: 'Repository created by Bolt to GitHub extension',
      });

      // Wait a bit for GitHub to initialize the repository
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  async isRepoEmpty(owner: string, repo: string): Promise<boolean> {
    try {
      const commits = await this.request('GET', `/repos/${owner}/${repo}/commits`);
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

  async pushFile(params: {
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
          const response: GitHubFileResponse = await this.request(
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

      return await this.request('PUT', `/repos/${owner}/${repo}/contents/${path}`, body);
    } catch (error) {
      console.error('GitHub API Error:', error);
      throw new Error(
        `Failed to push file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getCommitCount(owner: string, repo: string, branch: string): Promise<number> {
    try {
      const commits = await this.request('GET', `/repos/${owner}/${repo}/commits`, null, {
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

  async createTemporaryPublicRepo(ownerName: string, sourceRepoName: string): Promise<string> {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const tempRepoName = `temp-${sourceRepoName}-${timestamp}-${randomStr}`;

    // Create repo without auto-init
    await this.createRepo({
      name: tempRepoName,
      private: true,
      auto_init: false,
      description: 'Temporary repository for Bolt import - will be deleted automatically',
    });

    // Initialize with an empty commit to create the default branch
    await this.pushFile({
      owner: ownerName,
      repo: tempRepoName,
      path: '.gitkeep',
      content: btoa(''), // Empty file
      branch: 'main',
      message: 'Initialize repository',
      checkExisting: false,
    });

    return tempRepoName;
  }

  async cloneRepoContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string = 'main',
    onProgress?: (progress: number) => void
  ): Promise<void> {
    // Get all files from source repo
    const response = await this.request(
      'GET',
      `/repos/${sourceOwner}/${sourceRepo}/git/trees/${branch}?recursive=1`
    );
    const files = response.tree.filter((item: any) => item.type === 'blob');
    const totalFiles = files.length;

    // Copy each file to target repo
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = await this.request(
        'GET',
        `/repos/${sourceOwner}/${sourceRepo}/contents/${file.path}?ref=${branch}`
      );
      await this.pushFile({
        owner: targetOwner,
        repo: targetRepo,
        path: file.path,
        content: content.content,
        branch,
        message: `Copy ${file.path} from ${sourceRepo}`,
        checkExisting: false, // Skip checking for existing files when cloning
      });

      if (onProgress) {
        const progress = ((i + 1) / totalFiles) * 100;
        onProgress(progress);
      }
    }
  }

  async deleteRepo(owner: string, repo: string): Promise<void> {
    await this.request('DELETE', `/repos/${owner}/${repo}`);
  }

  async updateRepoVisibility(owner: string, repo: string, makePrivate: boolean): Promise<void> {
    await this.request('PATCH', `/repos/${owner}/${repo}`, {
      private: makePrivate,
    });
  }

  async listRepos(): Promise<
    Array<{
      name: string;
      description: string | null;
      private: boolean;
      html_url: string;
      created_at: string;
      updated_at: string;
      language: string | null;
    }>
  > {
    try {
      const repos = await this.request('GET', `/user/repos?per_page=100&sort=updated`);

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
}
