import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { RepoCloneService } from '../RepoCloneService';
import type { IFileService } from '../interfaces/IFileService';
import type { IGitHubApiClient } from '../interfaces/IGitHubApiClient';
import type { Mock } from 'vitest';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();
const FIXED_UNIX_TIME = Math.floor(FIXED_TIME / 1000);

vi.mock('../RateLimitHandler', () => {
  return {
    RateLimitHandler: vi.fn().mockImplementation(() => {
      return {
        beforeRequest: vi.fn().mockResolvedValue(undefined),
        handleRateLimit: vi.fn().mockResolvedValue(undefined),
        resetRequestCount: vi.fn(),
        resetRetryCount: vi.fn(),
        sleep: vi.fn().mockImplementation((_ms) => Promise.resolve()),
      };
    }),
  };
});

describe('RepoCloneService', () => {
  let mockApiClient: {
    request: Mock;
    getRateLimit: Mock;
    token: string;
  };
  let mockFileService: {
    writeFile: Mock;
    readFile: Mock;
    deleteFile: Mock;
    listFiles: Mock;
    getFileInfo: Mock;
    fileExists: Mock;
    createDirectory: Mock;
  };
  let repoCloneService: RepoCloneService;

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });

    mockApiClient = {
      request: vi.fn(),
      getRateLimit: vi.fn(),
      token: 'test-token',
    };

    mockFileService = {
      writeFile: vi.fn().mockResolvedValue(undefined),
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

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('cloneRepoContents', () => {
    it('should successfully clone multiple files from source to target repository', async () => {
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 4500,
                reset: FIXED_UNIX_TIME + 3600,
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

      await repoCloneService.cloneRepoContents(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo',
        'main'
      );

      const writeFileCalls = mockFileService.writeFile.mock.calls;
      expect(writeFileCalls).toHaveLength(2);

      const file1Call = writeFileCalls.find((call) => call[2] === 'file1.txt');
      expect(file1Call).toBeDefined();
      expect(file1Call?.[0]).toBe('targetOwner');
      expect(file1Call?.[1]).toBe('targetRepo');
      expect(file1Call?.[3]).toBe('file1 content');
      expect(file1Call?.[4]).toBe('main');
      expect(file1Call?.[5]).toBe('Copy file1.txt from sourceRepo');

      const file2Call = writeFileCalls.find((call) => call[2] === 'file2.txt');
      expect(file2Call).toBeDefined();
      expect(file2Call?.[0]).toBe('targetOwner');
      expect(file2Call?.[1]).toBe('targetRepo');
      expect(file2Call?.[3]).toBe('file2 content');
      expect(file2Call?.[4]).toBe('main');
      expect(file2Call?.[5]).toBe('Copy file2.txt from sourceRepo');
    });

    it('should report progress during cloning operation', async () => {
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 4500,
                reset: FIXED_UNIX_TIME + 3600,
              },
            },
          });
        }

        if (endpoint.includes('/git/trees/')) {
          return Promise.resolve({
            tree: [
              { path: 'file1.txt', type: 'blob' },
              { path: 'file2.txt', type: 'blob' },
            ],
          });
        }

        if (endpoint.includes('/contents/')) {
          return Promise.resolve({
            content: 'dGVzdA==',
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

      expect(onProgressMock).toHaveBeenCalled();
      const progressValues = onProgressMock.mock.calls.map((call) => call[0]);

      expect(progressValues[0]).toBeGreaterThan(0);
      expect(progressValues[progressValues.length - 1]).toBe(100);

      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
    });

    it('should only clone blob files and skip directories', async () => {
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 4500,
                reset: FIXED_UNIX_TIME + 3600,
              },
            },
          });
        }

        if (endpoint.includes('/git/trees/')) {
          return Promise.resolve({
            tree: [
              { path: 'file1.txt', type: 'blob' },
              { path: 'directory1', type: 'tree' },
              { path: 'directory2', type: 'tree' },
              { path: 'file2.txt', type: 'blob' },
            ],
          });
        }

        if (endpoint.includes('/contents/')) {
          return Promise.resolve({
            content: 'dGVzdA==',
          });
        }

        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      await repoCloneService.cloneRepoContents(
        'sourceOwner',
        'sourceRepo',
        'targetOwner',
        'targetRepo',
        'main'
      );

      expect(mockFileService.writeFile).toHaveBeenCalledTimes(2);
      const writeFileCalls = mockFileService.writeFile.mock.calls;
      const filePaths = writeFileCalls.map((call) => call[2]);
      expect(filePaths).toContain('file1.txt');
      expect(filePaths).toContain('file2.txt');
      expect(filePaths).not.toContain('directory1');
      expect(filePaths).not.toContain('directory2');
    });

    it('should retry on 403 rate limit errors and eventually succeed', async () => {
      let firstTry = true;
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 4500,
                reset: FIXED_UNIX_TIME + 60,
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

      expect(mockFileService.writeFile).toHaveBeenCalledTimes(1);
      const writeCall = mockFileService.writeFile.mock.calls[0];
      expect(writeCall[2]).toBe('file1.txt');
      expect(writeCall[3]).toBe('file1 content');
    });

    it('should throw error when rate limit is insufficient and reset time is too far', async () => {
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 5,
                reset: FIXED_UNIX_TIME + 7200,
              },
            },
          });
        }

        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      await expect(
        repoCloneService.cloneRepoContents('sourceOwner', 'sourceRepo', 'targetOwner', 'targetRepo')
      ).rejects.toThrow(/Insufficient API rate limit remaining/);
    });

    it('should wait for rate limit reset when it is within 2 minutes', async () => {
      let rateLimitCheckCount = 0;
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          rateLimitCheckCount++;
          if (rateLimitCheckCount === 1) {
            return Promise.resolve({
              resources: {
                core: {
                  limit: 5000,
                  remaining: 5,
                  reset: FIXED_UNIX_TIME + 60,
                },
              },
            });
          } else {
            return Promise.resolve({
              resources: {
                core: {
                  limit: 5000,
                  remaining: 4500,
                  reset: FIXED_UNIX_TIME + 3600,
                },
              },
            });
          }
        }

        if (endpoint.includes('/git/trees/')) {
          return Promise.resolve({
            tree: [{ path: 'file1.txt', type: 'blob' }],
          });
        }

        if (endpoint.includes('/contents/')) {
          return Promise.resolve({
            content: 'dGVzdA==',
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

      const rateLimitCalls = mockApiClient.request.mock.calls.filter(
        (call) => call[1] === '/rate_limit'
      );
      expect(rateLimitCalls.length).toBeGreaterThanOrEqual(2);

      expect(mockFileService.writeFile).toHaveBeenCalledTimes(1);
    });

    it('should throw error when rate limit is still insufficient after waiting', async () => {
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 5,
                reset: FIXED_UNIX_TIME + 60,
              },
            },
          });
        }

        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      await expect(
        repoCloneService.cloneRepoContents('sourceOwner', 'sourceRepo', 'targetOwner', 'targetRepo')
      ).rejects.toThrow(/Insufficient API rate limit remaining/);
    });

    it('should throw error when repository tree fetch fails', async () => {
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 4500,
                reset: FIXED_UNIX_TIME + 3600,
              },
            },
          });
        }

        if (endpoint.includes('/git/trees/')) {
          throw new Error('Repository not found');
        }

        return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
      });

      await expect(
        repoCloneService.cloneRepoContents('sourceOwner', 'sourceRepo', 'targetOwner', 'targetRepo')
      ).rejects.toThrow(/Failed to clone repository contents/);
    });

    it('should use default branch "main" when branch is not specified', async () => {
      mockApiClient.request.mockImplementation((method: string, endpoint: string) => {
        if (endpoint === '/rate_limit') {
          return Promise.resolve({
            resources: {
              core: {
                limit: 5000,
                remaining: 4500,
                reset: FIXED_UNIX_TIME + 3600,
              },
            },
          });
        }

        if (endpoint.includes('/git/trees/main?recursive=1')) {
          return Promise.resolve({
            tree: [{ path: 'file1.txt', type: 'blob' }],
          });
        }

        if (endpoint.includes('/contents/')) {
          return Promise.resolve({
            content: 'dGVzdA==',
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

      const treeFetchCall = mockApiClient.request.mock.calls.find((call) =>
        call[1].includes('/git/trees/main?recursive=1')
      );
      expect(treeFetchCall).toBeDefined();

      const writeCall = mockFileService.writeFile.mock.calls[0];
      expect(writeCall[4]).toBe('main');
    });
  });
});
