/**
 * GitHub User API Response Fixtures
 *
 * Realistic user data for testing GitHub user-related operations
 */

export const GitHubUserResponses = {
  /**
   * Valid user response with complete information
   */
  valid: {
    login: 'testuser',
    id: 12345678,
    node_id: 'MDQ6VXNlcjEyMzQ1Njc4',
    avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/testuser',
    html_url: 'https://github.com/testuser',
    type: 'User',
    site_admin: false,
    name: 'Test User',
    company: 'Test Company',
    blog: 'https://testuser.dev',
    location: 'Test City',
    email: 'test@example.com',
    hireable: true,
    bio: 'Test user for development',
    twitter_username: 'testuser',
    public_repos: 42,
    public_gists: 5,
    followers: 100,
    following: 50,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  },

  /**
   * Minimal user response - for lightweight testing
   */
  minimal: {
    login: 'testuser',
    id: 12345678,
    avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
    type: 'User',
  },

  /**
   * Organization account response
   */
  organization: {
    login: 'test-org',
    id: 87654321,
    node_id: 'MDEyOk9yZ2FuaXphdGlvbjg3NjU0MzIx',
    avatar_url: 'https://avatars.githubusercontent.com/u/87654321?v=4',
    url: 'https://api.github.com/orgs/test-org',
    html_url: 'https://github.com/test-org',
    type: 'Organization',
    name: 'Test Organization',
    company: null,
    blog: 'https://test-org.com',
    location: 'San Francisco, CA',
    email: 'contact@test-org.com',
    public_repos: 150,
    public_gists: 0,
    followers: 500,
    following: 0,
    created_at: '2018-01-01T00:00:00Z',
    updated_at: '2023-06-01T12:00:00Z',
  },
} as const;

/**
 * Factory function to create custom user response
 * @param overrides Partial user data to override defaults
 * @returns Complete user response object
 */
export function createUserResponse(overrides: Partial<typeof GitHubUserResponses.valid> = {}) {
  return {
    ...GitHubUserResponses.valid,
    ...overrides,
  };
}
