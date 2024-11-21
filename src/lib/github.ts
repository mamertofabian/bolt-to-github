interface GitHubFileResponse {
  sha?: string;
  content?: string;
}

export class GitHubService {
  private baseUrl = 'https://api.github.com';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API Error: ${response.status} ${error}`);
    }

    return response.json();
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
        `/repos/${owner}/${repo}/contents/${path}`,
        {
          method: 'PUT',
          body: JSON.stringify(body)
        }
      );
    } catch (error) {
      console.error('GitHub API Error:', error);
      throw new Error(`Failed to push file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
