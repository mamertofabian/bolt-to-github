/**
 * Unified GitHub Service Test Fixtures - Main Index
 *
 * Centralized export point for all test fixtures, mocks, scenarios, and helpers.
 * This module provides backward compatibility with the original monolithic fixture file
 * while also enabling modular imports for better performance.
 *
 * ## Quick Start
 *
 * ```typescript
 * // Import everything (backward compatible)
 * import { TestFixtures, TestDoubles, TestScenarios, TestHelpers } from './test-fixtures/unified';
 *
 * // Import specific modules for better performance
 * import { TokenFixtures } from './test-fixtures/unified/tokens';
 * import { GitHubUserResponses } from './test-fixtures/unified/api-responses';
 * import { MockPATAuthenticationStrategy } from './test-fixtures/unified/mocks';
 * ```
 *
 * ## Module Organization
 *
 * - **api-responses**: GitHub API response fixtures (users, repos, branches, commits, files)
 * - **errors**: Error response fixtures for testing failure scenarios
 * - **issues**: Issue and comment fixtures with lazy loading
 * - **storage**: Chrome Extension and Supabase storage fixtures
 * - **tokens**: Secure test tokens with TEST_ prefix for safety
 * - **mocks**: Mock implementations (auth strategies, fetch builder, chrome storage)
 * - **scenarios**: Pre-built test scenario builders
 * - **helpers**: Test utility functions and assertions
 */

// =============================================================================
// MODULAR EXPORTS (for performance-conscious imports)
// =============================================================================

export * from './api-responses';
export * from './errors';
export * from './issues';
export * from './storage';
export * from './tokens';
export * from './mocks';
export * from './scenarios';
export * from './helpers';

// =============================================================================
// ORGANIZED COLLECTIONS (backward compatible structure)
// =============================================================================

import { GitHubAPIResponses } from './api-responses';
import { ErrorFixtures } from './errors';
import { IssueFixtures } from './issues';
import { StorageFixtures } from './storage';
import { TokenFixtures } from './tokens';

import {
  MockPATAuthenticationStrategy,
  MockGitHubAppAuthenticationStrategy,
  MockAuthenticationStrategyFactory,
  MockFetchResponseBuilder,
  MockChromeStorage,
} from './mocks';

import { UnifiedGitHubServiceTestScenarios } from './scenarios';
import { UnifiedGitHubServiceTestHelpers } from './helpers';

/**
 * Test Fixtures Collection
 *
 * Contains all static test data organized by category.
 * Use these for realistic GitHub API responses, tokens, errors, and storage states.
 *
 * @example
 * ```typescript
 * const repo = TestFixtures.GitHubAPIResponses.repository.existing;
 * const token = TestFixtures.TokenFixtures.pat.classic;
 * const error = TestFixtures.ErrorFixtures.unauthorized;
 * ```
 */
export const TestFixtures = {
  GitHubAPIResponses,
  IssueFixtures,
  ErrorFixtures,
  TokenFixtures,
  StorageFixtures,
} as const;

/**
 * Test Doubles Collection
 *
 * Contains mock implementations that accurately reflect real service behavior.
 * Use these for controlled testing with configurable success/failure modes.
 *
 * @example
 * ```typescript
 * const mockStrategy = new TestDoubles.MockPATAuthenticationStrategy('TEST_token');
 * const mockFetch = new TestDoubles.MockFetchResponseBuilder()
 *   .mockRepoExists('owner', 'repo', true)
 *   .build();
 * ```
 */
export const TestDoubles = {
  MockPATAuthenticationStrategy,
  MockGitHubAppAuthenticationStrategy,
  MockAuthenticationStrategyFactory,
  MockFetchResponseBuilder,
  MockChromeStorage,
} as const;

/**
 * Test Scenarios Collection
 *
 * Contains pre-built scenario builders for common testing situations.
 * Use these for quick setup of complex test scenarios.
 *
 * @example
 * ```typescript
 * const scenario = new TestScenarios.UnifiedGitHubServiceTestScenarios()
 *   .setupSuccessfulPATAuthentication()
 *   .setupRepositoryOperations()
 *   .build();
 * ```
 */
export const TestScenarios = {
  UnifiedGitHubServiceTestScenarios,
} as const;

/**
 * Test Helpers Collection
 *
 * Contains utility functions for test setup, assertions, and data generation.
 * Use these for common testing operations.
 *
 * @example
 * ```typescript
 * const authConfig = TestHelpers.UnifiedGitHubServiceTestHelpers.createAuthConfig('pat');
 * await TestHelpers.UnifiedGitHubServiceTestHelpers.expectAsyncError(
 *   service.someMethod(),
 *   'Expected error message'
 * );
 * ```
 */
export const TestHelpers = {
  UnifiedGitHubServiceTestHelpers,
} as const;

/**
 * Default export with all organized collections
 *
 * Provides a single import point for all test fixtures and utilities.
 *
 * @example
 * ```typescript
 * import testFixtures from './test-fixtures/unified';
 *
 * const repo = testFixtures.fixtures.GitHubAPIResponses.repository.existing;
 * const mockStrategy = new testFixtures.doubles.MockPATAuthenticationStrategy('TEST_token');
 * ```
 */
export default {
  fixtures: TestFixtures,
  doubles: TestDoubles,
  scenarios: TestScenarios,
  helpers: TestHelpers,
} as const;
