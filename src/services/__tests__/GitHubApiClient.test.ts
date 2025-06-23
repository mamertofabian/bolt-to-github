/* eslint-disable @typescript-eslint/no-explicit-any */
import { GitHubApiClient, GitHubApiError } from '../GitHubApiClient';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Create a mock for the global fetch function
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    headers: new Headers(),
  })
) as unknown as typeof global.fetch;

// Helper to create mock responses
const createMockResponse = (status: number, data: any, headers: Record<string, string> = {}) => {
  const headersObj = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    headersObj.append(key, value);
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: jest.fn<() => Promise<any>>().mockResolvedValue(data),
    headers: headersObj,
  } as unknown as Response;
};

describe('GitHubApiClient', () => {
  let client: GitHubApiClient;

  beforeEach(() => {
    // Create a new client instance before each test
    client = new GitHubApiClient('test-token');

    // Reset the fetch mock
    jest.clearAllMocks();
  });

  describe('request', () => {
    it('should make a successful request', async () => {
      // Arrange
      const mockData = { name: 'test-repo' };
      const mockResponse = createMockResponse(200, mockData);
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await client.request('GET', '/repos/test-user/test-repo');

      // Assert
      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-user/test-repo',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            Accept: 'application/vnd.github.v3+json',
          }),
        })
      );
    });

    it('should handle 204 No Content responses', async () => {
      // Arrange
      const mockResponse = createMockResponse(204, null);
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await client.request('DELETE', '/repos/test-user/test-repo');

      // Assert
      expect(result).toBeNull();
    });

    it('should throw GitHubApiError for error responses', async () => {
      // Arrange
      const errorData = { message: 'Not Found' };
      const mockResponse = createMockResponse(404, errorData);
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(mockResponse);

      // Act
      let error: any;
      try {
        await client.request('GET', '/repos/test-user/non-existent');
      } catch (e) {
        error = e;
      }

      // Assert
      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(GitHubApiError);
      expect(error.status).toBe(404);
      expect(error.originalMessage).toBe('Not Found');
    });

    it('should handle rate limiting and retry', async () => {
      // Arrange
      const rateLimitResponse = createMockResponse(
        403,
        { message: 'API rate limit exceeded' },
        {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': `${Math.floor(Date.now() / 1000) + 1}`, // 1 second from now
        }
      );

      const successResponse = createMockResponse(200, { success: true });

      // First call hits rate limit, second call succeeds
      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse);

      // Act
      const result = await client.request('GET', '/user');

      // Assert
      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle network errors', async () => {
      // Arrange
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error')
      );

      // Act & Assert
      await expect(client.request('GET', '/user')).rejects.toThrow(
        'GitHub API request failed: Network error'
      );
    });
  });

  describe('getRateLimit', () => {
    it('should fetch rate limit information', async () => {
      // Arrange
      const mockData = {
        resources: {
          core: { limit: 5000, used: 0, remaining: 5000, reset: 1589720233 },
          search: { limit: 30, used: 0, remaining: 30, reset: 1589720233 },
        },
        rate: { limit: 5000, used: 0, remaining: 5000, reset: 1589720233 },
      };

      const mockResponse = createMockResponse(200, mockData);
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await client.getRateLimit();

      // Assert
      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/rate_limit',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });
});
