import type { ProcessingStatus, UploadStatusState, ProjectSettings, PushRecord } from '$lib/types';

/**
 * Comprehensive test fixtures for ZipHandler testing
 * Provides realistic test data covering normal, edge, and error cases
 */

// Test data for ZIP file contents
export const ZIP_FILE_FIXTURES = {
  // Normal cases
  simpleProject: new Map<string, string>([
    [
      'project/index.html',
      '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello World</h1></body></html>',
    ],
    ['project/style.css', 'body { margin: 0; padding: 0; font-family: Arial, sans-serif; }'],
    ['project/script.js', 'console.log("Hello from Bolt!");'],
    ['project/README.md', '# Test Project\n\nThis is a test project created with Bolt.'],
  ]),

  typescriptProject: new Map<string, string>([
    [
      'project/src/index.ts',
      'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}',
    ],
    [
      'project/src/types.ts',
      'export interface User {\n  id: number;\n  name: string;\n  email: string;\n}',
    ],
    [
      'project/tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'es2020',
            module: 'commonjs',
            strict: true,
            esModuleInterop: true,
          },
        },
        null,
        2
      ),
    ],
    [
      'project/package.json',
      JSON.stringify(
        {
          name: 'test-project',
          version: '1.0.0',
          main: 'dist/index.js',
          scripts: { build: 'tsc' },
        },
        null,
        2
      ),
    ],
  ]),

  // Edge cases
  largeProject: (() => {
    const files = new Map<string, string>();
    // Create 100 files to test batch processing
    for (let i = 0; i < 100; i++) {
      files.set(
        `project/src/component${i}.js`,
        `export const Component${i} = () => { return 'Component ${i}'; };`
      );
    }
    files.set('project/index.js', 'console.log("Large project");');
    return files;
  })(),

  projectWithGitignore: new Map<string, string>([
    ['project/.gitignore', 'node_modules/\n*.log\n.env\ndist/\n.DS_Store'],
    ['project/src/index.js', 'console.log("Main file");'],
    ['project/node_modules/package/index.js', 'console.log("Should be ignored");'],
    ['project/.env', 'SECRET_KEY=secret123'],
    ['project/dist/bundle.js', 'console.log("Built file");'],
    ['project/.DS_Store', 'Mac system file'],
  ]),

  emptyProject: new Map<string, string>([]),

  projectWithBinaryFiles: new Map<string, string>([
    ['project/image.png', '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR...'],
    ['project/data.bin', '\x00\x01\x02\x03\x04\x05\x06\x07'],
    ['project/index.html', '<html><body>Binary test</body></html>'],
  ]),

  projectWithSpecialChars: new Map<string, string>([
    ['project/файл.txt', 'Содержимое на русском'],
    ['project/文件.md', '# 中文标题\n\n中文内容'],
    ['project/special-chars!@#$.js', 'console.log("Special chars in filename");'],
    ['project/path/with spaces/file.txt', 'File in path with spaces'],
  ]),

  projectWithDeeplyNested: new Map<string, string>([
    ['project/a/b/c/d/e/f/g/h/i/j/k/file.txt', 'Deeply nested file'],
    [
      'project/src/components/ui/buttons/primary/PrimaryButton.tsx',
      'export const PrimaryButton = () => <button>Click</button>;',
    ],
  ]),
};

// Test blob creation helper
export function createTestBlob(files: Map<string, string>, options?: { corrupt?: boolean }): Blob {
  if (options?.corrupt) {
    // Return a corrupted blob that will fail to unzip
    const blob = new Blob([new Uint8Array([0xff, 0xff, 0xff, 0xff])], { type: 'application/zip' });
    // Add our content for the mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (blob as any)._content = 'corrupted';
    return blob;
  }

  // For testing, we'll create a simple mock blob
  // In real tests, you'd use a proper ZIP library to create actual ZIP data
  const content = JSON.stringify(Array.from(files.entries()));
  const blob = new Blob([content], { type: 'text/plain' });
  // Add our content for the mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (blob as any)._content = content;
  return blob;
}

// GitHub API response fixtures
export const GITHUB_API_RESPONSES = {
  repository: {
    name: 'test-repo',
    owner: { login: 'test-owner' },
    default_branch: 'main',
    private: false,
    created_at: '2024-01-01T00:00:00Z',
  },

  branch: {
    name: 'main',
    commit: {
      sha: 'abc123def456',
      url: 'https://api.github.com/repos/test-owner/test-repo/commits/abc123def456',
    },
  },

  commit: {
    sha: 'abc123def456',
    tree: {
      sha: 'tree123',
      url: 'https://api.github.com/repos/test-owner/test-repo/git/trees/tree123',
    },
    parents: [{ sha: 'parent123' }],
    message: 'Initial commit',
  },

  tree: {
    sha: 'tree123',
    tree: [
      { path: 'README.md', mode: '100644', type: 'blob', sha: 'readme123' },
      { path: 'index.js', mode: '100644', type: 'blob', sha: 'index123' },
    ],
  },

  blob: {
    sha: 'blob123',
    size: 100,
    content: 'SGVsbG8gV29ybGQ=', // Base64 encoded "Hello World"
    encoding: 'base64',
  },

  rateLimit: {
    resources: {
      core: {
        limit: 5000,
        remaining: 4999,
        reset: Math.floor(Date.now() / 1000) + 3600,
      },
    },
  },

  rateLimitExceeded: {
    resources: {
      core: {
        limit: 5000,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + 300, // Reset in 5 minutes
      },
    },
  },

  error404: {
    message: 'Not Found',
    documentation_url: 'https://docs.github.com/rest',
  },

  error403: {
    message: 'API rate limit exceeded',
    documentation_url:
      'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
  },
};

