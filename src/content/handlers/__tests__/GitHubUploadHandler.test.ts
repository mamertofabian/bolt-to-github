import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageHandler } from '../../MessageHandler';
import type { INotificationManager } from '../../types/ManagerInterfaces';
import { GitHubUploadHandler } from '../GitHubUploadHandler';
import { SettingsService } from '../../../services/settings';
import { DownloadService } from '../../../services/DownloadService';

vi.mock('../../../services/settings');
vi.mock('../../../services/DownloadService');
vi.mock('../../services/CommitTemplateService', () => ({
  CommitTemplateService: {
    getInstance: vi.fn(() => ({
      getTemplateSuggestions: vi.fn().mockResolvedValue([]),
      recordTemplateUsage: vi.fn(),
    })),
  },
}));

vi.mock('../../../lib/utils/projectId', () => ({
  getCurrentProjectId: vi.fn(() => 'test-project'),
}));

vi.mock('../../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../FileChangeHandler', () => ({
  FileChangeHandler: vi.fn().mockImplementation(() => ({
    getChangedFiles: vi.fn().mockResolvedValue(new Map()),
  })),
}));

describe('GitHubUploadHandler', () => {
  let handler: GitHubUploadHandler;
  let mockMessageHandler: MessageHandler;
  let mockNotificationManager: INotificationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockMessageHandler = {
      sendMessage: vi.fn(),
      sendZipData: vi.fn(),
      sendCommitMessage: vi.fn(),
    } as unknown as MessageHandler;

    mockNotificationManager = {
      showNotification: vi.fn(),
      showSettingsNotification: vi.fn(),
      showConfirmationDialog: vi.fn().mockResolvedValue({
        confirmed: false,
        commitMessage: '',
      }),
    } as unknown as INotificationManager;

    vi.mocked(DownloadService).mockImplementation(
      () =>
        ({
          downloadProjectZip: vi
            .fn()
            .mockResolvedValue(new Blob(['test'], { type: 'application/zip' })),
          blobToBase64: vi.fn().mockResolvedValue('base64data'),
          getProjectFiles: vi.fn().mockResolvedValue(new Map([['file.txt', 'content']])),
        }) as unknown as DownloadService
    );

    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}) as unknown as typeof chrome.storage.local.get,
          set: vi.fn().mockResolvedValue(undefined) as unknown as typeof chrome.storage.local.set,
          remove: vi
            .fn()
            .mockResolvedValue(undefined) as unknown as typeof chrome.storage.local.remove,
        },
      },
    } as unknown as typeof chrome;

    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/project/test-project',
        href: 'https://bolt.new/~/test-project',
      },
      writable: true,
      configurable: true,
    });

    handler = new GitHubUploadHandler(mockMessageHandler, mockNotificationManager);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create handler with required dependencies', () => {
      expect(handler).toBeInstanceOf(GitHubUploadHandler);
    });

    it('should create handler without state manager', () => {
      const handlerWithoutState = new GitHubUploadHandler(
        mockMessageHandler,
        mockNotificationManager
      );
      expect(handlerWithoutState).toBeInstanceOf(GitHubUploadHandler);
    });
  });

  describe('Settings Validation', () => {
    it('should return true when settings are valid', async () => {
      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': {
              repoName: 'test-repo',
              branch: 'main',
            },
          },
        },
      } as never);

      const result = await handler.validateSettings();

      expect(result).toBe(true);
      expect(SettingsService.getGitHubSettings).toHaveBeenCalled();
    });

    it('should return false when settings are invalid', async () => {
      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: false,
      } as never);

      const result = await handler.validateSettings();

      expect(result).toBe(false);
    });

    it('should propagate settings service errors', async () => {
      const error = new Error('Settings error');
      vi.mocked(SettingsService.getGitHubSettings).mockRejectedValue(error);

      await expect(handler.validateSettings()).rejects.toThrow('Settings error');
    });
  });

  describe('GitHub Push Workflow', () => {
    beforeEach(() => {
      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': {
              repoName: 'test-repo',
              branch: 'main',
            },
          },
        },
      } as never);
    });

    it('should show settings notification when settings are invalid', async () => {
      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: false,
      } as never);

      await handler.handleGitHubPush(true, false);

      expect(mockNotificationManager.showSettingsNotification).toHaveBeenCalled();
    });

    it('should show confirmation dialog before proceeding', async () => {
      await handler.handleGitHubPush(true, true);

      expect(mockNotificationManager.showConfirmationDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Confirm GitHub Push',
          confirmText: 'Push Changes',
        })
      );
    });

    it('should not proceed when user cancels confirmation', async () => {
      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: false,
        commitMessage: '',
      });

      await handler.handleGitHubPush(true, true);

      expect(mockMessageHandler.sendCommitMessage).not.toHaveBeenCalled();
      expect(mockMessageHandler.sendZipData).not.toHaveBeenCalled();
    });

    it('should proceed with upload when user confirms', async () => {
      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: 'Test commit',
      });

      await handler.handleGitHubPush(true, true);

      expect(mockMessageHandler.sendCommitMessage).toHaveBeenCalledWith('Test commit');
      expect(mockMessageHandler.sendZipData).toHaveBeenCalledWith('base64data', 'test-project');
    });

    it('should use default commit message when none provided', async () => {
      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      await handler.handleGitHubPush(true, true);

      expect(mockMessageHandler.sendCommitMessage).toHaveBeenCalledWith(
        'Commit from Bolt to GitHub'
      );
    });

    it('should detect changes when skipChangeDetection is false', async () => {
      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      await handler.handleGitHubPush(false, false);

      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          message: expect.stringContaining('Detecting changes'),
        })
      );
    });

    it('should handle fresh comparison request', async () => {
      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: false,
        commitMessage: '',
      });

      await handler.handleGitHubPushWithFreshComparison();

      expect(mockNotificationManager.showConfirmationDialog).toHaveBeenCalled();
    });
  });

  describe('File Upload Process', () => {
    beforeEach(() => {
      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': {
              repoName: 'test-repo',
              branch: 'main',
            },
          },
        },
      } as never);

      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: 'Test commit',
      });
    });

    it('should send commit message before uploading files', async () => {
      await handler.handleGitHubPush(true, true);

      expect(mockMessageHandler.sendCommitMessage).toHaveBeenCalled();
      expect(mockMessageHandler.sendZipData).toHaveBeenCalled();
    });

    it('should convert blob to base64 and send zip data', async () => {
      await handler.handleGitHubPush(true, true);

      expect(mockMessageHandler.sendZipData).toHaveBeenCalledWith('base64data', 'test-project');
    });
  });

  describe('Project Info', () => {
    it('should return project info when settings are valid', async () => {
      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': {
              repoName: 'test-repo',
              branch: 'main',
            },
          },
        },
      } as never);

      const result = await handler.getProjectInfo();

      expect(result).toEqual({
        repoName: 'test-repo',
        branch: 'main',
      });
    });

    it('should return null when settings are invalid', async () => {
      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: false,
      } as never);

      const result = await handler.getProjectInfo();

      expect(result).toBeNull();
    });

    it('should return null when project settings are missing', async () => {
      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {},
        },
      } as never);

      const result = await handler.getProjectInfo();

      expect(result).toBeNull();
    });
  });

  describe('Upload Status', () => {
    it('should report upload not in progress by default', () => {
      const result = handler.isUploadInProgress();
      expect(result).toBe(false);
    });
  });

  describe('Stored File Changes (Time-based)', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    });

    it('should handle missing stored changes', async () => {
      (global.chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        {}
      );

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': { repoName: 'test-repo', branch: 'main' },
          },
        },
      } as never);

      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      await handler.handleGitHubPush(true, false);

      expect(mockNotificationManager.showConfirmationDialog).toHaveBeenCalled();
    });

    it('should use valid stored changes within time window', async () => {
      const recentTimestamp = Date.now() - 5 * 60 * 1000;

      (global.chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        storedFileChanges: {
          changes: { 'file.txt': { status: 'modified', path: 'file.txt' } },
          timestamp: recentTimestamp,
          projectId: 'test-project',
          url: 'https://bolt.new/~/test-project',
        },
      });

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': { repoName: 'test-repo', branch: 'main' },
          },
        },
      } as never);

      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      await handler.handleGitHubPush(true, false);

      expect(mockNotificationManager.showConfirmationDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('modified'),
        })
      );
    });

    it('should reject expired stored changes', async () => {
      const expiredTimestamp = Date.now() - 15 * 60 * 1000;

      (global.chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        storedFileChanges: {
          changes: { 'file.txt': { status: 'modified', path: 'file.txt' } },
          timestamp: expiredTimestamp,
          projectId: 'test-project',
          url: 'https://bolt.new/~/test-project',
        },
      });

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': { repoName: 'test-repo', branch: 'main' },
          },
        },
      } as never);

      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      await handler.handleGitHubPush(true, false);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['storedFileChanges']);
    });

    it('should reject stored changes for different project', async () => {
      const recentTimestamp = Date.now() - 5 * 60 * 1000;

      (global.chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        storedFileChanges: {
          changes: { 'file.txt': { status: 'modified', path: 'file.txt' } },
          timestamp: recentTimestamp,
          projectId: 'different-project',
          url: 'https://bolt.new/~/test-project',
        },
      });

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': { repoName: 'test-repo', branch: 'main' },
          },
        },
      } as never);

      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      await handler.handleGitHubPush(true, false);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['storedFileChanges']);
    });
  });

  describe('Error Handling', () => {
    it('should handle chrome storage errors gracefully', async () => {
      (global.chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Storage error')
      );

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': { repoName: 'test-repo', branch: 'main' },
          },
        },
      } as never);

      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      await expect(handler.handleGitHubPush(true, false)).resolves.not.toThrow();
    });

    it('should handle change detection errors gracefully', async () => {
      const { FileChangeHandler } = await import('../FileChangeHandler');
      vi.mocked(FileChangeHandler).mockImplementation(
        () =>
          ({
            getChangedFiles: vi.fn().mockRejectedValue(new Error('Detection failed')),
          }) as never
      );

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue({
        isSettingsValid: true,
        gitHubSettings: {
          projectSettings: {
            'test-project': { repoName: 'test-repo', branch: 'main' },
          },
        },
      } as never);

      vi.mocked(mockNotificationManager.showConfirmationDialog).mockResolvedValue({
        confirmed: true,
        commitMessage: '',
      });

      await handler.handleGitHubPush(false, false);

      expect(mockNotificationManager.showConfirmationDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Unable to detect changes'),
        })
      );
    });
  });
});
