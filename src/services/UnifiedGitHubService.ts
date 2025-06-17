/**
 * Unified GitHub Service
 * Transparent wrapper that maintains backward compatibility while adding GitHub App support
 * Can be used as a drop-in replacement for the existing GitHubService
 */

import type { IAuthenticationStrategy } from './interfaces/IAuthenticationStrategy';
import type { AuthenticationConfig, AuthenticationType } from './types/authentication';
// Removed GitHubService import to eliminate circular dependency
import { AuthenticationStrategyFactory } from './AuthenticationStrategyFactory';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('UnifiedGitHubService');

export class UnifiedGitHubService {
  private strategy: IAuthenticationStrategy | null = null;
  // Removed fallbackGitHubService to eliminate circular dependency
  private factory: AuthenticationStrategyFactory;

  /**
   * Constructor maintains backward compatibility with existing GitHubService
   * @param authConfig - Can be a token string (backward compatible) or AuthenticationConfig object
   */
  constructor(authConfig: string | AuthenticationConfig) {
    this.factory = AuthenticationStrategyFactory.getInstance();

    if (typeof authConfig === 'string') {
      // Backward compatibility: treat as PAT token
      this.strategy = this.factory.createPATStrategy(authConfig);
    } else {
      // New configuration object - initialize asynchronously
      this.initializeStrategy(authConfig).catch((error) => {
        logger.error('Failed to initialize authentication strategy:', error);
        // Set strategy to null so getStrategy() will try to auto-detect
        this.strategy = null;
      });
    }
  }

  /**
   * Initialize strategy based on configuration
   */
  private async initializeStrategy(config: AuthenticationConfig): Promise<void> {
    if (config.type === 'pat' && config.token) {
      this.strategy = this.factory.createPATStrategy(config.token);
    } else if (config.type === 'github_app') {
      // Get user token from SupabaseAuthService for GitHub App authentication
      const userToken = await this.getUserToken();

      if (userToken) {
        logger.info('✅ Found user token for GitHub App authentication');
      } else {
        logger.warn('⚠️ No user token found - GitHub App authentication may fail');
      }

      this.strategy = this.factory.createGitHubAppStrategy(userToken);
    } else {
      throw new Error('Invalid authentication configuration');
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
  private async getStrategy(): Promise<IAuthenticationStrategy> {
    if (!this.strategy) {
      // Auto-detect current strategy if not explicitly set
      const authMethod = await this.getConfiguredAuthMethod();

      if (authMethod === 'github_app') {
        // Create GitHub App strategy with user token
        const userToken = await this.getUserToken();
        this.strategy = this.factory.createGitHubAppStrategy(userToken);
      } else {
        this.strategy = await this.factory.getCurrentStrategy();
      }
    }
    return this.strategy;
  }

  /**
   * Get configured authentication method from storage with smart detection
   * Prioritizes GitHub App authentication when available
   */
  private async getConfiguredAuthMethod(): Promise<'pat' | 'github_app'> {
    try {
      // First, check if GitHub App authentication is available and valid
      const userToken = await this.getUserToken();
      if (userToken) {
        logger.info('🔍 GitHub App authentication detected, prioritizing over PAT');
        // Update stored preference to reflect reality
        await chrome.storage.local.set({ authenticationMethod: 'github_app' });
        return 'github_app';
      }

      // Fallback to stored preference or PAT
      const result = await chrome.storage.local.get(['authenticationMethod']);
      const storedMethod = result.authenticationMethod || 'pat';

      logger.info(`🔍 No GitHub App authentication found, using ${storedMethod}`);
      return storedMethod;
    } catch (error) {
      logger.warn('Failed to get authentication method:', error);
      return 'pat';
    }
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
  // Existing GitHubService API Methods
  // These maintain exact compatibility with the original GitHubService
  // ========================================

  /**
   * Validate token and user (maintains exact API compatibility)
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
   * Simple token validation (backward compatibility method)
   */
  async validateToken(): Promise<boolean> {
    try {
      const strategy = await this.getStrategy();
      const result = await strategy.validateAuth();
      return result.isValid;
    } catch (error) {
      logger.error('Token validation failed:', error);
      return false;
    }
  }

  /**
   * Check if token is classic PAT
   */
  async isClassicToken(): Promise<boolean> {
    try {
      const strategy = await this.getStrategy();

      if (strategy.type === 'github_app') {
        return false; // GitHub App tokens are not classic PATs
      }

      // For PAT, check token format
      const token = await strategy.getToken();
      return token.startsWith('ghp_');
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if token is fine-grained PAT
   */
  async isFineGrainedToken(): Promise<boolean> {
    try {
      const strategy = await this.getStrategy();

      if (strategy.type === 'github_app') {
        return false; // GitHub App tokens are not fine-grained PATs
      }

      // For PAT, check token format
      const token = await strategy.getToken();
      return token.startsWith('github_pat_');
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify token permissions
   */
  async verifyTokenPermissions(
    repoOwner: string,
    onProgress?: (update: { permission: 'repos' | 'admin' | 'code'; isValid: boolean }) => void
  ): Promise<{
    isValid: boolean;
    error?: string;
  }> {
    try {
      const strategy = await this.getStrategy();
      const result = await strategy.checkPermissions(repoOwner);

      // Simulate progress updates for UI compatibility
      if (onProgress) {
        onProgress({ permission: 'repos', isValid: result.permissions.allRepos });
        onProgress({ permission: 'admin', isValid: result.permissions.admin });
        onProgress({ permission: 'code', isValid: result.permissions.contents });
      }

      return {
        isValid: result.isValid,
        error: result.error,
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Permission verification failed',
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
    } catch (error) {
      return false;
    }
  }

  /**
   * Get repository information
   */
  async getRepoInfo(owner: string, repo: string): Promise<any> {
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
        };
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
        };
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
  ): Promise<any> {
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
        auto_init: true,
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
  async ensureRepoExists(owner: string, repo: string, isPrivate: boolean = true): Promise<any> {
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
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize empty repository
   */
  async initializeEmptyRepo(owner: string, repo: string, branch: string = 'main'): Promise<void> {
    const token = await this.getToken();

    // Create initial commit with README
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/README.md`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Initial commit',
          content: btoa(`# ${repo}\n\nInitialized by Bolt to GitHub extension.`),
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
  async updateRepoVisibility(owner: string, repo: string, isPrivate: boolean): Promise<any> {
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
  async listRepos(): Promise<any[]> {
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
  async listBranches(owner: string, repo: string): Promise<any[]> {
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
  ): Promise<any> {
    const token = await this.getToken();
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const body: any = {
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
  ): Promise<any[]> {
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

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<any> {
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
  ): Promise<any> {
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
  ): Promise<any> {
    const token = await this.getToken();
    const updateData: any = {};

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
  ): Promise<any> {
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
  }): Promise<any> {
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

      const tree = await treeResponse.json();
      const files = tree.tree.filter((item: any) => item.type === 'blob');

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
  async request(method: string, endpoint: string, data?: any): Promise<any> {
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

    return await response.json();
  }

  // ========================================
  // New Unified Methods
  // ========================================

  /**
   * Get the current authentication type
   */
  async getAuthenticationType(): Promise<AuthenticationType> {
    const strategy = await this.getStrategy();
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
  async getAuthMetadata(): Promise<any> {
    const strategy = await this.getStrategy();
    return await strategy.getMetadata();
  }
}
