/**
 * Comprehensive test fixtures for UnifiedGitHubService
 *
 * This module provides realistic test data, mocks, and helpers for testing
 * the UnifiedGitHubService across all its functionality areas including:
 * - Authentication strategies
 * - Repository operations
 * - Issue management
 * - File operations
 * - Error scenarios
 */

import type { AuthenticationConfig, AuthenticationType } from '../../types/authentication';
import type { IAuthenticationStrategy } from '../../interfaces/IAuthenticationStrategy';

// =============================================================================
// GITHUB API RESPONSE FIXTURES
// =============================================================================

export const GitHubAPIResponses = {
  // User information responses
  user: {
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
  },

  // Repository responses
  repository: {
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

    nonExistent: {
      name: 'non-existent-repo',
      exists: false,
    },

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
  },

  // Branch responses
  branches: {
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
  },

  // Commit responses
  commits: {
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

    empty: [],
  },

  // Repository tree responses
  tree: {
    withFiles: {
      sha: 'main-tree-sha',
      url: 'https://api.github.com/repos/testuser/test-repo/git/trees/main-tree-sha',
      tree: [
        {
          path: 'README.md',
          mode: '100644',
          type: 'blob',
          sha: 'readme-blob-sha',
          size: 1024,
          url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/readme-blob-sha',
        },
        {
          path: 'src',
          mode: '040000',
          type: 'tree',
          sha: 'src-tree-sha',
          url: 'https://api.github.com/repos/testuser/test-repo/git/trees/src-tree-sha',
        },
        {
          path: 'src/index.ts',
          mode: '100644',
          type: 'blob',
          sha: 'index-blob-sha',
          size: 2048,
          url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/index-blob-sha',
        },
        {
          path: 'src/utils.ts',
          mode: '100644',
          type: 'blob',
          sha: 'utils-blob-sha',
          size: 1536,
          url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/utils-blob-sha',
        },
        {
          path: 'package.json',
          mode: '100644',
          type: 'blob',
          sha: 'package-blob-sha',
          size: 512,
          url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/package-blob-sha',
        },
      ],
      truncated: false,
    },
  },

  // File content responses
  fileContent: {
    readmeMarkdown: {
      type: 'file',
      encoding: 'base64',
      size: 1024,
      name: 'README.md',
      path: 'README.md',
      content: btoa(
        '# Test Repository\n\nThis is a test repository for development.\n\n## Features\n\n- Feature 1\n- Feature 2\n'
      ),
      sha: 'readme-blob-sha',
      url: 'https://api.github.com/repos/testuser/test-repo/contents/README.md',
      git_url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/readme-blob-sha',
      html_url: 'https://github.com/testuser/test-repo/blob/main/README.md',
      download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/README.md',
    },

    packageJson: {
      type: 'file',
      encoding: 'base64',
      size: 512,
      name: 'package.json',
      path: 'package.json',
      content: btoa(
        '{\n  "name": "test-repo",\n  "version": "1.0.0",\n  "description": "Test repository",\n  "main": "index.js"\n}'
      ),
      sha: 'package-blob-sha',
      url: 'https://api.github.com/repos/testuser/test-repo/contents/package.json',
      git_url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/package-blob-sha',
      html_url: 'https://github.com/testuser/test-repo/blob/main/package.json',
      download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/package.json',
    },
  },

  // Repository list responses
  repositories: {
    userRepos: [
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
  },

  // File push responses
  filePush: {
    created: {
      content: {
        name: 'new-file.txt',
        path: 'new-file.txt',
        sha: 'new-file-sha',
        size: 256,
        url: 'https://api.github.com/repos/testuser/test-repo/contents/new-file.txt',
        html_url: 'https://github.com/testuser/test-repo/blob/main/new-file.txt',
        git_url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/new-file-sha',
        download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/new-file.txt',
        type: 'file',
      },
      commit: {
        sha: 'commit-sha-123',
        node_id: 'MDY6Q29tbWl0MTIzNDU2Nzg5OmNvbW1pdC1zaGEtMTIz',
        url: 'https://api.github.com/repos/testuser/test-repo/git/commits/commit-sha-123',
        html_url: 'https://github.com/testuser/test-repo/commit/commit-sha-123',
        author: {
          name: 'Test User',
          email: 'test@example.com',
          date: new Date().toISOString(),
        },
        committer: {
          name: 'Test User',
          email: 'test@example.com',
          date: new Date().toISOString(),
        },
        tree: {
          sha: 'tree-sha-456',
          url: 'https://api.github.com/repos/testuser/test-repo/git/trees/tree-sha-456',
        },
        message: 'Add new file',
        parents: [
          {
            sha: 'parent-sha-789',
            url: 'https://api.github.com/repos/testuser/test-repo/git/commits/parent-sha-789',
            html_url: 'https://github.com/testuser/test-repo/commit/parent-sha-789',
          },
        ],
        verification: {
          verified: false,
          reason: 'unsigned',
          signature: null,
          payload: null,
        },
      },
    },
  },
};

// =============================================================================
// ISSUE MANAGEMENT FIXTURES
// =============================================================================

export const IssueFixtures = {
  // Individual issues
  openIssue: {
    url: 'https://api.github.com/repos/testuser/test-repo/issues/1',
    repository_url: 'https://api.github.com/repos/testuser/test-repo',
    labels_url: 'https://api.github.com/repos/testuser/test-repo/issues/1/labels{/name}',
    comments_url: 'https://api.github.com/repos/testuser/test-repo/issues/1/comments',
    events_url: 'https://api.github.com/repos/testuser/test-repo/issues/1/events',
    html_url: 'https://github.com/testuser/test-repo/issues/1',
    id: 1001,
    node_id: 'MDU6SXNzdWUxMDAx',
    number: 1,
    title: 'Bug: Application crashes on startup',
    user: {
      login: 'testuser',
      id: 12345678,
      node_id: 'MDQ6VXNlcjEyMzQ1Njc4',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
      type: 'User',
    },
    labels: [
      {
        id: 208045946,
        node_id: 'MDU6TGFiZWwyMDgwNDU5NDY=',
        url: 'https://api.github.com/repos/testuser/test-repo/labels/bug',
        name: 'bug',
        color: 'd73a4a',
        default: true,
        description: "Something isn't working",
      },
      {
        id: 208045947,
        node_id: 'MDU6TGFiZWwyMDgwNDU5NDc=',
        url: 'https://api.github.com/repos/testuser/test-repo/labels/priority:high',
        name: 'priority:high',
        color: 'ff0000',
        default: false,
        description: 'High priority issue',
      },
    ],
    state: 'open',
    locked: false,
    assignee: null,
    assignees: [],
    milestone: null,
    comments: 2,
    created_at: '2023-05-01T12:00:00Z',
    updated_at: '2023-05-15T14:30:00Z',
    closed_at: null,
    author_association: 'OWNER',
    active_lock_reason: null,
    body: "The application crashes immediately when starting up with the following error:\n\n```\nTypeError: Cannot read property 'version' of undefined\n```\n\nSteps to reproduce:\n1. Start the application\n2. Error occurs immediately\n\nEnvironment:\n- OS: Windows 10\n- Node.js: v18.16.0\n- Browser: Chrome 114",
    reactions: {
      url: 'https://api.github.com/repos/testuser/test-repo/issues/1/reactions',
      total_count: 3,
      '+1': 2,
      '-1': 0,
      laugh: 0,
      hooray: 1,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    },
    timeline_url: 'https://api.github.com/repos/testuser/test-repo/issues/1/timeline',
    performed_via_github_app: null,
  },

  closedIssue: {
    url: 'https://api.github.com/repos/testuser/test-repo/issues/2',
    repository_url: 'https://api.github.com/repos/testuser/test-repo',
    labels_url: 'https://api.github.com/repos/testuser/test-repo/issues/2/labels{/name}',
    comments_url: 'https://api.github.com/repos/testuser/test-repo/issues/2/comments',
    events_url: 'https://api.github.com/repos/testuser/test-repo/issues/2/events',
    html_url: 'https://github.com/testuser/test-repo/issues/2',
    id: 1002,
    node_id: 'MDU6SXNzdWUxMDAy',
    number: 2,
    title: 'Feature: Add dark mode support',
    user: {
      login: 'contributor',
      id: 87654321,
      node_id: 'MDQ6VXNlcjg3NjU0MzIx',
      avatar_url: 'https://avatars.githubusercontent.com/u/87654321?v=4',
      type: 'User',
    },
    labels: [
      {
        id: 208045948,
        node_id: 'MDU6TGFiZWwyMDgwNDU5NDg=',
        url: 'https://api.github.com/repos/testuser/test-repo/labels/enhancement',
        name: 'enhancement',
        color: 'a2eeef',
        default: true,
        description: 'New feature or request',
      },
    ],
    state: 'closed',
    locked: false,
    assignee: {
      login: 'testuser',
      id: 12345678,
      node_id: 'MDQ6VXNlcjEyMzQ1Njc4',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
      type: 'User',
    },
    assignees: [
      {
        login: 'testuser',
        id: 12345678,
        node_id: 'MDQ6VXNlcjEyMzQ1Njc4',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
        type: 'User',
      },
    ],
    milestone: null,
    comments: 5,
    created_at: '2023-04-01T10:00:00Z',
    updated_at: '2023-04-30T16:45:00Z',
    closed_at: '2023-04-30T16:45:00Z',
    author_association: 'CONTRIBUTOR',
    active_lock_reason: null,
    body: 'It would be great to have dark mode support for better user experience during nighttime usage.\n\n**Acceptance Criteria:**\n- [ ] Toggle button in settings\n- [ ] Dark theme colors\n- [ ] Persistent user preference\n- [ ] System theme detection',
    reactions: {
      url: 'https://api.github.com/repos/testuser/test-repo/issues/2/reactions',
      total_count: 8,
      '+1': 6,
      '-1': 0,
      laugh: 0,
      hooray: 2,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    },
    timeline_url: 'https://api.github.com/repos/testuser/test-repo/issues/2/timeline',
    performed_via_github_app: null,
  },

  // Issue lists
  openIssues: [
    // Reference to the openIssue above - in real fixtures you'd include the full object
    {
      id: 1001,
      number: 1,
      title: 'Bug: Application crashes on startup',
      state: 'open',
      user: { login: 'testuser', id: 12345678 },
      labels: [
        { name: 'bug', color: 'd73a4a' },
        { name: 'priority:high', color: 'ff0000' },
      ],
      created_at: '2023-05-01T12:00:00Z',
      updated_at: '2023-05-15T14:30:00Z',
      comments: 2,
    },
  ],

  allIssues: [
    {
      id: 1001,
      number: 1,
      title: 'Bug: Application crashes on startup',
      state: 'open',
      user: { login: 'testuser', id: 12345678 },
      labels: [{ name: 'bug', color: 'd73a4a' }],
      created_at: '2023-05-01T12:00:00Z',
      updated_at: '2023-05-15T14:30:00Z',
      comments: 2,
    },
    {
      id: 1002,
      number: 2,
      title: 'Feature: Add dark mode support',
      state: 'closed',
      user: { login: 'contributor', id: 87654321 },
      labels: [{ name: 'enhancement', color: 'a2eeef' }],
      created_at: '2023-04-01T10:00:00Z',
      updated_at: '2023-04-30T16:45:00Z',
      closed_at: '2023-04-30T16:45:00Z',
      comments: 5,
    },
  ],

  // Comments
  comment: {
    url: 'https://api.github.com/repos/testuser/test-repo/issues/comments/1001',
    html_url: 'https://github.com/testuser/test-repo/issues/1#issuecomment-1001',
    issue_url: 'https://api.github.com/repos/testuser/test-repo/issues/1',
    id: 1001,
    node_id: 'MDEyOklzc3VlQ29tbWVudDEwMDE=',
    user: {
      login: 'testuser',
      id: 12345678,
      node_id: 'MDQ6VXNlcjEyMzQ1Njc4',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
      type: 'User',
    },
    created_at: '2023-05-02T09:30:00Z',
    updated_at: '2023-05-02T09:30:00Z',
    author_association: 'OWNER',
    body: "Thanks for reporting this issue. I'll investigate the startup crash and provide a fix.",
    reactions: {
      url: 'https://api.github.com/repos/testuser/test-repo/issues/comments/1001/reactions',
      total_count: 1,
      '+1': 1,
      '-1': 0,
      laugh: 0,
      hooray: 0,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    },
    performed_via_github_app: null,
  },

  // Created issue response
  createdIssue: {
    url: 'https://api.github.com/repos/testuser/test-repo/issues/3',
    repository_url: 'https://api.github.com/repos/testuser/test-repo',
    labels_url: 'https://api.github.com/repos/testuser/test-repo/issues/3/labels{/name}',
    comments_url: 'https://api.github.com/repos/testuser/test-repo/issues/3/comments',
    events_url: 'https://api.github.com/repos/testuser/test-repo/issues/3/events',
    html_url: 'https://github.com/testuser/test-repo/issues/3',
    id: 1003,
    node_id: 'MDU6SXNzdWUxMDAz',
    number: 3,
    title: 'Test Issue Title',
    user: {
      login: 'testuser',
      id: 12345678,
      node_id: 'MDQ6VXNlcjEyMzQ1Njc4',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345678?v=4',
      type: 'User',
    },
    labels: [
      {
        id: 208045949,
        node_id: 'MDU6TGFiZWwyMDgwNDU5NDk=',
        url: 'https://api.github.com/repos/testuser/test-repo/labels/test',
        name: 'test',
        color: '00ff00',
        default: false,
        description: 'Test label',
      },
    ],
    state: 'open',
    locked: false,
    assignee: null,
    assignees: [],
    milestone: null,
    comments: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    closed_at: null,
    author_association: 'OWNER',
    active_lock_reason: null,
    body: 'Test issue body content',
    reactions: {
      url: 'https://api.github.com/repos/testuser/test-repo/issues/3/reactions',
      total_count: 0,
      '+1': 0,
      '-1': 0,
      laugh: 0,
      hooray: 0,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    },
    timeline_url: 'https://api.github.com/repos/testuser/test-repo/issues/3/timeline',
    performed_via_github_app: null,
  },
};

// =============================================================================
// ERROR RESPONSE FIXTURES
// =============================================================================

export const ErrorFixtures = {
  // Authentication errors
  unauthorized: {
    status: 401,
    statusText: 'Unauthorized',
    error: {
      message: 'Bad credentials',
      documentation_url: 'https://docs.github.com/rest',
    },
  },

  forbidden: {
    status: 403,
    statusText: 'Forbidden',
    error: {
      message: 'Resource not accessible by personal access token',
      documentation_url:
        'https://docs.github.com/rest/overview/permissions-required-for-github-apps',
    },
  },

  // Resource not found
  notFound: {
    status: 404,
    statusText: 'Not Found',
    error: {
      message: 'Not Found',
      documentation_url: 'https://docs.github.com/rest',
    },
  },

  // Rate limiting
  rateLimited: {
    status: 429,
    statusText: 'Too Many Requests',
    headers: {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
      'x-ratelimit-used': '5000',
      'retry-after': '3600',
    },
    error: {
      message: 'API rate limit exceeded for user ID 12345678.',
      documentation_url:
        'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
    },
  },

  // Server errors
  serverError: {
    status: 500,
    statusText: 'Internal Server Error',
    error: {
      message: 'Server Error',
    },
  },

  badGateway: {
    status: 502,
    statusText: 'Bad Gateway',
    error: {
      message: 'Server Error',
    },
  },

  // Validation errors
  validationFailed: {
    status: 422,
    statusText: 'Unprocessable Entity',
    error: {
      message: 'Validation Failed',
      errors: [
        {
          resource: 'Issue',
          field: 'title',
          code: 'missing_field',
        },
      ],
      documentation_url: 'https://docs.github.com/rest/issues/issues#create-an-issue',
    },
  },

  // Repository specific errors
  repositoryDisabled: {
    status: 403,
    statusText: 'Forbidden',
    error: {
      message: 'Repository access blocked',
      documentation_url:
        'https://docs.github.com/rest/overview/resources-in-the-rest-api#forbidden',
    },
  },

  repositoryEmpty: {
    status: 404,
    statusText: 'Not Found',
    error: {
      message: 'This repository is empty.',
      documentation_url: 'https://docs.github.com/rest',
    },
  },

  // Network errors (for simulating network failures)
  networkError: new Error('Network request failed'),
  timeoutError: new Error('Request timeout'),
  abortError: new Error('Request aborted'),
};

// =============================================================================
// TOKEN AND AUTHENTICATION FIXTURES
// =============================================================================

export const TokenFixtures = {
  // Personal Access Tokens
  pat: {
    classic: 'ghp_1234567890abcdef1234567890abcdef12345678',
    fineGrained:
      'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    invalid: 'invalid-token-format',
    expired: 'ghp_expired1234567890abcdef1234567890abcdef',
  },

  // GitHub App tokens
  githubApp: {
    valid: 'ghs_1234567890abcdef1234567890abcdef12345678',
    installation: 'ghu_1234567890abcdef1234567890abcdef12345678',
    invalid: 'invalid-github-app-token',
    expired: 'ghs_expired1234567890abcdef1234567890abcdef',
  },

  // OAuth tokens
  oauth: {
    accessToken: 'gho_1234567890abcdef1234567890abcdef12345678',
    refreshToken: 'ghr_1234567890abcdef1234567890abcdef12345678',
  },

  // Token validation responses
  validation: {
    valid: {
      scopes: ['repo', 'user', 'admin:repo_hook'],
      note: 'bolt-to-github-extension',
      note_url: null,
      app: {
        name: 'bolt-to-github',
        url: 'https://github.com/mamertofabian/bolt-to-github',
        client_id: 'abcd1234',
      },
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-06-01T12:00:00Z',
      expires_at: null,
      fingerprint: 'abc123def456',
    },

    limitedScopes: {
      scopes: ['public_repo'],
      note: 'limited-access-token',
      note_url: null,
      app: {
        name: 'test-app',
        url: 'https://example.com',
        client_id: 'xyz789',
      },
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-06-01T12:00:00Z',
      expires_at: '2023-12-31T23:59:59Z',
      fingerprint: 'def456ghi789',
    },
  },
};

// =============================================================================
// STORAGE FIXTURES
// =============================================================================

export const StorageFixtures = {
  chromeStorage: {
    githubSettings: {
      gitHubSettings: {
        githubToken: TokenFixtures.pat.classic,
        repoOwner: 'testuser',
        repoName: 'test-repo',
        branch: 'main',
        isPrivateRepo: false,
        commitMessage: 'Update from Bolt',
      },
    },

    authenticationMethod: {
      authenticationMethod: 'pat',
    },

    githubAppAuth: {
      authenticationMethod: 'github_app',
    },

    supabaseToken: {
      supabaseToken: 'supabase-jwt-token-here',
      'sb-test-project-auth-token': 'alternative-storage-key-token',
    },

    projectSettings: {
      currentProjectId: 'project-123',
      recentProjects: ['project-123', 'project-456', 'project-789'],
    },
  },

  supabaseStorage: {
    session: {
      access_token: 'supabase-access-token',
      refresh_token: 'supabase-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-uuid-123',
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: {},
      },
    },
  },
};

