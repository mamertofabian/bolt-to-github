import type { GitRefSummary, PartialDataNotice, RepositoryRef } from '../domain';
import { findPrsIgnoreRule } from '../rules/ignore-rules';

const DEFAULT_MAX_BASE_CONTENT_BYTES = 1024 * 1024;

export interface GitHubReadOptions {
  signal?: AbortSignal;
}

export interface GitHubReadClient {
  request<T = unknown>(
    method: string,
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T>;
}

export type GitHubReadRequest = (
  method: 'GET',
  endpoint: string,
  options?: GitHubReadOptions
) => Promise<unknown>;

export function createGitHubReadRequest(client: GitHubReadClient): GitHubReadRequest {
  return (method, endpoint, options) =>
    client.request(method, endpoint, undefined, { signal: options?.signal });
}

export interface GitHubBaseInventoryRequest {
  owner: string;
  repo: string;
  ref: string;
  request: GitHubReadRequest;
  signal?: AbortSignal;
}

export interface GitHubBaseInventoryEntry {
  path: string;
  gitBlobSha: string;
  sizeBytes?: number;
  mode: string;
  analysisEligible: boolean;
  retainedAsMetadata: boolean;
}

export interface GitHubBaseInventoryResult {
  repository: RepositoryRef;
  base?: GitRefSummary;
  entries: GitHubBaseInventoryEntry[];
  limitations: PartialDataNotice[];
}

export interface GitHubBaseContentRequest {
  owner: string;
  repo: string;
  entry: GitHubBaseInventoryEntry;
  request: GitHubReadRequest;
  signal?: AbortSignal;
  maxBytes?: number;
}

export interface GitHubBaseContentResult {
  path: string;
  textContent?: string;
  isBinary?: boolean;
  limitation?: PartialDataNotice;
}

interface GitHubTreeItem {
  path?: unknown;
  mode?: unknown;
  type?: unknown;
  sha?: unknown;
  size?: unknown;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${name} is required`);
  }
  return normalized;
}

function normalizeTreePath(path: string): string | undefined {
  const slashNormalized = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (slashNormalized.startsWith('/') || /^[A-Za-z]:/.test(slashNormalized)) {
    return undefined;
  }

  const segments = slashNormalized.split('/');
  if (segments.some((segment) => segment === '..')) {
    return undefined;
  }

  const normalized = segments.filter((segment) => segment !== '' && segment !== '.').join('/');
  return normalized || undefined;
}

function getNestedString(value: unknown, first: string, second: string): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const firstValue = Reflect.get(value, first);
  if (!firstValue || typeof firstValue !== 'object') {
    return undefined;
  }
  const result = Reflect.get(firstValue, second);
  return typeof result === 'string' && result ? result : undefined;
}

function getStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const status = Reflect.get(error, 'status');
  if (typeof status === 'number') {
    return status;
  }

  const response = Reflect.get(error, 'response');
  if (response && typeof response === 'object') {
    const responseStatus = Reflect.get(response, 'status');
    return typeof responseStatus === 'number' ? responseStatus : undefined;
  }

  return undefined;
}

function collectErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
  }
  for (const field of ['originalMessage', 'message'] as const) {
    const value = Reflect.get(error, field);
    if (typeof value === 'string') {
      parts.push(value);
    }
  }
  for (const field of ['githubErrorResponse', 'response'] as const) {
    const nested = Reflect.get(error, field);
    if (nested && typeof nested === 'object') {
      const message = Reflect.get(nested, 'message');
      if (typeof message === 'string') {
        parts.push(message);
      }
    }
  }
  return parts.join(' ');
}

function isRateLimited(error: unknown): boolean {
  const status = getStatus(error);
  if (status === 429) {
    return true;
  }

  return status === 403 && /rate limit|secondary rate/i.test(collectErrorText(error));
}

function cancelledResult(repository: RepositoryRef): GitHubBaseInventoryResult {
  return {
    repository,
    base: undefined,
    entries: [],
    limitations: [
      {
        source: 'github_base',
        message: 'GitHub base inventory scan was cancelled.',
        confidenceImpact: 'low',
      },
    ],
  };
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('GitHub base inventory scan was cancelled.', 'AbortError');
  }
}

function requestWithAbort(
  request: GitHubReadRequest,
  endpoint: string,
  signal: AbortSignal | undefined
): Promise<unknown> {
  assertNotAborted(signal);
  const operation = Promise.resolve().then(() => request('GET', endpoint, { signal }));
  if (!signal) {
    return operation;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () =>
      finish(() =>
        reject(new DOMException('GitHub base inventory scan was cancelled.', 'AbortError'))
      );

    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    );
    if (signal.aborted) {
      onAbort();
    }
  });
}

function unavailableNotice(
  error: unknown,
  owner: string,
  repo: string,
  ref: string
): PartialDataNotice {
  if (isRateLimited(error)) {
    return {
      source: 'rate_limit',
      message: `GitHub rate limiting prevented a complete base inventory for ${owner}/${repo}.`,
      confidenceImpact: 'low',
    };
  }

  const status = getStatus(error);
  return {
    source: 'github_base',
    message: `GitHub base data is unavailable for ${owner}/${repo} at ${ref}${
      status === undefined ? '' : ` (${status})`
    }.`,
    confidenceImpact: 'low',
  };
}

export async function buildGitHubBaseInventory(
  request: GitHubBaseInventoryRequest
): Promise<GitHubBaseInventoryResult> {
  const owner = requireNonEmpty(request.owner, 'owner');
  const repo = requireNonEmpty(request.repo, 'repo');
  const ref = requireNonEmpty(request.ref, 'ref');
  const repository: RepositoryRef = { owner, name: repo };
  let base: GitRefSummary | undefined;

  try {
    assertNotAborted(request.signal);
    const refResponse = await requestWithAbort(
      request.request,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(ref)}`,
      request.signal
    );
    assertNotAborted(request.signal);
    const commitSha = getNestedString(refResponse, 'object', 'sha');
    if (!commitSha) {
      throw new Error('GitHub ref response did not include a commit SHA');
    }
    base = {
      ref,
      sha: commitSha,
    };

