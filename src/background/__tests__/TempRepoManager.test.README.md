# TempRepoManager Test Suite

Comprehensive test coverage for the TempRepoManager module, focusing on critical business logic and high-risk areas identified in the CRITICAL_TESTING_ANALYSIS.md.

## Test Structure

### 1. Core Unit Tests (`TempRepoManager.test.ts`)

Tests the fundamental functionality of TempRepoManager:

- **Repository Import Pipeline**

  - Happy path import flow
  - Branch detection and defaults
  - Progress callback handling
  - Error handling at each step
  - Edge cases (empty names, special characters, long names)

- **Automatic Repository Cleanup**

  - Time-based deletion logic
  - Forced cleanup behavior
  - Error recovery and retry logic
  - Storage corruption handling
  - Interval management

- **Storage Management**

  - Concurrent operation consistency
  - Metadata persistence
  - Corrupted storage recovery

- **Race Conditions**

  - Cleanup during active imports
  - Repository creation at time boundaries
  - Network timeouts

- **Performance and Resources**
  - Large dataset handling
  - Memory usage patterns

### 2. Critical Scenarios (`TempRepoManager.critical-scenarios.test.ts`)

Tests the most critical user journeys and system behaviors:

- **Complete User Journey**

  - End-to-end import from private repo to Bolt.new
  - User feedback and status messages
  - Error recovery with user-friendly messages

- **Automated Cleanup System**

  - System health maintenance over time
  - Recovery from catastrophic failures
  - Prevention of repository accumulation

- **Data Integrity**

  - Storage consistency across restarts
  - Concurrent modification safety
  - Corrupted storage recovery

- **Error Boundaries**

  - Unrecoverable state prevention
  - Actionable error messages
  - Graceful degradation

- **Performance Under Load**
  - Rapid sequential imports
  - Large-scale cleanup operations

### 3. Edge Cases & Stress Tests (`TempRepoManager.edge-cases.test.ts`)

Tests boundary conditions and extreme scenarios:

- **Boundary Conditions**

  - Repository name edge cases (empty, unicode, special chars, path traversal)
  - Branch name edge cases
  - Time boundary conditions (exact expiry, clock changes)

- **Race Conditions**

  - Simultaneous imports of same repository
  - Cleanup during concurrent imports
  - Rapid interval start/stop
  - Storage operations during concurrent access

- **Stress Testing**

  - Maximum concurrent operations
  - Large storage datasets
  - Memory pressure scenarios

- **Error Recovery**

  - Repeated catastrophic failures
  - Intermittent failures

- **Resource Cleanup**
  - Interval leak prevention
  - Resource cleanup on failure

## Test Coverage Areas

Based on the critical testing analysis, these tests cover:

### ✅ Critical Business Logic

- ✓ Automatic Repository Cleanup
- ✓ Repository Cloning Pipeline
- ✓ Storage Management
- ✓ Error Recovery

### ✅ High-Risk Areas

- ✓ Time-based cleanup with resource leak prevention
- ✓ Complex import pipeline failure points
- ✓ Interval management and memory leaks

### ✅ Potential Failure Points

- ✓ Orphaned repository prevention
- ✓ Storage corruption handling
- ✓ Memory leak prevention
- ✓ GitHub API failure recovery
- ✓ Race condition handling

### ✅ Testing Priorities

- ✓ Cleanup behavior under API failures
- ✓ Storage consistency during concurrent operations
- ✓ Interval management during rapid cycles
- ✓ Repository import with network interruptions
- ✓ Error handling in partial failures

## Running the Tests

```bash
# Run all TempRepoManager tests
pnpm test src/background/__tests__/TempRepoManager

# Run specific test file
pnpm test src/background/__tests__/TempRepoManager.test.ts

# Run with coverage
pnpm test --coverage src/background/__tests__/TempRepoManager

# Run in watch mode for development
pnpm test:watch src/background/__tests__/TempRepoManager
```

## Test Fixtures

The tests use comprehensive fixtures from `src/background/test-fixtures/`:

- **TempRepoManagerTestFixtures.ts** - Test data and mock implementations
- **TempRepoManagerTestHelpers.ts** - Helper functions and utilities
- **TempRepoManagerMocks.ts** - Mock coordination and orchestration
- **TempRepoManagerTestSpecification.ts** - Test strategy and requirements

## Key Testing Patterns

### 1. Lifecycle Management

```typescript
let lifecycle: TempRepoTestLifecycle;
let env: TempRepoManagerTestEnvironment;

beforeEach(() => {
  lifecycle = new TempRepoTestLifecycle();
  env = lifecycle.beforeEach();
});

afterEach(() => {
  lifecycle.afterEach();
});
```

### 2. Scenario-Based Testing

```typescript
// Success scenario
manager = lifecycle.createManager('success');

// Failure scenario
manager = lifecycle.createManager('failure');

// Custom scenario
manager = lifecycle.createManager('custom');
env.setupGitHubServiceFailure('deleteRepo');
```

### 3. Assertion Helpers

```typescript
// Operation tracking
TempRepoAssertionHelpers.expectOperationCompleted(env.mockOperationStateManager, 'import');

// Status progression
TempRepoAssertionHelpers.expectProgressionIncreases(env.mockStatusBroadcaster);

// Storage state
TempRepoAssertionHelpers.expectStorageEmpty(env.mockStorage);

// Tab creation
TempRepoAssertionHelpers.expectBoltTabCreated(env.mockTabs, owner, repo);
```

### 4. Performance Testing

```typescript
const { result, timeMs } = await PerformanceHelpers.measureExecutionTime(async () => {
  return await manager.handlePrivateRepoImport('test-repo');
});

expect(timeMs).toBeLessThan(1000); // Should complete within 1 second
```

### 5. Concurrent Operations

```typescript
const operations = Array(10)
  .fill(null)
  .map((_, i) => manager.handlePrivateRepoImport(`concurrent-${i}`));

await Promise.all(operations);
```

## Test Data

The fixtures provide comprehensive test data:

- **Repository names**: Valid, empty, special characters, unicode, very long
- **Branch names**: Standard branches, feature branches, special characters
- **Timestamps**: Fresh, about to expire, expired, boundary conditions
- **Storage states**: Empty, single repo, multiple repos, corrupted
- **Error scenarios**: API failures, network errors, storage issues

## Debugging Failed Tests

When tests fail, use the debugging helpers:

```typescript
// Print current mock state
DebuggingHelpers.printMockState(env);

// Generate failure report
const report = DebuggingHelpers.createFailureReport(env, 'import', error);
console.log(report);

// Check mock interactions
const interactions = DebuggingHelpers.verifyMockInteractions(env);
```

## Coverage Goals

- **Line Coverage**: 95% minimum
- **Function Coverage**: 100% required
- **Branch Coverage**: 90% minimum
- **Critical Paths**: 100% coverage

All critical business logic paths and error scenarios must be covered.

## Contributing

When adding new tests:

1. Follow the established patterns for lifecycle management
2. Use the provided fixtures and helpers
3. Focus on behavior, not implementation
4. Test both success and failure paths
5. Include edge cases and boundary conditions
6. Document complex test scenarios
7. Ensure tests are deterministic and fast
