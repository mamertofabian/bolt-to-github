import { BaseGitService } from './BaseGitService';
import type { ProgressCallback, UploadProgress } from '../lib/types';

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

interface ProjectCreateOptions {
  name: string;
  visibility?: 'private' | 'public';
  description?: string;
  initialize_with_readme?: boolean;
  auto_devops_enabled?: boolean;
  path?: string;
  namespace_id?: number;
}

export class GitLabService extends BaseGitService {
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
    
    switch (response.status) {
      case 401:
        return new Error('Invalid GitLab token. Please check your settings.');
      case 403:
        return new Error('Insufficient permissions for this GitLab operation.');
      case 404:
        return new Error('GitLab resource not found.');
      case 429:
        const retryAfter = response.headers.get('Retry-After');
        return new Error(
          `GitLab API rate limit exceeded. Please try again ${
            retryAfter ? `after ${retryAfter} seconds` : 'later'
          }.`
        );
      case 500:
        return new Error('GitLab server error. Please try again later.');
      default:
        const apiError = new Error(`GitLab API Error (${response.status}): ${message}`) as any;
        apiError.status = response.status;
        apiError.originalMessage = message;
        apiError.gitlabErrorResponse = errorDetails;
        return apiError;
  }

  async createProject(
    name: string,
    options: { visibility?: 'private' | 'public'; description?: string; path?: string } = {}
  ): Promise<any> {
    return this.request('POST', '/projects', {
      name,
      visibility: options.visibility || 'private',
      description: options.description || 'Repository created by Bolt to GitLab extension',
      initialize_with_readme: true,
      auto_devops_enabled: false,
      path: options.path || name.toLowerCase().replace(/\s+/g, '-')
    });
  }

  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
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

  async ensureProjectExists(owner: string, name: string): Promise<void> {
    try {
      await this.request('GET', `/projects/${encodeURIComponent(`${owner}/${name}`)}`);
    } catch (error: any) {
      if (error.status === 404) {
        await this.createProject(name);
      } else {
        throw error;
      }
    }
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

  async getCommits(
    owner: string,
    repo: string,
    options: { branch?: string; path?: string } = {}
  ): Promise<GitLabCommitResponse[]> {
    return this.request('GET', `/projects/${encodeURIComponent(`${owner}/${repo}`)}/repository/commits`, {
      ref_name: options.branch || 'main',
      path: options.path
    }) as Promise<GitLabCommitResponse[]>;
  }
}
