/**
 * Test Helper Utilities for UnifiedGitHubService
 *
 * This module provides utility functions for common testing operations,
 * including authentication config creation, async waiting, response mocking,
 * and assertion helpers.
 */

import type { MockedFunction } from 'vitest';
import type { AuthenticationConfig, AuthenticationType } from '../../../../types/authentication';
import { TokenFixtures } from '../tokens';
import { GitHubAPIResponses } from '../api-responses';
import { IssueFixtures } from '../issues';

/**
 * Collection of utility functions for testing UnifiedGitHubService
 *
 * Provides helper methods for:
 * - Creating test authentication configurations
 * - Async operation utilities (waiting, promises)
 * - Mock response creation
 * - API call assertions
 * - Test data generation
 * - Error handling verification
 */
export class UnifiedGitHubServiceTestHelpers {
  /**
   * Create authentication configuration for testing
   * @param type Authentication type ('pat' or 'github_app')
   * @param token Optional token override
   * @returns Authentication configuration object
   */
  static createAuthConfig(type: AuthenticationType, token?: string): AuthenticationConfig {
    return {
      type,
      token: token || (type === 'pat' ? TokenFixtures.pat.classic : undefined),
    };
  }

  /**
   * Wait for async operations to complete
   * @param ms Milliseconds to wait (default: 0 for next tick)
   * @returns Promise that resolves after delay
   */
  static async waitForAsync(ms: number = 0): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a mock Response object for testing
   * @param data Response data to return
   * @param status HTTP status code (default: 200)
   * @param ok Whether response is successful (default: true)
   * @returns Mock Response object
   */
  static createMockResponse(data: unknown, status: number = 200, ok: boolean = true): Response {
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
      headers: new Headers(),
      body: null,
      bodyUsed: false,
      redirected: false,
      type: 'basic',
      url: '',
    } as Response;
  }

  /**
   * Assert that a GitHub API call was made with correct parameters
   * @param mockFetch Mocked fetch function
   * @param expectedUrl Expected API endpoint URL
   * @param expectedMethod Expected HTTP method (default: 'GET')
   * @param expectedHeaders Optional additional headers to verify
   */
  static expectValidGitHubApiCall(
    mockFetch: MockedFunction<typeof fetch>,
    expectedUrl: string,
    expectedMethod: string = 'GET',
    expectedHeaders?: Record<string, string>
  ): void {
    // For GET requests, options might be undefined
    if (expectedMethod === 'GET') {
      expect(mockFetch).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/Bearer .+/),
            Accept: 'application/vnd.github.v3+json',
            ...expectedHeaders,
          }),
        })
      );
    } else {
      expect(mockFetch).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({
          method: expectedMethod,
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/Bearer .+/),
            Accept: 'application/vnd.github.v3+json',
            ...expectedHeaders,
          }),
        })
      );
    }
  }

  /**
   * Assert that no GitHub API calls were made
   * @param mockFetch Mocked fetch function
   */
  static expectNoGitHubApiCalls(mockFetch: MockedFunction<typeof fetch>): void {
    expect(mockFetch).not.toHaveBeenCalled();
  }

  /**
   * Generate a test token for a specific type
   * @param type Token type to generate
   * @returns Test token string
   */
  static generateTestToken(type: 'pat' | 'github_app' | 'invalid' = 'pat'): string {
    switch (type) {
      case 'pat':
        return TokenFixtures.pat.classic;
      case 'github_app':
        return TokenFixtures.githubApp.valid;
      case 'invalid':
        return TokenFixtures.pat.invalid;
      default:
        return TokenFixtures.pat.classic;
    }
  }

  /**
   * Create a test repository object with optional overrides
   * @param overrides Properties to override in the base repository object
   * @returns Repository object for testing
   */
  static createTestRepository(
    overrides: Partial<Record<string, unknown>> = {}
  ): Record<string, unknown> {
    return {
      ...GitHubAPIResponses.repository.existing,
      ...overrides,
    };
  }

  /**
   * Create a test issue object with optional overrides
   * @param overrides Properties to override in the base issue object
   * @returns Issue object for testing
   */
  static createTestIssue(
    overrides: Partial<Record<string, unknown>> = {}
  ): Record<string, unknown> {
    return {
      ...IssueFixtures.openIssue,
      ...overrides,
    };
  }

  /**
   * Verify that an error has the expected structure and message
   * @param error Error to verify
   * @param expectedMessage Optional expected error message substring
   */
  static verifyErrorStructure(error: unknown, expectedMessage?: string): void {
    expect(error).toBeInstanceOf(Error);
    if (expectedMessage) {
      expect((error as Error).message).toContain(expectedMessage);
    }
  }

  /**
   * Expect a promise to reject with an error
   * @param promise Promise that should reject
   * @param expectedMessage Optional expected error message substring
   * @returns The caught error for further assertions
   */
  static async expectAsyncError(
    promise: Promise<unknown>,
    expectedMessage?: string
  ): Promise<Error> {
    try {
      await promise;
      throw new Error('Expected promise to reject, but it resolved');
    } catch (error) {
      if (expectedMessage) {
        expect(error instanceof Error ? error.message : String(error)).toContain(expectedMessage);
      }
      return error as Error;
    }
  }
}
