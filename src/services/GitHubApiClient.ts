import { IGitHubApiClient } from './interfaces/IGitHubApiClient';
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
  constructor(private token: string, baseUrl = 'https://api.github.com') {
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
  async request(method: string, endpoint: string, body?: any, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    let retryCount = 0;
    const maxRetries = 3;

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
            ...options.headers,
          },
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

          const errorMessage = errorDetails.message || errorDetails.error || 'Unknown GitHub API error';
          const fullErrorMessage = `GitHub API Error (${response.status}): ${errorMessage}`;

          throw new GitHubApiError(
            fullErrorMessage,
            response.status,
            errorMessage,
            errorDetails
          );
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
            enumerable: false
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
}
