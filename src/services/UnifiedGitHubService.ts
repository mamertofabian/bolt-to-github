/**
 * Unified GitHub Service
 * GitHub API facade backed exclusively by GitHub App authentication.
 */

import type { IAuthenticationStrategy } from './interfaces/IAuthenticationStrategy';
import type { AuthenticationConfig } from './types/authentication';
import { GitHubAppAuthenticationStrategy } from './GitHubAppAuthenticationStrategy';
import { createLogger } from '$lib/utils/logger';
import type {
  GitHubBranch,
  GitHubComment,
  GitHubCreateOrUpdateFileRequest,
  GitHubFileResponse,
  GitHubIssue,
  GitHubIssueUpdate,
  GitHubRepository,
  GitHubTreeItem,
} from './types/repository';

const logger = createLogger('UnifiedGitHubService');

export class UnifiedGitHubService {
  private static sharedIdentity: string | null = null;
  private static sharedStrategy: GitHubAppAuthenticationStrategy | null = null;
  private strategy: GitHubAppAuthenticationStrategy | null = null;
  private boundIdentity: string | null = null;
  private readonly initializationPromise: Promise<void>;

  /**
   * Create a GitHub App-backed service.
   *
   * The runtime guard keeps JavaScript callers from silently treating a legacy
   * token string as valid configuration after the TypeScript surface narrows.
   */
  constructor(authConfig: AuthenticationConfig = { type: 'github_app' }) {
    if (!authConfig || typeof authConfig !== 'object' || authConfig.type !== 'github_app') {
      throw new Error('GitHub App authentication is required');
    }

    this.initializationPromise = this.initializeStrategy();
  }

  /**
   * Share token acquisition only between facades bound to the same signed-in
   * Bolt2GitHub identity. Keeping the identity and strategy in one slot avoids
   * an unbounded token-keyed cache while retaining cross-facade single-flight.
   */
  private static getSharedStrategy(userToken: string): GitHubAppAuthenticationStrategy {
    if (!this.sharedStrategy || this.sharedIdentity !== userToken) {
      const strategy = new GitHubAppAuthenticationStrategy();
      strategy.setUserToken(userToken);
      this.sharedIdentity = userToken;
      this.sharedStrategy = strategy;
    }

    return this.sharedStrategy;
  }

  private static clearSharedStrategy(): void {
    this.sharedIdentity = null;
    this.sharedStrategy = null;
  }

  /**
   * Bind the strategy to the current Bolt2GitHub bearer identity when one is
   * available. GitHubAppService performs the final live credential check.
   */
  private async initializeStrategy(): Promise<void> {
    const userToken = await this.getUserToken();

    if (userToken) {
      logger.info('✅ Found user token for GitHub App authentication');
      this.boundIdentity = userToken;
      this.strategy = UnifiedGitHubService.getSharedStrategy(userToken);
    } else {
      logger.warn('⚠️ No user token found - GitHub App authentication may fail');
      UnifiedGitHubService.clearSharedStrategy();
      this.strategy = new GitHubAppAuthenticationStrategy();
    }
  }

  /**
   * Get Supabase project reference from configuration
   */
  private async getSupabaseProjectRef(): Promise<string> {
    try {
      const { SUPABASE_CONFIG } = await import('../lib/constants/supabase');
      return SUPABASE_CONFIG.URL.split('://')[1].split('.')[0];
    } catch (error) {
      logger.warn('Failed to get Supabase project ref:', error);
      return 'unknown';
    }
  }

  /**
   * Get the current authentication strategy
   */
  private async getStrategy(requireCurrentIdentity = true): Promise<IAuthenticationStrategy> {
    await this.initializationPromise;

    if (!this.strategy) {
      throw new Error('GitHub App authentication is required');
    }

    if (
      requireCurrentIdentity &&
      this.boundIdentity &&
      UnifiedGitHubService.sharedIdentity !== this.boundIdentity
    ) {
      throw new Error(
        'Bolt2GitHub account changed. Please retry after signing in and connecting the GitHub App.'
      );
    }

    return this.strategy;
  }

