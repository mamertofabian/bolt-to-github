/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
  filterRepositories,
  checkRepositoryExists,
  getDefaultProjectTitle,
  calculateNextSelectedIndex,
  shouldShowDropdown,
  canSaveForm,
  getAuthenticationMethod,
  createGitHubServiceConfig,
  handleKeyboardNavigation,
  getRepositoryStatusMessage,
  type Repository,
  type AuthSettings,
} from '$lib/utils/repo-settings';

describe('RepoSettings Business Logic', () => {
  const mockRepositories: Repository[] = [
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
    {
      name: 'mobile-app',
      description: 'Mobile application',
      html_url: 'https://github.com/user/mobile-app',
      private: false,
      created_at: '2024-01-07',
      updated_at: '2024-01-08',
      language: 'Swift',
    },
  ];

  describe('filterRepositories', () => {
    it('should filter repositories by name match', () => {
      const result = filterRepositories(mockRepositories, 'backend');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('backend-api');
    });

    it('should filter repositories by description match', () => {
      const result = filterRepositories(mockRepositories, 'awesome');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('awesome-project');
    });

    it('should be case-insensitive', () => {
      const result = filterRepositories(mockRepositories, 'BACKEND');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('backend-api');
    });

    it('should handle null descriptions safely', () => {
      const result = filterRepositories(mockRepositories, 'frontend');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('frontend-app');
    });

    it('should match partial strings in names', () => {
      const result = filterRepositories(mockRepositories, 'app');

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.name)).toContain('frontend-app');
      expect(result.map((r) => r.name)).toContain('mobile-app');
    });

    it('should return empty array when no match', () => {
      const result = filterRepositories(mockRepositories, 'nonexistent');

      expect(result).toHaveLength(0);
    });

    it('should limit results to specified maximum', () => {
      const manyRepos = Array.from({ length: 20 }, (_, i) => ({
        name: `repo-${i}`,
        description: `Description ${i}`,
        html_url: `https://github.com/user/repo-${i}`,
        private: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        language: 'TypeScript',
      }));

      const result = filterRepositories(manyRepos, 'repo', 5);

      expect(result).toHaveLength(5);
    });

    it('should return all repos when query is empty', () => {
      const result = filterRepositories(mockRepositories, '');

      expect(result).toHaveLength(mockRepositories.length);
    });

    it('should return all repos when query is whitespace only', () => {
      const result = filterRepositories(mockRepositories, '   ');

      expect(result).toHaveLength(mockRepositories.length);
    });

    it('should match in both name and description', () => {
      const result = filterRepositories(mockRepositories, 'api');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('backend-api');
    });
  });

  describe('checkRepositoryExists', () => {
    it('should detect existing repository', () => {
      const result = checkRepositoryExists(mockRepositories, 'awesome-project');

      expect(result).toBe(true);
    });

    it('should detect non-existing repository', () => {
      const result = checkRepositoryExists(mockRepositories, 'new-repo');

      expect(result).toBe(false);
    });

    it('should be case-insensitive', () => {
      const result = checkRepositoryExists(mockRepositories, 'AWESOME-PROJECT');

      expect(result).toBe(true);
    });

    it('should handle mixed case names', () => {
      const result = checkRepositoryExists(mockRepositories, 'awesome-Project');

      expect(result).toBe(true);
    });

    it('should return false for empty name', () => {
      const result = checkRepositoryExists(mockRepositories, '');

      expect(result).toBe(false);
    });

    it('should return false for whitespace-only name', () => {
      const result = checkRepositoryExists(mockRepositories, '   ');

      expect(result).toBe(false);
    });

    it('should handle empty repository list', () => {
      const result = checkRepositoryExists([], 'any-repo');

      expect(result).toBe(false);
    });
  });

  describe('getDefaultProjectTitle', () => {
    it('should use repoName as default when projectTitle is empty', () => {
      const result = getDefaultProjectTitle('', 'my-repo');

      expect(result).toBe('my-repo');
    });

    it('should not override existing projectTitle', () => {
      const result = getDefaultProjectTitle('Custom Title', 'my-repo');

      expect(result).toBe('Custom Title');
    });

    it('should not set projectTitle when repoName is empty', () => {
      const result = getDefaultProjectTitle('', '');

      expect(result).toBe('');
    });

    it('should not set projectTitle when repoName is whitespace only', () => {
      const result = getDefaultProjectTitle('', '   ');

      expect(result).toBe('');
    });

    it('should preserve existing title when repoName is empty', () => {
      const result = getDefaultProjectTitle('Existing Title', '');

      expect(result).toBe('Existing Title');
    });
  });

  describe('calculateNextSelectedIndex', () => {
    it('should increment selectedIndex when moving down', () => {
      const result = calculateNextSelectedIndex(0, 'down', 5);

      expect(result).toBe(1);
    });

    it('should decrement selectedIndex when moving up', () => {
      const result = calculateNextSelectedIndex(2, 'up', 5);

      expect(result).toBe(1);
    });

    it('should not go beyond last item when moving down', () => {
      const result = calculateNextSelectedIndex(2, 'down', 2);

      expect(result).toBe(2);
    });

    it('should not go below -1 when moving up', () => {
      const result = calculateNextSelectedIndex(0, 'up', 5);

      expect(result).toBe(-1);
    });

    it('should handle edge case at -1 moving down', () => {
      const result = calculateNextSelectedIndex(-1, 'down', 5);

      expect(result).toBe(0);
    });

    it('should handle edge case at -1 moving up', () => {
      const result = calculateNextSelectedIndex(-1, 'up', 5);

      expect(result).toBe(-1);
    });
  });

  describe('shouldShowDropdown', () => {
    it('should show dropdown when there are filtered repos', () => {
      const result = shouldShowDropdown(true, [mockRepositories[0]], false);

      expect(result).toBe(true);
    });

    it('should show dropdown when repository does not exist', () => {
      const result = shouldShowDropdown(true, [], false);

      expect(result).toBe(true);
    });

    it('should not show dropdown when not focused', () => {
      const result = shouldShowDropdown(false, [mockRepositories[0]], false);

      expect(result).toBe(false);
    });

    it('should not show dropdown when focused but repo exists and no filtered results', () => {
      const result = shouldShowDropdown(true, [], true);

      expect(result).toBe(false);
    });

    it('should show dropdown when focused, repo exists, but has filtered results', () => {
      const result = shouldShowDropdown(true, [mockRepositories[0]], true);

      expect(result).toBe(true);
    });
  });

  describe('canSaveForm', () => {
    it('should prevent save when repoName is empty', () => {
      const result = canSaveForm('', 'main');

      expect(result).toBe(false);
    });

    it('should prevent save when branch is empty', () => {
      const result = canSaveForm('test-repo', '');

      expect(result).toBe(false);
    });

    it('should allow save when all required fields are filled', () => {
      const result = canSaveForm('test-repo', 'main');

      expect(result).toBe(true);
    });

    it('should prevent save when isSaving is true', () => {
      const result = canSaveForm('test-repo', 'main', true);

      expect(result).toBe(false);
    });

    it('should allow save when isSaving is false', () => {
      const result = canSaveForm('test-repo', 'main', false);

      expect(result).toBe(true);
    });

    it('should handle whitespace-only values', () => {
      const result = canSaveForm('   ', 'main');

      expect(result).toBe(false);
    });
  });

  describe('getAuthenticationMethod', () => {
    it('should return github_app when authenticationMethod is github_app', () => {
      const settings: AuthSettings = { authenticationMethod: 'github_app' };
      const result = getAuthenticationMethod(settings);

      expect(result).toBe('github_app');
    });

    it('should return pat when authenticationMethod is pat', () => {
      const settings: AuthSettings = { authenticationMethod: 'pat' };
      const result = getAuthenticationMethod(settings);

      expect(result).toBe('pat');
    });

    it('should default to pat when authenticationMethod is not set', () => {
      const settings: AuthSettings = {};
      const result = getAuthenticationMethod(settings);

      expect(result).toBe('pat');
    });

    it('should default to pat when authenticationMethod is invalid', () => {
      const settings: AuthSettings = { authenticationMethod: 'invalid' as 'pat' | 'github_app' };
      const result = getAuthenticationMethod(settings);

      expect(result).toBe('pat');
    });
  });

  describe('createGitHubServiceConfig', () => {
    it('should create config with github_app type', () => {
      const result = createGitHubServiceConfig('github_app', 'token');

      expect(result).toEqual({ type: 'github_app' });
    });

    it('should create config with token for PAT', () => {
      const result = createGitHubServiceConfig('pat', 'ghp_test');

      expect(result).toBe('ghp_test');
    });

    it('should handle empty token for PAT', () => {
      const result = createGitHubServiceConfig('pat', '');

      expect(result).toBe('');
    });
  });

  describe('handleKeyboardNavigation', () => {
    it('should handle ArrowDown key', () => {
      const result = handleKeyboardNavigation('ArrowDown', 0, mockRepositories);

      expect(result.newIndex).toBe(1);
      expect(result.selectedRepo).toBeNull();
      expect(result.shouldCloseDropdown).toBe(false);
    });

    it('should handle ArrowUp key', () => {
      const result = handleKeyboardNavigation('ArrowUp', 2, mockRepositories);

      expect(result.newIndex).toBe(1);
      expect(result.selectedRepo).toBeNull();
      expect(result.shouldCloseDropdown).toBe(false);
    });

    it('should handle Enter key with valid selection', () => {
      const result = handleKeyboardNavigation('Enter', 1, mockRepositories);

      expect(result.newIndex).toBe(1);
      expect(result.selectedRepo).toEqual(mockRepositories[1]);
      expect(result.shouldCloseDropdown).toBe(true);
    });

    it('should handle Enter key with invalid selection', () => {
      const result = handleKeyboardNavigation('Enter', -1, mockRepositories);

      expect(result.newIndex).toBe(-1);
      expect(result.selectedRepo).toBeNull();
      expect(result.shouldCloseDropdown).toBe(false);
    });

    it('should handle Escape key', () => {
      const result = handleKeyboardNavigation('Escape', 1, mockRepositories);

      expect(result.newIndex).toBe(1);
      expect(result.selectedRepo).toBeNull();
      expect(result.shouldCloseDropdown).toBe(true);
    });

    it('should handle unknown key', () => {
      const result = handleKeyboardNavigation('Tab', 1, mockRepositories);

      expect(result.newIndex).toBe(1);
      expect(result.selectedRepo).toBeNull();
      expect(result.shouldCloseDropdown).toBe(false);
    });

    it('should handle Enter with empty repository list', () => {
      const result = handleKeyboardNavigation('Enter', 0, []);

      expect(result.newIndex).toBe(0);
      expect(result.selectedRepo).toBeNull();
      expect(result.shouldCloseDropdown).toBe(false);
    });
  });

  describe('getRepositoryStatusMessage', () => {
    it('should return info message when repository exists', () => {
      const result = getRepositoryStatusMessage('existing-repo', true);

      expect(result.type).toBe('info');
      expect(result.message).toContain('Using existing repository');
    });

    it('should return success message when repository does not exist but name is provided', () => {
      const result = getRepositoryStatusMessage('new-repo', false);

      expect(result.type).toBe('success');
      expect(result.message).toContain('new repository will be created');
    });

    it('should return warning message when no repository name is provided', () => {
      const result = getRepositoryStatusMessage('', false);

      expect(result.type).toBe('warning');
      expect(result.message).toContain('Enter a repository name');
    });

    it('should return warning message when repository name is whitespace only', () => {
      const result = getRepositoryStatusMessage('   ', false);

      expect(result.type).toBe('warning');
      expect(result.message).toContain('Enter a repository name');
    });
  });
});
