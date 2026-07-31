import {
  Inflate,
  Unzip,
  UnzipPassThrough,
  type AsyncFlateStreamHandler,
  type UnzipDecoder,
  type UnzipFile,
} from 'fflate';

import { shouldAnalyzePath as shouldAnalyzePathByDefault } from '../rules/ignore-rules';

const DEFAULT_LARGE_FILE_THRESHOLD_BYTES = 1_000_000;
const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MAX_ENTRY_UNCOMPRESSED_BYTES = 10_000_000;
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 100_000_000;
const BINARY_SAMPLE_BYTES = 8_000;
const ARCHIVE_CHUNK_BYTES = 64 * 1024;
const DEFLATE_SLICE_BYTES = 64;

const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.avi',
  '.bmp',
  '.class',
  '.dll',
  '.eot',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.so',
  '.tar',
  '.ttf',
  '.wasm',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

export interface ZipInventoryOptions {
  largeFileThresholdBytes?: number;
  maxEntries?: number;
  maxEntryUncompressedBytes?: number;
  maxTotalUncompressedBytes?: number;
  computeHashes?: boolean;
  hashBytes?: (bytes: Uint8Array) => Promise<string>;
  shouldAnalyzePath?: (path: string) => boolean;
  yieldToEventLoop?: () => Promise<void>;
}

export interface FileInventoryEntry {
  path: string;
  sizeBytes: number;
  hash?: string;
  lineCount?: number;
  contentKind: 'text' | 'binary' | 'uninspected';
  analysisEligible: boolean;
  lineDiffEligible: boolean;
  largeFile: boolean;
  skipReason?: 'ignored_path' | 'binary' | 'large_file' | 'archive_limit';
}

export interface FileInventory {
  entries: FileInventoryEntry[];
  limitations: string[];
}

