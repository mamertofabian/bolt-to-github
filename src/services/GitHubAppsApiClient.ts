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
            ...options.headers,
          },
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
   * Determines if an endpoint should use user token for proper attribution
   * @param endpoint The API endpoint
   * @param method The HTTP method
   * @returns True if this should be treated as a user action
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

      // User profile updates
      { pattern: /\/user$/, methods: ['PATCH'] },
    ];

    return userActionPatterns.some(
      (pattern) => pattern.pattern.test(endpoint) && pattern.methods.includes(method.toUpperCase())
    );
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
}
