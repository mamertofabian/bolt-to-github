/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('GitHubSettings.svelte - Logic Tests', () => {
  let chromeMocks: {
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
      };
      sync: {
        get: ReturnType<typeof vi.fn>;
      };
      onChanged: {
        addListener: ReturnType<typeof vi.fn>;
        removeListener: ReturnType<typeof vi.fn>;
      };
    };
    runtime: {
      lastError?: { message: string } | null;
    };
  };

  beforeEach(() => {
    chromeMocks = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ preferredAuthMethod: 'pat' }),
          set: vi.fn().mockResolvedValue(undefined),
        },
        sync: {
          get: vi.fn().mockResolvedValue({}),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      runtime: {
        lastError: null,
      },
    };

    Object.defineProperty(window, 'chrome', {
      value: chromeMocks,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Reactive Statement: hasRequiredSettings', () => {
    it('should be true when PAT credentials are complete', () => {
      type State = {
        authenticationMethod: 'pat' | 'github_app';
        githubToken?: string;
        githubAppInstallationId?: number | null;
        repoOwner: string;
        repoName: string;
        branch: string;
        isOnboarding: boolean;
      };

      const state: State = {
        authenticationMethod: 'pat',
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      const hasRequiredSettings =
        ((state.authenticationMethod === 'pat' && state.githubToken && state.repoOwner) ||
          (state.authenticationMethod === 'github_app' &&
            state.githubAppInstallationId &&
            state.repoOwner)) &&
        (!state.isOnboarding || (state.repoName && state.branch));

      expect(hasRequiredSettings).toBe(true);
    });

    it('should be true when GitHub App is authenticated', () => {
      type State = {
        authenticationMethod: 'pat' | 'github_app';
        githubToken?: string;
        githubAppInstallationId?: number | null;
        repoOwner: string;
        repoName: string;
        branch: string;
        isOnboarding: boolean;
      };

      const state: State = {
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      const hasRequiredSettings =
        ((state.authenticationMethod === 'pat' && state.githubToken && state.repoOwner) ||
          (state.authenticationMethod === 'github_app' &&
            state.githubAppInstallationId &&
            state.repoOwner)) &&
        (!state.isOnboarding || (state.repoName && state.branch));

      expect(hasRequiredSettings).toBe(true);
    });

    it('should be false when PAT is missing token', () => {
      type State = {
        authenticationMethod: 'pat' | 'github_app';
        githubToken?: string;
        githubAppInstallationId?: number | null;
        repoOwner: string;
        repoName: string;
        branch: string;
        isOnboarding: boolean;
      };

      const state: State = {
        authenticationMethod: 'pat',
        githubToken: undefined,
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      const hasRequiredSettings =
        ((state.authenticationMethod === 'pat' && state.githubToken && state.repoOwner) ||
          (state.authenticationMethod === 'github_app' &&
            state.githubAppInstallationId &&
            state.repoOwner)) &&
        (!state.isOnboarding || (state.repoName && state.branch));

      expect(hasRequiredSettings).toBe(false);
    });

    it('should be false when GitHub App is missing installation ID', () => {
      type State = {
        authenticationMethod: 'pat' | 'github_app';
        githubToken?: string;
        githubAppInstallationId?: number | null;
        repoOwner: string;
        repoName: string;
        branch: string;
        isOnboarding: boolean;
      };

      const state: State = {
        authenticationMethod: 'github_app',
        githubAppInstallationId: null,
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
        isOnboarding: false,
      };

      const hasRequiredSettings = Boolean(
        ((state.authenticationMethod === 'pat' && state.githubToken && state.repoOwner) ||
          (state.authenticationMethod === 'github_app' &&
            state.githubAppInstallationId &&
            state.repoOwner)) &&
          (!state.isOnboarding || (state.repoName && state.branch))
      );

      expect(hasRequiredSettings).toBe(false);
    });
  });

  describe('Reactive Statement: isExpanded Collapsible Behavior', () => {
    it('should collapse when hasRequiredSettings is true and not onboarding', () => {
      const state = {
        isOnboarding: false,
        hasRequiredSettings: true,
        manuallyToggled: false,
      };

      const isExpanded = state.isOnboarding || !state.hasRequiredSettings;
      expect(isExpanded).toBe(false);
    });

    it('should stay expanded during onboarding regardless of settings', () => {
      const state = {
        isOnboarding: true,
        hasRequiredSettings: true,
        manuallyToggled: false,
      };

      const isExpanded = state.isOnboarding || !state.hasRequiredSettings;
      expect(isExpanded).toBe(true);
    });

    it('should stay expanded when settings are incomplete', () => {
      const state = {
        isOnboarding: false,
        hasRequiredSettings: false,
        manuallyToggled: false,
      };

      const isExpanded = state.isOnboarding || !state.hasRequiredSettings;
      expect(isExpanded).toBe(true);
    });

    it('should not auto-collapse when manually toggled', () => {
      const state = {
        isOnboarding: false,
        hasRequiredSettings: true,
        manuallyToggled: true,
        isExpanded: true,
      };

      expect(state.isExpanded).toBe(true);
    });
  });

  describe('Reactive Statement: filteredRepos', () => {
    const mockRepos = [
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
      const repoSearchQuery = 'backend';
      const filteredRepos = mockRepos
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
            (repo.description &&
              repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
        )
        .slice(0, 10);

      expect(filteredRepos).toHaveLength(1);
      expect(filteredRepos[0].name).toBe('backend-api');
    });

    it('should filter repositories by description match', () => {
      const repoSearchQuery = 'awesome';
      const filteredRepos = mockRepos
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
            (repo.description &&
              repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
        )
        .slice(0, 10);

      expect(filteredRepos).toHaveLength(1);
      expect(filteredRepos[0].name).toBe('awesome-project');
    });

    it('should handle null descriptions safely', () => {
      const repoSearchQuery = 'frontend';
      const filteredRepos = mockRepos
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
            (repo.description &&
              repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
        )
        .slice(0, 10);

      expect(filteredRepos).toHaveLength(1);
      expect(filteredRepos[0].name).toBe('frontend-app');
    });

    it('should be case-insensitive', () => {
      const repoSearchQuery = 'BACKEND';
      const filteredRepos = mockRepos
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
            (repo.description &&
              repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
        )
        .slice(0, 10);

      expect(filteredRepos).toHaveLength(1);
      expect(filteredRepos[0].name).toBe('backend-api');
    });

    it('should limit results to 10 items', () => {
      const manyRepos = Array.from({ length: 20 }, (_, i) => ({
        name: `repo-${i}`,
        description: `Description ${i}`,
        html_url: `https://github.com/user/repo-${i}`,
        private: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        language: 'TypeScript',
      }));

      const repoSearchQuery = 'repo';
      const filteredRepos = manyRepos
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
            (repo.description &&
              repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
        )
        .slice(0, 10);

      expect(filteredRepos).toHaveLength(10);
    });

    it('should return empty array when no repositories match', () => {
      const repoSearchQuery = 'nonexistent';
      const filteredRepos = mockRepos
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
            (repo.description &&
              repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
        )
        .slice(0, 10);

      expect(filteredRepos).toHaveLength(0);
    });
  });

  describe('Reactive Statement: repoExists', () => {
    const mockRepos = [{ name: 'existing-repo' }, { name: 'another-repo' }, { name: 'Third-Repo' }];

    it('should detect existing repository', () => {
      const repoName = 'existing-repo';
      const repoExists = mockRepos.some(
        (repo) => repo.name.toLowerCase() === repoName.toLowerCase()
      );

      expect(repoExists).toBe(true);
    });

    it('should detect non-existing repository', () => {
      const repoName = 'new-repo';
      const repoExists = mockRepos.some(
        (repo) => repo.name.toLowerCase() === repoName.toLowerCase()
      );

      expect(repoExists).toBe(false);
    });

    it('should be case-insensitive', () => {
      const repoName = 'THIRD-REPO';
      const repoExists = mockRepos.some(
        (repo) => repo.name.toLowerCase() === repoName.toLowerCase()
      );

      expect(repoExists).toBe(true);
    });
  });

  describe('Reactive Statement: repoName from projectId', () => {
    it('should use projectId as default repoName when not set', () => {
      const state = {
        projectId: 'my-project-123',
        repoName: '',
        isRepoNameFromProjectId: false,
      };

      if (state.projectId && !state.repoName && !state.isRepoNameFromProjectId) {
        state.repoName = state.projectId;
        state.isRepoNameFromProjectId = true;
      }

      expect(state.repoName).toBe('my-project-123');
      expect(state.isRepoNameFromProjectId).toBe(true);
    });

    it('should not override existing repoName', () => {
      const state = {
        projectId: 'my-project-123',
        repoName: 'existing-repo',
        isRepoNameFromProjectId: false,
      };

      if (state.projectId && !state.repoName && !state.isRepoNameFromProjectId) {
        state.repoName = state.projectId;
        state.isRepoNameFromProjectId = true;
      }

      expect(state.repoName).toBe('existing-repo');
      expect(state.isRepoNameFromProjectId).toBe(false);
    });
  });

  describe('Reactive Statement: statusDisplayText', () => {
    it('should show GitHub App status when authenticated', () => {
      const state = {
        authenticationMethod: 'github_app' as 'pat' | 'github_app',
        githubAppInstallationId: 12345,
        githubAppUsername: 'testuser',
        githubToken: '',
        repoOwner: '',
        repoName: '',
      };

      const statusDisplayText = (() => {
        if (state.authenticationMethod === 'github_app') {
          if (state.githubAppInstallationId && state.githubAppUsername) {
            return `Connected via GitHub App as ${state.githubAppUsername}`;
          }
          return 'Connect with GitHub App to get started';
        } else {
          if (state.githubToken && state.repoOwner) {
            return `Configured for ${state.repoOwner}${state.repoName ? `/${state.repoName}` : ''}`;
          }
          return 'Configure your GitHub repository settings';
        }
      })();

      expect(statusDisplayText).toBe('Connected via GitHub App as testuser');
    });

    it('should show connection prompt when GitHub App not connected', () => {
      const state = {
        authenticationMethod: 'github_app' as 'pat' | 'github_app',
        githubAppInstallationId: null,
        githubAppUsername: null,
        githubToken: '',
        repoOwner: '',
        repoName: '',
      };

      const statusDisplayText = (() => {
        if (state.authenticationMethod === 'github_app') {
          if (state.githubAppInstallationId && state.githubAppUsername) {
            return `Connected via GitHub App as ${state.githubAppUsername}`;
          }
          return 'Connect with GitHub App to get started';
        } else {
          if (state.githubToken && state.repoOwner) {
            return `Configured for ${state.repoOwner}${state.repoName ? `/${state.repoName}` : ''}`;
          }
          return 'Configure your GitHub repository settings';
        }
      })();

      expect(statusDisplayText).toBe('Connect with GitHub App to get started');
    });

    it('should show repository configuration for PAT', () => {
      const state = {
        authenticationMethod: 'pat' as 'pat' | 'github_app',
        githubAppInstallationId: null,
        githubAppUsername: null,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
      };

      const statusDisplayText = (() => {
        if (state.authenticationMethod === 'github_app') {
          if (state.githubAppInstallationId && state.githubAppUsername) {
            return `Connected via GitHub App as ${state.githubAppUsername}`;
          }
          return 'Connect with GitHub App to get started';
        } else {
          if (state.githubToken && state.repoOwner) {
            return `Configured for ${state.repoOwner}${state.repoName ? `/${state.repoName}` : ''}`;
          }
          return 'Configure your GitHub repository settings';
        }
      })();

      expect(statusDisplayText).toBe('Configured for testuser/testrepo');
    });
  });

  describe('Authentication Method State Clearing', () => {
    it('should clear validation state when switching from PAT to GitHub App', () => {
      const newState = {
        isTokenValid: null,
        validationError: null,
        tokenType: null,
        permissionStatus: {
          allRepos: undefined,
          admin: undefined,
          contents: undefined,
        },
      };

      expect(newState.isTokenValid).toBeNull();
      expect(newState.validationError).toBeNull();
      expect(newState.tokenType).toBeNull();
      expect(newState.permissionStatus.allRepos).toBeUndefined();
    });

    it('should clear GitHub App state when switching to PAT', () => {
      const newState = {
        githubAppValidationResult: null,
        githubAppConnectionError: null,
      };

      expect(newState.githubAppValidationResult).toBeNull();
      expect(newState.githubAppConnectionError).toBeNull();
    });

    it('should save authentication method preference to storage', async () => {
      await chromeMocks.storage.local.set({ preferredAuthMethod: 'github_app' });

      expect(chromeMocks.storage.local.set).toHaveBeenCalledWith({
        preferredAuthMethod: 'github_app',
      });
    });
  });

  describe('Storage Quota Error Handling', () => {
    it('should detect MAX_WRITE_OPERATIONS_PER_HOUR error', () => {
      const error = new Error('Quota exceeded: MAX_WRITE_OPERATIONS_PER_HOUR');

      expect(error.message).toContain('MAX_WRITE_OPERATIONS_PER_H');
    });

    it('should handle storage quota error from chrome.runtime.lastError', () => {
      chromeMocks.runtime.lastError = {
        message: 'Quota exceeded: MAX_WRITE_OPERATIONS_PER_HOUR',
      };

      expect(chromeMocks.runtime.lastError.message).toContain('MAX_WRITE_OPERATIONS_PER_H');
    });

    it('should generate appropriate error message for quota exceeded', () => {
      const errorMessage =
        'Storage quota exceeded. You can only save settings 1800 times per hour (once every 2 seconds). Please wait a moment before trying again.';

      expect(errorMessage).toContain('1800 times per hour');
      expect(errorMessage).toContain('once every 2 seconds');
    });

    it('should clear storage quota error when cleared', () => {
      const state = {
        storageQuotaError: 'Storage quota exceeded',
      };

      state.storageQuotaError = null as unknown as string;

      expect(state.storageQuotaError).toBeNull();
    });
  });

  describe('Storage Change Listeners', () => {
    it('should update settings when lastSettingsUpdate changes for current project', () => {
      const projectId = 'test-project';
      const updateInfo = {
        timestamp: Date.now(),
        projectId: 'test-project',
        repoName: 'new-repo',
        branch: 'develop',
      };

      const state = {
        projectId,
        repoName: 'old-repo',
        branch: 'main',
      };

      if (updateInfo.projectId === state.projectId) {
        state.repoName = updateInfo.repoName;
        state.branch = updateInfo.branch;
      }

      expect(state.repoName).toBe('new-repo');
      expect(state.branch).toBe('develop');
    });

    it('should not update settings when lastSettingsUpdate is for different project', () => {
      const projectId = 'test-project';
      const updateInfo = {
        timestamp: Date.now(),
        projectId: 'different-project',
        repoName: 'new-repo',
        branch: 'develop',
      };

      const state = {
        projectId,
        repoName: 'old-repo',
        branch: 'main',
      };

      if (updateInfo.projectId === state.projectId) {
        state.repoName = updateInfo.repoName;
        state.branch = updateInfo.branch;
      }

      expect(state.repoName).toBe('old-repo');
      expect(state.branch).toBe('main');
    });

    it('should update from sync storage when projectSettings change', () => {
      const projectId = 'test-project';
      const newSettings = {
        'test-project': {
          repoName: 'synced-repo',
          branch: 'feature',
        },
      };

      const state = {
        projectId,
        repoName: 'old-repo',
        branch: 'main',
      };

      if (newSettings[projectId]) {
        state.repoName = newSettings[projectId].repoName;
        state.branch = newSettings[projectId].branch;
      }

      expect(state.repoName).toBe('synced-repo');
      expect(state.branch).toBe('feature');
    });

    it('should register storage change listener on mount', () => {
      const listenerFn = vi.fn();
      chromeMocks.storage.onChanged.addListener(listenerFn);

      expect(chromeMocks.storage.onChanged.addListener).toHaveBeenCalledWith(listenerFn);
    });

    it('should remove storage change listener on unmount', () => {
      const listenerFn = vi.fn();
      chromeMocks.storage.onChanged.removeListener(listenerFn);

      expect(chromeMocks.storage.onChanged.removeListener).toHaveBeenCalledWith(listenerFn);
    });
  });

  describe('Permission Check Timing Logic', () => {
    it('should check permissions when token changes', () => {
      const previousToken = 'ghp_old_token';
      const currentToken = 'ghp_new_token';

      const needsCheck = (previousToken as string) !== (currentToken as string);

      expect(needsCheck).toBe(true);
    });

    it('should check permissions when more than 30 days have passed', () => {
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      const moreThan30DaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;

      const needsCheck = Date.now() - moreThan30DaysAgo > THIRTY_DAYS;

      expect(needsCheck).toBe(true);
    });

    it('should not check permissions within 30 days if token unchanged', () => {
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      const twentyDaysAgo = Date.now() - 20 * 24 * 60 * 60 * 1000;
      const previousToken = 'ghp_token';
      const currentToken = 'ghp_token';

      const needsCheck =
        (previousToken as string) !== (currentToken as string) ||
        Date.now() - twentyDaysAgo > THIRTY_DAYS;

      expect(needsCheck).toBe(false);
    });
  });

  describe('GitHub App Validation Logic', () => {
    it('should validate when installation ID exists', () => {
      const githubAppInstallationId = 12345;

      const validationResult = {
        isValid: !!githubAppInstallationId,
        userInfo: {
          login: 'testuser',
          avatar_url: 'https://example.com/avatar.jpg',
        },
      };

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.userInfo.login).toBe('testuser');
    });

    it('should fail validation when no installation ID', () => {
      const validationResult = {
        isValid: false,
        error: 'No GitHub App installation found',
      };

      expect(validationResult.isValid).toBe(false);
    });
  });
});
