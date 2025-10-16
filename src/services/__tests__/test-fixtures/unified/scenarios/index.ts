/**
 * Test Scenarios - Centralized exports
 *
 * This module provides pre-configured test scenarios for testing
 * UnifiedGitHubService with realistic combinations of mocks and fixtures.
 */

export * from './TestScenarios';

// Re-export as organized structure for convenience
import { UnifiedGitHubServiceTestScenarios } from './TestScenarios';

/**
 * Organized collection of test scenarios
 */
export const TestScenarios = {
  UnifiedGitHubServiceTestScenarios,
} as const;
