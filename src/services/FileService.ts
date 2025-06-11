import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import type { IFileService, FileInfo } from './interfaces/IFileService';
import { decodeBase64ToUtf8 } from '$lib/fileUtils';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('FileService');

/**
 * Service for GitHub file operations
 */
export class FileService implements IFileService {
  /**
   * Creates a new FileService instance
   * @param apiClient GitHub API client
   */
  constructor(private apiClient: IGitHubApiClient) {}

  /**
   * Reads a file from a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param branch Branch name
   * @returns Promise resolving to the file content
   */
  async readFile(owner: string, repo: string, path: string, branch: string): Promise<string> {
    try {
      const response = await this.apiClient.request(
        'GET',
        `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      );

      if (!response.content) {
        throw new Error(`File ${path} has no content`);
      }

      // GitHub API returns base64 encoded content - decode properly as UTF-8
      return decodeBase64ToUtf8(response.content.replace(/\s/g, ''));
    } catch (error) {
      logger.error(`Failed to read file ${path}:`, error);
      throw new Error(
        `Failed to read file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Writes a file to a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param content File content
   * @param branch Branch name
   * @param message Commit message
   * @returns Promise resolving when the file is written
   */
  async writeFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    branch: string,
    message: string
  ): Promise<any> {
    // Check if file exists to get its SHA
    let sha: string | undefined;
    try {
      // Try to get file info directly from the API instead of using getFileInfo
      // to avoid nested error messages
      const response = await this.apiClient.request(
        'GET',
        `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      );

      // If response is an array, it's a directory, not a file
      if (Array.isArray(response)) {
        throw new Error(`Path ${path} is a directory, not a file`);
      }

      sha = response.sha;
    } catch (error) {
      // If error is not 404 (file not found), propagate it
      if (error instanceof Error && !error.message.includes('404')) {
        logger.error(`Failed to check if file exists: ${path}`, error);
        throw new Error(`Failed to write file ${path}: ${error.message}`);
      }
      // File doesn't exist, which is fine for creating a new file
      logger.info(`File ${path} does not exist yet, will create new`);
    }

    try {
      // Base64 encode the content
      const encodedContent = btoa(content);

      // Create or update file
      const body = {
        message,
        content: encodedContent,
        branch,
        ...(sha ? { sha } : {}),
      };

      return await this.apiClient.request('PUT', `/repos/${owner}/${repo}/contents/${path}`, body);
    } catch (error) {
      logger.error(`Failed to write file ${path}:`, error);
      throw new Error(
        `Failed to write file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Deletes a file from a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param branch Branch name
   * @param message Commit message
   * @returns Promise resolving when the file is deleted
   */
  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    message: string
  ): Promise<void> {
    try {
      // Check if file exists first
      const exists = await this.fileExists(owner, repo, path, branch);
      if (!exists) {
        logger.warn(`File ${path} doesn't exist, considering deletion successful`);
        return;
      }

      // Get file SHA which is required for deletion
      const fileInfo = await this.apiClient.request(
        'GET',
        `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      );

      if (!fileInfo || !fileInfo.sha) {
        throw new Error(`Could not get SHA for file ${path}`);
      }

      // Delete file
      await this.apiClient.request('DELETE', `/repos/${owner}/${repo}/contents/${path}`, {
        message,
        sha: fileInfo.sha,
        branch,
      });
    } catch (error) {
      // If file doesn't exist (404), consider the deletion successful
      if (error instanceof Error && error.message.includes('404')) {
        logger.warn(`File ${path} doesn't exist, considering deletion successful`);
        return;
      }

      logger.error(`Failed to delete file ${path}:`, error);
      throw new Error(
        `Failed to delete file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Lists files in a directory in a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path Directory path
   * @param branch Branch name
   * @returns Promise resolving to an array of file information
   */
  async listFiles(
    owner: string,
    repo: string,
    path: string,
    branch: string
  ): Promise<Array<FileInfo>> {
    try {
      const response = await this.apiClient.request(
        'GET',
        `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      );

      // If response is not an array, it's a file, not a directory
      if (!Array.isArray(response)) {
        throw new Error(`Path ${path} is not a directory`);
      }

      return response.map((item: any) => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        size: item.size,
        type: item.type,
        download_url: item.download_url,
        html_url: item.html_url,
      }));
    } catch (error) {
      logger.error(`Failed to list files in ${path}:`, error);
      throw new Error(
        `Failed to list files in ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets information about a file in a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param branch Branch name
   * @returns Promise resolving to file information
   */
  async getFileInfo(owner: string, repo: string, path: string, branch: string): Promise<FileInfo> {
    try {
      const response = await this.apiClient.request(
        'GET',
        `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      );

      // If response is an array, it's a directory, not a file
      if (Array.isArray(response)) {
        throw new Error(`Path ${path} is a directory, not a file`);
      }

      return {
        name: response.name,
        path: response.path,
        sha: response.sha,
        size: response.size,
        type: response.type,
        content: response.content,
        download_url: response.download_url,
        html_url: response.html_url,
      };
    } catch (error) {
      logger.error(`Failed to get file info for ${path}:`, error);
      throw new Error(
        `Failed to get file info for ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Checks if a file exists in a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param branch Branch name
   * @returns Promise resolving to true if the file exists, false otherwise
   */
  async fileExists(owner: string, repo: string, path: string, branch: string): Promise<boolean> {
    try {
      await this.apiClient.request('GET', `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Creates a directory in a repository (by creating a .gitkeep file)
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path Directory path
   * @param branch Branch name
   * @param message Commit message
   * @returns Promise resolving when the directory is created
   */
  async createDirectory(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    message: string
  ): Promise<void> {
    // Normalize path to ensure it doesn't have trailing slash
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;

    // Create a .gitkeep file in the directory to effectively create the directory
    await this.writeFile(
      owner,
      repo,
      `${normalizedPath}/.gitkeep`,
      '',
      branch,
      message || `Create directory ${normalizedPath}`
    );
  }
}
