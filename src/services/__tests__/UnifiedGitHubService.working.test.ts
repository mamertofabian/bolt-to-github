/**
 * Working Test Suite for UnifiedGitHubService
 *
 * This test file provides working examples using the comprehensive test fixtures.
 * It focuses on core functionality that can be reliably tested.
 */

import type { Mock } from 'vitest';
import { UnifiedGitHubService } from '../UnifiedGitHubService';
import {
  MockChromeStorage,
  MockFetchResponseBuilder,
  TestFixtures,
  UnifiedGitHubServiceTestHelpers,
} from './test-fixtures';

// Mock the AuthenticationStrategyFactory
vi.mock('../AuthenticationStrategyFactory', async () => {
  const { MockAuthenticationStrategyFactory } = await import('./test-fixtures/unified');
  const mockFactory = new MockAuthenticationStrategyFactory();
  return {
    AuthenticationStrategyFactory: {
      getInstance: vi.fn(() => mockFactory),
    },
  };
});

describe('UnifiedGitHubService - Working Tests', () => {
  let mockFetch: MockFetchResponseBuilder;
  let mockStorage: MockChromeStorage;

  beforeEach(async () => {
    mockFetch = new MockFetchResponseBuilder();
    mockStorage = new MockChromeStorage();

    // Setup basic authentication
    mockStorage.loadGitHubSettings();
    mockStorage.loadAuthenticationMethod('pat');

    vi.clearAllMocks();
  });

  afterEach(() => {
    mockFetch.reset();
    mockStorage.reset();

    if (global.fetch && typeof (global.fetch as Mock).mockRestore === 'function') {
      (global.fetch as Mock).mockRestore();
    }
  });

  describe('Constructor', () => {
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

  describe('Repository Operations', () => {
    beforeEach(() => {
      mockFetch
        .mockRepoExists('testuser', 'test-repo', true)
        .mockGetRepoInfo('testuser', 'test-repo')
        .mockCreateRepo()
        .mockListRepos()
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
            Accept: 'application/vnd.github.v3+json',
          }),
        })
      );
    });

    it('should get repository information', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repoInfo = await service.getRepoInfo('testuser', 'test-repo');

      expect(repoInfo.name).toBe('test-repo');
      expect(repoInfo.full_name).toBe('testuser/test-repo');
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
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should list user repositories', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const repos = await service.listRepos();

      expect(Array.isArray(repos)).toBe(true);
      expect(repos.length).toBeGreaterThan(0);
    });
  });

  describe('Issue Management', () => {
    beforeEach(() => {
      mockFetch
        .mockGetIssues('testuser', 'test-repo', 'open')
        .mockGetIssue('testuser', 'test-repo', 1)
        .mockCreateIssue('testuser', 'test-repo')
        .build();
    });

    it('should get open issues', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const issues = await service.getIssues('testuser', 'test-repo', 'open');

      expect(Array.isArray(issues)).toBe(true);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].state).toBe('open');
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
      };

      const issue = await service.createIssue('testuser', 'test-repo', issueData);

      expect(issue.number).toBe(3); // From fixture
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/test-repo/issues',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('File Operations', () => {
    beforeEach(() => {
      mockFetch.mockPushFile('testuser', 'test-repo', 'test-file.txt').build();
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
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/test-repo/contents/test-file.txt',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
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

      expect(exists).toBe(false); // Should return false for auth errors
    });

    it('should handle server errors', async () => {
      mockFetch.reset();
      mockFetch.mockServerError('GET:https://api.github.com/repos/testuser/test-repo').build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const exists = await service.repoExists('testuser', 'test-repo');

      expect(exists).toBe(false); // Should return false for server errors
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

      expect(issue.number).toBe(3); // From fixture
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/mamertofabian/bolt-to-github/issues',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('Token Type Detection', () => {
    it('should identify classic PAT tokens', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);
      const isClassic = await service.isClassicToken();
      expect(isClassic).toBe(true);
    });

    it('should identify fine-grained PAT tokens', async () => {
      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.fineGrained);
      const isFineGrained = await service.isFineGrainedToken();
      expect(isFineGrained).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle requests with simulated delay', async () => {
      mockFetch.reset();
      mockFetch
        .mockRepoExists('testuser', 'test-repo', true)
        .setDelay(100) // 100ms delay
        .build();

      const service = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

      const startTime = Date.now();
      await service.repoExists('testuser', 'test-repo');
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(90); // Allow some variance
    });
  });
});
