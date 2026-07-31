import { unzipSync, Zip, zipSync, ZipPassThrough } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

import {
  buildZipInventory,
  type FileInventory,
  type FileInventoryEntry,
  type ZipInventoryOptions,
} from '../inventory/zipInventory';
import { shouldAnalyzePath, type PrsIgnoreRule } from '../rules/ignore-rules';
import type { ZipInventoryFixtureCatalog } from '../test-fixtures/prs/zips/catalog';

const TEST_INVENTORY_OPTIONS: ZipInventoryOptions = {
  hashBytes: async (bytes) =>
    Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
};

const FIXTURE_CATALOG: readonly ZipInventoryFixtureCatalog[] = [
  {
    name: 'normalized-source',
    purpose: 'Verify wrapper removal, path sorting, hashes, and text line counts.',
    syntheticOnly: true,
  },
  {
    name: 'ignored-output',
    purpose: 'Verify generated and vendor paths remain metadata-only.',
    syntheticOnly: true,
  },
  {
    name: 'lockfiles',
    purpose: 'Verify lockfiles remain eligible for dependency analysis.',
    syntheticOnly: true,
  },
  {
    name: 'binary-and-large-text',
    purpose: 'Verify files remain counted when line analysis is unavailable.',
    syntheticOnly: true,
  },
];

function createZip(entries: Record<string, string | Uint8Array>): ArrayBuffer {
  const encoder = new TextEncoder();
  const encodedEntries = Object.fromEntries(
    Object.entries(entries).map(([path, content]) => [
      path,
      new Uint8Array(typeof content === 'string' ? encoder.encode(content) : content),
    ])
  );
  const zip = zipSync(encodedEntries);
  expect(Object.keys(unzipSync(zip))).toHaveLength(Object.keys(entries).length);

  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

function forgeDeclaredUncompressedSize(zip: Uint8Array, declaredSize: number): ArrayBuffer {
  const patched = new Uint8Array(zip);
  const view = new DataView(patched.buffer);

  for (let offset = 0; offset <= patched.byteLength - 4; offset++) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50) {
      view.setUint32(offset + 22, declaredSize, true);
    } else if (signature === 0x02014b50) {
      view.setUint32(offset + 24, declaredSize, true);
    }
  }

  return patched.buffer;
}

function createStreamingZip(path: string, content: Uint8Array): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const zip = new Zip((error, data, final) => {
      if (error) {
        reject(error);
        return;
      }
      chunks.push(data);
      size += data.byteLength;
      if (final) {
        const archive = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          archive.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(archive.buffer);
      }
    });
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    entry.push(content, true);
    zip.end();
  });
}

function entryAt(inventory: FileInventory, path: string): FileInventoryEntry {
  const entry = inventory.entries.find((candidate) => candidate.path === path);
  expect(
    entry,
    `Expected inventory entry for ${path}; received ${JSON.stringify(inventory)}`
  ).toBeDefined();
  return entry as FileInventoryEntry;
}

