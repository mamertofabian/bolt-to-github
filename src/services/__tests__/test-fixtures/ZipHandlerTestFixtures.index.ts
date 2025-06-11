/**
 * ZipHandler Test Fixtures Index
 *
 * Central export point for all ZipHandler test fixtures, mocks, and helpers
 */

// Export test data and fixtures
export * from './ZipHandlerTestFixtures';

// Export mock implementations
export * from './ZipHandlerMocks';

// Export test helpers and utilities
export * from './ZipHandlerTestHelpers';

// Export test specifications
export * from './ZipHandlerTestSpecification';

// Re-export commonly used items for convenience
export {
  createTestEnvironment,
  cleanupTestEnvironment,
  TestScenarios,
  TestAssertions,
  setupTestProject,
  waitForAsync,
} from './ZipHandlerTestHelpers';

export {
  createTestBlob,
  ZIP_FILE_FIXTURES,
  GITHUB_API_RESPONSES,
  ERROR_SCENARIOS,
  TEST_PROJECTS,
  CHROME_STORAGE_FIXTURES,
  COMPARISON_RESULTS,
} from './ZipHandlerTestFixtures';

export {
  MockUnifiedGitHubService,
  MockGitHubComparisonService,
  MockStatusCallback,
  MockChromeStorage,
  MockPushStatisticsActions,
} from './ZipHandlerMocks';
