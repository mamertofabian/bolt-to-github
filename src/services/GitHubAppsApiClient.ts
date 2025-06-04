import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import { GitHubAppsService } from '../content/services/GitHubAppsService';
import { GitHubApiError } from './GitHubApiClient';

/**
 * GitHub API client that uses GitHub Apps for authentication
 * Implements the same interface as GitHubApiClient but leverages
 * GitHubAppsService for higher rate limits and better token management
 */
export class GitHubAppsApiClient implements IGitHubApiClient {
  private githubAppsService: GitHubAppsService;
  private baseUrl: string;

  /**
   * Creates a new GitHubAppsApiClient
   * @param baseUrl Base URL for the GitHub API (defaults to 'https://api.github.com')
   */
  constructor(baseUrl = 'https://api.github.com') {
    this.githubAppsService = GitHubAppsService.getInstance();
    this.baseUrl = baseUrl;
  }

  /**
   * Determines if an endpoint should use user token for proper attribution
   * @param endpoint The API endpoint
   * @param method The HTTP method
   * @returns True if this should be treated as a user action
   */
  private isUserActionEndpoint(endpoint: string, method: string): boolean {
    const userActionPatterns = [
      // User-specific endpoints that require user access tokens
      { pattern: /^\/user$/, methods: ['GET', 'PATCH'] },
      { pattern: /^\/user\/repos/, methods: ['GET', 'POST'] },
      { pattern: /^\/user\/orgs/, methods: ['GET'] },
      { pattern: /^\/user\/starred/, methods: ['GET', 'PUT', 'DELETE'] },
      { pattern: /^\/user\/subscriptions/, methods: ['GET'] },
      { pattern: /^\/user\/issues/, methods: ['GET'] },
      { pattern: /^\/user\/keys/, methods: ['GET', 'POST', 'DELETE'] },

      // Issues and Pull Requests (creation, updates, comments)
      {
        pattern: /\/repos\/[^/]+\/[^/]+\/issues(?:\/\d+)?(?:\/comments)?$/,
        methods: ['POST', 'PATCH'],
      },
      {
        pattern: /\/repos\/[^/]+\/[^/]+\/pulls(?:\/\d+)?(?:\/comments)?$/,
        methods: ['POST', 'PATCH'],
      },

      // Repository management (creation, updates)
      { pattern: /\/user\/repos$/, methods: ['POST'] },
      { pattern: /\/repos\/[^/]+\/[^/]+$/, methods: ['PATCH', 'DELETE'] },

      // Collaborator management
      { pattern: /\/repos\/[^/]+\/[^/]+\/collaborators/, methods: ['PUT', 'DELETE'] },

      // Stars, forks (user-specific actions)
      { pattern: /\/user\/starred/, methods: ['PUT', 'DELETE'] },
      { pattern: /\/repos\/[^/]+\/[^/]+\/subscription$/, methods: ['PUT', 'DELETE'] },

      // User profile updates
      { pattern: /\/user$/, methods: ['PATCH'] },
    ];

    return userActionPatterns.some(
      (pattern) => pattern.pattern.test(endpoint) && pattern.methods.includes(method.toUpperCase())
    );
  }

  /**
   * Determines if an endpoint requires a user access token (not installation token)
   * @param endpoint The API endpoint
   * @param method The HTTP method
   * @returns True if this endpoint requires a user access token
   */
  private requiresUserToken(endpoint: string, method: string): boolean {
    const userTokenPatterns = [
      // User profile and settings
      { pattern: /^\/user$/, methods: ['GET', 'PATCH'] },
      { pattern: /^\/user\/repos/, methods: ['GET', 'POST'] },
      { pattern: /^\/user\/orgs/, methods: ['GET'] },
      { pattern: /^\/user\/starred/, methods: ['GET', 'PUT', 'DELETE'] },
      { pattern: /^\/user\/subscriptions/, methods: ['GET'] },
      { pattern: /^\/user\/issues/, methods: ['GET'] },
      { pattern: /^\/user\/keys/, methods: ['GET', 'POST', 'DELETE'] },
      { pattern: /^\/user\/emails/, methods: ['GET', 'POST', 'DELETE'] },

      // Organization memberships for the authenticated user
      { pattern: /^\/user\/memberships\/orgs/, methods: ['GET', 'PATCH'] },
    ];

    return userTokenPatterns.some(
      (pattern) => pattern.pattern.test(endpoint) && pattern.methods.includes(method.toUpperCase())
    );
  }

