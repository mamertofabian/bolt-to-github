import type { ReadinessCategory } from '../../domain';
import type {
  FileDiffEntry,
  InventoryComparisonSummary,
  InventoryDiffResult,
} from '../../diff/diffEngine';

export type SensitivePathFixtureName = 'category-matrix' | 'retained-metadata';

export interface SensitivePathFixture {
  name: SensitivePathFixtureName;
  diff: InventoryDiffResult;
  expected: Readonly<Record<string, ReadinessCategory[]>>;
}

function diffEntry(
  path: string,
  status: FileDiffEntry['status'] = 'changed',
  previousPath?: string
): FileDiffEntry {
  return {
    path,
    previousPath,
    status,
    binary: false,
    lineDiffEligible: true,
    addedLines: 1,
    deletedLines: 1,
  };
}

function diff(entries: FileDiffEntry[]): InventoryDiffResult {
  const summary: InventoryComparisonSummary = {
    changedFiles: entries.filter((entry) => entry.status === 'changed').length,
    addedFiles: entries.filter((entry) => entry.status === 'added').length,
    deletedFiles: entries.filter((entry) => entry.status === 'deleted').length,
    renamedFiles: entries.filter((entry) => entry.status === 'renamed').length,
    indeterminateFiles: entries.filter((entry) => entry.status === 'indeterminate').length,
    addedLines: 0,
    deletedLines: 0,
    binaryFilesChanged: 0,
  };
  return { entries, summary, limitations: [] };
}

export function createSensitivePathFixture(name: string): SensitivePathFixture {
  if (name === 'category-matrix') {
    return {
      name,
      diff: diff([
        diffEntry('src/auth/session.ts'),
        diffEntry('prisma/schema.prisma', 'added'),
        diffEntry('.env.production', 'deleted'),
        diffEntry('.github/workflows/deploy.yml'),
        diffEntry('src/integrations/stripe/client.ts'),
        diffEntry('src/app/api/users/route.ts', 'renamed'),
        diffEntry('src/lib/legacy-guard.ts', 'renamed', 'src/auth/legacy-guard.ts'),
        diffEntry('src/pages/admin.tsx'),
        diffEntry('src/pages/account.tsx'),
        diffEntry('src/pages/dashboard.tsx'),
        diffEntry('src/integrations/billing.ts'),
        diffEntry('src/server/webhook.ts'),
        diffEntry('src/email-template.ts'),
        diffEntry('src/auth/session.test.ts'),
        diffEntry('src/components/Button.ts.bak'),
        diffEntry('src/pages/_app.tsx'),
        diffEntry('src/pages/_document.tsx'),
        diffEntry('src/pages/_error.tsx'),
        diffEntry('src/auth/unconfirmed.ts', 'indeterminate'),
        diffEntry('src/components/Button.svelte'),
      ]),
      expected: {
        'src/auth/session.ts': ['identity_access'],
        'prisma/schema.prisma': ['data_persistence'],
        '.env.production': ['secrets_config'],
        '.github/workflows/deploy.yml': ['deployment_ops', 'testing_recovery'],
        'src/integrations/stripe/client.ts': ['external_integrations'],
        'src/app/api/users/route.ts': ['public_surface'],
        'src/auth/legacy-guard.ts': ['identity_access'],
        'src/pages/admin.tsx': ['identity_access', 'public_surface'],
        'src/pages/account.tsx': ['identity_access', 'public_surface'],
        'src/pages/dashboard.tsx': ['identity_access', 'public_surface'],
        'src/integrations/billing.ts': ['external_integrations'],
        'src/server/webhook.ts': ['external_integrations'],
        'src/email-template.ts': ['external_integrations'],
        'src/auth/session.test.ts': ['identity_access', 'testing_recovery'],
        'src/components/Button.ts.bak': ['maintainability'],
      },
    };
  }

  if (name === 'retained-metadata') {
    return {
      name,
      diff: diff([
        diffEntry('pnpm-lock.yaml'),
        diffEntry('vite.config.ts'),
        diffEntry('playwright.config.ts'),
        diffEntry('.env.example'),
      ]),
      expected: {
        'pnpm-lock.yaml': ['deployment_ops'],
        'vite.config.ts': ['secrets_config'],
        'playwright.config.ts': ['testing_recovery'],
        '.env.example': ['secrets_config'],
      },
    };
  }

  throw new Error(`Unknown sensitive path fixture: ${name}`);
}
