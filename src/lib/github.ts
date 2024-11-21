import { Octokit } from '@octokit/rest';

const createOctokit = (token: string) => {
  try {
    return new Octokit({ 
      auth: token,
      userAgent: 'bolt-zip-to-github-extension/1.0.0'
    });
  } catch (error) {
    console.error('Failed to create Octokit instance:', error);
    throw error;
  }
};

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = createOctokit(token);
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
      // Check if file exists
      let sha: string | undefined;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner,
          repo,
          path,
          ref: branch
        });
        
        if ('sha' in data) {
          sha = data.sha;
        }
      } catch (error) {
        // File doesn't exist, which is fine
        console.log('File does not exist yet, will create new');
      }

      // Create or update file
      return await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content,
        branch,
        ...(sha ? { sha } : {})
      });
    } catch (error) {
      console.error('GitHub API Error:', error);
      throw new Error(`Failed to push file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
