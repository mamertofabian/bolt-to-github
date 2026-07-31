import type { DiffEngineOptions, LineDelta } from '../../diff/diffEngine';
import type {
  GitHubBaseInventoryEntry,
  GitHubBaseInventoryResult,
} from '../../inventory/githubBaseInventory';
import type { FileInventory, FileInventoryEntry } from '../../inventory/zipInventory';

export type InventoryDiffFixtureName = 'core' | 'line-deltas' | 'large-files' | 'binary-files';

export interface InventoryDiffFixture {
  name: InventoryDiffFixtureName;
  candidate: FileInventory;
  base: GitHubBaseInventoryResult;
  options: DiffEngineOptions;
}

function textEntry(
  path: string,
  sizeBytes: number,
  hash: string,
  lineCount: number | undefined,
  largeFile = false
): FileInventoryEntry {
  return {
    path,
    sizeBytes,
    hash,
    lineCount,
    contentKind: 'text',
    analysisEligible: true,
    lineDiffEligible: !largeFile,
    largeFile,
    skipReason: largeFile ? 'large_file' : undefined,
  };
}

function binaryEntry(path: string, sizeBytes: number, hash: string): FileInventoryEntry {
  return {
    path,
    sizeBytes,
    hash,
    lineCount: undefined,
    contentKind: 'binary',
    analysisEligible: true,
    lineDiffEligible: false,
    largeFile: false,
    skipReason: 'binary',
  };
}

function inventory(entries: FileInventoryEntry[], limitations: string[] = []): FileInventory {
  return { entries, limitations };
}

function baseEntry(path: string, sizeBytes: number, blobSha: string): GitHubBaseInventoryEntry {
  return {
    path,
    sizeBytes,
    blobSha,
    mode: '100644',
  };
}

function baseInventory(entries: GitHubBaseInventoryEntry[]): GitHubBaseInventoryResult {
  return {
    repository: { owner: 'frost-labs', name: 'bolt-app' },
    base: { ref: 'main', sha: 'base-commit' },
    treeSha: 'base-tree',
    entries,
    partial: false,
    limitations: [],
  };
}

export function createInventoryDiffFixture(name: string): InventoryDiffFixture {
  if (name === 'core') {
    return {
      name,
      candidate: inventory([
        textEntry('same.txt', 4, 'candidate-sha256-same', 1),
        textEntry('changed.txt', 11, 'candidate-sha256-changed', 2),
        textEntry('added.txt', 3, 'candidate-sha256-added', 1),
        textEntry('new-name.txt', 7, 'candidate-sha256-renamed', 1),
      ]),
      base: baseInventory([
        baseEntry('same.txt', 4, 'same-blob'),
        baseEntry('changed.txt', 10, 'changed-old-blob'),
        baseEntry('deleted.txt', 5, 'deleted-blob'),
        baseEntry('old-name.txt', 7, 'rename-blob'),
      ]),
      options: {
        detectRenames: true,
        baseBinaryPaths: new Set(),
        candidateBlobShasByPath: {
          'same.txt': 'same-blob',
          'changed.txt': 'changed-new-blob',
          'added.txt': 'added-blob',
          'new-name.txt': 'rename-blob',
        },
        lineDeltasByPath: {
          'changed.txt': { addedLines: 1, deletedLines: 1 },
          'deleted.txt': { addedLines: 0, deletedLines: 1 },
        },
      },
    };
  }

  if (name === 'line-deltas') {
    const changedDelta: LineDelta = { addedLines: 2, deletedLines: 1 };
    return {
      name,
      candidate: inventory([
        textEntry('added.txt', 8, 'candidate-sha256-added', 2),
        textEntry('changed.txt', 20, 'candidate-sha256-changed', 4),
      ]),
      base: baseInventory([
        baseEntry('changed.txt', 16, 'changed-old-blob'),
        baseEntry('deleted.txt', 12, 'deleted-blob'),
      ]),
      options: {
        baseBinaryPaths: new Set(),
        candidateBlobShasByPath: {
          'added.txt': 'added-blob',
          'changed.txt': 'changed-new-blob',
        },
        lineDeltasByPath: {
          'changed.txt': changedDelta,
          'deleted.txt': { addedLines: 0, deletedLines: 2 },
        },
      },
    };
  }

  if (name === 'large-files') {
    return {
      name,
      candidate: inventory(
        [textEntry('src/generated.ts', 2_000_000, 'candidate-sha256-large', undefined, true)],
        ['Candidate ZIP skipped line analysis for src/generated.ts.']
      ),
      base: baseInventory([baseEntry('src/generated.ts', 2_000_000, 'large-old-blob')]),
      options: {
        baseBinaryPaths: new Set(),
        candidateBlobShasByPath: {
          'src/generated.ts': 'large-new-blob',
        },
        maxLineDiffFileBytes: 1_000_000,
        lineDeltasByPath: {
          'src/generated.ts': { addedLines: 100, deletedLines: 100 },
        },
      },
    };
  }

  if (name === 'binary-files') {
    return {
      name,
      candidate: inventory([
        binaryEntry('assets/logo.png', 100, 'candidate-sha256-logo'),
        binaryEntry('assets/new.wasm', 200, 'candidate-sha256-wasm'),
      ]),
      base: baseInventory([
        baseEntry('assets/logo.png', 100, 'logo-old-blob'),
        baseEntry('assets/old.pdf', 300, 'pdf-old-blob'),
      ]),
      options: {
        candidateBlobShasByPath: {
          'assets/logo.png': 'logo-new-blob',
          'assets/new.wasm': 'wasm-new-blob',
        },
        baseBinaryPaths: new Set(['assets/logo.png', 'assets/old.pdf']),
      },
    };
  }

  throw new Error(`Unknown inventory diff fixture: ${name}`);
}
