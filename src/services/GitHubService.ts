export const GITHUB_SIGNUP_URL = 'https://github.com/signup';
export const CREATE_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=delete_repo,repo&description=Bolt%20to%20GitHub&default_expires_at=none';
export const CREATE_FINE_GRAINED_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new';

// Import refactored services
import { GitHubApiClient } from './GitHubApiClient';
import { GitHubApiClientFactory } from './GitHubApiClientFactory';
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
  private tokenService!: ITokenService;
  private repositoryService!: IRepositoryService;
  private fileService!: IFileService;
  private repoCloneService!: IRepoCloneService;

  constructor(token: string) {
    // Legacy constructor for backward compatibility
    this.apiClient = new GitHubApiClient(token);
    this.initializeServices();
  }

  /**
   * Static factory method - RECOMMENDED for new code
   * Automatically chooses the best authentication method
   */
  static async createWithBestAuth(
    options: {
      patToken?: string;
      preferGitHubApp?: boolean;
      allowUpgrade?: boolean;
    } = {}
  ): Promise<GitHubService> {
    const { patToken, preferGitHubApp = true, allowUpgrade = false } = options;

    try {
      // Use factory to get the best available client
      const apiClient = await GitHubApiClientFactory.createApiClient(patToken, preferGitHubApp);

      // Create instance with the chosen API client
      const instance = new GitHubService(''); // Dummy token, will be replaced
      instance.apiClient = apiClient;
      instance.initializeServices();

      return instance;
    } catch (error: any) {
      console.error('Error creating GitHubService with factory:', error);

      // Fallback to PAT if provided
      if (patToken) {
        console.log('Falling back to legacy PAT-based GitHubService');
        return new GitHubService(patToken);
      }

      throw new Error(`Failed to create GitHubService: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Factory method specifically for new users (GitHub App preferred)
   */
  static async createForNewUser(): Promise<GitHubService> {
    return this.createWithBestAuth({ preferGitHubApp: true });
  }

  /**
   * Factory method for existing users with PAT
   * @param patToken User's PAT token
   * @param allowUpgrade Whether to allow upgrading to GitHub App
   */
  static async createForExistingUser(
    patToken: string,
    allowUpgrade: boolean = false
  ): Promise<GitHubService> {
    return this.createWithBestAuth({
      patToken,
      preferGitHubApp: allowUpgrade,
      allowUpgrade,
    });
  }

  /**
   * Get authentication status and recommendations
   * @param patToken Optional PAT token to check
   * @param checkBothMethods Whether to check both auth methods (for migration scenarios)
   */
  static async getAuthenticationStatus(patToken?: string, checkBothMethods: boolean = false) {
    return GitHubApiClientFactory.getAuthenticationStatus(patToken, checkBothMethods);
  }

  /**
   * Attempt to migrate from PAT to GitHub App
   * @param currentPatToken Current PAT token
   * @returns New GitHubService instance using GitHub App, or null if not possible
   */
  static async migrateToGitHubApp(currentPatToken: string): Promise<GitHubService | null> {
    try {
      const newApiClient = await GitHubApiClientFactory.migrateToGitHubApp(currentPatToken);
      if (newApiClient) {
        // Create instance with new API client
        const instance = new GitHubService(''); // Dummy token, will be replaced
        instance.apiClient = newApiClient;
        instance.initializeServices();
        return instance;
      }
      return null;
    } catch (error: any) {
      console.error('Error migrating to GitHub App:', error);
      return null;
    }
  }

  /**
   * Initialize all specialized services with the current API client
   */
  private initializeServices(): void {
    this.tokenService = new TokenService(this.apiClient);
    this.fileService = new FileService(this.apiClient);
    this.repoCloneService = new RepoCloneService(this.apiClient, this.fileService);
    this.repositoryService = new RepositoryService(
      this.apiClient,
      this.fileService,
      this.repoCloneService
    );
  }

  /**
   * Get the type of API client currently being used
   */
  getApiClientType(): 'pat' | 'github_app' | 'unknown' {
    return this.apiClient.getAuthType();
  }

  /**
   * Get authentication status and upgrade recommendations
   */
  async getAuthStatus(): Promise<{
    currentAuth: 'pat' | 'github_app' | 'unknown';
    canUpgradeToGitHubApp: boolean;
    recommendUpgrade: boolean;
    rateLimits?: any;
  }> {
    const currentAuth = this.getApiClientType();

    try {
      const authStatus = await GitHubApiClientFactory.getAuthenticationStatus();

      return {
        currentAuth,
        canUpgradeToGitHubApp: authStatus.hasGitHubApp && currentAuth === 'pat',
        recommendUpgrade: authStatus.hasGitHubApp && currentAuth === 'pat',
        rateLimits: authStatus.rateLimits,
      };
    } catch (error) {
      return {
        currentAuth,
        canUpgradeToGitHubApp: false,
        recommendUpgrade: false,
      };
    }
  }

  /**
   * Upgrade current instance to use GitHub App (if possible)
   * Returns true if upgrade was successful, false otherwise
   */
  async upgradeToGitHubApp(): Promise<boolean> {
    try {
      const newApiClient = await GitHubApiClientFactory.createApiClientForNewUser();

      // Only upgrade if we actually get a GitHub App client
      if (newApiClient.getAuthType() === 'github_app') {
        this.apiClient = newApiClient;
        this.initializeServices();
        console.log('✅ Successfully upgraded to GitHub App authentication');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to upgrade to GitHub App:', error);
      return false;
    }
  }

  // =============================================================================
  // PUBLIC API METHODS - Keep these unchanged for backward compatibility
  // =============================================================================

  async request(method: string, url: string, body?: any, headers?: Record<string, string>) {
    return this.apiClient.request(method, url, body, { headers });
  }

  async validateToken(): Promise<boolean> {
    return this.tokenService.validateToken();
  }

  async isClassicToken(): Promise<boolean> {
    return Promise.resolve(this.tokenService.isClassicToken());
  }

  async isFineGrainedToken(): Promise<boolean> {
    return Promise.resolve(this.tokenService.isFineGrainedToken());
  }

  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    return this.tokenService.validateTokenAndUser(username);
  }

  async verifyTokenPermissions(
    username: string,
    onProgress?: ProgressCallback
  ): Promise<{ isValid: boolean; error?: string }> {
    return this.tokenService.verifyTokenPermissions(username, onProgress);
  }

  // Repository methods - delegate to RepositoryService
  async repoExists(owner: string, repo: string): Promise<boolean> {
    return this.repositoryService.repoExists(owner, repo);
  }

  async getRepoInfo(owner: string, repo: string): Promise<any> {
    return this.repositoryService.getRepoInfo(owner, repo);
  }

  async createRepo(options: any) {
    return this.repositoryService.createRepo(options);
  }

  async ensureRepoExists(owner: string, repo: string): Promise<void> {
    return this.repositoryService.ensureRepoExists(owner, repo);
  }

  async isRepoEmpty(owner: string, repo: string): Promise<boolean> {
    return this.repositoryService.isRepoEmpty(owner, repo);
  }

  async initializeEmptyRepo(owner: string, repo: string, branch: string): Promise<void> {
    return this.repositoryService.initializeEmptyRepo(owner, repo, branch);
  }

  async listRepos(): Promise<Array<any>> {
    return this.repositoryService.listRepos();
  }

  async listBranches(
    owner: string,
    repo: string
  ): Promise<Array<{ name: string; isDefault: boolean }>> {
    return this.repositoryService.listBranches(owner, repo);
  }

  async deleteRepo(owner: string, repo: string): Promise<void> {
    return this.repositoryService.deleteRepo(owner, repo);
  }

  async updateRepoVisibility(owner: string, repo: string, makePrivate: boolean): Promise<void> {
    return this.repositoryService.updateRepoVisibility(owner, repo, makePrivate);
  }

  async cloneRepoContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string = 'main',
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return this.repositoryService.cloneRepoContents(
      sourceOwner,
      sourceRepo,
      targetOwner,
      targetRepo,
      branch,
      onProgress
    );
  }

  // File methods - delegate to specialized services
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
    return this.repositoryService.getCommitCount(owner, repo, branch);
  }

  async createTemporaryPublicRepo(
    ownerName: string,
    sourceRepoName: string,
    branch?: string
  ): Promise<string> {
    return this.repositoryService.createTemporaryPublicRepo(ownerName, sourceRepoName, branch);
  }

  // Issue management - keep existing methods
  async getIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    forceRefresh: boolean = false
  ): Promise<any[]> {
    let url = `/repos/${owner}/${repo}/issues?state=${state}&sort=created&direction=desc`;

    // Add cache-busting parameter when forcing refresh
    if (forceRefresh) {
      url += `&_refresh=${Date.now()}`;
    }

    return this.apiClient.request('GET', url);
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<any> {
    return this.apiClient.request('GET', `/repos/${owner}/${repo}/issues/${issueNumber}`);
  }

  async createIssue(
    owner: string,
    repo: string,
    issue: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
    }
  ): Promise<any> {
    return this.apiClient.request('POST', `/repos/${owner}/${repo}/issues`, issue);
  }

  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    update: {
      state?: 'open' | 'closed';
      title?: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
    }
  ): Promise<any> {
    return this.apiClient.request('PATCH', `/repos/${owner}/${repo}/issues/${issueNumber}`, update);
  }

  async addIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    comment: { body: string }
  ): Promise<any> {
    return this.apiClient.request(
      'POST',
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      comment
    );
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
    }

    return this.createIssue('mamertofabian', 'bolt-to-github', {
      title: issueTitle,
      body: issueBody,
      labels: ['feedback', feedback.category],
    });
  }
}
