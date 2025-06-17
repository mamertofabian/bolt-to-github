# Test Fixtures Documentation

Comprehensive test fixtures, mocks, and utilities for testing GitHub-related services including `UnifiedGitHubService` and `GitHubAppService`.

## Overview

This directory contains test fixtures for multiple GitHub-related services. The fixtures are designed to:

1. **Cover Normal, Edge, and Error Cases** - Comprehensive scenarios including success paths, failure modes, and boundary conditions
2. **Reflect Real Usage Patterns** - Fixtures based on actual GitHub API responses and real-world usage scenarios
3. **Minimize Extensive Mocking** - Focus on controlled test environments rather than heavy mocking
4. **Enable Reusable Testing** - Modular design allows fixtures to be shared across multiple test files
5. **Reveal Actual Bugs** - Realistic data and scenarios designed to expose real issues

## Structure

### Core Components

- **`TestFixtures`** - Static data representing GitHub API responses, tokens, and storage states
- **`TestDoubles`** - Mock implementations that accurately reflect real service behavior
- **`TestScenarios`** - Pre-built scenario builders for common testing situations
- **`TestHelpers`** - Utility functions for test setup, teardown, and assertions

### Key Features

#### 1. GitHub API Response Fixtures

```typescript
import { TestFixtures } from './test-fixtures';

// Use realistic repository data
const repo = TestFixtures.GitHubAPIResponses.repository.existing;
const issues = TestFixtures.IssueFixtures.openIssues;
```

#### 2. Authentication Strategy Test Doubles

```typescript
import { MockPATAuthenticationStrategy } from './test-fixtures';

const mockStrategy = new MockPATAuthenticationStrategy('test-token');
mockStrategy.setShouldFail(true); // Configure failure scenarios
```

#### 3. Scenario Builders

```typescript
import { UnifiedGitHubServiceTestScenarios } from './test-fixtures';

const scenario = new UnifiedGitHubServiceTestScenarios()
  .setupSuccessfulPATAuthentication()
  .setupRepositoryOperations()
  .build();
```

#### 4. Mock Response Builder

```typescript
import { MockFetchResponseBuilder } from './test-fixtures';

const mockFetch = new MockFetchResponseBuilder()
  .mockRepoExists('owner', 'repo', true)
  .mockCreateRepo()
  .build();
```

## Usage Examples

### Basic Setup

```typescript
import { UnifiedGitHubServiceTestScenarios, TestHelpers, TestFixtures } from './test-fixtures';

describe('UnifiedGitHubService', () => {
  let scenario: UnifiedGitHubServiceTestScenarios;
  let githubService: UnifiedGitHubService;

  beforeEach(() => {
    scenario = new UnifiedGitHubServiceTestScenarios();
  });

  afterEach(() => {
    scenario.reset();
  });
});
```

### Testing Successful Operations

```typescript
it('should successfully validate PAT authentication', async () => {
  // Setup successful PAT scenario
  const { mockFetch, mockStorage } = scenario.setupSuccessfulPATAuthentication().build();

  const githubService = new UnifiedGitHubService(
    TestHelpers.UnifiedGitHubServiceTestHelpers.createAuthConfig('pat')
  );

  const result = await githubService.validateToken();
  expect(result).toBe(true);
});
```

### Testing Error Scenarios

```typescript
it('should handle authentication failures gracefully', async () => {
  const { mockFetch } = scenario.setupAuthenticationFailure().build();

  const githubService = new UnifiedGitHubService('invalid-token');

  await TestHelpers.UnifiedGitHubServiceTestHelpers.expectAsyncError(
    githubService.validateToken(),
    'Invalid PAT token'
  );
});
```

### Testing Network Issues

```typescript
it('should handle rate limiting with proper error messages', async () => {
  const { mockFetch } = scenario.setupRateLimiting('testuser', 'test-repo').build();

  const githubService = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

  const error = await TestHelpers.UnifiedGitHubServiceTestHelpers.expectAsyncError(
    githubService.repoExists('testuser', 'test-repo')
  );

  expect(error.message).toContain('Rate limit exceeded');
});
```

### Testing Performance Scenarios

