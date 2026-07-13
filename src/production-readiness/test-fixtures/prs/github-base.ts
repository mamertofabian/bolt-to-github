import type { GitHubReadRequest } from '../../inventory/githubBaseInventory';

export interface GitHubTreeFixture {
  owner: string;
  repo: string;
  ref: string;
  request: GitHubReadRequest;
  calls: Array<{ method: 'GET'; endpoint: string }>;
}

class FixtureGitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly originalMessage: string = message,
    readonly githubErrorResponse: unknown = { message: originalMessage }
  ) {
    super(`GitHub API Error (${status}): ${message}`);
    this.name = 'GitHubApiError';
  }
}

const OWNER = 'codefrost';
const REPO = 'prs-project';
const REF = 'feature/readiness';
const REF_ENDPOINT = '/repos/codefrost/prs-project/git/ref/heads/feature%2Freadiness';
const COMMIT_ENDPOINT = '/repos/codefrost/prs-project/git/commits/base-commit-sha';
const TREE_ENDPOINT = '/repos/codefrost/prs-project/git/trees/base-tree-sha?recursive=1';
const APP_BLOB_ENDPOINT = '/repos/codefrost/prs-project/git/blobs/blob-app-sha';

function treeResponse(truncated: boolean) {
  const tree: unknown[] = [
    {
      path: 'src/App.ts',
      mode: '100644',
      type: 'blob',
      sha: 'blob-app-sha',
      size: 42,
    },
    {
      path: 'pnpm-lock.yaml',
      mode: '100644',
      type: 'blob',
      sha: 'blob-lock-sha',
      size: 128,
    },
    {
      path: 'node_modules/pkg/index.js',
      mode: '100644',
      type: 'blob',
      sha: 'blob-vendor-sha',
      size: 256,
    },
    {
      path: 'src',
      mode: '040000',
      type: 'tree',
      sha: 'tree-src-sha',
    },
  ];

  if (truncated) {
    tree.push(
      {
        path: '../unsafe.ts',
        mode: '100644',
        type: 'blob',
        sha: 'blob-unsafe-sha',
      },
      {
        path: 'src/App.ts',
        mode: '100644',
        type: 'blob',
        sha: 'blob-duplicate-sha',
      },
      {
        path: 'broken.ts',
        type: 'blob',
        sha: 'blob-broken-sha',
      },
      null,
      42,
      {
        path: 'missing-type.ts',
        mode: '100644',
        sha: 'missing-type-sha',
      },
      {
        path: 'unknown-type.ts',
        mode: '100644',
        type: 'mystery',
        sha: 'unknown-type-sha',
      },
      {
        path: 'vendor/submodule',
        mode: '160000',
        type: 'commit',
        sha: 'submodule-sha',
      }
    );
  }

  return {
    sha: 'base-tree-sha',
    truncated,
    tree,
  };
}

export function createGitHubTreeFixture(name: string): GitHubTreeFixture {
  if (!['complete', 'missing', 'forbidden', 'rate-limited', 'truncated'].includes(name)) {
    throw new Error(`Unknown GitHub tree fixture: ${name}`);
  }

  const calls: GitHubTreeFixture['calls'] = [];
  const request: GitHubReadRequest = async (method, endpoint) => {
    calls.push({ method, endpoint });

    if (name === 'missing') {
      throw new FixtureGitHubError('Not Found', 404);
    }
    if (name === 'forbidden') {
      throw new FixtureGitHubError('Resource not accessible by integration', 403);
    }
    if (endpoint === REF_ENDPOINT) {
      return { object: { sha: 'base-commit-sha' } };
    }
    if (endpoint === COMMIT_ENDPOINT) {
      return { tree: { sha: 'base-tree-sha' } };
    }
    if (endpoint === TREE_ENDPOINT) {
      if (name === 'rate-limited') {
        throw new FixtureGitHubError('API rate limit exceeded', 403);
      }
      return treeResponse(name === 'truncated');
    }
    if (endpoint === APP_BLOB_ENDPOINT) {
      return {
        encoding: 'base64',
        content: 'ZXhwb3J0IGNvbnN0IGFwcCA9IHRydWU7Cg==',
        size: 25,
      };
    }

    throw new Error(`Unexpected GitHub fixture request: ${method} ${endpoint}`);
  };

  return {
    owner: OWNER,
    repo: REPO,
    ref: REF,
    request,
    calls,
  };
}
