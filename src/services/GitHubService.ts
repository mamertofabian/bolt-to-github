export const GITHUB_SIGNUP_URL = 'https://github.com/signup';
export const CREATE_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=delete_repo,repo&description=Bolt%20to%20GitHub&default_expires_at=none';
export const CREATE_FINE_GRAINED_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new';

// Import refactored services
import { GitHubApiClient } from './GitHubApiClient';
import { TokenService } from './TokenService';
import { RepositoryService } from './RepositoryService';
import { FileService } from './FileService';
import { RepoCloneService } from './RepoCloneService';
import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import type { ITokenService } from './interfaces/ITokenService';
import type { IRepositoryService } from './interfaces/IRepositoryService';
import type { IFileService } from './interfaces/IFileService';
import type { IRepoCloneService } from './interfaces/IRepoCloneService';
import type { ProgressCallback } from './types/common';

export class GitHubService {
  // Refactored components
  private apiClient: IGitHubApiClient;
  private tokenService: ITokenService;
  private repositoryService: IRepositoryService;
  private fileService: IFileService;
  private repoCloneService: IRepoCloneService;

  constructor(token: string) {
    // Initialize components
    this.apiClient = new GitHubApiClient(token);
    this.tokenService = new TokenService(this.apiClient);
    this.fileService = new FileService(this.apiClient);
    this.repoCloneService = new RepoCloneService(this.apiClient, this.fileService);
    this.repositoryService = new RepositoryService(
      this.apiClient,
      this.fileService,
      this.repoCloneService
    );
  }

  // Legacy methods TODO: Remove after refactoring
  async request(method: string, url: string, body?: any, headers?: Record<string, string>) {
    return this.apiClient.request(method, url, body, headers);
  }

  async validateToken(): Promise<boolean> {
    // Use the new TokenService instead of the legacy validator
    return this.tokenService.validateToken();
  }

  async isClassicToken(): Promise<boolean> {
    // Use the new TokenService
    return Promise.resolve(this.tokenService.isClassicToken());
  }

  async isFineGrainedToken(): Promise<boolean> {
    // Use the new TokenService
    return Promise.resolve(this.tokenService.isFineGrainedToken());
  }

  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    // Use the new TokenService
    return this.tokenService.validateTokenAndUser(username);
  }

  async verifyTokenPermissions(
    username: string,
    onProgress?: ProgressCallback
  ): Promise<{ isValid: boolean; error?: string }> {
    // Use the new TokenService
    return this.tokenService.verifyTokenPermissions(username, onProgress);
  }

  async repoExists(owner: string, repo: string): Promise<boolean> {
    // Use the new repositoryService
    return this.repositoryService.repoExists(owner, repo);
  }

  async getRepoInfo(owner: string, repo: string): Promise<any> {
    // Use the new repositoryService
    return this.repositoryService.getRepoInfo(owner, repo);
  }

  async createRepo(options: any) {
    // Use the new repositoryService
    return this.repositoryService.createRepo(options);
  }

  async ensureRepoExists(owner: string, repo: string): Promise<void> {
    // Use the new repositoryService
    return this.repositoryService.ensureRepoExists(owner, repo);
  }

  async isRepoEmpty(owner: string, repo: string): Promise<boolean> {
    // Use the new repositoryService
    return this.repositoryService.isRepoEmpty(owner, repo);
  }

  async initializeEmptyRepo(owner: string, repo: string, branch: string): Promise<void> {
    // Use the new repositoryService
    return this.repositoryService.initializeEmptyRepo(owner, repo, branch);
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
    const { owner, repo, path, content, branch, message } = params;
    // Use the new fileService
    return this.fileService.writeFile(
      owner,
      repo,
      path,
      atob(content), // Decode base64 content
      branch,
      message
    );
  }

  async getCommitCount(owner: string, repo: string, branch: string): Promise<number> {
    // Use the new repositoryService
    return this.repositoryService.getCommitCount(owner, repo, branch);
  }

  async createTemporaryPublicRepo(
    ownerName: string,
    sourceRepoName: string,
    branch?: string
  ): Promise<string> {
    // Use the new repositoryService
    return this.repositoryService.createTemporaryPublicRepo(ownerName, sourceRepoName, branch);
  }

  async cloneRepoContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string = 'main',
    onProgress?: (progress: number) => void
  ): Promise<void> {
    // Use the new repositoryService
    return this.repositoryService.cloneRepoContents(
      sourceOwner,
      sourceRepo,
      targetOwner,
      targetRepo,
      branch,
      onProgress
    );
  }

  async deleteRepo(owner: string, repo: string): Promise<void> {
    // Use the new repositoryService
    return this.repositoryService.deleteRepo(owner, repo);
  }

  async updateRepoVisibility(owner: string, repo: string, makePrivate: boolean): Promise<void> {
    // Use the new repositoryService
    return this.repositoryService.updateRepoVisibility(owner, repo, makePrivate);
  }

  async listRepos(): Promise<Array<any>> {
    // Use the new repositoryService
    return this.repositoryService.listRepos();
  }

  async listBranches(
    owner: string,
    repo: string
  ): Promise<Array<{ name: string; isDefault: boolean }>> {
    // Use the new repositoryService
    return this.repositoryService.listBranches(owner, repo);
  }

  // Feedback functionality
  async createIssue(
    owner: string,
    repo: string,
    issue: {
      title: string;
      body: string;
      labels?: string[];
      assignees?: string[];
    }
  ): Promise<any> {
    return this.apiClient.request('POST', `/repos/${owner}/${repo}/issues`, issue);
  }

  async submitFeedback(feedback: {
    category: 'appreciation' | 'question' | 'bug' | 'feature' | 'other';
    message: string;
    email?: string;
    metadata?: {
      browserInfo: string;
      extensionVersion: string;
      url?: string;
    };
  }): Promise<any> {
    // Convert feedback to GitHub issue format
    const issueTitle = `[${feedback.category.toUpperCase()}] User Feedback`;

    let issueBody = `## User Feedback\n\n`;
    issueBody += `**Category:** ${feedback.category}\n\n`;
    issueBody += `**Message:**\n${feedback.message}\n\n`;

    if (feedback.email) {
      issueBody += `**Contact:** ${feedback.email}\n\n`;
    }

    if (feedback.metadata) {
      issueBody += `**Extension Version:** ${feedback.metadata.extensionVersion}\n`;
      issueBody += `**Browser Info:** ${feedback.metadata.browserInfo}\n`;
      if (feedback.metadata.url) {
        issueBody += `**Page URL:** ${feedback.metadata.url}\n`;
      }
    }

    // Create issue in the extension's repository
    return this.createIssue('mamertofabian', 'bolt-to-github', {
      title: issueTitle,
      body: issueBody,
      labels: ['feedback', feedback.category],
    });
  }
}
