import { webcrypto } from 'node:crypto';
import { Zip, ZipDeflate, ZipPassThrough, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildZipInventory,
  type FileInventory,
  type FileInventoryEntry,
  type ZipInventoryOptions,
} from '../inventory/zipInventory';
import { findPrsIgnoreRule, shouldAnalyzePath, type PrsIgnoreRule } from '../rules/ignore-rules';

const sharedTestCrypto = globalThis.crypto;

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: sharedTestCrypto,
  });
});

function createZip(files: Record<string, string | Uint8Array>): ArrayBuffer {
  const archive = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, content]) => [
        path,
        typeof content === 'string' ? new Uint8Array(new TextEncoder().encode(content)) : content,
      ])
    )
  );

  return archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength
  ) as ArrayBuffer;
}

function createDuplicateZip(path: string): ArrayBuffer {
  const chunks: Uint8Array[] = [];
  const archive = new Zip((error, chunk) => {
    if (error) {
      throw error;
    }
    chunks.push(chunk);
  });

  for (const content of ['first', 'second']) {
    const entry = new ZipPassThrough(path);
    archive.add(entry);
    entry.push(new Uint8Array(new TextEncoder().encode(content)), true);
  }
  archive.end();

  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}

function createStreamingDeflateZip(path: string, content: Uint8Array): ArrayBuffer {
  const chunks: Uint8Array[] = [];
  const archive = new Zip((error, chunk) => {
    if (error) {
      throw error;
    }
    chunks.push(chunk);
  });
  const entry = new ZipDeflate(path);
  archive.add(entry);
  entry.push(content, true);
  archive.end();

  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}

function inventoryContract(inventory: FileInventory): FileInventory {
  return inventory;
}