// =============================================================================
// AUTHENTICATION STRATEGY TEST DOUBLES
// =============================================================================

export class MockPATAuthenticationStrategy implements IAuthenticationStrategy {
  type: AuthenticationType = 'pat';
  private token: string;
  private shouldFail: boolean = false;
  private shouldFailPermissions: boolean = false;
  private shouldFailRenewal: boolean = false;
  private validationDelay: number = 0;

  constructor(token: string) {
    this.token = token;
  }

  async getToken(): Promise<string> {
    if (this.shouldFail) {
      throw new Error('Failed to get PAT token');
    }
    return this.token;
  }

  async isConfigured(): Promise<boolean> {
    return !!this.token;
  }

  async validateAuth(_repoOwner?: string): Promise<{
    isValid: boolean;
    error?: string;
    userInfo?: { login: string; id: number; avatar_url: string };
    scopes?: string[];
  }> {
    await this.simulateDelay();

    if (this.shouldFail) {
      return {
        isValid: false,
        error: 'Invalid PAT token',
      };
    }

    // Also check if the token format is invalid
    if (!this.token.startsWith('ghp_') && !this.token.startsWith('github_pat_')) {
      return {
        isValid: false,
        error: 'Invalid PAT token format',
      };
    }

    return {
      isValid: true,
      userInfo: GitHubAPIResponses.user.valid,
      scopes: TokenFixtures.validation.valid.scopes,
    };
  }

