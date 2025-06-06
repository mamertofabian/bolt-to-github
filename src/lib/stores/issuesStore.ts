import { writable, derived, get } from 'svelte/store';
import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';

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

// Helper function to create UnifiedGitHubService with proper authentication
async function createGitHubService(token: string): Promise<UnifiedGitHubService> {
  const authSettings = await chrome.storage.local.get(['authenticationMethod']);
  const authMethod = authSettings.authenticationMethod || 'pat';

  if (authMethod === 'github_app') {
    return new UnifiedGitHubService({ type: 'github_app' });
  } else {
    return new UnifiedGitHubService(token);
  }
}

// Create the main store
const issuesState = writable<IssuesState>({});
const loadingState = writable<LoadingState>({});

function createIssuesStore() {
  const { subscribe, set, update } = issuesState;
  const { subscribe: subscribeLoading, set: setLoading, update: updateLoading } = loadingState;

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

  async function loadIssues(
    owner: string,
    repo: string,
    githubToken: string,
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
      const githubService = await createGitHubService(githubToken);
      // Always fetch ALL issues to avoid cache inconsistencies
      const issues = await githubService.getIssues(owner, repo, 'all');

      // Update the store with all issues
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
      // Return filtered issues based on requested state
      return filterIssuesByState(issues, state);
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
    githubToken: string,
    issueData: { title: string; body?: string }
  ): Promise<Issue> {
    const repoKey = getRepoKey(owner, repo);

    try {
      const githubService = await createGitHubService(githubToken);
      const newIssue = await githubService.createIssue(owner, repo, issueData);

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
        loadIssues(owner, repo, githubToken, 'all', true);
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
    githubToken: string,
    issueNumber: number,
    updateData: { state?: 'open' | 'closed'; title?: string; body?: string }
  ): Promise<Issue> {
    const repoKey = getRepoKey(owner, repo);

    const { title, body, state } = updateData;

    try {
      const githubService = await createGitHubService(githubToken);
      const updatedIssue = await githubService.updateIssue(
        owner,
        repo,
        issueNumber,
        title,
        body,
        state
      );

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
        loadIssues(owner, repo, githubToken, 'all', true);
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
  }

  return {
    subscribe,
    loadIssues,
    createIssue,
    updateIssue,
    getIssuesForRepo,
    getOpenIssuesCount,
    getLoadingState,
    invalidateCache: (owner: string, repo: string) => invalidateCache(getRepoKey(owner, repo)),
    clearError,
    reset,
  };
}

export const issuesStore = createIssuesStore();
