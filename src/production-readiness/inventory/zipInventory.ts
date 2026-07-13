import { Unzip, UnzipInflate, type AsyncFlateStreamHandler, type UnzipDecoder } from 'fflate';
import { findPrsIgnoreRule, type PrsIgnoreRule } from '../rules/ignore-rules';

const DEFAULT_BINARY_SAMPLE_BYTES = 8 * 1024;
const DEFAULT_LARGE_FILE_THRESHOLD_BYTES = 1024 * 1024;
const DEFAULT_MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MAX_FILE_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const ZIP_PARSE_CHUNK_BYTES = 1024;

export interface ZipInventoryOptions {
  ignoreRules?: readonly PrsIgnoreRule[];
  binarySampleBytes?: number;
  largeFileThresholdBytes?: number;
  maxArchiveBytes?: number;
  maxEntries?: number;
  maxFileUncompressedBytes?: number;
  maxTotalUncompressedBytes?: number;
}

export interface FileInventoryEntry {
  path: string;
  sizeBytes: number;
  sha256: string;
  lineCount?: number;
  isText: boolean;
  isBinary: boolean;
  analysisEligible: boolean;
  retainedAsMetadata: boolean;
  largeFile: boolean;
  textContent?: string;
}

export interface FileInventory {
  entries: FileInventoryEntry[];
  limitations: string[];
}

interface NormalizedZipPath {
  path?: string;
  unsafe: boolean;
}

interface InventoryBudgets {
  maxArchiveBytes: number;
  maxEntries: number;
  maxFileUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
}

interface ExtractedZipEntry {
  path: string;
  bytes: Uint8Array;
  retainedByRule: boolean;
}

class TerminableUnzipPassThrough implements UnzipDecoder {
  static readonly compression = 0;
  ondata: AsyncFlateStreamHandler = () => undefined;
  private terminated = false;

  push(data: Uint8Array, final: boolean): void {
    if (!this.terminated) {
      this.ondata(null, data, final);
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

class TerminableUnzipInflate implements UnzipDecoder {
  static readonly compression = 8;
  ondata: AsyncFlateStreamHandler = () => undefined;
  private readonly decoder = new UnzipInflate();
  private terminated = false;

  constructor() {
    this.decoder.ondata = (error, data, final) => {
      if (!this.terminated) {
        this.ondata(error, data, final);
      }
    };
  }

  push(data: Uint8Array, final: boolean): void {
    if (!this.terminated) {
      this.decoder.push(data, final);
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeZipPath(rawPath: string): NormalizedZipPath {
  const slashNormalized = rawPath.replace(/\\/g, '/').replace(/\/{2,}/g, '/');

  if (slashNormalized.startsWith('/') || /^[A-Za-z]:/.test(slashNormalized)) {
    return { unsafe: true };
  }

  const relativePath = slashNormalized.replace(/^\.\/+/, '');
  const segments = relativePath.split('/');

  if (segments.some((segment) => segment === '..')) {
    return { unsafe: true };
  }

  const meaningfulSegments = segments.filter((segment) => segment !== '' && segment !== '.');
  if (meaningfulSegments[0] === 'project') {
    meaningfulSegments.shift();
  }

  const path = meaningfulSegments.join('/');
  if (/^[A-Za-z]:/.test(path)) {
    return { unsafe: true };
  }

  return path ? { path, unsafe: false } : { unsafe: false };
}

function requirePositiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }

  return value;
}

function resolveBudgets(options: ZipInventoryOptions): InventoryBudgets {
  return {
    maxArchiveBytes: requirePositiveInteger(
      options.maxArchiveBytes,
      DEFAULT_MAX_ARCHIVE_BYTES,
      'maxArchiveBytes'
    ),
    maxEntries: requirePositiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES, 'maxEntries'),
    maxFileUncompressedBytes: requirePositiveInteger(
      options.maxFileUncompressedBytes,
      DEFAULT_MAX_FILE_UNCOMPRESSED_BYTES,
      'maxFileUncompressedBytes'
    ),
    maxTotalUncompressedBytes: requirePositiveInteger(
      options.maxTotalUncompressedBytes,
      DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES,
      'maxTotalUncompressedBytes'
    ),
  };
}

function looksBinary(bytes: Uint8Array, sampleBytes: number): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.byteLength, sampleBytes));

  if (sample.includes(0)) {
    return true;
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample, {
      stream: sample.byteLength < bytes.byteLength,
    });
  } catch {
    return true;
  }

  return sample.some(
    (byte) => byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13
  );
}

