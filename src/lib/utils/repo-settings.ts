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

export interface RepositoryNameValidationResult {
  isValid: boolean;
  error?: string;
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
 * Validates repository names against the product policy for GitHub repositories.
 * @param repoName - Repository name
 * @returns Validation result and user-facing error when invalid
 */
export function validateRepositoryName(repoName: string): RepositoryNameValidationResult {
  const trimmedRepoName = repoName?.trim() ?? '';

  if (!trimmedRepoName) {
    return { isValid: false, error: 'Invalid repository name: repository name is required.' };
  }

  if (trimmedRepoName.length > 100) {
    return {
      isValid: false,
      error: 'Invalid repository name: use 100 characters or fewer.',
    };
  }

  if (!/^[A-Za-z0-9._-]+$/.test(trimmedRepoName)) {
    return {
      isValid: false,
      error:
        'Invalid repository name: use only letters, numbers, periods, underscores, and hyphens.',
    };
  }

  if (trimmedRepoName.startsWith('-') || trimmedRepoName.endsWith('-')) {
    return {
      isValid: false,
      error: 'Invalid repository name: do not start or end with a hyphen.',
    };
  }

  if (trimmedRepoName.includes('--')) {
    return {
      isValid: false,
      error: 'Invalid repository name: double hyphens are not allowed.',
    };
  }

  return { isValid: true };
}

/**
 * Validates if the form can be saved
 * @param repoName - Repository name
 * @param branch - Branch name
 * @param isSaving - Whether currently saving
 * @returns True if form can be saved
 */
export function canSaveForm(repoName: string, branch: string, isSaving: boolean = false): boolean {
  return validateRepositoryName(repoName).isValid && !!branch?.trim() && !isSaving;
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
  shouldPreventDefault: boolean;
} {
  const maxIndex = filteredRepos.length - 1;

  switch (key) {
    case 'ArrowDown':
      return {
        newIndex: calculateNextSelectedIndex(currentIndex, 'down', maxIndex),
        selectedRepo: null,
        shouldCloseDropdown: false,
        shouldPreventDefault: true,
      };
    case 'ArrowUp':
      return {
        newIndex: calculateNextSelectedIndex(currentIndex, 'up', maxIndex),
        selectedRepo: null,
        shouldCloseDropdown: false,
        shouldPreventDefault: true,
      };
    case 'Enter':
      if (currentIndex >= 0 && filteredRepos[currentIndex]) {
        return {
          newIndex: currentIndex,
          selectedRepo: filteredRepos[currentIndex],
          shouldCloseDropdown: true,
          shouldPreventDefault: true,
        };
      }
      return {
        newIndex: currentIndex,
        selectedRepo: null,
        shouldCloseDropdown: false,
        shouldPreventDefault: true,
      };
    case 'Escape':
      return {
        newIndex: currentIndex,
        selectedRepo: null,
        shouldCloseDropdown: true,
        shouldPreventDefault: true,
      };
    default:
      return {
        newIndex: currentIndex,
        selectedRepo: null,
        shouldCloseDropdown: false,
        shouldPreventDefault: false,
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

/**
 * Filters branches based on search query
 * @param branches - Array of branch names to filter
 * @param searchQuery - Search term to filter by
 * @param maxResults - Maximum number of results to return (default: 10)
 * @returns Filtered array of branch names
 */
export function filterBranches(
  branches: string[],
  searchQuery: string,
  maxResults: number = 10
): string[] {
  if (!searchQuery.trim()) {
    return branches.slice(0, maxResults);
  }

  const query = searchQuery.toLowerCase();

  return branches.filter((branch) => branch.toLowerCase().includes(query)).slice(0, maxResults);
}

/**
 * Checks if a branch exists in the given list
 * @param branches - Array of branch names to search
 * @param branchName - Name of branch to check
 * @returns True if branch exists, false otherwise
 */
export function checkBranchExists(branches: string[], branchName: string): boolean {
  if (!branchName.trim()) {
    return false;
  }

  return branches.some((branch) => branch.toLowerCase() === branchName.trim().toLowerCase());
}

/**
 * Determines if "Create new branch" option should be shown
 * @param branchInput - Current branch input value
 * @param branchExists - Whether the branch already exists
 * @returns True if create option should be shown
 */
export function shouldShowCreateBranch(branchInput: string, branchExists: boolean): boolean {
  return !!(branchInput.trim() && !branchExists);
}

/**
 * Determines if branch dropdown should be visible
 * @param showDropdown - Current dropdown visibility state
 * @param filteredBranches - Array of filtered branch names
 * @param branchExists - Whether the current branch name exists
 * @returns True if dropdown should be visible
 */
export function shouldShowBranchDropdown(
  showDropdown: boolean,
  filteredBranches: string[],
  branchExists: boolean
): boolean {
  return showDropdown && (filteredBranches.length > 0 || !branchExists);
}

/**
 * Gets the branch status message based on current state
 * @param branchName - Current branch name
 * @param branchExists - Whether branch exists
 * @returns Status message object
 */
export function getBranchStatusMessage(
  branchName: string,
  branchExists: boolean
): {
  type: 'info' | 'success' | 'warning';
  message: string;
} {
  if (branchExists) {
    return {
      type: 'info',
      message: 'ℹ️ Using existing branch. Make sure it is correct.',
    };
  } else if (branchName && branchName.trim()) {
    return {
      type: 'success',
      message: "✨ A new branch will be created on first Push if it doesn't exist yet.",
    };
  } else {
    return {
      type: 'warning',
      message: 'Enter a branch name (new) or select from existing branches carefully.',
    };
  }
}
