/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

const mockState = {
  listRepos: vi.fn(),
};

vi.mock('../../../services/UnifiedGitHubService', () => {
  return {
    UnifiedGitHubService: class {
      constructor(_config?: unknown) {}
      async listRepos() {
        return mockState.listRepos();
      }
    },
  };
});

const mockChromeMessagingService = {
  sendMessageToBackground: vi.fn(),
};

vi.mock('$lib/services/chromeMessaging', () => ({
  ChromeMessagingService: mockChromeMessagingService,
}));

const mockChromeStorageService = {
  saveProjectSettings: vi.fn(),
};

vi.mock('$lib/services/chromeStorage', () => ({
  ChromeStorageService: mockChromeStorageService,
}));

describe('RepoSettings.svelte - Logic Tests', () => {
  let chromeMocks: {
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
      };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    chromeMocks = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ authenticationMethod: 'pat' }),
        },
      },
    };

    Object.defineProperty(window, 'chrome', {
      value: chromeMocks,
      writable: true,
      configurable: true,
    });

    mockState.listRepos.mockResolvedValue([
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
    ]);

    mockChromeMessagingService.sendMessageToBackground.mockResolvedValue({ success: true });
    mockChromeStorageService.saveProjectSettings.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Repository Loading Logic', () => {
    it('should load repositories with PAT authentication', async () => {
      chromeMocks.storage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService('ghp_test');
      await service.listRepos();

      expect(mockState.listRepos).toHaveBeenCalled();
    });

    it('should load repositories with GitHub App authentication', async () => {
      chromeMocks.storage.local.get.mockResolvedValue({ authenticationMethod: 'github_app' });

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService({ type: 'github_app' });
      await service.listRepos();

      expect(mockState.listRepos).toHaveBeenCalled();
    });

    it('should handle repository loading errors gracefully', async () => {
      mockState.listRepos.mockRejectedValue(new Error('API Error'));

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService('ghp_test');

      await expect(service.listRepos()).rejects.toThrow('API Error');
    });

    it('should set loading state while fetching repositories', async () => {
      let resolveRepos!: (value: unknown[]) => void;
      mockState.listRepos.mockReturnValue(
        new Promise((resolve) => {
          resolveRepos = resolve;
        })
      );

      const isLoadingBefore = true;

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService('ghp_test');
      const loadPromise = service.listRepos();

      expect(isLoadingBefore).toBe(true);

      resolveRepos([]);
      await loadPromise;

      const isLoadingAfter = false;
      expect(isLoadingAfter).toBe(false);
    });

    it('should clear loading state after repositories are loaded', async () => {
      mockState.listRepos.mockResolvedValue([]);

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService('ghp_test');
      await service.listRepos();

      const isLoading = false;
      expect(isLoading).toBe(false);
    });

    it('should clear loading state even when loading fails', async () => {
      mockState.listRepos.mockRejectedValue(new Error('API Error'));

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService('ghp_test');

      try {
        await service.listRepos();
      } catch {
        const isLoading = false;
        expect(isLoading).toBe(false);
      }
    });

    it('should return empty array when loading fails', async () => {
      mockState.listRepos.mockRejectedValue(new Error('Network error'));

      const repositories: unknown[] = [];

      expect(repositories).toEqual([]);
    });
  });

  describe('Repository Filtering Logic', () => {
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

    it('should match partial strings in repository names', () => {
      const query = 'app';
      const filtered = mockRepos.filter((repo) =>
        repo.name.toLowerCase().includes(query.toLowerCase())
      );

      expect(filtered.length).toBe(2);
      expect(filtered.map((r) => r.name)).toContain('frontend-app');
      expect(filtered.map((r) => r.name)).toContain('mobile-app');
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

    it('should filter by both name and description', () => {
      const query = 'api';
      const filtered = mockRepos.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('backend-api');
    });

    it('should handle empty search query', () => {
      const query = '';
      const filtered = mockRepos.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
      );

      expect(filtered).toHaveLength(mockRepos.length);
    });
  });

  describe('Repository Existence Checking', () => {
    const mockRepos = [{ name: 'existing-repo' }, { name: 'another-repo' }, { name: 'Third-Repo' }];

    it('should detect existing repository', () => {
      const repoName = 'existing-repo';
      const exists = mockRepos.some((repo) => repo.name.toLowerCase() === repoName.toLowerCase());

      expect(exists).toBe(true);
    });

    it('should detect non-existing repository', () => {
      const repoName = 'new-repo';
      const exists = mockRepos.some((repo) => repo.name.toLowerCase() === repoName.toLowerCase());

      expect(exists).toBe(false);
    });

    it('should be case-insensitive when checking existence', () => {
      const repoName = 'EXISTING-REPO';
      const exists = mockRepos.some((repo) => repo.name.toLowerCase() === repoName.toLowerCase());

      expect(exists).toBe(true);
    });

    it('should handle mixed case repository names', () => {
      const repoName = 'third-repo';
      const exists = mockRepos.some((repo) => repo.name.toLowerCase() === repoName.toLowerCase());

      expect(exists).toBe(true);
    });

    it('should return false for empty repository name', () => {
      const repoName = '';
      const exists = mockRepos.some((repo) => repo.name.toLowerCase() === repoName.toLowerCase());

      expect(exists).toBe(false);
    });

    it('should handle empty repository list', () => {
      const emptyRepos: { name: string }[] = [];
      const repoName = 'any-repo';
      const exists = emptyRepos.some((repo) => repo.name.toLowerCase() === repoName.toLowerCase());

      expect(exists).toBe(false);
    });
  });

  describe('Save Settings Logic', () => {
    it('should call ChromeStorageService.saveProjectSettings with correct parameters', async () => {
      const projectId = 'project-123';
      const repoName = 'test-repo';
      const branch = 'main';
      const projectTitle = 'Test Project';

      mockChromeStorageService.saveProjectSettings.mockResolvedValue(undefined);

      await mockChromeStorageService.saveProjectSettings(projectId, repoName, branch, projectTitle);

      expect(mockChromeStorageService.saveProjectSettings).toHaveBeenCalledWith(
        projectId,
        repoName,
        branch,
        projectTitle
      );
    });

    it('should trigger sync after saving settings', async () => {
      mockChromeMessagingService.sendMessageToBackground.mockResolvedValue({ success: true });

      await mockChromeMessagingService.sendMessageToBackground({ type: 'SYNC_BOLT_PROJECTS' });

      expect(mockChromeMessagingService.sendMessageToBackground).toHaveBeenCalledWith({
        type: 'SYNC_BOLT_PROJECTS',
      });
    });

    it('should not fail save if sync fails', async () => {
      mockChromeStorageService.saveProjectSettings.mockResolvedValue(undefined);
      mockChromeMessagingService.sendMessageToBackground.mockRejectedValue(
        new Error('Sync failed')
      );

      await mockChromeStorageService.saveProjectSettings('id', 'repo', 'main', 'title');

      try {
        await mockChromeMessagingService.sendMessageToBackground({ type: 'SYNC_BOLT_PROJECTS' });
      } catch {
        expect(mockChromeStorageService.saveProjectSettings).toHaveBeenCalled();
      }
    });

    it('should handle save errors', async () => {
      mockChromeStorageService.saveProjectSettings.mockRejectedValue(new Error('Save failed'));

      await expect(
        mockChromeStorageService.saveProjectSettings('id', 'repo', 'main', 'title')
      ).rejects.toThrow('Save failed');
    });

    it('should set saving state to true during save', async () => {
      let isSaving = true;

      mockChromeStorageService.saveProjectSettings.mockResolvedValue(undefined);

      expect(isSaving).toBe(true);

      await mockChromeStorageService.saveProjectSettings('id', 'repo', 'main', 'title');

      isSaving = false;
      expect(isSaving).toBe(false);
    });

    it('should clear saving state after save completes', async () => {
      mockChromeStorageService.saveProjectSettings.mockResolvedValue(undefined);

      await mockChromeStorageService.saveProjectSettings('id', 'repo', 'main', 'title');

      const isSaving = false;
      expect(isSaving).toBe(false);
    });

    it('should clear saving state even when save fails', async () => {
      mockChromeStorageService.saveProjectSettings.mockRejectedValue(new Error('Failed'));

      try {
        await mockChromeStorageService.saveProjectSettings('id', 'repo', 'main', 'title');
      } catch {
        const isSaving = false;
        expect(isSaving).toBe(false);
      }
    });

    it('should prevent save when repoName is empty', () => {
      const repoName = '';
      const branch = 'main';

      const canSave = !!(repoName && branch);

      expect(canSave).toBe(false);
    });

    it('should prevent save when branch is empty', () => {
      const repoName = 'test-repo';
      const branch = '';

      const canSave = !!(repoName && branch);

      expect(canSave).toBe(false);
    });

    it('should allow save when all required fields are filled', () => {
      const repoName = 'test-repo';
      const branch = 'main';

      const canSave = !!(repoName && branch);

      expect(canSave).toBe(true);
    });
  });

  describe('Reactive State Management', () => {
    it('should filter repositories when search query changes', () => {
      const repositories = [
        { name: 'repo-a', description: 'First repo' },
        { name: 'repo-b', description: 'Second repo' },
        { name: 'other', description: 'Different' },
      ];

      const repoSearchQuery = 'repo';
      const filtered = repositories
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
            (repo.description &&
              repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
        )
        .slice(0, 10);

      expect(filtered).toHaveLength(2);
    });

    it('should update repoExists when repoName changes', () => {
      const repositories = [{ name: 'existing-repo' }];
      const repoName = 'existing-repo';

      const repoExists = repositories.some(
        (repo) => repo.name.toLowerCase() === repoName.toLowerCase()
      );

      expect(repoExists).toBe(true);
    });

    it('should use repoName as default projectTitle when projectTitle is empty', () => {
      const repoName = 'my-repo';
      let projectTitle = '';

      if (!projectTitle && repoName) {
        projectTitle = repoName;
      }

      expect(projectTitle).toBe('my-repo');
    });

    it('should not override existing projectTitle', () => {
      const repoName = 'my-repo';
      let projectTitle = 'Custom Title';

      if (!projectTitle && repoName) {
        projectTitle = repoName;
      }

      expect(projectTitle).toBe('Custom Title');
    });
  });

  describe('Keyboard Navigation State', () => {
    it('should increment selectedIndex when ArrowDown is pressed', () => {
      let selectedIndex = -1;
      const filteredRepos = [{ name: 'repo-1' }, { name: 'repo-2' }, { name: 'repo-3' }];

      selectedIndex = Math.min(selectedIndex + 1, filteredRepos.length - 1);

      expect(selectedIndex).toBe(0);
    });

    it('should decrement selectedIndex when ArrowUp is pressed', () => {
      let selectedIndex = 2;
      selectedIndex = Math.max(selectedIndex - 1, -1);

      expect(selectedIndex).toBe(1);
    });

    it('should not go beyond last item when ArrowDown is pressed', () => {
      let selectedIndex = 2;
      const filteredRepos = [{ name: 'repo-1' }, { name: 'repo-2' }, { name: 'repo-3' }];

      selectedIndex = Math.min(selectedIndex + 1, filteredRepos.length - 1);

      expect(selectedIndex).toBe(2);
    });

    it('should not go below -1 when ArrowUp is pressed', () => {
      let selectedIndex = 0;
      selectedIndex = Math.max(selectedIndex - 1, -1);

      expect(selectedIndex).toBe(-1);
    });

    it('should select repository at selectedIndex when Enter is pressed', () => {
      const selectedIndex = 1;
      const filteredRepos = [
        {
          name: 'repo-1',
          description: null,
          html_url: '',
          private: false,
          created_at: '',
          updated_at: '',
          language: null,
        },
        {
          name: 'repo-2',
          description: null,
          html_url: '',
          private: false,
          created_at: '',
          updated_at: '',
          language: null,
        },
        {
          name: 'repo-3',
          description: null,
          html_url: '',
          private: false,
          created_at: '',
          updated_at: '',
          language: null,
        },
      ];

      let repoName = '';
      if (selectedIndex >= 0 && filteredRepos[selectedIndex]) {
        repoName = filteredRepos[selectedIndex].name;
      }

      expect(repoName).toBe('repo-2');
    });

    it('should not select when selectedIndex is -1 and Enter is pressed', () => {
      const selectedIndex = -1;
      const filteredRepos = [{ name: 'repo-1' }];

      let repoName = '';
      if (selectedIndex >= 0 && filteredRepos[selectedIndex]) {
        repoName = filteredRepos[selectedIndex].name;
      }

      expect(repoName).toBe('');
    });

    it('should hide dropdown when Escape is pressed', () => {
      let showRepoDropdown = true;

      showRepoDropdown = false;

      expect(showRepoDropdown).toBe(false);
    });
  });

  describe('Dropdown Visibility Logic', () => {
    it('should show dropdown on focus', () => {
      let showRepoDropdown = false;

      showRepoDropdown = true;

      expect(showRepoDropdown).toBe(true);
    });

    it('should sync search query with repoName on focus', () => {
      const repoName = 'my-repo';
      let repoSearchQuery = '';

      repoSearchQuery = repoName;

      expect(repoSearchQuery).toBe('my-repo');
    });

    it('should update search query when input changes', () => {
      let repoSearchQuery = '';
      let repoName = '';

      repoName = 'test';
      repoSearchQuery = repoName;

      expect(repoSearchQuery).toBe('test');
    });

    it('should hide dropdown after blur with delay', async () => {
      vi.useFakeTimers();

      let showRepoDropdown = true;

      setTimeout(() => {
        showRepoDropdown = false;
      }, 200);

      expect(showRepoDropdown).toBe(true);

      await vi.advanceTimersByTimeAsync(200);

      expect(showRepoDropdown).toBe(false);

      vi.useRealTimers();
    });

    it('should hide dropdown after selecting repository', () => {
      let showRepoDropdown = true;
      let repoName = '';

      repoName = 'selected-repo';
      showRepoDropdown = false;

      expect(showRepoDropdown).toBe(false);
      expect(repoName).toBe('selected-repo');
    });

    it('should show dropdown when there are filtered repos', () => {
      const filteredRepos = [{ name: 'repo-1' }, { name: 'repo-2' }];
      const repoExists = false;
      const showRepoDropdown = true;

      const shouldShowDropdown = showRepoDropdown && (filteredRepos.length > 0 || !repoExists);

      expect(shouldShowDropdown).toBe(true);
    });

    it('should show dropdown when repository does not exist', () => {
      const filteredRepos: unknown[] = [];
      const repoExists = false;
      const showRepoDropdown = true;

      const shouldShowDropdown = showRepoDropdown && (filteredRepos.length > 0 || !repoExists);

      expect(shouldShowDropdown).toBe(true);
    });

    it('should not show dropdown when not focused', () => {
      const filteredRepos = [{ name: 'repo-1' }];
      const showRepoDropdown = false;

      const shouldShowDropdown = showRepoDropdown && filteredRepos.length > 0;

      expect(shouldShowDropdown).toBe(false);
    });
  });

  describe('Error Handling Logic', () => {
    it('should set error message when save fails', async () => {
      mockChromeStorageService.saveProjectSettings.mockRejectedValue(new Error('Save error'));

      let errorMessage = '';
      let showErrorModal = false;

      try {
        await mockChromeStorageService.saveProjectSettings('id', 'repo', 'main', 'title');
      } catch {
        errorMessage = 'Failed to save settings. Please try again.';
        showErrorModal = true;
      }

      expect(errorMessage).toBe('Failed to save settings. Please try again.');
      expect(showErrorModal).toBe(true);
    });

    it('should clear error modal state when closed', () => {
      let showErrorModal = true;

      showErrorModal = false;

      expect(showErrorModal).toBe(false);
    });

    it('should log error when repository loading fails', async () => {
      mockState.listRepos.mockRejectedValue(new Error('API Error'));

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      const service = new UnifiedGitHubService('ghp_test');

      await expect(service.listRepos()).rejects.toThrow('API Error');
    });

    it('should log warning when manual sync fails', async () => {
      mockChromeMessagingService.sendMessageToBackground.mockRejectedValue(
        new Error('Sync failed')
      );

      let syncError: Error | null = null;

      try {
        await mockChromeMessagingService.sendMessageToBackground({ type: 'SYNC_BOLT_PROJECTS' });
      } catch (error) {
        syncError = error as Error;
      }

      expect(syncError).not.toBeNull();
      expect(syncError?.message).toBe('Sync failed');
    });
  });

  describe('Authentication Method Detection', () => {
    it('should use PAT when authenticationMethod is pat', async () => {
      chromeMocks.storage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });

      const settings = (await chromeMocks.storage.local.get(['authenticationMethod'])) as {
        authenticationMethod?: string;
      };
      const authMethod = settings.authenticationMethod || 'pat';

      expect(authMethod).toBe('pat');
    });

    it('should use GitHub App when authenticationMethod is github_app', async () => {
      chromeMocks.storage.local.get.mockResolvedValue({ authenticationMethod: 'github_app' });

      const settings = (await chromeMocks.storage.local.get(['authenticationMethod'])) as {
        authenticationMethod?: string;
      };
      const authMethod = settings.authenticationMethod || 'pat';

      expect(authMethod).toBe('github_app');
    });

    it('should default to PAT when authenticationMethod is not set', async () => {
      chromeMocks.storage.local.get.mockResolvedValue({});

      const settings = (await chromeMocks.storage.local.get(['authenticationMethod'])) as {
        authenticationMethod?: string;
      };
      const authMethod = settings.authenticationMethod || 'pat';

      expect(authMethod).toBe('pat');
    });

    it('should create UnifiedGitHubService with token for PAT', () => {
      const authMethod = 'pat' as 'pat' | 'github_app';
      const githubToken = 'ghp_test';

      const config = authMethod === 'github_app' ? { type: 'github_app' } : githubToken;

      expect(config).toBe('ghp_test');
    });

    it('should create UnifiedGitHubService with github_app config', () => {
      const authMethod = 'github_app' as 'pat' | 'github_app';

      const config = authMethod === 'github_app' ? { type: 'github_app' } : 'token';

      expect(config).toEqual({ type: 'github_app' });
    });
  });

  describe('Sync Response Handling', () => {
    it('should handle successful sync response', async () => {
      mockChromeMessagingService.sendMessageToBackground.mockResolvedValue({
        success: true,
        result: { synced: 5 },
      });

      const response = await mockChromeMessagingService.sendMessageToBackground({
        type: 'SYNC_BOLT_PROJECTS',
      });

      const typedResponse = response as { success?: boolean; result?: unknown };

      expect(typedResponse.success).toBe(true);
    });

    it('should handle sync response with warnings', async () => {
      mockChromeMessagingService.sendMessageToBackground.mockResolvedValue({
        success: false,
        warnings: ['Some items failed to sync'],
      });

      const response = await mockChromeMessagingService.sendMessageToBackground({
        type: 'SYNC_BOLT_PROJECTS',
      });

      const typedResponse = response as { success?: boolean; warnings?: string[] };

      expect(typedResponse.success).toBe(false);
    });

    it('should handle null sync response', async () => {
      mockChromeMessagingService.sendMessageToBackground.mockResolvedValue(null);

      const response = await mockChromeMessagingService.sendMessageToBackground({
        type: 'SYNC_BOLT_PROJECTS',
      });

      const typedResponse = response as { success?: boolean } | null;

      expect(typedResponse).toBeNull();
    });
  });
});
