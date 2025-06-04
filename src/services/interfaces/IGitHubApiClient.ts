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

  // Convenience methods for common GitHub API operations

  /**
   * Gets repositories accessible to the GitHub App installation
   * @returns Promise resolving to installation repositories response
   */
  getInstallationRepositories(): Promise<any>;

  /**
   * Gets information about a specific repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @returns Promise resolving to repository information
   */
  getRepository(owner: string, name: string): Promise<any>;

  /**
   * Gets contents of a repository at a specific path
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param path Optional path to contents (defaults to root directory)
   * @returns Promise resolving to repository contents
   */
  getRepositoryContents(owner: string, name: string, path?: string): Promise<any>;

  /**
   * Gets issues for a repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param options Optional parameters for the request (state, per_page, etc.)
   * @returns Promise resolving to repository issues
   */
  getRepositoryIssues(owner: string, name: string, options?: Record<string, any>): Promise<any>;

  /**
   * Creates a new issue in a repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param issueData Issue data (title, body, labels, etc.)
   * @returns Promise resolving to the created issue
   */
  createRepositoryIssue(
    owner: string,
    name: string,
    issueData: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: number;
    }
  ): Promise<any>;

  /**
   * Updates an existing issue in a repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param issueNumber Issue number to update
   * @param updateData Data to update (title, body, state, labels, etc.)
   * @returns Promise resolving to the updated issue
   */
  updateRepositoryIssue(
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
  ): Promise<any>;

  /**
   * Gets commits for a repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @param options Optional parameters for the request (per_page, since, until, etc.)
   * @returns Promise resolving to repository commits
   */
  getRepositoryCommits(owner: string, name: string, options?: Record<string, any>): Promise<any>;

  /**
   * Gets repositories for the authenticated user (requires user token)
   * @param options Optional parameters for the request (sort, per_page, etc.)
   * @returns Promise resolving to user repositories
   */
  getUserRepositories(options?: Record<string, any>): Promise<any>;

  /**
   * Gets information about the authenticated user (requires user token)
   * @returns Promise resolving to user information
   */
  getUser(): Promise<any>;

  /**
   * Gets branches for a repository
   * @param owner Repository owner (username or organization)
   * @param name Repository name
   * @returns Promise resolving to repository branches
   */
  getRepositoryBranches(owner: string, name: string): Promise<any>;
}
