/**
 * Test Helpers - Centralized exports
 *
 * This module provides utility functions for testing UnifiedGitHubService,
 * including authentication config creation, mock response builders, and
 * assertion helpers.
 */

export * from './TestHelpers';

// Re-export as organized structure for convenience
import { UnifiedGitHubServiceTestHelpers } from './TestHelpers';

/**
 * Organized collection of test helper utilities
 */
export const TestHelpers = {
  UnifiedGitHubServiceTestHelpers,
} as const;
