/**
 * Streamlined interface for GitHub API client
 * Focuses on core API operations, delegates business logic to specialized services
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

  /**
   * Gets information about the authenticated user (requires user token)
   * Essential for token validation and user identification
   * @returns Promise resolving to user information
   */
  getUser(): Promise<any>;

  /**
   * Gets repositories accessible to the current authentication method
   * GitHub App: returns installation repositories
   * PAT: returns user repositories
   * @param options Optional parameters for the request
   * @returns Promise resolving to repositories
   */
  getAccessibleRepositories(options?: Record<string, any>): Promise<any>;

  /**
   * Gets the authentication method being used
   * @returns Authentication method type
   */
  getAuthType(): 'pat' | 'github_app' | 'unknown';
}
