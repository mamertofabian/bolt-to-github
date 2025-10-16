import type { GitHubCommit } from '../../services/types/repository';

/**
 * Simplified commit item for display in the commits list
 */
export interface CommitListItem {
  sha: string;
  shortSha: string;
  message: string;
  author: {
    name: string;
    email: string;
    avatar_url: string | null;
    login: string | null;
  };
  date: string;
  htmlUrl: string;
  filesChangedCount: number;
}

/**
 * Filter options for commit list
 */
export interface CommitsFilter {
  searchQuery: string;
  author?: string;
}

/**
 * Pagination state for commits list
 */
export interface CommitsPagination {
  page: number;
  perPage: number;
  totalCount?: number;
  hasMore: boolean;
}

/**
 * Options for CommitsService methods
 */
export interface CommitsServiceOptions {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

/**
 * Response from fetching commits
 */
export interface FetchCommitsResponse {
  commits: CommitListItem[];
  hasMore: boolean;
  totalCount?: number;
}