// Chrome storage fixtures
export const CHROME_STORAGE_FIXTURES = {
  validSettings: {
    repoOwner: 'test-owner',
    projectSettings: {
      'project-123': { repoName: 'test-repo', branch: 'main' },
      'project-456': { repoName: 'another-repo', branch: 'develop' },
    } as ProjectSettings,
  },

  emptySettings: {
    repoOwner: '',
    projectSettings: {} as ProjectSettings,
  },

  missingProjectSettings: {
    repoOwner: 'test-owner',
    projectSettings: undefined,
  },
};

// Status update fixtures
export const STATUS_UPDATE_FIXTURES: UploadStatusState[] = [
  { status: 'idle' as ProcessingStatus, progress: 0, message: '' },
  { status: 'uploading' as ProcessingStatus, progress: 0, message: 'Processing ZIP file...' },
  { status: 'uploading' as ProcessingStatus, progress: 10, message: 'Preparing files...' },
  {
    status: 'uploading' as ProcessingStatus,
    progress: 30,
    message: 'Analyzing repository changes...',
  },
  { status: 'uploading' as ProcessingStatus, progress: 40, message: 'Creating file blobs...' },
  { status: 'uploading' as ProcessingStatus, progress: 70, message: 'Creating tree...' },
  { status: 'uploading' as ProcessingStatus, progress: 80, message: 'Creating commit...' },
  { status: 'uploading' as ProcessingStatus, progress: 90, message: 'Updating branch...' },
  {
    status: 'success' as ProcessingStatus,
    progress: 100,
    message: 'Successfully uploaded files to GitHub',
  },
  { status: 'error' as ProcessingStatus, progress: 0, message: 'Failed to upload files' },
];

// Comparison service fixtures
export const COMPARISON_RESULTS = {
  noChanges: {
    changes: new Map(),
    repoData: {
      baseTreeSha: 'tree123',
      baseSha: 'abc123def456',
      existingFiles: new Map([
        ['index.js', 'index123'],
        ['README.md', 'readme123'],
      ]),
    },
  },

  withChanges: {
    changes: new Map([
      ['index.js', { status: 'modified' as const, content: 'console.log("Updated");' }],
      ['new-file.js', { status: 'added' as const, content: 'console.log("New file");' }],
    ]),
    repoData: {
      baseTreeSha: 'tree123',
      baseSha: 'abc123def456',
      existingFiles: new Map([
        ['index.js', 'index123'],
        ['README.md', 'readme123'],
      ]),
    },
  },

  allNew: {
    changes: new Map([
      ['index.js', { status: 'added' as const, content: 'console.log("All new");' }],
      ['style.css', { status: 'added' as const, content: 'body { margin: 0; }' }],
    ]),
    repoData: {
      baseTreeSha: 'empty-tree',
      baseSha: 'empty-sha',
      existingFiles: new Map(),
    },
  },
};

// Error scenarios
export const ERROR_SCENARIOS = {
  networkError: new Error('Network request failed'),
  authError: new Error('Bad credentials'),
  rateLimitError: (() => {
    const error = new Error('API rate limit exceeded') as Error & { status?: number };
    error.status = 403;
    return error;
  })(),
  repoNotFoundError: (() => {
    const error = new Error('Not Found') as Error & { status?: number };
    error.status = 404;
    return error;
  })(),
  largeBlobError: new Error('File too large. Maximum size is 50MB'),
  corruptZipError: new Error('Failed to process ZIP file: Invalid ZIP data'),
};

// Push statistics fixtures
export const PUSH_STATISTICS_FIXTURES: PushRecord[] = [
  {
    timestamp: Date.now() - 3600000, // 1 hour ago
    success: true,
    projectId: 'project-123',
    repoOwner: 'test-owner',
    repoName: 'test-repo',
    branch: 'main',
    filesCount: 5,
    commitMessage: 'Initial commit',
  },
  {
    timestamp: Date.now() - 7200000, // 2 hours ago
    success: false,
    projectId: 'project-456',
    repoOwner: 'test-owner',
    repoName: 'another-repo',
    branch: 'develop',
    filesCount: 10,
    commitMessage: 'Update features',
    error: 'Rate limit exceeded',
  },
];

// Test project configurations
export const TEST_PROJECTS = {
  default: {
    projectId: 'project-123',
    repoOwner: 'test-owner',
    repoName: 'test-repo',
    branch: 'main',
    commitMessage: 'Update from Bolt',
  },
  withBranch: {
    projectId: 'project-456',
    repoOwner: 'test-owner',
    repoName: 'feature-repo',
    branch: 'feature/new-feature',
    commitMessage: 'Add new feature',
  },
  newProject: {
    projectId: 'new-project-789',
    repoOwner: 'test-owner',
    repoName: 'new-project-789', // Will use project ID as repo name
    branch: 'main',
    commitMessage: 'Initial upload from Bolt',
  },
};

// File size limits
export const FILE_SIZE_LIMITS = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  largeFile: new Blob([new Uint8Array(51 * 1024 * 1024)]), // 51MB - over limit
  normalFile: new Blob([new Uint8Array(10 * 1024 * 1024)]), // 10MB - within limit
};
