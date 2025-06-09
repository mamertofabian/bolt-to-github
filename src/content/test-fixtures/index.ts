/**
 * ContentManager Test Fixtures - Index
 * 
 * Centralized export of all test fixtures and utilities for ContentManager testing.
 * This file provides a single import point for all test fixtures, making them
 * easily reusable across multiple test files.
 */

// Test specifications and scenarios
export * from './ContentManagerTestSpecification';

// Test data and fixtures
export * from './ContentManagerTestFixtures';

// Mock implementations
export * from './ContentManagerMocks';

// Test helpers and utilities
export * from './ContentManagerTestHelpers';

// Common imports for convenience
export type {
  TestScenario,
  PerformanceMetrics,
  StateValidation,
  EventSequence
} from './ContentManagerTestSpecification';

export type {
  MockPortState,
  EventListenerTracker,
  TimerTracker
} from './ContentManagerTestFixtures';

export type {
  TestEnvironment
} from './ContentManagerTestHelpers';

/**
 * Quick setup function for common test scenarios
 * Usage example:
 * 
 * ```typescript
 * import { setupBasicTest } from './test-fixtures';
 * 
 * describe('ContentManager', () => {
 *   let testEnv: TestEnvironment;
 *   
 *   beforeEach(() => {
 *     testEnv = setupBasicTest();
 *   });
 *   
 *   afterEach(() => {
 *     testEnv.cleanup();
 *   });
 * });
 * ```
 */
import {
  createTestEnvironment,
  setupChromeAPIMocks,
  setupWindowMocks,
  type TestEnvironment,
} from './ContentManagerTestHelpers';

export function setupBasicTest(): TestEnvironment {
  const env = createTestEnvironment();

  setupChromeAPIMocks(env, {
    hasRuntimeId: true,
    storageData: {},
  });

  setupWindowMocks();

  return env;
}

/**
 * Predefined test configurations for common scenarios
 */
export const TestConfigurations = {
  BOLT_NEW_PROJECT: {
    url: 'https://bolt.new/project/abc123',
    shouldInitialize: true,
    hasRuntimeId: true
  },
  
  NON_BOLT_SITE: {
    url: 'https://github.com/',
    shouldInitialize: false,
    hasRuntimeId: true
  },
  
  CONTEXT_INVALIDATED: {
    url: 'https://bolt.new/project/abc123',
    shouldInitialize: true,
    hasRuntimeId: false
  },
  
  SERVICE_WORKER_RESTART: {
    url: 'https://bolt.new/project/abc123',
    shouldInitialize: true,
    hasRuntimeId: true,
    simulateRestart: true
  }
} as const;