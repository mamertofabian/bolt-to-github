import {
  beforeEach,
  describe,
  expect,
  it,
  type Mocked,
  type MockedClass,
  type MockedFunction,
  vi,
} from 'vitest';
import { GitHubApiClient } from '../GitHubApiClient';
import { UnifiedGitHubService } from '../UnifiedGitHubService';
import type { IAuthenticationStrategy } from '../interfaces/IAuthenticationStrategy';
import type {
  AuthenticationType,
  PermissionCheckResult,
  TokenValidationResult,
} from '../types/authentication';

// Mock the GitHubApiClient
vi.mock('../GitHubApiClient');
const MockedGitHubApiClient = GitHubApiClient as MockedClass<typeof GitHubApiClient>;

// Create proper mock implementations for the authentication strategies
const createMockPATStrategy = (): IAuthenticationStrategy => ({
  type: 'pat' as AuthenticationType,
  isConfigured: vi.fn().mockResolvedValue(true),
  getToken: vi.fn().mockResolvedValue('test-token'),
  validateAuth: vi.fn().mockResolvedValue({
    isValid: true,
    userInfo: { login: 'testuser', id: 123, avatar_url: 'test.jpg' },
    scopes: ['repo'],
  } as TokenValidationResult),
  needsRenewal: vi.fn().mockResolvedValue(false),
  refreshToken: vi.fn().mockResolvedValue('refreshed-token'),
  getMetadata: vi.fn().mockResolvedValue({}),
  checkPermissions: vi.fn().mockResolvedValue({
    isValid: true,
    permissions: { allRepos: true, admin: true, contents: true },
  } as PermissionCheckResult),
  clearAuth: vi.fn().mockResolvedValue(undefined),
  getUserInfo: vi.fn().mockResolvedValue({ login: 'testuser', id: 123, avatar_url: 'test.jpg' }),
});

const createMockGitHubAppStrategy = (): IAuthenticationStrategy => ({
  type: 'github_app' as AuthenticationType,
  isConfigured: vi.fn().mockResolvedValue(true),
  getToken: vi.fn().mockResolvedValue('github-app-token'),
  validateAuth: vi.fn().mockResolvedValue({
    isValid: true,
    userInfo: { login: 'testuser', id: 123, avatar_url: 'test.jpg' },
    scopes: ['repo'],
  } as TokenValidationResult),
  needsRenewal: vi.fn().mockResolvedValue(false),
  refreshToken: vi.fn().mockResolvedValue('refreshed-token'),
  getMetadata: vi.fn().mockResolvedValue({}),
  checkPermissions: vi.fn().mockResolvedValue({
    isValid: true,
    permissions: { allRepos: true, admin: true, contents: true },
  } as PermissionCheckResult),
  clearAuth: vi.fn().mockResolvedValue(undefined),
  getUserInfo: vi.fn().mockResolvedValue({ login: 'testuser', id: 123, avatar_url: 'test.jpg' }),
});

// Mock AuthenticationStrategyFactory
vi.mock('../AuthenticationStrategyFactory', () => ({
  AuthenticationStrategyFactory: {
    getInstance: vi.fn(() => ({
      createPATStrategy: vi.fn(() => createMockPATStrategy()),
      createGitHubAppStrategy: vi.fn(() => createMockGitHubAppStrategy()),
      getCurrentStrategy: vi.fn(),
    })),
  },
}));

