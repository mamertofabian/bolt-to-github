import { describe, expect, it, vi } from 'vitest';

import {
  buildGitHubBaseInventory,
  type GitHubBaseInventoryEntry,
  type GitHubBaseInventoryRequest,
  type GitHubBaseInventoryResult,
  type GitHubMetadataReader,
} from '../inventory/githubBaseInventory';
import {
  createGitHubTreeFixture,
  type GitHubTreeFixture,
  type GitHubTreeFixtureName,
} from '../test-fixtures/prs/github-base';

function readerFor(fixture: GitHubTreeFixture): GitHubMetadataReader {
  const reader = vi.fn(async (endpoint: string): Promise<unknown> => {
    if (fixture.error) {
      throw Object.assign(new Error(fixture.error.message), {
        status: fixture.error.status,
      });
    }

    if (!(endpoint in fixture.responses)) {
      throw Object.assign(new Error(`Unexpected GitHub endpoint: ${endpoint}`), {
        status: 500,
      });
    }

    return fixture.responses[endpoint];
  });
  return reader as unknown as GitHubMetadataReader;
}

describe('Production Readiness Snapshot GitHub base inventory', () => {
  it('mock GitHub tree data normalizes into base inventory', async () => {
    const fixtureName: GitHubTreeFixtureName = 'complete';
    const fixture = createGitHubTreeFixture(fixtureName);
    const readGitHub = readerFor(fixture);
    const request: GitHubBaseInventoryRequest = {
      owner: fixture.owner,
      repository: fixture.repository,
      baseRef: fixture.baseRef,
      readGitHub,
    };
    const result: GitHubBaseInventoryResult = await buildGitHubBaseInventory(request);
    const expectedEntries: GitHubBaseInventoryEntry[] = [
      {
        path: '.github/workflows/ci.yml',
        sizeBytes: 128,
        blobSha: 'blob-ci',
        mode: '100644',
      },
      {
        path: 'README.md',
        sizeBytes: 17,
        blobSha: 'blob-readme',
        mode: '100644',
      },
      {
        path: 'src/main.ts',
        sizeBytes: 42,
        blobSha: 'blob-main',
        mode: '100644',
      },
    ];

    expect(result.partial).toBe(false);
    expect(result.limitations).toEqual([]);
    expect(result.treeSha).toBe('tree-release-v2');
    expect(result.entries).toEqual(expectedEntries);
    expect(readGitHub).toHaveBeenCalledTimes(3);
    expect(readGitHub).not.toHaveBeenCalledWith(
      expect.stringContaining('/contents/'),
      expect.anything()
    );
  });

  it('missing GitHub data produces a partial snapshot limitation', async () => {
    const missing = createGitHubTreeFixture('missing');
    const missingResult = await buildGitHubBaseInventory({
      owner: missing.owner,
      repository: missing.repository,
      baseRef: missing.baseRef,
      readGitHub: readerFor(missing),
    });

    expect(missingResult).toMatchObject({
      base: undefined,
      treeSha: undefined,
      entries: [],
      partial: true,
      limitations: [
        {
          source: 'github_base',
          confidenceImpact: 'low',
          message: 'GitHub base data is unavailable for frost-labs/bolt-app at release/v2.',
        },
      ],
    });

    const truncated = createGitHubTreeFixture('truncated');
    const truncatedResult = await buildGitHubBaseInventory({
      owner: truncated.owner,
      repository: truncated.repository,
      baseRef: truncated.baseRef,
      readGitHub: readerFor(truncated),
    });
    expect(truncatedResult.entries).toHaveLength(3);
    expect(truncatedResult.partial).toBe(true);
    expect(truncatedResult.limitations).toEqual([
      {
        source: 'github_base',
        confidenceImpact: 'low',
        message: 'GitHub returned a truncated base tree; inventory is partial.',
      },
    ]);

    const complete = createGitHubTreeFixture('complete');
    const treeEndpoint = Object.keys(complete.responses).find((endpoint) =>
      endpoint.includes('/git/trees/')
    );
    expect(treeEndpoint).toBeDefined();
    const treeResponse = complete.responses[treeEndpoint as string] as {
      tree: unknown[];
    };
    const malformed = {
      ...complete,
      responses: {
        ...complete.responses,
        [treeEndpoint as string]: {
          ...treeResponse,
          sha: 'unexpected-tree',
          tree: [
            ...treeResponse.tree,
            {
              path: '../unsafe.txt',
              mode: '100644',
              type: 'blob',
              sha: 'unsafe-blob',
              size: 10,
            },
            {
              path: 'unknown-entry',
              mode: '100644',
              type: 'mystery',
              sha: 'unknown-sha',
            },
          ],
        },
      },
    } satisfies GitHubTreeFixture;
    const malformedResult = await buildGitHubBaseInventory({
      owner: malformed.owner,
      repository: malformed.repository,
      baseRef: malformed.baseRef,
      readGitHub: readerFor(malformed),
    });
    expect(malformedResult.partial).toBe(true);
    expect(malformedResult.treeSha).toBe('tree-release-v2');
    expect(malformedResult.entries.some((entry) => entry.path === '../unsafe.txt')).toBe(false);
    expect(malformedResult.limitations).toContainEqual({
      source: 'github_base',
      confidenceImpact: 'low',
      message: 'GitHub base tree metadata was incomplete or inconsistent.',
    });
  });

  it('rate limited GitHub data produces a partial snapshot limitation', async () => {
    const fixture = createGitHubTreeFixture('rate-limited');

    const result = await buildGitHubBaseInventory({
      owner: fixture.owner,
      repository: fixture.repository,
      baseRef: fixture.baseRef,
      readGitHub: readerFor(fixture),
    });

    expect(result.entries).toEqual([]);
    expect(result.partial).toBe(true);
    expect(result.limitations).toEqual([
      {
        source: 'rate_limit',
        confidenceImpact: 'low',
        message:
          'GitHub API rate limit prevented base inventory collection for frost-labs/bolt-app.',
      },
    ]);

    const complete = createGitHubTreeFixture('complete');
    const successfulReader = readerFor(complete);
    const stagedRateLimit = vi.fn(async (endpoint: string): Promise<unknown> => {
      if (endpoint.includes('/git/trees/')) {
        throw Object.assign(new Error('secondary rate limit'), { status: 403 });
      }
      return successfulReader(endpoint);
    }) as unknown as GitHubMetadataReader;
    const stagedResult = await buildGitHubBaseInventory({
      owner: complete.owner,
      repository: complete.repository,
      baseRef: complete.baseRef,
      readGitHub: stagedRateLimit,
    });
    expect(stagedResult).toMatchObject({
      base: {
        ref: 'release/v2',
        sha: 'commit-release-v2',
      },
      treeSha: 'tree-release-v2',
      entries: [],
      partial: true,
    });
  });

  it('base ref metadata is preserved', async () => {
    const fixture = createGitHubTreeFixture('complete');
    const readGitHub = readerFor(fixture);

    const result = await buildGitHubBaseInventory({
      owner: fixture.owner,
      repository: fixture.repository,
      baseRef: fixture.baseRef,
      readGitHub,
    });

    expect(result.repository).toEqual({
      owner: 'frost-labs',
      name: 'bolt-app',
    });
    expect(result.base).toEqual({
      ref: 'release/v2',
      sha: 'commit-release-v2',
    });
    expect(readGitHub).toHaveBeenNthCalledWith(
      1,
      '/repos/frost-labs/bolt-app/git/ref/heads/release%2Fv2',
      undefined
    );

    const controller = new AbortController();
    controller.abort();
    await expect(
      buildGitHubBaseInventory({
        owner: fixture.owner,
        repository: fixture.repository,
        baseRef: fixture.baseRef,
        readGitHub,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
