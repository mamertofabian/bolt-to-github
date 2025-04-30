import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { UIManager } from '../UIManager';
import { ContentNotificationRenderer } from '../ContentNotificationRenderer';
import { UploadStatusRenderer } from '../UploadStatusRenderer';
import { GitHubButtonController } from '../GitHubButtonController';
import { FileChangeDisplayController } from '../FileChangeDisplayController';
import { ContentUIElementFactory } from '../ContentUIElementFactory';
import type { MessageHandler } from '../MessageHandler';
import type { NotificationOptions } from '../interfaces/ContentUIInterfaces';
import type { UploadStatusState } from '$lib/types';

// Create mocks for dependencies
jest.mock('../ContentNotificationRenderer');
jest.mock('../UploadStatusRenderer');
jest.mock('../GitHubButtonController');
jest.mock('../FileChangeDisplayController');
jest.mock('../ContentUIElementFactory');

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('UIManager', () => {
  // Mock message handler
  let mockMessageHandler: MessageHandler;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Reset singleton between tests
    UIManager.resetInstance();

    // Create mock message handler
    mockMessageHandler = {
      sendMessage: jest.fn(),
      sendZipData: jest.fn(),
      sendCommitMessage: jest.fn(),
    } as unknown as MessageHandler;

    // Reset constructor mocks
    (ContentUIElementFactory as jest.MockedClass<typeof ContentUIElementFactory>).mockClear();
    (
      ContentNotificationRenderer as jest.MockedClass<typeof ContentNotificationRenderer>
    ).mockClear();
    (UploadStatusRenderer as jest.MockedClass<typeof UploadStatusRenderer>).mockClear();
    (GitHubButtonController as jest.MockedClass<typeof GitHubButtonController>).mockClear();
    (
      FileChangeDisplayController as jest.MockedClass<typeof FileChangeDisplayController>
    ).mockClear();
  });

  afterEach(() => {
    UIManager.resetInstance();
  });

  describe('getInstance', () => {
    it('should initialize UIManager with message handler on first call', () => {
      // Act
      const uiManager = UIManager.getInstance(mockMessageHandler);

      // Assert
      expect(uiManager).toBeInstanceOf(UIManager);
      expect(ContentUIElementFactory).toHaveBeenCalledTimes(1);
      expect(ContentNotificationRenderer).toHaveBeenCalledTimes(1);
      expect(UploadStatusRenderer).toHaveBeenCalledTimes(1);
      expect(GitHubButtonController).toHaveBeenCalledTimes(1);
      expect(FileChangeDisplayController).toHaveBeenCalledTimes(1);
    });

    it('should return existing instance on subsequent calls', () => {
      // Arrange
      const firstInstance = UIManager.getInstance(mockMessageHandler);

      // Act
      const secondInstance = UIManager.getInstance();

      // Assert
      expect(secondInstance).toBe(firstInstance);
      expect(ContentUIElementFactory).toHaveBeenCalledTimes(1);
    });

    it('should throw error if called without message handler when no instance exists', () => {
      // Act & Assert
      expect(() => UIManager.getInstance()).toThrow(
        'UIManager must be initialized with a MessageHandler first'
      );
    });
  });

  describe('initialize', () => {
    it('should explicitly initialize UIManager with message handler', () => {
      // Act
      const uiManager = UIManager.initialize(mockMessageHandler);

      // Assert
      expect(uiManager).toBeInstanceOf(UIManager);
      expect(ContentUIElementFactory).toHaveBeenCalledTimes(1);
    });

    it('should not create new instance if already initialized', () => {
      // Arrange
      const firstInstance = UIManager.initialize(mockMessageHandler);

      // Act
      const secondInstance = UIManager.initialize(mockMessageHandler);

      // Assert
      expect(secondInstance).toBe(firstInstance);
      expect(ContentUIElementFactory).toHaveBeenCalledTimes(1);
    });
  });

  describe('showNotification', () => {
    it('should delegate to NotificationRenderer', () => {
      // Arrange
      const uiManager = UIManager.getInstance(mockMessageHandler);
      const mockRenderer = ContentNotificationRenderer.prototype;
      const options: NotificationOptions = {
        type: 'info',
        message: 'Test notification',
      };

      // Act
      uiManager.showNotification(options);

      // Assert
      expect(mockRenderer.renderNotification).toHaveBeenCalledWith(options);
    });
  });

  describe('updateUploadStatus', () => {
    it('should delegate to UploadStatusRenderer', () => {
      // Arrange
      const uiManager = UIManager.getInstance(mockMessageHandler);
      const mockRenderer = UploadStatusRenderer.prototype;
      const status: UploadStatusState = {
        status: 'uploading',
        progress: 50,
        message: 'Uploading files...',
      };

      // Act
      uiManager.updateUploadStatus(status);

      // Assert
      expect(mockRenderer.renderUploadStatus).toHaveBeenCalledWith(status);
    });

    it('should reset GitHub button when upload is complete', () => {
      // Arrange
      const uiManager = UIManager.getInstance(mockMessageHandler);
      const mockButtonController = GitHubButtonController.prototype;
      const status: UploadStatusState = {
        status: 'success',
        progress: 100,
        message: 'Upload complete',
      };

      // Act
      uiManager.updateUploadStatus(status);

      // Assert
      expect(mockButtonController.updateButtonState).toHaveBeenCalledWith(true);
    });

    it('should not reset GitHub button during upload', () => {
      // Arrange
      const uiManager = UIManager.getInstance(mockMessageHandler);
      const mockButtonController = GitHubButtonController.prototype;
      const status: UploadStatusState = {
        status: 'uploading',
        progress: 50,
        message: 'Uploading files...',
      };

      // Act
      uiManager.updateUploadStatus(status);

      // Assert
      expect(mockButtonController.updateButtonState).not.toHaveBeenCalled();
    });
  });

  describe('handleGitHubPushAction', () => {
    it('should delegate to GitHubButtonController', async () => {
      // Arrange
      const uiManager = UIManager.getInstance(mockMessageHandler);
      const mockButtonController = GitHubButtonController.prototype;

      // Act
      await uiManager.handleGitHubPushAction();

      // Assert
      expect(mockButtonController.handleButtonClick).toHaveBeenCalled();
    });
  });

  describe('handleShowChangedFiles', () => {
    it('should delegate to FileChangeDisplayController', async () => {
      // Arrange
      const uiManager = UIManager.getInstance(mockMessageHandler);
      const mockController = FileChangeDisplayController.prototype;

      // Act
      await uiManager.handleShowChangedFiles();

      // Assert
      expect(mockController.displayFileChanges).toHaveBeenCalled();
    });
  });

  describe('updateButtonState', () => {
    it('should delegate to GitHubButtonController', () => {
      // Arrange
      const uiManager = UIManager.getInstance(mockMessageHandler);
      const mockButtonController = GitHubButtonController.prototype;

      // Act
      uiManager.updateButtonState(true);

      // Assert
      expect(mockButtonController.updateButtonState).toHaveBeenCalledWith(true);
    });
  });

  describe('cleanup', () => {
    it('should call cleanup on all components', () => {
      // Arrange
      const uiManager = UIManager.getInstance(mockMessageHandler);

      // Act
      uiManager.cleanup();

      // Assert
      expect(ContentNotificationRenderer.prototype.cleanup).toHaveBeenCalled();
      expect(UploadStatusRenderer.prototype.cleanup).toHaveBeenCalled();
      expect(GitHubButtonController.prototype.cleanup).toHaveBeenCalled();
      expect(FileChangeDisplayController.prototype.cleanup).toHaveBeenCalled();
    });
  });

  describe('reinitialize', () => {
    it('should clean up and reinitialize UI components', () => {
      // Arrange
      const uiManager = UIManager.getInstance(mockMessageHandler);
      const mockButtonController = GitHubButtonController.prototype;

      // Act
      uiManager.reinitialize();

      // Assert
      expect(ContentNotificationRenderer.prototype.cleanup).toHaveBeenCalled();
      expect(UploadStatusRenderer.prototype.cleanup).toHaveBeenCalled();
      expect(GitHubButtonController.prototype.cleanup).toHaveBeenCalled();
      expect(FileChangeDisplayController.prototype.cleanup).toHaveBeenCalled();
      expect(mockButtonController.initializeButton).toHaveBeenCalled();
    });
  });
});
