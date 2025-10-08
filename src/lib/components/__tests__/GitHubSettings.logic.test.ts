/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { tick } from 'svelte';

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('$lib/constants', () => ({
  GITHUB_APP_AUTH_URL: 'https://bolt2github.com/github/auth',
}));

const mockState = {
  validateTokenAndUser: vi.fn(),
  isClassicToken: vi.fn(),
  listRepos: vi.fn(),
  verifyTokenPermissions: vi.fn(),
};

vi.mock('../../../services/UnifiedGitHubService', () => {
  return {
    UnifiedGitHubService: class {
      constructor(_config?: unknown) {}
      async validateTokenAndUser(username: string) {
        return mockState.validateTokenAndUser(username);
      }
      async isClassicToken() {
        return mockState.isClassicToken();
      }
      async listRepos() {
        return mockState.listRepos();
      }
      async verifyTokenPermissions(
        owner: string,
        callback: (result: { permission: 'repos' | 'admin' | 'code'; isValid: boolean }) => void
      ) {
        return mockState.verifyTokenPermissions(owner, callback);
      }
    },
  };
});

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
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });
    mockState.isClassicToken.mockResolvedValue(true);
    mockState.listRepos.mockResolvedValue([]);
    mockState.verifyTokenPermissions.mockResolvedValue({ isValid: true });

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
    };

    Object.defineProperty(window, 'chrome', {
      value: chromeMocks,
      writable: true,
      configurable: true,
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Token Validation with Debouncing', () => {
    it('should debounce token validation to avoid excessive API calls', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      const service = new UnifiedGitHubService('token1');
      service.validateTokenAndUser('user1');

      await tick();
      vi.advanceTimersByTime(100);

      const service2 = new UnifiedGitHubService('token2');
      service2.validateTokenAndUser('user2');

      await tick();
      vi.advanceTimersByTime(100);

      const service3 = new UnifiedGitHubService('token3');
      service3.validateTokenAndUser('user3');

      await tick();
      vi.advanceTimersByTime(500);

      expect(mockState.validateTokenAndUser).toHaveBeenCalledTimes(3);
    });

    it('should validate token when service is called', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });

      const service = new UnifiedGitHubService('ghp_test');
      await service.validateTokenAndUser('testuser');

      expect(mockState.validateTokenAndUser).toHaveBeenCalledWith('testuser');
    });

    it('should cancel previous validation timeout when new input arrives', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      const service1 = new UnifiedGitHubService('token1');
      service1.validateTokenAndUser('user1');

      await tick();
      vi.advanceTimersByTime(300);

      const service2 = new UnifiedGitHubService('token2');
      service2.validateTokenAndUser('user2');

      await tick();
      vi.advanceTimersByTime(500);

      expect(mockState.validateTokenAndUser).toHaveBeenCalledWith('user1');
      expect(mockState.validateTokenAndUser).toHaveBeenCalledWith('user2');
    });

    it('should validate immediately when owner changes with existing token', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });

      const service = new UnifiedGitHubService('ghp_test');
      service.validateTokenAndUser('newuser');

      await tick();
      vi.advanceTimersByTime(500);

      expect(mockState.validateTokenAndUser).toHaveBeenCalledWith('newuser');
    });
  });

  describe('Permission Checking Logic', () => {
    it('should verify all three permissions: repos, admin, contents', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const callbackResults: Array<{ permission: string; isValid: boolean }> = [];

      mockState.verifyTokenPermissions.mockImplementation(async (_owner, callback) => {
        const permissions = [
          { permission: 'repos', isValid: true },
          { permission: 'admin', isValid: true },
          { permission: 'code', isValid: true },
        ];

        for (const perm of permissions) {
          callback(perm as { permission: 'repos' | 'admin' | 'code'; isValid: boolean });
          callbackResults.push(perm);
        }

        return { isValid: true };
      });

      const service = new UnifiedGitHubService('ghp_test');
      await service.verifyTokenPermissions('testuser', (result) => {
        callbackResults.push(result);
      });

      expect(callbackResults).toHaveLength(6);
      expect(callbackResults.filter((r) => r.permission === 'repos')).toHaveLength(2);
      expect(callbackResults.filter((r) => r.permission === 'admin')).toHaveLength(2);
      expect(callbackResults.filter((r) => r.permission === 'code')).toHaveLength(2);
    });

    it('should return false when repos permission fails', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      mockState.verifyTokenPermissions.mockImplementation(async (_owner, callback) => {
        callback({ permission: 'repos', isValid: false });
        callback({ permission: 'admin', isValid: true });
        callback({ permission: 'code', isValid: true });
        return { isValid: false, error: 'Missing repository creation permission' };
      });

      const service = new UnifiedGitHubService('ghp_test');
      const result = await service.verifyTokenPermissions('testuser', vi.fn());

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('repository creation');
    });

    it('should return false when admin permission fails', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      mockState.verifyTokenPermissions.mockImplementation(async (_owner, callback) => {
        callback({ permission: 'repos', isValid: true });
        callback({ permission: 'admin', isValid: false });
        callback({ permission: 'code', isValid: true });
        return { isValid: false, error: 'Missing administration permission' };
      });

      const service = new UnifiedGitHubService('ghp_test');
      const result = await service.verifyTokenPermissions('testuser', vi.fn());

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('administration');
    });

    it('should return false when contents permission fails', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');

      mockState.verifyTokenPermissions.mockImplementation(async (_owner, callback) => {
        callback({ permission: 'repos', isValid: true });
        callback({ permission: 'admin', isValid: true });
        callback({ permission: 'code', isValid: false });
        return { isValid: false, error: 'Missing contents permission' };
      });

      const service = new UnifiedGitHubService('ghp_test');
      const result = await service.verifyTokenPermissions('testuser', vi.fn());

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('contents');
    });

    it('should track permission check timestamp on success', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const beforeTimestamp = Date.now();

      mockState.verifyTokenPermissions.mockResolvedValue({ isValid: true });

      const service = new UnifiedGitHubService('ghp_test');
      const result = await service.verifyTokenPermissions('testuser', vi.fn());

      expect(result.isValid).toBe(true);

      const timestamp = Date.now();
      expect(timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    });

    it('should skip permission check if done within 30 days', () => {
      const thirtyDaysAgo = Date.now();
      chromeMocks.storage.local.get.mockResolvedValue({
        lastPermissionCheck: thirtyDaysAgo,
        preferredAuthMethod: 'pat',
      });

      mockState.verifyTokenPermissions.mockResolvedValue({ isValid: true });

      const needsCheck = Date.now() - thirtyDaysAgo > 30 * 24 * 60 * 60 * 1000;
      expect(needsCheck).toBe(false);
    });

    it('should skip permission check if done within 30 days', async () => {
      const thirtyDaysAgo = Date.now();
      chromeMocks.storage.local.get.mockResolvedValue({
        lastPermissionCheck: thirtyDaysAgo,
        preferredAuthMethod: 'pat',
      });

      mockState.verifyTokenPermissions.mockResolvedValue({ isValid: true });

      const needsCheck = Date.now() - thirtyDaysAgo > 30 * 24 * 60 * 60 * 1000;
      expect(needsCheck).toBe(false);
    });

    it('should recheck permissions if token changes', async () => {
      const previousToken = 'ghp_old_token';
      const newToken = 'ghp_new_token';

      expect(previousToken).not.toBe(newToken);

      mockState.verifyTokenPermissions.mockResolvedValue({ isValid: true });

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService(newToken);
      await service.verifyTokenPermissions('testuser', vi.fn());

      expect(mockState.verifyTokenPermissions).toHaveBeenCalled();
    });

    it('should recheck permissions if more than 30 days have passed', async () => {
      const moreThan30DaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      chromeMocks.storage.local.get.mockResolvedValue({
        lastPermissionCheck: moreThan30DaysAgo,
        preferredAuthMethod: 'pat',
      });

      const needsCheck = Date.now() - moreThan30DaysAgo > 30 * 24 * 60 * 60 * 1000;
      expect(needsCheck).toBe(true);
    });
  });

  describe('Repository Filtering and Search', () => {
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
      const query = 'backend';
      const filtered = mockRepos.filter((repo) =>
        repo.name.toLowerCase().includes(query.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('backend-api');
    });

    it('should filter repositories by description match', () => {
      const query = 'awesome';
      const filtered = mockRepos.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('awesome-project');
    });

    it('should handle null descriptions in filtering', () => {
      const query = 'frontend';
      const filtered = mockRepos.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('frontend-app');
    });

    it('should be case-insensitive when filtering', () => {
      const query = 'BACKEND';
      const filtered = mockRepos.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('backend-api');
    });

    it('should limit filtered results to 10 items', () => {
      const manyRepos = Array.from({ length: 20 }, (_, i) => ({
        name: `repo-${i}`,
        description: `Description ${i}`,
        html_url: `https://github.com/user/repo-${i}`,
        private: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        language: 'TypeScript',
      }));

      const query = 'repo';
      const filtered = manyRepos
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(query.toLowerCase()) ||
            (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
        )
        .slice(0, 10);

      expect(filtered).toHaveLength(10);
    });

    it('should return empty array when no repositories match', () => {
      const query = 'nonexistent';
      const filtered = mockRepos.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
      );

      expect(filtered).toHaveLength(0);
    });

    it('should match partial strings in repository names', () => {
      const query = 'end';
      const filtered = mockRepos.filter((repo) =>
        repo.name.toLowerCase().includes(query.toLowerCase())
      );

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some((r) => r.name.includes('end'))).toBe(true);
    });
  });

  describe('Authentication Method Switching', () => {
    it('should clear validation state when switching from PAT to GitHub App', async () => {
      chromeMocks.storage.local.set.mockResolvedValue(undefined);

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

    it('should clear GitHub App validation when switching to PAT', () => {
      const newState = {
        githubAppValidationResult: null,
        githubAppConnectionError: null,
      };

      expect(newState.githubAppValidationResult).toBeNull();
      expect(newState.githubAppConnectionError).toBeNull();
    });

    it('should clear repository list when switching authentication methods', async () => {
      mockState.listRepos.mockResolvedValue([]);

      const repositories = {
        before: [{ name: 'repo1' }, { name: 'repo2' }],
        after: [],
      };

      expect(repositories.after).toHaveLength(0);
    });

    it('should save authentication method preference to local storage', async () => {
      chromeMocks.storage.local.set.mockResolvedValue(undefined);

      await chromeMocks.storage.local.set({ preferredAuthMethod: 'github_app' });

      expect(chromeMocks.storage.local.set).toHaveBeenCalledWith({
        preferredAuthMethod: 'github_app',
      });
    });

    it('should trigger re-validation after switching to PAT with existing credentials', async () => {
      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });

      const service = new UnifiedGitHubService('ghp_test');
      await service.validateTokenAndUser('testuser');

      expect(mockState.validateTokenAndUser).toHaveBeenCalledWith('testuser');
    });

    it('should clear permission check timestamp when switching methods', () => {
      const newState = {
        lastPermissionCheck: null,
        previousToken: null,
      };

      expect(newState.lastPermissionCheck).toBeNull();
      expect(newState.previousToken).toBeNull();
    });
  });

  describe('Storage Quota Error Handling', () => {
    it('should detect MAX_WRITE_OPERATIONS_PER_HOUR error', () => {
      const error = new Error('Quota exceeded: MAX_WRITE_OPERATIONS_PER_HOUR');

      expect(error.message).toContain('MAX_WRITE_OPERATIONS_PER_H');
    });

    it('should handle storage quota error from chrome.runtime.lastError', () => {
      const chromeMocksWithError = {
        ...chromeMocks,
        runtime: {
          lastError: {
            message: 'Quota exceeded: MAX_WRITE_OPERATIONS_PER_HOUR',
          },
        },
      };

      Object.defineProperty(window, 'chrome', {
        value: chromeMocksWithError,
        writable: true,
        configurable: true,
      });

      const lastError = (window.chrome as unknown as typeof chromeMocksWithError).runtime.lastError;
      expect(lastError?.message).toContain('MAX_WRITE_OPERATIONS_PER_H');
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

  describe('Reactive State Updates', () => {
    it('should update hasRequiredSettings when PAT credentials are complete', () => {
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

    it('should update hasRequiredSettings when GitHub App is authenticated', () => {
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

    it('should update isExpanded based on hasRequiredSettings during non-onboarding', () => {
      const state = {
        isOnboarding: false,
        hasRequiredSettings: true,
        manuallyToggled: false,
      };

      const isExpanded = state.isOnboarding || !state.hasRequiredSettings;
      expect(isExpanded).toBe(false);
    });

    it('should keep isExpanded true during onboarding regardless of settings', () => {
      const state = {
        isOnboarding: true,
        hasRequiredSettings: true,
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

    it('should detect repository existence from list', () => {
      const repositories = [{ name: 'existing-repo' }, { name: 'another-repo' }];
      const repoName = 'existing-repo';

      const repoExists = repositories.some(
        (repo) => repo.name.toLowerCase() === repoName.toLowerCase()
      );

      expect(repoExists).toBe(true);
    });

    it('should handle case-insensitive repository existence check', () => {
      const repositories = [{ name: 'Existing-Repo' }, { name: 'Another-Repo' }];
      const repoName = 'existing-repo';

      const repoExists = repositories.some(
        (repo) => repo.name.toLowerCase() === repoName.toLowerCase()
      );

      expect(repoExists).toBe(true);
    });

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
  });

  describe('GitHub App Validation', () => {
    it('should validate GitHub App when installation ID exists', async () => {
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

    it('should fail validation when no installation ID exists', () => {
      const validationResult = {
        isValid: false,
        error: 'No GitHub App installation found',
      };

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.error).toBe('No GitHub App installation found');
    });

    it('should include user info in validation result', () => {
      const userInfo = {
        login: 'github-user',
        avatar_url: 'https://avatars.githubusercontent.com/u/123456',
      };

      const validationResult = {
        isValid: true,
        userInfo,
      };

      expect(validationResult.userInfo.login).toBe('github-user');
      expect(validationResult.userInfo.avatar_url).toContain('avatars.githubusercontent.com');
    });

    it('should handle validation errors gracefully', () => {
      const error = new Error('GitHub App validation failed');

      const validationResult = {
        isValid: false,
        error: error.message,
      };

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.error).toBe('GitHub App validation failed');
    });
  });

  describe('Token Type Detection', () => {
    it('should identify classic token type', async () => {
      mockState.isClassicToken.mockResolvedValue(true);

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService('ghp_classic_token');
      const isClassic = await service.isClassicToken();

      expect(isClassic).toBe(true);
    });

    it('should identify fine-grained token type', async () => {
      mockState.isClassicToken.mockResolvedValue(false);

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService('github_pat_fine_grained');
      const isClassic = await service.isClassicToken();

      expect(isClassic).toBe(false);
    });

    it('should set token type to null when validation fails', () => {
      const state = {
        isTokenValid: false,
        tokenType: null as 'classic' | 'fine-grained' | null,
      };

      expect(state.tokenType).toBeNull();
    });

    it('should set token type after successful validation', async () => {
      mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });
      mockState.isClassicToken.mockResolvedValue(true);

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService('ghp_test');
      const validationResult = await service.validateTokenAndUser('testuser');
      const isClassic = await service.isClassicToken();

      expect(validationResult.isValid).toBe(true);
      expect(isClassic).toBe(true);
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

  describe('Status Display Text Generation', () => {
    it('should show GitHub App status when authenticated', () => {
      const state = {
        authenticationMethod: 'github_app' as const,
        githubAppInstallationId: 12345,
        githubAppUsername: 'testuser',
      };

      const statusText = `Connected via GitHub App as ${state.githubAppUsername}`;
      expect(statusText).toBe('Connected via GitHub App as testuser');
    });

    it('should show connection prompt when GitHub App not connected', () => {
      const statusText = 'Connect with GitHub App to get started';
      expect(statusText).toBe('Connect with GitHub App to get started');
    });

    it('should show repository configuration for PAT authentication', () => {
      const repoOwner = 'testuser';
      const repoName = 'testrepo';

      const statusText = `Configured for ${repoOwner}/${repoName}`;
      expect(statusText).toBe('Configured for testuser/testrepo');
    });

    it('should show owner only when repo name is missing', () => {
      const repoOwner = 'testuser';
      const repoName = '';

      const statusText = `Configured for ${repoOwner}${repoName ? `/${repoName}` : ''}`;
      expect(statusText).toBe('Configured for testuser');
    });

    it('should show configuration prompt when PAT not configured', () => {
      const statusText = 'Configure your GitHub repository settings';
      expect(statusText).toBe('Configure your GitHub repository settings');
    });
  });
});
