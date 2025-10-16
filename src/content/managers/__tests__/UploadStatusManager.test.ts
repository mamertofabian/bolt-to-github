/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Mocked } from 'vitest';
import type { UploadStatusState } from '../../../lib/types';
import type { UIStateManager } from '../../services/UIStateManager';
import { UploadStatusManager } from '../UploadStatusManager';

const mockSvelteComponent = {
  $set: vi.fn(),
  $destroy: vi.fn(),
  $on: vi.fn(),
};

vi.mock('../../UploadStatus.svelte', () => ({
  default: class MockUploadStatus {
    constructor() {
      Object.assign(this, mockSvelteComponent);
    }
    $set = mockSvelteComponent.$set;
    $destroy = mockSvelteComponent.$destroy;
    $on = mockSvelteComponent.$on;
  },
}));

describe('UploadStatusManager', () => {
  let uploadStatusManager: UploadStatusManager;
  let mockStateManager: Mocked<UIStateManager>;

  beforeEach(() => {
    document.body.innerHTML = '';

    vi.clearAllMocks();

    mockStateManager = {
      setUploadStatus: vi.fn(),
    } as any;

    uploadStatusManager = new UploadStatusManager(mockStateManager);
  });

  afterEach(() => {
    uploadStatusManager.cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('initializes without state manager', () => {
      const manager = new UploadStatusManager();
      expect(manager).toBeInstanceOf(UploadStatusManager);
      expect(manager.isInitialized()).toBe(false);
    });

    test('initializes with state manager', () => {
      expect(uploadStatusManager).toBeInstanceOf(UploadStatusManager);
      expect(uploadStatusManager.isInitialized()).toBe(false);
    });

    test('creates container element with correct positioning', () => {
      uploadStatusManager.initialize();

      const container = document.getElementById('bolt-to-github-upload-status-container');
      expect(container).toBeTruthy();
      expect(container?.style.position).toBe('fixed');
      expect(container?.style.top).toBe('4rem');
      expect(container?.style.right).toBe('1rem');
      expect(container?.style.zIndex).toBe('10001');
    });

    test('removes existing container before creating new one', () => {
      const existingContainer = document.createElement('div');
      existingContainer.id = 'bolt-to-github-upload-status-container';
      document.body.appendChild(existingContainer);

      uploadStatusManager.initialize();

      const containers = document.querySelectorAll('#bolt-to-github-upload-status-container');
      expect(containers.length).toBe(1);
    });

    test('handles document body not being available', () => {
      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        writable: true,
        value: null,
      });

      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      uploadStatusManager.initialize();

      expect(addEventListenerSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));

      Object.defineProperty(document, 'body', {
        writable: true,
        value: originalBody,
      });
    });

    test('sets initialized state correctly', () => {
      expect(uploadStatusManager.isInitialized()).toBe(false);

      uploadStatusManager.initialize();

      expect(uploadStatusManager.isInitialized()).toBe(true);
    });
  });

  describe('Status Updates', () => {
    beforeEach(() => {
      uploadStatusManager.initialize();
    });

    test('updates status on initialized component', () => {
      const status: UploadStatusState = {
        status: 'uploading',
        progress: 50,
        message: 'Uploading files...',
      };

      uploadStatusManager.updateStatus(status);

      expect(mockSvelteComponent.$set).toHaveBeenCalledWith({ status });
    });

    test('updates state manager when available', () => {
      const status: UploadStatusState = {
        status: 'success',
        progress: 100,
        message: 'Upload complete',
      };

      uploadStatusManager.updateStatus(status);

      expect(mockStateManager.setUploadStatus).toHaveBeenCalledWith(status);
    });

    test('initializes component if not already initialized', () => {
      const uninitializedManager = new UploadStatusManager(mockStateManager);
      const initSpy = vi.spyOn(uninitializedManager, 'initialize');

      const status: UploadStatusState = {
        status: 'uploading',
        progress: 25,
        message: 'Starting upload...',
      };

      uninitializedManager.updateStatus(status);

      expect(initSpy).toHaveBeenCalled();
    });

    test('handles missing container gracefully', () => {
      const container = document.getElementById('bolt-to-github-upload-status-container');
      container?.remove();

      const status: UploadStatusState = {
        status: 'error',
        progress: 0,
        message: 'Upload failed',
      };

      expect(() => {
        uploadStatusManager.updateStatus(status);
      }).not.toThrow();
    });

    test('handles different status types correctly', () => {
      const statuses: UploadStatusState[] = [
        { status: 'idle', progress: 0, message: '' },
        { status: 'uploading', progress: 30, message: 'Uploading...' },
        { status: 'success', progress: 100, message: 'Complete!' },
        { status: 'error', progress: 0, message: 'Failed!' },
      ];

      statuses.forEach((status) => {
        uploadStatusManager.updateStatus(status);
        expect(mockStateManager.setUploadStatus).toHaveBeenCalledWith(status);
      });

      expect(mockStateManager.setUploadStatus).toHaveBeenCalledTimes(4);
    });

    test('handles reinitialization when container is missing', () => {
      const container = document.getElementById('bolt-to-github-upload-status-container');
      container?.remove();

      const status: UploadStatusState = {
        status: 'uploading',
        progress: 75,
        message: 'Almost done...',
      };

      expect(() => {
        uploadStatusManager.updateStatus(status);
      }).not.toThrow();
    });
  });

  describe('Position Management', () => {
    test('sets custom position correctly', () => {
      uploadStatusManager.initialize();

      const customPosition = {
        top: '50px',
        left: '100px',
        zIndex: '20000',
      };

      uploadStatusManager.setPosition(customPosition);

      const container = document.getElementById('bolt-to-github-upload-status-container');
      expect(container?.style.top).toBe('50px');
      expect(container?.style.left).toBe('100px');
      expect(container?.style.zIndex).toBe('20000');

      expect(container?.style.right).toBe('1rem');
    });

    test('updates position on existing container', () => {
      uploadStatusManager.initialize();

      const container = document.getElementById('bolt-to-github-upload-status-container');
      expect(container?.style.bottom).toBe('');

      uploadStatusManager.setPosition({
        bottom: '30px',
      });

      expect(container?.style.bottom).toBe('30px');
      expect(container?.style.top).toBe('4rem');
    });

    test('handles position update when container does not exist', () => {
      expect(() => {
        uploadStatusManager.setPosition({ top: '100px' });
      }).not.toThrow();
    });

    test('merges position with existing defaults', () => {
      uploadStatusManager.setPosition({ left: '200px' });
      uploadStatusManager.initialize();

      const container = document.getElementById('bolt-to-github-upload-status-container');
      expect(container?.style.left).toBe('200px');
      expect(container?.style.top).toBe('4rem');
      expect(container?.style.right).toBe('1rem');
    });
  });

  describe('Container Management', () => {
    test('returns correct container element', () => {
      uploadStatusManager.initialize();

      const container = uploadStatusManager.getContainer();
      const domContainer = document.getElementById('bolt-to-github-upload-status-container');

      expect(container).toBe(domContainer);
      expect(container?.id).toBe('bolt-to-github-upload-status-container');
    });

    test('returns null when container does not exist', () => {
      const container = uploadStatusManager.getContainer();
      expect(container).toBeNull();
    });

    test('container has correct attributes and styling', () => {
      uploadStatusManager.initialize();

      const container = uploadStatusManager.getContainer();
      expect(container?.style.position).toBe('fixed');
      expect(container?.id).toBe('bolt-to-github-upload-status-container');
    });
  });

  describe('State Queries', () => {
    test('reports initialization state correctly', () => {
      expect(uploadStatusManager.isInitialized()).toBe(false);

      uploadStatusManager.initialize();

      expect(uploadStatusManager.isInitialized()).toBe(true);

      uploadStatusManager.cleanup();

      expect(uploadStatusManager.isInitialized()).toBe(false);
    });

    test('initialization state persists across multiple updates', () => {
      uploadStatusManager.initialize();

      expect(uploadStatusManager.isInitialized()).toBe(true);

      uploadStatusManager.updateStatus({ status: 'uploading', progress: 25, message: 'Test' });
      uploadStatusManager.updateStatus({ status: 'success', progress: 100, message: 'Done' });

      expect(uploadStatusManager.isInitialized()).toBe(true);
    });
  });

  describe('Cleanup', () => {
    test('destroys component and removes container', () => {
      uploadStatusManager.initialize();

      const container = document.getElementById('bolt-to-github-upload-status-container');

      expect(container).toBeTruthy();
      expect(uploadStatusManager.isInitialized()).toBe(true);

      uploadStatusManager.cleanup();

      expect(mockSvelteComponent.$destroy).toHaveBeenCalled();
      expect(document.getElementById('bolt-to-github-upload-status-container')).toBeNull();
      expect(uploadStatusManager.isInitialized()).toBe(false);
    });

    test('handles cleanup when component is not initialized', () => {
      expect(() => {
        uploadStatusManager.cleanup();
      }).not.toThrow();
    });

    test('handles cleanup when container does not exist', () => {
      uploadStatusManager.initialize();

      const container = document.getElementById('bolt-to-github-upload-status-container');
      container?.remove();

      expect(() => {
        uploadStatusManager.cleanup();
      }).not.toThrow();
    });

    test('can reinitialize after cleanup', () => {
      uploadStatusManager.initialize();
      expect(uploadStatusManager.isInitialized()).toBe(true);

      uploadStatusManager.cleanup();
      expect(uploadStatusManager.isInitialized()).toBe(false);

      uploadStatusManager.initialize();
      expect(uploadStatusManager.isInitialized()).toBe(true);

      const container = document.getElementById('bolt-to-github-upload-status-container');
      expect(container).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    test('handles missing DOM gracefully', () => {
      uploadStatusManager.initialize();

      document.body.innerHTML = '';

      const status: UploadStatusState = {
        status: 'uploading',
        progress: 50,
        message: 'Test',
      };

      expect(() => {
        uploadStatusManager.updateStatus(status);
      }).not.toThrow();
    });
  });
});
