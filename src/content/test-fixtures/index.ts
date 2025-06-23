/**
 * Content Test Fixtures - Index
 *
 * Centralized export of all test fixtures and utilities for content scripts testing.
 * This file provides a single import point for all test fixtures, making them
 * easily reusable across multiple test files.
 */

// ContentManager Test fixtures
export * from './ContentManagerTestSpecification';
export * from './ContentManagerTestFixtures';
export * from './ContentManagerMocks';
export * from './ContentManagerTestHelpers';

// MessageHandler Test fixtures
export * from './MessageHandlerTestFixtures';
export * from './MessageHandlerMocks';
export * from './MessageHandlerTestHelpers';
export * from './MessageHandlerTestSpecification';

// Common imports for convenience
export type {
  TestScenario,
  PerformanceMetrics,
  StateValidation,
  EventSequence,
} from './ContentManagerTestSpecification';

export type {
  MockPortState,
  EventListenerTracker,
  TimerTracker,
} from './ContentManagerTestFixtures';

export type { TestEnvironment } from './ContentManagerTestHelpers';

// MessageHandler types
export type { TestScenarioSpec, TestCategorySpec } from './MessageHandlerTestSpecification';

export type {
  MockChromePort,
  MockChromeRuntime,
  MockWindow,
  MockConsole,
  MockMessageHandler,
  MockChromeEnvironment,
  BehaviorVerifier,
} from './MessageHandlerMocks';

export { MessageHandlerTestEnvironment } from './MessageHandlerTestHelpers';

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

import { MessageHandlerTestEnvironment } from './MessageHandlerTestHelpers';

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
 * Quick setup function for MessageHandler test scenarios
 * Usage example:
 *
 * ```typescript
 * import { setupMessageHandlerTest } from './test-fixtures';
 *
 * describe('MessageHandler', () => {
 *   let testEnv: MessageHandlerTestEnvironment;
 *
 *   beforeEach(async () => {
 *     testEnv = await setupMessageHandlerTest();
 *   });
 *
 *   afterEach(async () => {
 *     await testEnv.teardown();
 *   });
 * });
 * ```
 */
export async function setupMessageHandlerTest(): Promise<MessageHandlerTestEnvironment> {
  const env = new MessageHandlerTestEnvironment();
  await env.setup();
  return env;
}

/**
 * Predefined test configurations for common scenarios
 */
export const TestConfigurations = {
  BOLT_NEW_PROJECT: {
    url: 'https://bolt.new/project/abc123',
    shouldInitialize: true,
    hasRuntimeId: true,
  },

  NON_BOLT_SITE: {
    url: 'https://github.com/',
    shouldInitialize: false,
    hasRuntimeId: true,
  },

  CONTEXT_INVALIDATED: {
    url: 'https://bolt.new/project/abc123',
    shouldInitialize: true,
    hasRuntimeId: false,
  },

  SERVICE_WORKER_RESTART: {
    url: 'https://bolt.new/project/abc123',
    shouldInitialize: true,
    hasRuntimeId: true,
    simulateRestart: true,
  },
} as const;