function countLines(content: string): number {
  if (!content) {
    return 0;
  }

  const lines = content.split(/\r\n|\r|\n/);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function joinChunks(chunks: Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function extractZipEntries(
  zipData: ArrayBuffer,
  options: ZipInventoryOptions,
  budgets: InventoryBudgets,
  limitations: string[]
): ExtractedZipEntry[] {
  const extracted: ExtractedZipEntry[] = [];
  const rawPaths = new Set<string>();
  const normalizedPaths = new Set<string>();
  const entryLimitReached = new Error('PRS zip entry budget reached');
  let discoveredEntries = 0;
  let totalUncompressedBytes = 0;

  const unzip = new Unzip((file) => {
    if (discoveredEntries >= budgets.maxEntries) {
      limitations.push(`Stopped zip scan after ${budgets.maxEntries} entries`);
      throw entryLimitReached;
    }
    discoveredEntries += 1;

    if (file.name.endsWith('/')) {
      return;
    }

    if (rawPaths.has(file.name)) {
      limitations.push(`Skipped duplicate zip entry: ${file.name}`);
      return;
    }
    rawPaths.add(file.name);

    const normalized = normalizeZipPath(file.name);
    if (normalized.unsafe) {
      limitations.push(`Skipped unsafe zip path: ${file.name}`);
      return;
    }
    if (!normalized.path) {
      return;
    }
    const normalizedPath = normalized.path;

    if (normalizedPaths.has(normalizedPath)) {
      limitations.push(`Skipped duplicate normalized zip path: ${normalizedPath}`);
      return;
    }
    normalizedPaths.add(normalizedPath);

    const ignoreRule = findPrsIgnoreRule(normalizedPath, options.ignoreRules);
    if (ignoreRule && !ignoreRule.retainAsMetadata) {
      return;
    }

    if (file.originalSize !== undefined && file.originalSize > budgets.maxFileUncompressedBytes) {
      limitations.push(`Skipped zip entry over uncompressed byte budget: ${normalizedPath}`);
      return;
    }

    if (
      file.originalSize !== undefined &&
      totalUncompressedBytes + file.originalSize > budgets.maxTotalUncompressedBytes
    ) {
      limitations.push(
        `Skipped zip entry over aggregate uncompressed byte budget: ${normalizedPath}`
      );
      return;
    }

    const chunks: Uint8Array[] = [];
    let extractedBytes = 0;
    let rejected = false;

    file.ondata = (error, data, final) => {
      if (error) {
        throw error;
      }
      if (rejected) {
        return;
      }

      const nextFileBytes = extractedBytes + data.byteLength;
      if (nextFileBytes > budgets.maxFileUncompressedBytes) {
        rejected = true;
        limitations.push(`Skipped zip entry over uncompressed byte budget: ${normalizedPath}`);
        file.terminate();
        return;
      }
      if (totalUncompressedBytes + nextFileBytes > budgets.maxTotalUncompressedBytes) {
        rejected = true;
        limitations.push(
          `Skipped zip entry over aggregate uncompressed byte budget: ${normalizedPath}`
        );
        file.terminate();
        return;
      }

      chunks.push(new Uint8Array(data));
      extractedBytes = nextFileBytes;

      if (final) {
        totalUncompressedBytes += extractedBytes;
        extracted.push({
          path: normalizedPath,
          bytes: joinChunks(chunks, extractedBytes),
          retainedByRule: ignoreRule !== undefined,
        });
      }
    };

    file.start();
  });
  unzip.register(TerminableUnzipPassThrough);
  unzip.register(TerminableUnzipInflate);

  const compressed = new Uint8Array(zipData);
  try {
    for (let offset = 0; offset < compressed.byteLength; offset += ZIP_PARSE_CHUNK_BYTES) {
      const end = Math.min(offset + ZIP_PARSE_CHUNK_BYTES, compressed.byteLength);
      unzip.push(compressed.subarray(offset, end), end === compressed.byteLength);
    }
  } catch (error) {
    if (error !== entryLimitReached) {
      throw error;
    }
  }

  return extracted;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildZipInventory(
  zipData: ArrayBuffer,
  options: ZipInventoryOptions | undefined = undefined
): Promise<FileInventory> {
  const resolvedOptions = options ?? {};
  const budgets = resolveBudgets(resolvedOptions);
  if (zipData.byteLength > budgets.maxArchiveBytes) {
    return {
      entries: [],
      limitations: [`Skipped zip scan: archive size exceeds ${budgets.maxArchiveBytes} bytes`],
    };
  }

  const binarySampleBytes = requirePositiveInteger(
    resolvedOptions.binarySampleBytes,
    DEFAULT_BINARY_SAMPLE_BYTES,
    'binarySampleBytes'
  );
  const largeFileThresholdBytes = requirePositiveInteger(
    resolvedOptions.largeFileThresholdBytes,
    DEFAULT_LARGE_FILE_THRESHOLD_BYTES,
    'largeFileThresholdBytes'
  );
  const entries: FileInventoryEntry[] = [];
  const limitations: string[] = [];
  const extracted = extractZipEntries(zipData, resolvedOptions, budgets, limitations);

  for (const { path, bytes, retainedByRule } of extracted) {
    const isBinary = looksBinary(bytes, binarySampleBytes);
    const largeFile = bytes.byteLength > largeFileThresholdBytes;
    const analysisEligible = !retainedByRule && !isBinary && !largeFile;
    const entry: FileInventoryEntry = {
      path,
      sizeBytes: bytes.byteLength,
      sha256: await sha256(bytes),
      isText: !isBinary,
      isBinary,
      analysisEligible,
      retainedAsMetadata: !analysisEligible,
      largeFile,
      lineCount: undefined,
      textContent: undefined,
    };

    if (analysisEligible) {
      entry.textContent = new TextDecoder('utf-8').decode(bytes);
      entry.lineCount = countLines(entry.textContent);
    } else if (isBinary) {
      limitations.push(`Skipped line analysis for binary file: ${path}`);
    } else if (largeFile) {
      limitations.push(`Skipped line analysis for large file: ${path}`);
    }

    entries.push(entry);
  }

  entries.sort((left, right) => compareStrings(left.path, right.path));
  limitations.sort(compareStrings);

  return { entries, limitations };
}