  /**
   * Get user token from various storage locations
   * Tries multiple patterns used by SupabaseAuthService
   */
  private async getUserToken(): Promise<string | undefined> {
    try {
      // Get all possible storage keys
      const supabaseProjectRef = await this.getSupabaseProjectRef();
      const potentialKeys = [
        'supabaseToken',
        `sb-${supabaseProjectRef}-auth-token`,
        `sb-${supabaseProjectRef}-auth-user`,
        'supabase.auth.token',
        'supabase.session',
      ];

      // Check local storage first
      for (const key of potentialKeys) {
        try {
          const result = await chrome.storage.local.get([key]);
          const data = result[key];

          if (data) {
            // Handle different token storage formats
            if (typeof data === 'string') {
              return data;
            } else if (data.access_token) {
              return data.access_token;
            } else if (data.session?.access_token) {
              return data.session.access_token;
            }
          }
        } catch (error) {
          logger.debug(`Failed to get token from key ${key}:`, error);
        }
      }

      logger.warn('⚠️ No user token found in any storage location');
      return undefined;
    } catch (error) {
      logger.warn('Failed to get user token:', error);
      return undefined;
    }
  }

  /**
   * Get a valid token for GitHub API calls
   */
  private async getToken(): Promise<string> {
    const strategy = await this.getStrategy();
    return await strategy.getToken();
  }

  // ========================================
  // GitHub API methods
  // ========================================

  /**
   * Validate the GitHub App connection and return its user information.
   */
  async validateTokenAndUser(repoOwner: string): Promise<{
    isValid: boolean;
    error?: string;
    userInfo?: {
      login: string;
      id: number;
      avatar_url: string;
    };
    scopes?: string[];
  }> {
    try {
      const strategy = await this.getStrategy();
      const result = await strategy.validateAuth(repoOwner);

      if (!result.isValid) {
        return {
          isValid: false,
          error: result.error,
        };
      }

      return {
        isValid: true,
        userInfo: result.userInfo,
        scopes: result.scopes,
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Check if repository exists
   */
  async repoExists(owner: string, repo: string): Promise<boolean> {
    try {
      const token = await this.getToken();
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get repository information
   */
  async getRepoInfo(owner: string, repo: string): Promise<GitHubRepository> {
    try {
      const token = await this.getToken();
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (response.status === 404) {
        // Repository doesn't exist
        return {
          name: repo,
          exists: false,
        } as GitHubRepository;
      }

      if (!response.ok) {
        throw new Error(`Failed to get repository info: ${response.statusText}`);
      }

      const repoData = await response.json();
      return {
        name: repoData.name,
        description: repoData.description,
        private: repoData.private,
        exists: true,
        // Include all original data for backward compatibility
        ...repoData,
      };
    } catch (error) {
      // If it's a network error or other issue, assume repo doesn't exist
      if (error instanceof Error && error.message.includes('404')) {
        return {
          name: repo,
          exists: false,
        } as GitHubRepository;
      }
      throw error;
    }
  }

  /**
   * Create repository
   */
  async createRepo(
    repoName: string,
    isPrivate: boolean = true,
    description?: string
  ): Promise<GitHubRepository> {
    const token = await this.getToken();
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: repoName,
        private: isPrivate,
        description: description || '',
        auto_init: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create repository: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Ensure repository exists (create if it doesn't)
   */
  async ensureRepoExists(
    owner: string,
    repo: string,
    isPrivate: boolean = true
  ): Promise<GitHubRepository> {
    if (await this.repoExists(owner, repo)) {
      return await this.getRepoInfo(owner, repo);
    }
    return await this.createRepo(repo, isPrivate);
  }

  /**
   * Check if repository is empty
   */
  async isRepoEmpty(owner: string, repo: string): Promise<boolean> {
    try {
      const token = await this.getToken();
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (response.status === 404) {
        const data = await response.json();
        return data.message === 'This repository is empty.';
      }

      return response.status !== 200;
    } catch {
      return false;
    }
  }

  /**
   * Initialize empty repository
   */
  async initializeEmptyRepo(owner: string, repo: string, branch: string = 'main'): Promise<void> {
    const token = await this.getToken();

    // Create initial commit with .gitkeep file
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.gitkeep`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Initialize repository',
          content: btoa(''),
          branch,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to initialize repository: ${response.statusText}`);
    }
  }

  /**
   * Delete repository
   */
  async deleteRepo(owner: string, repo: string): Promise<void> {
    const token = await this.getToken();
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete repository: ${response.statusText}`);
    }
  }

  /**
   * Update repository visibility
   */
  async updateRepoVisibility(
    owner: string,
    repo: string,
    isPrivate: boolean
  ): Promise<GitHubRepository> {
    const token = await this.getToken();
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        private: isPrivate,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update repository visibility: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * List repositories
   */
  async listRepos(): Promise<GitHubRepository[]> {
    const token = await this.getToken();
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list repositories: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * List branches
   */
  async listBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    const token = await this.getToken();
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list branches: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get commit count for a repository branch
   * @param owner Repository owner
   * @param repo Repository name
   * @param branch Branch name (default: 'main')
   * @param maxCommits Maximum number of commits to fetch (default: 100)
   */
  async getCommitCount(
    owner: string,
    repo: string,
    branch: string = 'main',
    maxCommits: number = 100
  ): Promise<number> {
    const token = await this.getToken();

    try {
      // Get commits by fetching pages until we reach the end or hit the limit
      let totalCommits = 0;
      let page = 1;
      const perPage = 100;
      const maxPages = Math.min(100, Math.ceil(maxCommits / perPage)); // Don't exceed maxCommits
      let hasNextPage = true;

      while (hasNextPage && page <= maxPages && totalCommits < maxCommits) {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}&page=${page}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            return totalCommits;
          }
          throw new Error(`Failed to get commit count: ${response.statusText}`);
        }

        const commits = await response.json();

        if (!Array.isArray(commits) || commits.length === 0) {
          break;
        }

        const commitsToAdd = Math.min(commits.length, maxCommits - totalCommits);
        totalCommits += commitsToAdd;
        hasNextPage = commits.length === perPage;
        page++;
      }

      return totalCommits;
    } catch (error) {
      logger.warn(`Failed to get commit count for ${owner}/${repo}:${branch}:`, error);
      return 0;
    }
  }

  /**
   * Push file (maintains exact API compatibility)
   */
  async pushFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string = 'main',
    sha?: string
  ): Promise<GitHubFileResponse> {
    const token = await this.getToken();
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const body: GitHubCreateOrUpdateFileRequest = {
      message,
      content: btoa(content),
      branch,
    };

    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to push file: ${response.statusText}`);
    }

    return await response.json();
  }

  // ========================================
  // Issue Management Methods
  // ========================================

  async getIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    forceRefresh: boolean = false
  ): Promise<GitHubIssue[]> {
    const token = await this.getToken();

    // Build URL with cache-busting for force refresh
    let url = `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}`;
    if (forceRefresh) {
      url += `&_t=${Date.now()}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    };

    // Add cache-busting headers for force refresh
    if (forceRefresh) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
    }

    logger.info('🌐 GitHub API call:', { url, forceRefresh });

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to get issues: ${response.statusText}`);
    }

    return await response.json();
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const token = await this.getToken();
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get issue: ${response.statusText}`);
    }

    return await response.json();
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
  ): Promise<GitHubIssue> {
    const token = await this.getToken();
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: issue.title,
        body: issue.body || '',
        labels: issue.labels || [],
        assignees: issue.assignees || [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create issue: ${response.statusText}`);
    }

