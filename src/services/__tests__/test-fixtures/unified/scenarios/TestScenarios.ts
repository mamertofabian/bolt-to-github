import type { MockedFunction } from 'vitest';
import {
  MockChromeStorage,
  MockFetchResponseBuilder,
  MockGitHubAppAuthenticationStrategy,
} from '../mocks';
import { TokenFixtures } from '../tokens';

/** Builder for App-authenticated UnifiedGitHubService test environments. */
export class UnifiedGitHubServiceTestScenarios {
  private readonly mockFetch = new MockFetchResponseBuilder();
  private readonly mockStorage = new MockChromeStorage();
  private readonly mockStrategy = new MockGitHubAppAuthenticationStrategy(
    TokenFixtures.oauth.accessToken
  );

  setupSuccessfulGitHubAppAuthentication(): this {
    this.mockStorage.loadGitHubApp();
    this.mockStorage.loadSupabaseToken();
    this.mockStrategy.setShouldFail(false);
    this.mockStrategy.setUserToken(TokenFixtures.oauth.accessToken);
    return this;
  }

  setupRepositoryOperations(owner = 'testuser', repo = 'test-repo'): this {
    this.mockFetch
      .mockRepoExists(owner, repo, true)
      .mockGetRepoInfo(owner, repo)
      .mockCreateRepo()
      .mockListRepos()
      .mockListBranches(owner, repo)
      .mockPushFile(owner, repo, 'test-file.txt');
    return this;
  }

  setupIssueOperations(owner = 'testuser', repo = 'test-repo'): this {
    this.mockFetch
      .mockGetIssues(owner, repo, 'open')
      .mockGetIssue(owner, repo, 1)
      .mockCreateIssue(owner, repo)
      .mockAddIssueComment(owner, repo, 1);
    return this;
  }

  setupAuthenticationFailure(): this {
    this.mockStrategy.setShouldFail(true);
    return this;
  }

  setupNetworkFailure(): this {
    this.mockFetch.setShouldFail(true);
    return this;
  }

  setupRateLimiting(owner = 'testuser', repo = 'test-repo'): this {
    this.mockFetch.mockRateLimited(`GET:https://api.github.com/repos/${owner}/${repo}`);
    return this;
  }

  setupRepositoryNotFound(owner = 'testuser', repo = 'nonexistent'): this {
    this.mockFetch.mockRepoExists(owner, repo, false);
    return this;
  }

  setupPermissionDenied(): this {
    this.mockStrategy.setShouldFailPermissions(true);
    return this;
  }

  setupSlowNetwork(delay = 5000): this {
    this.mockFetch.setDelay(delay);
    return this;
  }

  setupSlowAuthentication(delay = 3000): this {
    this.mockStrategy.setValidationDelay(delay);
    return this;
  }

  build(): {
    mockFetch: MockedFunction<typeof fetch>;
    mockStorage: MockChromeStorage;
    mockStrategy: MockGitHubAppAuthenticationStrategy;
  } {
    return {
      mockFetch: this.mockFetch.build(),
      mockStorage: this.mockStorage,
      mockStrategy: this.mockStrategy,
    };
  }

  reset(): void {
    this.mockFetch.reset();
    this.mockStorage.reset();
    this.mockStrategy.reset();
  }
}