  async checkPermissions(_repoOwner?: string): Promise<{
    isValid: boolean;
    error?: string;
    permissions: {
      allRepos: boolean;
      admin: boolean;
      contents: boolean;
    };
  }> {
    await this.simulateDelay();

    if (this.shouldFailPermissions) {
      return {
        isValid: false,
        error: 'Insufficient permissions',
        permissions: {
          allRepos: false,
          admin: false,
          contents: false,
        },
      };
    }

    return {
      isValid: true,
      permissions: {
        allRepos: true,
        admin: true,
        contents: true,
      },
    };
  }

  async needsRenewal(): Promise<boolean> {
    return false; // PAT tokens don't typically need renewal
  }

  async refreshToken(): Promise<string> {
    if (this.shouldFailRenewal) {
      throw new Error('PAT tokens cannot be refreshed');
    }
    return this.token; // PAT tokens can't be refreshed
  }

  async clearAuth(): Promise<void> {
    this.token = '';
  }

  async getUserInfo(): Promise<{
    login: string;
    id: number;
    avatar_url: string;
  } | null> {
    if (this.shouldFail || !this.token) {
      return null;
    }
    return GitHubAPIResponses.user.valid;
  }

  async getMetadata(): Promise<{
    scopes?: string[];
    expiresAt?: string;
    lastUsed?: string;
    [key: string]: unknown;
  }> {
    return {
      tokenType: 'pat',
      scopes: TokenFixtures.validation.valid.scopes,
      created: TokenFixtures.validation.valid.created_at,
    };
  }

