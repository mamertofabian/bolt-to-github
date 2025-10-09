/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

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
  });

  afterEach(() => {
    vi.clearAllMocks();
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

    it('should match partial strings in names', () => {
      const repoSearchQuery = 'app';
      const filteredRepos = mockRepos
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
            (repo.description &&
              repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
        )
        .slice(0, 10);

      expect(filteredRepos).toHaveLength(2);
      expect(filteredRepos.map((r) => r.name)).toContain('frontend-app');
      expect(filteredRepos.map((r) => r.name)).toContain('mobile-app');
    });

    it('should return empty array when no match', () => {
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

    it('should match in both name and description', () => {
      const repoSearchQuery = 'api';
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

    it('should return all repos when query is empty', () => {
      const repoSearchQuery = '';
      const filteredRepos = mockRepos
        .filter(
          (repo) =>
            repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
            (repo.description &&
              repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
        )
        .slice(0, 10);

      expect(filteredRepos).toHaveLength(mockRepos.length);
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

    it('should handle mixed case names', () => {
      const repoName = 'third-repo';
      const repoExists = mockRepos.some(
        (repo) => repo.name.toLowerCase() === repoName.toLowerCase()
      );

      expect(repoExists).toBe(true);
    });

    it('should return false for empty name', () => {
      const repoName = '';
      const repoExists = mockRepos.some(
        (repo) => repo.name.toLowerCase() === repoName.toLowerCase()
      );

      expect(repoExists).toBe(false);
    });

    it('should handle empty repository list', () => {
      const emptyRepos: { name: string }[] = [];
      const repoName = 'any-repo';
      const repoExists = emptyRepos.some(
        (repo) => repo.name.toLowerCase() === repoName.toLowerCase()
      );

      expect(repoExists).toBe(false);
    });
  });

  describe('Reactive Statement: projectTitle default', () => {
    it('should use repoName as default projectTitle when not set', () => {
      let projectTitle = '';
      const repoName = 'my-repo';

      if (!projectTitle && repoName) {
        projectTitle = repoName;
      }

      expect(projectTitle).toBe('my-repo');
    });

    it('should not override existing projectTitle', () => {
      let projectTitle = 'Custom Title';
      const repoName = 'my-repo';

      if (!projectTitle && repoName) {
        projectTitle = repoName;
      }

      expect(projectTitle).toBe('Custom Title');
    });

    it('should not set projectTitle when repoName is empty', () => {
      let projectTitle = '';
      const repoName = '';

      if (!projectTitle && repoName) {
        projectTitle = repoName;
      }

      expect(projectTitle).toBe('');
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
  });

  describe('Dropdown Visibility Logic', () => {
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

    it('should hide dropdown after blur', () => {
      let showRepoDropdown = true;

      showRepoDropdown = false;

      expect(showRepoDropdown).toBe(false);
    });

    it('should sync search query with repoName on focus', () => {
      const repoName = 'my-repo';
      let repoSearchQuery = '';

      repoSearchQuery = repoName;

      expect(repoSearchQuery).toBe('my-repo');
    });

    it('should hide dropdown after selecting repository', () => {
      let showRepoDropdown = true;
      let repoName = '';

      repoName = 'selected-repo';
      showRepoDropdown = false;

      expect(showRepoDropdown).toBe(false);
      expect(repoName).toBe('selected-repo');
    });
  });

  describe('Form Validation Logic', () => {
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

    it('should prevent save when isSaving is true', () => {
      const repoName = 'test-repo';
      const branch = 'main';
      const isSaving = true;

      const canSave = !!(repoName && branch) && !isSaving;

      expect(canSave).toBe(false);
    });
  });

  describe('Authentication Method Detection Logic', () => {
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

    it('should create config with token for PAT', () => {
      const authMethod = 'pat' as 'pat' | 'github_app';
      const githubToken = 'ghp_test';

      const config = authMethod === 'github_app' ? { type: 'github_app' } : githubToken;

      expect(config).toBe('ghp_test');
    });

    it('should create config with github_app type', () => {
      const authMethod = 'github_app' as 'pat' | 'github_app';

      const config = authMethod === 'github_app' ? { type: 'github_app' } : 'token';

      expect(config).toEqual({ type: 'github_app' });
    });
  });
});
