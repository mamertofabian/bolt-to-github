import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ProcessingStatus } from '../../types';
import { uploadStateActions, uploadStateStore, type UploadState } from '../uploadState';

interface MockPort {
  postMessage: Mock;
  disconnect: Mock;
  onMessage: {
    addListener: Mock;
  };
  onDisconnect: {
    addListener: Mock;
  };
}

describe('uploadState Store', () => {
  const defaultState: UploadState = {
    uploadProgress: 0,
    uploadStatus: 'idle',
    uploadMessage: '',
    port: null,
  };

  let mockPort: MockPort;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPort = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn(),
      },
    };

    global.chrome = {
      runtime: {
        connect: vi.fn(() => mockPort as unknown as chrome.runtime.Port),
      },
    } as unknown as typeof chrome;

    uploadStateStore.set(defaultState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('store initialization', () => {
    it('should initialize with default state', () => {
      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(0);
      expect(state.uploadStatus).toBe('idle');
      expect(state.uploadMessage).toBe('');
      expect(state.port).toBe(null);
    });
  });

  describe('uploadStateActions.initializePort', () => {
    it('should initialize Chrome runtime port connection', () => {
      uploadStateActions.initializePort();

      const state = get(uploadStateStore);
      expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'popup' });
      expect(state.port).toBe(mockPort);
    });

    it('should preserve other state when initializing port', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadProgress: 50,
        uploadStatus: 'uploading',
        uploadMessage: 'Test message',
      });

      uploadStateActions.initializePort();

      const state = get(uploadStateStore);
      expect(state.port).toBe(mockPort);
      expect(state.uploadProgress).toBe(50);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadMessage).toBe('Test message');
    });

    it('should handle error when initializing port', () => {
      const connectError = new Error('Connection failed');
      (chrome.runtime.connect as Mock).mockImplementation(() => {
        throw connectError;
      });

      uploadStateActions.initializePort();

      const state = get(uploadStateStore);
      expect(state.port).toBe(null);
    });
  });

  describe('uploadStateActions.setUploadProgress', () => {
    it('should update upload progress', () => {
      uploadStateActions.setUploadProgress(50);

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(50);
    });

    it('should clamp progress to maximum of 100', () => {
      uploadStateActions.setUploadProgress(150);

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(100);
    });

    it('should clamp progress to minimum of 0', () => {
      uploadStateActions.setUploadProgress(-50);

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(0);
    });

    it('should handle edge case of exactly 0', () => {
      uploadStateActions.setUploadProgress(0);

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(0);
    });

    it('should handle edge case of exactly 100', () => {
      uploadStateActions.setUploadProgress(100);

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(100);
    });

    it('should handle decimal values correctly', () => {
      uploadStateActions.setUploadProgress(45.67);

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(45.67);
    });

    it('should preserve other state when updating progress', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadStatus: 'uploading',
        uploadMessage: 'Uploading files',
        port: mockPort as unknown as chrome.runtime.Port,
      });

      uploadStateActions.setUploadProgress(75);

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(75);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadMessage).toBe('Uploading files');
      expect(state.port).toBe(mockPort);
    });
  });

  describe('uploadStateActions.setUploadStatus', () => {
    const statuses: ProcessingStatus[] = [
      'idle',
      'uploading',
      'success',
      'error',
      'loading',
      'analyzing',
      'complete',
    ];

    statuses.forEach((status) => {
      it(`should update upload status to '${status}'`, () => {
        uploadStateActions.setUploadStatus(status);

        const state = get(uploadStateStore);
        expect(state.uploadStatus).toBe(status);
      });
    });

    it('should preserve other state when updating status', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadProgress: 30,
        uploadMessage: 'Processing',
        port: mockPort as unknown as chrome.runtime.Port,
      });

      uploadStateActions.setUploadStatus('uploading');

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadProgress).toBe(30);
      expect(state.uploadMessage).toBe('Processing');
      expect(state.port).toBe(mockPort);
    });
  });

  describe('uploadStateActions.setUploadMessage', () => {
    it('should update upload message', () => {
      uploadStateActions.setUploadMessage('Upload in progress');

      const state = get(uploadStateStore);
      expect(state.uploadMessage).toBe('Upload in progress');
    });

    it('should handle empty string message', () => {
      uploadStateActions.setUploadMessage('');

      const state = get(uploadStateStore);
      expect(state.uploadMessage).toBe('');
    });

    it('should handle message with special characters', () => {
      const message = 'Success! 🎉 <script>alert("test")</script>';
      uploadStateActions.setUploadMessage(message);

      const state = get(uploadStateStore);
      expect(state.uploadMessage).toBe(message);
    });

    it('should handle very long message', () => {
      const longMessage = 'a'.repeat(1000);
      uploadStateActions.setUploadMessage(longMessage);

      const state = get(uploadStateStore);
      expect(state.uploadMessage).toBe(longMessage);
    });

    it('should preserve other state when updating message', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadProgress: 60,
        uploadStatus: 'uploading',
        port: mockPort as unknown as chrome.runtime.Port,
      });

      uploadStateActions.setUploadMessage('Uploading files');

      const state = get(uploadStateStore);
      expect(state.uploadMessage).toBe('Uploading files');
      expect(state.uploadProgress).toBe(60);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.port).toBe(mockPort);
    });
  });

  describe('uploadStateActions.updateUploadState', () => {
    it('should update status only', () => {
      uploadStateActions.updateUploadState('uploading');

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadProgress).toBe(0);
      expect(state.uploadMessage).toBe('');
    });

    it('should update status and progress', () => {
      uploadStateActions.updateUploadState('uploading', 50);

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadProgress).toBe(50);
      expect(state.uploadMessage).toBe('');
    });

    it('should update status, progress, and message', () => {
      uploadStateActions.updateUploadState('uploading', 75, 'Uploading files');

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadProgress).toBe(75);
      expect(state.uploadMessage).toBe('Uploading files');
    });

    it('should clamp progress to valid range when provided', () => {
      uploadStateActions.updateUploadState('uploading', 150, 'Test');

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(100);
    });

    it('should preserve existing progress when progress is undefined', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadProgress: 40,
      });

      uploadStateActions.updateUploadState('uploading', undefined, 'Test');

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(40);
    });

    it('should preserve existing message when message is undefined', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadMessage: 'Previous message',
      });

      uploadStateActions.updateUploadState('uploading', 50);

      const state = get(uploadStateStore);
      expect(state.uploadMessage).toBe('Previous message');
    });

    it('should clear message when empty string is provided', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadMessage: 'Previous message',
      });

      uploadStateActions.updateUploadState('success', 100, '');

      const state = get(uploadStateStore);
      expect(state.uploadMessage).toBe('');
    });

    it('should preserve port when updating state', () => {
      uploadStateStore.set({
        ...defaultState,
        port: mockPort as unknown as chrome.runtime.Port,
      });

      uploadStateActions.updateUploadState('uploading', 50, 'Test');

      const state = get(uploadStateStore);
      expect(state.port).toBe(mockPort);
    });
  });

  describe('uploadStateActions.sendMessage', () => {
    beforeEach(() => {
      uploadStateStore.set({
        ...defaultState,
        port: mockPort as unknown as chrome.runtime.Port,
      });
    });

    it('should send message through port', () => {
      const message = { type: 'TEST_MESSAGE', data: 'test' };

      uploadStateActions.sendMessage(message);

      expect(mockPort.postMessage).toHaveBeenCalledWith(message);
      expect(mockPort.postMessage).toHaveBeenCalledTimes(1);
    });

    it('should not throw when port is not initialized', () => {
      uploadStateStore.set({
        ...defaultState,
        port: null,
      });

      const message = { type: 'TEST_MESSAGE' };

      expect(() => uploadStateActions.sendMessage(message)).not.toThrow();
      expect(mockPort.postMessage).not.toHaveBeenCalled();
    });

    it('should handle error when sending message', () => {
      mockPort.postMessage.mockImplementation(() => {
        throw new Error('Send failed');
      });

      const message = { type: 'TEST_MESSAGE' };

      expect(() => uploadStateActions.sendMessage(message)).not.toThrow();
    });

    it('should send message with complex data structure', () => {
      const message = {
        type: 'COMPLEX_MESSAGE',
        nested: { data: 'test' },
        array: [1, 2, 3],
        number: 42,
        boolean: true,
      };

      uploadStateActions.sendMessage(message);

      expect(mockPort.postMessage).toHaveBeenCalledWith(message);
    });

    it('should not modify store state when sending message', () => {
      const stateBefore = get(uploadStateStore);
      const message = { type: 'TEST_MESSAGE' };

      uploadStateActions.sendMessage(message);

      const stateAfter = get(uploadStateStore);
      expect(stateAfter).toEqual(stateBefore);
    });
  });

  describe('uploadStateActions.handleUploadStatusMessage', () => {
    it('should handle UPLOAD_STATUS message with all properties', () => {
      const message = {
        type: 'UPLOAD_STATUS' as const,
        status: 'uploading' as ProcessingStatus,
        progress: 60,
        message: 'Uploading files',
      };

      uploadStateActions.handleUploadStatusMessage(message);

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadProgress).toBe(60);
      expect(state.uploadMessage).toBe('Uploading files');
    });

    it('should handle UPLOAD_STATUS message with only status', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadProgress: 30,
        uploadMessage: 'Previous',
      });

      const message = {
        type: 'UPLOAD_STATUS' as const,
        status: 'success' as ProcessingStatus,
      };

      uploadStateActions.handleUploadStatusMessage(message);

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('success');
      expect(state.uploadProgress).toBe(30);
      expect(state.uploadMessage).toBe('Previous');
    });

    it('should handle UPLOAD_STATUS message with undefined status', () => {
      const message = {
        type: 'UPLOAD_STATUS' as const,
        progress: 80,
        message: 'Test',
      };

      uploadStateActions.handleUploadStatusMessage(message);

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('idle');
      expect(state.uploadProgress).toBe(80);
      expect(state.uploadMessage).toBe('Test');
    });

    it('should ignore non-UPLOAD_STATUS messages', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadStatus: 'uploading',
        uploadProgress: 50,
      });

      const message = {
        type: 'OTHER_MESSAGE',
        status: 'error' as ProcessingStatus,
        progress: 100,
      };

      uploadStateActions.handleUploadStatusMessage(message as never);

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadProgress).toBe(50);
    });
  });

  describe('uploadStateActions.resetUploadState', () => {
    it('should reset upload state to initial values', () => {
      uploadStateStore.set({
        uploadProgress: 75,
        uploadStatus: 'uploading',
        uploadMessage: 'Uploading files',
        port: mockPort as unknown as chrome.runtime.Port,
      });

      uploadStateActions.resetUploadState();

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(0);
      expect(state.uploadStatus).toBe('idle');
      expect(state.uploadMessage).toBe('');
      expect(state.port).toBe(mockPort);
    });

    it('should preserve port connection when resetting', () => {
      uploadStateStore.set({
        ...defaultState,
        port: mockPort as unknown as chrome.runtime.Port,
      });

      uploadStateActions.resetUploadState();

      const state = get(uploadStateStore);
      expect(state.port).toBe(mockPort);
    });

    it('should be idempotent when already at initial values', () => {
      uploadStateActions.resetUploadState();

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(0);
      expect(state.uploadStatus).toBe('idle');
      expect(state.uploadMessage).toBe('');
    });
  });

  describe('uploadStateActions.getCurrentState', () => {
    it('should return current state', async () => {
      const expectedState: UploadState = {
        uploadProgress: 65,
        uploadStatus: 'uploading',
        uploadMessage: 'Test message',
        port: mockPort as unknown as chrome.runtime.Port,
      };

      uploadStateStore.set(expectedState);

      const state = await uploadStateActions.getCurrentState();

      expect(state).toEqual(expectedState);
    });

    it('should return default state when store is reset', async () => {
      const state = await uploadStateActions.getCurrentState();

      expect(state).toEqual(defaultState);
    });

    it('should not affect store subscription', async () => {
      uploadStateStore.set({
        ...defaultState,
        uploadProgress: 40,
      });

      await uploadStateActions.getCurrentState();

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(40);
    });

    it('should return state with port', async () => {
      uploadStateStore.set({
        ...defaultState,
        port: mockPort as unknown as chrome.runtime.Port,
      });

      const state = await uploadStateActions.getCurrentState();

      expect(state.port).toBe(mockPort);
    });
  });

  describe('uploadStateActions.disconnect', () => {
    it('should disconnect port and reset state', () => {
      uploadStateStore.set({
        uploadProgress: 50,
        uploadStatus: 'uploading',
        uploadMessage: 'Test',
        port: mockPort as unknown as chrome.runtime.Port,
      });

      uploadStateActions.disconnect();

      expect(mockPort.disconnect).toHaveBeenCalled();

      const state = get(uploadStateStore);
      expect(state).toEqual(defaultState);
    });

    it('should handle when port is null', () => {
      uploadStateStore.set({
        ...defaultState,
        uploadProgress: 30,
      });

      expect(() => uploadStateActions.disconnect()).not.toThrow();

      const state = get(uploadStateStore);
      expect(state).toEqual(defaultState);
    });

    it('should handle error when disconnecting port', () => {
      mockPort.disconnect.mockImplementation(() => {
        throw new Error('Disconnect failed');
      });

      uploadStateStore.set({
        ...defaultState,
        port: mockPort as unknown as chrome.runtime.Port,
      });

      expect(() => uploadStateActions.disconnect()).not.toThrow();

      const state = get(uploadStateStore);
      expect(state).toEqual(defaultState);
    });

    it('should reset all state properties', () => {
      uploadStateStore.set({
        uploadProgress: 100,
        uploadStatus: 'success',
        uploadMessage: 'Upload complete',
        port: mockPort as unknown as chrome.runtime.Port,
      });

      uploadStateActions.disconnect();

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(0);
      expect(state.uploadStatus).toBe('idle');
      expect(state.uploadMessage).toBe('');
      expect(state.port).toBe(null);
    });
  });

  describe('uploadStateActions.isUploading', () => {
    it('should return true when status is uploading', async () => {
      uploadStateStore.set({
        ...defaultState,
        uploadStatus: 'uploading',
      });

      const isUploading = await uploadStateActions.isUploading();

      expect(isUploading).toBe(true);
    });

    it('should return false when status is idle', async () => {
      uploadStateStore.set({
        ...defaultState,
        uploadStatus: 'idle',
      });

      const isUploading = await uploadStateActions.isUploading();

      expect(isUploading).toBe(false);
    });

    it('should return false when status is success', async () => {
      uploadStateStore.set({
        ...defaultState,
        uploadStatus: 'success',
      });

      const isUploading = await uploadStateActions.isUploading();

      expect(isUploading).toBe(false);
    });

    it('should return false when status is error', async () => {
      uploadStateStore.set({
        ...defaultState,
        uploadStatus: 'error',
      });

      const isUploading = await uploadStateActions.isUploading();

      expect(isUploading).toBe(false);
    });

    it('should return false when status is loading', async () => {
      uploadStateStore.set({
        ...defaultState,
        uploadStatus: 'loading',
      });

      const isUploading = await uploadStateActions.isUploading();

      expect(isUploading).toBe(false);
    });

    it('should not affect store subscription', async () => {
      uploadStateStore.set({
        ...defaultState,
        uploadStatus: 'uploading',
      });

      await uploadStateActions.isUploading();

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('uploading');
    });
  });

  describe('store integration scenarios', () => {
    it('should handle complete upload workflow', async () => {
      uploadStateActions.initializePort();

      let state = await uploadStateActions.getCurrentState();
      expect(state.port).toBe(mockPort);

      uploadStateActions.updateUploadState('uploading', 0, 'Starting upload');

      state = await uploadStateActions.getCurrentState();
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadProgress).toBe(0);

      uploadStateActions.setUploadProgress(50);

      state = await uploadStateActions.getCurrentState();
      expect(state.uploadProgress).toBe(50);

      uploadStateActions.updateUploadState('success', 100, 'Upload complete');

      state = await uploadStateActions.getCurrentState();
      expect(state.uploadStatus).toBe('success');
      expect(state.uploadProgress).toBe(100);

      uploadStateActions.resetUploadState();

      state = await uploadStateActions.getCurrentState();
      expect(state.uploadStatus).toBe('idle');
      expect(state.uploadProgress).toBe(0);
      expect(state.uploadMessage).toBe('');
    });

    it('should handle error during upload', async () => {
      uploadStateActions.initializePort();
      uploadStateActions.updateUploadState('uploading', 30, 'Uploading');

      let isUploading = await uploadStateActions.isUploading();
      expect(isUploading).toBe(true);

      uploadStateActions.updateUploadState('error', 30, 'Upload failed');

      isUploading = await uploadStateActions.isUploading();
      expect(isUploading).toBe(false);

      const state = await uploadStateActions.getCurrentState();
      expect(state.uploadStatus).toBe('error');
      expect(state.uploadMessage).toBe('Upload failed');
    });

    it('should handle message communication workflow', () => {
      uploadStateActions.initializePort();

      const message = { type: 'START_UPLOAD', data: 'test' };
      uploadStateActions.sendMessage(message);

      expect(mockPort.postMessage).toHaveBeenCalledWith(message);

      const statusMessage = {
        type: 'UPLOAD_STATUS' as const,
        status: 'uploading' as ProcessingStatus,
        progress: 25,
        message: 'Processing files',
      };

      uploadStateActions.handleUploadStatusMessage(statusMessage);

      const state = get(uploadStateStore);
      expect(state.uploadStatus).toBe('uploading');
      expect(state.uploadProgress).toBe(25);
      expect(state.uploadMessage).toBe('Processing files');
    });

    it('should maintain state consistency across multiple operations', async () => {
      uploadStateActions.initializePort();
      uploadStateActions.setUploadStatus('loading');
      uploadStateActions.setUploadProgress(10);
      uploadStateActions.setUploadMessage('Preparing');

      const state1 = await uploadStateActions.getCurrentState();
      expect(state1.uploadStatus).toBe('loading');
      expect(state1.uploadProgress).toBe(10);
      expect(state1.uploadMessage).toBe('Preparing');

      uploadStateActions.updateUploadState('analyzing', 20);

      const state2 = await uploadStateActions.getCurrentState();
      expect(state2.uploadStatus).toBe('analyzing');
      expect(state2.uploadProgress).toBe(20);
      expect(state2.uploadMessage).toBe('Preparing');

      uploadStateActions.setUploadMessage('Analyzing files');

      const state3 = await uploadStateActions.getCurrentState();
      expect(state3.uploadMessage).toBe('Analyzing files');
    });

    it('should handle rapid state changes', () => {
      uploadStateActions.setUploadProgress(10);
      uploadStateActions.setUploadProgress(20);
      uploadStateActions.setUploadProgress(30);
      uploadStateActions.setUploadProgress(40);

      const state = get(uploadStateStore);
      expect(state.uploadProgress).toBe(40);
    });

    it('should handle disconnect during active upload', async () => {
      uploadStateActions.initializePort();
      uploadStateActions.updateUploadState('uploading', 50, 'Uploading');

      let isUploading = await uploadStateActions.isUploading();
      expect(isUploading).toBe(true);

      uploadStateActions.disconnect();

      isUploading = await uploadStateActions.isUploading();
      expect(isUploading).toBe(false);

      const state = await uploadStateActions.getCurrentState();
      expect(state).toEqual(defaultState);
    });

    it('should handle reconnection workflow', () => {
      uploadStateActions.initializePort();
      expect(get(uploadStateStore).port).toBe(mockPort);

      uploadStateActions.disconnect();
      expect(get(uploadStateStore).port).toBe(null);

      const newMockPort = {
        postMessage: vi.fn(),
        disconnect: vi.fn(),
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
      };

      (chrome.runtime.connect as Mock).mockReturnValue(
        newMockPort as unknown as chrome.runtime.Port
      );

      uploadStateActions.initializePort();

      const state = get(uploadStateStore);
      expect(state.port).toBe(newMockPort);
    });
  });
});
