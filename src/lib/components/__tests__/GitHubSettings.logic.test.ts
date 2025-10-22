/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
  hasRequiredSettings,
  shouldBeExpanded,
  filterRepositories,
  repositoryExists,
  setDefaultRepoNameFromProjectId,
  generateStatusDisplayText,
  clearValidationState,
  isStorageQuotaError,
  generateStorageQuotaErrorMessage,
  shouldUpdateSettingsFromStorage,
  needsPermissionCheck,
  validateGitHubApp,
  updateSettingsFromStorageChange,
  updateSettingsFromSyncStorage,
  type GitHubSettingsState,
  type Repository,
} from '$lib/utils/github-settings';

describe('GitHubSettings Logic Functions', () => {
  describe('hasRequiredSettings', () => {
    it('should return true when PAT credentials are complete', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'pat',
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      expect(hasRequiredSettings(state)).toBe(true);
    });

    it('should return true when GitHub App is authenticated', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      expect(hasRequiredSettings(state)).toBe(true);
    });

    it('should return false when PAT is missing token', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'pat',
        githubToken: undefined,
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      expect(hasRequiredSettings(state)).toBe(false);
    });

    it('should return false when GitHub App is missing installation ID', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'github_app',
        githubAppInstallationId: null,
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      expect(hasRequiredSettings(state)).toBe(false);
    });

    it('should return false when repoOwner is missing', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'pat',
        githubToken: 'ghp_test',
        repoOwner: '',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      expect(hasRequiredSettings(state)).toBe(false);
    });

    it('should return true during onboarding even without repoName and branch', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'pat',
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: '',
        branch: '',
        isOnboarding: true,
      };

      expect(hasRequiredSettings(state)).toBe(true);
    });

    it('should return false when not onboarding and missing repoName', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'pat',
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: '',
        branch: 'main',
        isOnboarding: false,
      };

      expect(hasRequiredSettings(state)).toBe(false);
    });

    it('should return false when not onboarding and missing branch', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'pat',
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: '',
        isOnboarding: false,
      };

      expect(hasRequiredSettings(state)).toBe(false);
    });
  });

  describe('shouldBeExpanded', () => {
    it('should return false when hasRequiredSettings is true and not onboarding', () => {
      expect(shouldBeExpanded(false, true, false, true)).toBe(false);
    });

    it('should return true during onboarding regardless of settings', () => {
      expect(shouldBeExpanded(true, true, false, false)).toBe(true);
    });

    it('should return true when settings are incomplete', () => {
      expect(shouldBeExpanded(false, false, false, true)).toBe(true);
    });

    it('should return current state when manually toggled', () => {
      expect(shouldBeExpanded(false, true, true, true)).toBe(true);
      expect(shouldBeExpanded(false, true, true, false)).toBe(false);
    });
  });

  describe('filterRepositories', () => {
    const mockRepos: Repository[] = [
      {
        name: 'awesome-project',
        description: 'An awesome TypeScript project',
        html_url: 'https://github.com/user/awesome-project',
        private: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        language: 'TypeScript',
      },
      {
        name: 'backend-api',
        description: 'REST API backend service',
        html_url: 'https://github.com/user/backend-api',
        private: true,
        created_at: '2024-01-03',
        updated_at: '2024-01-04',
        language: 'JavaScript',
      },
      {
        name: 'frontend-app',
        description: null,
        html_url: 'https://github.com/user/frontend-app',
        private: false,
        created_at: '2024-01-05',
        updated_at: '2024-01-06',
        language: 'TypeScript',
      },
    ];

    it('should filter repositories by name match', () => {
      const result = filterRepositories(mockRepos, 'backend');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('backend-api');
    });

    it('should filter repositories by description match', () => {
      const result = filterRepositories(mockRepos, 'awesome');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('awesome-project');
    });

    it('should handle null descriptions safely', () => {
      const result = filterRepositories(mockRepos, 'frontend');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('frontend-app');
    });

    it('should be case-insensitive', () => {
      const result = filterRepositories(mockRepos, 'BACKEND');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('backend-api');
    });

    it('should limit results to specified number of items', () => {
      const manyRepos = Array.from({ length: 20 }, (_, i) => ({
        name: `repo-${i}`,
        description: `Description ${i}`,
        html_url: `https://github.com/user/repo-${i}`,
        private: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        language: 'TypeScript',
      }));

      const result = filterRepositories(manyRepos, 'repo', 10);
      expect(result).toHaveLength(10);
    });

    it('should return empty array when no repositories match', () => {
      const result = filterRepositories(mockRepos, 'nonexistent');
      expect(result).toHaveLength(0);
    });

    it('should return all repositories when search query is empty', () => {
      const result = filterRepositories(mockRepos, '');
      expect(result).toHaveLength(3);
    });

    it('should return all repositories when search query is whitespace', () => {
      const result = filterRepositories(mockRepos, '   ');
      expect(result).toHaveLength(3);
    });
  });

  describe('repositoryExists', () => {
    const mockRepos: Repository[] = [
      {
        name: 'existing-repo',
        description: null,
        html_url: '',
        private: false,
        created_at: '',
        updated_at: '',
        language: null,
      },
      {
        name: 'another-repo',
        description: null,
        html_url: '',
        private: false,
        created_at: '',
        updated_at: '',
        language: null,
      },
      {
        name: 'Third-Repo',
        description: null,
        html_url: '',
        private: false,
        created_at: '',
        updated_at: '',
        language: null,
      },
    ];

    it('should return true for existing repository', () => {
      expect(repositoryExists(mockRepos, 'existing-repo')).toBe(true);
    });

    it('should return false for non-existing repository', () => {
      expect(repositoryExists(mockRepos, 'new-repo')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(repositoryExists(mockRepos, 'THIRD-REPO')).toBe(true);
      expect(repositoryExists(mockRepos, 'third-repo')).toBe(true);
    });

    it('should return false for empty repository name', () => {
      expect(repositoryExists(mockRepos, '')).toBe(false);
    });
  });

  describe('setDefaultRepoNameFromProjectId', () => {
    it('should set repoName from projectId when not set', () => {
      const state: GitHubSettingsState = {
        projectId: 'my-project-123',
        repoName: '',
        isRepoNameFromProjectId: false,
        authenticationMethod: 'pat',
        repoOwner: 'testuser',
        branch: 'main',
        isOnboarding: false,
      };

      const result = setDefaultRepoNameFromProjectId(state);
      expect(result.repoName).toBe('my-project-123');
      expect(result.isRepoNameFromProjectId).toBe(true);
    });

    it('should not override existing repoName', () => {
      const state: GitHubSettingsState = {
        projectId: 'my-project-123',
        repoName: 'existing-repo',
        isRepoNameFromProjectId: false,
        authenticationMethod: 'pat',
        repoOwner: 'testuser',
        branch: 'main',
        isOnboarding: false,
      };

      const result = setDefaultRepoNameFromProjectId(state);
      expect(result.repoName).toBe('existing-repo');
      expect(result.isRepoNameFromProjectId).toBe(false);
    });

    it('should not set repoName when already set from projectId', () => {
      const state: GitHubSettingsState = {
        projectId: 'my-project-123',
        repoName: 'existing-repo',
        isRepoNameFromProjectId: true,
        authenticationMethod: 'pat',
        repoOwner: 'testuser',
        branch: 'main',
        isOnboarding: false,
      };

      const result = setDefaultRepoNameFromProjectId(state);
      expect(result.repoName).toBe('existing-repo');
      expect(result.isRepoNameFromProjectId).toBe(true);
    });

    it('should not set repoName when projectId is null', () => {
      const state: GitHubSettingsState = {
        projectId: null,
        repoName: '',
        isRepoNameFromProjectId: false,
        authenticationMethod: 'pat',
        repoOwner: 'testuser',
        branch: 'main',
        isOnboarding: false,
      };

      const result = setDefaultRepoNameFromProjectId(state);
      expect(result.repoName).toBe('');
      expect(result.isRepoNameFromProjectId).toBe(false);
    });
  });

  describe('generateStatusDisplayText', () => {
    it('should show GitHub App status when authenticated', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        githubAppUsername: 'testuser',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      expect(generateStatusDisplayText(state)).toBe('Connected via GitHub App as testuser');
    });

    it('should show connection prompt when GitHub App not connected', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'github_app',
        githubAppInstallationId: null,
        githubAppUsername: null,
        repoOwner: '',
        repoName: '',
        branch: '',
        isOnboarding: false,
      };

      expect(generateStatusDisplayText(state)).toBe('Connect with GitHub App to get started');
    });

    it('should show repository configuration for PAT', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'pat',
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      expect(generateStatusDisplayText(state)).toBe('Configured for testuser/testrepo');
    });

    it('should show default message for PAT without token', () => {
      const state: GitHubSettingsState = {
        authenticationMethod: 'pat',
        githubToken: '',
        repoOwner: '',
        repoName: '',
        branch: '',
        isOnboarding: false,
      };

      expect(generateStatusDisplayText(state)).toBe('Configure your GitHub repository settings');
    });
  });

  describe('clearValidationState', () => {
    it('should return cleared validation state', () => {
      const result = clearValidationState();

      expect(result.isTokenValid).toBeNull();
      expect(result.validationError).toBeNull();
      expect(result.tokenType).toBeNull();
      expect(result.githubAppValidationResult).toBeNull();
      expect(result.githubAppConnectionError).toBeNull();
      expect(result.permissionStatus).toEqual({
        allRepos: undefined,
        admin: undefined,
        contents: undefined,
      });
    });
  });

  describe('isStorageQuotaError', () => {
    it('should return true for MAX_WRITE_OPERATIONS_PER_HOUR error', () => {
      const error = new Error('Quota exceeded: MAX_WRITE_OPERATIONS_PER_HOUR');
      expect(isStorageQuotaError(error)).toBe(true);
    });

    it('should return true for string error message', () => {
      expect(isStorageQuotaError('Quota exceeded: MAX_WRITE_OPERATIONS_PER_HOUR')).toBe(true);
    });

    it('should return false for other errors', () => {
      const error = new Error('Network error');
      expect(isStorageQuotaError(error)).toBe(false);
    });
  });

  describe('generateStorageQuotaErrorMessage', () => {
    it('should return appropriate error message', () => {
      const message = generateStorageQuotaErrorMessage();
      expect(message).toContain('1800 times per hour');
      expect(message).toContain('once every 2 seconds');
    });
  });

  describe('shouldUpdateSettingsFromStorage', () => {
    it('should return true when project IDs match', () => {
      const updateInfo = {
        projectId: 'test-project',
        repoName: 'new-repo',
        branch: 'develop',
      };

      expect(shouldUpdateSettingsFromStorage(updateInfo, 'test-project')).toBe(true);
    });

    it('should return false when project IDs do not match', () => {
      const updateInfo = {
        projectId: 'different-project',
        repoName: 'new-repo',
        branch: 'develop',
      };

      expect(shouldUpdateSettingsFromStorage(updateInfo, 'test-project')).toBe(false);
    });

    it('should return false when current project ID is null', () => {
      const updateInfo = {
        projectId: 'test-project',
        repoName: 'new-repo',
        branch: 'develop',
      };

      expect(shouldUpdateSettingsFromStorage(updateInfo, null)).toBe(false);
    });
  });

  describe('needsPermissionCheck', () => {
    it('should return true when token changes', () => {
      expect(needsPermissionCheck('old-token', 'new-token', Date.now())).toBe(true);
    });

    it('should return true when never checked', () => {
      expect(needsPermissionCheck('token', 'token', null)).toBe(true);
    });

    it('should return true when check is expired', () => {
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      expect(needsPermissionCheck('token', 'token', thirtyOneDaysAgo)).toBe(true);
    });

    it('should return false when token unchanged and check is recent', () => {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      expect(needsPermissionCheck('token', 'token', oneDayAgo)).toBe(false);
    });
  });

  describe('validateGitHubApp', () => {
    it('should return valid result when installation ID exists', () => {
      const result = validateGitHubApp(12345, 'testuser', 'https://example.com/avatar.jpg');

      expect(result.isValid).toBe(true);
      expect(result.userInfo?.login).toBe('testuser');
      expect(result.userInfo?.avatar_url).toBe('https://example.com/avatar.jpg');
    });

    it('should return invalid result when no installation ID', () => {
      const result = validateGitHubApp(null);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('No GitHub App installation found');
    });

    it('should use default username when not provided', () => {
      const result = validateGitHubApp(12345);

      expect(result.isValid).toBe(true);
      expect(result.userInfo?.login).toBe('GitHub User');
    });
  });

  describe('updateSettingsFromStorageChange', () => {
    it('should update settings with new values', () => {
      const state: GitHubSettingsState = {
        projectId: 'test-project',
        repoName: 'old-repo',
        branch: 'main',
        authenticationMethod: 'pat',
        repoOwner: 'testuser',
        isOnboarding: false,
      };

      const updateInfo = {
        repoName: 'new-repo',
        branch: 'develop',
      };

      const result = updateSettingsFromStorageChange(state, updateInfo);

      expect(result.repoName).toBe('new-repo');
      expect(result.branch).toBe('develop');
    });
  });

  describe('updateSettingsFromSyncStorage', () => {
    it('should update settings when project exists in sync storage', () => {
      const state: GitHubSettingsState = {
        projectId: 'test-project',
        repoName: 'old-repo',
        branch: 'main',
        authenticationMethod: 'pat',
        repoOwner: 'testuser',
        isOnboarding: false,
      };

      const projectSettings = {
        'test-project': {
          repoName: 'synced-repo',
          branch: 'feature',
        },
      };

      const result = updateSettingsFromSyncStorage(state, projectSettings);

      expect(result.repoName).toBe('synced-repo');
      expect(result.branch).toBe('feature');
    });

    it('should not update settings when project does not exist in sync storage', () => {
      const state: GitHubSettingsState = {
        projectId: 'test-project',
        repoName: 'old-repo',
        branch: 'main',
        authenticationMethod: 'pat',
        repoOwner: 'testuser',
        isOnboarding: false,
      };

      const projectSettings = {
        'different-project': {
          repoName: 'synced-repo',
          branch: 'feature',
        },
      };

      const result = updateSettingsFromSyncStorage(state, projectSettings);

      expect(result.repoName).toBe('old-repo');
      expect(result.branch).toBe('main');
    });

    it('should not update settings when projectId is null', () => {
      const state: GitHubSettingsState = {
        projectId: null,
        repoName: 'old-repo',
        branch: 'main',
        authenticationMethod: 'pat',
        repoOwner: 'testuser',
        isOnboarding: false,
      };

      const projectSettings = {
        'test-project': {
          repoName: 'synced-repo',
          branch: 'feature',
        },
      };

      const result = updateSettingsFromSyncStorage(state, projectSettings);

      expect(result.repoName).toBe('old-repo');
      expect(result.branch).toBe('main');
    });
  });
});