  /**
   * Makes a request to the GitHub API using GitHub Apps service
   * @param method HTTP method (GET, POST, PUT, DELETE, PATCH)
   * @param endpoint API endpoint (e.g., '/user/repos')
   * @param body Optional request body
   * @param options Optional fetch options
   * @returns Promise resolving to the API response
   * @throws GitHubApiError if the request fails
   */
  async request(
    method: string,
    endpoint: string,
    body?: any,
    options: RequestInit = {}
  ): Promise<any> {
    try {
      const url = `${this.baseUrl}${endpoint}`;

      // Check if this endpoint requires a user access token
      if (this.requiresUserToken(endpoint, method)) {
        // Try to get user access token first
        const userToken = await this.githubAppsService.getUserAccessToken();

        if (userToken && userToken.access_token) {
          // Use user access token directly with fetch
          const response = await fetch(url, {
            method,
            ...options,
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `Bearer ${userToken.access_token}`,
              'Content-Type': 'application/json',
              // Cache-busting headers to ensure fresh data
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
              Expires: '0',
              ...options.headers,
            },
            // Disable caching at the fetch level
            cache: 'no-store',
            body: body ? JSON.stringify(body) : undefined,
          });

          // Handle errors
          if (!response.ok) {
            let errorDetails;
            try {
              errorDetails = await response.json();
            } catch {
              errorDetails = { message: response.statusText };
            }

            const errorMessage =
              errorDetails.message || errorDetails.error || 'Unknown GitHub API error';
            const fullErrorMessage = `GitHub API Error (${response.status}): ${errorMessage}`;

            throw new GitHubApiError(fullErrorMessage, response.status, errorMessage, errorDetails);
          }

          // Return null for 204 No Content responses
          if (response.status === 204) {
            return null;
          }

          // Only try to parse JSON if there's actual content
          const contentLength = response.headers.get('content-length');
          const hasContent = contentLength === null || parseInt(contentLength) > 0;

          if (hasContent) {
            const data = await response.json();
            // Add response headers to the data for pagination and rate limit info
            Object.defineProperty(data, 'headers', {
              value: response.headers,
              enumerable: false,
            });
            return data;
          }

          return null;
        } else {
          // No user token available, throw specific error
          throw new GitHubApiError(
            `This endpoint requires user authentication. Please connect your GitHub account.`,
            401,
            'User authentication required',
            { message: 'User authentication required', endpoint, method }
          );
        }
      }

      // For installation endpoints, use the existing logic
      // Determine operation type based on endpoint
      let operationType: 'user_action' | 'repo_intensive' = 'repo_intensive';

      // Use user_action for endpoints that should be attributed to the user
      if (this.isUserActionEndpoint(endpoint, method)) {
        operationType = 'user_action';
      }

      // Use GitHubAppsService to make the request with the best available token
      const response = await this.githubAppsService.apiRequest(
        url,
        {
          method,
          ...options,
          headers: {
            'Content-Type': 'application/json',
            // Cache-busting headers to ensure fresh data
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
            ...options.headers,
          },
          // Disable caching at the fetch level
          cache: 'no-store',
          body: body ? JSON.stringify(body) : undefined,
        },
        operationType
      );

      // Handle errors
      if (!response.ok) {
        let errorDetails;
        try {
          errorDetails = await response.json();
        } catch {
          errorDetails = { message: response.statusText };
        }

        const errorMessage =
          errorDetails.message || errorDetails.error || 'Unknown GitHub API error';
        const fullErrorMessage = `GitHub API Error (${response.status}): ${errorMessage}`;

        throw new GitHubApiError(fullErrorMessage, response.status, errorMessage, errorDetails);
      }

      // Return null for 204 No Content responses
      if (response.status === 204) {
        return null;
      }

      // Only try to parse JSON if there's actual content
      const contentLength = response.headers.get('content-length');
      const hasContent = contentLength === null || parseInt(contentLength) > 0;

      if (hasContent) {
        const data = await response.json();
        // Add response headers to the data for pagination and rate limit info
        Object.defineProperty(data, 'headers', {
          value: response.headers,
          enumerable: false,
        });
        return data;
      }

      return null;
    } catch (error) {
      // If it's already a GitHubApiError, just rethrow it
      if (error instanceof GitHubApiError) {
        throw error;
      }

      // For network errors or other unexpected errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('GitHub Apps API request failed:', errorMessage);
      throw new GitHubApiError(
        `GitHub Apps API request failed: ${errorMessage}`,
        0, // No status code for network errors
        errorMessage,
        { message: errorMessage }
      );
    }
  }

  /**
   * Gets the current rate limit status using the best available token
   * @returns Promise resolving to rate limit information
   */
  async getRateLimit(): Promise<any> {
    return this.request('GET', '/rate_limit');
  }

  /**
   * Get detailed token and rate limit status
   * @returns Promise resolving to detailed status information
   */
  async getTokenStatus(): Promise<{
    hasGitHubApp: boolean;
    hasPAT: boolean;
    currentRateLimit: any;
    recommendedToken: 'github_app' | 'pat' | 'none';
  }> {
    const rateLimitStatus = await this.githubAppsService.getRateLimitStatus();

    const hasGitHubApp = rateLimitStatus.installation !== null;
    const hasPAT = rateLimitStatus.user !== null;

    let recommendedToken: 'github_app' | 'pat' | 'none' = 'none';
    let currentRateLimit = null;

    if (hasGitHubApp && rateLimitStatus.installation) {
      recommendedToken = 'github_app';
      currentRateLimit = rateLimitStatus.installation;
    } else if (hasPAT && rateLimitStatus.user) {
      recommendedToken = 'pat';
      currentRateLimit = rateLimitStatus.user;
    }

    return {
      hasGitHubApp,
      hasPAT,
      currentRateLimit,
      recommendedToken,
    };
  }

  // Convenience methods for common GitHub API operations

  /**
   * Gets repositories accessible to the GitHub App installation
   * @returns Promise resolving to installation repositories response
   */
  async getInstallationRepositories(): Promise<any> {
    return this.request('GET', '/installation/repositories');
  }

  /**
   * Gets information about a specific repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @returns Promise resolving to repository information
   */
  async getRepository(owner: string, name: string): Promise<any> {
    return this.request('GET', `/repos/${owner}/${name}`);
  }

  /**
   * Gets contents of a repository at a specific path
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param path Optional path to contents (defaults to root directory)
   * @returns Promise resolving to repository contents
   */
  async getRepositoryContents(owner: string, name: string, path: string = ''): Promise<any> {
    const endpoint = `/repos/${owner}/${name}/contents${path ? `/${path}` : ''}`;
    return this.request('GET', endpoint);
  }

  /**
   * Gets issues for a repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param options Optional parameters for the request (state, per_page, etc.)
   * @returns Promise resolving to repository issues
   */
  async getRepositoryIssues(
    owner: string,
    name: string,
    options: Record<string, any> = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    // Set default options
    const defaultOptions = { state: 'all', per_page: 5 };
    const finalOptions = { ...defaultOptions, ...options };

    Object.entries(finalOptions).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });

    const endpoint = `/repos/${owner}/${name}/issues?${searchParams.toString()}`;
    return this.request('GET', endpoint);
  }

  /**
   * Gets commits for a repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param options Optional parameters for the request (per_page, since, until, etc.)
   * @returns Promise resolving to repository commits
   */
  async getRepositoryCommits(
    owner: string,
    name: string,
    options: Record<string, any> = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    // Set default options
    const defaultOptions = { per_page: 5 };
    const finalOptions = { ...defaultOptions, ...options };

    Object.entries(finalOptions).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });

    const endpoint = `/repos/${owner}/${name}/commits?${searchParams.toString()}`;
    return this.request('GET', endpoint);
  }

  /**
   * Creates a new issue in a repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param issueData Issue data (title, body, labels, etc.)
   * @returns Promise resolving to the created issue
   */
  async createRepositoryIssue(
    owner: string,
    name: string,
    issueData: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: number;
    }
  ): Promise<any> {
    const endpoint = `/repos/${owner}/${name}/issues`;
    return this.request('POST', endpoint, issueData);
  }

  /**
   * Updates an existing issue in a repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param issueNumber Issue number to update
   * @param updateData Data to update (title, body, state, labels, etc.)
   * @returns Promise resolving to the updated issue
   */
  async updateRepositoryIssue(
    owner: string,
    name: string,
    issueNumber: number,
    updateData: {
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
      labels?: string[];
      assignees?: string[];
      milestone?: number;
    }
  ): Promise<any> {
    const endpoint = `/repos/${owner}/${name}/issues/${issueNumber}`;
    return this.request('PATCH', endpoint, updateData);
  }

  /**
   * Gets repositories for the authenticated user (requires user token)
   * @param options Optional parameters for the request (sort, per_page, etc.)
   * @returns Promise resolving to user repositories
   */
  async getUserRepositories(options: Record<string, any> = {}): Promise<any> {
    const searchParams = new URLSearchParams();

    // Set default options
    const defaultOptions = { sort: 'updated', per_page: 50 };
    const finalOptions = { ...defaultOptions, ...options };

    Object.entries(finalOptions).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });

    const endpoint = `/user/repos?${searchParams.toString()}`;
    return this.request('GET', endpoint);
  }

  /**
   * Gets information about the authenticated user (requires user token)
   * @returns Promise resolving to user information
   */
  async getUser(): Promise<any> {
    return this.request('GET', '/user');
  }
}