function normalizeZipPath(rawPath: string): string | null {
  if (rawPath.includes('\0') || /^[\\/]/.test(rawPath) || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
    return null;
  }

  const rawSegments = rawPath
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');
  const wrapperDepth = rawSegments[0] === 'project' ? 1 : 0;
  const segments: string[] = [];

  for (const segment of rawSegments) {
    if (segment === '..') {
      if (segments.length <= wrapperDepth) {
        return null;
      }
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  if (segments[0] === 'project') {
    segments.shift();
  }

  return segments.length > 0 ? segments.join('/') : null;
}

function fileExtension(path: string): string {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  const extensionIndex = filename.lastIndexOf('.');
  return extensionIndex > 0 ? filename.slice(extensionIndex).toLowerCase() : '';
}

function isBinaryContent(path: string, bytes: Uint8Array): boolean {
  if (BINARY_EXTENSIONS.has(fileExtension(path))) {
    return true;
  }

  const sample = bytes.subarray(0, Math.min(bytes.length, BINARY_SAMPLE_BYTES));
  if (sample.includes(0)) {
    return true;
  }

  let controlBytes = 0;
  for (const byte of sample) {
    const isAllowedWhitespace = byte === 9 || byte === 10 || byte === 13;
    if (!isAllowedWhitespace && byte < 32) {
      controlBytes++;
    }
  }

  if (sample.length > 0 && controlBytes / sample.length > 0.3) {
    return true;
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample, {
      stream: sample.length < bytes.length,
    });
    return false;
  } catch {
    return true;
  }
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines.length;
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const hashInput = new Uint8Array(bytes.byteLength);
  hashInput.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', hashInput);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function ignoredEntry(path: string, sizeBytes: number): FileInventoryEntry {
  return {
    path,
    sizeBytes,
    hash: undefined,
    lineCount: undefined,
    contentKind: 'uninspected',
    analysisEligible: false,
    lineDiffEligible: false,
    largeFile: false,
    skipReason: 'ignored_path',
  };
}

function compareCodePoints(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function validatedLimit(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function readZipDirectory(bytes: Uint8Array): Map<string, number> {
  const minimumEndRecordBytes = 22;
  const maximumCommentBytes = 65_535;
  const endSignature = 0x06054b50;
  const directorySignature = 0x02014b50;
  const searchStart = Math.max(0, bytes.byteLength - minimumEndRecordBytes - maximumCommentBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;

  for (let offset = bytes.byteLength - minimumEndRecordBytes; offset >= searchStart; offset--) {
    if (
      view.getUint32(offset, true) === endSignature &&
      offset + minimumEndRecordBytes + view.getUint16(offset + 20, true) === bytes.byteLength
    ) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset < 0) {
    throw new Error('Failed to read PRS ZIP inventory: Invalid ZIP archive.');
  }

  const diskNumber = view.getUint16(endOffset + 4, true);
  const directoryDisk = view.getUint16(endOffset + 6, true);
  const diskEntries = view.getUint16(endOffset + 8, true);
  const totalEntries = view.getUint16(endOffset + 10, true);
  const directorySize = view.getUint32(endOffset + 12, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);

  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    directoryOffset + directorySize !== endOffset
  ) {
    throw new Error('Failed to read PRS ZIP inventory: Unsupported or invalid ZIP directory.');
  }

  const sizes = new Map<string, number>();
  let offset = directoryOffset;
  for (let entry = 0; entry < totalEntries; entry++) {
    if (offset + 46 > endOffset || view.getUint32(offset, true) !== directorySignature) {
      throw new Error('Failed to read PRS ZIP inventory: Invalid ZIP central directory.');
    }

    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > endOffset) {
      throw new Error('Failed to read PRS ZIP inventory: Truncated ZIP central directory.');
    }

    const rawPath = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    sizes.set(rawPath, view.getUint32(offset + 24, true));
    offset = nextOffset;
  }

  if (offset !== endOffset) {
    throw new Error('Failed to read PRS ZIP inventory: Invalid ZIP directory length.');
  }

  return sizes;
}

type ZipEntryCandidate = {
  rawPath: string;
  path: string;
  sizeBytes: number;
  extract: boolean;
  metadataEntry?: FileInventoryEntry;
};

class ScheduledUnzipInflate implements UnzipDecoder {
  static compression = 8;

  ondata: AsyncFlateStreamHandler = () => {};
  private readonly inflater: Inflate;
  private queue = Promise.resolve();
  private terminated = false;

  constructor() {
    this.inflater = new Inflate((data, final) => {
      this.ondata(null, data, final);
    });
  }

  push(data: Uint8Array, final: boolean): void {
    const chunk = new Uint8Array(data);
    this.queue = this.queue.then(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            if (!this.terminated) {
              try {
                if (chunk.byteLength === 0) {
                  this.inflater.push(chunk, final);
                }
                for (
                  let offset = 0;
                  offset < chunk.byteLength && !this.terminated;
                  offset += DEFLATE_SLICE_BYTES
                ) {
                  const end = Math.min(offset + DEFLATE_SLICE_BYTES, chunk.byteLength);
                  this.inflater.push(
                    chunk.subarray(offset, end),
                    final && end === chunk.byteLength
                  );
                }
              } catch (error) {
                this.ondata(
                  error as Parameters<AsyncFlateStreamHandler>[0],
                  new Uint8Array(),
                  false
                );
              }
            }
            resolve();
          }, 0);
        })
    );
  }

  terminate(): void {
    this.terminated = true;
  }
}

type StreamingExtractionOptions = {
  largeFileThresholdBytes: number;
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  shouldAnalyzePath: (path: string) => boolean;
  yieldToEventLoop: () => Promise<void>;
};

