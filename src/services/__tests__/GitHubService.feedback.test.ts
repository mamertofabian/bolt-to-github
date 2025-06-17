import { UnifiedGitHubService } from '../UnifiedGitHubService';
import { GitHubApiClient } from '../GitHubApiClient';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock the GitHubApiClient
jest.mock('../GitHubApiClient');
const MockedGitHubApiClient = GitHubApiClient as jest.MockedClass<typeof GitHubApiClient>;

// Mock AuthenticationStrategyFactory
jest.mock('../AuthenticationStrategyFactory', () => ({
  AuthenticationStrategyFactory: {
    getInstance: jest.fn(() => ({
      createPATStrategy: jest.fn(() => ({
        type: 'pat',
        getToken: jest.fn().mockResolvedValue('test-token'),
        validateAuth: jest.fn().mockResolvedValue({
          isValid: true,
          userInfo: { login: 'testuser', id: 123, avatar_url: 'test.jpg' },
          scopes: ['repo'],
        }),
        needsRenewal: jest.fn().mockResolvedValue(false),
        refreshToken: jest.fn().mockResolvedValue('refreshed-token'),
        getMetadata: jest.fn().mockResolvedValue({}),
        checkPermissions: jest.fn().mockResolvedValue({
          isValid: true,
          permissions: { allRepos: true, admin: true, contents: true },
        }),
      })),
      createGitHubAppStrategy: jest.fn(() => ({
        type: 'github_app',
        getToken: jest.fn().mockResolvedValue('github-app-token'),
        validateAuth: jest.fn().mockResolvedValue({
          isValid: true,
          userInfo: { login: 'testuser', id: 123, avatar_url: 'test.jpg' },
          scopes: ['repo'],
        }),
        needsRenewal: jest.fn().mockResolvedValue(false),
        refreshToken: jest.fn().mockResolvedValue('refreshed-token'),
        getMetadata: jest.fn().mockResolvedValue({}),
        checkPermissions: jest.fn().mockResolvedValue({
          isValid: true,
          permissions: { allRepos: true, admin: true, contents: true },
        }),
      })),
      getCurrentStrategy: jest.fn(),
    })),
  },
}));

describe('UnifiedGitHubService Feedback', () => {
  let githubService: UnifiedGitHubService;
  let mockApiClient: jest.Mocked<GitHubApiClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock instance
    mockApiClient = {
      request: jest.fn(),
      getRateLimit: jest.fn(),
    } as any;

    // Mock the constructor to return our mock instance
    MockedGitHubApiClient.mockImplementation(() => mockApiClient);

    githubService = new UnifiedGitHubService('test-token');
  });

  describe('createIssue', () => {
    it('should create an issue with correct parameters', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: 'Test Issue' };

      // Mock fetch directly since UnifiedGitHubService uses fetch, not GitHubApiClient
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockIssueResponse),
      });

      const result = await githubService.createIssue('owner', 'repo', {
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug', 'feedback'],
      });

      expect(global.fetch).toHaveBeenCalledWith(
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
      // Mock fetch for each test
      global.fetch = jest.fn();
    });

    it('should submit feedback as a GitHub issue with correct format', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: '[BUG] User Feedback' };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockIssueResponse),
      });

      const feedback = {
        category: 'bug' as const,
        message: 'This is a test bug report',
        metadata: {
          browserInfo: 'Chrome/91.0',
          extensionVersion: '1.0.0',
        },
      };

      const result = await githubService.submitFeedback(feedback);

      expect(global.fetch).toHaveBeenCalledWith(
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

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

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

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockIssueResponse),
      });

      const feedback = {
        category: 'appreciation' as const,
        message: 'Great extension!',
      };

      const result = await githubService.submitFeedback(feedback);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

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
        (global.fetch as jest.Mock).mockClear();
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ id: 1, number: 1 }),
        });

        const feedback = {
          category,
          message: `Test ${category} feedback`,
        };

        await githubService.submitFeedback(feedback);

        const callArgs = (global.fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(callArgs[1].body);

        expect(requestBody.title).toBe(`[${category.toUpperCase()}] User Feedback`);
        expect(requestBody.body).toContain(`**Category:** ${category}`);
        expect(requestBody.labels).toEqual(['feedback', category]);
      }
    });

    it('should handle API errors correctly', async () => {
      const apiError = new Error('GitHub API Error');
      (global.fetch as jest.Mock).mockRejectedValue(apiError);

      const feedback = {
        category: 'bug' as const,
        message: 'Test error handling',
      };

      await expect(githubService.submitFeedback(feedback)).rejects.toThrow('GitHub API Error');
    });

    it('should handle HTTP errors correctly', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });

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
