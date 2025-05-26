import { RepoCloneService } from '../RepoCloneService';
import type { IGitHubApiClient } from '../interfaces/IGitHubApiClient';
import type { IFileService } from '../interfaces/IFileService';
import { expect, jest, describe, it, beforeEach } from '@jest/globals';

// Mock the RateLimitHandler to avoid rate limit issues in tests
jest.mock('../RateLimitHandler', () => {
  return {
    RateLimitHandler: jest.fn().mockImplementation(() => {
      return {
        beforeRequest: jest.fn().mockResolvedValue({} as never),
        handleRateLimit: jest.fn().mockResolvedValue({} as never),
        resetRequestCount: jest.fn(),
        resetRetryCount: jest.fn(),
        sleep: jest.fn().mockImplementation((ms) => Promise.resolve()),
      };
    }),
  };
});

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('RepoCloneService', () => {
  let mockApiClient: any;
  let mockFileService: any;
  let repoCloneService: RepoCloneService;

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

    repoCloneService = new RepoCloneService(
      mockApiClient as IGitHubApiClient,
      mockFileService as IFileService
    );
  });

  describe('cloneRepoContents', () => {
    it('should clone files from source repository to target repository', async () => {
      // Arrange
      // Mock for rate limit check
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 4500,
                reset: Math.floor(Date.now() / 1000) + 3600,
              },
            },
          });
        }

        if (endpoint.includes('/git/trees/')) {
          return Promise.resolve({
            tree: [
              { path: 'file1.txt', type: 'blob' },
              { path: 'file2.txt', type: 'blob' },
              { path: 'directory', type: 'tree' },
            ],
          });
        }

        if (endpoint.includes('/contents/file1.txt')) {
          return Promise.resolve({
            content: 'ZmlsZTEgY29udGVudA==', // Base64 for "file1 content"
          });
        }

        if (endpoint.includes('/contents/file2.txt')) {
          return Promise.resolve({
            content: 'ZmlsZTIgY29udGVudA==', // Base64 for "file2 content"
          });
        }

        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      // Act
      const onProgressMock = jest.fn();
      await repoCloneService.cloneRepoContents(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo',
        'main',
        onProgressMock
      );

      // Assert
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/sourceOwner/sourceRepo/git/trees/main?recursive=1'
      );

      expect(mockFileService.writeFile).toHaveBeenCalledWith(
        'targetOwner',
        'targetRepo',
        'file1.txt',
        'file1 content',
        'main',
        'Copy file1.txt from sourceRepo'
      );

      expect(mockFileService.writeFile).toHaveBeenCalledWith(
        'targetOwner',
        'targetRepo',
        'file2.txt',
        'file2 content',
        'main',
        'Copy file2.txt from sourceRepo'
      );

      expect(onProgressMock).toHaveBeenCalledTimes(2);
    });

    it('should handle file fetch errors and retry', async () => {
      // Arrange
      // Mock API with temporary error on first try
      let firstTry = true;
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 4500,
                reset: Math.floor(Date.now() / 1000) + 60,
              },
            },
          });
        }

        if (endpoint.includes('/git/trees/')) {
          return Promise.resolve({
            tree: [{ path: 'file1.txt', type: 'blob' }],
          });
        }

        if (endpoint.includes('/contents/file1.txt')) {
          if (firstTry) {
            firstTry = false;
            // Simply throw an error, let the RateLimitHandler mock handle it
            throw new Response(null, { status: 403 });
          }

          return Promise.resolve({
            content: 'ZmlsZTEgY29udGVudA==', // Base64 for "file1 content"
          });
        }

        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      // Act
      await repoCloneService.cloneRepoContents(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo'
      );

      // Assert
      expect(mockFileService.writeFile).toHaveBeenCalledWith(
        'targetOwner',
        'targetRepo',
        'file1.txt',
        'file1 content',
        'main',
        'Copy file1.txt from sourceRepo'
      );
    });
  });
});
