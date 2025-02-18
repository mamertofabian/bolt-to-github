import { BaseGitService, type ProgressCallback } from './BaseGitService';
import type { UploadProgress } from '../lib/types';

export const GITLAB_API_VERSION = 'v4';
export const GITLAB_BASE_URL = 'https://gitlab.com/api';
export const GITLAB_SIGNUP_URL = 'https://gitlab.com/users/sign_up';
export const CREATE_TOKEN_URL =
  'https://gitlab.com/-/profile/personal_access_tokens?name=Bolt%20to%20GitLab&scopes=api,read_api,read_user,read_repository,write_repository';

interface GitLabFileResponse {
  file_path: string;
  branch: string;
  content: string;
  commit_message: string;
  encoding?: string;
}

interface GitLabCommitResponse {
  id: string;
  short_id: string;
  title: string;
  message: string;
  created_at: string;
}

// Project creation interface removed

import { GitLabTokenValidator } from './GitLabTokenValidator';

export class GitLabService extends BaseGitService {
  private tokenValidator: GitLabTokenValidator;

  constructor(token: string) {
    super(token);
    this.tokenValidator = new GitLabTokenValidator(token);
  }

  protected getRequestHeaders(): Record<string, string> {
    return {
      'PRIVATE-TOKEN': this.token
    };
  }

  async request(method: string, endpoint: string, body?: any, options: RequestInit = {}) {
    return super.request(method, endpoint, body, {
      ...options,
      headers: { ...this.getRequestHeaders(), ...options.headers }
    });
  }

  async createTemporaryPublicProject(owner: string, sourceRepo: string): Promise<string> {
    const tempName = `temp-${Date.now()}`;
    await this.request('POST', '/projects', {
      name: tempName,
      visibility: 'public',
      namespace_id: await this.getNamespaceId(owner)
    });
    return tempName;
  }

