import { writable, derived, get, type Writable } from 'svelte/store';
import { GitHubService } from '../../services/GitHubService';
import { ChromeStorageService } from '../services/chromeStorage';

// Repository data interfaces
export interface RepositoryInfo {
  exists: boolean;
  private: boolean | null;
  defaultBranch: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  size: number;
  language: string | null;
  forksCount: number;
  stargazersCount: number;
  watchersCount: number;
}

export interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
}

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  author: {
    name: string;
    email: string;
  };
  committer: {
    name: string;
    email: string;
  };
}

export interface RepositoryCache {
  repoInfo: RepositoryInfo | null;
  branches: BranchInfo[];
  latestCommit: CommitInfo | null;
  lastFetched: number;
  lastError: string | null;
}

export interface RepositoryState {
  [repoKey: string]: RepositoryCache;
}

export interface RepositoryStoreState {
  repositories: RepositoryState;
  isLoading: { [repoKey: string]: boolean };
}

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;

// Initial state
const initialState: RepositoryStoreState = {
  repositories: {},
  isLoading: {},
};

// Create the writable store
export const repositoryStore: Writable<RepositoryStoreState> = writable(initialState);

// Helper function to create repo key
function createRepoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

// Helper function to check if cache is valid
function isCacheValid(cache: RepositoryCache): boolean {
  if (!cache || !cache.lastFetched) return false;
  const now = Date.now();
  return now - cache.lastFetched < CACHE_DURATION;
}

// Actions for the repository store
export const repositoryActions = {
  /**
   * Initialize the store by loading cached data from local storage
   */
  async initialize(): Promise<void> {
    try {
      const cachedData = await ChromeStorageService.getRepositoryCache();
      repositoryStore.update((state) => ({
        ...state,
        repositories: cachedData,
      }));
    } catch (error) {
      console.error('Error initializing repository store:', error);
    }
  },

  /**
   * Get repository information with caching
   */
  async getRepositoryInfo(
    owner: string,
    repo: string,
    token: string,
    forceRefresh = false
  ): Promise<void> {
    const repoKey = createRepoKey(owner, repo);
    const currentState = get(repositoryStore);
    const existingCache = currentState.repositories[repoKey];

    // Check if we can use cached data
    if (!forceRefresh && existingCache && isCacheValid(existingCache)) {
      console.log(`Using cached data for ${repoKey}`);
      return;
    }

    // Set loading state
    repositoryStore.update((state) => ({
      ...state,
      isLoading: { ...state.isLoading, [repoKey]: true },
    }));

    try {
      const githubService = await GitHubService.create({ patToken: token });

      // Fetch repository info
      const repoInfoResponse = await githubService.getRepoInfo(owner, repo);

      let repoInfo: RepositoryInfo | null = null;
      let branches: BranchInfo[] = [];
      let latestCommit: CommitInfo | null = null;

      if (repoInfoResponse.exists) {
        // Get detailed repo info
        const repoDetails = await githubService.request('GET', `/repos/${owner}/${repo}`);

        repoInfo = {
          exists: true,
          private: repoDetails.private,
          defaultBranch: repoDetails.default_branch,
          description: repoDetails.description,
          createdAt: repoDetails.created_at,
          updatedAt: repoDetails.updated_at,
          size: repoDetails.size,
          language: repoDetails.language,
          forksCount: repoDetails.forks_count,
          stargazersCount: repoDetails.stargazers_count,
          watchersCount: repoDetails.watchers_count,
        };

        // Get branches
        try {
          const branchesResponse = await githubService.listBranches(owner, repo);
          branches = branchesResponse.map((branch) => ({
            name: branch.name,
            sha: '', // Not available from listBranches, would need separate API call
            protected: false, // Not available from listBranches, would need separate API call
          }));
        } catch (error) {
          console.warn('Error fetching branches:', error);
        }

        // Get latest commit
        try {
          const commits = await githubService.request(
            'GET',
            `/repos/${owner}/${repo}/commits?per_page=1`
          );
          if (commits[0]?.commit) {
            latestCommit = {
              sha: commits[0].sha,
              message: commits[0].commit.message,
              date: commits[0].commit.committer.date,
              author: commits[0].commit.author,
              committer: commits[0].commit.committer,
            };
          }
        } catch (error) {
          console.warn('Error fetching latest commit:', error);
        }
      } else {
        repoInfo = {
          exists: false,
          private: null,
          defaultBranch: '',
          description: null,
          createdAt: '',
          updatedAt: '',
          size: 0,
          language: null,
          forksCount: 0,
          stargazersCount: 0,
          watchersCount: 0,
        };
      }

      const cache: RepositoryCache = {
        repoInfo,
        branches,
        latestCommit,
        lastFetched: Date.now(),
        lastError: null,
      };

      // Update store
      repositoryStore.update((state) => {
        const newRepositories = {
          ...state.repositories,
          [repoKey]: cache,
        };

        // Save to local storage
        ChromeStorageService.saveRepositoryCache(newRepositories).catch((error) => {
          console.error('Error saving repository cache:', error);
        });

        return {
          ...state,
          repositories: newRepositories,
          isLoading: { ...state.isLoading, [repoKey]: false },
        };
      });
    } catch (error) {
      console.error(`Error fetching repository info for ${repoKey}:`, error);

      // Update store with error
      repositoryStore.update((state) => ({
        ...state,
        repositories: {
          ...state.repositories,
          [repoKey]: {
            ...state.repositories[repoKey],
            lastError: error instanceof Error ? error.message : String(error),
            lastFetched: Date.now(),
          },
        },
        isLoading: { ...state.isLoading, [repoKey]: false },
      }));
    }
  },

  /**
   * Clear cache for a specific repository
   */
  async clearRepositoryCache(owner: string, repo: string): Promise<void> {
    const repoKey = createRepoKey(owner, repo);

    repositoryStore.update((state) => {
      const newRepositories = { ...state.repositories };
      delete newRepositories[repoKey];

      // Save to local storage
      ChromeStorageService.saveRepositoryCache(newRepositories).catch((error) => {
        console.error('Error saving repository cache:', error);
      });

      return {
        ...state,
        repositories: newRepositories,
      };
    });
  },

  /**
   * Clear all repository cache
   */
  async clearAllCache(): Promise<void> {
    repositoryStore.update((state) => ({
      ...state,
      repositories: {},
    }));

    await ChromeStorageService.clearRepositoryCache();
  },

  /**
   * Check if a branch exists in the cached data
   */
  branchExists(owner: string, repo: string, branchName: string): boolean {
    const currentState = get(repositoryStore);
    const repoKey = createRepoKey(owner, repo);
    const cache = currentState.repositories[repoKey];

    if (!cache || !cache.branches) return false;

    return cache.branches.some((branch) => branch.name === branchName);
  },
};

