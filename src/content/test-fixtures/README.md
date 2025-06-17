# ContentManager Test Fixtures

This directory contains comprehensive test fixtures for `ContentManager.ts` testing, designed to provide realistic test data, controlled test environments, and accurate behavior simulation.

## Overview

The test fixtures follow the pattern established in the BackgroundService test fixtures, focusing on:

- **Realistic test data** covering normal, edge, and error cases
- **Minimal mocking** with accurate behavior simulation
- **Controlled test environments** for reliable testing
- **Memory leak detection** and resource cleanup validation
- **Reusable components** across multiple test files

## File Structure

```
test-fixtures/
├── ContentManagerTestSpecification.ts  # Test scenarios and specifications
├── ContentManagerTestFixtures.ts       # Test data and fixtures
├── ContentManagerMocks.ts              # Test doubles and mocks
├── ContentManagerTestHelpers.ts        # Helper functions and utilities
├── index.ts                            # Centralized exports
└── README.md                           # This documentation
```

## Key Components

### 1. Test Specifications (`ContentManagerTestSpecification.ts`)

Defines comprehensive test scenarios categorized by:

- **Normal operations**: Successful initialization, message routing, heartbeat maintenance
- **Edge cases**: Rapid reconnection, concurrent messages, quick successive disconnects
- **Error scenarios**: Context invalidation, port disconnections, runtime unavailability
- **Recovery scenarios**: Service worker restart recovery, unrecoverable context invalidation

### 2. Test Fixtures (`ContentManagerTestFixtures.ts`)

Provides realistic test data including:

- **Chrome runtime errors** for different failure modes
- **Test URLs** for various bolt.new scenarios
- **Test messages** for all supported message types
- **Storage data** scenarios for state management
- **Port states** for connection testing
- **Timing configurations** for different test scenarios

### 3. Mock Implementations (`ContentManagerMocks.ts`)

Accurate test doubles for:

- **MockMessageHandler**: Simulates real MessageHandler behavior with connection state and queuing
- **MockUIManager**: Tracks UI interactions and state changes
- **MockPort**: Full chrome.runtime.Port simulation with event handling
- **ResourceTracker**: Monitors timers and event listeners for memory leak detection

### 4. Test Helpers (`ContentManagerTestHelpers.ts`)

Utility functions for:

- **Test environment setup** with controlled Chrome API mocking
- **Resource tracking** for memory leak detection
- **State validation** and assertion helpers
- **Performance monitoring** for critical operations
- **Message flow validation** between components

## Usage Examples

### Basic Test Setup

```typescript
import { setupBasicTest, validateCleanup } from './test-fixtures';

describe('ContentManager', () => {
  let testEnv: TestEnvironment;

  beforeEach(() => {
    testEnv = setupBasicTest();
  });

  afterEach(() => {
    const cleanupResult = validateCleanup(testEnv);
    expect(cleanupResult.valid).toBe(true);
    testEnv.cleanup();
  });
});
```

### Context Invalidation Testing

```typescript
import {
  createTestEnvironment,
  setupChromeAPIMocks,
  simulatePortState,
  TestPortStates,
  ChromeRuntimeErrors,
} from './test-fixtures';

it('should handle context invalidation gracefully', async () => {
  const env = createTestEnvironment();
  setupChromeAPIMocks(env, { hasRuntimeId: false });

  const contentManager = new ContentManager();

  await simulatePortState(env, TestPortStates.DISCONNECTED_CONTEXT_INVALIDATED);

  // Verify graceful handling without errors
  expect(getContentManagerState(contentManager).isInRecovery).toBe(true);

  env.cleanup();
});
```

### Recovery Testing

```typescript
import { waitForState, PerformanceMonitor, ComplexEventSequences } from './test-fixtures';

it('should recover from service worker restart', async () => {
  const monitor = new PerformanceMonitor();
  monitor.start();

  // Execute recovery sequence
  const sequence = ComplexEventSequences.find((s) => s.name === 'context_invalidation_recovery');

  for (const event of sequence.events) {
    if (event.type === 'wait') {
      await wait(event.delay!);
    } else if (event.type === 'disconnect') {
      await simulatePortState(env, TestPortStates.DISCONNECTED_CONTEXT_INVALIDATED);
    }
    // ... handle other event types
  }

  monitor.mark('recovery_complete');

  await waitForState(
    contentManager,
    () => !getContentManagerState(contentManager).isInRecovery,
    5000
  );

  expect(monitor.getMetrics().recovery_complete).toBeLessThan(5000);
});
```

### Memory Leak Detection

```typescript
import { ResourceTracker, MemoryThresholds } from './test-fixtures';

it('should not leak resources during rapid reconnections', async () => {
  const tracker = env.resourceTracker;

  // Perform rapid reconnections
  for (let i = 0; i < 10; i++) {
    await simulatePortState(env, TestPortStates.DISCONNECTED_NORMAL);
    await wait(100);
    await simulatePortState(env, TestPortStates.CONNECTED);
    await wait(100);
  }

  const resources = tracker.getActiveResources();
  expect(resources.timers).toBeLessThanOrEqual(MemoryThresholds.MAX_TIMERS);
  expect(resources.eventListeners).toBeLessThanOrEqual(MemoryThresholds.MAX_EVENT_LISTENERS);
});
```

## Critical Testing Priorities

Based on the analysis in `CRITICAL_TESTING_ANALYSIS.md`, the fixtures prioritize testing for:

1. **Context invalidation detection accuracy** (Critical)
2. **Recovery completion under various failure scenarios** (Critical)
3. **Message queue behavior during extended disconnections** (High)
4. **Timer cleanup during rapid connection/disconnection cycles** (High)
5. **Memory usage during prolonged recovery attempts** (High)

## Performance Considerations

The fixtures include performance monitoring capabilities to track:

- Initialization time
- Reconnection duration
- Message processing latency
- Memory usage patterns
- Resource cleanup efficiency

## Best Practices

1. **Always use `setupBasicTest()`** for standard scenarios
2. **Validate cleanup** after each test with `validateCleanup()`
3. **Monitor performance** for critical operations
4. **Test error paths** as thoroughly as success paths
5. **Use realistic data** from the fixtures rather than creating ad-hoc test data
6. **Track resources** to prevent memory leaks in tests

## Integration with Existing Tests

These fixtures complement the existing test infrastructure and can be used alongside:

- BackgroundService test fixtures (similar pattern)
- Existing Chrome API mocks in `src/test/setup/`
- Jest configuration in `jest.config.js`

The fixtures are designed to be drop-in replacements for ad-hoc mocks while providing more comprehensive and reliable testing capabilities.
