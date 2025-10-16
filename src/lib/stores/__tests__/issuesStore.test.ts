import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issuesStore } from '../issuesStore';
import type { GitHubIssue } from '../../../services/types/repository';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();
const CACHE_DURATION = 30000;
const FORCE_REFRESH_AFTER_ACTION = 2000;

const createMockGitHubIssue = (overrides: Partial<GitHubIssue> = {}): GitHubIssue => ({
  id: 1,
  node_id: 'MDU6SXNzdWUx',
  url: 'https://api.github.com/repos/owner/repo/issues/1',
  repository_url: 'https://api.github.com/repos/owner/repo',
  labels_url: 'https://api.github.com/repos/owner/repo/issues/1/labels{/name}',
  comments_url: 'https://api.github.com/repos/owner/repo/issues/1/comments',
  events_url: 'https://api.github.com/repos/owner/repo/issues/1/events',
  html_url: 'https://github.com/owner/repo/issues/1',
  number: 1,
  state: 'open',
  title: 'Test Issue',
  body: 'Test issue body',
  user: {
    login: 'testuser',
    id: 123,
    avatar_url: 'https://avatars.githubusercontent.com/u/123',
  },
  labels: [
    {
      id: 1,
      node_id: 'MDU6TGFiZWwx',
      url: 'https://api.github.com/repos/owner/repo/labels/bug',
      name: 'bug',
      color: 'ff0000',
      default: true,
    },
  ],
  assignees: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  closed_at: null,
  comments: 0,
  ...overrides,
});

const mockChromeStorage = {
  local: {
    get: vi.fn(),
  },
};

global.chrome = {
  storage: mockChromeStorage,
} as unknown as typeof chrome;

const mockUnifiedGitHubService = {
  getIssues: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
};

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: vi.fn().mockImplementation(() => mockUnifiedGitHubService),
}));

