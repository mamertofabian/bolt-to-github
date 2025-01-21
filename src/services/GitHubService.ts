export const GITHUB_SIGNUP_URL = 'https://github.com/signup';
export const CREATE_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=repo&description=Bolt%20to%20GitHub&default_expires_at=none';

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

export class GitHubService {
  private baseUrl = 'https://api.github.com';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async validateToken(): Promise<boolean> {
    try {
      await this.request('GET', '/user');
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  async isClassicToken(): Promise<boolean> {
    try {
      // Get the token's metadata from the authentication endpoint
      const response = await this.request('GET', '/applications/token', null, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Basic ${btoa(`${this.token}:`)}`
        }
      });

      // Fine-grained tokens will have a 'fine_grained' property set to true
      // Classic tokens won't have this property
      return !response.fine_grained;
    } catch (error) {
      // If we can't determine the token type, assume it's a classic token
      // as they were the original type
      console.warn('Could not determine token type:', error);
      return true;
    }
  }

  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      // First validate token and get authenticated user
      try {
        const authUser = await this.request('GET', '/user');
        if (!authUser.login) {
          return { isValid: false, error: 'Invalid GitHub token' };
        }

        // If username matches authenticated user, we're good
        if (authUser.login.toLowerCase() === username.toLowerCase()) {
          return { isValid: true };
        }

        // If username doesn't match, check if it's an organization the user has access to
        try {
          // Check if the target is an organization
          const targetUser = await this.request('GET', `/users/${username}`);
          if (targetUser.type === 'Organization') {
            // Check if user has access to the organization
            const orgs = await this.request('GET', '/user/orgs');
            const hasOrgAccess = orgs.some(
              (org: any) => org.login.toLowerCase() === username.toLowerCase()
            );
            if (hasOrgAccess) {
              return { isValid: true };
            }
            return { isValid: false, error: 'Token does not have access to this organization' };
          }

          // If target is a user but not the authenticated user, token can't act as them
          return {
            isValid: false,
            error:
              'Token can only be used with your GitHub username or organizations you have access to',
          };
        } catch (error) {
          return { isValid: false, error: 'Invalid GitHub username or organization' };
        }
      } catch (error) {
        return { isValid: false, error: 'Invalid GitHub token' };
      }
    } catch (error) {
      console.error('Validation failed:', error);
      return { isValid: false, error: 'Validation failed' };
    }
  }

  async request(method: string, endpoint: string, body?: any, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      ...options,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorDetails;
      try {
        errorDetails = await response.json();
      } catch {
        // If parsing JSON fails, use the status text
        errorDetails = { message: response.statusText };
      }

      // Construct a more informative error message
      const errorMessage =
        errorDetails.message || errorDetails.error || 'Unknown GitHub API error';

      const fullErrorMessage = `GitHub API Error (${response.status}): ${errorMessage}`;

      // Create a custom error with additional properties
      const apiError = new Error(fullErrorMessage) as any;
      apiError.status = response.status;
      apiError.originalMessage = errorMessage;
      apiError.githubErrorResponse = errorDetails;

      throw apiError;
    }

    return await response.json();
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

  async createRepo(options: RepoCreateOptions) {
    try {
      // Try creating in user's account first
      try {
        return await this.request('POST', '/user/repos', {
          ...options,
          auto_init: true, // Initialize with README to create main branch
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
          // If user endpoint fails, try organization endpoint
          return await this.request('POST', `/orgs/${options.name}/repos`, {
            ...options,
            auto_init: true,
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
  }) {
    const { owner, repo, path, content, branch, message } = params;

    try {
      // Try to get existing file
      let sha: string | undefined;
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

  async listPublicRepos(username: string): Promise<
    Array<{
      name: string;
      description: string | null;
      html_url: string;
      created_at: string;
      updated_at: string;
      language: string | null;
    }>
  > {
    try {
      const repos = await this.request('GET', `/users/${username}/repos`, null, {
        headers: {
          per_page: '100', // Get up to 100 repos per page
        },
      });

      return repos
        .filter((repo: any) => !repo.private)
        .map((repo: any) => ({
          name: repo.name,
          description: repo.description,
          html_url: repo.html_url,
          created_at: repo.created_at,
          updated_at: repo.updated_at,
          language: repo.language,
        }));
    } catch (error) {
      console.error('Failed to fetch public repositories:', error);
      throw new Error(
        `Failed to fetch public repositories: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async listUserRepositories(username: string): Promise<
    Array<{
      name: string;
      description: string | null;
      html_url: string;
      private: boolean;
      created_at: string;
      updated_at: string;
      language: string | null;
    }>
  > {
    try {
      // First try user's repositories
      try {
        const repos = await this.request(
          'GET',
          `/users/${username}/repos?per_page=100&sort=updated`
        );
        return repos.map((repo: any) => ({
          name: repo.name,
          description: repo.description,
          html_url: repo.html_url,
          private: repo.private,
          created_at: repo.created_at,
          updated_at: repo.updated_at,
          language: repo.language,
        }));
      } catch (error) {
        // If user endpoint fails, try organization endpoint
        const repos = await this.request(
          'GET',
          `/orgs/${username}/repos?per_page=100&sort=updated`
        );
        return repos.map((repo: any) => ({
          name: repo.name,
          description: repo.description,
          html_url: repo.html_url,
          private: repo.private,
          created_at: repo.created_at,
          updated_at: repo.updated_at,
          language: repo.language,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
      throw new Error(
        `Failed to fetch repositories: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
