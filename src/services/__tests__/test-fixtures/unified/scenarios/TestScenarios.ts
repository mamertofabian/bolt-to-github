/**
 * Test Scenario Builders for UnifiedGitHubService
 *
 * This module provides pre-configured test scenarios that combine multiple
 * test doubles to create realistic testing environments. Each scenario
 * represents a complete setup for testing specific functionality or error cases.
 */

import type { MockedFunction } from 'vitest';
import {
  MockAuthenticationStrategyFactory,
  MockFetchResponseBuilder,
  MockChromeStorage,
} from '../mocks';
import { TokenFixtures } from '../tokens';

/**
 * Builder for creating complete test scenarios
 *
 * Provides fluent API for setting up complex test scenarios that combine
 * authentication, storage, and network mocking. Scenarios include:
 * - Successful operations (PAT auth, GitHub App auth, repo ops, issues)
 * - Error scenarios (auth failures, network errors, rate limiting, permissions)
 * - Performance scenarios (slow network, slow authentication)
 *
 * @example
 * ```ts
 * const { mockFetch, mockStorage, mockAuthFactory } = new UnifiedGitHubServiceTestScenarios()
 *   .setupSuccessfulPATAuthentication()
 *   .setupRepositoryOperations('owner', 'repo')
 *   .build();
 * ```
 */
export class UnifiedGitHubServiceTestScenarios {
  private mockFetch: MockFetchResponseBuilder;
  private mockStorage: MockChromeStorage;
  private mockAuthFactory: MockAuthenticationStrategyFactory;

  constructor() {
    this.mockFetch = new MockFetchResponseBuilder();
    this.mockStorage = new MockChromeStorage();
    this.mockAuthFactory = new MockAuthenticationStrategyFactory();
  }

  // Successful operation scenarios
  setupSuccessfulPATAuthentication(): this {
    this.mockStorage.loadGitHubSettings();
    this.mockStorage.loadAuthenticationMethod('pat');

    const patStrategy = this.mockAuthFactory.getPATStrategy();
    patStrategy.setShouldFail(false);

    return this;
  }

  setupSuccessfulGitHubAppAuthentication(): this {
    this.mockStorage.loadAuthenticationMethod('github_app');
    this.mockStorage.loadSupabaseToken();

    const appStrategy = this.mockAuthFactory.getGitHubAppStrategy();
    appStrategy.setShouldFail(false);
    appStrategy.setUserToken(TokenFixtures.oauth.accessToken);

    return this;
  }

  setupRepositoryOperations(owner: string = 'testuser', repo: string = 'test-repo'): this {
    this.mockFetch
      .mockRepoExists(owner, repo, true)
      .mockGetRepoInfo(owner, repo)
      .mockCreateRepo()
      .mockListRepos()
      .mockListBranches(owner, repo)
      .mockPushFile(owner, repo, 'test-file.txt');

    return this;
  }

  setupIssueOperations(owner: string = 'testuser', repo: string = 'test-repo'): this {
    this.mockFetch
      .mockGetIssues(owner, repo, 'open')
      .mockGetIssue(owner, repo, 1)
      .mockCreateIssue(owner, repo)
      .mockAddIssueComment(owner, repo, 1);

    return this;
  }

  // Error scenarios
  setupAuthenticationFailure(): this {
    this.mockStorage.loadAuthenticationMethod('pat');
    this.mockAuthFactory.getPATStrategy().setShouldFail(true);
    return this;
  }

  setupNetworkFailure(): this {
    this.mockFetch.setShouldFail(true);
    return this;
  }

  setupRateLimiting(owner: string = 'testuser', repo: string = 'test-repo'): this {
    this.mockFetch.mockRateLimited(`GET:https://api.github.com/repos/${owner}/${repo}`);
    return this;
  }

  setupRepositoryNotFound(owner: string = 'testuser', repo: string = 'nonexistent'): this {
    this.mockFetch.mockRepoExists(owner, repo, false);
    return this;
  }

  setupPermissionDenied(): this {
    this.mockAuthFactory.getPATStrategy().setShouldFailPermissions(true);
    return this;
  }

  // Performance scenarios
  setupSlowNetwork(delay: number = 5000): this {
    this.mockFetch.setDelay(delay);
    return this;
  }

  setupSlowAuthentication(delay: number = 3000): this {
    this.mockAuthFactory.getPATStrategy().setValidationDelay(delay);
    this.mockAuthFactory.getGitHubAppStrategy().setValidationDelay(delay);
    return this;
  }

  // Build and apply all mocks
  build(): {
    mockFetch: MockedFunction<typeof fetch>;
    mockStorage: MockChromeStorage;
    mockAuthFactory: MockAuthenticationStrategyFactory;
  } {
    const mockFetch = this.mockFetch.build();

    return {
      mockFetch,
      mockStorage: this.mockStorage,
      mockAuthFactory: this.mockAuthFactory,
    };
  }

  reset(): void {
    this.mockFetch.reset();
    this.mockStorage.reset();
    this.mockAuthFactory.reset();
  }
}
