import { createLogger } from '$lib/utils/logger';
import type { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
import type { GitHubCommit } from '../../services/types/repository';
import type {
  CommitListItem,
  CommitsFilter,
  CommitsPagination,
  CommitsServiceOptions,
  FetchCommitsResponse,
} from '../types/commits';

const logger = createLogger('CommitsService');

/**
 * Service for managing repository commits
 * Handles fetching, caching, and filtering commits from GitHub
 */
export class CommitsService {
  // Cache for commits: Map<cacheKey, commits[]>
  private static cache = new Map<string, CommitListItem[]>();
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private static cacheTimestamps = new Map<string, number>();

  /**
   * Fetch commits with pagination
   */
  async fetchCommits(
    options: CommitsServiceOptions,
    pagination: CommitsPagination,
    githubService: UnifiedGitHubService
  ): Promise<FetchCommitsResponse> {
    const { owner, repo, branch } = options;
    const { page, perPage } = pagination;

    // Generate cache key
    const cacheKey = `${owner}/${repo}/${branch}/${page}/${perPage}`;

    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      const cachedCommits = CommitsService.cache.get(cacheKey);
      if (cachedCommits) {
        logger.info('Returning cached commits', { cacheKey, count: cachedCommits.length });
        return {
          commits: cachedCommits,
          hasMore: cachedCommits.length === perPage,
        };
      }
    }

    try {
      logger.info('Fetching commits from GitHub', { owner, repo, branch, page, perPage });

      // Fetch commits from GitHub
      const commits = await githubService.request<GitHubCommit[]>(
        'GET',
        `/repos/${owner}/${repo}/commits`,
        {
          params: {
            sha: branch,
            per_page: perPage,
            page: page,
          },
        }
      );

      // Transform commits to CommitListItem
      const transformedCommits = commits.map((commit) => this.transformCommit(commit));

      // Cache the results
      CommitsService.cache.set(cacheKey, transformedCommits);
      CommitsService.cacheTimestamps.set(cacheKey, Date.now());

      logger.info('Successfully fetched and cached commits', {
        count: transformedCommits.length,
      });

      return {
        commits: transformedCommits,
        hasMore: commits.length === perPage,
      };
    } catch (error) {
      logger.error('Error fetching commits', error);
      throw error;
    }
  }

  /**
   * Filter commits by search query (message or author)
   */
  filterCommits(commits: CommitListItem[], filter: CommitsFilter): CommitListItem[] {
    const { searchQuery } = filter;

    if (!searchQuery || searchQuery.trim() === '') {
      return commits;
    }

    const query = searchQuery.toLowerCase();

    return commits.filter((commit) => {
      // Search in commit message
      if (commit.message.toLowerCase().includes(query)) {
        return true;
      }

      // Search in author name
      if (commit.author.name.toLowerCase().includes(query)) {
        return true;
      }

      // Search in author login (if available)
      if (commit.author.login && commit.author.login.toLowerCase().includes(query)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Get detailed commit information
   */
  async getCommitDetails(
    owner: string,
    repo: string,
    sha: string,
    token: string,
    githubService: UnifiedGitHubService
  ): Promise<GitHubCommit> {
    try {
      logger.info('Fetching commit details', { owner, repo, sha });

      const commit = await githubService.request<GitHubCommit>(
        'GET',
        `/repos/${owner}/${repo}/commits/${sha}`
      );

      return commit;
    } catch (error) {
      logger.error('Error fetching commit details', error);
      throw error;
    }
  }

  /**
   * Transform GitHub API commit to CommitListItem
   */
  private transformCommit(commit: GitHubCommit): CommitListItem {
    // Extract first line of commit message
    const message = commit.commit.message.split('\n')[0];

    // Get short SHA (first 7 characters)
    const shortSha = commit.sha.substring(0, 7);

    // Extract author information
    const author = {
      name: commit.commit.author.name,
      email: commit.commit.author.email,
      avatar_url: commit.author?.avatar_url || null,
      login: commit.author?.login || null,
    };

    return {
      sha: commit.sha,
      shortSha,
      message,
      author,
      date: commit.commit.author.date,
      htmlUrl: commit.html_url,
      filesChangedCount: 0, // Placeholder - can be enhanced to fetch actual file count
    };
  }

  /**
   * Check if cache is valid for a given key
   */
  private isCacheValid(cacheKey: string): boolean {
    const timestamp = CommitsService.cacheTimestamps.get(cacheKey);
    if (!timestamp) {
      return false;
    }

    const age = Date.now() - timestamp;
    return age < CommitsService.CACHE_DURATION;
  }

  /**
   * Clear all cached commits (useful for testing)
   */
  static clearCache(): void {
    CommitsService.cache.clear();
    CommitsService.cacheTimestamps.clear();
    logger.info('Commits cache cleared');
  }
}
