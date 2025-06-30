import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ReadmeGeneratorService');

export class ReadmeGeneratorService {
  /**
   * Checks if a README file needs to be generated based on its content
   * @param readmeContent - The content of the README file (null if doesn't exist)
   * @returns true if README should be generated, false otherwise
   */
  public static shouldGenerateReadme(readmeContent: string | null): boolean {
    // If README doesn't exist, generate it
    if (readmeContent === null) {
      logger.info('README.md not found, will generate');
      return true;
    }

    // If README is empty or only whitespace, generate it
    const trimmedContent = readmeContent.trim();
    if (trimmedContent.length === 0) {
      logger.info('README.md is empty or whitespace-only, will generate');
      return true;
    }

    // If README has meaningful content, don't generate
    logger.info('README.md has meaningful content, will not generate');
    return false;
  }

  /**
   * Generates README content based on the project/repository name
   * @param projectName - The name of the project/repository
   * @returns The generated README content
   */
  public static generateReadmeContent(projectName: string): string {
    const template = `# ${projectName}

This project was created and pushed to GitHub using [Bolt to GitHub](https://github.com/mamertofabian/bolt-to-github) Chrome Extension.

## Description

[Add your project description here]

## Installation

[Add installation instructions here]

## Usage

[Add usage instructions here]

## Contributing

[Add contribution guidelines here]

## License

[Add license information here]
`;

    logger.info(`Generated README for project: ${projectName}`);
    return template;
  }

  /**
   * Checks if the given file path is a README file (case-insensitive)
   * @param filePath - The file path to check
   * @returns true if it's a README file, false otherwise
   */
  public static isReadmeFile(filePath: string): boolean {
    const fileName = filePath.split('/').pop()?.toLowerCase() || '';
    return fileName === 'readme.md';
  }

  /**
   * Processes files and adds a README if necessary
   * @param files - Map of file paths to content
   * @param projectName - The name of the project/repository
   * @returns Updated map with README added if necessary
   */
  public static processFilesWithReadme(
    files: Map<string, string>,
    projectName: string
  ): Map<string, string> {
    // Check if any file is a README (case-insensitive)
    let readmePath: string | null = null;
    let readmeContent: string | null = null;

    for (const [path, content] of files.entries()) {
      if (this.isReadmeFile(path)) {
        readmePath = path;
        readmeContent = content;
        break;
      }
    }

    // Determine if we should generate README
    if (this.shouldGenerateReadme(readmeContent)) {
      // Generate README content
      const generatedContent = this.generateReadmeContent(projectName);

      // Determine the correct path for README.md
      // If we found a readme file, replace it at the same path but with proper case
      // Otherwise, add it at the root with 'project/' prefix if other files have it
      let targetPath = 'README.md';

      if (readmePath) {
        // Replace at the same location but with proper case
        const pathParts = readmePath.split('/');
        pathParts[pathParts.length - 1] = 'README.md';
        targetPath = pathParts.join('/');

        // Remove the old readme if it had different casing
        if (readmePath !== targetPath) {
          files.delete(readmePath);
        }
      } else {
        // Check if files use 'project/' prefix
        const hasProjectPrefix = Array.from(files.keys()).some((path) =>
          path.startsWith('project/')
        );
        if (hasProjectPrefix) {
          targetPath = 'project/README.md';
        }
      }

      // Add or update the README
      files.set(targetPath, generatedContent);
      logger.info(`Added/updated README at: ${targetPath}`);
    }

    return files;
  }
}
