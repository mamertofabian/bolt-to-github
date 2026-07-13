import type { ReadinessSnapshot } from '../domain';

export interface FixtureFile {
  path: string;
  content: string;
  binary?: boolean;
}

export type PrsFixture = {
  name: string;
  files: FixtureFile[];
  goldenSnapshot?: ReadinessSnapshot;
};

const fixtures = {
  'ui-only': {
    name: 'ui-only',
    files: [
      {
        path: 'src/App.tsx',
        content: 'export function App() { return <main>Ready</main>; }',
      },
    ],
    goldenSnapshot: {
      schemaVersion: 'b2g.prs.snapshot.v1',
      generatedAt: '2026-07-06T21:00:00.000Z',
      repository: { owner: 'codefrost', name: 'ui-project' },
      base: {
        ref: 'main',
        sha: 'abc123',
        compareUrl: 'https://github.com/codefrost/ui-project/compare/abc123',
      },
      candidate: {
        id: 'bolt-export-ui-only-001',
        label: 'UI-only export',
        zipSizeBytes: 512,
        generatedFrom: 'bolt-export-zip',
      },
      comparison: {
        changedFiles: 1,
        addedFiles: 0,
        deletedFiles: 0,
        binaryFilesChanged: 0,
        sensitiveFilesChanged: 0,
        packageManifestChanged: false,
        lockfileChanged: false,
        envExampleChanged: false,
        routeSurfaceChanged: false,
      },
      state: {
        state: 'green',
        confidence: 'medium',
        internalScore: 0,
        headline: 'Mostly UI/content changes.',
        recommendedAction: 'Review the receipt and continue when ready.',
        topConcerns: [],
        safeLookingAreas: ['No obvious production-sensitive areas changed.'],
      },
      categories: [],
      signals: [],
      trends: [],
      outputs: {},
      limitations: ['Not enough export history yet to judge whether this change is unusual.'],
    },
  },
} satisfies Record<string, PrsFixture>;

export function loadPrsFixture(name: string): PrsFixture {
  if (!Object.prototype.hasOwnProperty.call(fixtures, name)) {
    throw new Error(`Unknown PRS fixture: ${name}`);
  }

  const fixture = fixtures[name as keyof typeof fixtures];

  return structuredClone(fixture);
}
