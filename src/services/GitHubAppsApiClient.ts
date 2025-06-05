import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import { GitHubAppsService } from '../content/services/GitHubAppsService';
import { GitHubApiError } from './GitHubApiClient';

/**
 * GitHub App-based implementation of the GitHub API client
 * Focuses on core API operations, delegates business logic to specialized services
 */
export class GitHubAppsApiClient implements IGitHubApiClient {
  private githubAppsService: GitHubAppsService;
  private baseUrl: string;

  constructor(baseUrl = 'https://api.github.com') {
    this.githubAppsService = GitHubAppsService.getInstance();
    this.baseUrl = baseUrl;
  }

  /**
   * Determines if an endpoint requires a user access token (not installation token)
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
      { pattern: /^\/user\/memberships\/orgs/, methods: ['GET', 'PATCH'] },
    ];

    return userTokenPatterns.some(
      (pattern) => pattern.pattern.test(endpoint) && pattern.methods.includes(method.toUpperCase())
    );
  }

  /**
   * Determines if an endpoint should use user token for proper attribution
   */
  private isUserActionEndpoint(endpoint: string, method: string): boolean {
    const userActionPatterns = [
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
    ];

    return userActionPatterns.some(
      (pattern) => pattern.pattern.test(endpoint) && pattern.methods.includes(method.toUpperCase())
    );
  }

  /**
   * Makes a request to the GitHub API using GitHub Apps service
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
              ...options.headers,
            },
            body: body ? JSON.stringify(body) : undefined,
          });

          return this.handleResponse(response);
        } else {
          throw new GitHubApiError(
            `This endpoint requires user authentication. Please connect your GitHub account.`,
            401,
            'User authentication required',
            { message: 'User authentication required', endpoint, method }
          );
        }
      }

      // For installation endpoints, use the existing logic
      let operationType: 'user_action' | 'repo_intensive' = 'repo_intensive';

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
            ...options.headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        operationType
      );

      return this.handleResponse(response);
    } catch (error) {
      if (error instanceof GitHubApiError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('GitHub Apps API request failed:', errorMessage);
      throw new GitHubApiError(`GitHub Apps API request failed: ${errorMessage}`, 0, errorMessage, {
        message: errorMessage,
      });
    }
  }

  /**
   * Handle API response consistently
   */
  private async handleResponse(response: Response): Promise<any> {
    if (!response.ok) {
      let errorDetails;
      try {
        errorDetails = await response.json();
      } catch {
        errorDetails = { message: response.statusText };
      }

      const errorMessage = errorDetails.message || errorDetails.error || 'Unknown GitHub API error';
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
  }

  /**
   * Gets the current rate limit status
   */
  async getRateLimit(): Promise<any> {
    return this.request('GET', '/rate_limit');
  }

  /**
   * Gets information about the authenticated user (requires user token)
   */
  async getUser(): Promise<any> {
    return this.request('GET', '/user');
  }

  /**
   * Gets repositories accessible to the GitHub App
   * Returns installation repositories (GitHub App can access installed repos)
   */
  async getAccessibleRepositories(options: Record<string, any> = {}): Promise<any> {
    // For GitHub Apps, we get installation repositories
    const installationRepos = await this.request('GET', '/installation/repositories');

    // Apply pagination options if needed
    if (options.per_page && installationRepos.repositories) {
      const perPage = parseInt(options.per_page, 10);
      const page = parseInt(options.page || '1', 10);
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;

      return {
        ...installationRepos,
        repositories: installationRepos.repositories.slice(startIndex, endIndex),
      };
    }

    return installationRepos;
  }

  /**
   * Get detailed token and rate limit status
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

  /**
   * Gets the authentication method being used
   */
  getAuthType(): 'pat' | 'github_app' | 'unknown' {
    return 'github_app';
  }
}
