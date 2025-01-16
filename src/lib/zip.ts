import { unzipSync } from 'fflate';

export class ZipProcessor {
  static async processZipBlob(blob: Blob): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    try {
      // Convert blob to Uint8Array
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Use synchronous version instead of Promise-based unzip
      const unzipped = unzipSync(uint8Array);

      // Process each file
      for (const [filename, content] of Object.entries(unzipped)) {
        // Convert Uint8Array to text
        const decoder = new TextDecoder();
        const text = decoder.decode(content);
        files.set(filename, text);
      }

      return files;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to process ZIP file: ${errorMessage}`);
    }
  }
}
