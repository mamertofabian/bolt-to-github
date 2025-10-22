/**
 * GitHub Repository API Response Fixtures
 *
 * Realistic repository data for testing GitHub repository operations
 */

import { GitHubUserResponses } from './GitHubUserResponses';

export const GitHubRepositoryResponses = {
  /**
   * Existing public repository with complete metadata
   */
  existing: {
    id: 123456789,
    node_id: 'MDEwOlJlcG9zaXRvcnkxMjM0NTY3ODk=',
    name: 'test-repo',
    full_name: 'testuser/test-repo',
    private: false,
    owner: {
      login: 'testuser',
      id: 12345678,
      node_id: 'MDQ6VXNlcjEyMzQ1Njc4',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
      type: 'User',
    },
    html_url: 'https://github.com/testuser/test-repo',
    description: 'A test repository for development',
    fork: false,
    url: 'https://api.github.com/repos/testuser/test-repo',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-06-01T12:00:00Z',
    pushed_at: '2023-06-01T12:00:00Z',
    git_url: 'git://github.com/testuser/test-repo.git',
    ssh_url: 'git@github.com:testuser/test-repo.git',
    clone_url: 'https://github.com/testuser/test-repo.git',
    svn_url: 'https://github.com/testuser/test-repo',
    homepage: 'https://testuser.dev/test-repo',
    size: 108,
    stargazers_count: 80,
    watchers_count: 80,
    language: 'TypeScript',
    has_issues: true,
    has_projects: true,
    has_wiki: true,
    has_pages: false,
    forks_count: 9,
    archived: false,
    disabled: false,
    open_issues_count: 2,
    license: {
      key: 'mit',
      name: 'MIT License',
      spdx_id: 'MIT',
      url: 'https://api.github.com/licenses/mit',
    },
    allow_forking: true,
    is_template: false,
    topics: ['typescript', 'testing', 'github-api'],
    visibility: 'public',
    forks: 9,
    open_issues: 2,
    watchers: 80,
    default_branch: 'main',
    exists: true,
  },

  /**
   * Private repository with restricted access
   */
  private: {
    id: 987654321,
    node_id: 'MDEwOlJlcG9zaXRvcnk5ODc2NTQzMjE=',
    name: 'private-repo',
    full_name: 'testuser/private-repo',
    private: true,
    owner: {
      login: 'testuser',
      id: 12345678,
      node_id: 'MDQ6VXNlcjEyMzQ1Njc4',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
      type: 'User',
    },
    html_url: 'https://github.com/testuser/private-repo',
    description: 'A private test repository',
    fork: false,
    url: 'https://api.github.com/repos/testuser/private-repo',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-06-01T12:00:00Z',
    pushed_at: '2023-06-01T12:00:00Z',
    git_url: 'git://github.com/testuser/private-repo.git',
    ssh_url: 'git@github.com:testuser/private-repo.git',
    clone_url: 'https://github.com/testuser/private-repo.git',
    svn_url: 'https://github.com/testuser/private-repo',
    size: 50,
    stargazers_count: 0,
    watchers_count: 1,
    language: 'JavaScript',
    has_issues: true,
    has_projects: false,
    has_wiki: false,
    has_pages: false,
    forks_count: 0,
    archived: false,
    disabled: false,
    open_issues_count: 0,
    license: null,
    allow_forking: false,
    is_template: false,
    topics: [],
    visibility: 'private',
    forks: 0,
    open_issues: 0,
    watchers: 1,
    default_branch: 'main',
    exists: true,
  },

  /**
   * Minimal repository data - for lightweight testing
   */
  minimal: {
    id: 123456789,
    name: 'test-repo',
    full_name: 'testuser/test-repo',
    private: false,
    owner: GitHubUserResponses.minimal,
    html_url: 'https://github.com/testuser/test-repo',
    default_branch: 'main',
  },

  /**
   * Non-existent repository marker
   */
  nonExistent: {
    name: 'non-existent-repo',
    exists: false,
  },

  /**
   * Newly created repository response
   */
  created: {
    id: 555666777,
    node_id: 'MDEwOlJlcG9zaXRvcnk1NTU2NjY3Nzc=',
    name: 'new-repo',
    full_name: 'testuser/new-repo',
    private: true,
    owner: {
      login: 'testuser',
      id: 12345678,
      node_id: 'MDQ6VXNlcjEyMzQ1Njc4',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
      type: 'User',
    },
    html_url: 'https://github.com/testuser/new-repo',
    description: '',
    fork: false,
    url: 'https://api.github.com/repos/testuser/new-repo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    pushed_at: new Date().toISOString(),
    git_url: 'git://github.com/testuser/new-repo.git',
    ssh_url: 'git@github.com:testuser/new-repo.git',
    clone_url: 'https://github.com/testuser/new-repo.git',
    svn_url: 'https://github.com/testuser/new-repo',
    size: 0,
    stargazers_count: 0,
    watchers_count: 1,
    language: null,
    has_issues: true,
    has_projects: true,
    has_wiki: true,
    has_pages: false,
    forks_count: 0,
    archived: false,
    disabled: false,
    open_issues_count: 0,
    license: null,
    allow_forking: true,
    is_template: false,
    topics: [],
    visibility: 'private',
    forks: 0,
    open_issues: 0,
    watchers: 1,
    default_branch: 'main',
    auto_init: true,
  },

  /**
   * List of user repositories
   */
  userReposList: [
    {
      id: 123456789,
      name: 'test-repo',
      full_name: 'testuser/test-repo',
      private: false,
      owner: { login: 'testuser', id: 12345678 },
      html_url: 'https://github.com/testuser/test-repo',
      description: 'A test repository',
      fork: false,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-06-01T12:00:00Z',
      pushed_at: '2023-06-01T12:00:00Z',
      stargazers_count: 80,
      watchers_count: 80,
      language: 'TypeScript',
      forks_count: 9,
      archived: false,
      disabled: false,
      open_issues_count: 2,
      license: { key: 'mit', name: 'MIT License' },
      default_branch: 'main',
    },
    {
      id: 987654321,
      name: 'private-repo',
      full_name: 'testuser/private-repo',
      private: true,
      owner: { login: 'testuser', id: 12345678 },
      html_url: 'https://github.com/testuser/private-repo',
      description: 'A private repository',
      fork: false,
      created_at: '2023-02-01T00:00:00Z',
      updated_at: '2023-05-01T12:00:00Z',
      pushed_at: '2023-05-01T12:00:00Z',
      stargazers_count: 0,
      watchers_count: 1,
      language: 'JavaScript',
      forks_count: 0,
      archived: false,
      disabled: false,
      open_issues_count: 0,
      license: null,
      default_branch: 'main',
    },
  ],
} as const;

/**
 * Factory function to create custom repository response
 * @param overrides Partial repository data to override defaults
 * @returns Complete repository response object
 */
export function createRepositoryResponse(
  overrides: Partial<typeof GitHubRepositoryResponses.existing> = {}
) {
  return {
    ...GitHubRepositoryResponses.existing,
    ...overrides,
  };
}

/**
 * Factory function to create minimal repository response (for performance)
 * @param overrides Partial repository data to override defaults
 * @returns Minimal repository response object
 */
export function createMinimalRepositoryResponse(
  overrides: Partial<typeof GitHubRepositoryResponses.minimal> = {}
) {
  return {
    ...GitHubRepositoryResponses.minimal,
    ...overrides,
  };
}
