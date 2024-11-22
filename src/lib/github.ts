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

  async request(method: string, endpoint: string, body?: any, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      ...options,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitHub API Error: ${response.status} ${error.message || JSON.stringify(error)}`);
    }

    return response.json();
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
          auto_init: true // Initialize with README to create main branch
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
          // If user endpoint fails, try organization endpoint
          return await this.request('POST', `/orgs/${options.name}/repos`, {
            ...options,
            auto_init: true
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Failed to create repository:', error);
      throw new Error(`Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async ensureRepoExists(owner: string, repo: string): Promise<void> {
    const exists = await this.repoExists(owner, repo);
    if (!exists) {
      await this.createRepo({
        name: repo,
        private: true,
        auto_init: true,
        description: 'Repository created by Bolt to GitHub extension'
      });
      
      // Wait a bit for GitHub to initialize the repository
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
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
        const response: GitHubFileResponse = await this.request('GET', 
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
        ...(sha ? { sha } : {})
      };

      return await this.request(
        'PUT',
        `/repos/${owner}/${repo}/contents/${path}`,
        body
      );
    } catch (error) {
      console.error('GitHub API Error:', error);
      throw new Error(`Failed to push file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
