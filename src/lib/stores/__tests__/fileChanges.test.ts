import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileChangesActions, fileChangesStore, type FileChangesState } from '../fileChanges';
import type { FileChange } from '../../../services/FilePreviewService';

describe('fileChanges Store', () => {
  const mockFileChange: FileChange = {
    path: 'test.ts',
    status: 'modified',
    content: 'new content',
    previousContent: 'old content',
  };

  const defaultState: FileChangesState = {
    showModal: false,
    fileChanges: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fileChangesStore.set(defaultState);

    global.chrome = {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(),
        sendMessage: vi.fn(),
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('store initialization', () => {
    it('should initialize with default state', () => {
      const state = get(fileChangesStore);
      expect(state.showModal).toBe(false);
      expect(state.fileChanges).toBe(null);
    });
  });

  describe('fileChangesActions.showModal', () => {
    it('should set showModal to true without file changes', () => {
      fileChangesActions.showModal();

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges).toBe(null);
    });

    it('should set showModal to true with new file changes', () => {
      const fileChangesMap = new Map([['test.ts', mockFileChange]]);

      fileChangesActions.showModal(fileChangesMap);

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges).toBe(fileChangesMap);
    });

    it('should preserve existing file changes if not provided', () => {
      const existingChanges = new Map([['existing.ts', mockFileChange]]);
      fileChangesStore.set({ showModal: false, fileChanges: existingChanges });

      fileChangesActions.showModal();

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges).toBe(existingChanges);
    });

    it('should replace existing file changes when new ones provided', () => {
      const oldChanges = new Map([['old.ts', mockFileChange]]);
      const newChanges = new Map([['new.ts', mockFileChange]]);

      fileChangesStore.set({ showModal: false, fileChanges: oldChanges });
      fileChangesActions.showModal(newChanges);

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges).toBe(newChanges);
    });
  });

  describe('fileChangesActions.hideModal', () => {
    it('should set showModal to false', () => {
      fileChangesStore.set({ showModal: true, fileChanges: null });

      fileChangesActions.hideModal();

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(false);
    });

    it('should preserve file changes when hiding modal', () => {
      const fileChangesMap = new Map([['test.ts', mockFileChange]]);
      fileChangesStore.set({ showModal: true, fileChanges: fileChangesMap });

      fileChangesActions.hideModal();

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(false);
      expect(state.fileChanges).toBe(fileChangesMap);
    });

    it('should be idempotent when modal already hidden', () => {
      fileChangesActions.hideModal();

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(false);
    });
  });

  describe('fileChangesActions.setFileChanges', () => {
    it('should set file changes', () => {
      const fileChangesMap = new Map([['test.ts', mockFileChange]]);

      fileChangesActions.setFileChanges(fileChangesMap);

      const state = get(fileChangesStore);
      expect(state.fileChanges).toBe(fileChangesMap);
    });

    it('should set file changes to null', () => {
      const fileChangesMap = new Map([['test.ts', mockFileChange]]);
      fileChangesStore.set({ showModal: false, fileChanges: fileChangesMap });

      fileChangesActions.setFileChanges(null);

      const state = get(fileChangesStore);
      expect(state.fileChanges).toBe(null);
    });

    it('should preserve showModal state', () => {
      fileChangesStore.set({ showModal: true, fileChanges: null });
      const newChanges = new Map([['test.ts', mockFileChange]]);

      fileChangesActions.setFileChanges(newChanges);

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges).toBe(newChanges);
    });

    it('should handle empty Map', () => {
      const emptyMap = new Map<string, FileChange>();

      fileChangesActions.setFileChanges(emptyMap);

      const state = get(fileChangesStore);
      expect(state.fileChanges).toBe(emptyMap);
      expect(state.fileChanges?.size).toBe(0);
    });
  });

  describe('fileChangesActions.processFileChangesMessage', () => {
    it('should store file changes in chrome storage and show modal', async () => {
      const changes: Record<string, FileChange> = {
        'test.ts': mockFileChange,
      };
      const projectId = 'project-123';

      const mockSet = vi.fn().mockResolvedValue(undefined);
      global.chrome.storage.local.set = mockSet;

      await fileChangesActions.processFileChangesMessage(changes, projectId);

      expect(mockSet).toHaveBeenCalledWith({
        storedFileChanges: {
          projectId,
          changes,
        },
      });

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges).toBeInstanceOf(Map);
      expect(state.fileChanges?.get('test.ts')).toEqual(mockFileChange);
    });

    it('should handle multiple file changes', async () => {
      const changes: Record<string, FileChange> = {
        'file1.ts': { path: 'file1.ts', status: 'added', content: 'content1' },
        'file2.ts': {
          path: 'file2.ts',
          status: 'modified',
          content: 'content2',
          previousContent: 'old2',
        },
        'file3.ts': { path: 'file3.ts', status: 'deleted', content: '', previousContent: 'old3' },
      };
      const projectId = 'multi-file-project';

      const mockSet = vi.fn().mockResolvedValue(undefined);
      global.chrome.storage.local.set = mockSet;

      await fileChangesActions.processFileChangesMessage(changes, projectId);

      const state = get(fileChangesStore);
      expect(state.fileChanges?.size).toBe(3);
      expect(state.fileChanges?.get('file1.ts')?.status).toBe('added');
      expect(state.fileChanges?.get('file2.ts')?.status).toBe('modified');
      expect(state.fileChanges?.get('file3.ts')?.status).toBe('deleted');
    });

    it('should handle empty changes object', async () => {
      const changes: Record<string, FileChange> = {};
      const projectId = 'empty-project';

      const mockSet = vi.fn().mockResolvedValue(undefined);
      global.chrome.storage.local.set = mockSet;

      await fileChangesActions.processFileChangesMessage(changes, projectId);

      expect(mockSet).toHaveBeenCalledWith({
        storedFileChanges: {
          projectId,
          changes: {},
        },
      });

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges?.size).toBe(0);
    });
  });

  describe('fileChangesActions.loadStoredFileChanges', () => {
    it('should load file changes with matching projectId', async () => {
      const changes: Record<string, FileChange> = {
        'test.ts': mockFileChange,
      };
      const projectId = 'project-123';

      const mockGet = vi.fn().mockResolvedValue({
        storedFileChanges: {
          projectId,
          changes,
        },
      });
      global.chrome.storage.local.get = mockGet;

      const result = await fileChangesActions.loadStoredFileChanges(projectId);

      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledWith('storedFileChanges');

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges?.get('test.ts')).toEqual(mockFileChange);
    });

    it('should not load file changes with mismatched projectId', async () => {
      const changes: Record<string, FileChange> = {
        'test.ts': mockFileChange,
      };
      const storedProjectId = 'project-123';
      const currentProjectId = 'project-456';

      const mockGet = vi.fn().mockResolvedValue({
        storedFileChanges: {
          projectId: storedProjectId,
          changes,
        },
      });
      global.chrome.storage.local.get = mockGet;

      const result = await fileChangesActions.loadStoredFileChanges(currentProjectId);

      expect(result).toBe(false);

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(false);
      expect(state.fileChanges).toBe(null);
    });

    it('should load legacy format without projectId', async () => {
      const changes: Record<string, FileChange> = {
        'test.ts': mockFileChange,
      };

      const mockGet = vi.fn().mockResolvedValue({
        storedFileChanges: changes,
      });
      global.chrome.storage.local.get = mockGet;

      const result = await fileChangesActions.loadStoredFileChanges('any-project');

      expect(result).toBe(true);

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges?.get('test.ts')).toEqual(mockFileChange);
    });

    it('should load stored changes when currentProjectId is null', async () => {
      const changes: Record<string, FileChange> = {
        'test.ts': mockFileChange,
      };
      const projectId = 'project-123';

      const mockGet = vi.fn().mockResolvedValue({
        storedFileChanges: {
          projectId,
          changes,
        },
      });
      global.chrome.storage.local.get = mockGet;

      const result = await fileChangesActions.loadStoredFileChanges(null);

      expect(result).toBe(true);

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges?.get('test.ts')).toEqual(mockFileChange);
    });

    it('should return false when no stored file changes exist', async () => {
      const mockGet = vi.fn().mockResolvedValue({});
      global.chrome.storage.local.get = mockGet;

      const result = await fileChangesActions.loadStoredFileChanges('project-123');

      expect(result).toBe(false);

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(false);
      expect(state.fileChanges).toBe(null);
    });

    it('should handle chrome storage errors gracefully', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Storage error'));
      global.chrome.storage.local.get = mockGet;

      const result = await fileChangesActions.loadStoredFileChanges('project-123');

      expect(result).toBe(false);

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(false);
    });
  });

  describe('fileChangesActions.requestFileChangesFromContentScript', () => {
    it('should send REQUEST_FILE_CHANGES message to active tab', async () => {
      const mockTabId = 123;
      const mockTabs = [{ id: mockTabId }];

      const mockQuery = vi.fn().mockResolvedValue(mockTabs);
      const mockSendMessage = vi.fn().mockImplementation((tabId, message, callback) => {
        callback({ success: true, projectId: 'project-123' });
      });

      global.chrome.tabs.query = mockQuery;
      global.chrome.tabs.sendMessage = mockSendMessage;

      await fileChangesActions.requestFileChangesFromContentScript();

      expect(mockQuery).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(mockSendMessage).toHaveBeenCalledWith(
        mockTabId,
        { action: 'REQUEST_FILE_CHANGES' },
        expect.any(Function)
      );
    });

    it('should handle successful response from content script', async () => {
      const mockTabs = [{ id: 123 }];
      const mockQuery = vi.fn().mockResolvedValue(mockTabs);
      const mockSendMessage = vi.fn().mockImplementation((tabId, message, callback) => {
        callback({ success: true, projectId: 'project-123' });
      });

      global.chrome.tabs.query = mockQuery;
      global.chrome.tabs.sendMessage = mockSendMessage;

      await expect(fileChangesActions.requestFileChangesFromContentScript()).resolves.not.toThrow();
    });

    it('should handle response without success flag', async () => {
      const mockTabs = [{ id: 123 }];
      const mockQuery = vi.fn().mockResolvedValue(mockTabs);
      const mockSendMessage = vi.fn().mockImplementation((tabId, message, callback) => {
        callback({ success: false });
      });

      global.chrome.tabs.query = mockQuery;
      global.chrome.tabs.sendMessage = mockSendMessage;

      await expect(fileChangesActions.requestFileChangesFromContentScript()).resolves.not.toThrow();
    });

    it('should throw error when no active tab found', async () => {
      const mockQuery = vi.fn().mockResolvedValue([]);
      global.chrome.tabs.query = mockQuery;

      await expect(fileChangesActions.requestFileChangesFromContentScript()).rejects.toThrow(
        'No active tab found'
      );
    });

    it('should throw error when tab has no id', async () => {
      const mockTabs = [{}];
      const mockQuery = vi.fn().mockResolvedValue(mockTabs);
      global.chrome.tabs.query = mockQuery;

      await expect(fileChangesActions.requestFileChangesFromContentScript()).rejects.toThrow(
        'No active tab found'
      );
    });

    it('should handle chrome tabs query error', async () => {
      const mockQuery = vi.fn().mockRejectedValue(new Error('Query failed'));
      global.chrome.tabs.query = mockQuery;

      await expect(fileChangesActions.requestFileChangesFromContentScript()).rejects.toThrow(
        'Query failed'
      );
    });
  });

  describe('fileChangesActions.getCurrentState', () => {
    it('should return current state', async () => {
      const fileChangesMap = new Map([['test.ts', mockFileChange]]);
      fileChangesStore.set({ showModal: true, fileChanges: fileChangesMap });

      const state = await fileChangesActions.getCurrentState();

      expect(state.showModal).toBe(true);
      expect(state.fileChanges).toBe(fileChangesMap);
    });

    it('should return default state when store is reset', async () => {
      const state = await fileChangesActions.getCurrentState();

      expect(state).toEqual(defaultState);
    });

    it('should not affect store subscription', async () => {
      const fileChangesMap = new Map([['test.ts', mockFileChange]]);
      fileChangesStore.set({ showModal: true, fileChanges: fileChangesMap });

      await fileChangesActions.getCurrentState();

      const state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges).toBe(fileChangesMap);
    });
  });

  describe('fileChangesActions.reset', () => {
    it('should reset state to initial values', () => {
      const fileChangesMap = new Map([['test.ts', mockFileChange]]);
      fileChangesStore.set({ showModal: true, fileChanges: fileChangesMap });

      fileChangesActions.reset();

      const state = get(fileChangesStore);
      expect(state).toEqual(defaultState);
    });

    it('should be idempotent when already at default state', () => {
      fileChangesActions.reset();

      const state = get(fileChangesStore);
      expect(state).toEqual(defaultState);
    });

    it('should clear all file changes', () => {
      const multipleChanges = new Map([
        ['file1.ts', mockFileChange],
        ['file2.ts', mockFileChange],
        ['file3.ts', mockFileChange],
      ]);
      fileChangesStore.set({ showModal: true, fileChanges: multipleChanges });

      fileChangesActions.reset();

      const state = get(fileChangesStore);
      expect(state.fileChanges).toBe(null);
      expect(state.showModal).toBe(false);
    });
  });

  describe('fileChangesActions.debugFileChanges', () => {
    it('should execute without errors when fileChanges is null', () => {
      fileChangesStore.set({ showModal: false, fileChanges: null });

      expect(() => fileChangesActions.debugFileChanges()).not.toThrow();
    });

    it('should execute without errors when fileChanges is empty', () => {
      const emptyMap = new Map<string, FileChange>();
      fileChangesStore.set({ showModal: false, fileChanges: emptyMap });

      expect(() => fileChangesActions.debugFileChanges()).not.toThrow();
    });

    it('should execute without errors with various file statuses', () => {
      const mixedChanges = new Map<string, FileChange>([
        ['added.ts', { path: 'added.ts', status: 'added', content: 'new' }],
        [
          'modified.ts',
          { path: 'modified.ts', status: 'modified', content: 'new', previousContent: 'old' },
        ],
        [
          'deleted.ts',
          { path: 'deleted.ts', status: 'deleted', content: '', previousContent: 'old' },
        ],
        ['unchanged.ts', { path: 'unchanged.ts', status: 'unchanged', content: 'same' }],
      ]);
      fileChangesStore.set({ showModal: false, fileChanges: mixedChanges });

      expect(() => fileChangesActions.debugFileChanges()).not.toThrow();
    });
  });

  describe('store integration scenarios', () => {
    it('should handle complete file changes workflow', async () => {
      const changes: Record<string, FileChange> = {
        'test.ts': mockFileChange,
      };
      const projectId = 'project-123';

      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue({
        storedFileChanges: {
          projectId,
          changes,
        },
      });
      global.chrome.storage.local.set = mockSet;
      global.chrome.storage.local.get = mockGet;

      await fileChangesActions.processFileChangesMessage(changes, projectId);

      let state = get(fileChangesStore);
      expect(state.showModal).toBe(true);
      expect(state.fileChanges?.get('test.ts')).toEqual(mockFileChange);

      fileChangesActions.hideModal();

      state = get(fileChangesStore);
      expect(state.showModal).toBe(false);
      expect(state.fileChanges?.get('test.ts')).toEqual(mockFileChange);

      const loaded = await fileChangesActions.loadStoredFileChanges(projectId);

      expect(loaded).toBe(true);
      state = get(fileChangesStore);
      expect(state.showModal).toBe(true);

      fileChangesActions.reset();

      state = get(fileChangesStore);
      expect(state).toEqual(defaultState);
    });

    it('should handle modal show/hide cycles', () => {
      const fileChangesMap = new Map([['test.ts', mockFileChange]]);

      fileChangesActions.showModal(fileChangesMap);
      expect(get(fileChangesStore).showModal).toBe(true);

      fileChangesActions.hideModal();
      expect(get(fileChangesStore).showModal).toBe(false);

      fileChangesActions.showModal();
      expect(get(fileChangesStore).showModal).toBe(true);

      fileChangesActions.hideModal();
      expect(get(fileChangesStore).showModal).toBe(false);
    });

    it('should maintain file changes across modal visibility changes', () => {
      const file1: FileChange = { path: 'file1.ts', status: 'added', content: 'content1' };
      const file2: FileChange = {
        path: 'file2.ts',
        status: 'modified',
        content: 'content2',
        previousContent: 'old2',
      };
      const fileChangesMap = new Map<string, FileChange>([
        ['file1.ts', file1],
        ['file2.ts', file2],
      ]);

      fileChangesActions.setFileChanges(fileChangesMap);
      fileChangesActions.showModal();

      expect(get(fileChangesStore).fileChanges?.size).toBe(2);

      fileChangesActions.hideModal();

      expect(get(fileChangesStore).fileChanges?.size).toBe(2);

      fileChangesActions.showModal();

      const state = get(fileChangesStore);
      expect(state.fileChanges?.size).toBe(2);
      expect(state.showModal).toBe(true);
    });

    it('should handle rapid state changes', async () => {
      const fileChangesMap1 = new Map([['test1.ts', mockFileChange]]);
      const fileChangesMap2 = new Map([['test2.ts', mockFileChange]]);

      fileChangesActions.setFileChanges(fileChangesMap1);
      fileChangesActions.showModal();
      fileChangesActions.hideModal();
      fileChangesActions.setFileChanges(fileChangesMap2);
      fileChangesActions.showModal();

      const state = await fileChangesActions.getCurrentState();
      expect(state.showModal).toBe(true);
      expect(state.fileChanges?.has('test2.ts')).toBe(true);
      expect(state.fileChanges?.has('test1.ts')).toBe(false);
    });
  });
});