```typescript
it('should handle slow network conditions', async () => {
  const { mockFetch } = scenario
    .setupSlowNetwork(5000) // 5 second delay
    .setupSuccessfulPATAuthentication()
    .build();

  const githubService = new UnifiedGitHubService(TestFixtures.TokenFixtures.pat.classic);

  const startTime = Date.now();
  await githubService.validateToken();
  const duration = Date.now() - startTime;

  expect(duration).toBeGreaterThan(4900); // Allow some variance
});
```

## Available Fixtures

### Authentication Fixtures

- **PAT Tokens** - Classic and fine-grained personal access tokens
- **GitHub App Tokens** - Installation and user tokens
- **OAuth Tokens** - Access and refresh tokens
- **Invalid Tokens** - Malformed and expired tokens

### Repository Fixtures

- **Repository Data** - Public, private, existing, and non-existent repositories
- **Branch Data** - Single and multiple branch scenarios
- **File Content** - Various file types and encodings
- **Commit Data** - Commit history and metadata

### Issue Fixtures

- **Issues** - Open, closed, with various labels and assignees
- **Comments** - Issue comments with reactions
- **Creation Data** - Newly created issues and comments

### Error Fixtures

- **HTTP Errors** - 401, 403, 404, 429, 500, 502 responses
- **Network Errors** - Timeout, connection, and abort errors
- **Validation Errors** - GitHub API validation failures

### Storage Fixtures

- **Chrome Storage** - Extension storage with various configurations
- **Supabase Storage** - Authentication tokens and session data

## Test Doubles

### Authentication Strategy Mocks

- **`MockPATAuthenticationStrategy`** - Configurable PAT authentication behavior
- **`MockGitHubAppAuthenticationStrategy`** - GitHub App authentication simulation
- **`MockAuthenticationStrategyFactory`** - Strategy creation and management

### Service Mocks

- **`MockFetchResponseBuilder`** - HTTP response simulation
- **`MockChromeStorage`** - Extension storage simulation

### Configuration Options

All test doubles support:

- **Failure Simulation** - Configure specific failure modes
- **Delay Simulation** - Add realistic network delays
- **State Management** - Track and verify internal state changes

## Scenario Builders

### Authentication Scenarios

- `setupSuccessfulPATAuthentication()` - Valid PAT token flow
- `setupSuccessfulGitHubAppAuthentication()` - GitHub App authentication
- `setupAuthenticationFailure()` - Authentication errors

### Repository Scenarios

- `setupRepositoryOperations()` - Basic repository CRUD operations
- `setupRepositoryNotFound()` - Non-existent repository handling
- `setupPermissionDenied()` - Insufficient permissions

### Error Scenarios

- `setupNetworkFailure()` - Network connectivity issues
- `setupRateLimiting()` - GitHub API rate limit responses
- `setupSlowNetwork()` - Performance testing scenarios

### Issue Management Scenarios

- `setupIssueOperations()` - Issue creation, reading, updating

## Test Helpers

### Utilities

- **`createAuthConfig()`** - Build authentication configuration objects
- **`waitForAsync()`** - Async timing utilities
- **`createMockResponse()`** - HTTP response creation
- **`generateTestToken()`** - Token generation for different types

### Assertions

- **`expectValidGitHubApiCall()`** - Verify API call parameters
- **`expectNoGitHubApiCalls()`** - Ensure no unintended API calls
- **`expectAsyncError()`** - Async error testing utility
- **`verifyErrorStructure()`** - Error object validation

### Data Creation

- **`createTestRepository()`** - Repository data with overrides
- **`createTestIssue()`** - Issue data with customization

## Best Practices

### 1. Realistic Data Usage

```typescript
// Good: Use realistic fixture data
const repo = TestFixtures.GitHubAPIResponses.repository.existing;

// Avoid: Creating minimal test data
const repo = { name: 'test' };
```

### 2. Scenario-Based Testing

```typescript
// Good: Use scenario builders for complex setups
const scenario = new UnifiedGitHubServiceTestScenarios()
  .setupSuccessfulPATAuthentication()
  .setupRepositoryOperations();

// Avoid: Manual mock configuration in every test
```

### 3. Proper Cleanup

```typescript
afterEach(() => {
  scenario.reset(); // Always reset between tests
});
```

### 4. Error Testing

