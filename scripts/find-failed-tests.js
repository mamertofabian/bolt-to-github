#!/usr/bin/env node

/**
 * Cross-platform script to find failed test files
 *
 * This script runs vitest and extracts the list of test files that failed.
 * It's more robust and cross-platform compatible than using shell commands.
 */

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const outputFile = join(tmpdir(), 'vitest_output.log');
let outputBuffer = '';

console.log('Running tests and collecting output...\n');

// Run vitest and capture output
const vitest = spawn('pnpm', ['test'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

vitest.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);
  outputBuffer += text;
});

vitest.stderr.on('data', (data) => {
  const text = data.toString();
  process.stderr.write(text);
  outputBuffer += text;
});

vitest.on('close', (code) => {
  // Write output to temp file for reference
  try {
    writeFileSync(outputFile, outputBuffer);
  } catch (err) {
    console.error('Warning: Could not write output file:', err.message);
  }

  console.log('\n=== FAILING TEST FILES ===');

  // Extract failed test files using regex patterns
  const failedFiles = new Set();

  // Pattern 1: Look for actual test failure indicators (× symbol or FAIL marker)
  // Match: × test name (with file path before or after)
  const filePathPattern = /(src\/[^\s"']+\.test\.ts)/;

  // Find lines with failed test indicators
  const lines = outputBuffer.split('\n');
  let currentFile = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current file being tested
    const fileMatch = line.match(filePathPattern);
    if (fileMatch && (line.includes('❯') || line.includes('FAIL'))) {
      currentFile = fileMatch[1];
    }

    // If we see an actual failure indicator (× or ✕), mark the current file
    if ((line.includes('×') || line.includes('✕')) && currentFile) {
      // Make sure it's an actual test failure, not just the symbol in text
      if (line.match(/^\s*[×✕]\s+/)) {
        failedFiles.add(currentFile);
      }
    }

    // Also check for FAIL markers with file paths
    if (line.includes('FAIL') && fileMatch) {
      failedFiles.add(fileMatch[1]);
    }
  }

  // Pattern 2: Look for explicit error indicators with file paths
  const errorPattern =
    /(FAIL|Error:|TypeError:|ReferenceError:|AssertionError|This error originated).*?(src\/[^\s"']+\.test\.ts)/g;
  let match;
  while ((match = errorPattern.exec(outputBuffer)) !== null) {
    if (match[2]) {
      failedFiles.add(match[2]);
    }
  }

  // Sort and display results
  const sortedFiles = Array.from(failedFiles).sort();

  if (sortedFiles.length === 0) {
    console.log('No failed test files found! 🎉');
  } else {
    sortedFiles.forEach((file) => {
      console.log(file);
    });
    console.log(`\n--- Total: ${sortedFiles.length} file(s) with failures ---`);
  }

  // Clean up temp file
  try {
    unlinkSync(outputFile);
  } catch {
    // Ignore cleanup errors
  }

  // Exit with the same code as vitest
  process.exit(code);
});

vitest.on('error', (err) => {
  console.error('Failed to run vitest:', err);
  process.exit(1);
});
