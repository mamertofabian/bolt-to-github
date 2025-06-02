import { GitHubAppsApiClient } from '../GitHubAppsApiClient';
import { GitHubAppsService } from '../../content/services/GitHubAppsService';
import { GitHubApiError } from '../GitHubApiClient';

// Mock GitHubAppsService
jest.mock('../../content/services/GitHubAppsService');

describe('GitHubAppsApiClient', () => {
  let apiClient: GitHubAppsApiClient;
  let mockGitHubAppsService: jest.Mocked<GitHubAppsService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock service
    mockGitHubAppsService = {
      apiRequest: jest.fn(),
      getRateLimitStatus: jest.fn(),
    } as any;

    // Mock the getInstance method
    (GitHubAppsService.getInstance as jest.Mock).mockReturnValue(mockGitHubAppsService);

    apiClient = new GitHubAppsApiClient();
  });

  describe('constructor', () => {
    it('should create instance with default base URL', () => {
      expect(apiClient).toBeInstanceOf(GitHubAppsApiClient);
    });

    it('should create instance with custom base URL', () => {
      const customClient = new GitHubAppsApiClient('https://api.github.example.com');
      expect(customClient).toBeInstanceOf(GitHubAppsApiClient);
    });
  });

  describe('request method', () => {
    it('should make successful GET request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockImplementation((name: string) => {
            if (name === 'content-length') return '100';
            return 'application/json';
          }),
        },
        json: jest.fn().mockResolvedValue({ id: 1, name: 'test' }),
      } as any;
      mockGitHubAppsService.apiRequest.mockResolvedValue(mockResponse);

      const result = await apiClient.request('GET', '/user');

      expect(mockGitHubAppsService.apiRequest).toHaveBeenCalledWith(
        'https://api.github.com/user',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          body: undefined,
        },
        'repo_intensive'
      );
      expect(result).toEqual({ id: 1, name: 'test' });
    });

    it('should make successful POST request with body', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        headers: {
          get: jest.fn().mockImplementation((name: string) => {
            if (name === 'content-length') return '100';
            return 'application/json';
          }),
        },
        json: jest.fn().mockResolvedValue({ id: 2, title: 'New Issue' }),
      } as any;
      mockGitHubAppsService.apiRequest.mockResolvedValue(mockResponse);

      const result = await apiClient.request('POST', '/repos/owner/repo/issues', {
        title: 'Test Issue',
        body: 'Test body',
      });

      expect(mockGitHubAppsService.apiRequest).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/issues',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: 'Test Issue',
            body: 'Test body',
          }),
        },
        'user_action' // Issues should use user_action type
      );
      expect(result).toEqual({ id: 2, title: 'New Issue' });
    });

    it('should handle 204 No Content response', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
      } as any;
      mockGitHubAppsService.apiRequest.mockResolvedValue(mockResponse);

      const result = await apiClient.request('DELETE', '/repos/owner/repo');

      expect(result).toBeNull();
    });

    it('should throw GitHubApiError for failed requests', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        json: jest.fn().mockResolvedValue({ message: 'Not Found' }),
      } as any;
      mockGitHubAppsService.apiRequest.mockResolvedValue(mockResponse);

      await expect(apiClient.request('GET', '/repos/nonexistent/repo')).rejects.toThrow(
        GitHubApiError
      );
    });

    it('should determine operation type correctly for user actions', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockImplementation((name: string) => {
            if (name === 'content-length') return '100';
            return null;
          }),
        },
        json: jest.fn().mockResolvedValue({}),
      } as any;
      mockGitHubAppsService.apiRequest.mockResolvedValue(mockResponse);

      // Test issue creation (should be user_action)
      await apiClient.request('POST', '/repos/owner/repo/issues', {});
      expect(mockGitHubAppsService.apiRequest).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(Object),
        'user_action'
      );

      // Test repository listing (should be repo_intensive)
      await apiClient.request('GET', '/user/repos', {});
      expect(mockGitHubAppsService.apiRequest).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(Object),
        'repo_intensive'
      );
    });
  });

  describe('getRateLimit method', () => {
    it('should fetch rate limit information', async () => {
      const rateLimitData = {
        rate: {
          limit: 12500,
          remaining: 14000,
          reset: 1640995200,
        },
      };
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockImplementation((name: string) => {
            if (name === 'content-length') return '100';
            return 'application/json';
          }),
        },
        json: jest.fn().mockResolvedValue(rateLimitData),
      } as any;
      mockGitHubAppsService.apiRequest.mockResolvedValue(mockResponse);

      const result = await apiClient.getRateLimit();

      expect(mockGitHubAppsService.apiRequest).toHaveBeenCalledWith(
        'https://api.github.com/rate_limit',
        expect.any(Object),
        'repo_intensive'
      );
      expect(result).toEqual(rateLimitData);
    });
  });

  describe('getTokenStatus method', () => {
    it('should return token status information', async () => {
      const mockRateLimitStatus = {
        user: { limit: 5000, remaining: 4000, reset: 1640995200, used: 1000 },
        installation: { limit: 12500, remaining: 14000, reset: 1640995200, used: 1000 },
      };
      mockGitHubAppsService.getRateLimitStatus.mockResolvedValue(mockRateLimitStatus);

      const result = await apiClient.getTokenStatus();

      expect(result).toEqual({
        hasGitHubApp: true,
        hasPAT: true,
        currentRateLimit: mockRateLimitStatus.installation,
        recommendedToken: 'github_app',
      });
    });

    it('should handle case when only PAT is available', async () => {
      const mockRateLimitStatus = {
        user: { limit: 5000, remaining: 4000, reset: 1640995200, used: 1000 },
        installation: null,
      };
      mockGitHubAppsService.getRateLimitStatus.mockResolvedValue(mockRateLimitStatus);

      const result = await apiClient.getTokenStatus();

      expect(result).toEqual({
        hasGitHubApp: false,
        hasPAT: true,
        currentRateLimit: mockRateLimitStatus.user,
        recommendedToken: 'pat',
      });
    });
  });
});
