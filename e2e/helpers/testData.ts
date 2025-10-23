import { zip } from 'fflate';

/**
 * Helper utilities for creating test data in E2E tests
 */

export interface TestProject {
  name: string;
  files: Record<string, string>;
}

/**
 * Create a simple test project structure
 */
export function createTestProject(name: string = 'test-project'): TestProject {
  return {
    name,
    files: {
      'index.html': `<!DOCTYPE html>
<html>
<head>
  <title>${name}</title>
</head>
<body>
  <h1>Hello from Bolt!</h1>
  <p>This is a test project created for E2E testing.</p>
</body>
</html>`,
      'README.md': `# ${name}

This is a test project created for E2E testing of Bolt to GitHub extension.

## Files

- index.html - Main HTML file
- package.json - Node.js package configuration
`,
      'package.json': JSON.stringify(
        {
          name: name.toLowerCase().replace(/\s+/g, '-'),
          version: '1.0.0',
          description: 'Test project for E2E testing',
          main: 'index.html',
          scripts: {
            test: 'echo "No tests specified"',
          },
          keywords: ['test', 'e2e'],
          author: 'Bolt to GitHub E2E Tests',
          license: 'MIT',
        },
        null,
        2
      ),
    },
  };
}

/**
 * Create a ZIP file from a test project
 */
export async function createProjectZip(project: TestProject): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  // Convert all file contents to Uint8Array
  for (const [path, content] of Object.entries(project.files)) {
    files[path] = new TextEncoder().encode(content);
  }

  // Create the ZIP file
  return new Promise((resolve, reject) => {
    zip(files, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

/**
 * Create a data URL for a ZIP file
 */
export async function createProjectZipDataUrl(project: TestProject): Promise<string> {
  const zipData = await createProjectZip(project);
  const base64 = btoa(String.fromCharCode(...zipData));
  return `data:application/zip;base64,${base64}`;
}

/**
 * Create a Blob URL for a ZIP file (for download testing)
 */
export async function createProjectZipBlobUrl(project: TestProject): Promise<string> {
  const zipData = await createProjectZip(project);
  const blob = new Blob([zipData], { type: 'application/zip' });
  return URL.createObjectURL(blob);
}

/**
 * Predefined test projects
 */
export const TEST_PROJECTS = {
  simple: createTestProject('simple-test-project'),

  withMultipleFiles: {
    name: 'multi-file-project',
    files: {
      'index.html': '<html><body>Main page</body></html>',
      'about.html': '<html><body>About page</body></html>',
      'style.css': 'body { margin: 0; padding: 0; }',
      'script.js': 'console.log("Hello from script");',
      'README.md': '# Multi-file Project\n\nThis project has multiple files.',
    },
  },

  withSubfolders: {
    name: 'project-with-folders',
    files: {
      'index.html': '<html><body>Main page</body></html>',
      'src/main.js': 'export function main() { console.log("Hello"); }',
      'src/utils.js': 'export function util() { return true; }',
      'public/index.html': '<html><body>Public page</body></html>',
      'README.md': '# Project with Folders\n\nOrganized structure.',
    },
  },
};
