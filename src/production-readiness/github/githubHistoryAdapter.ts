import type { PartialDataNotice } from '../domain';
import type { PrsCommitHistoryRecord } from '../history/historyBaselineEngine';

export type GitHubHistoryReader = <T>(endpoint: string, signal?: AbortSignal) => Promise<T>;

export interface GitHubHistoryRequest {
  owner: string;
  repo: string;
  baseRef: string;
  maxCommits: number;
  readGitHub: GitHubHistoryReader;
  isSensitivePath?: (path: string) => boolean;
  signal?: AbortSignal;
}

export interface GitHubHistoryResult {
  records: PrsCommitHistoryRecord[];
  limitations: PartialDataNotice[];
}

interface GitHubCommitListItem {
  sha: string;
  commit: {
    message: string;
    committer: { date: string };
  };
}

interface GitHubCommitFile {
  filename: string;
  status: string;
}

interface GitHubCommitDetail {
  stats: { additions: number; deletions: number };
  files: GitHubCommitFile[];
}

const FILES_PER_PAGE = 100;
const MAX_FILE_PAGES = 3;
const MAX_SHA_LENGTH = 100;
const MAX_TIMESTAMP_LENGTH = 50;
const MAX_PATH_LENGTH = 1_000;

function compareCodePoints(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function requiredIdentifier(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${name} must not be empty.`);
  return normalized;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('GitHub history collection was cancelled.', 'AbortError');
  }
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  return typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : undefined;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).toLowerCase();
}

function validPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= MAX_PATH_LENGTH &&
    !path.includes('\0') &&
    !path.includes('\\') &&
    !path.startsWith('/') &&
    path.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
  );
}

function validateListItem(item: GitHubCommitListItem): void {
  if (
    !item ||
    typeof item.sha !== 'string' ||
    !item.sha ||
    item.sha.length > MAX_SHA_LENGTH ||
    typeof item.commit?.message !== 'string' ||
    typeof item.commit?.committer?.date !== 'string' ||
    item.commit.committer.date.length > MAX_TIMESTAMP_LENGTH ||
    !Number.isFinite(Date.parse(item.commit.committer.date))
  ) {
    throw new Error('GitHub commit history metadata was incomplete.');
  }
}

function nonNegativeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`GitHub commit ${name} was invalid.`);
  }
  return value;
}

function normalizedDetail(detail: GitHubCommitDetail): GitHubCommitDetail {
  if (!detail?.stats || !Array.isArray(detail.files)) {
    throw new Error('GitHub commit detail metadata was incomplete.');
  }
  const paths = new Set<string>();
  const files: GitHubCommitFile[] = [];
  for (const file of detail.files) {
    if (
      !file ||
      typeof file.filename !== 'string' ||
      !validPath(file.filename) ||
      typeof file.status !== 'string' ||
      paths.has(file.filename)
    ) {
      throw new Error('GitHub commit file metadata was incomplete.');
    }
    paths.add(file.filename);
    files.push({ filename: file.filename, status: file.status });
  }
  return {
    stats: {
      additions: nonNegativeInteger('additions', detail.stats.additions),
      deletions: nonNegativeInteger('deletions', detail.stats.deletions),
    },
    files: files.sort((left, right) => compareCodePoints(left.filename, right.filename)),
  };
}

async function fetchCommitDetail(
  root: string,
  sha: string,
  readGitHub: GitHubHistoryReader,
  signal: AbortSignal | undefined
): Promise<GitHubCommitDetail> {
  let stats: GitHubCommitDetail['stats'] | undefined;
  const files: GitHubCommitFile[] = [];
  const paths = new Set<string>();

  for (let page = 1; page <= MAX_FILE_PAGES; page++) {
    throwIfAborted(signal);
    const response = normalizedDetail(
      await readGitHub<GitHubCommitDetail>(
        `${root}/commits/${encodeURIComponent(sha)}?per_page=${FILES_PER_PAGE}&page=${page}`,
        signal
      )
    );
    throwIfAborted(signal);
    if (
      stats &&
      (stats.additions !== response.stats.additions || stats.deletions !== response.stats.deletions)
    ) {
      throw new Error('GitHub commit statistics changed between file pages.');
    }
    stats ??= response.stats;
    for (const file of response.files) {
      if (paths.has(file.filename)) {
        throw new Error('GitHub commit file pages contained a duplicate path.');
      }
      paths.add(file.filename);
      files.push(file);
    }
    if (response.files.length < FILES_PER_PAGE) {
      return { stats, files };
    }
  }
  throw new Error('GitHub commit file metadata exceeded the bounded history page limit.');
}

function subjectOf(message: string): string {
  return message.split(/\r?\n/u, 1)[0].trim().slice(0, 200);
}

function isB2gSubject(subject: string): boolean {
  return /^(?:\[B2G\]|B2G:|Bolt to GitHub:)/iu.test(subject);
}

function unavailableResult(owner: string, repo: string, error: unknown): GitHubHistoryResult {
  const status = statusOf(error);
  const text = errorText(error);
  const rateLimited = status === 429 || (status === 403 && text.includes('rate limit'));
  return {
    records: [],
    limitations: [
      {
        source: rateLimited ? 'rate_limit' : 'history',
        message: rateLimited
          ? `GitHub API rate limit prevented history collection for ${owner}/${repo}.`
          : `GitHub commit history was unavailable for ${owner}/${repo}.`,
        confidenceImpact: 'medium',
      },
    ],
  };
}

export async function fetchPrsCommitHistory(
  request: GitHubHistoryRequest
): Promise<GitHubHistoryResult> {
  const owner = requiredIdentifier('owner', request.owner);
  const repo = requiredIdentifier('repo', request.repo);
  const baseRef = requiredIdentifier('baseRef', request.baseRef);
  if (
    !Number.isSafeInteger(request.maxCommits) ||
    request.maxCommits < 1 ||
    request.maxCommits > 30
  ) {
    throw new TypeError('maxCommits must be a safe integer between 1 and 30.');
  }
  const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    throwIfAborted(request.signal);
    const list = await request.readGitHub<GitHubCommitListItem[]>(
      `${root}/commits?sha=${encodeURIComponent(baseRef)}&per_page=${request.maxCommits}`,
      request.signal
    );
    throwIfAborted(request.signal);
    if (!Array.isArray(list)) throw new Error('GitHub commit history response was invalid.');
    const records: PrsCommitHistoryRecord[] = [];
    const limitations: PartialDataNotice[] = [];
    const seenShas = new Set<string>();

    for (const item of list.slice(0, request.maxCommits)) {
      try {
        validateListItem(item);
        if (seenShas.has(item.sha)) {
          limitations.push({
            source: 'history',
            message: `GitHub returned duplicate commit metadata for ${owner}/${repo}; the duplicate was ignored.`,
            confidenceImpact: 'medium',
          });
          continue;
        }
        seenShas.add(item.sha);
        throwIfAborted(request.signal);
        const detail = await fetchCommitDetail(root, item.sha, request.readGitHub, request.signal);
        const changedPaths = detail.files.map((file) => file.filename);
        const sensitivePaths = changedPaths.filter(
          (path) => request.isSensitivePath?.(path) === true
        );
        const subject = subjectOf(item.commit.message);
        const isB2gCommit = isB2gSubject(subject);
        records.push({
          id: item.sha,
          sha: item.sha,
          subject,
          isB2gCommit,
          source: isB2gCommit ? 'b2g_commit' : 'github_commit',
          recordedAt: item.commit.committer.date,
          changedFiles: detail.files.length,
          addedFiles: detail.files.filter((file) => file.status === 'added').length,
          deletedFiles: detail.files.filter((file) => file.status === 'removed').length,
          addedLines: detail.stats.additions,
          deletedLines: detail.stats.deletions,
          sensitiveFilesChanged: sensitivePaths.length,
          changedPaths,
          sensitivePaths,
        });
      } catch (error) {
        if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          throw error;
        }
        const status = statusOf(error);
        if (status === 429 || status === 403) {
          const rateLimited = status === 429 || errorText(error).includes('rate limit');
          limitations.push({
            source: rateLimited ? 'rate_limit' : 'history',
            message: rateLimited
              ? `GitHub API rate limit stopped history collection for ${owner}/${repo}.`
              : `GitHub denied further history collection for ${owner}/${repo}.`,
            confidenceImpact: 'medium',
          });
          break;
        }
        limitations.push({
          source: 'history',
          message: `One GitHub commit history record could not be read for ${owner}/${repo}.`,
          confidenceImpact: 'medium',
        });
      }
    }

    records.sort(
      (left, right) =>
        Date.parse(left.recordedAt) - Date.parse(right.recordedAt) ||
        compareCodePoints(left.sha, right.sha)
    );
    return { records, limitations };
  } catch (error) {
    if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }
    return unavailableResult(owner, repo, error);
  }
}
