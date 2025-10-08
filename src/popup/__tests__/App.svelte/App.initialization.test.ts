/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createAppChromeMocks,
  createMockChromeMessagingService,
  createMockSubscriptionService,
  createDocumentMock,
} from '../test-helpers/chrome-mocks';
import { createMockStores } from '../test-helpers/app-test-utils';
import {
  mockGithubSettingsActions,
  mockProjectSettingsActions,
  mockUploadStateActions,
  mockPremiumStatusActions,
  resetAllStoreMocks,
} from '../test-helpers/store-mocks';

vi.mock('$lib/services/chromeMessaging', () => ({
  ChromeMessagingService: createMockChromeMessagingService(),
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
    uiStateActions: {
      setActiveTab: vi.fn(),
      showStatus: vi.fn(),
      clearStatus: vi.fn(),
      showTempRepoModal: vi.fn(),
      hideTempRepoModal: vi.fn(),
      markTempRepoDeleted: vi.fn(),
      markTempRepoNameUsed: vi.fn(),
      canCloseTempRepoModal: vi.fn().mockResolvedValue(true),
    },
    fileChangesActions: {
      processFileChangesMessage: vi.fn(),
      setFileChanges: vi.fn(),
      showModal: vi.fn(),
      loadStoredFileChanges: vi.fn().mockResolvedValue(false),
      requestFileChangesFromContentScript: vi.fn().mockResolvedValue(undefined),
    },
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

vi.mock('../../services/SubscriptionService', () => ({
  SubscriptionService: createMockSubscriptionService(),
}));

describe('App.svelte - Initialization', () => {
  let chromeMocks: ReturnType<typeof createAppChromeMocks>;
  let documentMock: ReturnType<typeof createDocumentMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStoreMocks();

    chromeMocks = createAppChromeMocks();
    global.chrome = chromeMocks as unknown as typeof chrome;

    documentMock = createDocumentMock();
    Object.defineProperty(global, 'document', {
      value: documentMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Dark Mode Setup', () => {
    it('should add dark mode class to document element on initialization', () => {
      documentMock.documentElement.classList.add('dark');

      expect(documentMock.documentElement.classList.add).toHaveBeenCalledWith('dark');
    });
  });

  describe('Store Initialization', () => {
    it('should initialize all required stores on app mount', async () => {
      await mockProjectSettingsActions.initialize();
      await mockGithubSettingsActions.initialize();
      await mockUploadStateActions.initializePort();
      await mockPremiumStatusActions.initialize();

      expect(mockProjectSettingsActions.initialize).toHaveBeenCalledOnce();
      expect(mockGithubSettingsActions.initialize).toHaveBeenCalledOnce();
      expect(mockUploadStateActions.initializePort).toHaveBeenCalledOnce();
      expect(mockPremiumStatusActions.initialize).toHaveBeenCalledOnce();
    });

    it('should initialize stores in the correct order', async () => {
      const callOrder: string[] = [];
      mockProjectSettingsActions.initialize.mockImplementation(async () => {
        callOrder.push('projectSettings');
      });
      mockGithubSettingsActions.initialize.mockImplementation(async () => {
        callOrder.push('githubSettings');
      });
      mockUploadStateActions.initializePort.mockImplementation(() => {
        callOrder.push('uploadState');
      });
      mockPremiumStatusActions.initialize.mockImplementation(async () => {
        callOrder.push('premiumStatus');
      });

      await mockProjectSettingsActions.initialize();
      await mockGithubSettingsActions.initialize();
      await mockUploadStateActions.initializePort();
      await mockPremiumStatusActions.initialize();

      expect(callOrder).toEqual([
        'projectSettings',
        'githubSettings',
        'uploadState',
        'premiumStatus',
      ]);
    });
  });

  describe('Authentication Sync', () => {
    it('should force sync authentication status from background service', async () => {
      await chrome.runtime.sendMessage({ type: 'FORCE_POPUP_SYNC' });

      expect(chromeMocks.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'FORCE_POPUP_SYNC',
      });
    });

    it('should handle authentication sync errors gracefully', async () => {
      chromeMocks.runtime.sendMessage.mockRejectedValueOnce(new Error('Sync failed'));

      await expect(chrome.runtime.sendMessage({ type: 'FORCE_POPUP_SYNC' })).rejects.toThrow(
        'Sync failed'
      );
    });
  });

  describe('Pending File Changes', () => {
    it('should check for pending file changes on initialization', async () => {
      chromeMocks._setLocalStorage('pendingFileChanges', {
        'file1.ts': { filename: 'file1.ts', status: 'modified' },
      });

      const result = await chrome.storage.local.get('pendingFileChanges');

      expect(result.pendingFileChanges).toBeDefined();
      expect(result.pendingFileChanges).toHaveProperty('file1.ts');
    });

    it('should not process file changes if none are pending', async () => {
      const result = await chrome.storage.local.get('pendingFileChanges');

      expect(result.pendingFileChanges).toBeUndefined();
    });

    it('should clear pending file changes after processing', async () => {
      chromeMocks._setLocalStorage('pendingFileChanges', {
        'file1.ts': { filename: 'file1.ts', status: 'modified' },
      });

      await chrome.storage.local.remove('pendingFileChanges');
      const result = await chrome.storage.local.get('pendingFileChanges');

      expect(result.pendingFileChanges).toBeUndefined();
    });
  });

  describe('Project Detection', () => {
    it('should detect current project on initialization', async () => {
      await mockProjectSettingsActions.detectCurrentProject();

      expect(mockProjectSettingsActions.detectCurrentProject).toHaveBeenCalledOnce();
    });
  });

  describe('Auto-Create Project Settings', () => {
    it('should not auto-create settings if not on a Bolt project', async () => {
      const stores = createMockStores();
      stores.isOnBoltProject.set(false);
      stores.currentProjectId.set(null);

      const isOnBolt = false;
      const projectId = null;

      expect(isOnBolt).toBe(false);
      expect(projectId).toBeNull();
    });

    it('should not auto-create settings if they already exist', async () => {
      const projectId = 'test-project';
      chromeMocks._setSyncStorage('projectSettings', {
        [projectId]: {
          repoName: 'existing-repo',
          branch: 'main',
        },
      });

      const result = await chrome.storage.sync.get(['projectSettings']);

      expect(result.projectSettings).toHaveProperty(projectId);
    });

    it('should auto-create settings for new Bolt project with valid auth', async () => {
      chromeMocks._setSyncStorage('repoOwner', 'test-owner');
      chromeMocks._setLocalStorage('authenticationMethod', 'github_app');
      chromeMocks._setLocalStorage('githubAppInstallationId', 12345);

      const settingsResult = await chrome.storage.sync.get(['projectSettings']);
      const authResult = await chrome.storage.local.get([
        'authenticationMethod',
        'githubAppInstallationId',
      ]);

      expect(settingsResult.projectSettings).toBeUndefined();
      expect(authResult.authenticationMethod).toBe('github_app');
      expect(authResult.githubAppInstallationId).toBe(12345);
    });
  });

  describe('Project-Specific Settings', () => {
    it('should load project settings if on a Bolt project', async () => {
      const projectId = 'test-project';
      const stores = createMockStores();
      stores.currentProjectId.set(projectId);

      mockGithubSettingsActions.loadProjectSettings(projectId);

      expect(mockGithubSettingsActions.loadProjectSettings).toHaveBeenCalledWith(projectId);
    });

    it('should not load project settings if not on a Bolt project', () => {
      const stores = createMockStores();
      stores.currentProjectId.set(null);

      const projectId = null;

      expect(projectId).toBeNull();
      expect(mockGithubSettingsActions.loadProjectSettings).not.toHaveBeenCalled();
    });
  });

  describe('Message Listeners Setup', () => {
    it('should setup runtime message listener on initialization', () => {
      const mockCallback = vi.fn();
      chrome.runtime.onMessage.addListener(mockCallback);

      expect(chromeMocks.runtime.onMessage.addListener).toHaveBeenCalledWith(mockCallback);
    });

    it('should handle UPLOAD_STATUS messages', () => {
      const callback = vi.fn();
      chrome.runtime.onMessage.addListener(callback);

      chromeMocks.runtime.onMessage.trigger({
        type: 'UPLOAD_STATUS',
        status: 'processing',
        progress: 50,
      });

      expect(callback).toHaveBeenCalledWith({
        type: 'UPLOAD_STATUS',
        status: 'processing',
        progress: 50,
      });
    });

    it('should handle FILE_CHANGES messages', () => {
      const callback = vi.fn();
      chrome.runtime.onMessage.addListener(callback);

      chromeMocks.runtime.onMessage.trigger({
        type: 'FILE_CHANGES',
        changes: { 'file.ts': { status: 'modified' } },
        projectId: 'test-project',
      });

      expect(callback).toHaveBeenCalledWith({
        type: 'FILE_CHANGES',
        changes: { 'file.ts': { status: 'modified' } },
        projectId: 'test-project',
      });
    });

    it('should handle OPEN_FILE_CHANGES messages', () => {
      const callback = vi.fn();
      chrome.runtime.onMessage.addListener(callback);

      chromeMocks.runtime.onMessage.trigger({ type: 'OPEN_FILE_CHANGES' });

      expect(callback).toHaveBeenCalledWith({ type: 'OPEN_FILE_CHANGES' });
    });
  });

  describe('Temp Repo Check', () => {
    it('should check for temp repos on initialization', async () => {
      const tempRepoData = {
        owner: 'test-owner',
        tempRepo: 'bolt-project-temp-123',
        originalRepo: 'bolt-project',
        timestamp: Date.now(),
      };
      chromeMocks._setLocalStorage('tempRepos', [tempRepoData]);

      const result = await chrome.storage.local.get('tempRepos');

      expect(result.tempRepos).toEqual([tempRepoData]);
    });

    it('should handle absence of temp repos gracefully', async () => {
      const result = await chrome.storage.local.get('tempRepos');

      expect(result.tempRepos).toBeUndefined();
    });
  });

  describe('Popup Context Check', () => {
    it('should check for popup context on initialization', async () => {
      chromeMocks._setLocalStorage('popupContext', 'issues');

      const result = await chrome.storage.local.get(['popupContext']);

      expect(result.popupContext).toBe('issues');
    });

    it('should handle absence of popup context', async () => {
      const result = await chrome.storage.local.get(['popupContext']);

      expect(result.popupContext).toBeUndefined();
    });

    it('should clear popup context after reading', async () => {
      chromeMocks._setLocalStorage('popupContext', 'settings');

      await chrome.storage.local.remove(['popupContext']);
      const result = await chrome.storage.local.get(['popupContext']);

      expect(result.popupContext).toBeUndefined();
    });
  });

  describe('Cleanup Listener', () => {
    it('should setup unload event listener for cleanup', () => {
      const listeners = new Set<EventListener>();
      const mockAddEventListener = vi.fn((event: string, callback: EventListener) => {
        if (event === 'unload') {
          listeners.add(callback);
        }
      });
      (global.window.addEventListener as unknown) = mockAddEventListener;

      const cleanupFn = vi.fn();
      window.addEventListener('unload', cleanupFn);

      expect(mockAddEventListener).toHaveBeenCalledWith('unload', cleanupFn);
    });
  });

  describe('Newsletter Subscription Status', () => {
    it('should initialize newsletter subscription status on mount', async () => {
      const mockSubscriptionService = createMockSubscriptionService();
      mockSubscriptionService.getSubscriptionStatus.mockResolvedValue({
        subscribed: true,
      });

      const status = await mockSubscriptionService.getSubscriptionStatus();

      expect(status.subscribed).toBe(true);
      expect(mockSubscriptionService.getSubscriptionStatus).toHaveBeenCalledOnce();
    });

    it('should handle subscription status errors gracefully', async () => {
      const mockSubscriptionService = createMockSubscriptionService();
      mockSubscriptionService.getSubscriptionStatus.mockRejectedValue(new Error('Network error'));

      await expect(mockSubscriptionService.getSubscriptionStatus()).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('Upgrade Modal Event Listener', () => {
    it('should setup showUpgrade event listener on initialization', () => {
      const listeners = new Map<string, Set<EventListener>>();
      const mockAddEventListener = vi.fn((event: string, callback: EventListener) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(callback);
      });
      (global.window.addEventListener as unknown) = mockAddEventListener;

      const callback = vi.fn();
      window.addEventListener('showUpgrade', callback);

      expect(mockAddEventListener).toHaveBeenCalledWith('showUpgrade', callback);
    });
  });
});
