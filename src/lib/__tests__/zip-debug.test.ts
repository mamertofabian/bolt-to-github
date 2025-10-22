import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import { ZipProcessor } from '../zip';

describe('Simple ZIP test', () => {
  it('should work with a direct test', async () => {
    const log = (...args: unknown[]) => process.stdout.write(args.join(' ') + '\n');

    const encoder = new TextEncoder();
    const encoded = encoder.encode('Hello!');
    log('Encoded type:', typeof encoded);
    log('Encoded constructor:', encoded.constructor.name);
    log('Encoded is Uint8Array:', encoded instanceof Uint8Array);
    log('Encoded length:', encoded.length);
    log('Encoded bytes:', Array.from(encoded));

    const realUint8 = new Uint8Array(encoded);
    log('Real Uint8Array is Uint8Array:', realUint8 instanceof Uint8Array);

    const zipData = {
      'test.txt': realUint8,
    };

    const compressed = zipSync(zipData);
    log('Compressed length:', compressed.length);
    log('First 20 bytes:', Array.from(compressed.slice(0, 20)));

    const { unzipSync } = await import('fflate');
    const unzipped = unzipSync(compressed);
    log('Unzipped from compressed:', Object.keys(unzipped));
    for (const [key, value] of Object.entries(unzipped)) {
      const decoder = new TextDecoder();
      log(`  "${key}" = "${decoder.decode(value)}"`);
    }

    const buffer = compressed.buffer.slice(
      compressed.byteOffset,
      compressed.byteOffset + compressed.byteLength
    ) as ArrayBuffer;
    log('Buffer byteLength:', buffer.byteLength);

    const blob = new Blob([compressed as BlobPart], { type: 'application/zip' });
    log('Blob type:', typeof blob);
    log('Blob constructor:', blob.constructor.name);
    log('Blob has _parts:', '_parts' in blob);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts = (blob as any)._parts;
    log('Blob _parts length:', parts?.length);
    if (parts && parts.length > 0) {
      log('First part type:', typeof parts[0]);
      log('First part constructor:', parts[0]?.constructor?.name);
      log('First part is Uint8Array:', parts[0] instanceof Uint8Array);
      if (parts[0] instanceof Uint8Array) {
        log('First part byteLength:', parts[0].byteLength);
      }
    }

    const arrayBuf = await blob.arrayBuffer();
    log('ArrayBuffer byteLength:', arrayBuf.byteLength);
    const uint8 = new Uint8Array(arrayBuf);
    log('First 20 bytes of ArrayBuffer:', Array.from(uint8.slice(0, 20)).join(','));
    log('Original compressed first 20 bytes:', Array.from(compressed.slice(0, 20)).join(','));

    const result = await ZipProcessor.processZipBlob(blob);
    log('Result size:', result.size);
    log('Result keys:', JSON.stringify(Array.from(result.keys())));
    for (const [key, value] of result.entries()) {
      log(`  File: "${key}" = "${value}"`);
    }
    log('Result value for test.txt:', result.get('test.txt'));

    expect(result.has('test.txt')).toBe(true);
    expect(result.get('test.txt')).toBe('Hello!');
  });
});
