import { FileService } from '../FileService';
import type { IGitHubApiClient } from '../interfaces/IGitHubApiClient';
import { expect, jest, describe, it, beforeEach } from '@jest/globals';

// Mock the fileUtils module
jest.mock('$lib/fileUtils', () => ({
  decodeBase64ToUtf8: jest.fn((base64: string) => Buffer.from(base64, 'base64').toString('utf-8')),
}));

// Import the mocked function so we can check if it was called
import { decodeBase64ToUtf8 } from '$lib/fileUtils';
const mockDecodeBase64ToUtf8 = decodeBase64ToUtf8 as jest.MockedFunction<typeof decodeBase64ToUtf8>;

describe('FileService', () => {
  let mockApiClient: any;
  let fileService: FileService;

  beforeEach(() => {
    // Create a fresh mock for each test
    mockApiClient = {
      request: jest.fn(),
    };

    fileService = new FileService(mockApiClient as IGitHubApiClient);

    // Reset the mocked functions
    jest.clearAllMocks();

    // Mock global btoa function (still needed for writeFile)
    global.btoa = jest.fn((str: string) => Buffer.from(str).toString('base64'));
  });

  describe('readFile', () => {
    it('should read a file and decode its content', async () => {
      // Arrange
      const mockContent = Buffer.from('file content').toString('base64');
      mockApiClient.request.mockResolvedValueOnce({
        content: mockContent,
        name: 'test.txt',
        path: 'test.txt',
        sha: 'abc123',
      });

      // Act
      const result = await fileService.readFile('testuser', 'test-repo', 'test.txt', 'main');

      // Assert
      expect(result).toBe('file content');
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/test-repo/contents/test.txt?ref=main'
      );
      expect(mockDecodeBase64ToUtf8).toHaveBeenCalledWith(mockContent);
    });

    it('should throw an error when file has no content', async () => {
      // Arrange
      mockApiClient.request.mockResolvedValueOnce({
        name: 'test.txt',
        path: 'test.txt',
        sha: 'abc123',
        // No content property
      });

      // Act & Assert
      await expect(
        fileService.readFile('testuser', 'test-repo', 'test.txt', 'main')
      ).rejects.toThrow('File test.txt has no content');
    });

    it('should handle API errors', async () => {
      // Arrange
      mockApiClient.request.mockRejectedValueOnce(new Error('Not Found'));

      // Act & Assert
      await expect(
        fileService.readFile('testuser', 'test-repo', 'test.txt', 'main')
      ).rejects.toThrow('Failed to read file test.txt: Not Found');
    });
  });

  describe('writeFile', () => {
    it('should create a new file', async () => {
      // Arrange
      // First call for checking if file exists (should fail with 404)
      const notFoundError = new Error('Not Found');
      notFoundError.message = '404 Not Found';
      mockApiClient.request.mockRejectedValueOnce(notFoundError);

      // Second call for creating the file
      const mockResponse = { commit: { sha: 'new-commit-sha' } };
      mockApiClient.request.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await fileService.writeFile(
        'testuser',
        'test-repo',
        'new-file.txt',
        'new file content',
        'main',
        'Create new file'
      );

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockApiClient.request).toHaveBeenNthCalledWith(
        2,
        'PUT',
        '/repos/testuser/test-repo/contents/new-file.txt',
        expect.objectContaining({
          message: 'Create new file',
          content: expect.any(String),
          branch: 'main',
        })
      );
      expect(global.btoa).toHaveBeenCalledWith('new file content');
    });

    it('should update an existing file', async () => {
      // Arrange
      // First call for checking if file exists
      mockApiClient.request.mockResolvedValueOnce({
        name: 'existing-file.txt',
        path: 'existing-file.txt',
        sha: 'existing-sha',
      });

      // Second call for updating the file
      const mockResponse = { commit: { sha: 'updated-commit-sha' } };
      mockApiClient.request.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await fileService.writeFile(
        'testuser',
        'test-repo',
        'existing-file.txt',
        'updated content',
        'main',
        'Update file'
      );

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockApiClient.request).toHaveBeenNthCalledWith(
        2,
        'PUT',
        '/repos/testuser/test-repo/contents/existing-file.txt',
        expect.objectContaining({
          message: 'Update file',
          content: expect.any(String),
          branch: 'main',
          sha: 'existing-sha',
        })
      );
    });

    it('should handle API errors', async () => {
      // Arrange
      mockApiClient.request.mockRejectedValueOnce(new Error('Server Error'));

      // Act & Assert
      await expect(
        fileService.writeFile('testuser', 'test-repo', 'file.txt', 'content', 'main', 'message')
      ).rejects.toThrow('Failed to write file file.txt: Server Error');
    });
  });

  describe('deleteFile', () => {
    it('should delete an existing file', async () => {
      // Arrange
      // First call for checking if file exists
      mockApiClient.request.mockResolvedValueOnce({});

      // Second call for getting file info
      mockApiClient.request.mockResolvedValueOnce({
        name: 'file-to-delete.txt',
        path: 'file-to-delete.txt',
        sha: 'file-sha',
      });

      // Third call for deleting the file
      mockApiClient.request.mockResolvedValueOnce({});

      // Act
      await fileService.deleteFile(
        'testuser',
        'test-repo',
        'file-to-delete.txt',
        'main',
        'Delete file'
      );

      // Assert
      expect(mockApiClient.request).toHaveBeenNthCalledWith(
        3,
        'DELETE',
        '/repos/testuser/test-repo/contents/file-to-delete.txt',
        expect.objectContaining({
          message: 'Delete file',
          sha: 'file-sha',
          branch: 'main',
        })
      );
    });

    it('should consider deletion successful if file does not exist', async () => {
      // Arrange
      const notFoundError = new Error('Not Found');
      notFoundError.message = '404 Not Found';
      mockApiClient.request.mockRejectedValueOnce(notFoundError);

      // Act
      await fileService.deleteFile(
        'testuser',
        'test-repo',
        'non-existent-file.txt',
        'main',
        'Delete file'
      );

      // Assert - should not throw and should only make one request
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
    });

    it('should handle other API errors', async () => {
      // Arrange
      mockApiClient.request.mockRejectedValueOnce(new Error('Server Error'));

      // Act & Assert
      await expect(
        fileService.deleteFile('testuser', 'test-repo', 'file.txt', 'main', 'Delete file')
      ).rejects.toThrow('Failed to delete file file.txt: Server Error');
    });
  });

  describe('listFiles', () => {
    it('should list files in a directory', async () => {
      // Arrange
      const mockFiles = [
        {
          name: 'file1.txt',
          path: 'dir/file1.txt',
          sha: 'sha1',
          size: 100,
          type: 'file',
          download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/dir/file1.txt',
          html_url: 'https://github.com/testuser/test-repo/blob/main/dir/file1.txt',
        },
        {
          name: 'file2.txt',
          path: 'dir/file2.txt',
          sha: 'sha2',
          size: 200,
          type: 'file',
          download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/dir/file2.txt',
          html_url: 'https://github.com/testuser/test-repo/blob/main/dir/file2.txt',
        },
      ];
      mockApiClient.request.mockResolvedValueOnce(mockFiles);

      // Act
      const result = await fileService.listFiles('testuser', 'test-repo', 'dir', 'main');

      // Assert
      expect(result).toEqual(mockFiles);
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/test-repo/contents/dir?ref=main'
      );
    });

    it('should throw an error when path is not a directory', async () => {
      // Arrange - API returns a single file object, not an array
      mockApiClient.request.mockResolvedValueOnce({
        name: 'file.txt',
        path: 'file.txt',
        sha: 'sha',
        size: 100,
        type: 'file',
      });

      // Act & Assert
      await expect(
        fileService.listFiles('testuser', 'test-repo', 'file.txt', 'main')
      ).rejects.toThrow('Path file.txt is not a directory');
    });
  });

  describe('getFileInfo', () => {
    it('should get information about a file', async () => {
      // Arrange
      const mockFileInfo = {
        name: 'file.txt',
        path: 'file.txt',
        sha: 'sha',
        size: 100,
        type: 'file',
        content: 'base64content',
        download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/file.txt',
        html_url: 'https://github.com/testuser/test-repo/blob/main/file.txt',
      };
      mockApiClient.request.mockResolvedValueOnce(mockFileInfo);

      // Act
      const result = await fileService.getFileInfo('testuser', 'test-repo', 'file.txt', 'main');

      // Assert
      expect(result).toEqual(mockFileInfo);
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/test-repo/contents/file.txt?ref=main'
      );
    });

    it('should throw an error when path is a directory', async () => {
      // Arrange - API returns an array of files, indicating a directory
      mockApiClient.request.mockResolvedValueOnce([
        {
          name: 'file.txt',
          path: 'dir/file.txt',
          sha: 'sha',
        },
      ]);

      // Act & Assert
      await expect(fileService.getFileInfo('testuser', 'test-repo', 'dir', 'main')).rejects.toThrow(
        'Path dir is a directory, not a file'
      );
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      // Arrange
      mockApiClient.request.mockResolvedValueOnce({});

      // Act
      const result = await fileService.fileExists('testuser', 'test-repo', 'file.txt', 'main');

      // Assert
      expect(result).toBe(true);
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/test-repo/contents/file.txt?ref=main'
      );
    });

    it('should return false when file does not exist', async () => {
      // Arrange
      const notFoundError = new Error('Not Found');
      notFoundError.message = '404 Not Found';
      mockApiClient.request.mockRejectedValueOnce(notFoundError);

      // Act
      const result = await fileService.fileExists(
        'testuser',
        'test-repo',
        'non-existent.txt',
        'main'
      );

      // Assert
      expect(result).toBe(false);
    });

    it('should propagate other errors', async () => {
      // Arrange
      mockApiClient.request.mockRejectedValueOnce(new Error('Server Error'));

      // Act & Assert
      await expect(
        fileService.fileExists('testuser', 'test-repo', 'file.txt', 'main')
      ).rejects.toThrow('Server Error');
    });
  });

  describe('createDirectory', () => {
    it('should create a directory by creating a .gitkeep file', async () => {
      // Arrange
      // First call for checking if file exists (should fail with 404)
      const notFoundError = new Error('Not Found');
      notFoundError.message = '404 Not Found';
      mockApiClient.request.mockRejectedValueOnce(notFoundError);

      // Second call for creating the .gitkeep file
      mockApiClient.request.mockResolvedValueOnce({});

      // Act
      await fileService.createDirectory(
        'testuser',
        'test-repo',
        'new-dir',
        'main',
        'Create directory'
      );

      // Assert
      expect(mockApiClient.request).toHaveBeenNthCalledWith(
        2,
        'PUT',
        '/repos/testuser/test-repo/contents/new-dir/.gitkeep',
        expect.objectContaining({
          message: 'Create directory',
          content: expect.any(String),
          branch: 'main',
        })
      );
    });

    it('should handle paths with trailing slashes', async () => {
      // Arrange
      // First call for checking if file exists (should fail with 404)
      const notFoundError = new Error('Not Found');
      notFoundError.message = '404 Not Found';
      mockApiClient.request.mockRejectedValueOnce(notFoundError);

      // Second call for creating the .gitkeep file
      mockApiClient.request.mockResolvedValueOnce({});

      // Act
      await fileService.createDirectory(
        'testuser',
        'test-repo',
        'new-dir/',
        'main',
        'Create directory'
      );

      // Assert
      expect(mockApiClient.request).toHaveBeenNthCalledWith(
        2,
        'PUT',
        '/repos/testuser/test-repo/contents/new-dir/.gitkeep',
        expect.anything()
      );
    });
  });
});
