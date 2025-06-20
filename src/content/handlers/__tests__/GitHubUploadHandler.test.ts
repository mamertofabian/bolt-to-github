/* eslint-env jest */

import { GitHubUploadHandler } from '../GitHubUploadHandler';
import { SettingsService } from '../../../services/settings';
import { DownloadService } from '../../../services/DownloadService';
import { CommitTemplateService } from '../../services/CommitTemplateService';
import type { MessageHandler } from '../../MessageHandler';
import type { INotificationManager, IUIStateManager } from '../../types/ManagerInterfaces';

// Mock external dependencies
jest.mock('../../../services/settings');
jest.mock('../../../services/DownloadService');
jest.mock('../../services/CommitTemplateService');
jest.mock('../FileChangeHandler', () => ({
  FileChangeHandler: jest.fn().mockImplementation(() => ({
    getChangedFiles: jest.fn(),
  })),
}));

// Create proper mock for MessageHandler
class MockMessageHandler implements Partial<MessageHandler> {
  public port: chrome.runtime.Port | null = null;
  public messageQueue: { type: string; data?: unknown }[] = [];
  public isConnected = true;

  public sendMessage = jest.fn();
  public sendCommitMessage = jest.fn();
  public sendZipData = jest.fn();
  public addListener = jest.fn();
  public updatePort = jest.fn();
  public sendDebugMessage = jest.fn();
  public getConnectionStatus = jest.fn().mockReturnValue({ connected: true, queuedMessages: 0 });
  public clearQueue = jest.fn();
  public setupPortListeners = jest.fn();
}

// Create proper mock for NotificationManager
class MockNotificationManager implements INotificationManager {
  public showNotification = jest.fn();
  public showUpgradeNotification = jest.fn();
  public showConfirmationDialog = jest
    .fn()
    .mockResolvedValue({ confirmed: true, commitMessage: '' });
  public showSettingsNotification = jest.fn();
  public clearReminderNotifications = jest.fn();
  public getReminderNotificationCount = jest.fn().mockReturnValue(0);
  public getNotificationDebugInfo = jest.fn().mockReturnValue({});
  public cleanup = jest.fn();
}

// Create proper mock for StateManager
class MockStateManager implements IUIStateManager {
  public setUploadStatus = jest.fn();
  public setButtonState = jest.fn();
  public setButtonDetectingChanges = jest.fn();
  public setButtonPushing = jest.fn();
  public setButtonLoadingState = jest.fn();
  public resetButtonLoadingState = jest.fn();
  public getState = jest.fn().mockReturnValue({
    uploadStatus: { status: 'idle', progress: 0, message: '' },
    buttonState: { isValid: false, isProcessing: false, isInitialized: false },
    notifications: { active: 0 },
    dropdown: { isVisible: false },
    components: {
      uploadStatusInitialized: false,
      notificationInitialized: false,
      buttonInitialized: false,
    },
  });
}