  // Test configuration methods
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setShouldFailPermissions(shouldFail: boolean): void {
    this.shouldFailPermissions = shouldFail;
  }

  setShouldFailRenewal(shouldFail: boolean): void {
    this.shouldFailRenewal = shouldFail;
  }

  setValidationDelay(delay: number): void {
    this.validationDelay = delay;
  }

  private async simulateDelay(): Promise<void> {
    if (this.validationDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.validationDelay));
    }
  }

  reset(): void {
    this.shouldFail = false;
    this.shouldFailPermissions = false;
    this.shouldFailRenewal = false;
    this.validationDelay = 0;
  }
}

export class MockGitHubAppAuthenticationStrategy implements IAuthenticationStrategy {
  type: AuthenticationType = 'github_app';
  private userToken?: string;
  private shouldFail: boolean = false;
  private shouldFailPermissions: boolean = false;
  private shouldFailRenewal: boolean = false;
  private validationDelay: number = 0;
  private needsRenewalResult: boolean = false;

  constructor(userToken?: string) {
    this.userToken = userToken;
  }

  async getToken(): Promise<string> {
    if (this.shouldFail) {
      throw new Error('Failed to get GitHub App token');
    }
    if (!this.userToken) {
      throw new Error('No user token available for GitHub App authentication');
    }
    return TokenFixtures.githubApp.valid;
  }

