/**
 * Mock implementation of fileUtils
 */

function processFilesWithGitignore(files) {
  // Simple mock implementation that returns the input files
  return new Map(files);
}

async function calculateGitBlobHash(content) {
  // Simple mock that returns a consistent hash for testing
  return 'mocked-git-hash-' + content.length;
}

module.exports = {
  processFilesWithGitignore,
  calculateGitBlobHash,
};
