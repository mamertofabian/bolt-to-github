/**
 * Mock Fetch Response Builder for Testing
 *
 * This module provides a fluent builder for mocking fetch responses in tests.
 * Supports repository operations, issue management, and various error scenarios
 * with configurable delays and failure modes.
 */

import { vi, type MockedFunction } from 'vitest';
import { GitHubAPIResponses } from '../api-responses';
import { IssueFixtures } from '../issues';
import { ErrorFixtures } from '../errors';

/**
 * Builder for creating mock fetch responses with fluent API
 *
 * Provides comprehensive mocking for GitHub API calls including:
 * - Repository operations (CRUD, listing, branches)
 * - File operations (push, get)
 * - Issue operations (list, get, create, comment)
 * - Error scenarios (unauthorized, rate limited, network errors)
 * - Configurable delays and failure modes
 *
 * @example
 * ```ts
 * const mockFetch = new MockFetchResponseBuilder()
 *   .mockRepoExists('owner', 'repo', true)
 *   .mockListBranches('owner', 'repo')
 *   .build();
 * ```
 */
export class MockFetchResponseBuilder {
  private responses: Map<
    string,
    { response: Partial<Response> | Promise<Partial<Response>>; options?: RequestInit }
  > = new Map();
  private defaultResponse: Partial<Response> | null = null;
  private callCount = 0;
  private shouldFail = false;
  private delay = 0;

  // Repository operations
  mockRepoExists(owner: string, repo: string, exists: boolean): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}`;
    if (exists) {
      this.responses.set(key, {
        response: {
          ok: true,
          status: 200,
          json: () => Promise.resolve(GitHubAPIResponses.repository.existing),
        },
      });
    } else {
      this.responses.set(key, {
        response: {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: () => Promise.resolve(ErrorFixtures.notFound.error),
        },
      });
    }
    return this;
  }

  mockGetRepoInfo(owner: string, repo: string, repoData?: Record<string, unknown>): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () => Promise.resolve(repoData || GitHubAPIResponses.repository.existing),
      },
    });
    return this;
  }

  mockCreateRepo(repoData?: Record<string, unknown>): this {
    const key = `POST:https://api.github.com/user/repos`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(repoData || GitHubAPIResponses.repository.created),
      },
    });
    return this;
  }

  mockDeleteRepo(owner: string, repo: string): this {
    const key = `DELETE:https://api.github.com/repos/${owner}/${repo}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 204,
      },
    });
    return this;
  }

  mockListRepos(repos?: Record<string, unknown>[]): this {
    const key = `GET:https://api.github.com/user/repos?sort=updated&per_page=100`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () => Promise.resolve(repos || GitHubAPIResponses.repositories.userRepos),
      },
    });
    return this;
  }

  mockListBranches(owner: string, repo: string, branches?: Record<string, unknown>[]): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}/branches`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () => Promise.resolve(branches || GitHubAPIResponses.branches.typical),
      },
    });
    return this;
  }

  mockPushFile(owner: string, repo: string, path: string): this {
    const key = `PUT:https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(GitHubAPIResponses.filePush.created),
      },
    });
    return this;
  }

  // Issue operations
  mockGetIssues(
    owner: string,
    repo: string,
    state: string = 'open',
    issues?: Record<string, unknown>[]
  ): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}/issues?state=${state}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            issues || (state === 'open' ? IssueFixtures.openIssues : IssueFixtures.allIssues)
          ),
      },
    });
    return this;
  }

  mockGetIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    issue?: Record<string, unknown>
  ): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () => Promise.resolve(issue || IssueFixtures.openIssue),
      },
    });
    return this;
  }

  mockCreateIssue(owner: string, repo: string, issue?: Record<string, unknown>): this {
    const key = `POST:https://api.github.com/repos/${owner}/${repo}/issues`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(issue || IssueFixtures.createdIssue),
      },
    });
    return this;
  }

  mockAddIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    comment?: Record<string, unknown>
  ): this {
    const key = `POST:https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(comment || IssueFixtures.comment),
      },
    });
    return this;
  }

  // Error scenarios
  mockUnauthorized(endpoint: string): this {
    this.responses.set(endpoint, {
      response: {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve(ErrorFixtures.unauthorized.error),
      },
    });
    return this;
  }

  mockRateLimited(endpoint: string): this {
    const headers = new Headers();
    Object.entries(ErrorFixtures.rateLimited.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });

    this.responses.set(endpoint, {
      response: {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers,
        json: () => Promise.resolve(ErrorFixtures.rateLimited.error),
      },
    });
    return this;
  }

  mockNetworkError(endpoint: string): this {
    this.responses.set(endpoint, {
      response: Promise.reject(ErrorFixtures.networkError),
    });
    return this;
  }

  mockServerError(endpoint: string): this {
    this.responses.set(endpoint, {
      response: {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve(ErrorFixtures.serverError.error),
      },
    });
    return this;
  }

  // Configuration
  setDelay(delay: number): this {
    this.delay = delay;
    return this;
  }

  setShouldFail(shouldFail: boolean): this {
    this.shouldFail = shouldFail;
    return this;
  }

  setDefaultResponse(response: Partial<Response>): this {
    this.defaultResponse = response;
    return this;
  }

  // Build and install the mock
  build(): MockedFunction<typeof fetch> {
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      this.callCount++;

      // Simulate delay
      if (this.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delay));
      }

      // Handle general failure mode
      if (this.shouldFail) {
        throw ErrorFixtures.networkError;
      }

      // Determine request key
      const urlStr =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      const key = `${method}:${urlStr}`;

      // Check for exact match
      const exactMatch = this.responses.get(key);
      if (exactMatch) {
        const response = exactMatch.response;
        // Handle promise rejection responses
        if (response instanceof Promise) {
          return await response;
        }
        return response;
      }

      // Check for pattern matches (for cache-busted URLs, etc.)
      for (const [pattern, responseData] of this.responses.entries()) {
        if (this.matchesPattern(key, pattern)) {
          const response = responseData.response;
          // Handle promise rejection responses
          if (response instanceof Promise) {
            return await response;
          }
          return response;
        }
      }

      // Return default response or 404
      if (this.defaultResponse) {
        return this.defaultResponse;
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve(ErrorFixtures.notFound.error),
      };
    }) as MockedFunction<typeof fetch>;

    global.fetch = mockFetch;
    return mockFetch;
  }

  private matchesPattern(key: string, pattern: string): boolean {
    // Handle cache-busted URLs by removing query parameters for comparison
    const baseKey = key.split('?')[0];
    const basePattern = pattern.split('?')[0];
    return baseKey === basePattern;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.responses.clear();
    this.defaultResponse = null;
    this.callCount = 0;
    this.shouldFail = false;
    this.delay = 0;
    vi.clearAllMocks();
  }
}
