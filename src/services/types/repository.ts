// GitHub API Type Definitions
export interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
    avatar_url: string;
    type: string;
  };
  html_url: string;
  description: string | null;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  git_url: string;
  ssh_url: string;
  clone_url: string;
  language: string | null;
  size: number;
  default_branch: string;
  open_issues_count?: number;
  // Additional fields for backward compatibility
  exists?: boolean;
}

export interface GitHubCommit {
  sha: string;
  node_id: string;
  url: string;
  html_url: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    url: string;
    comment_count: number;
  };
  author: {
    login: string;
    id: number;
    avatar_url: string;
    type: string;
  } | null;
  committer: {
    login: string;
    id: number;
    avatar_url: string;
    type: string;
  } | null;
  parents: Array<{
    sha: string;
    url: string;
    html_url: string;
  }>;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface GitHubCreateOrUpdateFileRequest {
  message: string;
  content: string;
  branch: string;
  sha?: string;
}

export interface GitHubFileResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string | null;
    type: string;
  };
  commit: {
    sha: string;
    node_id: string;
    url: string;
    html_url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
}

export interface GitHubIssue {
  id: number;
  node_id: string;
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  number: number;
  state: 'open' | 'closed';
  title: string;
  body: string | null;
  user: {
    login: string;
    id: number;
    avatar_url: string;
  };
  labels: Array<{
    id: number;
    node_id: string;
    url: string;
    name: string;
    color: string;
    default: boolean;
  }>;
  assignees: Array<{
    login: string;
    id: number;
    avatar_url: string;
  }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
}

export interface GitHubIssueUpdate {
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
}

export interface GitHubComment {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  body: string;
  user: {
    login: string;
    id: number;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  size?: number;
  sha: string;
  url: string;
}

/**
 * Interface for repository information
 */
export interface RepoInfo {
  name: string;
  description?: string;
  private?: boolean;
  exists: boolean;
}

/**
 * Interface for repository creation options
 */
export interface RepoCreateOptions {
  name: string;
  private?: boolean;
  auto_init?: boolean;
  description?: string;
  org?: string;
}

/**
 * Interface for repository summary information
 */
export interface RepoSummary {
  name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  language: string | null;
}

export interface GitHubOrganization {
  login: string;
  id: number;
  node_id: string;
  url: string;
  repos_url: string;
  events_url: string;
  hooks_url: string;
  issues_url: string;
  members_url: string;
  public_members_url: string;
  avatar_url: string;
  description: string | null;
}

export interface GitHubUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  type: 'User' | 'Organization';
  site_admin: boolean;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  hireable: boolean | null;
  bio: string | null;
  twitter_username: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}
