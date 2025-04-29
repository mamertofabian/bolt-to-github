/**
 * Utility functions for file operations
 */
import type { ProjectFiles } from './types';

// Import ignore package statically instead of dynamically to work in service workers
import ignore from 'ignore';

/**
 * Process files according to gitignore rules
 * @param files Map of file paths to content
 * @returns Map of processed file paths to content
 */
export function processFilesWithGitignore(files: ProjectFiles): ProjectFiles {
  const processedFiles = new Map<string, string>();

  try {
    const ig = ignore();

    // Check for .gitignore and initialize ignore patterns
    const gitignoreContent = files.get('.gitignore') || files.get('project/.gitignore');
    if (gitignoreContent) {
      ig.add(gitignoreContent.split('\n'));
    } else {
      // Default ignore patterns for common directories when no .gitignore exists
      ig.add([
        'node_modules/',
        'dist/',
        'build/',
        '.DS_Store',
        'coverage/',
        '.env',
        '.env.local',
        '.env.*.local',
        '*.log',
        'npm-debug.log*',
        'yarn-debug.log*',
        'yarn-error.log*',
        '.idea/',
        '.vscode/',
        '*.suo',
        '*.ntvs*',
        '*.njsproj',
        '*.sln',
        '*.sw?',
        '.next/',
        'out/',
        '.nuxt/',
        '.cache/',
        '.temp/',
        'tmp/',
      ]);
    }

    for (const [path, content] of files.entries()) {
      if (path.endsWith('/') || !content.trim()) {
        // Skip directory entries and empty files
        continue;
      }

      const normalizedPath = path.startsWith('project/') ? path.slice(8) : path;

      if (ig.ignores(normalizedPath)) {
        // Skip files that match .gitignore patterns
        continue;
      }

      processedFiles.set(normalizedPath, content);
    }
  } catch (error) {
    console.error('Error processing files with gitignore:', error);
    // If error occurs with ignore package, return files as-is
    return new Map(files);
  }

  return processedFiles;
}

/**
 * Calculate the Git blob hash for a string content
 * GitHub calculates blob SHA using the format: "blob " + content.length + "\0" + content
 * @param content The content to hash
 * @returns SHA1 hash of the content in GitHub blob format
 */
export async function calculateGitBlobHash(content: string): Promise<string> {
  const encoder = new TextEncoder();

  // Prepare the prefix string once
  const prefixStr = `blob ${content.length}\0`;

  // Calculate total buffer size needed up front
  const totalLength = new TextEncoder().encode(prefixStr + content).length;

  // Encode directly into a single buffer
  let bytes: Uint8Array;

  // Modern browsers support encodeInto for better performance
  if (typeof encoder.encodeInto === 'function') {
    bytes = new Uint8Array(totalLength);
    const prefixResult = encoder.encodeInto(prefixStr, bytes);
    if (prefixResult && typeof prefixResult.written === 'number') {
      encoder.encodeInto(content, bytes.subarray(prefixResult.written));
    }
  } else {
    // Fallback for browsers without encodeInto
    const prefixBytes = encoder.encode(prefixStr);
    const contentBytes = encoder.encode(content);

    bytes = new Uint8Array(prefixBytes.length + contentBytes.length);
    bytes.set(prefixBytes);
    bytes.set(contentBytes, prefixBytes.length);
  }

  // Calculate SHA-1 hash
  const hashBuffer = await crypto.subtle.digest('SHA-1', bytes);

  // Convert to hex string
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