    const commitResponse = await requestWithAbort(
      request.request,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(commitSha)}`,
      request.signal
    );
    assertNotAborted(request.signal);
    const treeSha = getNestedString(commitResponse, 'tree', 'sha');
    if (!treeSha) {
      throw new Error('GitHub commit response did not include a tree SHA');
    }

    const treeResponse = await requestWithAbort(
      request.request,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
      request.signal
    );
    assertNotAborted(request.signal);
    if (!treeResponse || typeof treeResponse !== 'object') {
      throw new Error('GitHub tree response was malformed');
    }
    const tree = Reflect.get(treeResponse, 'tree');
    if (!Array.isArray(tree)) {
      throw new Error('GitHub tree response did not include entries');
    }

    const limitations: PartialDataNotice[] = [];
    const entries: GitHubBaseInventoryEntry[] = [];
    const seenPaths = new Set<string>();

    for (const [index, unknownItem] of tree.entries()) {
      if (!unknownItem || typeof unknownItem !== 'object') {
        limitations.push({
          source: 'github_base',
          message: `Skipped malformed GitHub tree entry at index ${index}.`,
          confidenceImpact: 'medium',
        });
        continue;
      }
      const rawItem = unknownItem as GitHubTreeItem;
      if (rawItem.type !== 'blob') {
        if (rawItem.type !== 'tree' && rawItem.type !== 'commit') {
          limitations.push({
            source: 'github_base',
            message: `Skipped malformed GitHub tree entry: ${
              typeof rawItem.path === 'string' ? rawItem.path : `index ${index}`
            }`,
            confidenceImpact: 'medium',
          });
        }
        continue;
      }

      if (
        typeof rawItem.path !== 'string' ||
        typeof rawItem.sha !== 'string' ||
        typeof rawItem.mode !== 'string'
      ) {
        limitations.push({
          source: 'github_base',
          message: `Skipped malformed GitHub blob entry: ${
            typeof rawItem.path === 'string' ? rawItem.path : 'unknown path'
          }`,
          confidenceImpact: 'medium',
        });
        continue;
      }

      const path = normalizeTreePath(rawItem.path);
      if (!path || seenPaths.has(path)) {
        limitations.push({
          source: 'github_base',
          message: `Skipped invalid or duplicate GitHub tree path: ${rawItem.path}`,
          confidenceImpact: 'medium',
        });
        continue;
      }
      seenPaths.add(path);

      const ignoreRule = findPrsIgnoreRule(path);
      if (ignoreRule && !ignoreRule.retainAsMetadata) {
        continue;
      }

      entries.push({
        path,
        gitBlobSha: rawItem.sha,
        sizeBytes: typeof rawItem.size === 'number' && rawItem.size >= 0 ? rawItem.size : undefined,
        mode: rawItem.mode,
        analysisEligible: ignoreRule === undefined,
        retainedAsMetadata: ignoreRule !== undefined,
      });
    }

    if (Reflect.get(treeResponse, 'truncated') === true) {
      limitations.push({
        source: 'github_base',
        message: `GitHub returned a truncated base tree for ${owner}/${repo}.`,
        confidenceImpact: 'medium',
      });
    }

    entries.sort((left, right) => compareStrings(left.path, right.path));
    limitations.sort((left, right) => compareStrings(left.message, right.message));
    return { repository, base, entries, limitations };
  } catch (error) {
    if (request.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return cancelledResult(repository);
    }

    return {
      repository,
      base,
      entries: [],
      limitations: [unavailableNotice(error, owner, repo, ref)],
    };
  }
}

function resolveMaxContentBytes(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_BASE_CONTENT_BYTES;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('maxBytes must be a positive integer');
  }
  return value;
}

function contentLimitation(
  path: string,
  message: string,
  source: PartialDataNotice['source'] = 'github_base'
): GitHubBaseContentResult {
  return {
    path,
    isBinary: undefined,
    textContent: undefined,
    limitation: {
      source,
      message,
      confidenceImpact: 'medium',
    },
  };
}

class BaseContentTooLargeError extends Error {}

function decodeBase64Bytes(content: string, maxBytes: number): Uint8Array {
  const maxEncodedCharacters = Math.ceil(maxBytes / 3) * 4;
  const maxPayloadCharacters = maxEncodedCharacters + Math.ceil(maxEncodedCharacters / 60) * 2 + 16;
  if (content.length > maxPayloadCharacters) {
    throw new BaseContentTooLargeError();
  }

  let encodedCharacters = 0;
  for (const character of content) {
    if (!/\s/.test(character)) {
      encodedCharacters += 1;
      if (encodedCharacters > maxEncodedCharacters) {
        throw new BaseContentTooLargeError();
      }
    }
  }

  const normalized = content.replace(/\s/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) {
    throw new TypeError('GitHub blob response contained invalid base64');
  }
  const paddingBytes = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const decodedBytes = (normalized.length / 4) * 3 - paddingBytes;
  if (decodedBytes > maxBytes) {
    throw new BaseContentTooLargeError();
  }

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function looksBinaryContent(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.byteLength, 8 * 1024));
  if (sample.includes(0)) {
    return true;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample, {
      stream: sample.byteLength < bytes.byteLength,
    });
  } catch {
    return true;
  }
  return sample.some(
    (byte) => byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13
  );
}

export async function readGitHubBaseTextContent(
  request: GitHubBaseContentRequest
): Promise<GitHubBaseContentResult> {
  const owner = requireNonEmpty(request.owner, 'owner');
  const repo = requireNonEmpty(request.repo, 'repo');
  const gitBlobSha = requireNonEmpty(request.entry.gitBlobSha, 'entry.gitBlobSha');
  const maxBytes = resolveMaxContentBytes(request.maxBytes);

  if (request.entry.sizeBytes !== undefined && request.entry.sizeBytes > maxBytes) {
    return contentLimitation(
      request.entry.path,
      `Skipped GitHub base text over ${maxBytes} bytes: ${request.entry.path}`,
      'large_file_diff'
    );
  }

  try {
    const response = await requestWithAbort(
      request.request,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(gitBlobSha)}`,
      request.signal
    );
    assertNotAborted(request.signal);
    if (!response || typeof response !== 'object') {
      throw new TypeError('GitHub blob response was malformed');
    }
    const encoding = Reflect.get(response, 'encoding');
    const content = Reflect.get(response, 'content');
    const declaredSize = Reflect.get(response, 'size');
    if (encoding !== 'base64' || typeof content !== 'string') {
      throw new TypeError('GitHub blob response did not include base64 content');
    }
    if (typeof declaredSize === 'number' && declaredSize > maxBytes) {
      return contentLimitation(
        request.entry.path,
        `Skipped GitHub base text over ${maxBytes} bytes: ${request.entry.path}`,
        'large_file_diff'
      );
    }

    const bytes = decodeBase64Bytes(content, maxBytes);

    try {
      if (looksBinaryContent(bytes)) {
        return {
          path: request.entry.path,
          textContent: undefined,
          isBinary: true,
          limitation: undefined,
        };
      }
      return {
        path: request.entry.path,
        textContent: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        isBinary: false,
        limitation: undefined,
      };
    } catch {
      return {
        path: request.entry.path,
        textContent: undefined,
        isBinary: true,
        limitation: undefined,
      };
    }
  } catch (error) {
    if (request.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return contentLimitation(
        request.entry.path,
        `GitHub base content read was cancelled for ${request.entry.path}.`
      );
    }
    if (error instanceof BaseContentTooLargeError) {
      return contentLimitation(
        request.entry.path,
        `Skipped GitHub base text over ${maxBytes} bytes: ${request.entry.path}`,
        'large_file_diff'
      );
    }
    if (isRateLimited(error)) {
      return contentLimitation(
        request.entry.path,
        `GitHub rate limiting prevented base content for ${request.entry.path}.`,
        'rate_limit'
      );
    }
    const status = getStatus(error);
    return contentLimitation(
      request.entry.path,
      `GitHub base content is unavailable for ${request.entry.path}${
        status === undefined ? '' : ` (${status})`
      }.`
    );
  }
}
