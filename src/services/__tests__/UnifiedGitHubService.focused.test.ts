/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Focused Test Suite for UnifiedGitHubService
 *
 * This test file focuses on the most critical functionality with reliable testing patterns.
 * It covers the core use cases that work consistently with our test fixtures.
 */

import { UnifiedGitHubService } from '../UnifiedGitHubService';
import {
  TestFixtures,
  MockFetchResponseBuilder,
  MockChromeStorage,
  UnifiedGitHubServiceTestHelpers,
  MockPATAuthenticationStrategy,
  MockGitHubAppAuthenticationStrategy,
} from './test-fixtures';

// Mock the AuthenticationStrategyFactory with controlled behavior
const mockPATStrategy = new MockPATAuthenticationStrategy(TestFixtures.TokenFixtures.pat.classic);
const mockGitHubAppStrategy = new MockGitHubAppAuthenticationStrategy(
  TestFixtures.TokenFixtures.oauth.accessToken
);

const mockFactory = {
  createPATStrategy: jest.fn((token: string) => {
    const strategy = new (jest.requireActual(
      './test-fixtures/UnifiedGitHubServiceFixtures'
    ).MockPATAuthenticationStrategy)(token);
    // Apply test configurations that would have been set up
    if (token === TestFixtures.TokenFixtures.pat.invalid) {
      strategy.setShouldFail(true);
    }
    return strategy;
  }),
  createGitHubAppStrategy: jest.fn(() => mockGitHubAppStrategy),
  getCurrentStrategy: jest.fn(async () => mockPATStrategy),
};

jest.mock('../AuthenticationStrategyFactory', () => ({
  AuthenticationStrategyFactory: {
    getInstance: jest.fn(() => mockFactory),
  },
}));

