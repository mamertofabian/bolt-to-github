/**
 * Business logic functions for GitHub Settings component
 * These functions contain the pure business logic that can be tested in isolation
 */

export interface GitHubSettingsState {
  githubAppInstallationId?: number | null;
  githubAppUsername?: string | null;
  repoOwner: string;
  repoName: string;
  branch: string;
  isOnboarding: boolean;
  projectId?: string | null;
  isRepoNameFromProjectId?: boolean;
}

export interface Repository {
  name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  created_at: string;
  updated_at: string;
  language: string | null;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  userInfo?: {
    login: string;
    avatar_url?: string;
  };
}

/**
 * Determines if the user has all required settings for the selected authentication method
 */
export function hasRequiredSettings(state: GitHubSettingsState): boolean {
  const hasAuthCredentials = !!state.githubAppInstallationId && !!state.repoOwner;

  const hasProjectSettings = state.isOnboarding || (!!state.repoName && !!state.branch);

  return hasAuthCredentials && hasProjectSettings;
}

/**
 * Determines if the collapsible section should be expanded
 */
export function shouldBeExpanded(
  isOnboarding: boolean,
  hasRequiredSettings: boolean,
  manuallyToggled: boolean,
  currentExpanded: boolean
): boolean {
  if (manuallyToggled) {
    return currentExpanded;
  }
  return isOnboarding || !hasRequiredSettings;
}

/**
 * Filters repositories based on search query
 */
export function filterRepositories(
  repositories: Repository[],
  searchQuery: string,
  limit: number = 10
): Repository[] {
  if (!searchQuery.trim()) {
    return repositories.slice(0, limit);
  }

  const query = searchQuery.toLowerCase();
  return repositories
    .filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        (repo.description && repo.description.toLowerCase().includes(query))
    )
    .slice(0, limit);
}

/**
 * Checks if a repository exists in the list
 */
export function repositoryExists(repositories: Repository[], repoName: string): boolean {
  if (!repoName) return false;

  return repositories.some((repo) => repo.name.toLowerCase() === repoName.toLowerCase());
}

/**
 * Sets default repository name from project ID if not already set
 */
export function setDefaultRepoNameFromProjectId(state: GitHubSettingsState): GitHubSettingsState {
  if (state.projectId && !state.repoName && !state.isRepoNameFromProjectId) {
    return {
      ...state,
      repoName: state.projectId,
      isRepoNameFromProjectId: true,
    };
  }
  return state;
}

/**
 * Generates status display text based on authentication method and state
 */
export function generateStatusDisplayText(state: GitHubSettingsState): string {
  if (state.githubAppInstallationId) {
    return `Connected via GitHub App as ${state.githubAppUsername || 'GitHub User'}`;
  }
  return 'Connect with GitHub App to get started';
}

/**
 * Clears validation state when switching authentication methods
 */
export function clearValidationState(): {
  isTokenValid: null;
  validationError: null;
  githubAppValidationResult: null;
  githubAppConnectionError: null;
} {
  return {
    isTokenValid: null,
    validationError: null,
    githubAppValidationResult: null,
    githubAppConnectionError: null,
  };
}

/**
 * Checks if storage quota error is a MAX_WRITE_OPERATIONS_PER_HOUR error
 */
export function isStorageQuotaError(error: Error | string): boolean {
  const message = typeof error === 'string' ? error : error.message;
  return message.includes('MAX_WRITE_OPERATIONS_PER_H');
}

/**
 * Generates appropriate error message for storage quota exceeded
 */
export function generateStorageQuotaErrorMessage(): string {
  return 'Storage quota exceeded. You can only save settings 1800 times per hour (once every 2 seconds). Please wait a moment before trying again.';
}

/**
 * Checks if settings should be updated based on storage change
 */
export function shouldUpdateSettingsFromStorage(
  updateInfo: { projectId: string; repoName: string; branch: string },
  currentProjectId: string | null
): boolean {
  return currentProjectId !== null && updateInfo.projectId === currentProjectId;
}

/**
 * Validates GitHub App authentication
 */
export function validateGitHubApp(
  installationId: number | null,
  username?: string | null,
  avatarUrl?: string | null
): ValidationResult {
  if (!installationId) {
    return {
      isValid: false,
      error: 'No GitHub App installation found',
    };
  }

  return {
    isValid: true,
    userInfo: {
      login: username || 'GitHub User',
      avatar_url: avatarUrl || undefined,
    },
  };
}

/**
 * Updates settings from storage change
 */
export function updateSettingsFromStorageChange(
  state: GitHubSettingsState,
  updateInfo: { repoName: string; branch: string }
): GitHubSettingsState {
  return {
    ...state,
    repoName: updateInfo.repoName,
    branch: updateInfo.branch,
  };
}

/**
 * Updates settings from sync storage
 */
export function updateSettingsFromSyncStorage(
  state: GitHubSettingsState,
  projectSettings: Record<string, { repoName: string; branch: string }>
): GitHubSettingsState {
  if (!state.projectId || !projectSettings[state.projectId]) {
    return state;
  }

  const settings = projectSettings[state.projectId];
  return {
    ...state,
    repoName: settings.repoName,
    branch: settings.branch,
  };
}
