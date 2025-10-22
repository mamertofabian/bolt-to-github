#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Check if a comment should be preserved
 */
function shouldPreserveComment(comment: string): boolean {
  const trimmed = comment.trim();

  // Preserve vitest environment directives
  if (trimmed.includes('@vitest-environment')) {
    return true;
  }

  // Preserve eslint disable/enable comments
  if (trimmed.includes('eslint-disable') || trimmed.includes('eslint-enable')) {
    return true;
  }

  // Preserve ts-ignore, ts-expect-error, ts-nocheck
  if (
    trimmed.includes('@ts-ignore') ||
    trimmed.includes('@ts-expect-error') ||
    trimmed.includes('@ts-nocheck')
  ) {
    return true;
  }

  return false;
}

/**
 * Remove comments from TypeScript test files while preserving essential directives
 */
function removeComments(content: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';
  let inRegex = false;

  while (i < content.length) {
    const char = content[i];
    const nextChar = i + 1 < content.length ? content[i + 1] : '';

    // Handle string literals
    if (inString) {
      result += char;
      if (char === stringChar && content[i - 1] !== '\\') {
        inString = false;
      }
      i++;
      continue;
    }

    // Handle regex literals
    if (inRegex) {
      result += char;
      if (char === '/' && content[i - 1] !== '\\') {
        inRegex = false;
      }
      i++;
      continue;
    }

    // Detect string start
    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      result += char;
      i++;
      continue;
    }

    // Handle single-line comments
    if (char === '/' && nextChar === '/') {
      let lineEnd = i + 2;
      while (lineEnd < content.length && content[lineEnd] !== '\n') {
        lineEnd++;
      }
      const commentText = content.substring(i, lineEnd);

      if (shouldPreserveComment(commentText)) {
        result += commentText;
      }

      i = lineEnd;
      continue;
    }

    // Handle multi-line comments
    if (char === '/' && nextChar === '*') {
      const commentStart = i;
      let commentEnd = i + 2;
      while (commentEnd < content.length - 1) {
        if (content[commentEnd] === '*' && content[commentEnd + 1] === '/') {
          commentEnd += 2;
          break;
        }
        commentEnd++;
      }
      const commentText = content.substring(commentStart, commentEnd);

      if (shouldPreserveComment(commentText)) {
        result += commentText;
      }

      i = commentEnd;
      continue;
    }

    // Detect regex literals
    if (char === '/' && !inString) {
      const prevNonWhitespace = result.trim().slice(-1);
      if (prevNonWhitespace && '=([{,;:!&|?+-%*<>'.includes(prevNonWhitespace)) {
        inRegex = true;
      }
    }

    result += char;
    i++;
  }

  // Clean up excessive blank lines (more than 2 consecutive newlines)
  return result.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function findTestFiles(dir: string = '.', files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!['node_modules', 'build', 'dist', '.svelte-kit'].includes(entry.name)) {
        findTestFiles(fullPath, files);
      }
    } else if (entry.name.endsWith('.test.ts')) {
      // Exclude the DataTable.test.ts file as it has essential comments
      const normalizedPath = fullPath.replace(/\\/g, '/');
      if (
        !normalizedPath.includes('apps/ud-admin/src/lib/components/DataTable/DataTable.test.ts')
      ) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function removeCommentsFromTestFiles(): void {
  console.log('🧹 Removing comments from test files...');

  const testFiles = findTestFiles();
  let processedCount = 0;
  let errorCount = 0;
  const modifiedFiles: string[] = [];

  testFiles.forEach((filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const cleanedContent = removeComments(content);

      if (content !== cleanedContent) {
        fs.writeFileSync(filePath, cleanedContent, 'utf8');
        console.log(`✅ Processed: ${filePath}`);
        modifiedFiles.push(filePath);
        processedCount++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, (error as Error).message);
      errorCount++;
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Files found: ${testFiles.length}`);
  console.log(`   Files processed: ${processedCount}`);
  console.log(`   Errors: ${errorCount}`);

  if (errorCount === 0) {
    console.log('✨ All test file comments removed successfully!');

    if (modifiedFiles.length > 0) {
      console.log('\n🎨 Formatting modified files...');
      try {
        const filesToFormat = modifiedFiles.join(' ');
        execSync(`pnpm prettier --write ${filesToFormat}`, { stdio: 'inherit' });
        console.log('✨ Modified files formatted successfully!');
      } catch (formatError) {
        console.error('❌ Error formatting files:', (formatError as Error).message);
        process.exit(1);
      }
    } else {
      console.log('ℹ️  No files were modified, skipping formatting.');
    }
  } else {
    console.log('⚠️  Some files had errors during processing.');
    process.exit(1);
  }
}

removeCommentsFromTestFiles();