describe('UnifiedGitHubService Feedback', () => {
  let githubService: UnifiedGitHubService;
  let mockApiClient: Mocked<GitHubApiClient>;
  let mockFetch: MockedFunction<typeof fetch>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock instance
    mockApiClient = {
      request: vi.fn(),
      getRateLimit: vi.fn(),
    } as unknown as Mocked<GitHubApiClient>;

    // Mock the constructor to return our mock instance
    MockedGitHubApiClient.mockImplementation(() => mockApiClient);

    // Setup fetch mock
    mockFetch = vi.fn() as MockedFunction<typeof fetch>;
    global.fetch = mockFetch;

    githubService = new UnifiedGitHubService('test-token');
  });

  describe('createIssue', () => {
    it('should create an issue with correct parameters', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: 'Test Issue' };

      // Mock fetch to return a proper Response-like object
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssueResponse),
      } as unknown as Response);

      const result = await githubService.createIssue('owner', 'repo', {
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug', 'feedback'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/issues',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            title: 'Test Issue',
            body: 'Test body',
            labels: ['bug', 'feedback'],
            assignees: [],
          }),
        })
      );
      expect(result).toEqual(mockIssueResponse);
    });
  });

  describe('submitFeedback', () => {
    beforeEach(() => {
      // Reset fetch mock for each test
      mockFetch.mockClear();
    });

    it('should submit feedback as a GitHub issue with correct format', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: '[BUG] User Feedback' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssueResponse),
      } as unknown as Response);

      const feedback = {
        category: 'bug' as const,
        message: 'This is a test bug report',
        metadata: {
          browserInfo: 'Chrome/91.0',
          extensionVersion: '1.0.0',
        },
      };

      const result = await githubService.submitFeedback(feedback);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/mamertofabian/bolt-to-github/issues',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"title":"[BUG] User Feedback"'),
        })
      );

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs?.[1]?.body as string);

      expect(requestBody.title).toBe('[BUG] User Feedback');
      expect(requestBody.body).toContain('## User Feedback');
      expect(requestBody.body).toContain('**Category:** bug');
      expect(requestBody.body).toContain('**Message:**\nThis is a test bug report');
      expect(requestBody.body).not.toContain('**Contact:**');
      expect(requestBody.body).toContain('**Extension Version:** 1.0.0');
      expect(requestBody.body).toContain('**Browser Info:** Chrome/91.0');
      expect(requestBody.labels).toEqual(['feedback', 'bug']);

      expect(result).toEqual(mockIssueResponse);
    });

    it('should submit feedback without optional fields', async () => {
      const mockIssueResponse = { id: 124, number: 2, title: '[APPRECIATION] User Feedback' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssueResponse),
      } as unknown as Response);

      const feedback = {
        category: 'appreciation' as const,
        message: 'Great extension!',
      };

      const result = await githubService.submitFeedback(feedback);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs?.[1]?.body as string);

      expect(requestBody.title).toBe('[APPRECIATION] User Feedback');
      expect(requestBody.body).toContain('## User Feedback');
      expect(requestBody.body).toContain('**Category:** appreciation');
      expect(requestBody.body).toContain('**Message:**\nGreat extension!');
      expect(requestBody.body).not.toContain('**Contact:**');
      expect(requestBody.body).not.toContain('**Extension Version:**');
      expect(requestBody.labels).toEqual(['feedback', 'appreciation']);

      expect(result).toEqual(mockIssueResponse);
    });

    it('should handle all feedback categories correctly', async () => {
      const categories = ['appreciation', 'question', 'bug', 'feature', 'other'] as const;

      for (const category of categories) {
        mockFetch.mockClear();
        const mockResponse = { id: 1, number: 1 };
        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockResponse),
        } as unknown as Response);

        const feedback = {
          category,
          message: `Test ${category} feedback`,
        };

        await githubService.submitFeedback(feedback);

        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs?.[1]?.body as string);

        expect(requestBody.title).toBe(`[${category.toUpperCase()}] User Feedback`);
        expect(requestBody.body).toContain(`**Category:** ${category}`);
        expect(requestBody.labels).toEqual(['feedback', category]);
      }
    });

    it('should handle API errors correctly', async () => {
      const apiError = new Error('GitHub API Error');
      mockFetch.mockRejectedValue(apiError);

      const feedback = {
        category: 'bug' as const,
        message: 'Test error handling',
      };

      await expect(githubService.submitFeedback(feedback)).rejects.toThrow('GitHub API Error');
    });

    it('should handle HTTP errors correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      } as unknown as Response);

      const feedback = {
        category: 'bug' as const,
        message: 'Test authentication error',
      };

      await expect(githubService.submitFeedback(feedback)).rejects.toThrow(
        'Failed to create issue: Unauthorized'
      );
    });
  });
});