describe('Production Readiness Snapshot zip inventory', () => {
  it('zip fixture produces expected normalized inventory', async () => {
    const zipData = createZip({
      'project\\src\\App.tsx': 'alpha\nbeta\n',
      './project/README.md': '# Fixture\n',
      'project/empty.txt': '',
    });

    const first = inventoryContract(await buildZipInventory(zipData));
    const second = await buildZipInventory(zipData);

    expect(first).toEqual(second);
    expect(first).toEqual({
      entries: [
        {
          path: 'README.md',
          sizeBytes: 10,
          sha256: '7e98df7437f1b50bc0ea2ba7180f28bdb7a043cd2c6045e1783124cdba2fdcc5',
          gitBlobSha: 'ca69e6d08b5b8bb4f11a74f9695e329c203cbfd8',
          lineCount: 1,
          isText: true,
          isBinary: false,
          analysisEligible: true,
          retainedAsMetadata: false,
          largeFile: false,
          textContent: '# Fixture\n',
        },
        {
          path: 'empty.txt',
          sizeBytes: 0,
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          gitBlobSha: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
          lineCount: 0,
          isText: true,
          isBinary: false,
          analysisEligible: true,
          retainedAsMetadata: false,
          largeFile: false,
          textContent: '',
        },
        {
          path: 'src/App.tsx',
          sizeBytes: 11,
          sha256: 'e49c81e2d2f84e259d40e2fb8192f3bcd198b355184845d76d8f58807d0d78ee',
          gitBlobSha: 'fbbee861521bd5355538b096fa3998541cd33909',
          lineCount: 2,
          isText: true,
          isBinary: false,
          analysisEligible: true,
          retainedAsMetadata: false,
          largeFile: false,
          textContent: 'alpha\nbeta\n',
        },
      ],
      limitations: [],
    });

    const archiveBudget = await buildZipInventory(zipData, {
      maxArchiveBytes: 1,
      maxEntries: 10,
      maxFileUncompressedBytes: 10,
      maxTotalUncompressedBytes: 30,
    });
    expect(archiveBudget).toEqual({
      entries: [],
      limitations: ['Skipped zip scan: archive size exceeds 1 bytes'],
    });
  });

  it('ignored paths are excluded from source analysis', async () => {
    const retainedRule: PrsIgnoreRule = {
      pattern: 'generated/**',
      reason: 'Generated schema output',
      retainAsMetadata: true,
    };
    const options: ZipInventoryOptions = { ignoreRules: [retainedRule] };
    const inventory = await buildZipInventory(
      createZip({
        'project/src/App.ts': 'export const app = true;\n',
        'src/App.ts': 'normalized duplicate',
        'project/node_modules/pkg/index.js': 'vendor',
        'project/dist/bundle.js': 'generated',
        'project/.git/config': 'private metadata',
        'project/generated/schema.json': '{}\n',
        'project/../outside.txt': 'unsafe',
        '/absolute.txt': 'unsafe',
        'C:\\escape.txt': 'unsafe',
        'C:drive-relative.txt': 'unsafe',
        './C:/prefixed.txt': 'unsafe',
        'project/C:/nested.txt': 'unsafe',
      }),
      options
    );

    expect(shouldAnalyzePath('project/node_modules/pkg/index.js')).toBe(false);
    expect(shouldAnalyzePath('project/dist/bundle.js')).toBe(false);
    expect(shouldAnalyzePath('project/src/App.ts')).toBe(true);
    expect(findPrsIgnoreRule('project/generated/schema.json', [retainedRule])).toEqual(
      retainedRule
    );
    expect(inventory.entries.map(({ path }) => path)).toEqual([
      'generated/schema.json',
      'src/App.ts',
    ]);
    for (const ignoredPath of ['.git/config', 'dist/bundle.js', 'node_modules/pkg/index.js']) {
      expect(inventory.entries.map(({ path }) => path)).not.toContain(ignoredPath);
    }
    const retainedEntry: FileInventoryEntry | undefined = inventory.entries.find(
      ({ path }) => path === 'generated/schema.json'
    );
    expect(retainedEntry).toMatchObject({
      analysisEligible: false,
      retainedAsMetadata: true,
      textContent: undefined,
    });
    expect(inventory.limitations).toContain('Skipped unsafe zip path: project/../outside.txt');
    expect(inventory.limitations).toContain('Skipped unsafe zip path: /absolute.txt');
    expect(inventory.limitations).toContain('Skipped unsafe zip path: C:\\escape.txt');
    expect(inventory.limitations).toContain('Skipped unsafe zip path: C:drive-relative.txt');
    expect(inventory.limitations).toContain('Skipped unsafe zip path: ./C:/prefixed.txt');
    expect(inventory.limitations).toContain('Skipped unsafe zip path: project/C:/nested.txt');
    expect(inventory.limitations).toContain('Skipped duplicate normalized zip path: src/App.ts');

    const duplicateInventory = await buildZipInventory(createDuplicateZip('project/duplicate.txt'));
    expect(duplicateInventory.entries.map(({ path }) => path)).toEqual(['duplicate.txt']);
    expect(duplicateInventory.limitations).toContain(
      'Skipped duplicate zip entry: project/duplicate.txt'
    );

    const entryBudget = await buildZipInventory(
      createZip({ 'project/a.txt': 'a', 'project/b.txt': 'b' }),
      {
        maxEntries: 1,
        maxFileUncompressedBytes: 2,
        maxTotalUncompressedBytes: 2,
      }
    );
    expect(entryBudget.entries.map(({ path }) => path)).toEqual(['a.txt']);
    expect(entryBudget.limitations).toContain('Stopped zip scan after 1 entries');

    const fileBudget = await buildZipInventory(createZip({ 'project/large.txt': 'abc' }), {
      maxFileUncompressedBytes: 2,
      maxTotalUncompressedBytes: 10,
    });
    expect(fileBudget).toEqual({
      entries: [],
      limitations: ['Skipped zip entry over uncompressed byte budget: large.txt'],
    });

    const totalBudget = await buildZipInventory(
      createZip({ 'project/a.txt': 'aa', 'project/b.txt': 'bb' }),
      {
        maxFileUncompressedBytes: 2,
        maxTotalUncompressedBytes: 2,
      }
    );
    expect(totalBudget.entries.map(({ path }) => path)).toEqual(['a.txt']);
    expect(totalBudget.limitations).toContain(
      'Skipped zip entry over aggregate uncompressed byte budget: b.txt'
    );

    const streamingBytes = new Uint8Array(32 * 1024);
    for (let index = 0; index < streamingBytes.length; index += 1) {
      streamingBytes[index] = index % 251;
    }
    const streamingBudget = await buildZipInventory(
      createStreamingDeflateZip('project/streamed.bin', streamingBytes),
      {
        maxFileUncompressedBytes: 16,
        maxTotalUncompressedBytes: 32,
      }
    );
    expect(streamingBudget).toEqual({
      entries: [],
      limitations: ['Skipped zip entry over uncompressed byte budget: streamed.bin'],
    });
  });

  it('lockfiles remain available for dependency analysis', async () => {
    const inventory = await buildZipInventory(
      createZip({
        'project/package.json': '{"dependencies":{}}\n',
        'project/pnpm-lock.yaml': 'lockfileVersion: 9\n',
        'project/package-lock.json': '{"lockfileVersion":3}\n',
        'project/yarn.lock': '# yarn lockfile v1\n',
      })
    );

    expect(inventory.entries.map(({ path }) => path)).toEqual([
      'package-lock.json',
      'package.json',
      'pnpm-lock.yaml',
      'yarn.lock',
    ]);
    expect(inventory.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'pnpm-lock.yaml',
          sha256: '2a812209f3e69edfb5c65c5f1bb5cee92d2be3b8e5c5facc27f5e1c0338f2df0',
          gitBlobSha: 'e2b16d37871a91cca59ca692df8bd9b77effcbbb',
          analysisEligible: true,
          isText: true,
        }),
      ])
    );
  });

  it('binary files are counted but not line diffed', async () => {
    const inventory = await buildZipInventory(
      createZip({
        'project/assets/logo.bin': new Uint8Array([0, 1, 2, 255]),
        'project/src/large.txt': 'large\nlarge\n',
        'project/src/multibyte.txt': 'abc€',
      }),
      { binarySampleBytes: 4, largeFileThresholdBytes: 8 }
    );

    expect(inventory.entries).toEqual([
      {
        path: 'assets/logo.bin',
        sizeBytes: 4,
        sha256: '3d1f57c984978ef98a18378c8166c1cb8ede02c03eeb6aee7e2f121dfeee3e56',
        gitBlobSha: 'f971a5e28b6c4cb237ca3c7349e33bb600dbc907',
        lineCount: undefined,
        isText: false,
        isBinary: true,
        analysisEligible: false,
        retainedAsMetadata: true,
        largeFile: false,
        textContent: undefined,
      },
      {
        path: 'src/large.txt',
        sizeBytes: 12,
        sha256: '0c5148c8bcd2a094c1ba43a38fe778615472160229e7ac4296a909d3bc68da13',
        gitBlobSha: 'f48612db62e623678b90bb2862768f563131ce54',
        lineCount: undefined,
        isText: true,
        isBinary: false,
        analysisEligible: false,
        retainedAsMetadata: true,
        largeFile: true,
        textContent: undefined,
      },
      {
        path: 'src/multibyte.txt',
        sizeBytes: 6,
        sha256: '4fe1b64fe6c1dfed3a0cd438e4827dcc6756a0957647a211906e3c81a47c1d6e',
        gitBlobSha: '45413274aac09780a7befce35f4792bfc9e3528d',
        lineCount: 1,
        isText: true,
        isBinary: false,
        analysisEligible: true,
        retainedAsMetadata: false,
        largeFile: false,
        textContent: 'abc€',
      },
    ]);
    expect(inventory.limitations).toEqual([
      'Skipped line analysis for binary file: assets/logo.bin',
      'Skipped line analysis for large file: src/large.txt',
    ]);
  });
});
