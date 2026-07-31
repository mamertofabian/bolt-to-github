import type { GitRefSummary, PartialDataNotice, RepositoryRef } from '../domain';

export type GitHubMetadataReader = <T>(endpoint: string, signal?: AbortSignal) => Promise<T>;

export interface GitHubBaseInventoryRequest {
  owner: string;
  repository: string;
  baseRef: string;
  readGitHub: GitHubMetadataReader;
  signal?: AbortSignal;
}

export interface GitHubBaseInventoryEntry {
  path: string;
  sizeBytes: number | undefined;
  blobSha: string;
  mode: string;
}

export interface GitHubBaseInventoryResult {
  repository: RepositoryRef;
  base: GitRefSummary | undefined;
  treeSha: string | undefined;
  entries: GitHubBaseInventoryEntry[];
  partial: boolean;
  limitations: PartialDataNotice[];
}

interface GitHubRefResponse {
  object: {
    sha: string;
  };
}

interface GitHubCommitResponse {
  tree: {
    sha: string;
  };
}

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
}

interface GitHubTreeResponse {
  sha: string;
  truncated: boolean;
  tree: GitHubTreeItem[];
}

function compareCodePoints(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function requiredIdentifier(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${name} must not be empty.`);
  }
  return normalized;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('GitHub base inventory collection was cancelled.', 'AbortError');
  }
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function partialResult(
  repository: RepositoryRef,
  source: PartialDataNotice['source'],
  message: string,
  base: GitRefSummary | undefined,
  treeSha: string | undefined
): GitHubBaseInventoryResult {
  return {
    repository,
    base,
    treeSha,
    entries: [],
    partial: true,
    limitations: [
      {
        source,
        message,
        confidenceImpact: 'low',
      },
    ],
  };
}

function validateRefResponse(response: GitHubRefResponse): string {
  if (!response?.object || typeof response.object.sha !== 'string' || !response.object.sha) {
    throw new Error('GitHub ref response did not include a commit SHA.');
  }
  return response.object.sha;
}

function validateCommitResponse(response: GitHubCommitResponse): string {
  if (!response?.tree || typeof response.tree.sha !== 'string' || !response.tree.sha) {
    throw new Error('GitHub commit response did not include a tree SHA.');
  }
  return response.tree.sha;
}

function validGitHubPath(path: string): boolean {
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/')) {
    return false;
  }
  return path
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function normalizeTree(
  response: GitHubTreeResponse,
  expectedTreeSha: string
): {
  entries: GitHubBaseInventoryEntry[];
  incomplete: boolean;
} {
  if (!response || !Array.isArray(response.tree)) {
    throw new Error('GitHub tree response did not include tree entries.');
  }

  let incomplete =
    typeof response.sha !== 'string' ||
    response.sha !== expectedTreeSha ||
    typeof response.truncated !== 'boolean';
  const entries: GitHubBaseInventoryEntry[] = [];
  const paths = new Set<string>();
  for (const item of response.tree) {
    if (!item || !['blob', 'tree', 'commit'].includes(item.type)) {
      incomplete = true;
      continue;
    }
    if (item.type !== 'blob') {
      continue;
    }
    if (
      typeof item.path !== 'string' ||
      !validGitHubPath(item.path) ||
      typeof item.sha !== 'string' ||
      !item.sha ||
      typeof item.mode !== 'string' ||
      !item.mode
    ) {
      incomplete = true;
      continue;
    }
    if (paths.has(item.path)) {
      incomplete = true;
      continue;
    }
    paths.add(item.path);

    const validSize =
      typeof item.size === 'number' && Number.isSafeInteger(item.size) && item.size >= 0;
    if (item.size !== undefined && !validSize) {
      incomplete = true;
    }
    entries.push({
      path: item.path,
      sizeBytes: validSize ? item.size : undefined,
      blobSha: item.sha,
      mode: item.mode,
    });
  }

  entries.sort((left, right) => compareCodePoints(left.path, right.path));
  return { entries, incomplete };
}

export async function buildGitHubBaseInventory(
  request: GitHubBaseInventoryRequest
): Promise<GitHubBaseInventoryResult> {
  const owner = requiredIdentifier('owner', request.owner);
  const repositoryName = requiredIdentifier('repository', request.repository);
  const baseRef = requiredIdentifier('baseRef', request.baseRef);
  const repository: RepositoryRef = {
    owner,
    name: repositoryName,
  };
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepository = encodeURIComponent(repositoryName);
  const encodedBaseRef = encodeURIComponent(baseRef);
  const repositoryEndpoint = `/repos/${encodedOwner}/${encodedRepository}`;
  let resolvedBase: GitRefSummary | undefined;
  let resolvedTreeSha: string | undefined;

  try {
    throwIfAborted(request.signal);
    const refResponse = await request.readGitHub<GitHubRefResponse>(
      `${repositoryEndpoint}/git/ref/heads/${encodedBaseRef}`,
      request.signal
    );
    const commitSha = validateRefResponse(refResponse);
    resolvedBase = {
      ref: baseRef,
      sha: commitSha,
    };

    throwIfAborted(request.signal);
    const commitResponse = await request.readGitHub<GitHubCommitResponse>(
      `${repositoryEndpoint}/git/commits/${encodeURIComponent(commitSha)}`,
      request.signal
    );
    const treeSha = validateCommitResponse(commitResponse);
    resolvedTreeSha = treeSha;

    throwIfAborted(request.signal);
    const treeResponse = await request.readGitHub<GitHubTreeResponse>(
      `${repositoryEndpoint}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
      request.signal
    );
    throwIfAborted(request.signal);

    const { entries, incomplete } = normalizeTree(treeResponse, treeSha);
    const limitations: PartialDataNotice[] = [];
    if (treeResponse.truncated) {
      limitations.push({
        source: 'github_base',
        confidenceImpact: 'low',
        message: 'GitHub returned a truncated base tree; inventory is partial.',
      });
    }
    if (incomplete) {
      limitations.push({
        source: 'github_base',
        confidenceImpact: 'low',
        message: 'GitHub base tree metadata was incomplete or inconsistent.',
      });
    }

    return {
      repository,
      base: resolvedBase,
      treeSha,
      entries,
      partial: limitations.length > 0,
      limitations,
    };
  } catch (error) {
    if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }

    const status = errorStatus(error);
    const message = errorMessage(error).toLowerCase();
    if (status === 429 || (status === 403 && message.includes('rate limit'))) {
      return partialResult(
        repository,
        'rate_limit',
        `GitHub API rate limit prevented base inventory collection for ${owner}/${repositoryName}.`,
        resolvedBase,
        resolvedTreeSha
      );
    }
    if (status === 404) {
      return partialResult(
        repository,
        'github_base',
        `GitHub base data is unavailable for ${owner}/${repositoryName} at ${baseRef}.`,
        resolvedBase,
        resolvedTreeSha
      );
    }

    return partialResult(
      repository,
      'github_base',
      `GitHub base data could not be read for ${owner}/${repositoryName} at ${baseRef}.`,
      resolvedBase,
      resolvedTreeSha
    );
  }
}
