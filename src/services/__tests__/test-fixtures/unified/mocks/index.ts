/**
 * Mock Test Doubles - Centralized exports
 *
 * This module provides mock implementations and test doubles for testing
 * UnifiedGitHubService. Includes authentication strategies, fetch responses,
 * and Chrome storage mocks.
 */

export * from './MockAuthStrategies';
export * from './MockFetchBuilder';
export * from './MockChromeStorage';

// Re-export as organized structure for convenience
import { MockGitHubAppAuthenticationStrategy } from './MockAuthStrategies';
import { MockFetchResponseBuilder } from './MockFetchBuilder';
import { MockChromeStorage } from './MockChromeStorage';

/**
 * Organized collection of mock test doubles
 */
export const TestDoubles = {
  MockGitHubAppAuthenticationStrategy,
  MockFetchResponseBuilder,
  MockChromeStorage,
} as const;
