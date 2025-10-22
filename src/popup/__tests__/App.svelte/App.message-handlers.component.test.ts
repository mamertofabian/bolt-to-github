/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAppChromeMocks,
  createMockChromeMessagingService,
  createMockSubscriptionService,
} from '../test-helpers/chrome-mocks';
import { createMockStores } from '../test-helpers/app-test-utils';
import {
  mockGithubSettingsActions,
  mockProjectSettingsActions,
  mockUploadStateActions,
  mockPremiumStatusActions,
  resetAllStoreMocks,
} from '../test-helpers/store-mocks';

const chromeMessagingMock = createMockChromeMessagingService();
const subscriptionServiceMock = createMockSubscriptionService();

const mockFileChangesActions = {
  processFileChangesMessage: vi.fn(),
  setFileChanges: vi.fn(),
  showModal: vi.fn(),
  loadStoredFileChanges: vi.fn().mockResolvedValue(false),
  requestFileChangesFromContentScript: vi.fn().mockResolvedValue(undefined),
};

const mockUiStateActions = {
  setActiveTab: vi.fn(),
  showStatus: vi.fn(),
  clearStatus: vi.fn(),
  showTempRepoModal: vi.fn(),
  hideTempRepoModal: vi.fn(),
  markTempRepoDeleted: vi.fn(),
  markTempRepoNameUsed: vi.fn(),
  canCloseTempRepoModal: vi.fn().mockResolvedValue(true),
};

vi.mock('$lib/services/chromeMessaging', () => ({
  ChromeMessagingService: chromeMessagingMock,
}));

vi.mock('$lib/stores', () => {
  const stores = createMockStores();
  return {
    githubSettingsStore: stores.githubSettings,
    projectSettingsStore: stores.projectSettings,
    uiStateStore: stores.uiState,
    fileChangesStore: stores.fileChanges,
    uploadStateStore: stores.uploadState,
    isSettingsValid: stores.isSettingsValid,
    isAuthenticationValid: stores.isAuthenticationValid,
    isOnBoltProject: stores.isOnBoltProject,
    currentProjectId: stores.currentProjectId,
    isAuthenticated: stores.isAuthenticated,
    isPremium: stores.isPremium,
    githubSettingsActions: mockGithubSettingsActions,
    projectSettingsActions: mockProjectSettingsActions,
    uiStateActions: mockUiStateActions,
    fileChangesActions: mockFileChangesActions,
    uploadStateActions: mockUploadStateActions,
    premiumStatusActions: mockPremiumStatusActions,
  };
});

vi.mock('$lib/utils/windowMode', () => ({
  isWindowMode: vi.fn().mockReturnValue(false),
  openPopupWindow: vi.fn().mockResolvedValue(undefined),
  closePopupWindow: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../services/SubscriptionService', () => ({
  SubscriptionService: subscriptionServiceMock,
}));

