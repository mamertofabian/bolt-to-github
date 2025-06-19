/**
 * GitHub rate limit response type
 */
export interface GitHubRateLimit {
  resources: {
    core: {
      limit: number;
      remaining: number;
      reset: number;
      used: number;
    };
    search: {
      limit: number;
      remaining: number;
      reset: number;
      used: number;
    };
    graphql: {
      limit: number;
      remaining: number;
      reset: number;
      used: number;
    };
    integration_manifest: {
      limit: number;
      remaining: number;
      reset: number;
      used: number;
    };
  };
  rate: {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
  };
}

/**
 * Interface for GitHub API client
 * Provides a standardized way to make requests to the GitHub API
 */
export interface IGitHubApiClient {
  /**
   * Makes a request to the GitHub API
   * @param method HTTP method (GET, POST, PUT, DELETE, PATCH)
   * @param endpoint API endpoint (e.g., '/user/repos')
   * @param body Optional request body
   * @param options Optional fetch options
   * @returns Promise resolving to the API response
   */
  request<T = unknown>(
    method: string,
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T>;

  /**
   * Gets the current rate limit status
   * @returns Promise resolving to rate limit information
   */
  getRateLimit(): Promise<GitHubRateLimit>;
}
