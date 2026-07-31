import type { ReadinessSnapshot } from '../domain';

interface FixtureFile {
  path: string;
  content: string;
}

export type PrsFixture = {
  name: string;
  files: FixtureFile[];
  goldenSnapshot?: ReadinessSnapshot;
};

const fixtureFactories: Record<string, () => PrsFixture> = {
  'auth-env-change': () => ({
    name: 'auth-env-change',
    files: [
      {
        path: 'src/lib/auth.ts',
        content: 'export const requiresAuthentication = true;',
      },
      {
        path: '.env.example',
        content: 'STRIPE_SECRET_KEY=[REDACTED]',
      },
    ],
    goldenSnapshot: {
      schemaVersion: 'b2g.prs.snapshot.v1',
      generatedAt: '2026-07-07T00:00:00.000Z',
      repository: {
        owner: 'codefrost-dev',
        name: 'sample-bolt-project',
      },
      base: {
        ref: 'refs/heads/main',
        sha: 'base-sha',
      },
      candidate: {
        id: 'auth-env-change',
        label: 'Auth and environment change',
        zipSizeBytes: 1_024,
        generatedFrom: 'bolt-export-zip',
      },
      comparison: {
        changedFiles: 1,
        addedFiles: 1,
        deletedFiles: 0,
        binaryFilesChanged: 0,
        sensitiveFilesChanged: 2,
        packageManifestChanged: false,
        lockfileChanged: false,
        envExampleChanged: true,
        routeSurfaceChanged: false,
      },
      state: {
        state: 'yellow',
        confidence: 'medium',
        internalScore: 8,
        headline: 'Production-sensitive areas changed.',
        recommendedAction: 'Review authentication and environment configuration.',
        topConcerns: ['Authentication changed.', 'A sensitive value was redacted.'],
        safeLookingAreas: ['No dependencies changed.'],
      },
      categories: [
        {
          category: 'identity_access',
          signalCount: 1,
          highestSeverity: 'high',
          evidence: [
            {
              kind: 'file',
              label: 'Authentication module',
              path: 'src/lib/auth.ts',
            },
          ],
        },
        {
          category: 'secrets_config',
          signalCount: 1,
          highestSeverity: 'medium',
          evidence: [
            {
              kind: 'env_var',
              label: 'STRIPE_SECRET_KEY',
              path: '.env.example',
              after: '[REDACTED]',
              redacted: true,
            },
          ],
        },
      ],
      signals: [
        {
          id: 'auth-file-changed',
          category: 'identity_access',
          severity: 'high',
          title: 'Authentication code changed',
          message: 'Review sign-in and session behavior before deploying.',
          evidence: [
            {
              kind: 'file',
              label: 'Authentication module',
              path: 'src/lib/auth.ts',
            },
          ],
          deterministic: true,
        },
        {
          id: 'env-example-changed',
          category: 'secrets_config',
          severity: 'medium',
          title: 'Environment example changed',
          message: 'Review production environment configuration before deploying.',
          evidence: [
            {
              kind: 'env_var',
              label: 'STRIPE_SECRET_KEY',
              path: '.env.example',
              after: '[REDACTED]',
              redacted: true,
            },
          ],
          deterministic: true,
        },
      ],
      outputs: {},
      limitations: ['Historical comparison was unavailable.'],
    },
  }),
};

export function loadPrsFixture(name: string): PrsFixture {
  const createFixture = fixtureFactories[name];

  if (!createFixture) {
    throw new Error(`Unknown PRS fixture: ${name}`);
  }

  return createFixture();
}
