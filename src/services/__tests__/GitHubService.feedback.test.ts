import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { UnifiedGitHubService } from '../UnifiedGitHubService';

describe('UnifiedGitHubService Feedback', () => {
  let githubService: UnifiedGitHubService;
  let mockFetch: MockedFunction<typeof fetch>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFetch = vi.fn() as MockedFunction<typeof fetch>;
    global.fetch = mockFetch;

    githubService = new UnifiedGitHubService('test-token');
  });

  describe('createIssue', () => {
    it('should create an issue successfully', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: 'Test Issue' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssueResponse),
      } as unknown as Response);

      const result = await githubService.createIssue('owner', 'repo', {
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug', 'feedback'],
      });

      expect(result).toEqual(mockIssueResponse);
    });

    it('should include correct authorization header', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: 'Test Issue' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssueResponse),
      } as unknown as Response);

      await githubService.createIssue('owner', 'repo', {
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug', 'feedback'],
      });

      const [[, options]] = mockFetch.mock.calls;
      const headers = options?.headers as Record<string, string>;

      expect(headers.Authorization).toBe('Bearer test-token');
    });

    it('should use correct API endpoint', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: 'Test Issue' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssueResponse),
      } as unknown as Response);

      await githubService.createIssue('owner', 'repo', {
        title: 'Test Issue',
      });

      const [[url]] = mockFetch.mock.calls;

      expect(url).toBe('https://api.github.com/repos/owner/repo/issues');
    });

    it('should send correct request body format', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: 'Test Issue' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssueResponse),
      } as unknown as Response);

      await githubService.createIssue('owner', 'repo', {
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug', 'feedback'],
      });

      const [[, options]] = mockFetch.mock.calls;
      const requestBody = JSON.parse(options?.body as string);

      expect(requestBody).toEqual({
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug', 'feedback'],
        assignees: [],
      });
    });

    it('should handle missing optional fields', async () => {
      const mockIssueResponse = { id: 123, number: 1, title: 'Test Issue' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssueResponse),
      } as unknown as Response);

      await githubService.createIssue('owner', 'repo', {
        title: 'Test Issue',
      });

      const [[, options]] = mockFetch.mock.calls;
      const requestBody = JSON.parse(options?.body as string);

      expect(requestBody.body).toBe('');
      expect(requestBody.labels).toEqual([]);
      expect(requestBody.assignees).toEqual([]);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      } as unknown as Response);

      await expect(
        githubService.createIssue('owner', 'repo', {
          title: 'Test Issue',
        })
      ).rejects.toThrow('Failed to create issue: Unauthorized');
    });
  });

  describe('submitFeedback', () => {
    it('should submit bug feedback with correct title and body format', async () => {
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

      const [[, options]] = mockFetch.mock.calls;
      const requestBody = JSON.parse(options?.body as string);

      expect(requestBody.title).toBe('[BUG] User Feedback');
      expect(requestBody.body).toContain('## User Feedback');
      expect(requestBody.body).toContain('**Category:** bug');
      expect(requestBody.body).toContain('**Message:**\nThis is a test bug report');
      expect(requestBody.body).toContain('**Extension Version:** 1.0.0');
      expect(requestBody.body).toContain('**Browser Info:** Chrome/91.0');
      expect(requestBody.labels).toEqual(['feedback', 'bug']);
      expect(result).toEqual(mockIssueResponse);
    });

    it('should submit appreciation feedback without metadata', async () => {
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

      const [[, options]] = mockFetch.mock.calls;
      const requestBody = JSON.parse(options?.body as string);

      expect(requestBody.title).toBe('[APPRECIATION] User Feedback');
      expect(requestBody.body).toContain('## User Feedback');
      expect(requestBody.body).toContain('**Category:** appreciation');
      expect(requestBody.body).toContain('**Message:**\nGreat extension!');
      expect(requestBody.body).not.toContain('**Contact:**');
      expect(requestBody.body).not.toContain('**Extension Version:**');
      expect(requestBody.labels).toEqual(['feedback', 'appreciation']);
      expect(result).toEqual(mockIssueResponse);
    });

    it('should use correct repository for feedback submission', async () => {
      const mockIssueResponse = { id: 1, number: 1 };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssueResponse),
      } as unknown as Response);

      await githubService.submitFeedback({
        category: 'bug' as const,
        message: 'Test message',
      });

      const [[url]] = mockFetch.mock.calls;

      expect(url).toBe('https://api.github.com/repos/mamertofabian/bolt-to-github/issues');
    });

    it('should handle question category correctly', async () => {
      const mockResponse = { id: 1, number: 1 };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      await githubService.submitFeedback({
        category: 'question',
        message: 'Test question feedback',
      });

      const [[, options]] = mockFetch.mock.calls;
      const requestBody = JSON.parse(options?.body as string);

      expect(requestBody.title).toBe('[QUESTION] User Feedback');
      expect(requestBody.body).toContain('**Category:** question');
      expect(requestBody.labels).toEqual(['feedback', 'question']);
    });

    it('should handle feature category correctly', async () => {
      const mockResponse = { id: 1, number: 1 };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      await githubService.submitFeedback({
        category: 'feature',
        message: 'Test feature feedback',
      });

      const [[, options]] = mockFetch.mock.calls;
      const requestBody = JSON.parse(options?.body as string);

      expect(requestBody.title).toBe('[FEATURE] User Feedback');
      expect(requestBody.body).toContain('**Category:** feature');
      expect(requestBody.labels).toEqual(['feedback', 'feature']);
    });

    it('should handle other category correctly', async () => {
      const mockResponse = { id: 1, number: 1 };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      await githubService.submitFeedback({
        category: 'other',
        message: 'Test other feedback',
      });

      const [[, options]] = mockFetch.mock.calls;
      const requestBody = JSON.parse(options?.body as string);

      expect(requestBody.title).toBe('[OTHER] User Feedback');
      expect(requestBody.body).toContain('**Category:** other');
      expect(requestBody.labels).toEqual(['feedback', 'other']);
    });

    it('should throw error on network failure', async () => {
      const apiError = new Error('GitHub API Error');
      mockFetch.mockRejectedValue(apiError);

      const feedback = {
        category: 'bug' as const,
        message: 'Test error handling',
      };

      await expect(githubService.submitFeedback(feedback)).rejects.toThrow('GitHub API Error');
    });

    it('should throw error on HTTP error response', async () => {
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
