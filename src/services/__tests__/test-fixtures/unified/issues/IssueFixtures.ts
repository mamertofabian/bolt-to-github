/**
 * GitHub Issue API Response Fixtures
 *
 * Realistic issue and comment data for testing GitHub issue management operations
 */

// Lazy-loaded cache for large issue fixtures
let _cachedOpenIssue: typeof openIssueData | null = null;
let _cachedClosedIssue: typeof closedIssueData | null = null;

// Define the data separately to enable lazy loading
const openIssueData = {
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
} as const;

const closedIssueData = {
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
} as const;

export const IssueFixtures = {
  /**
   * Open issue with detailed information (lazy loaded)
   * Use this for testing issue fetching and display
   */
  get openIssue() {
    if (!_cachedOpenIssue) {
      _cachedOpenIssue = openIssueData;
    }
    return _cachedOpenIssue;
  },

  /**
   * Closed issue with assignees (lazy loaded)
   * Use this for testing issue state and assignment
   */
  get closedIssue() {
    if (!_cachedClosedIssue) {
      _cachedClosedIssue = closedIssueData;
    }
    return _cachedClosedIssue;
  },

  /**
   * Minimal open issue - for lightweight/performance testing
   */
  minimalOpenIssue: {
    id: 1001,
    number: 1,
    title: 'Bug: Application crashes on startup',
    state: 'open',
    user: { login: 'testuser', id: 12345678 },
    created_at: '2023-05-01T12:00:00Z',
    updated_at: '2023-05-15T14:30:00Z',
  },

  /**
   * List of open issues (summary view)
   */
  openIssues: [
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

  /**
   * List of all issues (both open and closed)
   */
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

  /**
   * Issue comment response
   */
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

  /**
   * Newly created issue response
   */
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
} as const;

/**
 * Factory function to create custom issue response
 */
export function createIssueResponse(overrides: Partial<typeof openIssueData> = {}) {
  return {
    ...openIssueData,
    ...overrides,
  };
}

/**
 * Factory function to create minimal issue (for performance testing)
 */
export function createMinimalIssue(
  number: number = 1,
  title: string = 'Test Issue',
  state: 'open' | 'closed' = 'open'
) {
  return {
    id: 1000 + number,
    number,
    title,
    state,
    user: { login: 'testuser', id: 12345678 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