describe('GitHubUploadHandler', () => {
  let uploadHandler: GitHubUploadHandler;
  let mockMessageHandler: MockMessageHandler;
  let mockNotificationManager: MockNotificationManager;
  let mockStateManager: MockStateManager;
  let mockDownloadService: jest.Mocked<{
    downloadProjectZip: jest.Mock;
    blobToBase64: jest.Mock;
    getProjectFiles: jest.Mock;
  }>;
  let mockCommitTemplateService: jest.Mocked<{
    getTemplateSuggestions: jest.Mock;
    recordTemplateUsage: jest.Mock;
  }>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock objects
    mockMessageHandler = new MockMessageHandler();
    mockNotificationManager = new MockNotificationManager();
    mockStateManager = new MockStateManager();

    // Mock DownloadService
    mockDownloadService = {
      downloadProjectZip: jest.fn(),
      blobToBase64: jest.fn(),
      getProjectFiles: jest.fn(),
    };

    // Mock CommitTemplateService
    mockCommitTemplateService = {
      getTemplateSuggestions: jest.fn().mockResolvedValue([]),
      recordTemplateUsage: jest.fn(),
    };

    // Setup DownloadService mock constructor
    (DownloadService as jest.Mock).mockImplementation(() => mockDownloadService);

    // Setup CommitTemplateService singleton mock
    (CommitTemplateService.getInstance as jest.Mock).mockReturnValue(mockCommitTemplateService);

    uploadHandler = new GitHubUploadHandler(
      mockMessageHandler as unknown as MessageHandler,
      mockNotificationManager,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockStateManager as unknown as any
    );

    // Mock chrome storage
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
      },
    } as unknown as typeof chrome;
  });

  describe('Constructor', () => {
    test('initializes with required dependencies', () => {
      expect(uploadHandler).toBeInstanceOf(GitHubUploadHandler);
      expect(DownloadService).toHaveBeenCalledTimes(1);
      expect(CommitTemplateService.getInstance).toHaveBeenCalled();
    });

    test('can be constructed without state manager', () => {
      const handler = new GitHubUploadHandler(
        mockMessageHandler as unknown as MessageHandler,
        mockNotificationManager
      );
      expect(handler).toBeInstanceOf(GitHubUploadHandler);
    });
  });

  describe('validateSettings', () => {
    test('returns true for valid settings', async () => {
      (SettingsService.getGitHubSettings as jest.Mock).mockResolvedValue({
        isSettingsValid: true,
      });

      const result = await uploadHandler.validateSettings();

      expect(result).toBe(true);
      expect(SettingsService.getGitHubSettings).toHaveBeenCalled();
    });

    test('returns false for invalid settings', async () => {
      (SettingsService.getGitHubSettings as jest.Mock).mockResolvedValue({
        isSettingsValid: false,
      });

      const result = await uploadHandler.validateSettings();

      expect(result).toBe(false);
    });

    test('handles settings service errors', async () => {
      (SettingsService.getGitHubSettings as jest.Mock).mockRejectedValue(
        new Error('Settings error')
      );

      await expect(uploadHandler.validateSettings()).rejects.toThrow('Settings error');
    });
  });

  describe('handleGitHubPushWithFreshComparison', () => {
    test('calls handleGitHubPush with correct parameters', async () => {
      const spy = jest.spyOn(uploadHandler, 'handleGitHubPush').mockResolvedValue();

      await uploadHandler.handleGitHubPushWithFreshComparison();

      expect(spy).toHaveBeenCalledWith(false, true);
    });
  });

  describe('handleGitHubPush', () => {
    beforeEach(() => {
      (SettingsService.getGitHubSettings as jest.Mock).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            repoName: 'test-repo',
            branch: 'main',
          },
        },
      });
    });

    test('shows settings notification when settings are invalid', async () => {
      (SettingsService.getGitHubSettings as jest.Mock).mockResolvedValue({
        isSettingsValid: false,
      });

      await uploadHandler.handleGitHubPush(true, false);

      expect(mockNotificationManager.showSettingsNotification).toHaveBeenCalled();
    });

    test('skips change detection when requested', async () => {
      mockNotificationManager.showConfirmationDialog.mockResolvedValue({
        confirmed: true,
        commitMessage: 'Test commit',
      });

      const proceedSpy = jest
        .spyOn(
          uploadHandler as unknown as { proceedWithUpload: (message: string) => Promise<void> },
          'proceedWithUpload'
        )
        .mockResolvedValue(undefined);

      await uploadHandler.handleGitHubPush(true, true);

      expect(mockStateManager.setButtonDetectingChanges).not.toHaveBeenCalled();
      expect(mockNotificationManager.showConfirmationDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Confirm GitHub Push',
          confirmText: 'Push Changes',
        })
      );
      expect(proceedSpy).toHaveBeenCalledWith('Test commit');
    });

    test('performs change detection when not skipped', async () => {
      // Mock FileChangeHandler
      const mockFileChangeHandler = {
        getChangedFiles: jest.fn().mockResolvedValue(
          new Map([
            ['file1.txt', { status: 'added', path: 'file1.txt' }],
            ['file2.txt', { status: 'modified', path: 'file2.txt' }],
          ])
        ),
      };

      const { FileChangeHandler } = await import('../FileChangeHandler');
      (FileChangeHandler as jest.Mock).mockImplementation(() => mockFileChangeHandler);

      mockNotificationManager.showConfirmationDialog.mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      const proceedSpy = jest
        .spyOn(
          uploadHandler as unknown as { proceedWithUpload: (message?: string) => Promise<void> },
          'proceedWithUpload'
        )
        .mockResolvedValue(undefined);

      await uploadHandler.handleGitHubPush(false, false);

      expect(mockStateManager.setButtonDetectingChanges).toHaveBeenCalled();
      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith({
        type: 'info',
        message: 'Detecting changes before push...',
        duration: 8000,
      });
      expect(mockStateManager.resetButtonLoadingState).toHaveBeenCalled();
      expect(proceedSpy).toHaveBeenCalled();
    });

    test('handles stored file changes', async () => {
      // Mock stored changes
      const storedChanges = new Map([['stored.txt', { status: 'modified', path: 'stored.txt' }]]);
      jest
        .spyOn(
          uploadHandler as unknown as {
            getStoredFileChanges: () => Promise<Map<
              string,
              { status: string; path: string }
            > | null>;
          },
          'getStoredFileChanges'
        )
        .mockResolvedValue(storedChanges);

      mockNotificationManager.showConfirmationDialog.mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      const proceedSpy = jest
        .spyOn(
          uploadHandler as unknown as { proceedWithUpload: (message?: string) => Promise<void> },
          'proceedWithUpload'
        )
        .mockResolvedValue(undefined);

      await uploadHandler.handleGitHubPush(true, false);

      expect(mockNotificationManager.showConfirmationDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Found changes: 1 modified file(s)'),
        })
      );
      expect(proceedSpy).toHaveBeenCalled();
    });

    test('handles no changes detected', async () => {
      jest
        .spyOn(
          uploadHandler as unknown as {
            getStoredFileChanges: () => Promise<Map<
              string,
              { status: string; path: string }
            > | null>;
          },
          'getStoredFileChanges'
        )
        .mockResolvedValue(null);

      // Mock FileChangeHandler returning no changes
      const mockFileChangeHandler = {
        getChangedFiles: jest.fn().mockResolvedValue(new Map()),
      };

      const { FileChangeHandler } = await import('../FileChangeHandler');
      (FileChangeHandler as jest.Mock).mockImplementation(() => mockFileChangeHandler);

      mockNotificationManager.showConfirmationDialog.mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      const proceedSpy = jest
        .spyOn(
          uploadHandler as unknown as { proceedWithUpload: (message?: string) => Promise<void> },
          'proceedWithUpload'
        )
        .mockResolvedValue(undefined);

      await uploadHandler.handleGitHubPush(false, false);

      expect(mockNotificationManager.showConfirmationDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'No Changes - Confirm Push',
          message: expect.stringContaining('No changes detected'),
          confirmText: 'Push Anyway',
          type: 'warning',
        })
      );
      expect(proceedSpy).toHaveBeenCalled();
    });

    test('aborts when user cancels confirmation (skip change detection)', async () => {
      mockNotificationManager.showConfirmationDialog.mockResolvedValue({
        confirmed: false,
        commitMessage: '',
      });

      const proceedSpy = jest
        .spyOn(
          uploadHandler as unknown as { proceedWithUpload: (message?: string) => Promise<void> },
          'proceedWithUpload'
        )
        .mockResolvedValue(undefined);

      await uploadHandler.handleGitHubPush(true, true);

      expect(proceedSpy).not.toHaveBeenCalled();
      // Skip change detection path doesn't call resetButtonLoadingState when cancelling
      // because the button detecting state wasn't set in this path
    });

    test('aborts when user cancels confirmation (with change detection)', async () => {
      jest
        .spyOn(
          uploadHandler as unknown as {
            getStoredFileChanges: () => Promise<Map<
              string,
              { status: string; path: string }
            > | null>;
          },
          'getStoredFileChanges'
        )
        .mockResolvedValue(null);

      // Mock FileChangeHandler returning no changes
      const mockFileChangeHandler = {
        getChangedFiles: jest.fn().mockResolvedValue(new Map()),
      };

      const { FileChangeHandler } = await import('../FileChangeHandler');
      (FileChangeHandler as jest.Mock).mockImplementation(() => mockFileChangeHandler);

      mockNotificationManager.showConfirmationDialog.mockResolvedValue({
        confirmed: false,
        commitMessage: '',
      });

      const proceedSpy = jest
        .spyOn(
          uploadHandler as unknown as { proceedWithUpload: (message?: string) => Promise<void> },
          'proceedWithUpload'
        )
        .mockResolvedValue(undefined);

      await uploadHandler.handleGitHubPush(false, false);

      expect(proceedSpy).not.toHaveBeenCalled();
      expect(mockStateManager.resetButtonLoadingState).toHaveBeenCalled();
    });

    test('records commit template usage', async () => {
      const commitMessage = 'feat: add new feature';
      mockNotificationManager.showConfirmationDialog.mockResolvedValue({
        confirmed: true,
        commitMessage,
      });

      const proceedSpy = jest
        .spyOn(
          uploadHandler as unknown as { proceedWithUpload: (message: string) => Promise<void> },
          'proceedWithUpload'
        )
        .mockResolvedValue(undefined);

      await uploadHandler.handleGitHubPush(true, true);

      expect(mockCommitTemplateService.recordTemplateUsage).toHaveBeenCalledWith(commitMessage);
      expect(proceedSpy).toHaveBeenCalledWith(commitMessage);
    });

    test('handles change detection errors gracefully', async () => {
      jest
        .spyOn(
          uploadHandler as unknown as {
            getStoredFileChanges: () => Promise<Map<
              string,
              { status: string; path: string }
            > | null>;
          },
          'getStoredFileChanges'
        )
        .mockResolvedValue(null);

      // Mock FileChangeHandler throwing error
      const mockFileChangeHandler = {
        getChangedFiles: jest.fn().mockRejectedValue(new Error('Detection failed')),
      };

      const { FileChangeHandler } = await import('../FileChangeHandler');
      (FileChangeHandler as jest.Mock).mockImplementation(() => mockFileChangeHandler);

      mockNotificationManager.showConfirmationDialog.mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      const proceedSpy = jest
        .spyOn(
          uploadHandler as unknown as { proceedWithUpload: (message?: string) => Promise<void> },
          'proceedWithUpload'
        )
        .mockResolvedValue(undefined);

      await uploadHandler.handleGitHubPush(false, false);

      expect(mockNotificationManager.showConfirmationDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Unable to detect changes'),
        })
      );
      expect(proceedSpy).toHaveBeenCalled();
    });
  });

  describe('proceedWithUpload', () => {
    test('handles successful upload process', async () => {
      const commitMessage = 'Test commit message';
      const mockBlob = new Blob(['test'], { type: 'application/zip' });
      const mockBase64 = 'base64data';

      mockDownloadService.downloadProjectZip.mockResolvedValue(mockBlob);
      mockDownloadService.blobToBase64.mockResolvedValue(mockBase64);

      await (
        uploadHandler as unknown as { proceedWithUpload: (message: string) => Promise<void> }
      ).proceedWithUpload(commitMessage);

      expect(mockStateManager.setButtonPushing).toHaveBeenCalled();
      expect(mockMessageHandler.sendCommitMessage).toHaveBeenCalledWith(commitMessage);
      expect(mockStateManager.setUploadStatus).toHaveBeenCalledWith({
        status: 'uploading',
        progress: 5,
        message: 'Downloading project files...',
      });
      expect(mockDownloadService.downloadProjectZip).toHaveBeenCalled();
      expect(mockDownloadService.blobToBase64).toHaveBeenCalledWith(mockBlob);
      expect(mockMessageHandler.sendZipData).toHaveBeenCalledWith(mockBase64, undefined);
    });

    test('uses default commit message when none provided', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/zip' });
      mockDownloadService.downloadProjectZip.mockResolvedValue(mockBlob);
      mockDownloadService.blobToBase64.mockResolvedValue('base64data');

      await (
        uploadHandler as unknown as { proceedWithUpload: (message?: string) => Promise<void> }
      ).proceedWithUpload();

      expect(mockMessageHandler.sendCommitMessage).toHaveBeenCalledWith(
        'Commit from Bolt to GitHub'
      );
    });

    test('handles upload errors', async () => {
      const error = new Error('Upload failed');
      mockDownloadService.downloadProjectZip.mockRejectedValue(error);
      // Mock getProjectFiles to also fail for cached files fallback
      mockDownloadService.getProjectFiles.mockResolvedValue(new Map());

      await (
        uploadHandler as unknown as { proceedWithUpload: (message: string) => Promise<void> }
      ).proceedWithUpload('Test commit');

      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to download project: No cached files available and download failed',
        duration: 5000,
      });
      expect(mockStateManager.resetButtonLoadingState).toHaveBeenCalled();
    });

    test('handles blob to base64 conversion failure', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/zip' });
      mockDownloadService.downloadProjectZip.mockResolvedValue(mockBlob);
      mockDownloadService.blobToBase64.mockResolvedValue(null);
      // Mock getProjectFiles to also fail for cached files fallback
      mockDownloadService.getProjectFiles.mockResolvedValue(new Map());

      await (
        uploadHandler as unknown as { proceedWithUpload: (message: string) => Promise<void> }
      ).proceedWithUpload('Test commit');

      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to download project: No cached files available and download failed',
        duration: 5000,
      });
    });
  });

  describe('handleFileDownloadAndUpload', () => {
    test('successfully downloads and uploads files', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/zip' });
      const mockBase64 = 'base64data';

      mockDownloadService.downloadProjectZip.mockResolvedValue(mockBlob);
      mockDownloadService.blobToBase64.mockResolvedValue(mockBase64);

      await (
        uploadHandler as unknown as { handleFileDownloadAndUpload: () => Promise<void> }
      ).handleFileDownloadAndUpload();

      expect(mockDownloadService.downloadProjectZip).toHaveBeenCalled();
      expect(mockDownloadService.blobToBase64).toHaveBeenCalledWith(mockBlob);
      expect(mockMessageHandler.sendZipData).toHaveBeenCalledWith(mockBase64, undefined);
    });

    test('falls back to cached files on download failure', async () => {
      mockDownloadService.downloadProjectZip.mockRejectedValue(new Error('Download failed'));

      const fallbackSpy = jest
        .spyOn(
          uploadHandler as unknown as { handleCachedFilesFallback: () => Promise<void> },
          'handleCachedFilesFallback'
        )
        .mockResolvedValue(undefined);

      await (
        uploadHandler as unknown as { handleFileDownloadAndUpload: () => Promise<void> }
      ).handleFileDownloadAndUpload();

      expect(fallbackSpy).toHaveBeenCalled();
    });
  });

  describe('handleCachedFilesFallback', () => {
    test('uses cached files when available', async () => {
      const mockFiles = new Map([
        ['file1.txt', 'content1'],
        ['file2.txt', 'content2'],
      ]);

      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await (
        uploadHandler as unknown as { handleCachedFilesFallback: () => Promise<void> }
      ).handleCachedFilesFallback();

      expect(mockStateManager.setUploadStatus).toHaveBeenCalledWith({
        status: 'uploading',
        progress: 5,
        message: 'Using cached project files...',
      });
      expect(mockDownloadService.getProjectFiles).toHaveBeenCalledWith(false);
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('USE_CACHED_FILES', {
        files: Object.fromEntries(mockFiles),
      });
    });

    test('throws error when no cached files available', async () => {
      mockDownloadService.getProjectFiles.mockResolvedValue(new Map());

      await expect(
        (
          uploadHandler as unknown as { handleCachedFilesFallback: () => Promise<void> }
        ).handleCachedFilesFallback()
      ).rejects.toThrow('No cached files available and download failed');
    });

    test('throws error when cached files is null', async () => {
      mockDownloadService.getProjectFiles.mockResolvedValue(null as unknown as Map<string, string>);

      await expect(
        (
          uploadHandler as unknown as { handleCachedFilesFallback: () => Promise<void> }
        ).handleCachedFilesFallback()
      ).rejects.toThrow('No cached files available and download failed');
    });
  });

  describe('getProjectInfo', () => {
    test('returns project info for valid settings', async () => {
      (SettingsService.getGitHubSettings as jest.Mock).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            repoName: 'test-repo',
            branch: 'main',
          },
        },
      });

      const result = await uploadHandler.getProjectInfo();

      expect(result).toEqual({
        repoName: 'test-repo',
        branch: 'main',
      });
    });

    test('returns null for invalid settings', async () => {
      (SettingsService.getGitHubSettings as jest.Mock).mockResolvedValue({
        isSettingsValid: false,
      });

      const result = await uploadHandler.getProjectInfo();

      expect(result).toBeNull();
    });

    test('returns null when project settings missing', async () => {
      (SettingsService.getGitHubSettings as jest.Mock).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {},
      });

      const result = await uploadHandler.getProjectInfo();

      expect(result).toBeNull();
    });
  });

  describe('getStoredFileChanges', () => {
    beforeEach(() => {
      // Mock window.location
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/project/test-project',
          href: 'https://example.com/project/test-project',
        },
        writable: true,
      });
    });

    test('returns valid stored changes', async () => {
      const mockStoredData = {
        changes: {
          'file1.txt': { status: 'modified', path: 'file1.txt' },
        },
        timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
        projectId: 'test-project',
        url: 'https://example.com/project/test-project',
      };

      (global.chrome.storage.local.get as jest.Mock).mockResolvedValue({
        storedFileChanges: mockStoredData,
      });

      const result = await (
        uploadHandler as unknown as {
          getStoredFileChanges: () => Promise<Map<string, { status: string; path: string }> | null>;
        }
      ).getStoredFileChanges();

      expect(result).toBeInstanceOf(Map);
      expect(result?.size).toBe(1);
      expect(result?.get('file1.txt')).toEqual({ status: 'modified', path: 'file1.txt' });
    });

    test('returns null when no stored data', async () => {
      (global.chrome.storage.local.get as jest.Mock).mockResolvedValue({});

      const result = await (
        uploadHandler as unknown as {
          getStoredFileChanges: () => Promise<Map<string, { status: string; path: string }> | null>;
        }
      ).getStoredFileChanges();

      expect(result).toBeNull();
    });

    test('clears and returns null for different project', async () => {
      const mockStoredData = {
        changes: { 'file1.txt': { status: 'modified', path: 'file1.txt' } },
        timestamp: Date.now() - 5 * 60 * 1000,
        projectId: 'different-project',
        url: 'https://example.com/project/test-project',
      };

      (global.chrome.storage.local.get as jest.Mock).mockResolvedValue({
        storedFileChanges: mockStoredData,
      });

      const clearSpy = jest
        .spyOn(
          uploadHandler as unknown as { clearStoredFileChanges: () => Promise<void> },
          'clearStoredFileChanges'
        )
        .mockResolvedValue(undefined);

      const result = await (
        uploadHandler as unknown as {
          getStoredFileChanges: () => Promise<Map<string, { status: string; path: string }> | null>;
        }
      ).getStoredFileChanges();

      expect(result).toBeNull();
      expect(clearSpy).toHaveBeenCalled();
    });

    test('clears and returns null for different URL', async () => {
      const mockStoredData = {
        changes: { 'file1.txt': { status: 'modified', path: 'file1.txt' } },
        timestamp: Date.now() - 5 * 60 * 1000,
        projectId: 'test-project',
        url: 'https://example.com/different-url',
      };

      (global.chrome.storage.local.get as jest.Mock).mockResolvedValue({
        storedFileChanges: mockStoredData,
      });

      const clearSpy = jest
        .spyOn(
          uploadHandler as unknown as { clearStoredFileChanges: () => Promise<void> },
          'clearStoredFileChanges'
        )
        .mockResolvedValue(undefined);

      const result = await (
        uploadHandler as unknown as {
          getStoredFileChanges: () => Promise<Map<string, { status: string; path: string }> | null>;
        }
      ).getStoredFileChanges();

      expect(result).toBeNull();
      expect(clearSpy).toHaveBeenCalled();
    });

    test('clears and returns null for expired changes', async () => {
      const mockStoredData = {
        changes: { 'file1.txt': { status: 'modified', path: 'file1.txt' } },
        timestamp: Date.now() - 15 * 60 * 1000, // 15 minutes ago (expired)
        projectId: 'test-project',
        url: 'https://example.com/project/test-project',
      };

      (global.chrome.storage.local.get as jest.Mock).mockResolvedValue({
        storedFileChanges: mockStoredData,
      });

      const clearSpy = jest
        .spyOn(
          uploadHandler as unknown as { clearStoredFileChanges: () => Promise<void> },
          'clearStoredFileChanges'
        )
        .mockResolvedValue(undefined);

      const result = await (
        uploadHandler as unknown as {
          getStoredFileChanges: () => Promise<Map<string, { status: string; path: string }> | null>;
        }
      ).getStoredFileChanges();

      expect(result).toBeNull();
      expect(clearSpy).toHaveBeenCalled();
    });

    test('handles storage errors gracefully', async () => {
      (global.chrome.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await (
        uploadHandler as unknown as {
          getStoredFileChanges: () => Promise<Map<string, { status: string; path: string }> | null>;
        }
      ).getStoredFileChanges();

      expect(result).toBeNull();
    });
  });

  describe('clearStoredFileChanges', () => {
    test('removes stored file changes', async () => {
      await (
        uploadHandler as unknown as { clearStoredFileChanges: () => Promise<void> }
      ).clearStoredFileChanges();

      expect(global.chrome.storage.local.remove).toHaveBeenCalledWith(['storedFileChanges']);
    });

    test('handles storage errors gracefully', async () => {
      (global.chrome.storage.local.remove as jest.Mock).mockRejectedValue(
        new Error('Storage error')
      );

      await expect(
        (
          uploadHandler as unknown as { clearStoredFileChanges: () => Promise<void> }
        ).clearStoredFileChanges()
      ).resolves.toBeUndefined();
    });
  });

  describe('isUploadInProgress', () => {
    test('returns false by default', () => {
      const result = uploadHandler.isUploadInProgress();
      expect(result).toBe(false);
    });
  });

  describe('updateUploadStatus', () => {
    test('updates status through state manager', () => {
      const status = { status: 'uploading', progress: 50 };

      (
        uploadHandler as unknown as {
          updateUploadStatus: (status: { status: string; progress: number }) => void;
        }
      ).updateUploadStatus(status);

      expect(mockStateManager.setUploadStatus).toHaveBeenCalledWith(status);
    });

    test('handles missing state manager gracefully', () => {
      const handlerWithoutStateManager = new GitHubUploadHandler(
        mockMessageHandler as unknown as MessageHandler,
        mockNotificationManager
      );

      expect(() => {
        (
          handlerWithoutStateManager as unknown as {
            updateUploadStatus: (status: { status: string }) => void;
          }
        ).updateUploadStatus({ status: 'uploading' });
      }).not.toThrow();
    });
  });
});
