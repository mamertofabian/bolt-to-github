export type GitHubTreeFixtureName = 'complete' | 'missing' | 'rate-limited' | 'truncated';

export interface GitHubTreeFixture {
  name: GitHubTreeFixtureName;
  owner: string;
  repository: string;
  baseRef: string;
  responses: Readonly<Record<string, unknown>>;
  error?: { status: number; message: string };
}

const OWNER = 'frost-labs';
const REPOSITORY = 'bolt-app';
const BASE_REF = 'release/v2';
const ENCODED_BASE_REF = 'release%2Fv2';
const REF_ENDPOINT = `/repos/${OWNER}/${REPOSITORY}/git/ref/heads/${ENCODED_BASE_REF}`;
const COMMIT_ENDPOINT = `/repos/${OWNER}/${REPOSITORY}/git/commits/commit-release-v2`;
const TREE_ENDPOINT = `/repos/${OWNER}/${REPOSITORY}/git/trees/tree-release-v2?recursive=1`;

function treeResponses(truncated: boolean): Readonly<Record<string, unknown>> {
  return {
    [REF_ENDPOINT]: {
      object: { sha: 'commit-release-v2' },
    },
    [COMMIT_ENDPOINT]: {
      tree: { sha: 'tree-release-v2' },
    },
    [TREE_ENDPOINT]: {
      sha: 'tree-release-v2',
      truncated,
      tree: [
        {
          path: 'src/main.ts',
          mode: '100644',
          type: 'blob',
          sha: 'blob-main',
          size: 42,
        },
        {
          path: 'src',
          mode: '040000',
          type: 'tree',
          sha: 'tree-src',
        },
        {
          path: 'README.md',
          mode: '100644',
          type: 'blob',
          sha: 'blob-readme',
          size: 17,
        },
        {
          path: '.github/workflows/ci.yml',
          mode: '100644',
          type: 'blob',
          sha: 'blob-ci',
          size: 128,
        },
        {
          path: 'vendor-module',
          mode: '160000',
          type: 'commit',
          sha: 'submodule-sha',
        },
      ],
    },
  };
}

export function createGitHubTreeFixture(name: string): GitHubTreeFixture {
  if (name === 'complete' || name === 'truncated') {
    return {
      name,
      owner: OWNER,
      repository: REPOSITORY,
      baseRef: BASE_REF,
      responses: treeResponses(name === 'truncated'),
    };
  }

  if (name === 'missing') {
    return {
      name,
      owner: OWNER,
      repository: REPOSITORY,
      baseRef: BASE_REF,
      responses: {},
      error: { status: 404, message: 'Not Found' },
    };
  }

  if (name === 'rate-limited') {
    return {
      name,
      owner: OWNER,
      repository: REPOSITORY,
      baseRef: BASE_REF,
      responses: {},
      error: { status: 403, message: 'API rate limit exceeded' },
    };
  }

  throw new Error(`Unknown GitHub tree fixture: ${name}`);
}
