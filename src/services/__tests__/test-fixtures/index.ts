/**
 * Test Fixtures Index
 *
 * Centralized export for all test fixtures, mocks, and utilities.
 * All test tokens use TEST_ prefix for security.
 */

// Export UnifiedGitHubService test fixtures (modular structure)
export * from './unified';

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
} from './unified';

// Export specific commonly used classes for direct import
export {
  MockPATAuthenticationStrategy,
  MockGitHubAppAuthenticationStrategy,
  MockAuthenticationStrategyFactory,
  MockFetchResponseBuilder,
  MockChromeStorage,
  UnifiedGitHubServiceTestScenarios,
  UnifiedGitHubServiceTestHelpers,
} from './unified';

// Export GitHubAppService specific utilities
export { MockGitHubAppService, GitHubAppServiceTestScenario } from './GitHubAppServiceMocks';

export { setupGitHubAppServiceTest, createTestScenario } from './GitHubAppServiceTestHelpers';

export {
  allScenarios as gitHubAppScenarios,
  scenariosByCategory as gitHubAppScenariosByCategory,
} from './GitHubAppServiceTestSpecification';
