/**
 * Test Suite for UnifiedGitHubService Commit History Features
 *
 * Following TDD approach - tests written before implementation
 */

import type { Mock } from 'vitest';
import { UnifiedGitHubService } from '../UnifiedGitHubService';
import type { GitHubCommit } from '../types/repository';
import {
  MockChromeStorage,
  MockFetchResponseBuilder,
  TestFixtures,
} from './test-fixtures';

// Mock the AuthenticationStrategyFactory
vi.mock('../AuthenticationStrategyFactory', async () => {
  const { MockAuthenticationStrategyFactory } = await import(
    './test-fixtures/UnifiedGitHubServiceFixtures'
  );
  const mockFactory = new MockAuthenticationStrategyFactory();
  return {
    AuthenticationStrategyFactory: {
      getInstance: vi.fn(() => mockFactory),
    },
  };
});

describe('UnifiedGitHubService - Commit History', () => {
  let mockFetch: MockFetchResponseBuilder;
  let mockStorage: MockChromeStorage;
  let service: UnifiedGitHubService;

  beforeEach(async () => {
    mockFetch = new MockFetchResponseBuilder();
    mockStorage = new MockChromeStorage();

    // Setup basic authentication
    mockStorage.loadGitHubSettings();
    mockStorage.loadAuthenticationMethod('pat');

    service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

    vi.clearAllMocks();
  });

  afterEach(() => {
    mockFetch.reset();
    mockStorage.reset();

    if (global.fetch && typeof (global.fetch as Mock).mockRestore === 'function') {
      (global.fetch as Mock).mockRestore();
    }
  });

  describe('getCommits', () => {
    it('should fetch commits with default pagination', async () => {
      const mockCommits: GitHubCommit[] = [
        {
          sha: 'abc123',
          node_id: 'node1',
          url: 'https://api.github.com/repos/owner/repo/commits/abc123',
          html_url: 'https://github.com/owner/repo/commit/abc123',
          commit: {
            author: {
              name: 'Test Author',
              email: 'test@example.com',
              date: '2025-10-18T12:00:00Z',
            },
            committer: {
              name: 'Test Author',
              email: 'test@example.com',
              date: '2025-10-18T12:00:00Z',
            },
            message: 'Test commit',
            tree: {
              sha: 'tree123',
              url: 'https://api.github.com/repos/owner/repo/git/trees/tree123',
            },
            url: 'https://api.github.com/repos/owner/repo/git/commits/abc123',
            comment_count: 0,
          },
          author: {
            login: 'testuser',
            id: 1,
            avatar_url: 'https://github.com/avatar.png',
            type: 'User',
          },
          committer: {
            login: 'testuser',
            id: 1,
            avatar_url: 'https://github.com/avatar.png',
            type: 'User',
          },
          parents: [],
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCommits,
      });

      const commits = await service.getCommits('owner', 'repo', 'main');

      expect(commits).toEqual(mockCommits);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/commits?sha=main&per_page=30&page=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/Bearer .+/),
            Accept: 'application/vnd.github.v3+json',
          }),
        })
      );
    });

    it('should fetch commits with custom pagination', async () => {
      const mockCommits: GitHubCommit[] = [];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCommits,
      });

      await service.getCommits('owner', 'repo', 'main', 2, 50);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/commits?sha=main&per_page=50&page=2',
        expect.any(Object)
      );
    });

    it('should throw error on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(service.getCommits('owner', 'repo', 'main')).rejects.toThrow(
        'Failed to get commits: Not Found'
      );
    });

    it('should handle empty commit list', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      });

      const commits = await service.getCommits('owner', 'repo', 'main');

      expect(commits).toEqual([]);
    });
  });

  describe('getCommit', () => {
    it('should fetch a single commit by SHA', async () => {
      const mockCommit: GitHubCommit = {
        sha: 'abc123',
        node_id: 'node1',
        url: 'https://api.github.com/repos/owner/repo/commits/abc123',
        html_url: 'https://github.com/owner/repo/commit/abc123',
        commit: {
          author: {
            name: 'Test Author',
            email: 'test@example.com',
            date: '2025-10-18T12:00:00Z',
          },
          committer: {
            name: 'Test Author',
            email: 'test@example.com',
            date: '2025-10-18T12:00:00Z',
          },
          message: 'Test commit',
          tree: {
            sha: 'tree123',
            url: 'https://api.github.com/repos/owner/repo/git/trees/tree123',
          },
          url: 'https://api.github.com/repos/owner/repo/git/commits/abc123',
          comment_count: 0,
        },
        author: {
          login: 'testuser',
          id: 1,
          avatar_url: 'https://github.com/avatar.png',
          type: 'User',
        },
        committer: {
          login: 'testuser',
          id: 1,
          avatar_url: 'https://github.com/avatar.png',
          type: 'User',
        },
        parents: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCommit,
      });

      const commit = await service.getCommit('owner', 'repo', 'abc123');

      expect(commit).toEqual(mockCommit);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/commits/abc123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/Bearer .+/),
            Accept: 'application/vnd.github.v3+json',
          }),
        })
      );
    });

    it('should throw error when commit not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(service.getCommit('owner', 'repo', 'invalid')).rejects.toThrow(
        'Failed to get commit: Not Found'
      );
    });
  });

  describe('createBranchFromCommit', () => {
    it('should create a new branch from a commit SHA', async () => {
      const mockResponse = {
        ref: 'refs/heads/new-branch',
        node_id: 'ref_node',
        url: 'https://api.github.com/repos/owner/repo/git/refs/heads/new-branch',
        object: {
          sha: 'abc123',
          type: 'commit',
          url: 'https://api.github.com/repos/owner/repo/git/commits/abc123',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      });

      const result = await service.createBranchFromCommit(
        'owner',
        'repo',
        'abc123',
        'new-branch'
      );

      expect(result.success).toBe(true);
      expect(result.branch).toBe('new-branch');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/git/refs',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/Bearer .+/),
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            ref: 'refs/heads/new-branch',
            sha: 'abc123',
          }),
        })
      );
    });

    it('should return error when branch creation fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ message: 'Reference already exists' }),
      });

      const result = await service.createBranchFromCommit(
        'owner',
        'repo',
        'abc123',
        'existing-branch'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Reference already exists');
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.createBranchFromCommit(
        'owner',
        'repo',
        'abc123',
        'new-branch'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('checkBranchExists', () => {
    it('should return true when branch exists', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'existing-branch',
          commit: { sha: 'abc123', url: 'https://...' },
          protected: false,
        }),
      });

      const exists = await service.checkBranchExists('owner', 'repo', 'existing-branch');

      expect(exists).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/branches/existing-branch',
        expect.any(Object)
      );
    });

    it('should return false when branch does not exist', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const exists = await service.checkBranchExists('owner', 'repo', 'nonexistent');

      expect(exists).toBe(false);
    });
  });
});
