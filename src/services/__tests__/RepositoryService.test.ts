/* eslint-disable @typescript-eslint/no-explicit-any */
import { RepositoryService } from '../RepositoryService';
import type { IGitHubApiClient } from '../interfaces/IGitHubApiClient';
import type { IFileService } from '../interfaces/IFileService';
import type { IRepoCloneService } from '../interfaces/IRepoCloneService';
import { expect, jest, describe, it, beforeEach } from '@jest/globals';

describe('RepositoryService', () => {
  let mockApiClient: any;
  let mockFileService: any;
  let mockRepoCloneService: any;
  let repositoryService: RepositoryService;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockApiClient = {
      request: jest.fn(),
      getRateLimit: jest.fn(),
      token: 'test-token',
    };

    mockFileService = {
      writeFile: jest.fn().mockResolvedValue({} as never),
      readFile: jest.fn(),
      deleteFile: jest.fn(),
      listFiles: jest.fn(),
      getFileInfo: jest.fn(),
      fileExists: jest.fn(),
      createDirectory: jest.fn(),
    };

    mockRepoCloneService = {
      cloneRepoContents: jest.fn().mockResolvedValue({} as never),
    };

    repositoryService = new RepositoryService(
      mockApiClient as IGitHubApiClient,
      mockFileService as IFileService,
      mockRepoCloneService as IRepoCloneService
    );
  });

  describe('repoExists', () => {
    it('should return true when repository exists', async () => {
      // Arrange
      mockApiClient.request.mockResolvedValueOnce({ name: 'test-repo' });

      // Act
      const result = await repositoryService.repoExists('testuser', 'test-repo');

      // Assert
      expect(result).toBe(true);
      expect(mockApiClient.request).toHaveBeenCalledWith('GET', '/repos/testuser/test-repo');
    });

    it('should return false when repository does not exist', async () => {
      // Arrange
      const error = new Error('Not Found');
      error.message = '404 Not Found';
      mockApiClient.request.mockRejectedValueOnce(error);

      // Act
      const result = await repositoryService.repoExists('testuser', 'non-existent-repo');

      // Assert
      expect(result).toBe(false);
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/non-existent-repo'
      );
    });

    it('should propagate errors that are not 404', async () => {
      // Arrange
      const error = new Error('Server Error');
      error.message = '500 Server Error';
      mockApiClient.request.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(repositoryService.repoExists('testuser', 'test-repo')).rejects.toThrow(
        'Server Error'
      );
      expect(mockApiClient.request).toHaveBeenCalledWith('GET', '/repos/testuser/test-repo');
    });
  });

  describe('getRepoInfo', () => {
    it('should return repository info when repository exists', async () => {
      // Arrange
      const mockRepo = {
        name: 'test-repo',
        description: 'Test repository',
        private: true,
      };
      mockApiClient.request.mockResolvedValueOnce(mockRepo);

      // Act
      const result = await repositoryService.getRepoInfo('testuser', 'test-repo');

      // Assert
      expect(result).toEqual({
        name: 'test-repo',
        description: 'Test repository',
        private: true,
        exists: true,
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('GET', '/repos/testuser/test-repo');
    });

    it('should return exists=false when repository does not exist', async () => {
      // Arrange
      const error = new Error('Not Found');
      error.message = '404 Not Found';
      mockApiClient.request.mockRejectedValueOnce(error);

      // Act
      const result = await repositoryService.getRepoInfo('testuser', 'non-existent-repo');

      // Assert
      expect(result).toEqual({
        name: 'non-existent-repo',
        exists: false,
      });
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/non-existent-repo'
      );
    });
  });

  describe('createRepo', () => {
    it('should create a repository in user account', async () => {
      // Arrange
      const mockResponse = { name: 'new-repo', html_url: 'https://github.com/testuser/new-repo' };
      mockApiClient.request.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await repositoryService.createRepo({
        name: 'new-repo',
        private: true,
        description: 'New test repository',
      });

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'POST',
        '/user/repos',
        expect.objectContaining({
          name: 'new-repo',
          private: true,
          description: 'New test repository',
          auto_init: true,
        })
      );
    });

    it('should create a repository in organization', async () => {
      // Arrange
      const mockResponse = { name: 'new-repo', html_url: 'https://github.com/testorg/new-repo' };
      mockApiClient.request.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await repositoryService.createRepo({
        name: 'new-repo',
        private: true,
        description: 'New test repository',
        org: 'testorg',
      });

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'POST',
        '/orgs/testorg/repos',
        expect.objectContaining({
          name: 'new-repo',
          private: true,
          description: 'New test repository',
          auto_init: true,
        })
      );
    });

    it('should handle errors when creating a repository', async () => {
      // Arrange
      const error = new Error('Repository creation failed');
      mockApiClient.request.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(repositoryService.createRepo({ name: 'new-repo' })).rejects.toThrow(
        'Failed to create repository: Repository creation failed'
      );
    });
  });

  describe('ensureRepoExists', () => {
    it('should not create repository when it already exists', async () => {
      // Arrange
      mockApiClient.request.mockResolvedValueOnce({ name: 'existing-repo' }); // For repoExists check

      // Act
      await repositoryService.ensureRepoExists('testuser', 'existing-repo');

      // Assert
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
      expect(mockApiClient.request).toHaveBeenCalledWith('GET', '/repos/testuser/existing-repo');
    });

    it('should create repository when it does not exist', async () => {
      // Arrange
      // First call for repoExists
      const error = new Error('Not Found');
      error.message = '404 Not Found';
      mockApiClient.request.mockRejectedValueOnce(error);

      // Second call for checking if owner is an organization
      mockApiClient.request.mockResolvedValueOnce({ type: 'User' });

      // Third call for creating the repository
      mockApiClient.request.mockResolvedValueOnce({ name: 'new-repo' });

      // Mock setTimeout
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      // Act
      await repositoryService.ensureRepoExists('testuser', 'new-repo');

      // Assert
      expect(mockApiClient.request).toHaveBeenCalledTimes(3);
      expect(mockApiClient.request).toHaveBeenNthCalledWith(1, 'GET', '/repos/testuser/new-repo');
      expect(mockApiClient.request).toHaveBeenNthCalledWith(2, 'GET', '/users/testuser');
      expect(mockApiClient.request).toHaveBeenNthCalledWith(
        3,
        'POST',
        '/user/repos',
        expect.objectContaining({
          name: 'new-repo',
          private: true,
          auto_init: true,
          description: 'Repository created by Bolt to GitHub extension',
        })
      );
    });
  });

  describe('isRepoEmpty', () => {
    it('should return true when repository has no commits', async () => {
      // Arrange
      mockApiClient.request.mockResolvedValueOnce([]);

      // Act
      const result = await repositoryService.isRepoEmpty('testuser', 'empty-repo');

      // Assert
      expect(result).toBe(true);
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/empty-repo/commits'
      );
    });

    it('should return false when repository has commits', async () => {
      // Arrange
      mockApiClient.request.mockResolvedValueOnce([{ sha: 'abc123' }]);

      // Act
      const result = await repositoryService.isRepoEmpty('testuser', 'non-empty-repo');

      // Assert
      expect(result).toBe(false);
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/non-empty-repo/commits'
      );
    });

    it('should return true when repository returns 409 (empty repository)', async () => {
      // Arrange
      const error = new Error('Conflict');
      error.message = '409 Conflict';
      mockApiClient.request.mockRejectedValueOnce(error);

      // Act
      const result = await repositoryService.isRepoEmpty('testuser', 'empty-repo');

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('listRepos', () => {
    it('should return list of repositories from user account and organizations', async () => {
      // Arrange
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

      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/user/repos?per_page=100&sort=updated') {
          return Promise.resolve(userRepos);
        }
        if (endpoint === '/user/orgs') {
          return Promise.resolve(orgs);
        }
        if (endpoint === '/orgs/testorg/repos?per_page=100&sort=updated') {
          return Promise.resolve(orgRepos);
        }
        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      // Act
      const result = await repositoryService.listRepos();

      // Assert
      expect(result).toHaveLength(3);
      expect(result).toEqual([...userRepos, ...orgRepos]);
    });

    it('should handle errors when fetching organization repositories', async () => {
      // Arrange
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

      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/user/repos?per_page=100&sort=updated') {
          return Promise.resolve(userRepos);
        }
        if (endpoint === '/user/orgs') {
          return Promise.resolve(orgs);
        }
        if (endpoint === '/orgs/testorg/repos?per_page=100&sort=updated') {
          return Promise.reject(new Error('Failed to fetch org repos'));
        }
        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      // Act
      const result = await repositoryService.listRepos();

      // Assert - Should still return user repos even if org repos fail
      expect(result).toHaveLength(1);
      expect(result).toEqual(userRepos);
    });
  });

  describe('listBranches', () => {
    it('should return list of branches with default branch marked', async () => {
      // Arrange
      const repoInfo = {
        default_branch: 'main',
      };

      const branches = [
        { name: 'main', commit: { sha: 'abc123' } },
        { name: 'develop', commit: { sha: 'def456' } },
        { name: 'feature/test', commit: { sha: 'ghi789' } },
      ];

      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/repos/testuser/test-repo') {
          return Promise.resolve(repoInfo);
        }
        if (endpoint === '/repos/testuser/test-repo/branches?per_page=100') {
          return Promise.resolve(branches);
        }
        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      // Act
      const result = await repositoryService.listBranches('testuser', 'test-repo');

      // Assert
      expect(result).toHaveLength(3);
      expect(result).toEqual([
        { name: 'main', isDefault: true },
        { name: 'develop', isDefault: false },
        { name: 'feature/test', isDefault: false },
      ]);
      expect(mockApiClient.request).toHaveBeenCalledWith('GET', '/repos/testuser/test-repo');
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/test-repo/branches?per_page=100'
      );
    });

    it('should handle errors when fetching branches', async () => {
      // Arrange
      mockApiClient.request.mockRejectedValueOnce(new Error('Failed to fetch repository info'));

      // Act & Assert
      await expect(repositoryService.listBranches('testuser', 'test-repo')).rejects.toThrow(
        'Failed to fetch branches for testuser/test-repo: Failed to fetch repository info'
      );
    });
  });

  describe('createTemporaryPublicRepo', () => {
    it('should create a temporary repository with specified branch', async () => {
      // Mock Math.random to return a predictable value for testing
      const originalRandom = Math.random;
      // Mock that will return '123456' when toString(36).substring(2, 8) is called
      Math.random = jest.fn(() => ({
        toString: (radix: number) => (radix === 36 ? '0.123456' : '0.123456'),
      })) as unknown as () => number;

      // Mock Date.now to return a predictable value for testing
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => 1234567890) as () => number;

      // Arrange
      mockApiClient.request.mockImplementation((method: string, endpoint: string, body?: any) => {
        if (method === 'GET' && endpoint === '/users/testuser') {
          return Promise.resolve({ type: 'User' });
        }
        if (method === 'POST' && endpoint === '/user/repos') {
          return Promise.resolve({ name: body.name });
        }
        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      mockFileService.writeFile.mockResolvedValueOnce({ sha: 'mock-sha-gitkeep' });

      // Act
      const result = await repositoryService.createTemporaryPublicRepo(
        'testuser',
        'source-repo',
        'develop'
      );

      // Assert
      expect(result).toBe('temp-source-repo-1234567890-123456');
      expect(mockApiClient.request).toHaveBeenCalledWith('GET', '/users/testuser');
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'POST',
        '/user/repos',
        expect.objectContaining({
          name: 'temp-source-repo-1234567890-123456',
          private: true,
          auto_init: false,
          description: 'Temporary repository for Bolt import - will be deleted automatically',
        })
      );
      expect(mockFileService.writeFile).toHaveBeenCalledWith(
        'testuser',
        'temp-source-repo-1234567890-123456',
        '.gitkeep',
        '',
        'develop',
        `Initialize repository with branch 'develop'`
      );

      // Restore original functions
      Math.random = originalRandom;
      Date.now = originalDateNow;
    });

    it('should use main as default branch when not specified', async () => {
      // Mock Math.random and Date.now
      const originalRandom = Math.random;
      const originalDateNow = Date.now;
      // Mock that will return '123456' when toString(36).substring(2, 8) is called
      Math.random = jest.fn(() => ({
        toString: (radix: number) => (radix === 36 ? '0.123456' : '0.123456'),
      })) as unknown as () => number;
      Date.now = jest.fn(() => 1234567890) as () => number;

      // Arrange
      mockApiClient.request.mockImplementation((method: string, endpoint: string, body?: any) => {
        if (method === 'GET' && endpoint === '/users/testuser') {
          return Promise.resolve({ type: 'User' });
        }
        if (method === 'POST' && endpoint === '/user/repos') {
          return Promise.resolve({ name: body.name });
        }
        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      mockFileService.writeFile.mockResolvedValueOnce({ sha: 'mock-sha-gitkeep-main' });

      // Act
      const result = await repositoryService.createTemporaryPublicRepo('testuser', 'source-repo');

      // Assert
      expect(result).toBe('temp-source-repo-1234567890-123456');
      expect(mockFileService.writeFile).toHaveBeenCalledWith(
        'testuser',
        'temp-source-repo-1234567890-123456',
        '.gitkeep',
        '',
        'main',
        `Initialize repository with branch 'main'`
      );

      // Restore original functions
      Math.random = originalRandom;
      Date.now = originalDateNow;
    });
  });

  describe('initializeEmptyRepo', () => {
    it('should initialize a repository with a README file', async () => {
      // Arrange
      mockFileService.writeFile.mockResolvedValueOnce({ sha: 'mock-sha-readme' });

      // Act
      await repositoryService.initializeEmptyRepo('testuser', 'test-repo', 'main');

      // Assert
      expect(mockFileService.writeFile).toHaveBeenCalledWith(
        'testuser',
        'test-repo',
        'README.md',
        expect.stringContaining('# test-repo'),
        'main',
        'Initialize repository with auto-generated README'
      );
    });
  });

  describe('cloneRepoContents', () => {
    it('should delegate to the RepoCloneService', async () => {
      // Act
      const onProgressMock = jest.fn();
      await repositoryService.cloneRepoContents(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo',
        'main',
        onProgressMock
      );

      // Assert
      expect(mockRepoCloneService.cloneRepoContents).toHaveBeenCalledWith(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo',
        'main',
        onProgressMock
      );
    });

    it('should throw error when RepoCloneService is not provided', async () => {
      // Arrange
      const repoServiceWithoutCloner = new RepositoryService(
        mockApiClient as IGitHubApiClient,
        mockFileService as IFileService
      );

      // Act & Assert
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
});
