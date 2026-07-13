import { describe, expect, it, vi } from 'vitest';
import {
  buildGitHubBaseInventory,
  createGitHubReadRequest,
  readGitHubBaseTextContent,
  type GitHubBaseContentRequest,
  type GitHubBaseContentResult,
  type GitHubBaseInventoryEntry,
  type GitHubBaseInventoryRequest,
  type GitHubBaseInventoryResult,
  type GitHubReadClient,
  type GitHubReadOptions,
  type GitHubReadRequest,
} from '../inventory/githubBaseInventory';
import { createGitHubTreeFixture, type GitHubTreeFixture } from '../test-fixtures/prs/github-base';

function requestFromFixture(fixture: GitHubTreeFixture): GitHubBaseInventoryRequest {
  const request: GitHubReadRequest = fixture.request;
  return {
    owner: fixture.owner,
    repo: fixture.repo,
    ref: fixture.ref,
    request,
  };
}

describe('Production Readiness Snapshot GitHub base inventory', () => {
  it('mock GitHub tree data normalizes into base inventory', async () => {
    const fixture = createGitHubTreeFixture('complete');
    const result: GitHubBaseInventoryResult = await buildGitHubBaseInventory(
      requestFromFixture(fixture)
    );
    const appEntry: GitHubBaseInventoryEntry = {
      path: 'src/App.ts',
      gitBlobSha: 'blob-app-sha',
      sizeBytes: 42,
      mode: '100644',
      analysisEligible: true,
      retainedAsMetadata: false,
    };

    expect(result).toEqual({
      repository: { owner: 'codefrost', name: 'prs-project' },
      base: {
        ref: 'feature/readiness',
        sha: 'base-commit-sha',
      },
      entries: [
        {
          path: 'pnpm-lock.yaml',
          gitBlobSha: 'blob-lock-sha',
          sizeBytes: 128,
          mode: '100644',
          analysisEligible: true,
          retainedAsMetadata: false,
        },
        appEntry,
      ],
      limitations: [],
    });
    expect(fixture.calls).toEqual([
      {
        method: 'GET',
        endpoint: '/repos/codefrost/prs-project/git/ref/heads/feature%2Freadiness',
      },
      {
        method: 'GET',
        endpoint: '/repos/codefrost/prs-project/git/commits/base-commit-sha',
      },
      {
        method: 'GET',
        endpoint: '/repos/codefrost/prs-project/git/trees/base-tree-sha?recursive=1',
      },
    ]);
    expect(fixture.calls.every(({ method }) => method === 'GET')).toBe(true);
    expect(fixture.calls.some(({ endpoint }) => endpoint.includes('/contents/'))).toBe(false);
  });

  it('missing GitHub data produces a partial snapshot limitation', async () => {
    const fixture = createGitHubTreeFixture('missing');

    await expect(buildGitHubBaseInventory(requestFromFixture(fixture))).resolves.toEqual({
      repository: { owner: 'codefrost', name: 'prs-project' },
      base: undefined,
      entries: [],
      limitations: [
        {
          source: 'github_base',
          message:
            'GitHub base data is unavailable for codefrost/prs-project at feature/readiness (404).',
          confidenceImpact: 'low',
        },
      ],
    });
    expect(fixture.calls).toHaveLength(1);

    const forbidden = createGitHubTreeFixture('forbidden');
    await expect(buildGitHubBaseInventory(requestFromFixture(forbidden))).resolves.toEqual({
      repository: { owner: 'codefrost', name: 'prs-project' },
      base: undefined,
      entries: [],
      limitations: [
        {
          source: 'github_base',
          message:
            'GitHub base data is unavailable for codefrost/prs-project at feature/readiness (403).',
          confidenceImpact: 'low',
        },
      ],
    });

    const forwardedSignals: Array<GitHubReadOptions['signal'] | null> = [];
    const rateLimitedClient: GitHubReadClient = {
      request: async (_method, _endpoint, _body, options) => {
        forwardedSignals.push(options?.signal);
        throw Object.assign(new Error('GitHub API Error (429): secondary rate limit'), {
          name: 'GitHubApiError',
          status: 429,
          originalMessage: 'secondary rate limit',
          githubErrorResponse: { message: 'secondary rate limit' },
        });
      },
    };
    const adaptedRequest = createGitHubReadRequest(rateLimitedClient);
    const controller = new AbortController();
    await expect(
      buildGitHubBaseInventory({
        owner: fixture.owner,
        repo: fixture.repo,
        ref: fixture.ref,
        request: adaptedRequest,
        signal: controller.signal,
      })
    ).resolves.toMatchObject({
      limitations: [{ source: 'rate_limit' }],
    });
    expect(forwardedSignals).toEqual([controller.signal]);

    for (const unknownName of ['missing-fixture', '__proto__', 'constructor']) {
      expect(() => createGitHubTreeFixture(unknownName)).toThrowError(
        `Unknown GitHub tree fixture: ${unknownName}`
      );
    }
  });

  it('rate limited GitHub data produces a partial snapshot limitation', async () => {
    const rateLimited = createGitHubTreeFixture('rate-limited');
    const rateLimitedResult = await buildGitHubBaseInventory(requestFromFixture(rateLimited));

    expect(rateLimitedResult.base).toEqual({
      ref: 'feature/readiness',
      sha: 'base-commit-sha',
    });
    expect(rateLimitedResult.entries).toEqual([]);
    expect(rateLimitedResult.limitations).toEqual([
      {
        source: 'rate_limit',
        message:
          'GitHub rate limiting prevented a complete base inventory for codefrost/prs-project.',
        confidenceImpact: 'low',
      },
    ]);

    const truncated = createGitHubTreeFixture('truncated');
    const truncatedResult = await buildGitHubBaseInventory(requestFromFixture(truncated));
    expect(truncatedResult.entries.map(({ path }) => path)).toEqual([
      'pnpm-lock.yaml',
      'src/App.ts',
    ]);
    expect(truncatedResult.limitations).toEqual([
      {
        source: 'github_base',
        message: 'GitHub returned a truncated base tree for codefrost/prs-project.',
        confidenceImpact: 'medium',
      },
      {
        source: 'github_base',
        message: 'Skipped invalid or duplicate GitHub tree path: ../unsafe.ts',
        confidenceImpact: 'medium',
      },
      {
        source: 'github_base',
        message: 'Skipped invalid or duplicate GitHub tree path: src/App.ts',
        confidenceImpact: 'medium',
      },
      {
        source: 'github_base',
        message: 'Skipped malformed GitHub blob entry: broken.ts',
        confidenceImpact: 'medium',
      },
      {
        source: 'github_base',
        message: 'Skipped malformed GitHub tree entry at index 7.',
        confidenceImpact: 'medium',
      },
      {
        source: 'github_base',
        message: 'Skipped malformed GitHub tree entry at index 8.',
        confidenceImpact: 'medium',
      },
      {
        source: 'github_base',
        message: 'Skipped malformed GitHub tree entry: missing-type.ts',
        confidenceImpact: 'medium',
      },
      {
        source: 'github_base',
        message: 'Skipped malformed GitHub tree entry: unknown-type.ts',
        confidenceImpact: 'medium',
      },
    ]);
  });

  it('base ref metadata is preserved', async () => {
    const fixture = createGitHubTreeFixture('complete');
    const result = await buildGitHubBaseInventory(requestFromFixture(fixture));

    expect(result.repository).toEqual({ owner: fixture.owner, name: fixture.repo });
    expect(result.base?.ref).toBe(fixture.ref);
    expect(result.base?.sha).toBe('base-commit-sha');

    const appEntry = result.entries.find(({ path }) => path === 'src/App.ts');
    expect(appEntry).toBeDefined();
    const contentRequest: GitHubBaseContentRequest = {
      owner: fixture.owner,
      repo: fixture.repo,
      entry: appEntry!,
      request: fixture.request,
    };
    const contentResult: GitHubBaseContentResult = await readGitHubBaseTextContent(contentRequest);
    expect(contentResult).toEqual({
      path: 'src/App.ts',
      textContent: 'export const app = true;\n',
      isBinary: false,
      limitation: undefined,
    });
    expect(fixture.calls.at(-1)).toEqual({
      method: 'GET',
      endpoint: '/repos/codefrost/prs-project/git/blobs/blob-app-sha',
    });

    const callsBeforeSizeLimit = fixture.calls.length;
    await expect(
      readGitHubBaseTextContent({
        ...contentRequest,
        maxBytes: 1,
      })
    ).resolves.toEqual({
      path: 'src/App.ts',
      textContent: undefined,
      isBinary: undefined,
      limitation: {
        source: 'large_file_diff',
        message: 'Skipped GitHub base text over 1 bytes: src/App.ts',
        confidenceImpact: 'medium',
      },
    });
    expect(fixture.calls).toHaveLength(callsBeforeSizeLimit);

    const metadataFreeEntry: GitHubBaseInventoryEntry = {
      ...appEntry!,
      sizeBytes: undefined,
    };
    for (const bytes of [new Uint8Array([0]), new Uint8Array([1]), new Uint8Array([255])]) {
      const content = btoa(String.fromCharCode(...bytes));
      await expect(
        readGitHubBaseTextContent({
          ...contentRequest,
          entry: metadataFreeEntry,
          request: async () => ({ encoding: 'base64', content }),
        })
      ).resolves.toEqual({
        path: 'src/App.ts',
        textContent: undefined,
        isBinary: true,
        limitation: undefined,
      });
    }

    const atobSpy = vi.spyOn(globalThis, 'atob');
    const atobCallsBeforeOversize = atobSpy.mock.calls.length;
    try {
      for (const size of [undefined, 1]) {
        await expect(
          readGitHubBaseTextContent({
            ...contentRequest,
            entry: metadataFreeEntry,
            maxBytes: 4,
            request: async () => ({
              encoding: 'base64',
              content: 'QUJDREVG',
              size,
            }),
          })
        ).resolves.toMatchObject({
          path: 'src/App.ts',
          limitation: {
            source: 'large_file_diff',
            message: 'Skipped GitHub base text over 4 bytes: src/App.ts',
          },
        });
      }
      expect(atobSpy).toHaveBeenCalledTimes(atobCallsBeforeOversize);
    } finally {
      atobSpy.mockRestore();
    }

    for (const status of [403, 429]) {
      await expect(
        readGitHubBaseTextContent({
          ...contentRequest,
          request: async () => {
            throw Object.assign(new Error(`GitHub API Error (${status}): rate limit exceeded`), {
              status,
              originalMessage: 'rate limit exceeded',
            });
          },
        })
      ).resolves.toMatchObject({
        path: 'src/App.ts',
        limitation: { source: 'rate_limit' },
      });
    }

    await expect(
      readGitHubBaseTextContent({
        ...contentRequest,
        entry: metadataFreeEntry,
        request: async () => ({ encoding: 'base64', content: 'not base64!' }),
      })
    ).resolves.toMatchObject({
      path: 'src/App.ts',
      limitation: { source: 'github_base' },
    });

    const contentAbortController = new AbortController();
    const pendingContent = readGitHubBaseTextContent({
      ...contentRequest,
      signal: contentAbortController.signal,
      request: async () => new Promise<never>(() => undefined),
    });
    await Promise.resolve();
    contentAbortController.abort();
    await expect(pendingContent).resolves.toMatchObject({
      path: 'src/App.ts',
      limitation: {
        source: 'github_base',
        message: 'GitHub base content read was cancelled for src/App.ts.',
      },
    });

    const controller = new AbortController();
    controller.abort();
    const abortedFixture = createGitHubTreeFixture('complete');
    await expect(
      buildGitHubBaseInventory({
        ...requestFromFixture(abortedFixture),
        signal: controller.signal,
      })
    ).resolves.toEqual({
      repository: { owner: 'codefrost', name: 'prs-project' },
      base: undefined,
      entries: [],
      limitations: [
        {
          source: 'github_base',
          message: 'GitHub base inventory scan was cancelled.',
          confidenceImpact: 'low',
        },
      ],
    });
    expect(abortedFixture.calls).toEqual([]);

    const inFlightController = new AbortController();
    let requestStarted = false;
    const pending = buildGitHubBaseInventory({
      owner: fixture.owner,
      repo: fixture.repo,
      ref: fixture.ref,
      signal: inFlightController.signal,
      request: async (_method, _endpoint, options) => {
        expect(options?.signal).toBe(inFlightController.signal);
        requestStarted = true;
        return new Promise<never>(() => undefined);
      },
    });
    await Promise.resolve();
    expect(requestStarted).toBe(true);
    inFlightController.abort();
    await expect(pending).resolves.toEqual({
      repository: { owner: 'codefrost', name: 'prs-project' },
      base: undefined,
      entries: [],
      limitations: [
        {
          source: 'github_base',
          message: 'GitHub base inventory scan was cancelled.',
          confidenceImpact: 'low',
        },
      ],
    });
  });
});
