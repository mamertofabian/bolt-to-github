/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoCloneService } from '../RepoCloneService';
import type { IFileService } from '../interfaces/IFileService';
import type { IGitHubApiClient } from '../interfaces/IGitHubApiClient';

vi.mock('../RateLimitHandler', () => {
  return {
    RateLimitHandler: vi.fn().mockImplementation(() => {
      return {
        beforeRequest: vi.fn().mockResolvedValue({} as never),
        handleRateLimit: vi.fn().mockResolvedValue({} as never),
        resetRequestCount: vi.fn(),
        resetRetryCount: vi.fn(),
        sleep: vi.fn().mockImplementation((_ms) => Promise.resolve()),
      };
    }),
  };
});

describe('RepoCloneService', () => {
  let mockApiClient: any;
  let mockFileService: any;
  let repoCloneService: RepoCloneService;

  beforeEach(() => {
    mockApiClient = {
      request: vi.fn(),
      getRateLimit: vi.fn(),
      token: 'test-token',
    };

    mockFileService = {
      writeFile: vi.fn().mockResolvedValue({} as never),
      readFile: vi.fn(),
      deleteFile: vi.fn(),
      listFiles: vi.fn(),
      getFileInfo: vi.fn(),
      fileExists: vi.fn(),
      createDirectory: vi.fn(),
    };

    repoCloneService = new RepoCloneService(
      mockApiClient as IGitHubApiClient,
      mockFileService as IFileService
    );
  });

  describe('cloneRepoContents', () => {
    it('should clone files from source repository to target repository', async () => {
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
            content: 'ZmlsZTEgY29udGVudA==',
          });
        }

        if (endpoint.includes('/contents/file2.txt')) {
          return Promise.resolve({
            content: 'ZmlsZTIgY29udGVudA==',
          });
        }

        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      const onProgressMock = vi.fn();
      await repoCloneService.cloneRepoContents(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo',
        'main',
        onProgressMock
      );

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

            throw new Response(null, { status: 403 });
          }

          return Promise.resolve({
            content: 'ZmlsZTEgY29udGVudA==',
          });
        }

        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      await repoCloneService.cloneRepoContents(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo'
      );

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