  async isConfigured(): Promise<boolean> {
    return !!this.userToken;
  }

  async validateAuth(_repoOwner?: string): Promise<{
    isValid: boolean;
    error?: string;
    userInfo?: { login: string; id: number; avatar_url: string };
    scopes?: string[];
  }> {
    await this.simulateDelay();

    if (this.shouldFail) {
      return {
        isValid: false,
        error: 'GitHub App authentication failed',
      };
    }

    if (!this.userToken) {
      return {
        isValid: false,
        error: 'No user token available',
      };
    }

    return {
      isValid: true,
      userInfo: GitHubAPIResponses.user.valid,
      scopes: ['repo', 'user'], // GitHub App scopes
    };
  }

  async checkPermissions(_repoOwner?: string): Promise<{
    isValid: boolean;
    error?: string;
    permissions: {
      allRepos: boolean;
      admin: boolean;
      contents: boolean;
    };
  }> {
    await this.simulateDelay();

    if (this.shouldFailPermissions) {
      return {
        isValid: false,
        error: 'GitHub App has insufficient permissions',
        permissions: {
          allRepos: false,
          admin: false,
          contents: false,
        },
      };
    }

    return {
      isValid: true,
      permissions: {
        allRepos: true,
        admin: true,
        contents: true,
      },
    };
  }

  async needsRenewal(): Promise<boolean> {
    return this.needsRenewalResult;
  }

  async refreshToken(): Promise<string> {
    if (this.shouldFailRenewal) {
      throw new Error('Failed to refresh GitHub App token');
    }
    // Simulate token refresh
    return TokenFixtures.githubApp.valid;
  }

  async clearAuth(): Promise<void> {
    this.userToken = undefined;
  }

  async getUserInfo(): Promise<{
    login: string;
    id: number;
    avatar_url: string;
  } | null> {
    if (this.shouldFail || !this.userToken) {
      return null;
    }
    return GitHubAPIResponses.user.valid;
  }

  async getMetadata(): Promise<{
    scopes?: string[];
    expiresAt?: string;
    lastUsed?: string;
    [key: string]: unknown;
  }> {
    return {
      tokenType: 'github_app',
      installationId: 12345,
      appId: 67890,
      permissions: {
        contents: 'write',
        issues: 'write',
        metadata: 'read',
      },
    };
  }

  // Test configuration methods
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setShouldFailPermissions(shouldFail: boolean): void {
    this.shouldFailPermissions = shouldFail;
  }

  setShouldFailRenewal(shouldFail: boolean): void {
    this.shouldFailRenewal = shouldFail;
  }

  setNeedsRenewal(needsRenewal: boolean): void {
    this.needsRenewalResult = needsRenewal;
  }

  setValidationDelay(delay: number): void {
    this.validationDelay = delay;
  }

  setUserToken(token?: string): void {
    this.userToken = token;
  }

  private async simulateDelay(): Promise<void> {
    if (this.validationDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.validationDelay));
    }
  }

  reset(): void {
    this.shouldFail = false;
    this.shouldFailPermissions = false;
    this.shouldFailRenewal = false;
    this.needsRenewalResult = false;
    this.validationDelay = 0;
  }
}

export class MockAuthenticationStrategyFactory {
  public patStrategy: MockPATAuthenticationStrategy;
  public githubAppStrategy: MockGitHubAppAuthenticationStrategy;
  public currentStrategyType: AuthenticationType = 'pat';

  constructor() {
    this.patStrategy = new MockPATAuthenticationStrategy(TokenFixtures.pat.classic);
    this.githubAppStrategy = new MockGitHubAppAuthenticationStrategy(
      TokenFixtures.oauth.accessToken
    );
  }

  static getInstance = jest.fn(() => new MockAuthenticationStrategyFactory());

  createPATStrategy = jest.fn((token: string): IAuthenticationStrategy => {
    this.patStrategy = new MockPATAuthenticationStrategy(token);
    return this.patStrategy;
  });

  createGitHubAppStrategy = jest.fn((userToken?: string): IAuthenticationStrategy => {
    this.githubAppStrategy = new MockGitHubAppAuthenticationStrategy(userToken);
    return this.githubAppStrategy;
  });

  getCurrentStrategy = jest.fn(async (): Promise<IAuthenticationStrategy> => {
    return this.currentStrategyType === 'pat' ? this.patStrategy : this.githubAppStrategy;
  });

  // Test configuration methods
  setPATStrategy(strategy: MockPATAuthenticationStrategy): void {
    this.patStrategy = strategy;
  }

  setGitHubAppStrategy(strategy: MockGitHubAppAuthenticationStrategy): void {
    this.githubAppStrategy = strategy;
  }

  setCurrentStrategyType(type: AuthenticationType): void {
    this.currentStrategyType = type;
  }

  getPATStrategy(): MockPATAuthenticationStrategy {
    return this.patStrategy;
  }

  getGitHubAppStrategy(): MockGitHubAppAuthenticationStrategy {
    return this.githubAppStrategy;
  }

  reset(): void {
    this.patStrategy.reset();
    this.githubAppStrategy.reset();
    this.currentStrategyType = 'pat';
    jest.clearAllMocks();
  }
}

// =============================================================================
// MOCK FETCH RESPONSES BUILDER
// =============================================================================

export class MockFetchResponseBuilder {
  private responses: Map<
    string,
    { response: Partial<Response> | Promise<Partial<Response>>; options?: RequestInit }
  > = new Map();
  private defaultResponse: Partial<Response> | null = null;
  private callCount = 0;
  private shouldFail = false;
  private delay = 0;