async function extractZipArchive(
  zipData: ArrayBuffer,
  options: StreamingExtractionOptions
): Promise<{
  candidates: ZipEntryCandidate[];
  extracted: Map<string, Uint8Array>;
  limitations: string[];
}> {
  const bytes = new Uint8Array(zipData);
  const directorySizes = readZipDirectory(bytes);
  const candidates: ZipEntryCandidate[] = [];
  const extracted = new Map<string, Uint8Array>();
  const limitations: string[] = [];
  const activeFiles = new Set<{
    candidate: ZipEntryCandidate;
    chunks: Uint8Array[];
    file: UnzipFile;
    observedBytes: number;
    done: boolean;
  }>();
  let entryCount = 0;
  let selectedClaimedBytes = 0;
  let retainedActualBytes = 0;
  let entryLimitReported = false;
  let totalLimitReached = false;
  let inputComplete = false;
  let fatalError: Error | null = null;
  let resolveCompletion: (() => void) | undefined;
  let rejectCompletion: ((error: Error) => void) | undefined;
  let decoderActive = false;
  const pendingStarts: Array<() => void> = [];
  const queueDrainWaiters: Array<() => void> = [];

  const completion = new Promise<void>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  const checkComplete = (): void => {
    if (inputComplete && activeFiles.size === 0 && !fatalError) {
      resolveCompletion?.();
    }
  };

  const notifyQueueDrained = (): void => {
    if (pendingStarts.length !== 0) {
      return;
    }
    for (const resolve of queueDrainWaiters.splice(0)) {
      resolve();
    }
  };

  const scheduleNextDecoder = (): void => {
    if (decoderActive || fatalError) {
      return;
    }
    const start = pendingStarts.shift();
    if (!start) {
      notifyQueueDrained();
      return;
    }
    decoderActive = true;
    start();
    notifyQueueDrained();
  };

  const waitForQueuedDecoders = (): Promise<void> => {
    if (pendingStarts.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => queueDrainWaiters.push(resolve));
  };

  const releaseDecoder = (): void => {
    decoderActive = false;
    void Promise.resolve().then(scheduleNextDecoder);
  };

  const discardFile = (file: UnzipFile): void => {
    pendingStarts.push(() => {
      file.ondata = () => {};
      file.start();
      file.terminate();
      releaseDecoder();
    });
    scheduleNextDecoder();
  };

  const fail = (error: unknown): void => {
    if (fatalError) {
      return;
    }
    const message = error instanceof Error ? error.message : 'Unknown ZIP error';
    fatalError = new Error(`Failed to read PRS ZIP inventory: ${message}`);
    for (const active of activeFiles) {
      active.file.terminate();
      active.done = true;
    }
    activeFiles.clear();
    pendingStarts.length = 0;
    notifyQueueDrained();
    rejectCompletion?.(fatalError);
  };

  const unzipper = new Unzip((file) => {
    if (file.name.endsWith('/')) {
      discardFile(file);
      return;
    }

    entryCount++;
    if (entryCount > options.maxEntries) {
      if (!entryLimitReported) {
        limitations.push(`Stopped inventory after ZIP entry limit (${options.maxEntries}).`);
        entryLimitReported = true;
      }
      discardFile(file);
      return;
    }

    const path = normalizeZipPath(file.name);
    if (!path) {
      limitations.push(`Skipped unsafe or empty ZIP path: ${file.name}.`);
      discardFile(file);
      return;
    }

    const claimedSize = directorySizes.get(file.name) ?? file.originalSize ?? 0;
    const largeFile = claimedSize > options.largeFileThresholdBytes;

    if (!options.shouldAnalyzePath(path)) {
      candidates.push({
        rawPath: file.name,
        path,
        sizeBytes: claimedSize,
        extract: false,
        metadataEntry: {
          ...ignoredEntry(path, claimedSize),
          largeFile,
        },
      });
      discardFile(file);
      return;
    }

    const archiveLimitEntry = (message: string): void => {
      candidates.push({
        rawPath: file.name,
        path,
        sizeBytes: claimedSize,
        extract: false,
        metadataEntry: {
          path,
          sizeBytes: claimedSize,
          contentKind: 'uninspected',
          analysisEligible: true,
          lineDiffEligible: false,
          largeFile,
          skipReason: 'archive_limit',
        },
      });
      limitations.push(message);
      discardFile(file);
    };

    if (totalLimitReached) {
      archiveLimitEntry(`Skipped extraction after ZIP size limit: ${path}.`);
      return;
    }

    if (claimedSize > options.maxEntryUncompressedBytes) {
      archiveLimitEntry(
        `Skipped extraction for oversized ZIP entry: ${path} (${claimedSize} bytes).`
      );
      return;
    }

    if (selectedClaimedBytes + claimedSize > options.maxTotalUncompressedBytes) {
      totalLimitReached = true;
      archiveLimitEntry(`Skipped extraction after ZIP size limit: ${path}.`);
      return;
    }

    selectedClaimedBytes += claimedSize;
    const candidate: ZipEntryCandidate = {
      rawPath: file.name,
      path,
      sizeBytes: claimedSize,
      extract: true,
    };
    candidates.push(candidate);

    const active = {
      candidate,
      chunks: [] as Uint8Array[],
      file,
      observedBytes: 0,
      done: false,
    };
    activeFiles.add(active);

    const finish = (metadataEntry?: FileInventoryEntry): void => {
      if (active.done) {
        return;
      }
      active.done = true;
      activeFiles.delete(active);
      releaseDecoder();

      if (metadataEntry) {
        candidate.extract = false;
        candidate.sizeBytes = metadataEntry.sizeBytes;
        candidate.metadataEntry = metadataEntry;
      } else {
        const bytes = new Uint8Array(active.observedBytes);
        let offset = 0;
        for (const chunk of active.chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        candidate.sizeBytes = bytes.byteLength;
        extracted.set(candidate.rawPath, bytes);
      }
      checkComplete();
    };

    const stopAtLimit = (message: string, isTotalLimit: boolean): void => {
      file.terminate();
      active.chunks.length = 0;
      if (isTotalLimit) {
        totalLimitReached = true;
      }
      const observedSize = Math.max(claimedSize, active.observedBytes);
      limitations.push(message);
      finish({
        path,
        sizeBytes: observedSize,
        contentKind: 'uninspected',
        analysisEligible: true,
        lineDiffEligible: false,
        largeFile: observedSize > options.largeFileThresholdBytes,
        skipReason: 'archive_limit',
      });
    };

    file.ondata = (error, data, final) => {
      if (error) {
        fail(error);
        return;
      }
      if (active.done) {
        return;
      }

      if (data) {
        active.observedBytes += data.byteLength;
        if (active.observedBytes > options.maxEntryUncompressedBytes) {
          stopAtLimit(
            `Stopped oversized ZIP entry during extraction: ${path} (${active.observedBytes} bytes observed).`,
            false
          );
          return;
        }
        if (retainedActualBytes + data.byteLength > options.maxTotalUncompressedBytes) {
          stopAtLimit(`Stopped extraction at ZIP total size limit: ${path}.`, true);
          return;
        }

        retainedActualBytes += data.byteLength;
        active.chunks.push(new Uint8Array(data));
      }

      if (final) {
        finish();
      }
    };
    pendingStarts.push(() => file.start());
    scheduleNextDecoder();
  });
  unzipper.register(UnzipPassThrough);
  unzipper.register(ScheduledUnzipInflate);

  try {
    for (let offset = 0; offset < bytes.byteLength; offset += ARCHIVE_CHUNK_BYTES) {
      const end = Math.min(offset + ARCHIVE_CHUNK_BYTES, bytes.byteLength);
      const final = end === bytes.byteLength;
      unzipper.push(bytes.subarray(offset, end), final);
      await waitForQueuedDecoders();
      if (!final) {
        await options.yieldToEventLoop();
      }
    }
    inputComplete = true;
    checkComplete();
  } catch (error) {
    fail(error);
  }

  await completion;
  return { candidates, extracted, limitations };
}

export async function buildZipInventory(
  zipData: ArrayBuffer,
  options: ZipInventoryOptions | undefined = undefined
): Promise<FileInventory> {
  const resolvedOptions = options ?? {};
  const largeFileThresholdBytes = validatedLimit(
    'largeFileThresholdBytes',
    resolvedOptions.largeFileThresholdBytes ?? DEFAULT_LARGE_FILE_THRESHOLD_BYTES
  );
  const maxEntries = validatedLimit(
    'maxEntries',
    resolvedOptions.maxEntries ?? DEFAULT_MAX_ENTRIES
  );
  const maxEntryUncompressedBytes = validatedLimit(
    'maxEntryUncompressedBytes',
    resolvedOptions.maxEntryUncompressedBytes ?? DEFAULT_MAX_ENTRY_UNCOMPRESSED_BYTES
  );
  const maxTotalUncompressedBytes = validatedLimit(
    'maxTotalUncompressedBytes',
    resolvedOptions.maxTotalUncompressedBytes ?? DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES
  );

  const shouldAnalyze = resolvedOptions.shouldAnalyzePath ?? shouldAnalyzePathByDefault;
  const computeHashes = resolvedOptions.computeHashes ?? true;
  const computeHash = resolvedOptions.hashBytes ?? hashBytes;
  const yieldToEventLoop =
    resolvedOptions.yieldToEventLoop ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const { candidates, extracted, limitations } = await extractZipArchive(zipData, {
    largeFileThresholdBytes,
    maxEntries,
    maxEntryUncompressedBytes,
    maxTotalUncompressedBytes,
    shouldAnalyzePath: shouldAnalyze,
    yieldToEventLoop,
  });
  const entries: FileInventoryEntry[] = [];
  const normalizedPaths = new Set<string>();

  candidates.sort((left, right) => compareCodePoints(left.rawPath, right.rawPath));

  for (const candidate of candidates) {
    const { path } = candidate;
    if (normalizedPaths.has(path)) {
      limitations.push(`Skipped duplicate normalized ZIP path: ${path}.`);
      continue;
    }
    normalizedPaths.add(path);

    if (!candidate.extract) {
      if (candidate.metadataEntry) {
        entries.push(candidate.metadataEntry);
      }
      continue;
    }

    const bytes = extracted.get(candidate.rawPath);
    if (!bytes) {
      limitations.push(`ZIP entry was selected but not extracted: ${path}.`);
      continue;
    }

    const binary = isBinaryContent(path, bytes);
    const largeFile = bytes.byteLength > largeFileThresholdBytes;
    const hash = computeHashes ? await computeHash(bytes) : undefined;

    if (binary) {
      entries.push({
        path,
        sizeBytes: bytes.byteLength,
        hash,
        lineCount: undefined,
        contentKind: 'binary',
        analysisEligible: true,
        lineDiffEligible: false,
        largeFile,
        skipReason: 'binary',
      });
      limitations.push(`Line analysis unavailable for binary file: ${path}.`);
      continue;
    }

    if (largeFile) {
      entries.push({
        path,
        sizeBytes: bytes.byteLength,
        hash,
        lineCount: undefined,
        contentKind: 'text',
        analysisEligible: true,
        lineDiffEligible: false,
        largeFile: true,
        skipReason: 'large_file',
      });
      limitations.push(
        `Line analysis skipped for large file: ${path} (${bytes.byteLength} bytes).`
      );
      continue;
    }

    entries.push({
      path,
      sizeBytes: bytes.byteLength,
      hash,
      lineCount: countLines(new TextDecoder().decode(bytes)),
      contentKind: 'text',
      analysisEligible: true,
      lineDiffEligible: true,
      largeFile: false,
    });
  }

  entries.sort((left, right) => compareCodePoints(left.path, right.path));
  limitations.sort(compareCodePoints);

  return { entries, limitations };
}
