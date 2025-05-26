/* eslint-env jest */

import { FileChangeHandler } from '../FileChangeHandler';
import type { INotificationManager, IUploadStatusManager } from '../../types/ManagerInterfaces';
import type { MessageHandler } from '../../MessageHandler';
import type { PremiumService } from '../../services/PremiumService';
import { FilePreviewService, type FileChange } from '../../../services/FilePreviewService';

// Mock external dependencies
jest.mock('../../../services/FilePreviewService');
jest.mock('../../../services/GitHubService', () => ({
  GitHubService: jest.fn().mockImplementation(() => ({
    // Mock GitHubService methods if needed
  })),
}));

// Mock chrome APIs
const mockChromeStorage = {
  sync: {
    get: jest.fn(),
  },
  local: {
    set: jest.fn(),
  },
};

const mockChromeTabsCreate = jest.fn();

(global as any).chrome = {
  storage: mockChromeStorage,
  tabs: {
    create: mockChromeTabsCreate,
  },
};

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/project/test-project-123',
    href: 'https://bolt.new/project/test-project-123',
  },
  writable: true,
});

// Mock window.open
(global as any).window.open = jest.fn();

// Mock performance.now
Object.defineProperty(global, 'performance', {
  value: {
    now: jest.fn(() => 1000),
  },
});