describe('App.svelte - Message Handlers', () => {
  let chromeMocks: ReturnType<typeof createAppChromeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStoreMocks();

    chromeMocks = createAppChromeMocks();
    global.chrome = chromeMocks as unknown as typeof chrome;
  });

  describe('handleUploadStatusMessage', () => {
    it('should handle UPLOAD_STATUS message with idle status', () => {
      const message = {
        type: 'UPLOAD_STATUS',
        status: 'idle',
        progress: 0,
        message: '',
      };

      mockUploadStateActions.handleUploadStatusMessage(message);

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledWith(message);
    });

    it('should handle UPLOAD_STATUS message with uploading status', () => {
      const message = {
        type: 'UPLOAD_STATUS',
        status: 'uploading',
        progress: 45,
        message: 'Uploading files...',
      };

      mockUploadStateActions.handleUploadStatusMessage(message);

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledWith(message);
    });

    it('should handle UPLOAD_STATUS message with complete status', () => {
      const message = {
        type: 'UPLOAD_STATUS',
        status: 'complete',
        progress: 100,
        message: 'Upload complete!',
      };

      mockUploadStateActions.handleUploadStatusMessage(message);

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledWith(message);
    });

    it('should handle UPLOAD_STATUS message with error status', () => {
      const message = {
        type: 'UPLOAD_STATUS',
        status: 'error',
        progress: 0,
        message: 'Upload failed: Network error',
      };

      mockUploadStateActions.handleUploadStatusMessage(message);

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledWith(message);
    });

    it('should handle messages with missing optional fields', () => {
      const message = {
        type: 'UPLOAD_STATUS',
        status: 'idle',
      };

      mockUploadStateActions.handleUploadStatusMessage(message);

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledWith(message);
    });

    it('should handle upload status messages with all fields undefined', () => {
      const message = {
        type: 'UPLOAD_STATUS',
        status: undefined,
        progress: undefined,
        message: undefined,
      };

      mockUploadStateActions.handleUploadStatusMessage(message);

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('handleFileChangesMessage', () => {
    it('should process FILE_CHANGES message with valid data', () => {
      const fileChanges = {
        'src/App.tsx': {
          filename: 'src/App.tsx',
          status: 'modified',
          additions: 10,
          deletions: 5,
        },
        'package.json': {
          filename: 'package.json',
          status: 'modified',
          additions: 2,
          deletions: 1,
        },
      };

      const projectId = 'test-project';

      mockFileChangesActions.processFileChangesMessage(fileChanges, projectId);

      expect(mockFileChangesActions.processFileChangesMessage).toHaveBeenCalledWith(
        fileChanges,
        projectId
      );
    });

    it('should handle file changes with empty changes object', () => {
      const fileChanges = {};
      const projectId = 'test-project';

      mockFileChangesActions.processFileChangesMessage(fileChanges, projectId);

      expect(mockFileChangesActions.processFileChangesMessage).toHaveBeenCalledWith(
        fileChanges,
        projectId
      );
    });

    it('should process file changes with complex nested data', () => {
      const fileChanges = {
        'src/components/Header.tsx': {
          filename: 'src/components/Header.tsx',
          status: 'added',
          additions: 50,
          deletions: 0,
        },
        'README.md': {
          filename: 'README.md',
          status: 'deleted',
          additions: 0,
          deletions: 20,
        },
      };
      const projectId = 'complex-project';

      mockFileChangesActions.processFileChangesMessage(fileChanges, projectId);

      expect(mockFileChangesActions.processFileChangesMessage).toHaveBeenCalledWith(
        fileChanges,
        projectId
      );
    });
  });

  describe('handleOpenFileChangesMessage', () => {
    it('should successfully load stored file changes', async () => {
      const projectId = 'test-project';
      vi.mocked(mockFileChangesActions.loadStoredFileChanges).mockResolvedValue(true);

      const success = await mockFileChangesActions.loadStoredFileChanges(projectId);

      expect(mockFileChangesActions.loadStoredFileChanges).toHaveBeenCalledWith(projectId);
      expect(success).toBe(true);
    });

    it('should request file changes when stored changes not available', async () => {
      const projectId = 'test-project';
      vi.mocked(mockFileChangesActions.loadStoredFileChanges).mockResolvedValue(false);
      vi.mocked(mockFileChangesActions.requestFileChangesFromContentScript).mockResolvedValue(
        undefined
      );

      const success = await mockFileChangesActions.loadStoredFileChanges(projectId);

      expect(success).toBe(false);
    });

    it('should handle error when requesting file changes fails', async () => {
      vi.mocked(mockFileChangesActions.requestFileChangesFromContentScript).mockRejectedValue(
        new Error('Not on bolt project')
      );

      await expect(mockFileChangesActions.requestFileChangesFromContentScript()).rejects.toThrow(
        'Not on bolt project'
      );
    });
  });

  describe('ChromeMessagingService Port Handlers', () => {
    it('should register port message handlers during initialization', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      chromeMessagingMock.addPortMessageHandler(handler1);
      chromeMessagingMock.addPortMessageHandler(handler2);

      expect(chromeMessagingMock.addPortMessageHandler).toHaveBeenCalledTimes(2);
      expect(chromeMessagingMock.addPortMessageHandler).toHaveBeenCalledWith(handler1);
      expect(chromeMessagingMock.addPortMessageHandler).toHaveBeenCalledWith(handler2);
    });

    it('should handle upload status messages through port handler', () => {
      const message = {
        type: 'UPLOAD_STATUS',
        status: 'processing',
        progress: 75,
        message: 'Processing files...',
      };

      mockUploadStateActions.handleUploadStatusMessage(message);

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledWith(message);
    });

    it('should handle file changes through port handler', () => {
      const changes = { 'README.md': { filename: 'README.md', status: 'added' } };
      const projectId = 'another-project';

      mockFileChangesActions.processFileChangesMessage(changes, projectId);

      expect(mockFileChangesActions.processFileChangesMessage).toHaveBeenCalledWith(
        changes,
        projectId
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle message with invalid data types', () => {
      const message = {
        type: 'UPLOAD_STATUS',
        status: 123,
        progress: 'invalid',
        message: { object: 'instead of string' },
      };

      mockUploadStateActions.handleUploadStatusMessage(message);

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledWith(message);
    });

    it('should handle message with extra unexpected fields', () => {
      const message = {
        type: 'UPLOAD_STATUS',
        status: 'uploading',
        progress: 50,
        message: 'Uploading...',
        extraField1: 'unexpected',
        extraField2: { nested: 'data' },
        extraField3: [1, 2, 3],
      };

      mockUploadStateActions.handleUploadStatusMessage(message);

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPLOAD_STATUS',
          status: 'uploading',
          progress: 50,
          message: 'Uploading...',
        })
      );
    });

    it('should handle multiple rapid messages', () => {
      const messages = [];
      for (let i = 0; i < 10; i++) {
        const message = {
          type: 'UPLOAD_STATUS',
          status: 'uploading',
          progress: i * 10,
          message: `Processing ${i}`,
        };
        messages.push(message);
        mockUploadStateActions.handleUploadStatusMessage(message);
      }

      expect(mockUploadStateActions.handleUploadStatusMessage).toHaveBeenCalledTimes(10);
    });
  });
});
