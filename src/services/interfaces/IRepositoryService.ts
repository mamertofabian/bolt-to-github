import type { ProgressCallback } from '../types/common';

/**
 * GitHub repository response type
 */
export interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
    avatar_url: string;
    type: string;
  };
  html_url: string;
  description: string | null;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  git_url: string;
  ssh_url: string;
  clone_url: string;
  language: string | null;
  size: number;
  default_branch: string;
}

/**
 * Interface for repository information
 */
export interface RepoInfo {
  name: string;
  description?: string;
  private?: boolean;
  exists: boolean;
}

/**
 * Interface for repository creation options
 */
export interface RepoCreateOptions {
  name: string;
  private?: boolean;
  auto_init?: boolean;
  description?: string;
  org?: string;
}

/**
 * Interface for repository summary information
 */
export interface RepoSummary {
  name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  language: string | null;
}

/**
 * Interface for GitHub repository management operations
 */
export interface IRepositoryService {
  /**
   * Checks if a repository exists
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving to true if repository exists, false otherwise
   */
  repoExists(owner: string, repo: string): Promise<boolean>;

  /**
   * Gets information about a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving to repository information
   */
  getRepoInfo(owner: string, repo: string): Promise<RepoInfo>;

  /**
   * Creates a new repository
   * @param options Repository creation options
   * @returns Promise resolving to the created repository
   */
  createRepo(options: RepoCreateOptions): Promise<GitHubRepository>;

  /**
   * Ensures a repository exists, creating it if necessary
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving when repository exists
   */
  ensureRepoExists(owner: string, repo: string): Promise<void>;

  /**
   * Checks if a repository is empty (has no commits)
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving to true if repository is empty, false otherwise
   */
  isRepoEmpty(owner: string, repo: string): Promise<boolean>;

  /**
   * Initializes an empty repository with a README file
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param branch Branch name
   * @returns Promise resolving when initialization is complete
   */
  initializeEmptyRepo(owner: string, repo: string, branch: string): Promise<void>;

  /**
   * Gets the commit count for a repository branch
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param branch Branch name
   * @param maxCommits Maximum number of commits to fetch (optional, default: 100)
   * @returns Promise resolving to the commit count
   */
  getCommitCount(owner: string, repo: string, branch: string, maxCommits?: number): Promise<number>;

  /**
   * Creates a temporary public repository for migration purposes
   * @param ownerName Repository owner (username or organization)
   * @param sourceRepoName Source repository name
   * @param branch Branch name to use (default: 'main')
   * @returns Promise resolving to the name of the created temporary repository
   */
  createTemporaryPublicRepo(
    ownerName: string,
    sourceRepoName: string,
    branch?: string
  ): Promise<string>;

  /**
   * Deletes a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving when deletion is complete
   */
  deleteRepo(owner: string, repo: string): Promise<void>;

  /**
   * Updates a repository's visibility
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param makePrivate Whether to make the repository private
   * @returns Promise resolving when update is complete
   */
  updateRepoVisibility(owner: string, repo: string, makePrivate: boolean): Promise<void>;

  /**
   * Lists repositories the user has access to
   * @returns Promise resolving to an array of repository summaries
   */
  listRepos(): Promise<Array<RepoSummary>>;

  /**
   * Lists branches for a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @returns Promise resolving to an array of branch names and their details
   */
  listBranches(owner: string, repo: string): Promise<Array<{ name: string; isDefault: boolean }>>;

  /**
   * Clones the contents of a repository
   * @param sourceOwner Source repository owner (username or organization)
   * @param sourceRepo Source repository name
   * @param targetOwner Target repository owner (username or organization)
   * @param targetRepo Target repository name
   * @param branch Branch name (optional)
   * @param onProgress Progress callback (optional)
   * @returns Promise resolving when cloning is complete
   */
  cloneRepoContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch?: string,
    onProgress?: (progress: number) => void
  ): Promise<void>;
}
