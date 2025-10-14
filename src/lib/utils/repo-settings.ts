/**
 * Business logic utilities for RepoSettings component
 * These are pure functions that can be tested independently
 */

export interface Repository {
  name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  created_at: string;
  updated_at: string;
  language: string | null;
}

export interface AuthSettings {
  authenticationMethod?: string;
}

/**
 * Filters repositories based on search query
 * @param repositories - Array of repositories to filter
 * @param searchQuery - Search term to filter by
 * @param maxResults - Maximum number of results to return (default: 10)
 * @returns Filtered array of repositories
 */
export function filterRepositories(
  repositories: Repository[],
  searchQuery: string,
  maxResults: number = 10
): Repository[] {
  if (!searchQuery.trim()) {
    return repositories.slice(0, maxResults);
  }

  const query = searchQuery.toLowerCase();

  return repositories
    .filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        (repo.description && repo.description.toLowerCase().includes(query))
    )
    .slice(0, maxResults);
}

/**
 * Checks if a repository exists in the given list
 * @param repositories - Array of repositories to search
 * @param repoName - Name of repository to check
 * @returns True if repository exists, false otherwise
 */
export function checkRepositoryExists(repositories: Repository[], repoName: string): boolean {
  if (!repoName.trim()) {
    return false;
  }

  return repositories.some((repo) => repo.name.toLowerCase() === repoName.toLowerCase());
}

/**
 * Gets the default project title based on repository name
 * @param currentTitle - Current project title
 * @param repoName - Repository name
 * @returns Default title to use
 */
export function getDefaultProjectTitle(currentTitle: string, repoName: string): string {
  if (!currentTitle && repoName && repoName.trim()) {
    return repoName;
  }
  return currentTitle;
}

/**
 * Calculates the next selected index for keyboard navigation
 * @param currentIndex - Current selected index
 * @param direction - Direction to move ('up' or 'down')
 * @param maxIndex - Maximum valid index
 * @returns New selected index
 */
export function calculateNextSelectedIndex(
  currentIndex: number,
  direction: 'up' | 'down',
  maxIndex: number
): number {
  if (direction === 'down') {
    return Math.min(currentIndex + 1, maxIndex);
  } else {
    return Math.max(currentIndex - 1, -1);
  }
}

/**
 * Determines if dropdown should be visible
 * @param showDropdown - Current dropdown visibility state
 * @param filteredRepos - Array of filtered repositories
 * @param repoExists - Whether the current repo name exists
 * @returns True if dropdown should be visible
 */
export function shouldShowDropdown(
  showDropdown: boolean,
  filteredRepos: Repository[],
  repoExists: boolean
): boolean {
  return showDropdown && (filteredRepos.length > 0 || !repoExists);
}

/**
 * Validates if the form can be saved
 * @param repoName - Repository name
 * @param branch - Branch name
 * @param isSaving - Whether currently saving
 * @returns True if form can be saved
 */
export function canSaveForm(repoName: string, branch: string, isSaving: boolean = false): boolean {
  return !!(repoName?.trim() && branch?.trim()) && !isSaving;
}

/**
 * Gets the authentication method from settings
 * @param settings - Authentication settings
 * @returns Authentication method ('pat' or 'github_app')
 */
export function getAuthenticationMethod(settings: AuthSettings): 'pat' | 'github_app' {
  return settings.authenticationMethod === 'github_app' ? 'github_app' : 'pat';
}

/**
 * Creates GitHub service configuration based on authentication method
 * @param authMethod - Authentication method
 * @param githubToken - GitHub token (for PAT authentication)
 * @returns Configuration object for GitHub service
 */
export function createGitHubServiceConfig(
  authMethod: 'pat' | 'github_app',
  githubToken: string
): string | { type: 'github_app' } {
  if (authMethod === 'github_app') {
    return { type: 'github_app' };
  }
  return githubToken;
}

/**
 * Handles keyboard navigation for repository selection
 * @param key - Keyboard key pressed
 * @param currentIndex - Current selected index
 * @param filteredRepos - Array of filtered repositories
 * @returns Object with navigation result
 */
export function handleKeyboardNavigation(
  key: string,
  currentIndex: number,
  filteredRepos: Repository[]
): {
  newIndex: number;
  selectedRepo: Repository | null;
  shouldCloseDropdown: boolean;
} {
  const maxIndex = filteredRepos.length - 1;

  switch (key) {
    case 'ArrowDown':
      return {
        newIndex: calculateNextSelectedIndex(currentIndex, 'down', maxIndex),
        selectedRepo: null,
        shouldCloseDropdown: false,
      };
    case 'ArrowUp':
      return {
        newIndex: calculateNextSelectedIndex(currentIndex, 'up', maxIndex),
        selectedRepo: null,
        shouldCloseDropdown: false,
      };
    case 'Enter':
      if (currentIndex >= 0 && filteredRepos[currentIndex]) {
        return {
          newIndex: currentIndex,
          selectedRepo: filteredRepos[currentIndex],
          shouldCloseDropdown: true,
        };
      }
      return {
        newIndex: currentIndex,
        selectedRepo: null,
        shouldCloseDropdown: false,
      };
    case 'Escape':
      return {
        newIndex: currentIndex,
        selectedRepo: null,
        shouldCloseDropdown: true,
      };
    default:
      return {
        newIndex: currentIndex,
        selectedRepo: null,
        shouldCloseDropdown: false,
      };
  }
}

/**
 * Gets the repository status message based on current state
 * @param repoName - Current repository name
 * @param repoExists - Whether repository exists
 * @returns Status message object
 */
export function getRepositoryStatusMessage(
  repoName: string,
  repoExists: boolean
): {
  type: 'info' | 'success' | 'warning';
  message: string;
} {
  if (repoExists) {
    return {
      type: 'info',
      message: 'ℹ️ Using existing repository. Make sure it is correct.',
    };
  } else if (repoName && repoName.trim()) {
    return {
      type: 'success',
      message: "✨ A new repository will be created if it doesn't exist yet.",
    };
  } else {
    return {
      type: 'warning',
      message: 'Enter a repository name (new) or select from your repositories carefully.',
    };
  }
}
