/**
 * Test Fixtures Index
 *
 * Centralized export for all test fixtures, mocks, and utilities.
 * This module provides easy access to comprehensive testing infrastructure.
 */

// Export UnifiedGitHubService test fixtures
export * from './UnifiedGitHubServiceFixtures';

// Export GitHubAppService test fixtures
export * from './GitHubAppServiceTestFixtures';
export * from './GitHubAppServiceMocks';
export * from './GitHubAppServiceTestHelpers';
export * from './GitHubAppServiceTestSpecification';

// Re-export UnifiedGitHubService with more convenient naming
export {
  TestFixtures as UnifiedFixtures,
  TestDoubles as UnifiedMocks,
  TestScenarios as UnifiedScenarios,
  TestHelpers as UnifiedHelpers,
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

// Export GitHubAppService specific utilities
export { MockGitHubAppService, GitHubAppServiceTestScenario } from './GitHubAppServiceMocks';

export { setupGitHubAppServiceTest, createTestScenario } from './GitHubAppServiceTestHelpers';

export {
  allScenarios as gitHubAppScenarios,
  scenariosByCategory as gitHubAppScenariosByCategory,
} from './GitHubAppServiceTestSpecification';
