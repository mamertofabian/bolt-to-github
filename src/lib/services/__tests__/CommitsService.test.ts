import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitsService } from '../CommitsService';
import type {
  CommitListItem,
  CommitsFilter,
  CommitsPagination,
  CommitsServiceOptions,
} from '../../types/commits';
import type { GitHubCommit } from '../../../services/types/repository';

describe('CommitsService', () => {
  let service: CommitsService;
  let mockUnifiedGitHubService: {
    request: ReturnType<typeof vi.fn>;
  };

  const TEST_OPTIONS: CommitsServiceOptions = {
    owner: 'test-owner',
    repo: 'test-repo',
    branch: 'main',
    token: 'test-token',
  };

  const createMockCommit = (index: number): GitHubCommit => ({
    sha: `sha${index}abcdef1234567890`,
    node_id: `node${index}`,
    url: `https://api.github.com/repos/test-owner/test-repo/commits/sha${index}`,
    html_url: `https://github.com/test-owner/test-repo/commit/sha${index}abcdef1234567890`,
    commit: {
      author: {
        name: `Author ${index}`,
        email: `author${index}@example.com`,
        date: `2024-01-${String(index).padStart(2, '0')}T10:00:00Z`,
      },
      committer: {
        name: `Committer ${index}`,
        email: `committer${index}@example.com`,
        date: `2024-01-${String(index).padStart(2, '0')}T10:00:00Z`,
      },
      message: `Commit message ${index}\n\nDetailed description for commit ${index}`,
      tree: {
        sha: `tree${index}`,
        url: `https://api.github.com/repos/test-owner/test-repo/git/trees/tree${index}`,
      },
      url: `https://api.github.com/repos/test-owner/test-repo/git/commits/sha${index}`,
      comment_count: 0,
    },
    author: {
      login: `author${index}`,
      id: index,
      avatar_url: `https://avatars.githubusercontent.com/u/${index}`,
      type: 'User',
    },
    committer: {
      login: `committer${index}`,
      id: index + 100,
      avatar_url: `https://avatars.githubusercontent.com/u/${index + 100}`,
      type: 'User',
    },
    parents: [],
  });

  beforeEach(() => {
    // Reset service instance and cache
    CommitsService.clearCache();
    service = new CommitsService();

    // Create mock for UnifiedGitHubService
    mockUnifiedGitHubService = {
      request: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    CommitsService.clearCache();
  });

  describe('fetchCommits', () => {
    it('should fetch commits with default pagination', async () => {
      const mockCommits = [createMockCommit(1), createMockCommit(2), createMockCommit(3)];
      mockUnifiedGitHubService.request.mockResolvedValue(mockCommits);

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      const result = await service.fetchCommits(
        TEST_OPTIONS,
        pagination,
        mockUnifiedGitHubService as any
      );

      expect(mockUnifiedGitHubService.request).toHaveBeenCalledWith(
        'GET',
        '/repos/test-owner/test-repo/commits',
        {
          params: {
            sha: 'main',
            per_page: 30,
            page: 1,
          },
        }
      );

      expect(result.commits).toHaveLength(3);
      expect(result.commits[0].sha).toBe('sha1abcdef1234567890');
      expect(result.commits[0].shortSha).toBe('sha1abc');
      expect(result.commits[0].message).toBe('Commit message 1');
      expect(result.commits[0].author.name).toBe('Author 1');
      expect(result.commits[0].author.login).toBe('author1');
    });

    it('should handle pagination correctly', async () => {
      const mockCommits = Array.from({ length: 30 }, (_, i) => createMockCommit(i + 1));
      mockUnifiedGitHubService.request.mockResolvedValue(mockCommits);

      const pagination: CommitsPagination = {
        page: 2,
        perPage: 30,
        hasMore: false,
      };

      await service.fetchCommits(TEST_OPTIONS, pagination, mockUnifiedGitHubService as any);

      expect(mockUnifiedGitHubService.request).toHaveBeenCalledWith(
        'GET',
        '/repos/test-owner/test-repo/commits',
        {
          params: {
            sha: 'main',
            per_page: 30,
            page: 2,
          },
        }
      );
    });

    it('should detect when there are more commits', async () => {
      // Return exactly perPage commits, indicating there might be more
      const mockCommits = Array.from({ length: 30 }, (_, i) => createMockCommit(i + 1));
      mockUnifiedGitHubService.request.mockResolvedValue(mockCommits);

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      const result = await service.fetchCommits(
        TEST_OPTIONS,
        pagination,
        mockUnifiedGitHubService as any
      );

      expect(result.hasMore).toBe(true);
    });

    it('should detect when there are no more commits', async () => {
      // Return fewer than perPage commits
      const mockCommits = Array.from({ length: 15 }, (_, i) => createMockCommit(i + 1));
      mockUnifiedGitHubService.request.mockResolvedValue(mockCommits);

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      const result = await service.fetchCommits(
        TEST_OPTIONS,
        pagination,
        mockUnifiedGitHubService as any
      );

      expect(result.hasMore).toBe(false);
    });

    it('should cache commits', async () => {
      const mockCommits = [createMockCommit(1), createMockCommit(2)];
      mockUnifiedGitHubService.request.mockResolvedValue(mockCommits);

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      // First call
      await service.fetchCommits(TEST_OPTIONS, pagination, mockUnifiedGitHubService as any);

      // Second call should use cache
      await service.fetchCommits(TEST_OPTIONS, pagination, mockUnifiedGitHubService as any);

      // Should only call API once due to caching
      expect(mockUnifiedGitHubService.request).toHaveBeenCalledTimes(1);
    });

    it('should handle commits with null author', async () => {
      const mockCommit = createMockCommit(1);
      mockCommit.author = null;
      mockUnifiedGitHubService.request.mockResolvedValue([mockCommit]);

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      const result = await service.fetchCommits(
        TEST_OPTIONS,
        pagination,
        mockUnifiedGitHubService as any
      );

      expect(result.commits[0].author.login).toBeNull();
      expect(result.commits[0].author.avatar_url).toBeNull();
      expect(result.commits[0].author.name).toBe('Author 1'); // From commit.commit.author
    });

    it('should handle API errors gracefully', async () => {
      mockUnifiedGitHubService.request.mockRejectedValue(new Error('API Error'));

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      await expect(
        service.fetchCommits(TEST_OPTIONS, pagination, mockUnifiedGitHubService as any)
      ).rejects.toThrow('API Error');
    });

    it('should transform commit message correctly (first line only)', async () => {
      const mockCommit = createMockCommit(1);
      mockCommit.commit.message = 'First line\nSecond line\nThird line';
      mockUnifiedGitHubService.request.mockResolvedValue([mockCommit]);

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      const result = await service.fetchCommits(
        TEST_OPTIONS,
        pagination,
        mockUnifiedGitHubService as any
      );

      expect(result.commits[0].message).toBe('First line');
    });
  });

  describe('filterCommits', () => {
    let mockCommits: CommitListItem[];

    beforeEach(() => {
      mockCommits = [
        {
          sha: 'sha1',
          shortSha: 'sha1abc',
          message: 'Add new feature',
          author: {
            name: 'John Doe',
            email: 'john@example.com',
            avatar_url: 'https://avatar.url',
            login: 'johndoe',
          },
          date: '2024-01-01T10:00:00Z',
          htmlUrl: 'https://github.com/test/repo/commit/sha1',
          filesChangedCount: 3,
        },
        {
          sha: 'sha2',
          shortSha: 'sha2abc',
          message: 'Fix bug in authentication',
          author: {
            name: 'Jane Smith',
            email: 'jane@example.com',
            avatar_url: 'https://avatar2.url',
            login: 'janesmith',
          },
          date: '2024-01-02T10:00:00Z',
          htmlUrl: 'https://github.com/test/repo/commit/sha2',
          filesChangedCount: 2,
        },
        {
          sha: 'sha3',
          shortSha: 'sha3abc',
          message: 'Update documentation',
          author: {
            name: 'John Doe',
            email: 'john@example.com',
            avatar_url: 'https://avatar.url',
            login: 'johndoe',
          },
          date: '2024-01-03T10:00:00Z',
          htmlUrl: 'https://github.com/test/repo/commit/sha3',
          filesChangedCount: 1,
        },
      ];
    });

    it('should return all commits when no filter is applied', () => {
      const filter: CommitsFilter = {
        searchQuery: '',
      };

      const result = service.filterCommits(mockCommits, filter);

      expect(result).toHaveLength(3);
    });

    it('should filter commits by message (case-insensitive)', () => {
      const filter: CommitsFilter = {
        searchQuery: 'bug',
      };

      const result = service.filterCommits(mockCommits, filter);

      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Fix bug in authentication');
    });

    it('should filter commits by message (multiple matches)', () => {
      const filter: CommitsFilter = {
        searchQuery: 'new',
      };

      const result = service.filterCommits(mockCommits, filter);

      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Add new feature');
    });

    it('should filter commits by author name (case-insensitive)', () => {
      const filter: CommitsFilter = {
        searchQuery: 'john',
      };

      const result = service.filterCommits(mockCommits, filter);

      expect(result).toHaveLength(2);
      expect(result[0].author.name).toBe('John Doe');
      expect(result[1].author.name).toBe('John Doe');
    });

    it('should filter commits by author login', () => {
      const filter: CommitsFilter = {
        searchQuery: 'janesmith',
      };

      const result = service.filterCommits(mockCommits, filter);

      expect(result).toHaveLength(1);
      expect(result[0].author.login).toBe('janesmith');
    });

    it('should return empty array when no matches found', () => {
      const filter: CommitsFilter = {
        searchQuery: 'nonexistent',
      };

      const result = service.filterCommits(mockCommits, filter);

      expect(result).toHaveLength(0);
    });

    it('should handle commits with null login', () => {
      const commitsWithNullLogin: CommitListItem[] = [
        {
          ...mockCommits[0],
          author: {
            ...mockCommits[0].author,
            login: null,
          },
        },
      ];

      const filter: CommitsFilter = {
        searchQuery: 'feature',
      };

      const result = service.filterCommits(commitsWithNullLogin, filter);

      expect(result).toHaveLength(1);
    });

    it('should filter by partial message match', () => {
      const filter: CommitsFilter = {
        searchQuery: 'auth',
      };

      const result = service.filterCommits(mockCommits, filter);

      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('authentication');
    });
  });

  describe('getCommitDetails', () => {
    it('should fetch detailed commit information', async () => {
      const mockCommit = createMockCommit(1);
      mockUnifiedGitHubService.request.mockResolvedValue(mockCommit);

      const result = await service.getCommitDetails(
        'test-owner',
        'test-repo',
        'sha1abcdef',
        'test-token',
        mockUnifiedGitHubService as any
      );

      expect(mockUnifiedGitHubService.request).toHaveBeenCalledWith(
        'GET',
        '/repos/test-owner/test-repo/commits/sha1abcdef'
      );

      expect(result).toEqual(mockCommit);
    });

    it('should handle errors when fetching commit details', async () => {
      mockUnifiedGitHubService.request.mockRejectedValue(new Error('Commit not found'));

      await expect(
        service.getCommitDetails(
          'test-owner',
          'test-repo',
          'invalid-sha',
          'test-token',
          mockUnifiedGitHubService as any
        )
      ).rejects.toThrow('Commit not found');
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      const mockCommits = [createMockCommit(1)];
      mockUnifiedGitHubService.request.mockResolvedValue(mockCommits);

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      // Fetch to populate cache
      await service.fetchCommits(TEST_OPTIONS, pagination, mockUnifiedGitHubService as any);

      // Clear cache
      CommitsService.clearCache();

      // Create new service instance
      const newService = new CommitsService();

      // Fetch again - should call API since cache is cleared
      await newService.fetchCommits(TEST_OPTIONS, pagination, mockUnifiedGitHubService as any);

      expect(mockUnifiedGitHubService.request).toHaveBeenCalledTimes(2);
    });
  });

  describe('transformCommit (private method behavior)', () => {
    it('should calculate short SHA correctly (first 7 characters)', async () => {
      const mockCommit = createMockCommit(1);
      mockCommit.sha = 'abcdefghijklmnop1234567890';
      mockUnifiedGitHubService.request.mockResolvedValue([mockCommit]);

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      const result = await service.fetchCommits(
        TEST_OPTIONS,
        pagination,
        mockUnifiedGitHubService as any
      );

      expect(result.commits[0].shortSha).toBe('abcdefg');
    });

    it('should set filesChangedCount to 0 (placeholder for now)', async () => {
      const mockCommit = createMockCommit(1);
      mockUnifiedGitHubService.request.mockResolvedValue([mockCommit]);

      const pagination: CommitsPagination = {
        page: 1,
        perPage: 30,
        hasMore: false,
      };

      const result = await service.fetchCommits(
        TEST_OPTIONS,
        pagination,
        mockUnifiedGitHubService as any
      );

      // For MVP, filesChangedCount is set to 0
      // Can be enhanced later to fetch actual file count
      expect(result.commits[0].filesChangedCount).toBe(0);
    });
  });
});
