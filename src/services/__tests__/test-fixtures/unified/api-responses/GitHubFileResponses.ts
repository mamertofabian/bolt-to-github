/**
 * GitHub File and Tree API Response Fixtures
 *
 * Realistic file content and tree data for testing GitHub file operations
 */

export const GitHubFileResponses = {
  /**
   * README.md file content
   */
  readmeMarkdown: {
    type: 'file',
    encoding: 'base64',
    size: 1024,
    name: 'README.md',
    path: 'README.md',
    content: btoa(
      '# Test Repository\n\nThis is a test repository for development.\n\n## Features\n\n- Feature 1\n- Feature 2\n'
    ),
    sha: 'readme-blob-sha',
    url: 'https://api.github.com/repos/testuser/test-repo/contents/README.md',
    git_url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/readme-blob-sha',
    html_url: 'https://github.com/testuser/test-repo/blob/main/README.md',
    download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/README.md',
  },

  /**
   * package.json file content
   */
  packageJson: {
    type: 'file',
    encoding: 'base64',
    size: 512,
    name: 'package.json',
    path: 'package.json',
    content: btoa(
      '{\n  "name": "test-repo",\n  "version": "1.0.0",\n  "description": "Test repository",\n  "main": "index.js"\n}'
    ),
    sha: 'package-blob-sha',
    url: 'https://api.github.com/repos/testuser/test-repo/contents/package.json',
    git_url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/package-blob-sha',
    html_url: 'https://github.com/testuser/test-repo/blob/main/package.json',
    download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/package.json',
  },

  /**
   * File push/create response
   */
  created: {
    content: {
      name: 'new-file.txt',
      path: 'new-file.txt',
      sha: 'new-file-sha',
      size: 256,
      url: 'https://api.github.com/repos/testuser/test-repo/contents/new-file.txt',
      html_url: 'https://github.com/testuser/test-repo/blob/main/new-file.txt',
      git_url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/new-file-sha',
      download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/new-file.txt',
      type: 'file',
    },
    commit: {
      sha: 'commit-sha-123',
      node_id: 'MDY6Q29tbWl0MTIzNDU2Nzg5OmNvbW1pdC1zaGEtMTIz',
      url: 'https://api.github.com/repos/testuser/test-repo/git/commits/commit-sha-123',
      html_url: 'https://github.com/testuser/test-repo/commit/commit-sha-123',
      author: {
        name: 'Test User',
        email: 'test@example.com',
        date: new Date().toISOString(),
      },
      committer: {
        name: 'Test User',
        email: 'test@example.com',
        date: new Date().toISOString(),
      },
      tree: {
        sha: 'tree-sha-456',
        url: 'https://api.github.com/repos/testuser/test-repo/git/trees/tree-sha-456',
      },
      message: 'Add new file',
      parents: [
        {
          sha: 'parent-sha-789',
          url: 'https://api.github.com/repos/testuser/test-repo/git/commits/parent-sha-789',
          html_url: 'https://github.com/testuser/test-repo/commit/parent-sha-789',
        },
      ],
      verification: {
        verified: false,
        reason: 'unsigned',
        signature: null,
        payload: null,
      },
    },
  },
} as const;

export const GitHubTreeResponses = {
  /**
   * Repository tree with files and directories
   */
  withFiles: {
    sha: 'main-tree-sha',
    url: 'https://api.github.com/repos/testuser/test-repo/git/trees/main-tree-sha',
    tree: [
      {
        path: 'README.md',
        mode: '100644',
        type: 'blob',
        sha: 'readme-blob-sha',
        size: 1024,
        url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/readme-blob-sha',
      },
      {
        path: 'src',
        mode: '040000',
        type: 'tree',
        sha: 'src-tree-sha',
        url: 'https://api.github.com/repos/testuser/test-repo/git/trees/src-tree-sha',
      },
      {
        path: 'src/index.ts',
        mode: '100644',
        type: 'blob',
        sha: 'index-blob-sha',
        size: 2048,
        url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/index-blob-sha',
      },
      {
        path: 'src/utils.ts',
        mode: '100644',
        type: 'blob',
        sha: 'utils-blob-sha',
        size: 1536,
        url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/utils-blob-sha',
      },
      {
        path: 'package.json',
        mode: '100644',
        type: 'blob',
        sha: 'package-blob-sha',
        size: 512,
        url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/package-blob-sha',
      },
    ],
    truncated: false,
  },

  /**
   * Empty tree (new repository)
   */
  empty: {
    sha: 'empty-tree-sha',
    url: 'https://api.github.com/repos/testuser/test-repo/git/trees/empty-tree-sha',
    tree: [],
    truncated: false,
  },
} as const;

/**
 * Factory function to create custom file content response
 */
export function createFileContentResponse(
  path: string,
  content: string,
  encoding: 'base64' | 'utf-8' = 'base64'
) {
  return {
    type: 'file',
    encoding,
    size: content.length,
    name: path.split('/').pop() || path,
    path,
    content: encoding === 'base64' ? btoa(content) : content,
    sha: `${path}-sha`,
    url: `https://api.github.com/repos/testuser/test-repo/contents/${path}`,
    html_url: `https://github.com/testuser/test-repo/blob/main/${path}`,
  };
}
