import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { FileChangeDisplayController } from '../FileChangeDisplayController';
import type { IContentNotificationRenderer } from '../interfaces/ContentUIInterfaces';
import type { MessageHandler } from '../MessageHandler';
import type { FilePreviewService } from '../../services/FilePreviewService';

describe('FileChangeDisplayController', () => {
  let controller: FileChangeDisplayController;
  let mockMessageHandler: MessageHandler;
  let mockFilePreviewService: FilePreviewService;
  let mockNotificationRenderer: IContentNotificationRenderer;

  beforeEach(() => {
    // Create mock dependencies
    mockMessageHandler = {
      sendMessage: jest.fn(),
    } as unknown as MessageHandler;

    mockFilePreviewService = {
      loadProjectFiles: jest.fn().mockResolvedValue(undefined),
      compareWithGitHub: jest.fn(),
      getChangedFiles: jest.fn().mockResolvedValue(new Map()),
    } as unknown as FilePreviewService;

    mockNotificationRenderer = {
      renderNotification: jest.fn(),
      cleanup: jest.fn(),
    };

    // Initialize controller
    controller = new FileChangeDisplayController(
      mockMessageHandler,
      mockFilePreviewService,
      mockNotificationRenderer
    );

    // Mock chrome API
    global.chrome = {
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({}),
        },
        local: {
          set: jest.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as typeof chrome;

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/projects/test-project-id',
      },
      writable: true,
    });

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'group').mockImplementation(() => {});
    jest.spyOn(console, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('displayFileChanges', () => {
    it('should show notifications and load project files', async () => {
      // Act
      await controller.displayFileChanges();

      // Assert
      expect(mockNotificationRenderer.renderNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          message: 'Refreshing and loading project files...',
        })
      );
      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith(true);
    });

    it('should use GitHub comparison when settings are available', async () => {
      // Arrange
      chrome.storage.sync.get = jest.fn().mockResolvedValue({
        repoOwner: 'testOwner',
        projectSettings: {
          'test-project-id': {
            repoName: 'test-repo',
            branch: 'main',
          },
        },
      });

      // Mock dynamic import of GitHubService
      jest.mock(
        '../../services/GitHubService',
        () => ({
          GitHubService: jest.fn().mockImplementation(() => ({
            // GitHubService methods
          })),
        }),
        { virtual: true }
      );

      // Setup comparison result
      const mockChangedFiles = new Map();
      mockChangedFiles.set('file1.txt', { status: 'added', content: 'new content' });
      mockChangedFiles.set('file2.txt', { status: 'modified', content: 'modified content' });

      mockFilePreviewService.compareWithGitHub = jest.fn().mockResolvedValue(mockChangedFiles);

      // Act
      await controller.displayFileChanges();

      // Assert
      expect(mockFilePreviewService.compareWithGitHub).toHaveBeenCalled();
      expect(mockNotificationRenderer.renderNotification).toHaveBeenCalledTimes(2);
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith(
        'OPEN_FILE_CHANGES',
        expect.objectContaining({
          projectId: 'test-project-id',
        })
      );
    });

    it('should fall back to local comparison when GitHub comparison fails', async () => {
      // Arrange
      chrome.storage.sync.get = jest.fn().mockResolvedValue({
        repoOwner: 'testOwner',
        projectSettings: {
          'test-project-id': {
            repoName: 'test-repo',
            branch: 'main',
          },
        },
      });

      // Mock failed GitHub comparison
      mockFilePreviewService.compareWithGitHub = jest
        .fn()
        .mockRejectedValue(new Error('GitHub API failed'));

      // Setup local comparison result
      const mockChangedFiles = new Map();
      mockChangedFiles.set('file1.txt', { status: 'added', content: 'new content' });
      mockFilePreviewService.getChangedFiles = jest.fn().mockResolvedValue(mockChangedFiles);

      // Act
      await controller.displayFileChanges();

      // Assert
      expect(mockFilePreviewService.compareWithGitHub).toHaveBeenCalled();
      expect(mockFilePreviewService.getChangedFiles).toHaveBeenCalled();
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith(
        'OPEN_FILE_CHANGES',
        expect.objectContaining({
          changes: {
            'file1.txt': { status: 'added', content: 'new content' },
          },
        })
      );
    });

    it('should handle error during file changes display', async () => {
      // Arrange
      const testError = new Error('Test error');
      mockFilePreviewService.loadProjectFiles = jest.fn().mockRejectedValue(testError);

      // Act
      await controller.displayFileChanges();

      // Assert
      expect(mockNotificationRenderer.renderNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('Test error'),
        })
      );
    });

    it('should count files by status and display summary', async () => {
      // Arrange
      const mockChangedFiles = new Map();
      mockChangedFiles.set('file1.txt', { status: 'added', content: 'content1' });
      mockChangedFiles.set('file2.txt', { status: 'modified', content: 'content2' });
      mockChangedFiles.set('file3.txt', { status: 'unchanged', content: 'content3' });
      mockChangedFiles.set('file4.txt', { status: 'deleted', content: '' });

      mockFilePreviewService.getChangedFiles = jest.fn().mockResolvedValue(mockChangedFiles);

      // Act
      await controller.displayFileChanges();

      // Assert
      expect(mockNotificationRenderer.renderNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: expect.stringContaining('Found 2 changed files'),
        })
      );

      // Verify the data sent to chrome storage
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        storedFileChanges: expect.objectContaining({
          projectId: 'test-project-id',
          changes: expect.objectContaining({
            'file1.txt': { status: 'added', content: 'content1' },
            'file2.txt': { status: 'modified', content: 'content2' },
            'file3.txt': { status: 'unchanged', content: 'content3' },
            'file4.txt': { status: 'deleted', content: '' },
          }),
        }),
      });
    });
  });

  describe('cleanup', () => {
    it('should not throw any errors', () => {
      // Assert
      expect(() => controller.cleanup()).not.toThrow();
    });
  });
});
