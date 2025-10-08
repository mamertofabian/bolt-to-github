/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Mock, Mocked } from 'vitest';
import { FilePreviewService } from '../../../services/FilePreviewService';
import type { MessageHandler } from '../../MessageHandler';
import type { PremiumService } from '../../services/PremiumService';
import type { INotificationManager, IUploadStatusManager } from '../../types/ManagerInterfaces';
import { FileChangeHandler } from '../FileChangeHandler';

vi.mock('../../../services/FilePreviewService');
vi.mock('../../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: vi.fn().mockImplementation(() => ({})),
}));

const mockChromeStorage = {
  sync: {
    get: vi.fn(),
  },
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
};

const mockChromeTabsCreate = vi.fn();

(global as any).chrome = {
  storage: mockChromeStorage,
  tabs: {
    create: mockChromeTabsCreate,
  },
};

Object.defineProperty(window, 'location', {
  value: {
    pathname: '/project/test-project-123',
    href: 'https://bolt.new/project/test-project-123',
  },
  writable: true,
});

(global as any).window.open = vi.fn();

Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn(() => 1000),
  },
});

describe('FileChangeHandler', () => {
  let fileChangeHandler: FileChangeHandler;
  let mockMessageHandler: Mocked<MessageHandler>;
  let mockNotificationManager: Mocked<INotificationManager>;
  let mockUploadStatusManager: Mocked<IUploadStatusManager>;
  let mockPremiumService: Mocked<PremiumService>;
  let mockFilePreviewService: Mocked<FilePreviewService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMessageHandler = {
      sendMessage: vi.fn(),
    } as any;

    mockNotificationManager = {
      showNotification: vi.fn(),
      showUpgradeNotification: vi.fn(),
    } as any;

    mockUploadStatusManager = {
      updateStatus: vi.fn(),
    } as any;

    mockPremiumService = {
      canUseFileChanges: vi.fn(),
      useFileChanges: vi.fn(),
    } as any;

    mockFilePreviewService = {
      loadProjectFiles: vi.fn(),
      getChangedFiles: vi.fn(),
      compareWithGitHub: vi.fn(),
      getProcessedFiles: vi.fn(),
    } as any;

    (FilePreviewService.getInstance as Mock).mockReturnValue(mockFilePreviewService);

    mockChromeStorage.sync.get.mockResolvedValue({});
    mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });
    mockChromeStorage.local.set.mockResolvedValue(undefined);
    mockChromeTabsCreate.mockResolvedValue(undefined);

    (window.open as Mock).mockReturnValue(null);

    (performance.now as Mock).mockReturnValue(1000);

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

      expect(() => fileChangeHandler.setPremiumService(mockPremiumService)).not.toThrow();
    });
  });

  describe('setUploadStatusManager', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(mockMessageHandler, mockNotificationManager);
    });

    it('should set upload status manager reference', () => {
      fileChangeHandler.setUploadStatusManager(mockUploadStatusManager);

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
      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );

      const result = await fileChangeHandler.getChangedFiles();

      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith();
      expect(result).toBeInstanceOf(Map);
    });

    it('should get changed files with force refresh', async () => {
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

      mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });

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

      mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });

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

      const error404 = new Error('Repository not found (404)');
      mockFilePreviewService.compareWithGitHub.mockRejectedValue(error404);

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

      mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });

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

      mockChromeStorage.sync.get.mockResolvedValue({});

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

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await fileChangeHandler.showChangedFiles();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[FileChangeHandler] [ERROR]',
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

      const upgradeCall = mockNotificationManager.showUpgradeNotification.mock.calls[0][0];
      const onUpgrade = upgradeCall.onUpgrade;

      onUpgrade?.();

      expect(window.open).toHaveBeenCalledWith('https://bolt2github.com/upgrade', '_blank');
    });

    it('should fallback to chrome tabs API when window.open fails', async () => {
      (window.open as Mock).mockImplementation(() => {
        throw new Error('Window open failed');
      });

      await fileChangeHandler.showChangedFiles();

      const upgradeCall = mockNotificationManager.showUpgradeNotification.mock.calls[0][0];
      const onUpgrade = upgradeCall.onUpgrade;

      onUpgrade?.();

      expect(mockChromeTabsCreate).toHaveBeenCalledWith({ url: 'https://bolt2github.com/upgrade' });
    });

    it('should handle both window.open and chrome tabs API failures gracefully', async () => {
      (window.open as Mock).mockImplementation(() => {
        throw new Error('Window open failed');
      });
      mockChromeTabsCreate.mockImplementation(() => {
        throw new Error('Chrome tabs failed');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await fileChangeHandler.showChangedFiles();

      const upgradeCall = mockNotificationManager.showUpgradeNotification.mock.calls[0][0];
      const onUpgrade = upgradeCall.onUpgrade;

      onUpgrade?.();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[FileChangeHandler] [ERROR]',
        '❌ Could not open upgrade URL:',
        expect.any(Error)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[FileChangeHandler] [ERROR]',
        '❌ Chrome tabs API also failed:',
        expect.any(Error)
      );
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

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await fileChangeHandler.showChangedFiles();

      expect(consoleSpy).toHaveBeenCalledWith('[FileChangeHandler] [INFO]', 'Changed Files');
      expect(consoleSpy).toHaveBeenCalledWith('[FileChangeHandler] [INFO]', 'Change Summary:');
      expect(consoleSpy).toHaveBeenCalledWith('[FileChangeHandler] [INFO]', '- Total files: 3');
      expect(consoleSpy).toHaveBeenCalledWith('[FileChangeHandler] [INFO]', '- Added: 3');
      expect(consoleSpy).toHaveBeenCalledWith('[FileChangeHandler] [INFO]', '- Modified: 0');
      expect(consoleSpy).toHaveBeenCalledWith('[FileChangeHandler] [INFO]', '- Unchanged: 0');
      expect(consoleSpy).toHaveBeenCalledWith('[FileChangeHandler] [INFO]', '- Deleted: 0');
      consoleSpy.mockRestore();
    });

    it('should skip directory entries when processing files', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([
          ['src/', ''],
          ['src/file.js', 'content1'],
          ['empty.txt', ''],
        ])
      );

      await fileChangeHandler.showChangedFiles();

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

      let callCount = 0;
      (performance.now as Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 1000 : 1250;
      });

      mockChromeStorage.sync.get.mockResolvedValue({});
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(new Map());

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await fileChangeHandler.showChangedFiles();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[FileChangeHandler] [INFO]',
        'Files loaded in 250.00ms'
      );
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

      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: 'testowner',
      });
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(new Map());

      await fileChangeHandler.showChangedFiles();

      expect(mockFilePreviewService.getProcessedFiles).toHaveBeenCalled();
    });

    it('should handle missing branch in project settings', async () => {
      mockPremiumService.canUseFileChanges.mockResolvedValue({ allowed: true });
      mockPremiumService.useFileChanges.mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(new Map());

      mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });

      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: 'testowner',
        projectSettings: {
          'test-project-123': {
            repoName: 'test-repo',
          },
        },
        githubToken: 'test-token',
      });

      const mockChanges = new Map();
      mockFilePreviewService.compareWithGitHub.mockResolvedValue(mockChanges);

      await fileChangeHandler.showChangedFiles();

      expect(mockFilePreviewService.compareWithGitHub).toHaveBeenCalledWith(
        'testowner',
        'test-repo',
        'main',
        expect.any(Object)
      );
    });
  });
});
