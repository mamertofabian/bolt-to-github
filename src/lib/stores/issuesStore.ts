import { writable, derived, get } from 'svelte/store';
import {
  githubSettingsStore,
  githubSettingsActions,
  type GitHubSettingsState,
} from './githubSettings';
import { GitHubService } from '../../services/GitHubService';

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  comments: number;
  user: {
    login: string;
    avatar_url: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
}

interface IssuesState {
  [repoKey: string]: {
    issues: Issue[];
    lastFetched: number;
    isLoading: boolean;
    error: string | null;
  };
}

interface LoadingState {
  [repoKey: string]: {
    [state: string]: boolean;
  };
}

const CACHE_DURATION = 30000; // 30 seconds
const FORCE_REFRESH_AFTER_ACTION = 2000; // 2 seconds after create/update/close

// Create the main stores
const issuesState = writable<IssuesState>({});
const loadingState = writable<LoadingState>({});

function createIssuesStore() {
  const { subscribe, set, update } = issuesState;
  const { subscribe: subscribeLoading, set: setLoading, update: updateLoading } = loadingState;

  let githubService: GitHubService | null = null;

  function getRepoKey(owner: string, repo: string): string {
    return `${owner}/${repo}`;
  }

  function isCacheValid(repoKey: string): boolean {
    const state = get(issuesState);
    const repoState = state[repoKey];
    if (!repoState || !repoState.lastFetched) return false;

    const now = Date.now();
    return now - repoState.lastFetched < CACHE_DURATION;
  }

  function setLoadingForRepo(repoKey: string, state: string, loading: boolean) {
    updateLoading((current) => ({
      ...current,
      [repoKey]: {
        ...current[repoKey],
        [state]: loading,
      },
    }));
  }

  function invalidateCache(repoKey: string) {
    update((current) => ({
      ...current,
      [repoKey]: {
        ...current[repoKey],
        lastFetched: 0,
      },
    }));
  }

  async function initializeGitHubService(): Promise<boolean> {
    const githubSettings: GitHubSettingsState = get(githubSettingsStore);
    const hasGitHubApp = githubSettings.githubAppStatus.hasInstallationToken;
    const hasPAT = Boolean(githubSettings.githubToken);
    const hasAuthentication = hasGitHubApp || hasPAT;

    if (!hasAuthentication) {
      console.warn('No GitHub authentication available for issues store');
      githubService = null;
      return false;
    }

    try {
      // ✅ NEW: Use GitHubService factory methods for optimal authentication
      githubService = await GitHubService.createWithBestAuth({
        patToken: githubSettings.githubToken,
        preferGitHubApp: true,
      });

      console.log(`Issues store initialized with ${githubService.getApiClientType()}`);
      return true;
    } catch (error) {
      console.error('Error initializing GitHub service for issues store:', error);
      githubService = null;
      return false;
    }
  }

  async function ensureGitHubService(): Promise<GitHubService> {
    if (!githubService) {
      const initialized = await initializeGitHubService();
      if (!initialized || !githubService) {
        throw new Error('GitHub service not initialized. Please configure authentication.');
      }
    }
    return githubService;
  }

  async function loadIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    forceRefresh: boolean = false
  ): Promise<Issue[]> {
    const repoKey = getRepoKey(owner, repo);

    // Check cache validity
    if (!forceRefresh && isCacheValid(repoKey)) {
      const currentState = get(issuesState);
      const repoState = currentState[repoKey];
      if (repoState && repoState.issues) {
        // Filter issues based on requested state
        return filterIssuesByState(repoState.issues, state);
      }
    }

    setLoadingForRepo(repoKey, state, true);

    try {
      const service = await ensureGitHubService();

      // ✅ UPDATED: Use GitHubService method instead of direct API client
      const issues = await service.getIssues(owner, repo, state);

      // Update the store
      update((current) => ({
        ...current,
        [repoKey]: {
          issues,
          lastFetched: Date.now(),
          isLoading: false,
          error: null,
        },
      }));

      setLoadingForRepo(repoKey, state, false);
      return issues;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load issues';

      update((current) => ({
        ...current,
        [repoKey]: {
          ...current[repoKey],
          issues: current[repoKey]?.issues || [],
          isLoading: false,
          error: errorMessage,
        },
      }));

      setLoadingForRepo(repoKey, state, false);
      throw error;
    }
  }

  function filterIssuesByState(issues: Issue[], state: 'open' | 'closed' | 'all'): Issue[] {
    if (state === 'all') return issues;
    return issues.filter((issue) => issue.state === state);
  }

  async function createIssue(
    owner: string,
    repo: string,
    issueData: { title: string; body?: string; labels?: string[] }
  ): Promise<Issue> {
    const repoKey = getRepoKey(owner, repo);

    try {
      const service = await ensureGitHubService();

      // ✅ UPDATED: Use GitHubService method instead of direct API client
      const newIssue = await service.createIssue(owner, repo, {
        title: issueData.title,
        body: issueData.body || '',
        labels: issueData.labels || [],
      });

      // Immediately add the new issue to the store for instant UI update
      update((current) => {
        const repoState = current[repoKey];
        if (repoState) {
          const updatedIssues = [newIssue, ...repoState.issues];
          return {
            ...current,
            [repoKey]: {
              ...repoState,
              issues: updatedIssues,
              lastFetched: Date.now(),
            },
          };
        } else {
          return {
            ...current,
            [repoKey]: {
              issues: [newIssue],
              lastFetched: Date.now(),
              isLoading: false,
              error: null,
            },
          };
        }
      });

      // Force refresh after a short delay to ensure server state is synced
      setTimeout(() => {
        loadIssues(owner, repo, 'all', true);
      }, FORCE_REFRESH_AFTER_ACTION);

      return newIssue;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create issue';

      update((current) => ({
        ...current,
        [repoKey]: {
          ...current[repoKey],
          error: errorMessage,
        },
      }));

      throw error;
    }
  }

  async function updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    updateData: { state?: 'open' | 'closed'; title?: string; body?: string; labels?: string[] }
  ): Promise<Issue> {
    const repoKey = getRepoKey(owner, repo);

    try {
      const service = await ensureGitHubService();

      // ✅ UPDATED: Use GitHubService method instead of direct API client
      const updatedIssue = await service.updateIssue(owner, repo, issueNumber, updateData);

      // Immediately update the issue in the store
      update((current) => {
        const repoState = current[repoKey];
        if (repoState) {
          const updatedIssues = repoState.issues.map((issue) =>
            issue.number === issueNumber ? updatedIssue : issue
          );
          return {
            ...current,
            [repoKey]: {
              ...repoState,
              issues: updatedIssues,
              lastFetched: Date.now(),
            },
          };
        }
        return current;
      });

      // Force refresh after a short delay to ensure server state is synced
      setTimeout(() => {
        loadIssues(owner, repo, 'all', true);
      }, FORCE_REFRESH_AFTER_ACTION);

      return updatedIssue;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update issue';

      update((current) => ({
        ...current,
        [repoKey]: {
          ...current[repoKey],
          error: errorMessage,
        },
      }));

      throw error;
    }
  }

  async function addIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    comment: { body: string }
  ): Promise<any> {
    try {
      const service = await ensureGitHubService();

      // ✅ UPDATED: Use GitHubService method instead of direct API client
      const newComment = await service.addIssueComment(owner, repo, issueNumber, comment);

      // Force refresh issues to update comment count
      setTimeout(() => {
        loadIssues(owner, repo, 'all', true);
      }, FORCE_REFRESH_AFTER_ACTION);

      return newComment;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add comment';
      throw new Error(errorMessage);
    }
  }

  function getIssuesForRepo(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all') {
    const repoKey = getRepoKey(owner, repo);

    return derived([issuesState], ([$issuesState]) => {
      const repoState = $issuesState[repoKey];
      if (!repoState) {
        return {
          issues: [],
          isLoading: false,
          error: null,
          lastFetched: 0,
        };
      }

      const filteredIssues = filterIssuesByState(repoState.issues, state);

      return {
        issues: filteredIssues,
        isLoading: repoState.isLoading,
        error: repoState.error,
        lastFetched: repoState.lastFetched,
      };
    });
  }

  function getOpenIssuesCount(owner: string, repo: string) {
    const repoKey = getRepoKey(owner, repo);

    return derived([issuesState], ([$issuesState]) => {
      const repoState = $issuesState[repoKey];
      if (!repoState) return 0;

      return repoState.issues.filter((issue) => issue.state === 'open').length;
    });
  }

  function getLoadingState(owner: string, repo: string, state: string = 'open') {
    const repoKey = getRepoKey(owner, repo);

    return derived([loadingState], ([$loadingState]) => {
      return $loadingState[repoKey]?.[state] || false;
    });
  }

  function clearError(owner: string, repo: string) {
    const repoKey = getRepoKey(owner, repo);

    update((current) => ({
      ...current,
      [repoKey]: {
        ...current[repoKey],
        error: null,
      },
    }));
  }

  function reset() {
    set({});
    setLoading({});
    githubService = null;
  }

  // Initialize the store
  async function initialize() {
    await githubSettingsActions.initialize();
    await initializeGitHubService();
  }

  return {
    subscribe,
    // ✅ UNCHANGED: All existing public methods work the same
    loadIssues,
    createIssue,
    updateIssue,
    addIssueComment, // ✅ NEW: Added missing method
    getIssuesForRepo,
    getOpenIssuesCount,
    getLoadingState,
    invalidateCache: (owner: string, repo: string) => invalidateCache(getRepoKey(owner, repo)),
    clearError,
    reset,
    initialize,
    reinitializeClient: initializeGitHubService, // ✅ RENAMED: but kept for backward compatibility

    // ✅ NEW: Enhanced service management
    reinitializeService: initializeGitHubService, // ✅ NEW: More descriptive name
  };
}

export const issuesStore = createIssuesStore();