```typescript
// Good: Test specific error conditions
await TestHelpers.UnifiedGitHubServiceTestHelpers.expectAsyncError(
  service.someMethod(),
  'Expected error message'
);

// Avoid: Generic error catching
```

### 5. Performance Testing

```typescript
// Good: Test realistic performance scenarios
scenario.setupSlowNetwork(2000); // Simulate 2s delay

// Avoid: Testing with unrealistic conditions
```

## Integration with Existing Tests

These fixtures are designed to work alongside the existing test infrastructure:

- **Compatible with Jest** - All mocks use Jest's mocking capabilities
- **Follows Existing Patterns** - Similar structure to BackgroundService fixtures
- **Extends Current Coverage** - Builds upon existing GitHubService.feedback.test.ts

## Contributing

When adding new fixtures:

1. **Follow the Pattern** - Use the established structure and naming conventions
2. **Include Edge Cases** - Add both normal and boundary condition data
3. **Document Usage** - Provide clear examples in this README
4. **Test the Fixtures** - Ensure fixtures themselves work correctly
5. **Maintain Realism** - Base fixtures on actual GitHub API responses

## GitHubAppService Test Fixtures

### Overview

The GitHubAppService test fixtures provide comprehensive testing infrastructure for GitHub App authentication and token management.

### Quick Start

```typescript
import { setupGitHubAppServiceTest, createTestScenario, gitHubAppScenarios } from './test-fixtures';

// Set up test environment
const env = setupGitHubAppServiceTest({
  useRealService: true,
  withSupabaseToken: true,
});

// Use predefined scenarios
const scenario = createTestScenario('authenticated');

// Run tests
const result = await env.service.getAccessToken();

// Clean up
env.cleanup();
```

### Available Components

#### GitHubAppServiceTestFixtures.ts

- **Authentication Data**: OAuth responses, token data, installation info
- **Error Fixtures**: Various error responses from Supabase and GitHub
- **Storage Data**: Chrome storage configurations
- **Edge Cases**: Expired tokens, partial data, restricted permissions

#### GitHubAppServiceMocks.ts

- **MockGitHubAppService**: Controllable service implementation
- **MockChromeStorage**: In-memory Chrome storage
- **MockFetchHandler**: HTTP response simulation
- **GitHubAppServiceTestScenario**: Fluent scenario builder

#### GitHubAppServiceTestHelpers.ts

- **setupGitHubAppServiceTest()**: Complete environment setup
- **createTestScenario()**: Pre-configured scenarios
- **Assertion Helpers**: `assertFetchCall()`, `assertStorageUpdate()`
- **Time Utilities**: Token expiry testing
- **Error Simulation**: Network, auth, rate limit errors

#### GitHubAppServiceTestSpecification.ts

- **Authentication Scenarios**: OAuth flow testing
- **Token Management**: Renewal, expiry, validation
- **Installation Scenarios**: GitHub App installations
- **Permission Scenarios**: Access control testing
- **Error Scenarios**: Comprehensive error handling
- **Edge Cases**: Concurrent operations, malformed data

### Usage Examples

#### Testing OAuth Flow

```typescript
const env = setupGitHubAppServiceTest();
setupCommonMockResponses(env.fetchMock, 'success');

const result = await env.service.completeOAuthFlow('valid_code', 'state_123');
expect(result.success).toBe(true);
expect(result.installation_found).toBe(true);
```

#### Testing Token Renewal

```typescript
const env = setupGitHubAppServiceTest({
  initialConfig: createGitHubAppConfigWithExpiry(-3600000), // Expired
});

await simulateTokenRenewal(env.service, env.fetchMock);
const token = await env.service.getAccessToken();
expect(token.renewed).toBe(true);
```

#### Testing Error Conditions

```typescript
const env = setupGitHubAppServiceTest();
simulateError(env.fetchMock, 'network');

await expect(env.service.getAccessToken()).rejects.toThrow('Network error');
```

## Related Files

- `src/services/UnifiedGitHubService.ts` - Unified service implementation
- `src/services/GitHubAppService.ts` - GitHub App service implementation
- `src/services/__tests__/` - Test files using these fixtures
- `src/background/test-fixtures/` - Similar fixture pattern for background services
