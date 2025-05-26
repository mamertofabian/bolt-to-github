import { GitHubService } from '../GitHubService';
import { GitHubApiClient } from '../GitHubApiClient';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock the GitHubApiClient
jest.mock('../GitHubApiClient');
const MockedGitHubApiClient = GitHubApiClient as jest.MockedClass<typeof GitHubApiClient>;

describe('GitHubService Feedback', () => {
  let githubService: GitHubService;
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

    githubService = new GitHubService('test-token');
  });

  describe('createIssue', () => {
    it('should create an issue with correct parameters', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: 'Test Issue' };
      mockApiClient.request.mockResolvedValue(mockIssueResponse);

      const issueData = {
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug', 'feedback'],
        assignees: ['testuser'],
      };

      const result = await githubService.createIssue('owner', 'repo', issueData);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'POST',
        '/repos/owner/repo/issues',
        issueData
      );
      expect(result).toEqual(mockIssueResponse);
    });
  });

  describe('submitFeedback', () => {
    it('should submit feedback as a GitHub issue with correct format', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: '[BUG] User Feedback' };
      mockApiClient.request.mockResolvedValue(mockIssueResponse);

      const feedback = {
        category: 'bug' as const,
        message: 'This is a test bug report',
        email: 'test@example.com',
        metadata: {
          browserInfo: 'Chrome/91.0',
          extensionVersion: '1.0.0',
        },
      };

      const result = await githubService.submitFeedback(feedback);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'POST',
        '/repos/mamertofabian/bolt-to-github/issues',
        {
          title: '[BUG] User Feedback',
          body: expect.stringContaining('## User Feedback'),
          labels: ['feedback', 'bug'],
        }
      );

      const calledWith = mockApiClient.request.mock.calls[0][2];
      expect(calledWith.body).toContain('**Category:** bug');
      expect(calledWith.body).toContain('**Message:**\nThis is a test bug report');
      expect(calledWith.body).toContain('**Contact:** test@example.com');
      expect(calledWith.body).toContain('**Extension Version:** 1.0.0');
      expect(calledWith.body).toContain('**Browser Info:** Chrome/91.0');

      expect(result).toEqual(mockIssueResponse);
    });

    it('should submit feedback without optional fields', async () => {
      const mockIssueResponse = { id: 124, number: 2, title: '[APPRECIATION] User Feedback' };
      mockApiClient.request.mockResolvedValue(mockIssueResponse);

      const feedback = {
        category: 'appreciation' as const,
        message: 'Great extension!',
      };

      const result = await githubService.submitFeedback(feedback);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'POST',
        '/repos/mamertofabian/bolt-to-github/issues',
        {
          title: '[APPRECIATION] User Feedback',
          body: expect.stringContaining('## User Feedback'),
          labels: ['feedback', 'appreciation'],
        }
      );

      const calledWith = mockApiClient.request.mock.calls[0][2];
      expect(calledWith.body).toContain('**Category:** appreciation');
      expect(calledWith.body).toContain('**Message:**\nGreat extension!');
      expect(calledWith.body).not.toContain('**Contact:**');
      expect(calledWith.body).not.toContain('**Extension Version:**');

      expect(result).toEqual(mockIssueResponse);
    });

    it('should handle all feedback categories correctly', async () => {
      const categories = ['appreciation', 'question', 'bug', 'feature', 'other'] as const;

      for (const category of categories) {
        mockApiClient.request.mockClear();
        mockApiClient.request.mockResolvedValue({ id: 1, number: 1 });

        const feedback = {
          category,
          message: `Test ${category} feedback`,
        };

        await githubService.submitFeedback(feedback);

        expect(mockApiClient.request).toHaveBeenCalledWith(
          'POST',
          '/repos/mamertofabian/bolt-to-github/issues',
          {
            title: `[${category.toUpperCase()}] User Feedback`,
            body: expect.stringContaining(`**Category:** ${category}`),
            labels: ['feedback', category],
          }
        );
      }
    });

    it('should handle API errors correctly', async () => {
      const apiError = new Error('GitHub API Error');
      mockApiClient.request.mockRejectedValue(apiError);

      const feedback = {
        category: 'bug' as const,
        message: 'Test error handling',
      };

      await expect(githubService.submitFeedback(feedback)).rejects.toThrow('GitHub API Error');
    });

    it('should handle authentication errors (401) correctly', async () => {
      const authError = new Error('GitHub API Error (401): Bad credentials');
      mockApiClient.request.mockRejectedValue(authError);

      const feedback = {
        category: 'bug' as const,
        message: 'Test authentication error',
      };

      await expect(githubService.submitFeedback(feedback)).rejects.toThrow(
        'GitHub API Error (401): Bad credentials'
      );
    });

    it('should handle unauthorized errors correctly', async () => {
      const unauthorizedError = new Error('Unauthorized access');
      mockApiClient.request.mockRejectedValue(unauthorizedError);

      const feedback = {
        category: 'feature' as const,
        message: 'Test unauthorized error',
      };

      await expect(githubService.submitFeedback(feedback)).rejects.toThrow('Unauthorized access');
    });
  });
});