  async cloneProjectContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string,
    progressCallback: (progress: number) => void
  ): Promise<void> {
    const sourceProject = encodeURIComponent(`${sourceOwner}/${sourceRepo}`);
    const targetProject = encodeURIComponent(`${targetOwner}/${targetRepo}`);
    
    // Get source repository tree
    const tree = await this.request(
      'GET',
      `/projects/${sourceProject}/repository/tree?recursive=true`
    );

    let completed = 0;
    const total = tree.length;

    for (const item of tree) {
      if (item.type === 'blob') {
        const content = await this.request(
          'GET',
          `/projects/${sourceProject}/repository/files/${encodeURIComponent(item.path)}/raw?ref=${branch}`
        );

        await this.request(
          'POST',
          `/projects/${targetProject}/repository/files/${encodeURIComponent(item.path)}`,
          {
            branch,
            content: content,
            commit_message: `Clone ${item.path} from ${sourceRepo}`
          }
        );

        completed++;
        progressCallback(completed / total);
      }
    }
  }

  private async getNamespaceId(owner: string): Promise<number> {
    const namespaces = await this.request('GET', '/namespaces', { search: owner });
    const namespace = namespaces.find((ns: any) => ns.path === owner);
    if (!namespace) {
      throw new Error(`Namespace not found for owner: ${owner}`);
    }
    return namespace.id;
  }
  protected get baseUrl(): string {
    return GITLAB_BASE_URL;
  }

  protected get apiVersion(): string {
    return GITLAB_API_VERSION;
  }

  protected get acceptHeader(): string {
    return 'application/json';
  }

  protected async handleError(response: Response): Promise<Error> {
    let errorDetails;
    try {
      errorDetails = await response.json();
    } catch {
      errorDetails = { message: response.statusText };
    }

    const message = errorDetails.message || errorDetails.error || 'Unknown GitLab API error';
    const apiError = new Error(`GitLab API Error (${response.status}): ${message}`) as any;
    apiError.status = response.status;
    apiError.originalMessage = message;
    apiError.gitlabErrorResponse = errorDetails;

    switch (response.status) {
      case 401:
        return new Error('Invalid GitLab token. Please check your settings.');
      case 403:
        return new Error('Insufficient permissions for this GitLab operation.');
      case 404:
        return new Error('GitLab resource not found.');
      case 429: {
        const retryAfter = response.headers.get('Retry-After');
        return new Error(
          `GitLab API rate limit exceeded. Please try again ${
            retryAfter ? `after ${retryAfter} seconds` : 'later'
          }.`
        );
      }
      case 500:
        return new Error('GitLab server error. Please try again later.');
      default:
        return apiError;
    }
  }

    async verifyTokenPermissions(
    username: string,
    onProgress?: ProgressCallback
  ): Promise<{ isValid: boolean; error?: string }> {
    return this.tokenValidator.verifyTokenPermissions(username, onProgress);
  }


  // Project creation removed - users must provide existing project URL

  public async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      // First verify the token is valid by getting user info
      const user = await this.request('GET', '/user');
      if (!user.username) {
        return { isValid: false, error: 'Invalid GitLab token' };
      }

      // Then verify the user has access to the specified namespace
      const namespaces = await this.request('GET', '/namespaces', { search: username });
      const hasAccess = namespaces.some((ns: any) => ns.path === username);

      if (!hasAccess) {
        return {
          isValid: false,
          error: 'Token can only be used with your GitLab username or organizations you have access to'
        };
      }

      return { isValid: true };
    } catch (error: any) {
      if (error.status === 401) {
        return { isValid: false, error: 'Invalid GitLab token' };
      }
      if (error.status === 404) {
        return { isValid: false, error: 'Invalid GitLab username or organization' };
      }
      return { isValid: false, error: error.message || 'Failed to validate GitLab token' };
    }
  }

  async listRepos(): Promise<Array<{
    name: string;
    description: string | null;
    web_url: string;
    visibility: string;
    created_at: string;
    last_activity_at: string;
  }>> {
    try {
      const projects = await this.request('GET', '/projects?membership=true');
      return projects;
    } catch (error) {
      console.error('Failed to load repos:', error);
      throw error;
    }
  }


  async ensureProjectExists(owner: string, name: string): Promise<void> {
    // Only check if project exists, don't create it
    await this.request('GET', `/projects/${encodeURIComponent(`${owner}/${name}`)}`);
  }

  async isProjectEmpty(owner: string, name: string): Promise<boolean> {
    try {
      const commits = await this.request(
        'GET',
        `/projects/${encodeURIComponent(`${owner}/${name}`)}/repository/commits`
      );
      return Array.isArray(commits) && commits.length === 0;
    } catch (error) {
      return true;
    }
  }

  async updateProjectVisibility(
    owner: string,
    name: string,
    visibility: 'private' | 'public'
  ): Promise<void> {
    await this.request('PUT', `/projects/${encodeURIComponent(`${owner}/${name}`)}`, {
      visibility
    });
  }

  async deleteProject(owner: string, name: string): Promise<void> {
    await this.request('DELETE', `/projects/${encodeURIComponent(`${owner}/${name}`)}`);
  }

  protected async uploadFile(
    path: string,
    content: string,
    options: { message?: string; branch?: string } = {}
  ): Promise<GitLabFileResponse> {
    const response = await this.request(
      'POST',
      `/repository/files/${encodeURIComponent(path)}`,
      {
        file_path: path,
        branch: options.branch || 'main',
        content,
        commit_message: options.message || 'Update file via Bolt to GitLab'
      }
    );
    return response as GitLabFileResponse;
  }

  protected async downloadFile(
    path: string
  ): Promise<GitLabFileResponse> {
    const response = await this.request(
      'GET',
      `/repository/files/${encodeURIComponent(path)}`,
      { ref: 'main' }
    );
    return response as GitLabFileResponse;
  }

  public async getCommits(
    owner: string,
    repo: string,
    options: { branch?: string; path?: string } = {}
  ): Promise<GitLabCommitResponse[]> {
    const response = await this.request(
      'GET',
      `/projects/${encodeURIComponent(`${owner}/${repo}`)}/repository/commits`,
      {
        ref_name: options.branch || 'main',
        path: options.path
      }
    );
    return response as GitLabCommitResponse[];
  }
}
