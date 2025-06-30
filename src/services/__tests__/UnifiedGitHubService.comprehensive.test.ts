/**
 * Comprehensive Test Suite for UnifiedGitHubService
 *
 * This test file demonstrates how to use the comprehensive test fixtures
 * and provides full coverage testing examples for the UnifiedGitHubService.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockedFunction,
} from 'vitest';
import { UnifiedGitHubService } from '../UnifiedGitHubService';
import {
  TestFixtures,
  UnifiedGitHubServiceTestHelpers,
  UnifiedGitHubServiceTestScenarios,
} from './test-fixtures';

// Mock the AuthenticationStrategyFactory at the module level
const mockFactory = await (async () => {
  const { MockAuthenticationStrategyFactory } = await vi.importActual<
    typeof import('./test-fixtures/UnifiedGitHubServiceFixtures')
  >('./test-fixtures/UnifiedGitHubServiceFixtures');
  return new MockAuthenticationStrategyFactory();
})();

// Create a factory wrapper that handles token-based strategy creation
const mockFactoryWrapper = {
  createPATStrategy: vi.fn(async (token: string) => {
    const { MockPATAuthenticationStrategy, TestFixtures } = await vi.importActual<
      typeof import('./test-fixtures/UnifiedGitHubServiceFixtures')
    >('./test-fixtures/UnifiedGitHubServiceFixtures');
    const strategy = new MockPATAuthenticationStrategy(token);

    // Apply test configurations based on token type
    if (
      token === TestFixtures.TokenFixtures.pat.invalid ||
      token === 'invalid-token-format' ||
      (!token.startsWith('ghp_') && !token.startsWith('github_pat_'))
    ) {
      strategy.setShouldFail(true);
    }

    return strategy;
  }),
  createGitHubAppStrategy: vi.fn(async (userToken?: string) => {
    const { MockGitHubAppAuthenticationStrategy } = await vi.importActual<
      typeof import('./test-fixtures/UnifiedGitHubServiceFixtures')
    >('./test-fixtures/UnifiedGitHubServiceFixtures');
    return new MockGitHubAppAuthenticationStrategy(userToken);
  }),
  getCurrentStrategy: vi.fn(async () => {
    // This should not be called when we pass a token string to the constructor
    // If it is called, something is wrong with our test setup
    throw new Error('getCurrentStrategy should not be called when token is provided directly');
  }),
};

vi.mock('../AuthenticationStrategyFactory', () => ({
  AuthenticationStrategyFactory: {
    getInstance: vi.fn(() => mockFactoryWrapper),
  },
}));

describe('UnifiedGitHubService - Comprehensive Tests', () => {
  let scenario: UnifiedGitHubServiceTestScenarios;
  let mockFetch: MockedFunction<typeof fetch>;

  beforeEach(() => {
    scenario = new UnifiedGitHubServiceTestScenarios();
    vi.clearAllMocks();

    // Reset the mock factory
    mockFactory.reset();
    mockFactory.setCurrentStrategyType('pat');

    // Reset the global fetch mock
    if (global.fetch) {
      (global.fetch as Mock).mockClear();
    }
  });

  afterEach(() => {
    scenario.reset();

    // Clean up global fetch mock with proper type guard
    const globalFetch = global.fetch as Mock | undefined;
    if (globalFetch && typeof globalFetch.mockRestore === 'function') {
      globalFetch.mockRestore();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should accept string token for backward compatibility', () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      expect(service).toBeInstanceOf(UnifiedGitHubService);
    });

    it('should accept AuthenticationConfig object', () => {
      const authConfig = UnifiedGitHubServiceTestHelpers.createAuthConfig(
        'pat',
        TestFixtures.TokenFixtures.pat.classic
      );
      const service = new UnifiedGitHubService(authConfig);
      expect(service).toBeInstanceOf(UnifiedGitHubService);
    });

    it('should handle GitHub App configuration', () => {
      const authConfig = UnifiedGitHubServiceTestHelpers.createAuthConfig('github_app');
      const service = new UnifiedGitHubService(authConfig);
      expect(service).toBeInstanceOf(UnifiedGitHubService);
    });
  });

  describe('Authentication Methods', () => {
    describe('PAT Authentication', () => {
      beforeEach(() => {
        const mocks = scenario.setupSuccessfulPATAuthentication().build();
        mockFetch = mocks.mockFetch;
      });

      it('should successfully validate PAT token', async () => {
        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
        const result = await service.validateToken();
        expect(result).toBe(true);
      });

      it('should validate token and user with repository owner', async () => {
        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
        const result = await service.validateTokenAndUser('testuser');

        expect(result.isValid).toBe(true);
        expect(result.userInfo).toEqual(TestFixtures.GitHubAPIResponses.user.valid);
        expect(result.scopes).toEqual(TestFixtures.TokenFixtures.validation.valid.scopes);
      });

      it('should identify classic PAT tokens correctly', async () => {
        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
        const isClassic = await service.isClassicToken();
        expect(isClassic).toBe(true);
      });

      it('should identify fine-grained PAT tokens correctly', async () => {
        // The mock factory wrapper will create a strategy with the fine-grained token
        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.fineGrained);
        const isFineGrained = await service.isFineGrainedToken();
        expect(isFineGrained).toBe(true);
      });

      it('should verify token permissions successfully', async () => {
        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

        const onProgress = vi.fn();
        const result = await service.verifyTokenPermissions('testuser', onProgress);

        expect(result.isValid).toBe(true);
        expect(onProgress).toHaveBeenCalledTimes(3); // repos, admin, code permissions
        expect(onProgress).toHaveBeenCalledWith({ permission: 'repos', isValid: true });
        expect(onProgress).toHaveBeenCalledWith({ permission: 'admin', isValid: true });
        expect(onProgress).toHaveBeenCalledWith({ permission: 'code', isValid: true });
      });
    });

    describe('GitHub App Authentication', () => {
      beforeEach(() => {
        const mocks = scenario.setupSuccessfulGitHubAppAuthentication().build();
        mockFetch = mocks.mockFetch;
      });

      it('should successfully authenticate with GitHub App', async () => {
        const authConfig = UnifiedGitHubServiceTestHelpers.createAuthConfig('github_app');
        const service = new UnifiedGitHubService(authConfig);

        const result = await service.validateToken();
        expect(result).toBe(true);
      });

      it('should return correct authentication type for GitHub App', async () => {
        const authConfig = UnifiedGitHubServiceTestHelpers.createAuthConfig('github_app');
        const service = new UnifiedGitHubService(authConfig);

        const authType = await service.getAuthenticationType();
        expect(authType).toBe('github_app');
      });

      it('should handle token renewal for GitHub App', async () => {
        const authConfig = UnifiedGitHubServiceTestHelpers.createAuthConfig('github_app');

        // Create a GitHub App strategy configured for renewal
        const { MockGitHubAppAuthenticationStrategy } = await vi.importActual<
          typeof import('./test-fixtures/UnifiedGitHubServiceFixtures')
        >('./test-fixtures/UnifiedGitHubServiceFixtures');
        const appStrategy = new MockGitHubAppAuthenticationStrategy(
          TestFixtures.TokenFixtures.oauth.accessToken
        );
        appStrategy.setNeedsRenewal(true);

        // Configure the mock factory wrapper to return our GitHub App strategy
        mockFactoryWrapper.createGitHubAppStrategy.mockReturnValueOnce(
          Promise.resolve(appStrategy)
        );
        mockFactoryWrapper.getCurrentStrategy.mockResolvedValueOnce(appStrategy as never);

        const service = new UnifiedGitHubService(authConfig);

        // Wait a bit for async initialization
        await new Promise((resolve) => setTimeout(resolve, 50));

        const needsRenewal = await service.needsRenewal();
        expect(needsRenewal).toBe(true);

        const newToken = await service.refreshAuth();
        expect(newToken).toBe(TestFixtures.TokenFixtures.githubApp.valid);
      });

      it('should get GitHub App metadata', async () => {
        const authConfig = UnifiedGitHubServiceTestHelpers.createAuthConfig('github_app');
        const service = new UnifiedGitHubService(authConfig);

        const metadata = await service.getAuthMetadata();
        expect(metadata.tokenType).toBe('github_app');
        expect(metadata.installationId).toBe(12345);
        expect(metadata.appId).toBe(67890);
      });
    });

    describe('Authentication Failures', () => {
      beforeEach(() => {
        // Reset the mock factory to PAT mode
        mockFactory.reset();
        mockFactory.setCurrentStrategyType('pat');

        const mocks = scenario
          .setupSuccessfulPATAuthentication() // Start with success, then configure failures
          .build();
        mockFetch = mocks.mockFetch;
      });

      it('should handle invalid PAT token gracefully', async () => {
        // The mock factory wrapper will automatically configure invalid tokens to fail
        // Let's verify the mock is being called with the right token
        mockFactoryWrapper.createPATStrategy.mockClear();

        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.invalid);

        // Verify the factory was called with invalid token
        expect(mockFactoryWrapper.createPATStrategy).toHaveBeenCalledWith(
          TestFixtures.TokenFixtures.pat.invalid
        );

        const result = await service.validateToken();
        expect(result).toBe(false);
      });

      it('should return error details for failed validation', async () => {
        // The mock factory wrapper will automatically configure invalid tokens to fail
        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.invalid);
        const result = await service.validateTokenAndUser('testuser');

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid PAT token');
      });

      it('should handle permission verification failures', async () => {
        // Create a strategy that will fail permissions
        const { MockPATAuthenticationStrategy } = await vi.importActual<
          typeof import('./test-fixtures/UnifiedGitHubServiceFixtures')
        >('./test-fixtures/UnifiedGitHubServiceFixtures');
        const failingStrategy = new MockPATAuthenticationStrategy(
          TestFixtures.TokenFixtures.pat.classic
        );
        failingStrategy.setShouldFailPermissions(true);

        // Configure the mock factory wrapper to return our failing strategy
        mockFactoryWrapper.createPATStrategy.mockReturnValueOnce(Promise.resolve(failingStrategy));

        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
        const result = await service.verifyTokenPermissions('testuser');

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Insufficient permissions');
      });
    });
  });

  describe('Repository Operations', () => {
    beforeEach(() => {
      const mocks = scenario
        .setupSuccessfulPATAuthentication()
        .setupRepositoryOperations('testuser', 'test-repo')
        .build();
      mockFetch = mocks.mockFetch;
    });

    it('should check if repository exists', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const exists = await service.repoExists('testuser', 'test-repo');

      expect(exists).toBe(true);
      UnifiedGitHubServiceTestHelpers.expectValidGitHubApiCall(
        mockFetch,
        'https://api.github.com/repos/testuser/test-repo',
        'GET'
      );
    });

    it('should get repository information', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repoInfo = await service.getRepoInfo('testuser', 'test-repo');

      expect(repoInfo.name).toBe('test-repo');
      expect(repoInfo.full_name).toBe('testuser/test-repo');
      expect(repoInfo.exists).toBe(true);
      expect(repoInfo.private).toBe(false);
    });

    it('should handle non-existent repository', async () => {
      // Override the mock for this specific test
      scenario.reset();
      scenario
        .setupSuccessfulPATAuthentication()
        .setupRepositoryNotFound('testuser', 'nonexistent')
        .build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repoInfo = await service.getRepoInfo('testuser', 'nonexistent');

      expect(repoInfo.name).toBe('nonexistent');
      expect(repoInfo.exists).toBe(false);
    });

    it('should create a new repository', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repo = await service.createRepo('new-repo', true, 'Test repository');

      expect(repo.name).toBe('new-repo');
      expect(repo.private).toBe(true);
      UnifiedGitHubServiceTestHelpers.expectValidGitHubApiCall(
        mockFetch,
        'https://api.github.com/user/repos',
        'POST',
        { 'Content-Type': 'application/json' }
      );
    });

    it('should ensure repository exists (create if needed)', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repo = await service.ensureRepoExists('testuser', 'test-repo', false);

      expect(repo.name).toBe('test-repo');
      expect(repo.exists).toBe(true);
    });

    it('should check if repository is empty', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const isEmpty = await service.isRepoEmpty('testuser', 'test-repo');

      expect(isEmpty).toBe(false); // Based on our fixture setup
    });

    it('should list user repositories', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repos = await service.listRepos();

      expect(Array.isArray(repos)).toBe(true);
      expect(repos.length).toBeGreaterThan(0);
      expect(repos[0].name).toBe('test-repo');
    });

    it('should list repository branches', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const branches = await service.listBranches('testuser', 'test-repo');

      expect(Array.isArray(branches)).toBe(true);
      expect(branches.length).toBeGreaterThan(0);
      expect(branches.some((b) => b.name === 'main')).toBe(true);
    });

    it('should get commit count for repository', async () => {
      // Mock commit responses for pagination test
      const commitData = TestFixtures.GitHubAPIResponses.commits.page1;
      scenario.reset();
      const { mockFetch: newMockFetch } = scenario.setupSuccessfulPATAuthentication().build();

      // Mock the commit API calls
      newMockFetch.mockImplementation(async (url: string | Request | URL) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes('/commits')) {
          return {
            ok: true,
            status: 200,
            json: () => Promise.resolve(commitData),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const count = await service.getCommitCount('testuser', 'test-repo', 'main');

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should push file to repository', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const result = await service.pushFile(
        'testuser',
        'test-repo',
        'test-file.txt',
        'Test content',
        'Add test file',
        'main'
      );

      expect(result.content.name).toBe('new-file.txt'); // From fixture
      expect(result.commit.message).toBe('Add new file');
      UnifiedGitHubServiceTestHelpers.expectValidGitHubApiCall(
        mockFetch,
        'https://api.github.com/repos/testuser/test-repo/contents/test-file.txt',
        'PUT',
        { 'Content-Type': 'application/json' }
      );
    });

    it('should delete repository', async () => {
      scenario.reset();
      const { mockFetch: newMockFetch } = scenario.setupSuccessfulPATAuthentication().build();

      newMockFetch.mockImplementation(
        async (url: string | Request | URL, options?: RequestInit) => {
          const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
          const method = options?.method || 'GET';

          if (urlStr.includes('/repos/testuser/test-repo') && method === 'DELETE') {
            return {
              ok: true,
              status: 204,
              statusText: 'No Content',
            } as Response;
          }
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
          } as Response;
        }
      );

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      // Should not throw
      await expect(service.deleteRepo('testuser', 'test-repo')).resolves.toBeUndefined();
    });
  });

  describe('Issue Management', () => {
    beforeEach(() => {
      const mocks = scenario
        .setupSuccessfulPATAuthentication()
        .setupIssueOperations('testuser', 'test-repo')
        .build();
      mockFetch = mocks.mockFetch;
    });

    it('should get open issues', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const issues = await service.getIssues('testuser', 'test-repo', 'open');

      expect(Array.isArray(issues)).toBe(true);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].state).toBe('open');
    });

    it('should get issues with force refresh', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      await service.getIssues('testuser', 'test-repo', 'open', true);

      // Verify cache-busting headers were added
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('_t='),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          }),
        })
      );
    });

    it('should get specific issue', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const issue = await service.getIssue('testuser', 'test-repo', 1);

      expect(issue.number).toBe(1);
      expect(issue.title).toContain('Bug: Application crashes');
    });

    it('should create new issue', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const issueData = {
        title: 'Test Issue',
        body: 'Test issue body',
        labels: ['bug', 'test'],
        assignees: ['testuser'],
      };

      const issue = await service.createIssue('testuser', 'test-repo', issueData);

      expect(issue.number).toBe(3); // From fixture
      expect(issue.title).toBe('Test Issue Title');
    });

    it('should update existing issue', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      // Mock the update response
      scenario.reset();
      const { mockFetch: newMockFetch } = scenario.setupSuccessfulPATAuthentication().build();

      newMockFetch.mockImplementation(
        async (url: string | Request | URL, options?: RequestInit) => {
          const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
          const method = options?.method || 'GET';

          if (urlStr.includes('/issues/1') && method === 'PATCH') {
            return {
              ok: true,
              status: 200,
              statusText: 'OK',
              json: () =>
                Promise.resolve({
                  ...TestFixtures.IssueFixtures.openIssue,
                  title: 'Updated Title',
                  state: 'closed',
                }),
            } as Response;
          }
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
          } as Response;
        }
      );

      const issue = await service.updateIssue(
        'testuser',
        'test-repo',
        1,
        'Updated Title',
        'Updated body',
        'closed'
      );

      expect(issue.title).toBe('Updated Title');
      expect(issue.state).toBe('closed');
    });

    it('should add comment to issue', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const comment = await service.addIssueComment(
        'testuser',
        'test-repo',
        1,
        'This is a test comment'
      );

      expect(comment.body).toContain('Thanks for reporting');
      expect(comment.url).toContain('/issues/comments/');
    });
  });

  describe('Feedback System', () => {
    beforeEach(() => {
      const mocks = scenario
        .setupSuccessfulPATAuthentication()
        .setupIssueOperations('mamertofabian', 'bolt-to-github')
        .build();
      mockFetch = mocks.mockFetch;
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
          url: 'https://example.com',
        },
      };

      const issue = await service.submitFeedback(feedback);

      expect(issue.number).toBe(3); // From fixture
      UnifiedGitHubServiceTestHelpers.expectValidGitHubApiCall(
        mockFetch,
        'https://api.github.com/repos/mamertofabian/bolt-to-github/issues',
        'POST',
        { 'Content-Type': 'application/json' }
      );
    });
  });

  describe('Repository Cloning', () => {
    beforeEach(() => {
      const mocks = scenario
        .setupSuccessfulPATAuthentication()
        .setupRepositoryOperations('source-owner', 'source-repo')
        .setupRepositoryOperations('target-owner', 'target-repo')
        .build();
      mockFetch = mocks.mockFetch;
    });

    it('should clone repository contents with progress tracking', async () => {
      // Setup detailed tree and file content mocks
      scenario.reset();
      const { mockFetch: newMockFetch } = scenario.setupSuccessfulPATAuthentication().build();

      newMockFetch.mockImplementation(async (url: string | Request | URL) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;

        if (urlStr.includes('/git/trees/main?recursive=1')) {
          return {
            ok: true,
            status: 200,
            json: () => Promise.resolve(TestFixtures.GitHubAPIResponses.tree.withFiles),
          } as Response;
        }

        if (urlStr.includes('/git/blobs/')) {
          return {
            ok: true,
            status: 200,
            json: () => Promise.resolve(TestFixtures.GitHubAPIResponses.fileContent.readmeMarkdown),
          } as Response;
        }

        if (urlStr.includes('/contents/') && url instanceof Request && url.method === 'PUT') {
          return {
            ok: true,
            status: 201,
            json: () => Promise.resolve(TestFixtures.GitHubAPIResponses.filePush.created),
          } as Response;
        }

        return { ok: false, status: 404 } as Response;
      });

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const progressUpdates: number[] = [];

      await service.cloneRepoContents(
        'source-owner',
        'source-repo',
        'target-owner',
        'target-repo',
        'main',
        (progress) => progressUpdates.push(progress)
      );

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toBe(10); // Initial progress
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100); // Completion
    });

    it('should create temporary public repository', async () => {
      scenario.reset();
      const { mockFetch: newMockFetch } = scenario.setupSuccessfulPATAuthentication().build();

      newMockFetch.mockImplementation(
        async (url: string | Request | URL, options?: RequestInit) => {
          const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
          const method = options?.method || 'GET';

          // Mock repository creation
          if (urlStr.includes('/user/repos') && method === 'POST') {
            return {
              ok: true,
              status: 201,
              statusText: 'Created',
              json: () => Promise.resolve(TestFixtures.GitHubAPIResponses.repository.created),
            } as Response;
          }

          // Mock file push
          if (urlStr.includes('/contents/.gitkeep') && method === 'PUT') {
            return {
              ok: true,
              status: 201,
              statusText: 'Created',
              json: () => Promise.resolve(TestFixtures.GitHubAPIResponses.filePush.created),
            } as Response;
          }

          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
          } as Response;
        }
      );

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const tempRepoName = await service.createTemporaryPublicRepo(
        'testuser',
        'source-repo',
        'main'
      );

      expect(tempRepoName).toContain('temp-source-repo-');
      expect(tempRepoName).toMatch(/temp-source-repo-\d+-[a-z0-9]+/);
    });
  });

  describe('Error Handling', () => {
    describe('Network Errors', () => {
      beforeEach(() => {
        // Reset and configure for successful authentication but network failures
        mockFactory.reset();
        mockFactory.setCurrentStrategyType('pat');

        // Create a custom mock fetch that throws network errors
        mockFetch = vi.fn().mockRejectedValue(new Error('Network request failed'));
        global.fetch = mockFetch;
      });

      it('should handle network failures gracefully', async () => {
        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

        // The service catches network errors and returns false for repoExists
        const exists = await service.repoExists('testuser', 'test-repo');
        expect(exists).toBe(false);
      });
    });

    describe('Rate Limiting', () => {
      beforeEach(() => {
        const mocks = scenario.setupRateLimiting('testuser', 'test-repo').build();
        mockFetch = mocks.mockFetch;
      });

      it('should handle rate limiting errors', async () => {
        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

        // The service handles rate limiting by returning false for repoExists
        const exists = await service.repoExists('testuser', 'test-repo');
        expect(exists).toBe(false);
      });
    });

    describe('Permission Errors', () => {
      beforeEach(() => {
        const mocks = scenario.setupSuccessfulPATAuthentication().build();
        mockFetch = mocks.mockFetch;
      });

      it('should handle insufficient permissions', async () => {
        // Create a strategy that will fail permissions
        const { MockPATAuthenticationStrategy } = await vi.importActual<
          typeof import('./test-fixtures/UnifiedGitHubServiceFixtures')
        >('./test-fixtures/UnifiedGitHubServiceFixtures');
        const failingStrategy = new MockPATAuthenticationStrategy(
          TestFixtures.TokenFixtures.pat.classic
        );
        failingStrategy.setShouldFailPermissions(true);

        // Configure the mock factory wrapper to return our failing strategy
        mockFactoryWrapper.createPATStrategy.mockReturnValueOnce(Promise.resolve(failingStrategy));

        const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
        const result = await service.verifyTokenPermissions('testuser');

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Insufficient permissions');
      });
    });
  });

  describe('Performance Scenarios', () => {
    it('should handle slow network conditions', async () => {
      // Create a strategy without delay since we're testing network delay
      const { MockPATAuthenticationStrategy } = await vi.importActual<
        typeof import('./test-fixtures/UnifiedGitHubServiceFixtures')
      >('./test-fixtures/UnifiedGitHubServiceFixtures');
      const normalStrategy = new MockPATAuthenticationStrategy(
        TestFixtures.TokenFixtures.pat.classic
      );

      // Configure the mock factory wrapper to return our normal strategy
      mockFactoryWrapper.createPATStrategy.mockReturnValueOnce(Promise.resolve(normalStrategy));

      // Create a custom mock fetch with delay
      mockFetch = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        };
      });
      global.fetch = mockFetch;

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      const startTime = Date.now();
      // Call a method that definitely uses fetch
      await service.repoExists('testuser', 'test-repo');
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(900); // Allow some variance
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle slow authentication', async () => {
      // Create a strategy with validation delay
      const { MockPATAuthenticationStrategy } = await vi.importActual<
        typeof import('./test-fixtures/UnifiedGitHubServiceFixtures')
      >('./test-fixtures/UnifiedGitHubServiceFixtures');
      const slowStrategy = new MockPATAuthenticationStrategy(
        TestFixtures.TokenFixtures.pat.classic
      );
      slowStrategy.setValidationDelay(500); // 0.5 second delay

      // Configure the mock factory wrapper to return our slow strategy
      mockFactoryWrapper.createPATStrategy.mockReturnValueOnce(Promise.resolve(slowStrategy));

      // Setup basic fetch mock
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
      global.fetch = mockFetch;

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      const startTime = Date.now();
      await service.validateToken();
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(400); // Allow some variance
    });
  });

  describe('Legacy Methods', () => {
    beforeEach(() => {
      const mocks = scenario.setupSuccessfulPATAuthentication().build();
      mockFetch = mocks.mockFetch;
    });

    it('should support legacy request method', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      // Mock a specific API endpoint
      scenario.reset();
      const { mockFetch: newMockFetch } = scenario.setupSuccessfulPATAuthentication().build();

      newMockFetch.mockImplementation(async (url: string | Request | URL) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes('/user')) {
          return {
            ok: true,
            status: 200,
            json: () => Promise.resolve(TestFixtures.GitHubAPIResponses.user.valid),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      const result = await service.request('GET', '/user');
      expect((result as unknown as { login: string }).login).toBe('testuser');
    });
  });
});