describe('issuesStore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });
    vi.clearAllMocks();

    issuesStore.reset();

    mockChromeStorage.local.get.mockResolvedValue({
      authenticationMethod: 'pat',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('store initialization', () => {
    it('should initialize with empty state', () => {
      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.lastFetched).toBe(0);
    });

    it('should return independent states for different repositories', () => {
      const store1 = issuesStore.getIssuesForRepo('owner1', 'repo1');
      const store2 = issuesStore.getIssuesForRepo('owner2', 'repo2');

      expect(get(store1)).not.toBe(get(store2));
    });
  });

  describe('loadIssues', () => {
    it('should load all issues from GitHub API', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'open' }),
        createMockGitHubIssue({ number: 2, state: 'closed' }),
      ];

      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      const issues = await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledWith(
        'owner',
        'repo',
        'all',
        false
      );
      expect(issues).toHaveLength(2);
      expect(issues[0].number).toBe(1);
      expect(issues[1].number).toBe(2);
    });

    it('should filter open issues when state is open', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'open' }),
        createMockGitHubIssue({ number: 2, state: 'closed' }),
        createMockGitHubIssue({ number: 3, state: 'open' }),
      ];

      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      const issues = await issuesStore.loadIssues('owner', 'repo', 'test-token', 'open');

      expect(issues).toHaveLength(2);
      expect(issues[0].state).toBe('open');
      expect(issues[1].state).toBe('open');
    });

    it('should filter closed issues when state is closed', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'open' }),
        createMockGitHubIssue({ number: 2, state: 'closed' }),
        createMockGitHubIssue({ number: 3, state: 'closed' }),
      ];

      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      const issues = await issuesStore.loadIssues('owner', 'repo', 'test-token', 'closed');

      expect(issues).toHaveLength(2);
      expect(issues[0].state).toBe('closed');
      expect(issues[1].state).toBe('closed');
    });

    it('should use cached data when cache is valid', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      vi.clearAllMocks();

      const cachedIssues = await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      expect(mockUnifiedGitHubService.getIssues).not.toHaveBeenCalled();
      expect(cachedIssues).toHaveLength(1);
    });

    it('should fetch fresh data when cache is expired', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      vi.advanceTimersByTime(CACHE_DURATION + 1000);
      vi.clearAllMocks();

      const freshIssues = [createMockGitHubIssue({ number: 2 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(freshIssues);

      const issues = await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledTimes(1);
      expect(issues[0].number).toBe(2);
    });

    it('should force refresh when forceRefresh is true', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all', false);

      const freshIssues = [createMockGitHubIssue({ number: 2 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(freshIssues);

      const issues = await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all', true);

      expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledWith('owner', 'repo', 'all', true);
      expect(issues[0].number).toBe(2);
    });

    it('should update store state with loaded issues', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues).toHaveLength(1);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.lastFetched).toBe(FIXED_TIME);
    });

    it('should handle errors and update error state', async () => {
      mockUnifiedGitHubService.getIssues.mockRejectedValue(new Error('API Error'));

      await expect(issuesStore.loadIssues('owner', 'repo', 'test-token', 'all')).rejects.toThrow(
        'API Error'
      );

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.error).toBe('API Error');
      expect(state.isLoading).toBe(false);
    });

    it('should preserve existing issues on error', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      vi.advanceTimersByTime(CACHE_DURATION + 1000);
      mockUnifiedGitHubService.getIssues.mockRejectedValue(new Error('Network Error'));

      await expect(issuesStore.loadIssues('owner', 'repo', 'test-token', 'all')).rejects.toThrow();

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues).toHaveLength(1);
      expect(state.issues[0].number).toBe(1);
    });

    it('should use GitHub App authentication when configured', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
      });

      const mockIssues = [createMockGitHubIssue()];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      expect(UnifiedGitHubService).toHaveBeenCalledWith({ type: 'github_app' });
    });

    it('should use PAT authentication by default', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});

      const mockIssues = [createMockGitHubIssue()];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const { UnifiedGitHubService } = await import('../../../services/UnifiedGitHubService');
      expect(UnifiedGitHubService).toHaveBeenCalledWith('test-token');
    });

    it('should handle multiple repositories independently', async () => {
      const mockIssues1 = [createMockGitHubIssue({ number: 1 })];
      const mockIssues2 = [createMockGitHubIssue({ number: 2 })];

      mockUnifiedGitHubService.getIssues
        .mockResolvedValueOnce(mockIssues1)
        .mockResolvedValueOnce(mockIssues2);

      await issuesStore.loadIssues('owner1', 'repo1', 'test-token', 'all');
      await issuesStore.loadIssues('owner2', 'repo2', 'test-token', 'all');

      const store1 = issuesStore.getIssuesForRepo('owner1', 'repo1');
      const store2 = issuesStore.getIssuesForRepo('owner2', 'repo2');

      expect(get(store1).issues[0].number).toBe(1);
      expect(get(store2).issues[0].number).toBe(2);
    });
  });

  describe('createIssue', () => {
    it('should create a new issue and add it to the store', async () => {
      const newIssue = createMockGitHubIssue({ number: 5, title: 'New Issue' });
      mockUnifiedGitHubService.createIssue.mockResolvedValue(newIssue);

      const result = await issuesStore.createIssue('owner', 'repo', 'test-token', {
        title: 'New Issue',
        body: 'Issue body',
      });

      expect(mockUnifiedGitHubService.createIssue).toHaveBeenCalledWith('owner', 'repo', {
        title: 'New Issue',
        body: 'Issue body',
      });

      expect(result.number).toBe(5);
      expect(result.title).toBe('New Issue');

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues).toHaveLength(1);
      expect(state.issues[0].number).toBe(5);
    });

    it('should add new issue to the beginning of existing issues', async () => {
      const existingIssue = createMockGitHubIssue({ number: 1 });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([existingIssue]);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const newIssue = createMockGitHubIssue({ number: 2 });
      mockUnifiedGitHubService.createIssue.mockResolvedValue(newIssue);

      await issuesStore.createIssue('owner', 'repo', 'test-token', {
        title: 'Second Issue',
      });

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues).toHaveLength(2);
      expect(state.issues[0].number).toBe(2);
      expect(state.issues[1].number).toBe(1);
    });

    it('should schedule a force refresh after creating', async () => {
      const newIssue = createMockGitHubIssue({ number: 1 });
      mockUnifiedGitHubService.createIssue.mockResolvedValue(newIssue);
      mockUnifiedGitHubService.getIssues.mockResolvedValue([newIssue]);

      await issuesStore.createIssue('owner', 'repo', 'test-token', {
        title: 'New Issue',
      });

      vi.advanceTimersByTime(FORCE_REFRESH_AFTER_ACTION);

      await vi.waitFor(() => {
        expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledWith(
          'owner',
          'repo',
          'all',
          true
        );
      });
    });

    it('should handle create errors and update error state', async () => {
      mockUnifiedGitHubService.createIssue.mockRejectedValue(new Error('Create failed'));

      await expect(
        issuesStore.createIssue('owner', 'repo', 'test-token', { title: 'Test' })
      ).rejects.toThrow('Create failed');

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.error).toBe('Create failed');
    });

    it('should create issue in repository with no existing issues', async () => {
      const newIssue = createMockGitHubIssue({ number: 1 });
      mockUnifiedGitHubService.createIssue.mockResolvedValue(newIssue);

      await issuesStore.createIssue('owner', 'repo', 'test-token', { title: 'First Issue' });

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues).toHaveLength(1);
      expect(state.issues[0].number).toBe(1);
      expect(state.lastFetched).toBe(FIXED_TIME);
    });

    it('should update lastFetched timestamp when creating', async () => {
      const newIssue = createMockGitHubIssue({ number: 1 });
      mockUnifiedGitHubService.createIssue.mockResolvedValue(newIssue);

      await issuesStore.createIssue('owner', 'repo', 'test-token', { title: 'Test' });

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.lastFetched).toBe(FIXED_TIME);
    });
  });

  describe('updateIssue', () => {
    it('should update an existing issue in the store', async () => {
      const originalIssue = createMockGitHubIssue({ number: 1, title: 'Original', state: 'open' });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([originalIssue]);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const updatedIssue = createMockGitHubIssue({ number: 1, title: 'Updated', state: 'open' });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(updatedIssue);

      const result = await issuesStore.updateIssue('owner', 'repo', 'test-token', 1, {
        title: 'Updated',
      });

      expect(result.title).toBe('Updated');

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues[0].title).toBe('Updated');
    });

    it('should close an issue', async () => {
      const openIssue = createMockGitHubIssue({ number: 1, state: 'open' });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([openIssue]);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const closedIssue = createMockGitHubIssue({ number: 1, state: 'closed' });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(closedIssue);

      await issuesStore.updateIssue('owner', 'repo', 'test-token', 1, { state: 'closed' });

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues[0].state).toBe('closed');
    });

    it('should reopen a closed issue', async () => {
      const closedIssue = createMockGitHubIssue({ number: 1, state: 'closed' });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([closedIssue]);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const reopenedIssue = createMockGitHubIssue({ number: 1, state: 'open' });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(reopenedIssue);

      await issuesStore.updateIssue('owner', 'repo', 'test-token', 1, { state: 'open' });

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues[0].state).toBe('open');
    });

    it('should update multiple fields at once', async () => {
      const originalIssue = createMockGitHubIssue({
        number: 1,
        title: 'Original',
        body: 'Original body',
        state: 'open',
      });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([originalIssue]);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const updatedIssue = createMockGitHubIssue({
        number: 1,
        title: 'Updated Title',
        body: 'Updated body',
        state: 'closed',
      });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(updatedIssue);

      await issuesStore.updateIssue('owner', 'repo', 'test-token', 1, {
        title: 'Updated Title',
        body: 'Updated body',
        state: 'closed',
      });

      expect(mockUnifiedGitHubService.updateIssue).toHaveBeenCalledWith(
        'owner',
        'repo',
        1,
        'Updated Title',
        'Updated body',
        'closed'
      );
    });

    it('should schedule a force refresh after updating', async () => {
      const issue = createMockGitHubIssue({ number: 1 });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([issue]);
      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const updatedIssue = createMockGitHubIssue({ number: 1, title: 'Updated' });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(updatedIssue);

      await issuesStore.updateIssue('owner', 'repo', 'test-token', 1, { title: 'Updated' });

      vi.clearAllMocks();
      mockUnifiedGitHubService.getIssues.mockResolvedValue([updatedIssue]);

      vi.advanceTimersByTime(FORCE_REFRESH_AFTER_ACTION);

      await vi.waitFor(() => {
        expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledWith(
          'owner',
          'repo',
          'all',
          true
        );
      });
    });

    it('should handle update errors and update error state', async () => {
      const issue = createMockGitHubIssue({ number: 1 });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([issue]);
      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      mockUnifiedGitHubService.updateIssue.mockRejectedValue(new Error('Update failed'));

      await expect(
        issuesStore.updateIssue('owner', 'repo', 'test-token', 1, { title: 'Test' })
      ).rejects.toThrow('Update failed');

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.error).toBe('Update failed');
    });

    it('should preserve other issues when updating one', async () => {
      const issues = [
        createMockGitHubIssue({ number: 1, title: 'First' }),
        createMockGitHubIssue({ number: 2, title: 'Second' }),
        createMockGitHubIssue({ number: 3, title: 'Third' }),
      ];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(issues);
      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const updatedIssue = createMockGitHubIssue({ number: 2, title: 'Updated Second' });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(updatedIssue);

      await issuesStore.updateIssue('owner', 'repo', 'test-token', 2, { title: 'Updated Second' });

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues).toHaveLength(3);
      expect(state.issues[0].title).toBe('First');
      expect(state.issues[1].title).toBe('Updated Second');
      expect(state.issues[2].title).toBe('Third');
    });

    it('should not modify store if issue number not found', async () => {
      const issues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(issues);
      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const updatedIssue = createMockGitHubIssue({ number: 999 });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(updatedIssue);

      await issuesStore.updateIssue('owner', 'repo', 'test-token', 999, { title: 'Test' });

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues).toHaveLength(1);
      expect(state.issues[0].number).toBe(1);
    });

    it('should update lastFetched timestamp when updating', async () => {
      const issue = createMockGitHubIssue({ number: 1 });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([issue]);
      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      vi.advanceTimersByTime(5000);

      const updatedIssue = createMockGitHubIssue({ number: 1, title: 'Updated' });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(updatedIssue);

      await issuesStore.updateIssue('owner', 'repo', 'test-token', 1, { title: 'Updated' });

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.lastFetched).toBe(FIXED_TIME + 5000);
    });
  });

  describe('getIssuesForRepo', () => {
    it('should return filtered open issues when state is open', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'open' }),
        createMockGitHubIssue({ number: 2, state: 'closed' }),
        createMockGitHubIssue({ number: 3, state: 'open' }),
      ];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const store = issuesStore.getIssuesForRepo('owner', 'repo', 'open');
      const state = get(store);

      expect(state.issues).toHaveLength(2);
      expect(state.issues.every((issue) => issue.state === 'open')).toBe(true);
    });

    it('should return filtered closed issues when state is closed', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'open' }),
        createMockGitHubIssue({ number: 2, state: 'closed' }),
        createMockGitHubIssue({ number: 3, state: 'closed' }),
      ];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const store = issuesStore.getIssuesForRepo('owner', 'repo', 'closed');
      const state = get(store);

      expect(state.issues).toHaveLength(2);
      expect(state.issues.every((issue) => issue.state === 'closed')).toBe(true);
    });

    it('should return all issues when state is all', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'open' }),
        createMockGitHubIssue({ number: 2, state: 'closed' }),
      ];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const store = issuesStore.getIssuesForRepo('owner', 'repo', 'all');
      const state = get(store);

      expect(state.issues).toHaveLength(2);
    });

    it('should return all issues by default when state is not specified', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'open' }),
        createMockGitHubIssue({ number: 2, state: 'closed' }),
      ];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues).toHaveLength(2);
    });

    it('should return reactive store that updates when issues change', async () => {
      const initialIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(initialIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      expect(get(store).issues).toHaveLength(1);

      const newIssue = createMockGitHubIssue({ number: 2 });
      mockUnifiedGitHubService.createIssue.mockResolvedValue(newIssue);
      await issuesStore.createIssue('owner', 'repo', 'test-token', { title: 'New' });

      expect(get(store).issues).toHaveLength(2);
    });
  });

  describe('getOpenIssuesCount', () => {
    it('should return count of open issues', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'open' }),
        createMockGitHubIssue({ number: 2, state: 'closed' }),
        createMockGitHubIssue({ number: 3, state: 'open' }),
        createMockGitHubIssue({ number: 4, state: 'open' }),
      ];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const countStore = issuesStore.getOpenIssuesCount('owner', 'repo');
      const count = get(countStore);

      expect(count).toBe(3);
    });

    it('should return 0 when no issues exist', () => {
      const countStore = issuesStore.getOpenIssuesCount('owner', 'repo');
      const count = get(countStore);

      expect(count).toBe(0);
    });

    it('should return 0 when all issues are closed', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'closed' }),
        createMockGitHubIssue({ number: 2, state: 'closed' }),
      ];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const countStore = issuesStore.getOpenIssuesCount('owner', 'repo');
      const count = get(countStore);

      expect(count).toBe(0);
    });

    it('should update reactively when issues are created', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1, state: 'open' })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const countStore = issuesStore.getOpenIssuesCount('owner', 'repo');
      expect(get(countStore)).toBe(1);

      const newIssue = createMockGitHubIssue({ number: 2, state: 'open' });
      mockUnifiedGitHubService.createIssue.mockResolvedValue(newIssue);
      await issuesStore.createIssue('owner', 'repo', 'test-token', { title: 'New' });

      expect(get(countStore)).toBe(2);
    });

    it('should update reactively when issues are closed', async () => {
      const mockIssues = [
        createMockGitHubIssue({ number: 1, state: 'open' }),
        createMockGitHubIssue({ number: 2, state: 'open' }),
      ];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const countStore = issuesStore.getOpenIssuesCount('owner', 'repo');
      expect(get(countStore)).toBe(2);

      const closedIssue = createMockGitHubIssue({ number: 1, state: 'closed' });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(closedIssue);
      await issuesStore.updateIssue('owner', 'repo', 'test-token', 1, { state: 'closed' });

      expect(get(countStore)).toBe(1);
    });
  });

  describe('getLoadingState', () => {
    it('should return false when no loading state exists', () => {
      const loadingStore = issuesStore.getLoadingState('owner', 'repo', 'open');
      const loading = get(loadingStore);

      expect(loading).toBe(false);
    });

    it('should track loading state during async operations', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'open');

      const loadingStore = issuesStore.getLoadingState('owner', 'repo', 'open');
      expect(get(loadingStore)).toBe(false);
    });

    it('should track different states independently', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'open');

      const openLoadingStore = issuesStore.getLoadingState('owner', 'repo', 'open');
      const closedLoadingStore = issuesStore.getLoadingState('owner', 'repo', 'closed');

      expect(get(openLoadingStore)).toBe(false);
      expect(get(closedLoadingStore)).toBe(false);
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate cache for specific repository', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      vi.clearAllMocks();

      issuesStore.invalidateCache('owner', 'repo');

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledTimes(1);
    });

    it('should not affect other repositories when invalidating', async () => {
      const mockIssues1 = [createMockGitHubIssue({ number: 1 })];
      const mockIssues2 = [createMockGitHubIssue({ number: 2 })];

      mockUnifiedGitHubService.getIssues
        .mockResolvedValueOnce(mockIssues1)
        .mockResolvedValueOnce(mockIssues2);

      await issuesStore.loadIssues('owner1', 'repo1', 'test-token', 'all');
      await issuesStore.loadIssues('owner2', 'repo2', 'test-token', 'all');

      vi.clearAllMocks();

      issuesStore.invalidateCache('owner1', 'repo1');

      await issuesStore.loadIssues('owner1', 'repo1', 'test-token', 'all');
      await issuesStore.loadIssues('owner2', 'repo2', 'test-token', 'all');

      expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearError', () => {
    it('should clear error for specific repository', async () => {
      mockUnifiedGitHubService.getIssues.mockRejectedValue(new Error('Test error'));

      await expect(issuesStore.loadIssues('owner', 'repo', 'test-token', 'all')).rejects.toThrow();

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      expect(get(store).error).toBe('Test error');

      issuesStore.clearError('owner', 'repo');

      expect(get(store).error).toBe(null);
    });

    it('should preserve other state when clearing error', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      vi.advanceTimersByTime(CACHE_DURATION + 1000);
      mockUnifiedGitHubService.getIssues.mockRejectedValue(new Error('Network error'));

      await expect(issuesStore.loadIssues('owner', 'repo', 'test-token', 'all')).rejects.toThrow();

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      expect(get(store).error).toBe('Network error');
      expect(get(store).issues).toHaveLength(1);

      issuesStore.clearError('owner', 'repo');

      expect(get(store).error).toBe(null);
      expect(get(store).issues).toHaveLength(1);
    });

    it('should not affect other repositories when clearing error', async () => {
      mockUnifiedGitHubService.getIssues.mockRejectedValue(new Error('Error 1'));
      await expect(
        issuesStore.loadIssues('owner1', 'repo1', 'test-token', 'all')
      ).rejects.toThrow();

      mockUnifiedGitHubService.getIssues.mockRejectedValue(new Error('Error 2'));
      await expect(
        issuesStore.loadIssues('owner2', 'repo2', 'test-token', 'all')
      ).rejects.toThrow();

      issuesStore.clearError('owner1', 'repo1');

      const store1 = issuesStore.getIssuesForRepo('owner1', 'repo1');
      const store2 = issuesStore.getIssuesForRepo('owner2', 'repo2');

      expect(get(store1).error).toBe(null);
      expect(get(store2).error).toBe('Error 2');
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const storeBefore = issuesStore.getIssuesForRepo('owner', 'repo');
      expect(get(storeBefore).issues).toHaveLength(1);

      issuesStore.reset();

      const storeAfter = issuesStore.getIssuesForRepo('owner', 'repo');
      expect(get(storeAfter).issues).toHaveLength(0);
      expect(get(storeAfter).error).toBe(null);
      expect(get(storeAfter).lastFetched).toBe(0);
    });

    it('should clear state for multiple repositories', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner1', 'repo1', 'test-token', 'all');
      await issuesStore.loadIssues('owner2', 'repo2', 'test-token', 'all');

      issuesStore.reset();

      const store1 = issuesStore.getIssuesForRepo('owner1', 'repo1');
      const store2 = issuesStore.getIssuesForRepo('owner2', 'repo2');

      expect(get(store1).issues).toHaveLength(0);
      expect(get(store2).issues).toHaveLength(0);
    });

    it('should clear loading states', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'open');

      const loadingStore = issuesStore.getLoadingState('owner', 'repo', 'open');
      expect(get(loadingStore)).toBe(false);

      issuesStore.reset();

      expect(get(loadingStore)).toBe(false);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle non-Error objects in catch blocks', async () => {
      mockUnifiedGitHubService.getIssues.mockRejectedValue('String error');

      await expect(issuesStore.loadIssues('owner', 'repo', 'test-token', 'all')).rejects.toThrow();

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      expect(get(store).error).toBe('Failed to load issues');
    });

    it('should handle issue with null body', async () => {
      const mockIssue = createMockGitHubIssue({ number: 1, body: null });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([mockIssue]);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues[0].body).toBe(null);
    });

    it('should handle issue with empty labels array', async () => {
      const mockIssue = createMockGitHubIssue({ number: 1, labels: [] });
      mockUnifiedGitHubService.getIssues.mockResolvedValue([mockIssue]);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const store = issuesStore.getIssuesForRepo('owner', 'repo');
      const state = get(store);

      expect(state.issues[0].labels).toEqual([]);
    });

    it('should handle rapid successive calls to loadIssues', async () => {
      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      const promise1 = issuesStore.loadIssues('owner', 'repo', 'test-token', 'all', true);
      const promise2 = issuesStore.loadIssues('owner', 'repo', 'test-token', 'all', true);
      const promise3 = issuesStore.loadIssues('owner', 'repo', 'test-token', 'all', true);

      await Promise.all([promise1, promise2, promise3]);

      expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalled();
    });

    it('should handle empty repository name', async () => {
      const mockIssues = [createMockGitHubIssue()];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      const issues = await issuesStore.loadIssues('owner', '', 'test-token', 'all');

      expect(issues).toHaveLength(1);
      expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledWith('owner', '', 'all', false);
    });

    it('should handle special characters in owner and repo names', async () => {
      const mockIssues = [createMockGitHubIssue()];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner-123', 'repo_name.test', 'test-token', 'all');

      expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledWith(
        'owner-123',
        'repo_name.test',
        'all',
        false
      );
    });

    it('should handle authentication method change', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'pat',
      });

      const mockIssues = [createMockGitHubIssue({ number: 1 })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(mockIssues);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      mockChromeStorage.local.get.mockResolvedValue({
        authenticationMethod: 'github_app',
      });

      vi.advanceTimersByTime(CACHE_DURATION + 1000);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all', true);

      expect(mockUnifiedGitHubService.getIssues).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent operations on different repositories', async () => {
      const mockIssues1 = [createMockGitHubIssue({ number: 1 })];
      const mockIssues2 = [createMockGitHubIssue({ number: 2 })];
      const newIssue1 = createMockGitHubIssue({ number: 10 });
      const newIssue2 = createMockGitHubIssue({ number: 20 });

      mockUnifiedGitHubService.getIssues
        .mockResolvedValueOnce(mockIssues1)
        .mockResolvedValueOnce(mockIssues2);
      mockUnifiedGitHubService.createIssue
        .mockResolvedValueOnce(newIssue1)
        .mockResolvedValueOnce(newIssue2);

      await Promise.all([
        issuesStore.loadIssues('owner1', 'repo1', 'token1', 'all'),
        issuesStore.loadIssues('owner2', 'repo2', 'token2', 'all'),
      ]);

      await Promise.all([
        issuesStore.createIssue('owner1', 'repo1', 'token1', { title: 'Issue 1' }),
        issuesStore.createIssue('owner2', 'repo2', 'token2', { title: 'Issue 2' }),
      ]);

      const store1 = issuesStore.getIssuesForRepo('owner1', 'repo1');
      const store2 = issuesStore.getIssuesForRepo('owner2', 'repo2');

      expect(get(store1).issues).toHaveLength(2);
      expect(get(store2).issues).toHaveLength(2);
      expect(get(store1).issues[0].number).toBe(10);
      expect(get(store2).issues[0].number).toBe(20);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete issue lifecycle', async () => {
      mockUnifiedGitHubService.getIssues.mockResolvedValue([]);

      await issuesStore.loadIssues('owner', 'repo', 'test-token', 'all');

      const newIssue = createMockGitHubIssue({ number: 1, state: 'open' });
      mockUnifiedGitHubService.createIssue.mockResolvedValue(newIssue);

      await issuesStore.createIssue('owner', 'repo', 'test-token', { title: 'New Issue' });

      const openStore = issuesStore.getIssuesForRepo('owner', 'repo', 'open');
      expect(get(openStore).issues).toHaveLength(1);

      const closedIssue = createMockGitHubIssue({ number: 1, state: 'closed' });
      mockUnifiedGitHubService.updateIssue.mockResolvedValue(closedIssue);

      await issuesStore.updateIssue('owner', 'repo', 'test-token', 1, { state: 'closed' });

      expect(get(openStore).issues).toHaveLength(0);

      const closedStore = issuesStore.getIssuesForRepo('owner', 'repo', 'closed');
      expect(get(closedStore).issues).toHaveLength(1);
    });

    it('should maintain separate state across multiple projects', async () => {
      const repo1Issues = [createMockGitHubIssue({ number: 1 })];
      const repo2Issues = [
        createMockGitHubIssue({ number: 2 }),
        createMockGitHubIssue({ number: 3 }),
      ];

      mockUnifiedGitHubService.getIssues
        .mockResolvedValueOnce(repo1Issues)
        .mockResolvedValueOnce(repo2Issues);

      await issuesStore.loadIssues('owner', 'repo1', 'token', 'all');
      await issuesStore.loadIssues('owner', 'repo2', 'token', 'all');

      const store1 = issuesStore.getIssuesForRepo('owner', 'repo1');
      const store2 = issuesStore.getIssuesForRepo('owner', 'repo2');

      expect(get(store1).issues).toHaveLength(1);
      expect(get(store2).issues).toHaveLength(2);

      mockUnifiedGitHubService.getIssues.mockRejectedValue(new Error('Repo1 error'));
      await expect(
        issuesStore.loadIssues('owner', 'repo1', 'token', 'all', true)
      ).rejects.toThrow();

      expect(get(store1).error).toBe('Repo1 error');
      expect(get(store2).error).toBe(null);
    });

    it('should handle cache expiration during issue operations', async () => {
      const initialIssues = [createMockGitHubIssue({ number: 1, state: 'open' })];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(initialIssues);

      await issuesStore.loadIssues('owner', 'repo', 'token', 'all');

      vi.advanceTimersByTime(CACHE_DURATION + 1000);

      const newIssue = createMockGitHubIssue({ number: 2, state: 'open' });
      mockUnifiedGitHubService.createIssue.mockResolvedValue(newIssue);

      const refreshedIssues = [
        createMockGitHubIssue({ number: 1, state: 'closed' }),
        createMockGitHubIssue({ number: 2, state: 'open' }),
      ];
      mockUnifiedGitHubService.getIssues.mockResolvedValue(refreshedIssues);

      await issuesStore.createIssue('owner', 'repo', 'token', { title: 'New Issue' });

      vi.advanceTimersByTime(FORCE_REFRESH_AFTER_ACTION);

      await vi.waitFor(() => {
        const store = issuesStore.getIssuesForRepo('owner', 'repo');
        const state = get(store);
        expect(state.issues).toHaveLength(2);
      });
    });
  });
});