describe('Production Readiness Snapshot ZIP inventory', () => {
  it('zip fixture produces expected normalized inventory', async () => {
    const zipData = createZip({
      'project/src/main.ts': "const greeting = 'hello';\nconsole.log(greeting);\n",
      'project/README.md': '# Sample project\n',
    });

    const firstInventory: FileInventory = await buildZipInventory(zipData, TEST_INVENTORY_OPTIONS);
    const secondInventory: FileInventory = await buildZipInventory(zipData, TEST_INVENTORY_OPTIONS);
    const mainEntry = entryAt(firstInventory, 'src/main.ts');

    expect(firstInventory).toEqual(secondInventory);
    expect(firstInventory.entries.map((entry) => entry.path)).toEqual(['README.md', 'src/main.ts']);
    expect(mainEntry).toMatchObject({
      path: 'src/main.ts',
      sizeBytes: 49,
      contentKind: 'text',
      lineCount: 2,
      analysisEligible: true,
      lineDiffEligible: true,
      largeFile: false,
    });
    expect(mainEntry.hash).toBeTruthy();
    expect(mainEntry.hash).toBe(entryAt(secondInventory, 'src/main.ts').hash);
    expect(FIXTURE_CATALOG).toHaveLength(4);
    expect(FIXTURE_CATALOG.every((fixture) => fixture.syntheticOnly)).toBe(true);

    const digestMock = vi.mocked(crypto.subtle.digest);
    digestMock.mockResolvedValueOnce(new Uint8Array(32).buffer);
    const defaultHashedInventory = await buildZipInventory(
      createZip({ 'project/hash.txt': 'hash me\n' }),
      {
        maxEntries: 10,
        maxEntryUncompressedBytes: 100,
        maxTotalUncompressedBytes: 100,
      }
    );
    expect(entryAt(defaultHashedInventory, 'hash.txt').hash).toHaveLength(64);
    expect(digestMock).toHaveBeenCalledWith('SHA-256', expect.any(Uint8Array));

    const unsafeInventory = await buildZipInventory(
      createZip({
        '/project/src/absolute.ts': 'unsafe\n',
        'C:\\src\\drive.ts': 'unsafe\n',
        'project/../outside.ts': 'unsafe\n',
        'project/src/duplicate.ts': 'first\n',
        'project/src/safe.ts': 'safe\n',
        'src/duplicate.ts': 'second\n',
        'Z.ts': 'uppercase\n',
        'a.ts': 'lowercase\n',
        'é.ts': 'unicode\n',
      }),
      TEST_INVENTORY_OPTIONS
    );
    expect(unsafeInventory.entries.map((entry) => entry.path)).toEqual([
      'Z.ts',
      'a.ts',
      'src/duplicate.ts',
      'src/safe.ts',
      'é.ts',
    ]);
    expect(unsafeInventory.limitations).toEqual(
      expect.arrayContaining([
        'Skipped duplicate normalized ZIP path: src/duplicate.ts.',
        'Skipped unsafe or empty ZIP path: /project/src/absolute.ts.',
        'Skipped unsafe or empty ZIP path: C:\\src\\drive.ts.',
        'Skipped unsafe or empty ZIP path: project/../outside.ts.',
      ])
    );
    await expect(buildZipInventory(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow(
      'Failed to read PRS ZIP inventory'
    );
    const fakeEndRecord = new Uint8Array(22);
    const fakeEndView = new DataView(fakeEndRecord.buffer);
    fakeEndView.setUint32(0, 0x06054b50, true);
    fakeEndView.setUint32(16, 1, true);
    await expect(buildZipInventory(fakeEndRecord.buffer)).rejects.toThrow(
      'Unsupported or invalid ZIP directory'
    );
  });

  it('ignored paths are excluded from source analysis', async () => {
    const documentedRule: PrsIgnoreRule = {
      pattern: '**/node_modules/**',
      reason: 'Installed dependencies are vendor output.',
    };
    const zipData = createZip({
      'project/src/main.ts': 'export const ready = true;\n',
      'project/generated.txt': 'generated content\n',
      'project/node_modules/pkg/index.js': 'x'.repeat(64),
      'project/dist/app.min.js': '(()=>{})();',
      'project/.DS_Store': new Uint8Array([0, 1, 2]),
    });

    const inventory = await buildZipInventory(zipData, {
      ...TEST_INVENTORY_OPTIONS,
      largeFileThresholdBytes: 30,
      computeHashes: false,
      shouldAnalyzePath: (path) => shouldAnalyzePath(path) && path !== 'generated.txt',
    });

    expect(documentedRule.retainAsMetadata).toBeUndefined();
    expect(shouldAnalyzePath('src/main.ts')).toBe(true);
    expect(shouldAnalyzePath('node_modules/pkg/index.js')).toBe(false);

    for (const ignoredPath of [
      '.DS_Store',
      'dist/app.min.js',
      'generated.txt',
      'node_modules/pkg/index.js',
    ]) {
      expect(entryAt(inventory, ignoredPath)).toMatchObject({
        contentKind: 'uninspected',
        analysisEligible: false,
        lineDiffEligible: false,
        hash: undefined,
        lineCount: undefined,
        skipReason: 'ignored_path',
      });
    }
    expect(entryAt(inventory, 'src/main.ts').hash).toBeUndefined();
    expect(entryAt(inventory, 'node_modules/pkg/index.js').largeFile).toBe(true);

    const descriptorInventory = await buildZipInventory(
      await createStreamingZip('project/node_modules/descriptor.bin', new Uint8Array(64).fill(1)),
      {
        ...TEST_INVENTORY_OPTIONS,
        largeFileThresholdBytes: 30,
      }
    );
    expect(entryAt(descriptorInventory, 'node_modules/descriptor.bin')).toMatchObject({
      sizeBytes: 64,
      largeFile: true,
      skipReason: 'ignored_path',
    });
  });

  it('lockfiles remain available for dependency analysis', async () => {
    const zipData = createZip({
      'project/node_modules/pkg/index.js': 'module.exports = {};\n',
      'project/package-lock.json': '{"lockfileVersion": 3}\n',
      'project/pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    });

    const inventory = await buildZipInventory(zipData, TEST_INVENTORY_OPTIONS);

    expect(shouldAnalyzePath('package-lock.json')).toBe(true);
    expect(shouldAnalyzePath('pnpm-lock.yaml')).toBe(true);
    expect(entryAt(inventory, 'package-lock.json')).toMatchObject({
      contentKind: 'text',
      analysisEligible: true,
      lineDiffEligible: true,
      lineCount: 1,
    });
    expect(entryAt(inventory, 'pnpm-lock.yaml').hash).toBeTruthy();
    await expect(
      buildZipInventory(zipData, {
        ...TEST_INVENTORY_OPTIONS,
        maxEntries: -1,
      })
    ).rejects.toThrow('maxEntries must be a non-negative safe integer');
  });

  it('binary files are counted but not line diffed', async () => {
    const options: ZipInventoryOptions = {
      ...TEST_INVENTORY_OPTIONS,
      largeFileThresholdBytes: 8,
    };
    const zipData = createZip({
      'project/assets/logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1]),
      'project/src/large.ts': 'export const value = 123;\n',
    });

    const inventory = await buildZipInventory(zipData, options);
    const binaryEntry = entryAt(inventory, 'assets/logo.png');
    const largeTextEntry = entryAt(inventory, 'src/large.ts');

    expect(binaryEntry).toMatchObject({
      contentKind: 'binary',
      analysisEligible: true,
      lineDiffEligible: false,
      lineCount: undefined,
      largeFile: false,
    });
    expect(binaryEntry.hash).toBeTruthy();
    expect(largeTextEntry).toMatchObject({
      contentKind: 'text',
      analysisEligible: true,
      lineDiffEligible: false,
      lineCount: undefined,
      largeFile: true,
    });
    expect(inventory.limitations).toEqual([
      'Line analysis skipped for large file: src/large.ts (26 bytes).',
      'Line analysis unavailable for binary file: assets/logo.png.',
    ]);

    const limitedInventory = await buildZipInventory(
      createZip({
        'project/huge.txt': 'x'.repeat(40),
        'project/small-a.txt': 'a'.repeat(8),
        'project/small-b.txt': 'b'.repeat(8),
        'project/small-c.txt': 'c'.repeat(8),
      }),
      {
        ...TEST_INVENTORY_OPTIONS,
        largeFileThresholdBytes: 100,
        maxEntries: 3,
        maxEntryUncompressedBytes: 16,
        maxTotalUncompressedBytes: 12,
      }
    );
    expect(entryAt(limitedInventory, 'huge.txt')).toMatchObject({
      sizeBytes: 40,
      contentKind: 'uninspected',
      largeFile: false,
      skipReason: 'archive_limit',
    });
    expect(entryAt(limitedInventory, 'small-b.txt').skipReason).toBe('archive_limit');
    expect(limitedInventory.entries.some((entry) => entry.path === 'small-c.txt')).toBe(false);
    expect(limitedInventory.limitations).toEqual(
      expect.arrayContaining([
        'Stopped inventory after ZIP entry limit (3).',
        'Skipped extraction after ZIP size limit: small-b.txt.',
        'Skipped extraction for oversized ZIP entry: huge.txt (40 bytes).',
      ])
    );

    const forgedZip = zipSync(
      {
        'project/forged.bin': new Uint8Array(1024 * 1024).fill(65),
      },
      { level: 0 }
    );
    const yieldToEventLoop = vi.fn(async () => {});
    const forgedInventory = await buildZipInventory(forgeDeclaredUncompressedSize(forgedZip, 1), {
      ...TEST_INVENTORY_OPTIONS,
      largeFileThresholdBytes: 2_048,
      maxEntryUncompressedBytes: 16,
      maxTotalUncompressedBytes: 64,
      yieldToEventLoop,
    });
    expect(entryAt(forgedInventory, 'forged.bin')).toMatchObject({
      contentKind: 'uninspected',
      analysisEligible: true,
      lineDiffEligible: false,
      largeFile: true,
      skipReason: 'archive_limit',
    });
    expect(entryAt(forgedInventory, 'forged.bin').sizeBytes).toBeGreaterThan(16);
    expect(yieldToEventLoop).toHaveBeenCalled();

    const forgedDeflateZip = zipSync(
      {
        'project/forged-deflate.txt': new Uint8Array(10 * 1024 * 1024).fill(65),
      },
      { level: 9 }
    );
    const forgedDeflateInventory = await buildZipInventory(
      forgeDeclaredUncompressedSize(forgedDeflateZip, 1),
      {
        ...TEST_INVENTORY_OPTIONS,
        largeFileThresholdBytes: 2_048,
        maxEntryUncompressedBytes: 16,
        maxTotalUncompressedBytes: 128 * 1024,
      }
    );
    expect(entryAt(forgedDeflateInventory, 'forged-deflate.txt')).toMatchObject({
      contentKind: 'uninspected',
      analysisEligible: true,
      lineDiffEligible: false,
      largeFile: true,
      skipReason: 'archive_limit',
    });
    expect(entryAt(forgedDeflateInventory, 'forged-deflate.txt').sizeBytes).toBeLessThan(
      128 * 1024
    );

    const splitUtf8Inventory = await buildZipInventory(
      createZip({
        'project/split-utf8.txt': `${'a'.repeat(7_999)}é`,
      }),
      {
        ...TEST_INVENTORY_OPTIONS,
        largeFileThresholdBytes: 10_000,
      }
    );
    expect(entryAt(splitUtf8Inventory, 'split-utf8.txt')).toMatchObject({
      contentKind: 'text',
      analysisEligible: true,
      lineDiffEligible: true,
    });
  });
});
