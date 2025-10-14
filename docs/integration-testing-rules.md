# Integration Testing Rules

**Testing Framework:** Vitest with jsdom environment  
**Philosophy:** Test how multiple components, services, and systems work together in realistic scenarios

## Core Principle

> **Integration tests verify that multiple units work together correctly.** They test the interaction between components, services, stores, and external systems to ensure the application behaves correctly as a whole.

## The Rules

### 1. **Test realistic user workflows**

- Focus on complete user journeys from start to finish
- Test how components interact with services, stores, and external APIs
- Verify that data flows correctly between different parts of the system
- Test error handling across component boundaries

### 2. **Use real implementations of internal dependencies**

- Let your own services, stores, and utilities run naturally
- Only mock external systems (Chrome APIs, GitHub API, file system)
- Test the actual integration between your components and services
- Verify that state management works correctly across components

### 3. **Test state synchronization across components**

- Verify that store updates propagate correctly to all consuming components
- Test that component state changes trigger appropriate store updates
- Ensure data consistency across the application
- Test complex state interactions and side effects

### 4. **Test service integration patterns**

- Verify that components correctly use services
- Test error handling when services fail
- Ensure proper cleanup and resource management
- Test async operations and loading states

### 5. **Test Chrome Extension specific integrations**

- Verify Chrome API interactions work correctly
- Test message passing between content scripts and popup
- Ensure proper permission handling
- Test storage and state persistence

### 6. **Test complex component hierarchies**

- Verify parent-child component communication
- Test event propagation and handling
- Ensure proper component lifecycle management
- Test conditional rendering based on complex state

### 7. **Test data flow and transformations**

- Verify that data is correctly transformed as it flows through the system
- Test complex data processing pipelines
- Ensure data validation works across component boundaries
- Test data persistence and retrieval

### 8. **Test error boundaries and recovery**

- Verify that errors in one component don't crash the entire application
- Test error recovery mechanisms
- Ensure proper error reporting and logging
- Test graceful degradation

## When to Write Integration Tests

### ✅ Write Integration Tests For:

- **Complete user workflows** (authentication → project creation → upload)
- **Component interactions** (parent-child communication, event handling)
- **Service integration** (API calls, data persistence, error handling)
- **State management** (store updates, data synchronization)
- **Chrome Extension features** (message passing, storage, permissions)
- **Complex business logic** (file processing, validation pipelines)
- **Error scenarios** (network failures, validation errors, edge cases)

### ❌ Don't Write Integration Tests For:

- **Simple component rendering** (use component tests instead)
- **Isolated utility functions** (use unit tests instead)
- **Pure UI interactions** (use component tests instead)
- **Individual service methods** (use unit tests instead)

## Test Organization

### File Structure

```
src/
├── __tests__/
│   ├── integration/
│   │   ├── user-workflows/
│   │   │   ├── authentication.integration.test.ts
│   │   │   ├── project-creation.integration.test.ts
│   │   │   └── file-upload.integration.test.ts
│   │   ├── component-integration/
│   │   │   ├── popup-app.integration.test.ts
│   │   │   ├── project-management.integration.test.ts
│   │   │   └── settings-management.integration.test.ts
│   │   └── service-integration/
│   │       ├── github-api.integration.test.ts
│   │       ├── chrome-storage.integration.test.ts
│   │       └── file-processing.integration.test.ts
│   ├── unit/
│   └── component/
```

### Test Naming Convention

- **Integration tests**: `*.integration.test.ts`
- **User workflows**: `{workflow-name}.integration.test.ts`
- **Component integration**: `{component-name}.integration.test.ts`
- **Service integration**: `{service-name}.integration.test.ts`

## Setup and Teardown

### Test Environment Setup

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

// Mock external dependencies
vi.mock('$lib/services/GitHubApiClient');
vi.mock('$lib/services/ChromeMessagingService');

// Don't mock internal services
// vi.mock('$lib/services/ChromeStorageService'); // ❌ Don't mock
// vi.mock('$lib/stores/projectSettings'); // ❌ Don't mock

describe('Project Creation Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Chrome APIs
    Object.defineProperty(window, 'chrome', {
      value: {
        storage: { local: { get: vi.fn(), set: vi.fn() } },
        runtime: { sendMessage: vi.fn() },
        tabs: { create: vi.fn() },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
```

## Common Pitfalls to Avoid

❌ **Don't:**

- Mock internal services and stores unnecessarily
- Test implementation details instead of behavior
- Write integration tests for simple component interactions
- Ignore error scenarios and edge cases
- Test in isolation when you need integration
- Forget to test cleanup and resource management

✅ **Do:**

- Test complete user workflows end-to-end
- Use real implementations of internal dependencies
- Focus on behavior and user experience
- Test error handling and recovery
- Verify data flow and state synchronization
- Test Chrome Extension specific features
- Ensure proper cleanup and resource management

## Summary

Integration tests are essential for verifying that your application works correctly as a whole. They test the interaction between components, services, and external systems to ensure that real user workflows function properly. Focus on complete user journeys, use real implementations of internal dependencies, and test error handling and recovery mechanisms. Remember that integration tests complement unit and component tests - they don't replace them.