    return await response.json();
  }

  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    title?: string,
    body?: string,
    state?: 'open' | 'closed'
  ): Promise<GitHubIssue> {
    const token = await this.getToken();
    const updateData: Partial<GitHubIssueUpdate> = {};

    if (title !== undefined) updateData.title = title;
    if (body !== undefined) updateData.body = body;
    if (state !== undefined) updateData.state = state;

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update issue: ${response.statusText}`);
    }

    return await response.json();
  }

  async addIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<GitHubComment> {
    const token = await this.getToken();
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to add issue comment: ${response.statusText}`);
    }

    return await response.json();
  }

  async submitFeedback(feedback: {
    category: 'appreciation' | 'question' | 'bug' | 'feature' | 'other';
    message: string;
    metadata?: {
      browserInfo: string;
      extensionVersion: string;
    };
  }): Promise<GitHubIssue> {
    // Convert feedback to GitHub issue format
    const issueTitle = `[${feedback.category.toUpperCase()}] User Feedback`;

    let issueBody = `## User Feedback\n\n`;
    issueBody += `**Category:** ${feedback.category}\n\n`;
    issueBody += `**Message:**\n${feedback.message}\n\n`;

    if (feedback.metadata) {
      issueBody += `## Technical Information\n\n`;
      issueBody += `**Extension Version:** ${feedback.metadata.extensionVersion}\n`;
      issueBody += `**Browser Info:** ${feedback.metadata.browserInfo}\n`;
    }

    // Submit to the extension's feedback repository
    return await this.createIssue('mamertofabian', 'bolt-to-github', {
      title: issueTitle,
      body: issueBody,
      labels: ['feedback', feedback.category],
    });
  }

  // ========================================
  // Repository Cloning Methods
  // ========================================

  async cloneRepoContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string = 'main',
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      // Get all files from the source repository
      const token = await this.getToken();

      if (onProgress) onProgress(10);

      // Get the repository tree
      const treeResponse = await fetch(
        `https://api.github.com/repos/${sourceOwner}/${sourceRepo}/git/trees/${branch}?recursive=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!treeResponse.ok) {
        throw new Error(`Failed to get repository tree: ${treeResponse.statusText}`);
      }

      const tree = (await treeResponse.json()) as {
        tree: GitHubTreeItem[];
        sha: string;
        url: string;
        truncated: boolean;
      };
      const files = tree.tree.filter((item: GitHubTreeItem) => item.type === 'blob');

      if (onProgress) onProgress(30);

      // Copy files one by one
      let processedFiles = 0;
      const totalFiles = files.length;

      for (const file of files) {
        try {
          // Get file content
          const fileResponse = await fetch(file.url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          });

          if (fileResponse.ok) {
            const fileData = await fileResponse.json();

            // Decode content if it's base64 encoded
            let content = fileData.content;
            if (fileData.encoding === 'base64') {
              try {
                content = atob(content.replace(/\n/g, ''));
              } catch (error) {
                logger.warn(`Failed to decode base64 content for ${file.path}:`, error);
                continue; // Skip this file and continue with the next one
              }
            }

            // Push file to target repository
            await this.pushFile(
              targetOwner,
              targetRepo,
              file.path,
              content,
              `Clone from ${sourceOwner}/${sourceRepo}`,
              branch
            );
          }
        } catch (error) {
          logger.warn(`Failed to copy file ${file.path}:`, error);
        }

        processedFiles++;
        if (onProgress) {
          const progress = 30 + Math.floor((processedFiles / totalFiles) * 60);
          onProgress(progress);
        }
      }

      if (onProgress) onProgress(100);
    } catch (error) {
      logger.error('Failed to clone repository contents:', error);
      throw error;
    }
  }

  async createTemporaryPublicRepo(
    ownerName: string,
    sourceRepoName: string,
    branch: string = 'main'
  ): Promise<string> {
    try {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const tempRepoName = `temp-${sourceRepoName}-${timestamp}-${randomStr}`;

      // Create the temporary repository as private initially
      await this.createRepo(
        tempRepoName,
        true,
        'Temporary repository for Bolt import - will be deleted automatically'
      );

      // Initialize with an empty commit to create the specified branch
      await this.pushFile(
        ownerName,
        tempRepoName,
        '.gitkeep',
        '',
        `Initialize repository with branch '${branch}'`,
        branch
      );

      return tempRepoName;
    } catch (error) {
      logger.error('Failed to create temporary public repository:', error);
      throw error;
    }
  }

  // ========================================
  // Legacy/Compatibility Methods
  // ========================================

  /**
   * Legacy request method (marked for removal in original service)
   */
  async request<T = unknown>(method: string, endpoint: string, data?: unknown): Promise<T> {
    const token = await this.getToken();

    // Ensure proper URL construction
    let url: string;
    if (endpoint.startsWith('http')) {
      url = endpoint;
    } else {
      // Ensure endpoint starts with '/'
      const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      url = `https://api.github.com${normalizedEndpoint}`;
    }

    const options: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
    };

    if (
      data &&
      (method.toUpperCase() === 'POST' ||
        method.toUpperCase() === 'PUT' ||
        method.toUpperCase() === 'PATCH')
    ) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  // ========================================
  // New Unified Methods
  // ========================================

  /**
   * Get the current authentication type
   */
  async getAuthenticationType(): Promise<'github_app'> {
    const strategy = await this.getStrategy(false);
    return strategy.type;
  }

  /**
   * Check if authentication needs renewal
   */
  async needsRenewal(): Promise<boolean> {
    const strategy = await this.getStrategy();
    return await strategy.needsRenewal();
  }

  /**
   * Refresh authentication if possible
   */
  async refreshAuth(): Promise<string> {
    const strategy = await this.getStrategy();
    return await strategy.refreshToken();
  }

  /**
   * Get authentication metadata
   */
  async getAuthMetadata(): Promise<Record<string, unknown>> {
    const strategy = await this.getStrategy();
    return await strategy.getMetadata();
  }
}