describe('UnifiedGitHubService - Focused Tests', () => {
  let mockFetch: MockFetchResponseBuilder;
  let mockStorage: MockChromeStorage;

  beforeEach(() => {
    mockFetch = new MockFetchResponseBuilder();
    mockStorage = new MockChromeStorage();

    // Setup basic authentication and storage
    mockStorage.loadGitHubSettings();
    mockStorage.loadAuthenticationMethod('pat');

    // Reset strategy mocks
    mockPATStrategy.reset();
    mockGitHubAppStrategy.reset();

    jest.clearAllMocks();
  });

  afterEach(() => {
    mockFetch.reset();
    mockStorage.reset();

    if (global.fetch && typeof (global.fetch as jest.Mock).mockRestore === 'function') {
      (global.fetch as jest.Mock).mockRestore();
    }
  });

  describe('Constructor and Basic Functionality', () => {
    it('should create instance with string token', () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      expect(service).toBeInstanceOf(UnifiedGitHubService);
    });

    it('should create instance with auth config', () => {
      const authConfig = UnifiedGitHubServiceTestHelpers.createAuthConfig(
        'pat',
        TestFixtures.TokenFixtures.pat.classic
      );
      const service = new UnifiedGitHubService(authConfig);
      expect(service).toBeInstanceOf(UnifiedGitHubService);
    });
  });

  describe('Authentication - Success Cases', () => {
    beforeEach(() => {
      mockFetch.mockRepoExists('testuser', 'test-repo', true).build();
    });

    it('should successfully validate PAT token', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const result = await service.validateToken();
      expect(result).toBe(true);
    });

    it('should validate token and user', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const result = await service.validateTokenAndUser('testuser');

      expect(result.isValid).toBe(true);
      expect(result.userInfo).toBeDefined();
      expect(result.scopes).toBeDefined();
    });

    it('should verify token permissions', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      const onProgress = jest.fn();
      const result = await service.verifyTokenPermissions('testuser', onProgress);

      expect(result.isValid).toBe(true);
      expect(onProgress).toHaveBeenCalledTimes(3);
    });

    it('should identify classic PAT tokens', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const isClassic = await service.isClassicToken();
      expect(isClassic).toBe(true);
    });

    it('should identify fine-grained PAT tokens', async () => {
      // Test the token format directly since the service checks the token format
      const fineGrainedToken = TestFixtures.TokenFixtures.pat.fineGrained;
      expect(fineGrainedToken.startsWith('github_pat_')).toBe(true);

      // The service constructor will create a new strategy with the fine-grained token
      const service = new UnifiedGitHubService(fineGrainedToken);
      const isFineGrained = await service.isFineGrainedToken();
      expect(isFineGrained).toBe(true);
    });
  });

  describe('Authentication - Failure Cases', () => {
    beforeEach(() => {
      mockFetch.mockUnauthorized('GET:https://api.github.com/repos/testuser/test-repo').build();
    });

    it('should handle invalid token gracefully', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.invalid);
      const result = await service.validateToken();
      expect(result).toBe(false);
    });

    it('should return error details for failed validation', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.invalid);
      const result = await service.validateTokenAndUser('testuser');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle permission verification failures', async () => {
      // Create a strategy that will fail permissions and override the mock factory temporarily
      const failingStrategy = new MockPATAuthenticationStrategy(
        TestFixtures.TokenFixtures.pat.classic
      );
      failingStrategy.setShouldFailPermissions(true);

      mockFactory.createPATStrategy.mockReturnValueOnce(failingStrategy);

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const result = await service.verifyTokenPermissions('testuser');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Repository Operations', () => {
    beforeEach(() => {
      mockFetch
        .mockRepoExists('testuser', 'test-repo', true)
        .mockGetRepoInfo('testuser', 'test-repo')
        .mockCreateRepo()
        .mockListRepos()
        .mockListBranches('testuser', 'test-repo')
        .mockPushFile('testuser', 'test-repo', 'test-file.txt')
        .build();
    });

    it('should check if repository exists', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const exists = await service.repoExists('testuser', 'test-repo');

      expect(exists).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/test-repo',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/Bearer .+/),
          }),
        })
      );
    });

    it('should get repository information', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repoInfo = await service.getRepoInfo('testuser', 'test-repo');

      expect(repoInfo.name).toBe('test-repo');
      expect(repoInfo.exists).toBe(true);
    });

    it('should handle non-existent repository', async () => {
      mockFetch.reset();
      mockFetch.mockRepoExists('testuser', 'nonexistent', false).build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repoInfo = await service.getRepoInfo('testuser', 'nonexistent');

      expect(repoInfo.name).toBe('nonexistent');
      expect(repoInfo.exists).toBe(false);
    });

    it('should create new repository', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repo = await service.createRepo('new-repo', true, 'Test repository');

      expect(repo.name).toBe('new-repo');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/user/repos',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should list user repositories', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repos = await service.listRepos();

      expect(Array.isArray(repos)).toBe(true);
      expect(repos.length).toBeGreaterThan(0);
    });

    it('should list repository branches', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const branches = await service.listBranches('testuser', 'test-repo');

      expect(Array.isArray(branches)).toBe(true);
      expect(branches.some((b) => b.name === 'main')).toBe(true);
    });

    it('should push file to repository', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const result = await service.pushFile(
        'testuser',
        'test-repo',
        'test-file.txt',
        'Test content',
        'Add test file'
      );

      expect(result.content).toBeDefined();
      expect(result.commit).toBeDefined();
    });

    it('should ensure repository exists', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repo = await service.ensureRepoExists('testuser', 'test-repo');

      expect(repo.name).toBe('test-repo');
    });

    it('should check if repository is empty', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const isEmpty = await service.isRepoEmpty('testuser', 'test-repo');

      expect(typeof isEmpty).toBe('boolean');
    });
  });

  describe('Issue Management', () => {
    beforeEach(() => {
      mockFetch
        .mockGetIssues('testuser', 'test-repo', 'open')
        .mockGetIssue('testuser', 'test-repo', 1)
        .mockCreateIssue('testuser', 'test-repo')
        .mockAddIssueComment('testuser', 'test-repo', 1)
        .build();
    });

    it('should get open issues', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const issues = await service.getIssues('testuser', 'test-repo', 'open');

      expect(Array.isArray(issues)).toBe(true);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('should get specific issue', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const issue = await service.getIssue('testuser', 'test-repo', 1);

      expect(issue.number).toBe(1);
      expect(issue.title).toBeDefined();
    });

    it('should create new issue', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const issueData = {
        title: 'Test Issue',
        body: 'Test issue body',
        labels: ['bug'],
      };

      const issue = await service.createIssue('testuser', 'test-repo', issueData);

      expect(issue.number).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/test-repo/issues',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should add comment to issue', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const comment = await service.addIssueComment('testuser', 'test-repo', 1, 'Test comment');

      expect(comment.body).toBeDefined();
      expect(comment.url).toContain('/comments/');
    });

    it('should get issues with force refresh', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      await service.getIssues('testuser', 'test-repo', 'open', true);

      // Verify cache-busting headers
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('_t='),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          }),
        })
      );
    });
  });

  describe('Feedback System', () => {
    beforeEach(() => {
      mockFetch.mockCreateIssue('mamertofabian', 'bolt-to-github').build();
    });

    it('should submit user feedback as GitHub issue', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const feedback = {
        category: 'bug' as const,
        message: 'Test bug report',
        email: 'test@example.com',
        metadata: {
          browserInfo: 'Chrome/91.0',
          extensionVersion: '1.0.0',
        },
      };

      const issue = await service.submitFeedback(feedback);

      expect(issue.number).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/mamertofabian/bolt-to-github/issues',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should handle all feedback categories', async () => {
      const categories = ['appreciation', 'question', 'bug', 'feature', 'other'] as const;

      for (const category of categories) {
        (global.fetch as jest.Mock).mockClear();

        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
        const feedback = {
          category,
          message: `Test ${category} feedback`,
        };

        await service.submitFeedback(feedback);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.github.com/repos/mamertofabian/bolt-to-github/issues',
          expect.objectContaining({
            method: 'POST',
          })
        );
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP 404 errors', async () => {
      mockFetch.reset();
      mockFetch.mockRepoExists('testuser', 'nonexistent', false).build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const exists = await service.repoExists('testuser', 'nonexistent');

      expect(exists).toBe(false);
    });

    it('should handle unauthorized errors', async () => {
      mockFetch.reset();
      mockFetch.mockUnauthorized('GET:https://api.github.com/repos/testuser/test-repo').build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const exists = await service.repoExists('testuser', 'test-repo');

      expect(exists).toBe(false);
    });

    it('should handle server errors', async () => {
      mockFetch.reset();
      mockFetch.mockServerError('GET:https://api.github.com/repos/testuser/test-repo').build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const exists = await service.repoExists('testuser', 'test-repo');

      expect(exists).toBe(false);
    });

    it('should handle rate limiting', async () => {
      mockFetch.reset();
      mockFetch.mockRateLimited('GET:https://api.github.com/repos/testuser/test-repo').build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const exists = await service.repoExists('testuser', 'test-repo');

      expect(exists).toBe(false);
    });

    it('should handle network failures', async () => {
      // Test that the service gracefully handles network failures
      // Instead of expecting an exception, test that it returns false for network errors
      mockFetch.reset();
      const mockFetchFn = jest.fn().mockRejectedValue(new Error('Network request failed'));
      global.fetch = mockFetchFn;

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      // The service should handle the error and return false rather than throwing
      const exists = await service.repoExists('testuser', 'test-repo');
      expect(exists).toBe(false);
      expect(mockFetchFn).toHaveBeenCalled();
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle requests with simulated delay', async () => {
      mockFetch.reset();
      mockFetch.mockRepoExists('testuser', 'test-repo', true).setDelay(100).build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      const startTime = Date.now();
      await service.repoExists('testuser', 'test-repo');
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(90);
    });

    it('should handle multiple concurrent requests', async () => {
      mockFetch
        .mockRepoExists('testuser', 'repo1', true)
        .mockRepoExists('testuser', 'repo2', true)
        .mockRepoExists('testuser', 'repo3', false)
        .build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      const promises = [
        service.repoExists('testuser', 'repo1'),
        service.repoExists('testuser', 'repo2'),
        service.repoExists('testuser', 'repo3'),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual([true, true, false]);
    });
  });

  describe('Legacy Methods', () => {
    beforeEach(() => {
      mockFetch.reset();
      mockFetch
        .setDefaultResponse({
          ok: true,
          status: 200,
          json: () => Promise.resolve(TestFixtures.GitHubAPIResponses.user.valid),
        })
        .build();
    });

    it('should support legacy request method', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const result = await service.request('GET', '/user');

      expect((result as any).login).toBe('testuser');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });
});