  // Repository operations
  mockRepoExists(owner: string, repo: string, exists: boolean): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}`;
    if (exists) {
      this.responses.set(key, {
        response: {
          ok: true,
          status: 200,
          json: () => Promise.resolve(GitHubAPIResponses.repository.existing),
        },
      });
    } else {
      this.responses.set(key, {
        response: {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: () => Promise.resolve(ErrorFixtures.notFound.error),
        },
      });
    }
    return this;
  }

  mockGetRepoInfo(owner: string, repo: string, repoData?: Record<string, unknown>): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () => Promise.resolve(repoData || GitHubAPIResponses.repository.existing),
      },
    });
    return this;
  }

  mockCreateRepo(repoData?: Record<string, unknown>): this {
    const key = `POST:https://api.github.com/user/repos`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(repoData || GitHubAPIResponses.repository.created),
      },
    });
    return this;
  }

  mockDeleteRepo(owner: string, repo: string): this {
    const key = `DELETE:https://api.github.com/repos/${owner}/${repo}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 204,
      },
    });
    return this;
  }

  mockListRepos(repos?: Record<string, unknown>[]): this {
    const key = `GET:https://api.github.com/user/repos?sort=updated&per_page=100`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () => Promise.resolve(repos || GitHubAPIResponses.repositories.userRepos),
      },
    });
    return this;
  }

  mockListBranches(owner: string, repo: string, branches?: Record<string, unknown>[]): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}/branches`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () => Promise.resolve(branches || GitHubAPIResponses.branches.typical),
      },
    });
    return this;
  }

  mockPushFile(owner: string, repo: string, path: string): this {
    const key = `PUT:https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(GitHubAPIResponses.filePush.created),
      },
    });
    return this;
  }

  // Issue operations
  mockGetIssues(
    owner: string,
    repo: string,
    state: string = 'open',
    issues?: Record<string, unknown>[]
  ): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}/issues?state=${state}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            issues || (state === 'open' ? IssueFixtures.openIssues : IssueFixtures.allIssues)
          ),
      },
    });
    return this;
  }

  mockGetIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    issue?: Record<string, unknown>
  ): this {
    const key = `GET:https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 200,
        json: () => Promise.resolve(issue || IssueFixtures.openIssue),
      },
    });
    return this;
  }

  mockCreateIssue(owner: string, repo: string, issue?: Record<string, unknown>): this {
    const key = `POST:https://api.github.com/repos/${owner}/${repo}/issues`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(issue || IssueFixtures.createdIssue),
      },
    });
    return this;
  }

  mockAddIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    comment?: Record<string, unknown>
  ): this {
    const key = `POST:https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    this.responses.set(key, {
      response: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(comment || IssueFixtures.comment),
      },
    });
    return this;
  }

  // Error scenarios
  mockUnauthorized(endpoint: string): this {
    this.responses.set(endpoint, {
      response: {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve(ErrorFixtures.unauthorized.error),
      },
    });
    return this;
  }

  mockRateLimited(endpoint: string): this {
    const headers = new Headers();
    Object.entries(ErrorFixtures.rateLimited.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });

    this.responses.set(endpoint, {
      response: {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers,
        json: () => Promise.resolve(ErrorFixtures.rateLimited.error),
      },
    });
    return this;
  }

  mockNetworkError(endpoint: string): this {
    this.responses.set(endpoint, {
      response: Promise.reject(ErrorFixtures.networkError),
    });
    return this;
  }

  mockServerError(endpoint: string): this {
    this.responses.set(endpoint, {
      response: {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve(ErrorFixtures.serverError.error),
      },
    });
    return this;
  }

  // Configuration
  setDelay(delay: number): this {
    this.delay = delay;
    return this;
  }

  setShouldFail(shouldFail: boolean): this {
    this.shouldFail = shouldFail;
    return this;
  }

  setDefaultResponse(response: Partial<Response>): this {
    this.defaultResponse = response;
    return this;
  }

  // Build and install the mock
  build(): jest.MockedFunction<typeof fetch> {
    const mockFetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      this.callCount++;

      // Simulate delay
      if (this.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delay));
      }

      // Handle general failure mode
      if (this.shouldFail) {
        throw ErrorFixtures.networkError;
      }

      // Determine request key
      const urlStr =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      const key = `${method}:${urlStr}`;

      // Check for exact match
      const exactMatch = this.responses.get(key);
      if (exactMatch) {
        const response = exactMatch.response;
        // Handle promise rejection responses
        if (response instanceof Promise) {
          return await response;
        }
        return response;
      }

      // Check for pattern matches (for cache-busted URLs, etc.)
      for (const [pattern, responseData] of this.responses.entries()) {
        if (this.matchesPattern(key, pattern)) {
          const response = responseData.response;
          // Handle promise rejection responses
          if (response instanceof Promise) {
            return await response;
          }
          return response;
        }
      }

      // Return default response or 404
      if (this.defaultResponse) {
        return this.defaultResponse;
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve(ErrorFixtures.notFound.error),
      };
    }) as jest.MockedFunction<typeof fetch>;

    global.fetch = mockFetch;
    return mockFetch;
  }

  private matchesPattern(key: string, pattern: string): boolean {
    // Handle cache-busted URLs by removing query parameters for comparison
    const baseKey = key.split('?')[0];
    const basePattern = pattern.split('?')[0];
    return baseKey === basePattern;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.responses.clear();
    this.defaultResponse = null;
    this.callCount = 0;
    this.shouldFail = false;
    this.delay = 0;
    jest.clearAllMocks();
  }
}

// =============================================================================
// CHROME STORAGE MOCK
// =============================================================================

export class MockChromeStorage {
  private localStorage: Map<string, unknown> = new Map();
  private syncStorage: Map<string, unknown> = new Map();
  private shouldFail = false;
  private delay = 0;

  constructor() {
    this.setupChromeMocks();
  }

  private setupChromeMocks(): void {
    // Mock chrome.storage.local
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(async (keys?: string | string[]) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            if (!keys) {
              return Object.fromEntries(this.localStorage);
            }

            const keyArray = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, unknown> = {};

            for (const key of keyArray) {
              if (this.localStorage.has(key)) {
                result[key] = this.localStorage.get(key);
              }
            }

            return result;
          }),

          set: jest.fn(async (items: Record<string, unknown>) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            for (const [key, value] of Object.entries(items)) {
              this.localStorage.set(key, value);
            }
          }),

          remove: jest.fn(async (keys: string | string[]) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            const keyArray = Array.isArray(keys) ? keys : [keys];
            for (const key of keyArray) {
              this.localStorage.delete(key);
            }
          }),

          clear: jest.fn(async () => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }
            this.localStorage.clear();
          }),
        },

        sync: {
          get: jest.fn(async (keys?: string | string[]) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            if (!keys) {
              return Object.fromEntries(this.syncStorage);
            }

            const keyArray = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, unknown> = {};

            for (const key of keyArray) {
              if (this.syncStorage.has(key)) {
                result[key] = this.syncStorage.get(key);
              }
            }

            return result;
          }),

          set: jest.fn(async (items: Record<string, unknown>) => {
            await this.simulateDelay();
            if (this.shouldFail) {
              throw new Error('Storage operation failed');
            }

            for (const [key, value] of Object.entries(items)) {
              this.syncStorage.set(key, value);
            }
          }),
        },
      },
    } as unknown as typeof chrome;
  }

  // Preset configurations
  loadGitHubSettings(settings?: Record<string, unknown>): void {
    this.localStorage.set(
      'gitHubSettings',
      settings || StorageFixtures.chromeStorage.githubSettings.gitHubSettings
    );
  }

  loadAuthenticationMethod(method: 'pat' | 'github_app' = 'pat'): void {
    this.localStorage.set('authenticationMethod', method);
  }

  loadSupabaseToken(token?: string): void {
    this.localStorage.set(
      'supabaseToken',
      token || StorageFixtures.chromeStorage.supabaseToken.supabaseToken
    );
  }

  loadProjectSettings(settings?: Record<string, unknown>): void {
    const projectSettings = settings || StorageFixtures.chromeStorage.projectSettings;
    for (const [key, value] of Object.entries(projectSettings)) {
      this.localStorage.set(key, value);
    }
  }

  // Test configuration
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setDelay(delay: number): void {
    this.delay = delay;
  }

  // Direct storage access for testing
  setItem(key: string, value: unknown, useSync: boolean = false): void {
    if (useSync) {
      this.syncStorage.set(key, value);
    } else {
      this.localStorage.set(key, value);
    }
  }

  getItem(key: string, useSync: boolean = false): unknown {
    return useSync ? this.syncStorage.get(key) : this.localStorage.get(key);
  }

  getAllItems(useSync: boolean = false): Record<string, unknown> {
    const storage = useSync ? this.syncStorage : this.localStorage;
    return Object.fromEntries(storage);
  }

  private async simulateDelay(): Promise<void> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }
  }

  reset(): void {
    this.localStorage.clear();
    this.syncStorage.clear();
    this.shouldFail = false;
    this.delay = 0;
    jest.clearAllMocks();
  }
}

// =============================================================================
// TEST SCENARIO BUILDERS
// =============================================================================

export class UnifiedGitHubServiceTestScenarios {
  private mockFetch: MockFetchResponseBuilder;
  private mockStorage: MockChromeStorage;
  private mockAuthFactory: MockAuthenticationStrategyFactory;

  constructor() {
    this.mockFetch = new MockFetchResponseBuilder();
    this.mockStorage = new MockChromeStorage();
    this.mockAuthFactory = new MockAuthenticationStrategyFactory();
  }

  // Successful operation scenarios
  setupSuccessfulPATAuthentication(): this {
    this.mockStorage.loadGitHubSettings();
    this.mockStorage.loadAuthenticationMethod('pat');

    const patStrategy = this.mockAuthFactory.getPATStrategy();
    patStrategy.setShouldFail(false);

    return this;
  }

  setupSuccessfulGitHubAppAuthentication(): this {
    this.mockStorage.loadAuthenticationMethod('github_app');
    this.mockStorage.loadSupabaseToken();

    const appStrategy = this.mockAuthFactory.getGitHubAppStrategy();
    appStrategy.setShouldFail(false);
    appStrategy.setUserToken(TokenFixtures.oauth.accessToken);

    return this;
  }

  setupRepositoryOperations(owner: string = 'testuser', repo: string = 'test-repo'): this {
    this.mockFetch
      .mockRepoExists(owner, repo, true)
      .mockGetRepoInfo(owner, repo)
      .mockCreateRepo()
      .mockListRepos()
      .mockListBranches(owner, repo)
      .mockPushFile(owner, repo, 'test-file.txt');

    return this;
  }

  setupIssueOperations(owner: string = 'testuser', repo: string = 'test-repo'): this {
    this.mockFetch
      .mockGetIssues(owner, repo, 'open')
      .mockGetIssue(owner, repo, 1)
      .mockCreateIssue(owner, repo)
      .mockAddIssueComment(owner, repo, 1);

    return this;
  }

  // Error scenarios
  setupAuthenticationFailure(): this {
    this.mockStorage.loadAuthenticationMethod('pat');
    this.mockAuthFactory.getPATStrategy().setShouldFail(true);
    return this;
  }

  setupNetworkFailure(): this {
    this.mockFetch.setShouldFail(true);
    return this;
  }

  setupRateLimiting(owner: string = 'testuser', repo: string = 'test-repo'): this {
    this.mockFetch.mockRateLimited(`GET:https://api.github.com/repos/${owner}/${repo}`);
    return this;
  }

  setupRepositoryNotFound(owner: string = 'testuser', repo: string = 'nonexistent'): this {
    this.mockFetch.mockRepoExists(owner, repo, false);
    return this;
  }

  setupPermissionDenied(): this {
    this.mockAuthFactory.getPATStrategy().setShouldFailPermissions(true);
    return this;
  }

  // Performance scenarios
  setupSlowNetwork(delay: number = 5000): this {
    this.mockFetch.setDelay(delay);
    return this;
  }

  setupSlowAuthentication(delay: number = 3000): this {
    this.mockAuthFactory.getPATStrategy().setValidationDelay(delay);
    this.mockAuthFactory.getGitHubAppStrategy().setValidationDelay(delay);
    return this;
  }

  // Build and apply all mocks
  build(): {
    mockFetch: jest.MockedFunction<typeof fetch>;
    mockStorage: MockChromeStorage;
    mockAuthFactory: MockAuthenticationStrategyFactory;
  } {
    const mockFetch = this.mockFetch.build();

    // Get the existing mocked factory instance and configure it
    const { AuthenticationStrategyFactory } = jest.requireMock(
      '../../AuthenticationStrategyFactory'
    );
    const mockFactoryInstance = AuthenticationStrategyFactory.getInstance();

    // Configure the existing mock factory with our settings
    if (mockFactoryInstance) {
      // Copy our configuration to the existing mock
      mockFactoryInstance.patStrategy = this.mockAuthFactory.getPATStrategy();
      mockFactoryInstance.githubAppStrategy = this.mockAuthFactory.getGitHubAppStrategy();
      mockFactoryInstance.currentStrategyType = this.mockAuthFactory.currentStrategyType;

      // Update the mock methods to use our configured strategies
      mockFactoryInstance.createPATStrategy.mockImplementation((token: string) => {
        this.mockAuthFactory.createPATStrategy(token);
        return this.mockAuthFactory.getPATStrategy();
      });

      mockFactoryInstance.createGitHubAppStrategy.mockImplementation((userToken?: string) => {
        this.mockAuthFactory.createGitHubAppStrategy(userToken);
        return this.mockAuthFactory.getGitHubAppStrategy();
      });

      mockFactoryInstance.getCurrentStrategy.mockImplementation(async () => {
        return this.mockAuthFactory.getCurrentStrategy();
      });
    }

    return {
      mockFetch,
      mockStorage: this.mockStorage,
      mockAuthFactory: this.mockAuthFactory,
    };
  }

  reset(): void {
    this.mockFetch.reset();
    this.mockStorage.reset();
    this.mockAuthFactory.reset();
  }
}

