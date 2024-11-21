import JSZip from 'jszip';

export class ZipProcessor {
  static async processZipBlob(blob: Blob): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    const zip = new JSZip();
    
    try {
      const contents = await zip.loadAsync(blob);
      
      for (const [filename, file] of Object.entries(contents.files)) {
        if (!file.dir) {
          const content = await file.async('text');
          files.set(filename, content);
        }
      }
      
      return files;
    } catch (error) {
      throw new Error(`Failed to process ZIP file: ${error.message}`);
    }
  }
}