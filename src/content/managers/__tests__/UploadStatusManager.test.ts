/* eslint-env jest */

import { UploadStatusManager } from '../UploadStatusManager';
import type { UploadStatusState } from '../../../lib/types';
import type { UIStateManager } from '../../services/UIStateManager';

// Mock the Svelte component
const mockSvelteComponent = {
  $set: jest.fn(),
  $destroy: jest.fn(),
};

jest.mock(
  '../../UploadStatus.svelte',
  () => {
    return jest.fn().mockImplementation(() => mockSvelteComponent);
  },
  { virtual: true }
);

describe('UploadStatusManager', () => {
  let uploadStatusManager: UploadStatusManager;
  let mockStateManager: jest.Mocked<UIStateManager>;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset mocks
    jest.clearAllMocks();

    // Mock state manager
    mockStateManager = {
      setUploadStatus: jest.fn(),
    } as any;

    uploadStatusManager = new UploadStatusManager(mockStateManager);

    // Mock console.log to reduce test noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    uploadStatusManager.cleanup();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
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
      expect(container?.style.top).toBe('20px');
      expect(container?.style.right).toBe('20px');
      expect(container?.style.zIndex).toBe('10000');
    });

    test('removes existing container before creating new one', () => {
      // Create a pre-existing container
      const existingContainer = document.createElement('div');
      existingContainer.id = 'bolt-to-github-upload-status-container';
      document.body.appendChild(existingContainer);

      uploadStatusManager.initialize();

      const containers = document.querySelectorAll('#bolt-to-github-upload-status-container');
      expect(containers.length).toBe(1);
    });

    test('handles document body not being available', () => {
      // Temporarily remove document.body
      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        writable: true,
        value: null,
      });

      // Mock addEventListener
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      uploadStatusManager.initialize();

      expect(addEventListenerSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));

      // Restore document.body
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
      // Create uninitialized manager
      const uninitializedManager = new UploadStatusManager(mockStateManager);
      const initSpy = jest.spyOn(uninitializedManager, 'initialize');

      const status: UploadStatusState = {
        status: 'uploading',
        progress: 25,
        message: 'Starting upload...',
      };

      uninitializedManager.updateStatus(status);

      expect(initSpy).toHaveBeenCalled();
    });

    test('handles missing container gracefully', () => {
      // Remove container after initialization
      const container = document.getElementById('bolt-to-github-upload-status-container');
      container?.remove();

      const status: UploadStatusState = {
        status: 'error',
        progress: 0,
        message: 'Upload failed',
      };

      // Should not throw error
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
      // Remove container to trigger reinitialization
      const container = document.getElementById('bolt-to-github-upload-status-container');
      container?.remove();

      const status: UploadStatusState = {
        status: 'uploading',
        progress: 75,
        message: 'Almost done...',
      };

      // Should not throw error and should attempt reinitialization
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
      // Right should still be set from default
      expect(container?.style.right).toBe('20px');
    });

    test('updates position on existing container', () => {
      uploadStatusManager.initialize();

      const container = document.getElementById('bolt-to-github-upload-status-container');
      expect(container?.style.bottom).toBe('');

      uploadStatusManager.setPosition({
        bottom: '30px',
      });

      expect(container?.style.bottom).toBe('30px');
      expect(container?.style.top).toBe('20px'); // Should maintain existing top
    });

    test('handles position update when container does not exist', () => {
      // Should not throw error
      expect(() => {
        uploadStatusManager.setPosition({ top: '100px' });
      }).not.toThrow();
    });

    test('merges position with existing defaults', () => {
      uploadStatusManager.setPosition({ left: '200px' });
      uploadStatusManager.initialize();

      const container = document.getElementById('bolt-to-github-upload-status-container');
      expect(container?.style.left).toBe('200px');
      expect(container?.style.top).toBe('20px'); // Default maintained
      expect(container?.style.right).toBe('20px'); // Default maintained
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
      // Should not throw error
      expect(() => {
        uploadStatusManager.cleanup();
      }).not.toThrow();
    });

    test('handles cleanup when container does not exist', () => {
      uploadStatusManager.initialize();

      // Manually remove container
      const container = document.getElementById('bolt-to-github-upload-status-container');
      container?.remove();

      // Should not throw error
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

      // Remove entire document body
      document.body.innerHTML = '';

      const status: UploadStatusState = {
        status: 'uploading',
        progress: 50,
        message: 'Test',
      };

      // Should not throw error
      expect(() => {
        uploadStatusManager.updateStatus(status);
      }).not.toThrow();
    });
  });
});
