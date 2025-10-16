import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { RepositoryService } from '../RepositoryService';
import type { IFileService } from '../interfaces/IFileService';
import type { IGitHubApiClient } from '../interfaces/IGitHubApiClient';
import type { IRepoCloneService } from '../interfaces/IRepoCloneService';

describe('RepositoryService', () => {
  let mockRequest: Mock;
  let mockWriteFile: Mock;
  let mockCloneRepoContents: Mock;
  let repositoryService: RepositoryService;

  beforeEach(() => {
    mockRequest = vi.fn();
    mockWriteFile = vi.fn().mockResolvedValue({ sha: 'test-sha' });
    mockCloneRepoContents = vi.fn().mockResolvedValue(undefined);

    const mockApiClient: IGitHubApiClient = {
      request: mockRequest,
      getRateLimit: vi.fn(),
    };

    const mockFileService: IFileService = {
      writeFile: mockWriteFile,
      readFile: vi.fn(),
      deleteFile: vi.fn(),
      listFiles: vi.fn(),
      getFileInfo: vi.fn(),
      fileExists: vi.fn(),
      createDirectory: vi.fn(),
    };

    const mockRepoCloneService: IRepoCloneService = {
      cloneRepoContents: mockCloneRepoContents,
    };

    repositoryService = new RepositoryService(mockApiClient, mockFileService, mockRepoCloneService);
  });

  describe('repoExists', () => {
    it('should return true when repository exists', async () => {
      mockRequest.mockResolvedValueOnce({ name: 'test-repo' });

      const result = await repositoryService.repoExists('testuser', 'test-repo');

      expect(result).toBe(true);
    });

    it('should return false when repository does not exist (404)', async () => {
      const error = new Error('Not Found');
      error.message = '404 Not Found';
      mockRequest.mockRejectedValueOnce(error);

      const result = await repositoryService.repoExists('testuser', 'non-existent-repo');

      expect(result).toBe(false);
    });

    it('should throw error for non-404 failures', async () => {
      const error = new Error('Server Error');
      error.message = '500 Server Error';
      mockRequest.mockRejectedValueOnce(error);

      await expect(repositoryService.repoExists('testuser', 'test-repo')).rejects.toThrow(
        'Server Error'
      );
    });
  });

  describe('getRepoInfo', () => {
    it('should return full repository info when exists', async () => {
      const mockRepo = {
        name: 'test-repo',
        description: 'Test repository',
        private: true,
      };
      mockRequest.mockResolvedValueOnce(mockRepo);

      const result = await repositoryService.getRepoInfo('testuser', 'test-repo');

      expect(result).toEqual({
        name: 'test-repo',
        description: 'Test repository',
        private: true,
        exists: true,
      });
      expect(result.exists).toBe(true);
      expect(result.description).toBe('Test repository');
      expect(result.private).toBe(true);
    });

    it('should return exists=false with repo name when not found', async () => {
      const error = new Error('Not Found');
      error.message = '404 Not Found';
      mockRequest.mockRejectedValueOnce(error);

      const result = await repositoryService.getRepoInfo('testuser', 'non-existent-repo');

      expect(result.exists).toBe(false);
      expect(result.name).toBe('non-existent-repo');
      expect(result.description).toBeUndefined();
      expect(result.private).toBeUndefined();
    });
  });

  describe('createRepo', () => {
    it('should create repository in user account with auto_init enabled', async () => {
      const mockResponse = {
        name: 'new-repo',
        html_url: 'https://github.com/testuser/new-repo',
        private: true,
        description: 'New test repository',
      };
      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await repositoryService.createRepo({
        name: 'new-repo',
        private: true,
        description: 'New test repository',
      });

      expect(result.name).toBe('new-repo');
      expect(result.html_url).toBe('https://github.com/testuser/new-repo');
      expect(result.private).toBe(true);
      expect(result.description).toBe('New test repository');
    });

    it('should create repository in organization when org is specified', async () => {
      const mockResponse = {
        name: 'new-repo',
        html_url: 'https://github.com/testorg/new-repo',
        owner: { login: 'testorg' },
      };
      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await repositoryService.createRepo({
        name: 'new-repo',
        private: true,
        description: 'New test repository',
        org: 'testorg',
      });

      expect(result.name).toBe('new-repo');
      expect(result.html_url).toBe('https://github.com/testorg/new-repo');
    });

    it('should wrap GitHub API errors with context', async () => {
      const error = new Error('Repository creation failed');
      mockRequest.mockRejectedValueOnce(error);

      await expect(repositoryService.createRepo({ name: 'new-repo' })).rejects.toThrow(
        'Failed to create repository: Repository creation failed'
      );
    });
  });

  describe('ensureRepoExists', () => {
    it('should not create repository when it already exists', async () => {
      mockRequest.mockResolvedValueOnce({ name: 'existing-repo' });

      await repositoryService.ensureRepoExists('testuser', 'existing-repo');

      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('should create repository for user when it does not exist', async () => {
      const error = new Error('Not Found');
      error.message = '404 Not Found';
      mockRequest
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ type: 'User' })
        .mockResolvedValueOnce({ name: 'new-repo' });

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: () => void) => {
        callback();
        return 0 as never;
      });

      await repositoryService.ensureRepoExists('testuser', 'new-repo');

      expect(mockRequest).toHaveBeenCalledTimes(3);
    });

    it('should create repository in organization when owner is an org', async () => {
      const error = new Error('Not Found');
      error.message = '404 Not Found';
      mockRequest
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ type: 'Organization' })
        .mockResolvedValueOnce({ name: 'new-repo' });

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: () => void) => {
        callback();
        return 0 as never;
      });

      await repositoryService.ensureRepoExists('testorg', 'new-repo');

      expect(mockRequest).toHaveBeenCalledTimes(3);
    });
  });

  describe('isRepoEmpty', () => {
    it('should return true when repository has no commits', async () => {
      mockRequest.mockResolvedValueOnce([]);

      const result = await repositoryService.isRepoEmpty('testuser', 'empty-repo');

      expect(result).toBe(true);
    });

    it('should return false when repository has commits', async () => {
      mockRequest.mockResolvedValueOnce([{ sha: 'abc123' }, { sha: 'def456' }]);

      const result = await repositoryService.isRepoEmpty('testuser', 'non-empty-repo');

      expect(result).toBe(false);
    });

    it('should return true when API returns 409 (empty repository)', async () => {
      const error = new Error('Conflict');
      error.message = '409 Conflict';
      mockRequest.mockRejectedValueOnce(error);

      const result = await repositoryService.isRepoEmpty('testuser', 'empty-repo');

      expect(result).toBe(true);
    });

    it('should throw error for non-409 failures', async () => {
      const error = new Error('Server Error');
      error.message = '500 Server Error';
      mockRequest.mockRejectedValueOnce(error);

      await expect(repositoryService.isRepoEmpty('testuser', 'test-repo')).rejects.toThrow(
        'Server Error'
      );
    });
  });

  describe('listRepos', () => {
    it('should return combined user and organization repositories', async () => {
      const userRepos = [
        {
          name: 'repo1',
          description: 'User repo 1',
          private: true,
          html_url: 'https://github.com/testuser/repo1',
          created_at: '2023-01-01',
          updated_at: '2023-01-02',
          language: 'TypeScript',
        },
        {
          name: 'repo2',
          description: 'User repo 2',
          private: false,
          html_url: 'https://github.com/testuser/repo2',
          created_at: '2023-02-01',
          updated_at: '2023-02-02',
          language: 'JavaScript',
        },
      ];

      const orgs = [{ login: 'testorg' }];

      const orgRepos = [
        {
          name: 'org-repo1',
          description: 'Org repo 1',
          private: true,
          html_url: 'https://github.com/testorg/org-repo1',
          created_at: '2023-03-01',
          updated_at: '2023-03-02',
          language: 'TypeScript',
        },
      ];

      mockRequest
        .mockResolvedValueOnce(userRepos)
        .mockResolvedValueOnce(orgs)
        .mockResolvedValueOnce(orgRepos);

      const result = await repositoryService.listRepos();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(userRepos[0]);
      expect(result[1]).toEqual(userRepos[1]);
      expect(result[2]).toEqual(orgRepos[0]);
      expect(result[0].language).toBe('TypeScript');
      expect(result[1].language).toBe('JavaScript');
    });

    it('should return only user repos when org fetch fails', async () => {
      const userRepos = [
        {
          name: 'repo1',
          description: 'User repo 1',
          private: true,
          html_url: 'https://github.com/testuser/repo1',
          created_at: '2023-01-01',
          updated_at: '2023-01-02',
          language: 'TypeScript',
        },
      ];

      const orgs = [{ login: 'testorg' }];

      mockRequest
        .mockResolvedValueOnce(userRepos)
        .mockResolvedValueOnce(orgs)
        .mockRejectedValueOnce(new Error('Failed to fetch org repos'));

      const result = await repositoryService.listRepos();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('repo1');
    });

    it('should return only user repos when org list fails', async () => {
      const userRepos = [
        {
          name: 'repo1',
          description: 'User repo 1',
          private: true,
          html_url: 'https://github.com/testuser/repo1',
          created_at: '2023-01-01',
          updated_at: '2023-01-02',
          language: 'TypeScript',
        },
      ];

      mockRequest
        .mockResolvedValueOnce(userRepos)
        .mockRejectedValueOnce(new Error('Failed to fetch organizations'));

      const result = await repositoryService.listRepos();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('repo1');
    });
  });

  describe('listBranches', () => {
    it('should return branches with default branch marked', async () => {
      const repoInfo = {
        default_branch: 'main',
      };

      const branches = [
        { name: 'main', commit: { sha: 'abc123' } },
        { name: 'develop', commit: { sha: 'def456' } },
        { name: 'feature/test', commit: { sha: 'ghi789' } },
      ];

      mockRequest.mockResolvedValueOnce(repoInfo).mockResolvedValueOnce(branches);

      const result = await repositoryService.listBranches('testuser', 'test-repo');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: 'main', isDefault: true });
      expect(result[1]).toEqual({ name: 'develop', isDefault: false });
      expect(result[2]).toEqual({ name: 'feature/test', isDefault: false });
    });

    it('should handle custom default branch', async () => {
      const repoInfo = {
        default_branch: 'develop',
      };

      const branches = [
        { name: 'main', commit: { sha: 'abc123' } },
        { name: 'develop', commit: { sha: 'def456' } },
      ];

      mockRequest.mockResolvedValueOnce(repoInfo).mockResolvedValueOnce(branches);

      const result = await repositoryService.listBranches('testuser', 'test-repo');

      expect(result[0]).toEqual({ name: 'main', isDefault: false });
      expect(result[1]).toEqual({ name: 'develop', isDefault: true });
    });

    it('should wrap errors with context', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Failed to fetch repository info'));

      await expect(repositoryService.listBranches('testuser', 'test-repo')).rejects.toThrow(
        'Failed to fetch branches for testuser/test-repo: Failed to fetch repository info'
      );
    });
  });

  describe('createTemporaryPublicRepo', () => {
    it('should create temporary repository with specified branch', async () => {
      const originalRandom = Math.random;
      const originalDateNow = Date.now;

      Math.random = vi.fn(() => ({
        toString: (radix: number) => (radix === 36 ? '0.123456' : '0.123456'),
      })) as unknown as () => number;
      Date.now = vi.fn(() => 1234567890);

      mockRequest
        .mockResolvedValueOnce({ type: 'User' })
        .mockResolvedValueOnce({ name: 'temp-source-repo-1234567890-123456' });

      const result = await repositoryService.createTemporaryPublicRepo(
        'testuser',
        'source-repo',
        'develop'
      );

      expect(result).toBe('temp-source-repo-1234567890-123456');
      expect(mockWriteFile).toHaveBeenCalledWith(
        'testuser',
        'temp-source-repo-1234567890-123456',
        '.gitkeep',
        '',
        'develop',
        `Initialize repository with branch 'develop'`
      );

      Math.random = originalRandom;
      Date.now = originalDateNow;
    });

    it('should use main as default branch when not specified', async () => {
      const originalRandom = Math.random;
      const originalDateNow = Date.now;

      Math.random = vi.fn(() => ({
        toString: (radix: number) => (radix === 36 ? '0.123456' : '0.123456'),
      })) as unknown as () => number;
      Date.now = vi.fn(() => 1234567890);

      mockRequest
        .mockResolvedValueOnce({ type: 'User' })
        .mockResolvedValueOnce({ name: 'temp-source-repo-1234567890-123456' });

      const result = await repositoryService.createTemporaryPublicRepo('testuser', 'source-repo');

      expect(result).toBe('temp-source-repo-1234567890-123456');
      expect(mockWriteFile).toHaveBeenCalledWith(
        'testuser',
        'temp-source-repo-1234567890-123456',
        '.gitkeep',
        '',
        'main',
        `Initialize repository with branch 'main'`
      );

      Math.random = originalRandom;
      Date.now = originalDateNow;
    });

    it('should create in organization when owner is an org', async () => {
      const originalRandom = Math.random;
      const originalDateNow = Date.now;

      Math.random = vi.fn(() => ({
        toString: (radix: number) => (radix === 36 ? '0.123456' : '0.123456'),
      })) as unknown as () => number;
      Date.now = vi.fn(() => 1234567890);

      mockRequest
        .mockResolvedValueOnce({ type: 'Organization' })
        .mockResolvedValueOnce({ name: 'temp-source-repo-1234567890-123456' });

      const result = await repositoryService.createTemporaryPublicRepo(
        'testorg',
        'source-repo',
        'main'
      );

      expect(result).toBe('temp-source-repo-1234567890-123456');

      Math.random = originalRandom;
      Date.now = originalDateNow;
    });
  });

  describe('initializeEmptyRepo', () => {
    it('should create .gitkeep file with correct parameters', async () => {
      await repositoryService.initializeEmptyRepo('testuser', 'test-repo', 'main');

      expect(mockWriteFile).toHaveBeenCalledWith(
        'testuser',
        'test-repo',
        '.gitkeep',
        '',
        'main',
        "Initialize repository with branch 'main'"
      );
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
    });

    it('should work with different branch names', async () => {
      await repositoryService.initializeEmptyRepo('testuser', 'test-repo', 'develop');

      expect(mockWriteFile).toHaveBeenCalledWith(
        'testuser',
        'test-repo',
        '.gitkeep',
        '',
        'develop',
        "Initialize repository with branch 'develop'"
      );
    });
  });

  describe('cloneRepoContents', () => {
    it('should delegate to RepoCloneService with all parameters', async () => {
      const onProgressMock = vi.fn();

      await repositoryService.cloneRepoContents(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo',
        'main',
        onProgressMock
      );

      expect(mockCloneRepoContents).toHaveBeenCalledWith(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo',
        'main',
        onProgressMock
      );
      expect(mockCloneRepoContents).toHaveBeenCalledTimes(1);
    });

    it('should use default branch when not specified', async () => {
      await repositoryService.cloneRepoContents(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo'
      );

      expect(mockCloneRepoContents).toHaveBeenCalledWith(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo',
        'main',
        undefined
      );
    });

    it('should throw error when RepoCloneService is not provided', async () => {
      const mockApiClient: IGitHubApiClient = {
        request: mockRequest,
        getRateLimit: vi.fn(),
      };

      const mockFileService: IFileService = {
        writeFile: mockWriteFile,
        readFile: vi.fn(),
        deleteFile: vi.fn(),
        listFiles: vi.fn(),
        getFileInfo: vi.fn(),
        fileExists: vi.fn(),
        createDirectory: vi.fn(),
      };

      const repoServiceWithoutCloner = new RepositoryService(mockApiClient, mockFileService);

      await expect(
        repoServiceWithoutCloner.cloneRepoContents(
          'sourceOwner',
          'sourceRepo',
          'targetOwner',
          'targetRepo'
        )
      ).rejects.toThrow('RepoCloneService is required for cloning repository contents');
    });
  });

  describe('deleteRepo', () => {
    it('should delete repository successfully', async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await repositoryService.deleteRepo('testuser', 'test-repo');

      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('should wrap deletion errors with context', async () => {
      const error = new Error('Deletion failed');
      mockRequest.mockRejectedValueOnce(error);

      await expect(repositoryService.deleteRepo('testuser', 'test-repo')).rejects.toThrow(
        'Failed to delete repository testuser/test-repo: Deletion failed'
      );
    });
  });

  describe('updateRepoVisibility', () => {
    it('should update repository to private', async () => {
      mockRequest.mockResolvedValueOnce({ private: true });

      await repositoryService.updateRepoVisibility('testuser', 'test-repo', true);

      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('should update repository to public', async () => {
      mockRequest.mockResolvedValueOnce({ private: false });

      await repositoryService.updateRepoVisibility('testuser', 'test-repo', false);

      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('should wrap visibility update errors with context', async () => {
      const error = new Error('Update failed');
      mockRequest.mockRejectedValueOnce(error);

      await expect(
        repositoryService.updateRepoVisibility('testuser', 'test-repo', true)
      ).rejects.toThrow(
        'Failed to update repository visibility for testuser/test-repo: Update failed'
      );
    });
  });

  describe('getCommitCount', () => {
    it('should return count of commits', async () => {
      const commits = [{ sha: 'abc123' }, { sha: 'def456' }, { sha: 'ghi789' }];
      mockRequest.mockResolvedValueOnce(commits);

      const result = await repositoryService.getCommitCount('testuser', 'test-repo', 'main');

      expect(result).toBe(3);
    });

    it('should respect maxCommits limit', async () => {
      const commits = new Array(150).fill({ sha: 'abc123' });
      mockRequest.mockResolvedValueOnce(commits);

      const result = await repositoryService.getCommitCount('testuser', 'test-repo', 'main', 100);

      expect(result).toBe(100);
    });

    it('should return 0 on error', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Failed to fetch commits'));

      const result = await repositoryService.getCommitCount('testuser', 'test-repo', 'main');

      expect(result).toBe(0);
    });

    it('should return actual count when less than maxCommits', async () => {
      const commits = [{ sha: 'abc123' }, { sha: 'def456' }];
      mockRequest.mockResolvedValueOnce(commits);

      const result = await repositoryService.getCommitCount('testuser', 'test-repo', 'main', 100);

      expect(result).toBe(2);
    });
  });
});
