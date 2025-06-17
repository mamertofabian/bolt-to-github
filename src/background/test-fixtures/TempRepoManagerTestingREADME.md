# TempRepoManager Test Fixtures

This directory contains comprehensive test fixtures for the `TempRepoManager` class, designed to enable thorough testing of repository import and cleanup functionality.

## Overview

The `TempRepoManager` is responsible for:

- Managing temporary GitHub repositories created during private repository imports
- Automatic cleanup of expired temporary repositories
- Progress tracking and status broadcasting during import operations
- Error recovery and resource management

## Test Architecture

### Core Components

1. **TempRepoManagerTestFixtures.ts** - Realistic test data, mock implementations, and test environment setup
2. **TempRepoManagerTestHelpers.ts** - Factory functions, lifecycle management, and utility helpers
3. **TempRepoManagerMocks.ts** - Mock coordination and service factory patterns
4. **TempRepoManagerTestSpecification.ts** - Test strategy, scenarios, and success criteria

### Key Test Areas

Based on the [CRITICAL_TESTING_ANALYSIS.md](../../CRITICAL_TESTING_ANALYSIS.md), TempRepoManager testing focuses on:

1. **Repository Import Pipeline** - Multi-step process with progress tracking
2. **Automatic Cleanup System** - Time-based deletion with interval management
3. **Storage Management** - Persistent tracking of temporary repositories
4. **Error Recovery** - Cleanup retry logic for failed operations
5. **Resource Management** - Preventing memory leaks and orphaned resources

## Quick Start

### Basic Test Setup

```typescript
import { quickSetupTempRepo } from '../test-fixtures';

describe('TempRepoManager', () => {
  it('should successfully import a private repository', async () => {
    const { env, manager, cleanup } = quickSetupTempRepo('success');

    try {
      await manager.handlePrivateRepoImport('my-private-repo');

      // Verify successful import
      expect(env.mockStatusBroadcaster.getLastStatus()?.status).toBe('success');
      expect(env.mockTabs.getCreatedTabs()).toHaveLength(1);
    } finally {
      cleanup();
    }
  });
});
```

### Advanced Test Setup

```typescript
import {
  TempRepoTestLifecycle,
  TempRepoManagerFactory,
  TempRepoScenarioBuilder,
} from '../test-fixtures';

describe('TempRepoManager Advanced', () => {
  let lifecycle: TempRepoTestLifecycle;
  let env: TempRepoManagerTestEnvironment;

  beforeEach(() => {
    lifecycle = new TempRepoTestLifecycle();
    env = lifecycle.beforeEach();
  });

  afterEach(() => {
    lifecycle.afterEach();
  });

  it('should handle cleanup with partial failures', async () => {
    // Setup scenario with mixed-age repos and some delete failures
    TempRepoScenarioBuilder.partialFailureScenario(env);
    const manager = TempRepoManagerFactory.createWithExistingRepos(env);

    await manager.cleanupTempRepos();

    // Verify partial cleanup behavior
    const remainingRepos = await manager.getTempRepos();
    expect(remainingRepos.length).toBeGreaterThan(0); // Some repos remain due to failures
  });
});
```

## Test Data Structure

### Repository Test Data

```typescript
const TempRepoTestData = {
  repositories: {
    validSourceRepo: 'my-private-project',
    specialCharsRepo: 'repo-with_special.chars',
    unicodeRepo: 'проект-репозиторий',
    // ... more test cases
  },

  branches: {
    main: 'main',
    featureBranch: 'feature/new-authentication',
    // ... branch variations
  },

  timestamps: {
    justCreated: Date.now() - 5 * 1000,
    aboutToExpire: Date.now() - 55 * 1000,
    expired: Date.now() - 65 * 1000,
    // ... timing scenarios
  },
};
```

### Storage States

The fixtures provide various storage states for testing:

- **Empty Storage** - Fresh manager state
- **Single Repo** - Basic cleanup testing
- **Multiple Repos** - Complex cleanup scenarios
- **Mixed Age Repos** - Realistic cleanup conditions
- **Corrupted Storage** - Error handling

## Mock Services

### UnifiedGitHubService Mock

```typescript
const mockGitHubService = new MockUnifiedGitHubService();

// Configure for success
mockGitHubService.setShouldFail(false);

// Configure for specific failures
mockGitHubService.setShouldFail(true, 'deleteRepo');

// Add delays for performance testing
mockGitHubService.setDelay(1000);
```

### Operation State Manager Mock

```typescript
const mockOperationManager = new MockOperationStateManager();

// Verify operation tracking
expect(mockOperationManager.getOperationsByStatus('completed')).toHaveLength(1);
```

## Test Scenarios

### Critical Path Testing

1. **Happy Path Import** - Complete successful flow
2. **Cleanup Cycle** - Automatic repository cleanup
3. **Initialization** - Manager startup with existing repos

### Error Handling

1. **GitHub API Failures** - Various API error scenarios
2. **Storage Failures** - Chrome storage unavailable
3. **Cleanup Failures** - Repository deletion errors
4. **Concurrent Operations** - Race condition testing

### Edge Cases

1. **Boundary Conditions** - Empty names, very long names, special characters
2. **Timing Edge Cases** - Clock changes, rapid cycles
3. **Resource Management** - Memory usage, interval cleanup

### Performance Testing

1. **High Load** - Multiple concurrent operations
2. **Network Conditions** - Slow, intermittent connectivity
3. **Memory Usage** - Long-running operations

## Assertion Helpers

The fixtures provide specialized assertion helpers:

```typescript
import { TempRepoAssertionHelpers } from '../test-fixtures';

// Verify status progression
TempRepoAssertionHelpers.expectStatusSequence(broadcaster, ['uploading', 'success']);

// Verify progress increases
TempRepoAssertionHelpers.expectProgressionIncreases(broadcaster);

// Verify storage contents
TempRepoAssertionHelpers.expectStorageContains(storage, expectedRepos);

// Verify operation tracking
TempRepoAssertionHelpers.expectOperationCompleted(operationManager, 'import');
```

## Debugging Support

When tests fail, use the debugging helpers:

```typescript
import { DebuggingHelpers } from '../test-fixtures';

// Print current mock state
DebuggingHelpers.printMockState(env);

// Generate detailed failure report
const report = DebuggingHelpers.createFailureReport(env, 'import', error);
console.log(report);
```

## Performance Testing

```typescript
import { PerformanceHelpers } from '../test-fixtures';

// Measure operation timing
const { result, timeMs } = await PerformanceHelpers.measureExecutionTime(async () => {
  return await manager.handlePrivateRepoImport('test-repo');
});

// Test under memory pressure
const result = await PerformanceHelpers.simulateMemoryPressure(async () => {
  return await manager.cleanupTempRepos();
});
```

## Success Criteria

Tests should verify:

### Functional Requirements

- All import steps complete in correct order
- Progress updates are monotonic and reach 100%
- Status broadcasts follow expected sequence
- Temp repo metadata is correctly stored
- Cleanup only removes expired repositories

### Performance Requirements

- Import operations complete within 30 seconds
- Cleanup cycles complete within 5 seconds
- No memory leaks during extended operation
- Progress updates are timely and responsive

### Reliability Requirements

- Storage state remains consistent
- System recovers gracefully from failures
- No race conditions in concurrent scenarios
- Handles corrupted storage data

## Coverage Requirements

- **95%** line coverage minimum
- **100%** function coverage required
- **90%** branch coverage minimum
- **100%** critical path coverage
- **100%** error path coverage

## Integration with Existing Tests

These fixtures integrate with the existing BackgroundService test suite through the unified index file. Use the convenience functions for quick setup or the detailed classes for comprehensive testing.

For examples of established testing patterns, see the BackgroundService test implementations in the same directory.
