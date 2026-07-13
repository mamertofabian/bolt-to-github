import type { DiffEngineOptions, InventoryDiffInput } from '../../diff/diffEngine';
import type {
  GitHubBaseContentResult,
  GitHubBaseInventoryEntry,
} from '../../inventory/githubBaseInventory';
import type { FileInventoryEntry } from '../../inventory/zipInventory';

export interface InventoryDiffFixture {
  input: InventoryDiffInput;
  options?: DiffEngineOptions;
}

function lineCount(content: string): number {
  if (!content) {
    return 0;
  }
  const lines = content.split(/\r\n|\r|\n/);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function candidateText(path: string, gitBlobSha: string, textContent: string): FileInventoryEntry {
  return {
    path,
    sizeBytes: new TextEncoder().encode(textContent).byteLength,
    sha256: `sha256-${gitBlobSha}`,
    gitBlobSha,
    lineCount: lineCount(textContent),
    isText: true,
    isBinary: false,
    analysisEligible: true,
    retainedAsMetadata: false,
    largeFile: false,
    textContent,
  };
}

function candidateBinary(path: string, gitBlobSha: string, sizeBytes: number): FileInventoryEntry {
  return {
    path,
    sizeBytes,
    sha256: `sha256-${gitBlobSha}`,
    gitBlobSha,
    lineCount: undefined,
    isText: false,
    isBinary: true,
    analysisEligible: false,
    retainedAsMetadata: true,
    largeFile: false,
    textContent: undefined,
  };
}

function candidateLarge(path: string, gitBlobSha: string, sizeBytes: number): FileInventoryEntry {
  return {
    path,
    sizeBytes,
    sha256: `sha256-${gitBlobSha}`,
    gitBlobSha,
    lineCount: undefined,
    isText: true,
    isBinary: false,
    analysisEligible: false,
    retainedAsMetadata: true,
    largeFile: true,
    textContent: undefined,
  };
}

function baseEntry(path: string, gitBlobSha: string, sizeBytes: number): GitHubBaseInventoryEntry {
  return {
    path,
    gitBlobSha,
    sizeBytes,
    mode: '100644',
    analysisEligible: true,
    retainedAsMetadata: false,
  };
}

function input(
  candidateEntries: FileInventoryEntry[],
  baseEntries: GitHubBaseInventoryEntry[],
  baseTextEntries: Array<[string, string]>,
  complete = true
): InventoryDiffInput {
  return {
    candidate: { entries: candidateEntries, limitations: [] },
    base: {
      repository: { owner: 'codefrost', name: 'diff-project' },
      base: { ref: 'main', sha: 'base-sha' },
      entries: baseEntries,
      limitations: complete
        ? []
        : [
            {
              source: 'github_base',
              message: 'GitHub returned a truncated base tree for codefrost/diff-project.',
              confidenceImpact: 'medium',
            },
          ],
      complete,
    },
    baseContentByPath: new Map<string, GitHubBaseContentResult>(
      baseTextEntries.map(([path, textContent]) => [
        path,
        { path, textContent, isBinary: false, limitation: undefined },
      ])
    ),
  };
}

function mixedFixture(): InventoryDiffFixture {
  return {
    input: input(
      [
        candidateText('README.md', 'same-readme', 'readme\n'),
        candidateText('new-name.ts', 'rename-sha', 'renamed\n'),
        candidateText('src/App.ts', 'new-app', 'a\nc\nd\n'),
        candidateText('src/new.ts', 'new-file', 'new\nfile\n'),
      ],
      [
        baseEntry('README.md', 'same-readme', 7),
        baseEntry('old-name.ts', 'rename-sha', 8),
        baseEntry('src/App.ts', 'old-app', 4),
        baseEntry('src/old.ts', 'deleted-file', 9),
      ],
      [
        ['src/App.ts', 'a\nb\n'],
        ['src/old.ts', 'old\nfile\n'],
      ]
    ),
  };
}

function largeFixture(): InventoryDiffFixture {
  return {
    input: input(
      [candidateLarge('src/large.ts', 'new-large', 2 * 1024 * 1024)],
      [baseEntry('src/large.ts', 'old-large', 1024)],
      []
    ),
    options: { maxLineDiffBytes: 128 },
  };
}

function lineEndingFixture(): InventoryDiffFixture {
  return {
    input: input(
      [
        candidateText('src/crlf.ts', 'new-crlf', 'one\r\ntwo\r\n'),
        candidateText('src/final-newline.ts', 'new-final-newline', 'value'),
      ],
      [
        baseEntry('src/crlf.ts', 'old-crlf', 8),
        baseEntry('src/final-newline.ts', 'old-final-newline', 6),
      ],
      [
        ['src/crlf.ts', 'one\ntwo\n'],
        ['src/final-newline.ts', 'value\n'],
      ]
    ),
  };
}

function partialFixture(): InventoryDiffFixture {
  return {
    input: input(
      [
        candidateText('maybe-existing.ts', 'candidate-only', 'maybe\n'),
        candidateText('shared.ts', 'new-shared', 'new\n'),
      ],
      [baseEntry('known-deleted.ts', 'known-deleted', 4), baseEntry('shared.ts', 'old-shared', 4)],
      [
        ['known-deleted.ts', 'old\n'],
        ['shared.ts', 'old\n'],
      ],
      false
    ),
  };
}

function binaryFixture(): InventoryDiffFixture {
  const fixtureInput = input(
    [
      candidateBinary('assets/logo.bin', 'new-binary', 12),
      candidateBinary('assets/unchanged.bin', 'unchanged-binary', 6),
    ],
    [
      baseEntry('assets/legacy.bin', 'deleted-binary', 8),
      baseEntry('assets/logo.bin', 'old-binary', 10),
      baseEntry('assets/unchanged.bin', 'unchanged-binary', 6),
    ],
    []
  );
  fixtureInput.baseContentByPath = new Map([
    [
      'assets/legacy.bin',
      {
        path: 'assets/legacy.bin',
        textContent: undefined,
        isBinary: true,
        limitation: undefined,
      },
    ],
  ]);
  fixtureInput.candidate.limitations = [
    'Skipped line analysis for binary file: assets/logo.bin',
    'Skipped line analysis for binary file: assets/unchanged.bin',
  ];
  return { input: fixtureInput };
}

function ambiguousRenameFixture(): InventoryDiffFixture {
  return {
    input: input(
      [
        candidateText('new-a.ts', 'duplicate-sha', 'same\n'),
        candidateText('new-b.ts', 'duplicate-sha', 'same\n'),
      ],
      [baseEntry('old-a.ts', 'duplicate-sha', 5), baseEntry('old-b.ts', 'duplicate-sha', 5)],
      [
        ['old-a.ts', 'same\n'],
        ['old-b.ts', 'same\n'],
      ]
    ),
  };
}

const factories = {
  mixed: mixedFixture,
  'line-endings': lineEndingFixture,
  large: largeFixture,
  partial: partialFixture,
  binary: binaryFixture,
  'ambiguous-rename': ambiguousRenameFixture,
} satisfies Record<string, () => InventoryDiffFixture>;

export function createInventoryDiffFixture(name: string): InventoryDiffFixture {
  if (!Object.prototype.hasOwnProperty.call(factories, name)) {
    throw new Error(`Unknown inventory diff fixture: ${name}`);
  }
  return factories[name as keyof typeof factories]();
}
