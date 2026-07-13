import type { InventoryDiffResult, FileDiffEntry } from '../../diff/diffEngine';

export interface SensitivePathFixture {
  diff: InventoryDiffResult;
}

function changed(path: string): FileDiffEntry {
  return {
    path,
    status: 'changed',
    beforeGitBlobSha: `before:${path}`,
    afterGitBlobSha: `after:${path}`,
    sizeBeforeBytes: 1,
    sizeAfterBytes: 1,
    isBinary: false,
    lineDiffSkipped: false,
    addedLines: 1,
    deletedLines: 1,
  };
}

function renamed(path: string, previousPath: string): FileDiffEntry {
  return {
    path,
    previousPath,
    status: 'renamed',
    beforeGitBlobSha: `before:${previousPath}`,
    afterGitBlobSha: `after:${path}`,
    sizeBeforeBytes: 1,
    sizeAfterBytes: 1,
    isBinary: false,
    lineDiffSkipped: false,
    addedLines: 0,
    deletedLines: 0,
  };
}

function diff(files: FileDiffEntry[]): InventoryDiffResult {
  return {
    files,
    summary: {
      changedFiles: files.filter(({ status }) => status === 'changed').length,
      addedFiles: files.filter(({ status }) => status === 'added').length,
      deletedFiles: files.filter(({ status }) => status === 'deleted').length,
      renamedFiles: files.filter(({ status }) => status === 'renamed').length,
      addedLines: files.reduce((total, file) => total + (file.addedLines ?? 0), 0),
      deletedLines: files.reduce((total, file) => total + (file.deletedLines ?? 0), 0),
      binaryFilesChanged: 0,
    },
    limitations: [],
    complete: true,
  };
}

export function createSensitivePathFixture(name: string): SensitivePathFixture {
  switch (name) {
    case 'all-categories':
      return {
        diff: diff([
          changed('src/auth/session.ts'),
          changed('prisma/schema.prisma'),
          changed('vite.config.ts'),
          changed('.github/workflows/deploy.yml'),
          changed('src/integrations/stripe/client.ts'),
          changed('src/routes/api/orders.ts'),
          changed('src/routes/api/orders.test.ts'),
          changed('src/login/admin/page.tsx'),
          changed('src/legacy/checkout.backup.ts'),
        ]),
      };
    case 'retained-metadata':
      return {
        diff: diff([
          changed('pnpm-lock.yaml'),
          changed('vite.config.ts'),
          changed('.env.example'),
          changed('.github/workflows/ci.yml'),
        ]),
      };
    case 'renamed-sensitive':
      return {
        diff: diff([changed('README.md'), renamed('src/lib/guard.ts', 'src/auth/middleware.ts')]),
      };
    default:
      throw new Error(`Unknown sensitive path fixture: ${name}`);
  }
}
