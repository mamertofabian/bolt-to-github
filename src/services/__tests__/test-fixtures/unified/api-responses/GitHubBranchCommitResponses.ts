/**
 * GitHub Branch and Commit API Response Fixtures
 *
 * Realistic branch and commit data for testing GitHub operations
 */

export const GitHubBranchResponses = {
  /**
   * Typical multi-branch repository
   */
  typical: [
    {
      name: 'main',
      commit: {
        sha: 'abc123def456',
        url: 'https://api.github.com/repos/testuser/test-repo/commits/abc123def456',
      },
      protected: false,
    },
    {
      name: 'develop',
      commit: {
        sha: 'def456ghi789',
        url: 'https://api.github.com/repos/testuser/test-repo/commits/def456ghi789',
      },
      protected: false,
    },
    {
      name: 'feature/new-feature',
      commit: {
        sha: 'ghi789jkl012',
        url: 'https://api.github.com/repos/testuser/test-repo/commits/ghi789jkl012',
      },
      protected: false,
    },
  ],

  /**
   * Single branch repository (e.g., newly created)
   */
  single: [
    {
      name: 'main',
      commit: {
        sha: 'abc123def456',
        url: 'https://api.github.com/repos/testuser/test-repo/commits/abc123def456',
      },
      protected: true,
    },
  ],

  /**
   * Empty repository (no branches yet)
   */
  empty: [],
} as const;

export const GitHubCommitResponses = {
  /**
   * First page of commits (typical pagination scenario)
   */
  page1: [
    {
      sha: 'commit1sha',
      node_id: 'MDY6Q29tbWl0MTE6Y29tbWl0MXNoYQ==',
      commit: {
        author: {
          name: 'Test User',
          email: 'test@example.com',
          date: '2023-06-01T12:00:00Z',
        },
        committer: {
          name: 'Test User',
          email: 'test@example.com',
          date: '2023-06-01T12:00:00Z',
        },
        message: 'Latest commit',
        tree: {
          sha: 'tree1sha',
          url: 'https://api.github.com/repos/testuser/test-repo/git/trees/tree1sha',
        },
        url: 'https://api.github.com/repos/testuser/test-repo/git/commits/commit1sha',
        comment_count: 0,
      },
      url: 'https://api.github.com/repos/testuser/test-repo/commits/commit1sha',
      html_url: 'https://github.com/testuser/test-repo/commit/commit1sha',
      author: {
        login: 'testuser',
        id: 12345678,
        avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
      },
      committer: {
        login: 'testuser',
        id: 12345678,
        avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
      },
      parents: [
        {
          sha: 'parent1sha',
          url: 'https://api.github.com/repos/testuser/test-repo/commits/parent1sha',
        },
      ],
    },
  ],

  /**
   * Empty commit list (new repository)
   */
  empty: [],
} as const;

/**
 * Factory function to create custom branch response
 */
export function createBranchResponse(
  name: string,
  sha: string = 'abc123def456',
  protected_: boolean = false
) {
  return {
    name,
    commit: {
      sha,
      url: `https://api.github.com/repos/testuser/test-repo/commits/${sha}`,
    },
    protected: protected_,
  };
}

/**
 * Factory function to create custom commit response
 */
export function createCommitResponse(
  sha: string = 'commit1sha',
  message: string = 'Test commit',
  author: string = 'Test User'
) {
  return {
    sha,
    commit: {
      author: {
        name: author,
        email: 'test@example.com',
        date: new Date().toISOString(),
      },
      committer: {
        name: author,
        email: 'test@example.com',
        date: new Date().toISOString(),
      },
      message,
    },
    author: {
      login: 'testuser',
      id: 12345678,
    },
  };
}
