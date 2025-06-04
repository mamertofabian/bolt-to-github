import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import { RateLimitHandler } from './RateLimitHandler';

/**
 * Error class for GitHub API errors
 */
export class GitHubApiError extends Error {
  status: number;
  originalMessage: string;
  githubErrorResponse: any;

  constructor(message: string, status: number, originalMessage: string, githubErrorResponse: any) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.originalMessage = originalMessage;
    this.githubErrorResponse = githubErrorResponse;
  }
}

/**
 * Implementation of the GitHub API client
 * Handles API requests with proper error handling and rate limiting
 */
export class GitHubApiClient implements IGitHubApiClient {
  private rateLimitHandler: RateLimitHandler;
  private baseUrl: string;

  /**
   * Creates a new GitHubApiClient
   * @param token GitHub API token
   * @param baseUrl Base URL for the GitHub API (defaults to 'https://api.github.com')
   */
  constructor(
    private token: string,
    baseUrl = 'https://api.github.com'
  ) {
    this.rateLimitHandler = new RateLimitHandler();
    this.baseUrl = baseUrl;
  }

  /**
   * Makes a request to the GitHub API with rate limiting and error handling
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
    const url = `${this.baseUrl}${endpoint}`;
    let retryCount = 0;
    const maxRetries = 3;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // Apply rate limiting
        await this.rateLimitHandler.beforeRequest();

        const response = await fetch(url, {
          method,
          ...options,
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${this.token}`,
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

        // Handle rate limiting
        if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
          if (retryCount >= maxRetries) {
            throw new GitHubApiError(
              'Rate limit exceeded and maximum retries reached',
              response.status,
              'Rate limit exceeded',
              { message: 'Rate limit exceeded' }
            );
          }

          await this.rateLimitHandler.handleRateLimit(response);
          retryCount++;
          continue;
        }

        // Handle other errors
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
        console.error('GitHub API request failed:', errorMessage);
        throw new GitHubApiError(
          `GitHub API request failed: ${errorMessage}`,
          0, // No status code for network errors
          errorMessage,
          { message: errorMessage }
        );
      }
    }
  }

  /**
   * Gets the current rate limit status
   * @returns Promise resolving to rate limit information
   */
  async getRateLimit(): Promise<any> {
    return this.request('GET', '/rate_limit');
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