// =============================================================================
// TEST HELPERS AND UTILITIES
// =============================================================================

export class UnifiedGitHubServiceTestHelpers {
  static createAuthConfig(type: AuthenticationType, token?: string): AuthenticationConfig {
    return {
      type,
      token: token || (type === 'pat' ? TokenFixtures.pat.classic : undefined),
    };
  }

  static async waitForAsync(ms: number = 0): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static createMockResponse(data: unknown, status: number = 200, ok: boolean = true): Response {
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
      headers: new Headers(),
      body: null,
      bodyUsed: false,
      redirected: false,
      type: 'basic',
      url: '',
    } as Response;
  }

  static expectValidGitHubApiCall(
    mockFetch: jest.MockedFunction<typeof fetch>,
    expectedUrl: string,
    expectedMethod: string = 'GET',
    expectedHeaders?: Record<string, string>
  ): void {
    // For GET requests, options might be undefined
    if (expectedMethod === 'GET') {
      expect(mockFetch).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/Bearer .+/),
            Accept: 'application/vnd.github.v3+json',
            ...expectedHeaders,
          }),
        })
      );
    } else {
      expect(mockFetch).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({
          method: expectedMethod,
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/Bearer .+/),
            Accept: 'application/vnd.github.v3+json',
            ...expectedHeaders,
          }),
        })
      );
    }
  }

  static expectNoGitHubApiCalls(mockFetch: jest.MockedFunction<typeof fetch>): void {
    expect(mockFetch).not.toHaveBeenCalled();
  }

  static generateTestToken(type: 'pat' | 'github_app' | 'invalid' = 'pat'): string {
    switch (type) {
      case 'pat':
        return TokenFixtures.pat.classic;
      case 'github_app':
        return TokenFixtures.githubApp.valid;
      case 'invalid':
        return TokenFixtures.pat.invalid;
      default:
        return TokenFixtures.pat.classic;
    }
  }

  static createTestRepository(
    overrides: Partial<Record<string, unknown>> = {}
  ): Record<string, unknown> {
    return {
      ...GitHubAPIResponses.repository.existing,
      ...overrides,
    };
  }

  static createTestIssue(
    overrides: Partial<Record<string, unknown>> = {}
  ): Record<string, unknown> {
    return {
      ...IssueFixtures.openIssue,
      ...overrides,
    };
  }

  static verifyErrorStructure(error: unknown, expectedMessage?: string): void {
    expect(error).toBeInstanceOf(Error);
    if (expectedMessage) {
      expect((error as Error).message).toContain(expectedMessage);
    }
  }

  static async expectAsyncError(
    promise: Promise<unknown>,
    expectedMessage?: string
  ): Promise<Error> {
    try {
      await promise;
      throw new Error('Expected promise to reject, but it resolved');
    } catch (error) {
      if (expectedMessage) {
        expect(error instanceof Error ? error.message : String(error)).toContain(expectedMessage);
      }
      return error as Error;
    }
  }
}

// =============================================================================
// EXPORT ALL FIXTURES AND UTILITIES
// =============================================================================

export const TestFixtures = {
  GitHubAPIResponses,
  IssueFixtures,
  ErrorFixtures,
  TokenFixtures,
  StorageFixtures,
};

export const TestDoubles = {
  MockPATAuthenticationStrategy,
  MockGitHubAppAuthenticationStrategy,
  MockAuthenticationStrategyFactory,
  MockFetchResponseBuilder,
  MockChromeStorage,
};

export const TestScenarios = {
  UnifiedGitHubServiceTestScenarios,
};

export const TestHelpers = {
  UnifiedGitHubServiceTestHelpers,
};

// Default export with everything organized
export default {
  fixtures: TestFixtures,
  doubles: TestDoubles,
  scenarios: TestScenarios,
  helpers: TestHelpers,
};