describe('FileChangeHandler', () => {
  let fileChangeHandler: FileChangeHandler;
  let mockMessageHandler: jest.Mocked<MessageHandler>;
  let mockNotificationManager: jest.Mocked<INotificationManager>;
  let mockUploadStatusManager: jest.Mocked<IUploadStatusManager>;
  let mockPremiumService: jest.Mocked<PremiumService>;
  let mockFilePreviewService: jest.Mocked<FilePreviewService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock dependencies
    mockMessageHandler = {
      sendMessage: jest.fn(),
    } as any;

    mockNotificationManager = {
      showNotification: jest.fn(),
      showUpgradeNotification: jest.fn(),
    } as any;

    mockUploadStatusManager = {
      updateStatus: jest.fn(),
    } as any;

    mockPremiumService = {
      canUseFileChanges: jest.fn(),
      useFileChanges: jest.fn(),
    } as any;

    // Mock FilePreviewService
    mockFilePreviewService = {
      loadProjectFiles: jest.fn(),
      getChangedFiles: jest.fn(),
      compareWithGitHub: jest.fn(),
      getProcessedFiles: jest.fn(),
    } as any;

    (FilePreviewService.getInstance as jest.Mock).mockReturnValue(mockFilePreviewService);

    // Reset chrome storage mocks
    mockChromeStorage.sync.get.mockResolvedValue({});
    mockChromeStorage.local.set.mockResolvedValue(undefined);
    mockChromeTabsCreate.mockResolvedValue(undefined);

    // Reset window.open mock
    (window.open as jest.Mock).mockReturnValue(null);

    // Reset performance.now mock
    (performance.now as jest.Mock).mockReturnValue(1000);

    // Reset window.location mock to the default test project
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/project/test-project-123',
        href: 'https://bolt.new/project/test-project-123',
      },
      writable: true,
    });
  });

  describe('Constructor', () => {
    it('should initialize with required dependencies', () => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);

      expect(fileChangeHandler).toBeInstanceOf(FileChangeHandler);
      expect(FilePreviewService.getInstance).toHaveBeenCalled();
    });

    it('should initialize with optional upload status manager', () => {
      fileChangeHandler = new FileChangeHandler(
        mockMessageHandler,
        mockNotificationManager,
        mockUploadStatusManager
      );

      expect(fileChangeHandler).toBeInstanceOf(FileChangeHandler);
    });
  });

  describe('setPremiumService', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);
    });

    it('should set premium service reference', () => {
      fileChangeHandler.setPremiumService(mockPremiumService);

      // Test by calling a method that uses premium service
      expect(() => fileChangeHandler.setPremiumService(mockPremiumService)).not.toThrow();
    });
  });

  describe('setUploadStatusManager', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);
    });

    it('should set upload status manager reference', () => {
      fileChangeHandler.setUploadStatusManager(mockUploadStatusManager);

      // Test by calling a method that uses upload status manager
      expect(() => fileChangeHandler.setUploadStatusManager(mockUploadStatusManager)).not.toThrow();
    });
  });

  describe('loadProjectFiles', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);
    });

    it('should load project files without force refresh', async () => {
      await fileChangeHandler.loadProjectFiles();

      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith(undefined);
    });

    it('should load project files with force refresh', async () => {
      await fileChangeHandler.loadProjectFiles(true);

      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith(true);
    });

    it('should load project files with explicit false for force refresh', async () => {
      await fileChangeHandler.loadProjectFiles(false);

      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith(false);
    });
  });

  describe('getCurrentProjectId', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);
    });

    it('should extract project ID from URL pathname', () => {
      const projectId = fileChangeHandler.getCurrentProjectId();

      expect(projectId).toBe('test-project-123');
    });

    it('should return empty string for root path', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/' },
        writable: true,
      });

      const projectId = fileChangeHandler.getCurrentProjectId();

      expect(projectId).toBe('');
    });

    it('should return empty string for empty path', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '' },
        writable: true,
      });

      const projectId = fileChangeHandler.getCurrentProjectId();

      expect(projectId).toBe('');
    });
  });

  describe('getChangedFiles', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);
    });

    it('should get changed files without force refresh', async () => {
      const mockChanges = new Map([
        ['file1.js', { path: 'file1.js', status: 'modified' as const, content: 'content1' }],
      ]);

      // Mock the private method behavior
      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );

      const result = await fileChangeHandler.getChangedFiles();

      // loadProjectFiles is called internally by getChangedFilesForNonExistentRepo
      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith();
      expect(result).toBeInstanceOf(Map);
    });

    it('should get changed files with force refresh', async () => {
      const mockChanges = new Map([
        ['file1.js', { path: 'file1.js', status: 'modified' as const, content: 'content1' }],
      ]);

      // Mock the private method behavior
      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );

      const result = await fileChangeHandler.getChangedFiles(true);

      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith(true);
      expect(result).toBeInstanceOf(Map);
    });
  });

  describe('showChangedFiles', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(
        mockMessageHandler,
        mockNotificationManager,
        mockUploadStatusManager
      );
      fileChangeHandler.setPremiumService(mockPremiumService);
    });

    it('should show premium required notification when premium service is not available', async () => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);

      await fileChangeHandler.showChangedFiles();

      expect(mockNotificationManager.showUpgradeNotification).toHaveBeenCalledWith({
        type: 'info',
        message:
          '🔒 File changes comparison is a Pro feature. Upgrade to view detailed file changes and comparisons!',
        duration: 10000,
        upgradeText: 'Upgrade Now',
        onUpgrade: expect.any(Function),
      });
    });

    it('should show premium required notification when usage is not allowed', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: false });

      await fileChangeHandler.showChangedFiles();

      expect(mockPremiumService.canUseFileChanges).toHaveBeenCalled();
      expect(mockNotificationManager.showUpgradeNotification).toHaveBeenCalled();
    });

    it('should successfully show changed files with upload status manager', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      // Mock the comparison behavior
      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([
          ['file1.js', 'content1'],
          ['file2.js', 'content2'],
        ])
      );

      await fileChangeHandler.showChangedFiles();

      expect(mockPremiumService.canUseFileChanges).toHaveBeenCalled();
      expect(mockPremiumService.useFileChanges).toHaveBeenCalled();
      expect(mockUploadStatusManager.updateStatus).toHaveBeenCalledWith({
        status: 'loading',
        message: 'Loading project files...',
        progress: 10,
      });
      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith(true);
      expect(mockUploadStatusManager.updateStatus).toHaveBeenCalledWith({
        status: 'analyzing',
        message: 'Comparing files with GitHub repository...',
        progress: 60,
      });
    });

    it('should successfully show changed files without upload status manager', async () => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);
      fileChangeHandler.setPremiumService(mockPremiumService);

      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      // Mock the comparison behavior
      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );

      await fileChangeHandler.showChangedFiles();

      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith({
        type: 'info',
        message: 'Loading project files...',
        duration: 10000,
      });
      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith({
        type: 'info',
        message: 'Comparing files with GitHub repository...',
        duration: 8000,
      });
    });

    it('should handle GitHub comparison with valid settings', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      // Mock GitHub settings
      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: 'testowner',
        projectSettings: {
          'test-project-123': {
            repoName: 'test-repo',
            branch: 'main',
          },
        },
        githubToken: 'test-token',
      });

      const mockChanges = new Map([
        ['file1.js', { path: 'file1.js', status: 'modified' as const, content: 'content1' }],
      ]);
      mockFilePreviewService.compareWithGitHub.mockResolvedValue(mockChanges);

      await fileChangeHandler.showChangedFiles();

      expect(mockFilePreviewService.compareWithGitHub).toHaveBeenCalledWith(
        'testowner',
        'test-repo',
        'main',
        expect.any(Object)
      );
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_FILE_CHANGES', {
        changes: { 'file1.js': { path: 'file1.js', status: 'modified', content: 'content1' } },
        projectId: 'test-project-123',
      });
    });

    it('should handle GitHub 404 error by treating files as new', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);

      // Mock GitHub settings
      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: 'testowner',
        projectSettings: {
          'test-project-123': {
            repoName: 'test-repo',
            branch: 'main',
          },
        },
        githubToken: 'test-token',
      });

      // Mock 404 error from GitHub
      const error404 = new Error('Repository not found (404)');
      mockFilePreviewService.compareWithGitHub.mockRejectedValue(error404);

      // Mock the calls inside getChangedFilesForNonExistentRepo
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );

      await fileChangeHandler.showChangedFiles();

      expect(mockFilePreviewService.getProcessedFiles).toHaveBeenCalled();
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_FILE_CHANGES', {
        changes: { 'file1.js': { path: 'file1.js', status: 'added', content: 'content1' } },
        projectId: 'test-project-123',
      });
    });

    it('should handle non-404 GitHub errors by falling back to local comparison', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      // Mock GitHub settings
      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: 'testowner',
        projectSettings: {
          'test-project-123': {
            repoName: 'test-repo',
            branch: 'main',
          },
        },
        githubToken: 'test-token',
      });

      // Mock network error from GitHub
      const networkError = new Error('Network error');
      mockFilePreviewService.compareWithGitHub.mockRejectedValue(networkError);

      const mockLocalChanges = new Map([
        ['file1.js', { path: 'file1.js', status: 'modified' as const, content: 'content1' }],
      ]);
      mockFilePreviewService.getChangedFiles.mockResolvedValue(mockLocalChanges);

      await fileChangeHandler.showChangedFiles();

      expect(mockFilePreviewService.getChangedFiles).toHaveBeenCalled();
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_FILE_CHANGES', {
        changes: { 'file1.js': { path: 'file1.js', status: 'modified', content: 'content1' } },
        projectId: 'test-project-123',
      });
    });

    it('should handle missing GitHub settings by treating files as new', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);

      // Mock no GitHub settings
      mockChromeStorage.sync.get.mockResolvedValue({});

      // Mock the calls inside getChangedFilesForNonExistentRepo
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );

      await fileChangeHandler.showChangedFiles();

      expect(mockFilePreviewService.getProcessedFiles).toHaveBeenCalled();
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_FILE_CHANGES', {
        changes: { 'file1.js': { path: 'file1.js', status: 'added', content: 'content1' } },
        projectId: 'test-project-123',
      });
    });

    it('should store changes in local storage', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );

      await fileChangeHandler.showChangedFiles();

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        storedFileChanges: {
          projectId: 'test-project-123',
          changes: { 'file1.js': { path: 'file1.js', status: 'added', content: 'content1' } },
          timestamp: expect.any(Number),
          url: 'https://bolt.new/project/test-project-123',
        },
      });
    });

    it('should handle storage errors gracefully', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );
      mockChromeStorage.local.set.mockRejectedValue(new Error('Storage error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await fileChangeHandler.showChangedFiles();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to store file changes in local storage:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should handle errors during file processing', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);

      const error = new Error('File processing error');
      mockFilePreviewService.loadProjectFiles.mockRejectedValue(error);

      await fileChangeHandler.showChangedFiles();

      expect(mockUploadStatusManager.updateStatus).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to show changed files: File processing error',
        progress: 100,
      });
    });

    it('should handle errors without upload status manager', async () => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);
      fileChangeHandler.setPremiumService(mockPremiumService);

      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);

      const error = new Error('File processing error');
      mockFilePreviewService.loadProjectFiles.mockRejectedValue(error);

      await fileChangeHandler.showChangedFiles();

      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to show changed files: File processing error',
        duration: 5000,
      });
    });

    it('should show completion status with file counts', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([
          ['file1.js', 'content1'],
          ['file2.js', 'content2'],
        ])
      );

      await fileChangeHandler.showChangedFiles();

      expect(mockUploadStatusManager.updateStatus).toHaveBeenCalledWith({
        status: 'complete',
        message: 'Found 2 changed files. Opening file changes view...',
        progress: 100,
      });
    });
  });

  describe('Premium upgrade notification', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);
    });

    it('should open upgrade URL when upgrade button is clicked', async () => {
      await fileChangeHandler.showChangedFiles();

      // Get the onUpgrade callback
      const upgradeCall = mockNotificationManager.showUpgradeNotification.mock.calls[0][0];
      const onUpgrade = upgradeCall.onUpgrade;

      // Call the upgrade function
      onUpgrade?.();

      expect(window.open).toHaveBeenCalledWith('https://bolt2github.com/upgrade', '_blank');
    });

    it('should fallback to chrome tabs API when window.open fails', async () => {
      (window.open as jest.Mock).mockImplementation(() => {
        throw new Error('Window open failed');
      });

      await fileChangeHandler.showChangedFiles();

      // Get the onUpgrade callback
      const upgradeCall = mockNotificationManager.showUpgradeNotification.mock.calls[0][0];
      const onUpgrade = upgradeCall.onUpgrade;

      // Call the upgrade function
      onUpgrade?.();

      expect(mockChromeTabsCreate).toHaveBeenCalledWith({ url: 'https://bolt2github.com/upgrade' });
    });

    it('should handle both window.open and chrome tabs API failures gracefully', async () => {
      (window.open as jest.Mock).mockImplementation(() => {
        throw new Error('Window open failed');
      });
      mockChromeTabsCreate.mockImplementation(() => {
        throw new Error('Chrome tabs failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await fileChangeHandler.showChangedFiles();

      // Get the onUpgrade callback
      const upgradeCall = mockNotificationManager.showUpgradeNotification.mock.calls[0][0];
      const onUpgrade = upgradeCall.onUpgrade;

      // Call the upgrade function
      onUpgrade?.();

      expect(consoleSpy).toHaveBeenCalledWith('❌ Could not open upgrade URL:', expect.any(Error));
      expect(consoleSpy).toHaveBeenCalledWith('❌ Chrome tabs API also failed:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('File status counting and logging', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(
        mockMessageHandler,
        mockNotificationManager,
        mockUploadStatusManager
      );
      fileChangeHandler.setPremiumService(mockPremiumService);
    });

    it('should correctly count and log files with different statuses', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([
          ['added.js', 'content1'],
          ['modified.js', 'content2'],
          ['unchanged.js', 'content3'],
        ])
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleGroupSpy = jest.spyOn(console, 'group').mockImplementation();
      const consoleGroupEndSpy = jest.spyOn(console, 'groupEnd').mockImplementation();

      await fileChangeHandler.showChangedFiles();

      expect(consoleGroupSpy).toHaveBeenCalledWith('Changed Files');
      expect(consoleSpy).toHaveBeenCalledWith('Change Summary:');
      expect(consoleSpy).toHaveBeenCalledWith('- Total files: 3');
      expect(consoleSpy).toHaveBeenCalledWith('- Added: 3');
      expect(consoleSpy).toHaveBeenCalledWith('- Modified: 0');
      expect(consoleSpy).toHaveBeenCalledWith('- Unchanged: 0');
      expect(consoleSpy).toHaveBeenCalledWith('- Deleted: 0');
      expect(consoleGroupEndSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      consoleGroupSpy.mockRestore();
      consoleGroupEndSpy.mockRestore();
    });

    it('should skip directory entries when processing files', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([
          ['src/', ''], // Directory entry
          ['src/file.js', 'content1'], // File entry
          ['empty.txt', ''], // Empty file
        ])
      );

      await fileChangeHandler.showChangedFiles();

      // Should only process the actual file, not the directory or empty file
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_FILE_CHANGES', {
        changes: { 'src/file.js': { path: 'src/file.js', status: 'added', content: 'content1' } },
        projectId: 'test-project-123',
      });
    });
  });

  describe('Performance tracking', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(
        mockMessageHandler,
        mockNotificationManager,
        mockUploadStatusManager
      );
      fileChangeHandler.setPremiumService(mockPremiumService);
    });

    it('should track and log file loading performance', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      // Mock performance timing
      let callCount = 0;
      (performance.now as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 1000 : 1250; // 250ms difference
      });

      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(new Map());

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await fileChangeHandler.showChangedFiles();

      expect(consoleSpy).toHaveBeenCalledWith('Files loaded in 250.00ms');
      consoleSpy.mockRestore();
    });
  });

  describe('Edge cases and error handling', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(
        mockMessageHandler,
        mockNotificationManager,
        mockUploadStatusManager
      );
      fileChangeHandler.setPremiumService(mockPremiumService);
    });

    it('should handle unknown error types gracefully', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);

      // Throw a non-Error object
      mockFilePreviewService.loadProjectFiles.mockRejectedValue('String error');

      await fileChangeHandler.showChangedFiles();

      expect(mockUploadStatusManager.updateStatus).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to show changed files: Unknown error',
        progress: 100,
      });
    });

    it('should handle missing project settings gracefully', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      // Mock partial GitHub settings (missing project settings)
      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: 'testowner',
        // projectSettings is missing
      });
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(new Map());

      await fileChangeHandler.showChangedFiles();

      expect(mockFilePreviewService.getProcessedFiles).toHaveBeenCalled();
    });

    it('should handle missing branch in project settings', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      // Mock GitHub settings without branch
      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: 'testowner',
        projectSettings: {
          'test-project-123': {
            repoName: 'test-repo',
            // branch is missing
          },
        },
        githubToken: 'test-token',
      });

      const mockChanges = new Map();
      mockFilePreviewService.compareWithGitHub.mockResolvedValue(mockChanges);

      await fileChangeHandler.showChangedFiles();

      // Should default to 'main' branch
      expect(mockFilePreviewService.compareWithGitHub).toHaveBeenCalledWith(
        'testowner',
        'test-repo',
        'main',
        expect.any(Object)
      );
    });
  });
});
