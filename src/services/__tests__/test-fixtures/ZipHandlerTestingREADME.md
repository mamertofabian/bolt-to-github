# ZipHandler Test Fixtures

This directory contains comprehensive test fixtures for testing the ZipHandler class, which is responsible for processing ZIP files from Bolt and uploading them to GitHub repositories.

## Overview

The test fixtures are designed to:

- Provide realistic test data covering normal, edge, and error cases
- Build test doubles that accurately reflect real behavior
- Create controlled test environments instead of extensive mocking
- Offer reusable helpers for test setup and teardown
- Document test specifications and scenarios

## File Structure

### ZipHandlerTestFixtures.ts

Contains realistic test data including:

- **ZIP_FILE_FIXTURES**: Various project structures (simple, TypeScript, large, with gitignore, etc.)
- **GITHUB_API_RESPONSES**: Mock GitHub API responses for different scenarios
- **CHROME_STORAGE_FIXTURES**: Chrome storage configurations
- **STATUS_UPDATE_FIXTURES**: Expected status update sequences
- **COMPARISON_RESULTS**: File comparison scenarios
- **ERROR_SCENARIOS**: Common error conditions
- **TEST_PROJECTS**: Project configurations for testing

### ZipHandlerMocks.ts

Provides test doubles for dependencies:

- **MockUnifiedGitHubService**: Controllable GitHub API client
- **MockGitHubComparisonService**: File comparison service mock
- **MockStatusCallback**: Status update tracker
- **MockChromeStorage**: Chrome storage API mock
- **MockPushStatisticsActions**: Push statistics recorder

### ZipHandlerTestHelpers.ts

Helper functions for test setup:

- **createTestEnvironment()**: Sets up complete test environment
- **cleanupTestEnvironment()**: Cleans up after tests
- **TestScenarios**: Pre-built test scenarios
- **TestAssertions**: Common assertion helpers
- **NetworkConditions**: Simulate different network conditions

### ZipHandlerTestSpecification.ts

Comprehensive test specifications:

- Categorized test scenarios
- Expected behaviors
- Edge cases
- Performance benchmarks
- Test priorities

## Usage Example

```typescript
import {
  createTestEnvironment,
  cleanupTestEnvironment,
  TestScenarios,
  TestAssertions,
  ZIP_FILE_FIXTURES,
  createTestBlob,
} from './test-fixtures/ZipHandlerTestFixtures.index';

describe('ZipHandler', () => {
  let env: ZipHandlerTestEnvironment;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment(env);
  });

  it('should upload a simple project successfully', async () => {
    await TestScenarios.simpleUpload(env);
    TestAssertions.expectSuccessfulUpload(env, 4);
  });

  it('should handle rate limiting gracefully', async () => {
    env.githubService.setRateLimit(2);
    const blob = createTestBlob(ZIP_FILE_FIXTURES.simpleProject);

    await env.zipHandler.processZipFile(blob, 'project-123', 'Test commit');

    expect(env.statusCallback.findStatus((s) => s.message?.includes('Rate limit'))).toBeDefined();
  });
});
```

## Key Features

### Realistic Test Data

- Various project types (HTML/CSS/JS, TypeScript, etc.)
- Edge cases (empty projects, special characters, binary files)
- Large projects for performance testing
- Projects with .gitignore rules

### Controlled Test Doubles

- Configurable responses and behaviors
- Request history tracking
- Error simulation
- Network delay simulation
- Rate limit simulation

### Test Scenarios

Pre-built scenarios for common testing needs:

- Simple uploads
- No-change detection
- Rate limit handling
- Network errors
- Large project batching
- Empty repository initialization

### Assertion Helpers

Common assertions for:

- Successful uploads
- API call verification
- Error conditions
- Status update sequences

## Best Practices

1. **Use Test Environment**
   Always use `createTestEnvironment()` for consistent setup.

2. **Clean Up**
   Always call `cleanupTestEnvironment()` in afterEach.

3. **Use Fixtures**
   Prefer pre-defined fixtures over creating test data inline.

4. **Test Scenarios**
   Use `TestScenarios` for common test cases.

5. **Assertions**
   Use `TestAssertions` for consistent verification.

## Performance Considerations

The fixtures are designed to be lightweight while still being realistic:

- Mock services return immediately by default
- Network delays can be simulated when needed
- Large file sets are generated efficiently
- Memory usage is kept minimal

## Extending the Fixtures

To add new test scenarios:

1. Add test data to `ZipHandlerTestFixtures.ts`
2. Create helper methods in `ZipHandlerTestHelpers.ts`
3. Document in `ZipHandlerTestSpecification.ts`
4. Export from `ZipHandlerTestFixtures.index.ts`
