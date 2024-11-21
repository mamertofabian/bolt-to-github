import { Octokit } from '@octokit/rest';

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
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
        if (!Array.isArray(data)) {
          sha = data.sha;
        }
      } catch (error: unknown) {
        // File doesn't exist, which is fine
      }

      // Create or update file
      return await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content,
        branch,
        sha
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to push file: ${errorMessage}`);
    }
  }
}
