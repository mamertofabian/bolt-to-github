/**
 * Test Fixtures Index
 *
 * Centralized export for all UnifiedGitHubService test fixtures, mocks, and utilities.
 * This module provides easy access to comprehensive testing infrastructure.
 */

// Export everything from the main fixtures file
export * from './UnifiedGitHubServiceFixtures';

// Re-export with more convenient naming
export {
  TestFixtures as Fixtures,
  TestDoubles as Mocks,
  TestScenarios as Scenarios,
  TestHelpers as Helpers,
} from './UnifiedGitHubServiceFixtures';

// Export specific commonly used classes for direct import
export {
  MockPATAuthenticationStrategy,
  MockGitHubAppAuthenticationStrategy,
  MockAuthenticationStrategyFactory,
  MockFetchResponseBuilder,
  MockChromeStorage,
  UnifiedGitHubServiceTestScenarios,
  UnifiedGitHubServiceTestHelpers,
} from './UnifiedGitHubServiceFixtures';
