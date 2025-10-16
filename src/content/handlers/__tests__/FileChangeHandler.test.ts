/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileChangeHandler } from '../FileChangeHandler';
import type { FileChange } from '../../../services/FilePreviewService';
import type { INotificationManager, IUploadStatusManager } from '../../types/ManagerInterfaces';
import type { MessageHandler } from '../../MessageHandler';
import type { PremiumService } from '../../services/PremiumService';

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

const mockFilePreviewService = {
  loadProjectFiles: vi.fn(),
  getChangedFiles: vi.fn(),
  compareWithGitHub: vi.fn(),
  getProcessedFiles: vi.fn(),
};

vi.mock('../../../services/FilePreviewService', () => ({
  FilePreviewService: {
    getInstance: vi.fn(() => mockFilePreviewService),
  },
}));

vi.mock('../../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: vi.fn().mockImplementation(() => ({})),
}));

describe('FileChangeHandler', () => {
  let fileChangeHandler: FileChangeHandler;
  let messageHandler: MessageHandler;
  let notificationManager: INotificationManager;
  let uploadStatusManager: IUploadStatusManager;
  let premiumService: PremiumService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/project/test-project-123',
        href: 'https://bolt.new/project/test-project-123',
      },
      writable: true,
      configurable: true,
    });

    (global as any).window.open = vi.fn();

    messageHandler = {
      sendMessage: vi.fn(),
    } as any;

    notificationManager = {
      showNotification: vi.fn(),
      showUpgradeNotification: vi.fn(),
    } as any;

    uploadStatusManager = {
      updateStatus: vi.fn(),
    } as any;

    premiumService = {
      canUseFileChanges: vi.fn(),
      useFileChanges: vi.fn(),
    } as any;

    mockChromeStorage.sync.get.mockResolvedValue({});
    mockChromeStorage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });
    mockChromeStorage.local.set.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Premium feature gating', () => {
    it('should show upgrade notification when premium service not set', async () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);

      await fileChangeHandler.showChangedFiles();

      expect(notificationManager.showUpgradeNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          message: expect.stringContaining('Pro feature'),
          upgradeText: 'Upgrade Now',
          onUpgrade: expect.any(Function),
        })
      );
    });

    it('should show upgrade notification when usage not allowed', async () => {
      fileChangeHandler = new FileChangeHandler(
        messageHandler,
        notificationManager,
        uploadStatusManager
      );
      fileChangeHandler.setPremiumService(premiumService);

      vi.mocked(premiumService.canUseFileChanges).mockResolvedValue({ allowed: false });

      await fileChangeHandler.showChangedFiles();

      expect(notificationManager.showUpgradeNotification).toHaveBeenCalled();
      expect(uploadStatusManager.updateStatus).not.toHaveBeenCalled();
    });

    it('should open upgrade URL when upgrade button clicked', async () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);

      await fileChangeHandler.showChangedFiles();

      const call = vi.mocked(notificationManager.showUpgradeNotification).mock.calls[0][0];
      call.onUpgrade?.();

      expect(window.open).toHaveBeenCalledWith('https://bolt2github.com/upgrade', '_blank');
    });

    it('should fallback to chrome tabs API when window.open fails', async () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);
      vi.mocked(window.open).mockImplementation(() => {
        throw new Error('Window blocked');
      });

      await fileChangeHandler.showChangedFiles();

      const call = vi.mocked(notificationManager.showUpgradeNotification).mock.calls[0][0];
      call.onUpgrade?.();

      expect(mockChromeTabsCreate).toHaveBeenCalledWith({
        url: 'https://bolt2github.com/upgrade',
      });
    });
  });

  describe('File loading and comparison workflow', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(
        messageHandler,
        notificationManager,
        uploadStatusManager
      );
      fileChangeHandler.setPremiumService(premiumService);

      vi.mocked(premiumService.canUseFileChanges).mockResolvedValue({ allowed: true });
      vi.mocked(premiumService.useFileChanges).mockResolvedValue(undefined);
    });

    it('should load files and send changes to popup', async () => {
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(undefined);
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([
          ['file1.js', 'content1'],
          ['file2.ts', 'content2'],
        ])
      );
      mockChromeStorage.sync.get.mockResolvedValue({});

      await fileChangeHandler.showChangedFiles();

      expect(messageHandler.sendMessage).toHaveBeenCalledWith(
        'OPEN_FILE_CHANGES',
        expect.objectContaining({
          projectId: 'test-project-123',
          changes: expect.any(Object),
        })
      );

      expect(uploadStatusManager.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'complete',
          message: expect.stringContaining('changed files'),
        })
      );
    });

    it('should compare with GitHub when settings available', async () => {
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

      const mockGitHubChanges = new Map<string, FileChange>([
        ['file1.js', { path: 'file1.js', status: 'modified', content: 'new content' }],
      ]);

      mockFilePreviewService.compareWithGitHub.mockResolvedValue(mockGitHubChanges);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(undefined);

      await fileChangeHandler.showChangedFiles();

      const sentMessage = vi.mocked(messageHandler.sendMessage).mock.calls[0];
      expect(sentMessage[0]).toBe('OPEN_FILE_CHANGES');
      const messageData = sentMessage[1] as { changes: Record<string, FileChange> };
      expect(messageData.changes).toHaveProperty('file1.js');
      expect(messageData.changes['file1.js'].status).toBe('modified');
    });

    it('should treat files as new when repository not found (404)', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        repoOwner: 'testowner',
        projectSettings: {
          'test-project-123': {
            repoName: 'nonexistent-repo',
            branch: 'main',
          },
        },
        githubToken: 'test-token',
      });

      mockFilePreviewService.compareWithGitHub.mockRejectedValue(
        new Error('Repository not found (404)')
      );
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(undefined);
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );

      await fileChangeHandler.showChangedFiles();

      const sentMessage = vi.mocked(messageHandler.sendMessage).mock.calls[0];
      const messageData = sentMessage[1] as { changes: Record<string, FileChange> };
      expect(messageData.changes['file1.js'].status).toBe('added');
    });

    it('should fallback to local comparison on GitHub errors', async () => {
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

      mockFilePreviewService.compareWithGitHub.mockRejectedValue(new Error('Network error'));
      mockFilePreviewService.getChangedFiles.mockResolvedValue(
        new Map([['file1.js', { path: 'file1.js', status: 'modified', content: 'content' }]])
      );
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(undefined);

      await fileChangeHandler.showChangedFiles();

      expect(messageHandler.sendMessage).toHaveBeenCalledWith(
        'OPEN_FILE_CHANGES',
        expect.objectContaining({
          changes: expect.objectContaining({
            'file1.js': expect.objectContaining({ status: 'modified' }),
          }),
        })
      );
    });
  });

  describe('Storage operations', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(
        messageHandler,
        notificationManager,
        uploadStatusManager
      );
      fileChangeHandler.setPremiumService(premiumService);

      vi.mocked(premiumService.canUseFileChanges).mockResolvedValue({ allowed: true });
      vi.mocked(premiumService.useFileChanges).mockResolvedValue(undefined);
    });

    it('should store file changes in local storage', async () => {
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(undefined);
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );

      await fileChangeHandler.showChangedFiles();

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        storedFileChanges: expect.objectContaining({
          projectId: 'test-project-123',
          changes: expect.any(Object),
          timestamp: expect.any(Number),
          url: 'https://bolt.new/project/test-project-123',
        }),
      });
    });

    it('should handle storage errors gracefully', async () => {
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(undefined);
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content1']])
      );
      mockChromeStorage.local.set.mockRejectedValue(new Error('Storage quota exceeded'));

      await expect(fileChangeHandler.showChangedFiles()).resolves.not.toThrow();

      expect(messageHandler.sendMessage).toHaveBeenCalledWith(
        'OPEN_FILE_CHANGES',
        expect.any(Object)
      );
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(
        messageHandler,
        notificationManager,
        uploadStatusManager
      );
      fileChangeHandler.setPremiumService(premiumService);

      vi.mocked(premiumService.canUseFileChanges).mockResolvedValue({ allowed: true });
      vi.mocked(premiumService.useFileChanges).mockResolvedValue(undefined);
    });

    it('should show error status when file loading fails', async () => {
      mockFilePreviewService.loadProjectFiles.mockRejectedValue(new Error('Failed to load files'));

      await fileChangeHandler.showChangedFiles();

      expect(uploadStatusManager.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          message: expect.stringContaining('Failed to load files'),
        })
      );
    });

    it('should use notification fallback when no upload status manager', async () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);
      fileChangeHandler.setPremiumService(premiumService);

      vi.mocked(premiumService.canUseFileChanges).mockResolvedValue({ allowed: true });
      vi.mocked(premiumService.useFileChanges).mockResolvedValue(undefined);
      mockFilePreviewService.loadProjectFiles.mockRejectedValue(new Error('Test error'));

      await fileChangeHandler.showChangedFiles();

      expect(notificationManager.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('Test error'),
        })
      );
    });

    it('should handle unknown error types gracefully', async () => {
      mockFilePreviewService.loadProjectFiles.mockRejectedValue('String error');

      await fileChangeHandler.showChangedFiles();

      expect(uploadStatusManager.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          message: expect.stringContaining('Unknown error'),
        })
      );
    });
  });

  describe('Public API utilities', () => {
    it('should extract project ID from URL pathname', () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);

      const projectId = fileChangeHandler.getCurrentProjectId();

      expect(projectId).toBe('test-project-123');
    });

    it('should return empty string for invalid paths', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/' },
        writable: true,
        configurable: true,
      });

      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);

      expect(fileChangeHandler.getCurrentProjectId()).toBe('');
    });

    it('should load project files programmatically', async () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(undefined);

      await fileChangeHandler.loadProjectFiles(true);

      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith(true);
    });

    it('should get changed files programmatically without refresh', async () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);

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

      const mockChanges = new Map<string, FileChange>([
        ['file1.js', { path: 'file1.js', status: 'modified', content: 'content' }],
      ]);
      mockFilePreviewService.compareWithGitHub.mockResolvedValue(mockChanges);

      const result = await fileChangeHandler.getChangedFiles(false);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBeGreaterThan(0);
    });

    it('should get changed files programmatically with refresh', async () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);

      mockFilePreviewService.loadProjectFiles.mockResolvedValue(undefined);
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(
        new Map([['file1.js', 'content']])
      );

      const result = await fileChangeHandler.getChangedFiles(true);

      expect(result).toBeInstanceOf(Map);
      expect(mockFilePreviewService.loadProjectFiles).toHaveBeenCalledWith(true);
    });
  });

  describe('Progress tracking', () => {
    beforeEach(() => {
      fileChangeHandler = new FileChangeHandler(
        messageHandler,
        notificationManager,
        uploadStatusManager
      );
      fileChangeHandler.setPremiumService(premiumService);

      vi.mocked(premiumService.canUseFileChanges).mockResolvedValue({ allowed: true });
      vi.mocked(premiumService.useFileChanges).mockResolvedValue(undefined);
    });

    it('should show loading progress during file operations', async () => {
      mockFilePreviewService.loadProjectFiles.mockResolvedValue(undefined);
      mockFilePreviewService.getProcessedFiles.mockResolvedValue(new Map());

      await fileChangeHandler.showChangedFiles();

      const statusCalls = vi.mocked(uploadStatusManager.updateStatus).mock.calls;

      expect(statusCalls).toContainEqual([
        expect.objectContaining({
          status: 'loading',
          message: expect.stringContaining('Loading'),
        }),
      ]);

      expect(statusCalls).toContainEqual([
        expect.objectContaining({
          status: 'analyzing',
          message: expect.stringContaining('Comparing'),
        }),
      ]);

      expect(statusCalls).toContainEqual([
        expect.objectContaining({
          status: 'complete',
        }),
      ]);
    });
  });

  describe('Dependency injection', () => {
    it('should allow setting premium service after construction', () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);

      expect(() => fileChangeHandler.setPremiumService(premiumService)).not.toThrow();
    });

    it('should allow setting upload status manager after construction', () => {
      fileChangeHandler = new FileChangeHandler(messageHandler, notificationManager);

      expect(() => fileChangeHandler.setUploadStatusManager(uploadStatusManager)).not.toThrow();
    });
  });
});
