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
  request(method: string, endpoint: string, body?: any, options?: RequestInit): Promise<any>;
  
  /**
   * Gets the current rate limit status
   * @returns Promise resolving to rate limit information
   */
  getRateLimit(): Promise<any>;
}
