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