// Derived stores for easy access to specific repository data
export function getRepositoryInfo(owner: string, repo: string) {
  const repoKey = createRepoKey(owner, repo);

  return derived(repositoryStore, ($store) => {
    const cache = $store.repositories[repoKey];
    return {
      repoInfo: cache?.repoInfo || null,
      isLoading: $store.isLoading[repoKey] || false,
      lastError: cache?.lastError || null,
      lastFetched: cache?.lastFetched || 0,
      isExpired: cache ? !isCacheValid(cache) : true,
    };
  });
}

export function getBranches(owner: string, repo: string) {
  const repoKey = createRepoKey(owner, repo);

  return derived(repositoryStore, ($store) => {
    const cache = $store.repositories[repoKey];
    return {
      branches: cache?.branches || [],
      isLoading: $store.isLoading[repoKey] || false,
      lastError: cache?.lastError || null,
    };
  });
}

export function getLatestCommit(owner: string, repo: string) {
  const repoKey = createRepoKey(owner, repo);

  return derived(repositoryStore, ($store) => {
    const cache = $store.repositories[repoKey];
    return {
      latestCommit: cache?.latestCommit || null,
      isLoading: $store.isLoading[repoKey] || false,
      lastError: cache?.lastError || null,
    };
  });
}

// Combined derived store for all repository data
export function getRepositoryData(owner: string, repo: string) {
  const repoKey = createRepoKey(owner, repo);

  return derived(repositoryStore, ($store) => {
    const cache = $store.repositories[repoKey];
    const isLoading = $store.isLoading[repoKey] || false;

    return {
      repoInfo: cache?.repoInfo || null,
      branches: cache?.branches || [],
      latestCommit: cache?.latestCommit || null,
      isLoading,
      lastError: cache?.lastError || null,
      lastFetched: cache?.lastFetched || 0,
      isExpired: cache ? !isCacheValid(cache) : true,
      exists: cache?.repoInfo?.exists || false,
      isPrivate: cache?.repoInfo?.private || false,
    };
  });
}
