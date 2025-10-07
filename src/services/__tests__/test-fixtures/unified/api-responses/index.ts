/**
 * GitHub API Response Fixtures - Centralized exports
 *
 * This module provides realistic GitHub API responses for testing.
 * All responses are based on actual GitHub API documentation and real-world usage.
 */

export * from './GitHubUserResponses';
export * from './GitHubRepositoryResponses';
export * from './GitHubBranchCommitResponses';
export * from './GitHubFileResponses';

// Re-export as organized structure for backward compatibility
import { GitHubUserResponses } from './GitHubUserResponses';
import { GitHubRepositoryResponses } from './GitHubRepositoryResponses';
import { GitHubBranchResponses, GitHubCommitResponses } from './GitHubBranchCommitResponses';
import { GitHubFileResponses, GitHubTreeResponses } from './GitHubFileResponses';

/**
 * Unified GitHub API response fixtures organized by category
 */
export const GitHubAPIResponses = {
  user: GitHubUserResponses,
  repository: GitHubRepositoryResponses,
  branches: GitHubBranchResponses,
  commits: GitHubCommitResponses,
  fileContent: GitHubFileResponses,
  tree: GitHubTreeResponses,
  repositories: {
    userRepos: GitHubRepositoryResponses.userReposList,
  },
  filePush: {
    created: GitHubFileResponses.created,
  },
} as const;
