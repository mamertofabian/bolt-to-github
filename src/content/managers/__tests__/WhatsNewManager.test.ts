import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WhatsNewManager } from '../WhatsNewManager';
import type { IComponentLifecycleManager, IUIElementFactory } from '../WhatsNewManager';

// Mock chrome storage API
const mockChromeStorageLocal = {
  get: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
};

const mockChromeRuntime = {
  getManifest: jest.fn(),
};

// Mock global chrome object
global.chrome = {
  storage: {
    local: mockChromeStorageLocal as any,
  },
  runtime: mockChromeRuntime as any,
} as any;

// Mock WhatsNewModal component
jest.mock('$lib/components/WhatsNewModal.svelte', () => {
  const MockComponent = jest.fn().mockImplementation(function (this: any, options: any) {
    this.target = options.target;
    this.props = options.props;
    this.$destroy = jest.fn();
    this.$set = jest.fn();
    // Important: return this to ensure the component instance is created
    return this;
  });

  return {
    __esModule: true,
    default: MockComponent,
  };
});

// Mock DOMPurify
jest.mock('dompurify', () => ({
  default: {
    sanitize: jest.fn((content) => content),
  },
}));

// Mock whatsNewContent
jest.mock('$lib/constants/whatsNewContent', () => ({
  whatsNewContent: {
    '1.3.4': {
      date: '2025-01-11',
      highlights: ['Feature 1', 'Feature 2'],
      details: 'Test details',
      type: 'minor',
    },
    '1.3.3': {
      date: '2025-01-10',
      highlights: ['Fix 1'],
      details: 'Bug fixes',
      type: 'patch',
    },
  },
}));

describe('WhatsNewManager', () => {
  let whatsNewManager: WhatsNewManager;
  let mockComponentLifecycleManager: jest.Mocked<IComponentLifecycleManager>;
  let mockUIElementFactory: jest.Mocked<IUIElementFactory>;
  let mockContainer: HTMLDivElement;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock DOM
    document.body.innerHTML = '';
    mockContainer = document.createElement('div');

    // Setup mock implementations
    mockComponentLifecycleManager = {
      createComponent: jest.fn(),
      destroyComponent: jest.fn(),
      hasComponent: jest.fn().mockReturnValue(false),
    };

    mockUIElementFactory = {
      createRootContainer: jest.fn().mockImplementation((id: string) => {
        mockContainer.id = id;
        // Simulate what the real implementation does - append to body
        if (!document.getElementById(id)) {
          document.body.appendChild(mockContainer);
        }
        return mockContainer;
      }),
      createContainer: jest.fn().mockImplementation((config: { id: string }) => {
        mockContainer.id = config.id;
        return mockContainer;
      }),
    };

    // Mock manifest version
    mockChromeRuntime.getManifest.mockReturnValue({ version: '1.3.4' });

    // Create instance
    whatsNewManager = new WhatsNewManager(mockComponentLifecycleManager, mockUIElementFactory);
  });

  afterEach(() => {
    whatsNewManager.cleanup();
  });

  describe('checkAndShow', () => {
    it('should show modal for new version when not previously shown', async () => {
      // Mock storage to return no previous data
      mockChromeStorageLocal.get.mockResolvedValue({});
      mockChromeStorageLocal.set.mockResolvedValue(undefined);

      // Spy on window.setTimeout
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      // Should schedule showing after delay
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      // Fast-forward timers and run all async operations
      await jest.runAllTimersAsync();

      // Should have created container
      expect(mockUIElementFactory.createRootContainer).toHaveBeenCalledWith('whats-new-container');
      // Container should be in DOM with id
      const containerInDom = document.getElementById('whats-new-container');
      expect(containerInDom).toBeTruthy();

      jest.useRealTimers();
    });

    it('should not show modal if already shown for current version', async () => {
      // Mock storage to return current version as already shown
      mockChromeStorageLocal.get.mockResolvedValue({
        whatsNew: {
          lastShownVersion: '1.3.4',
          dismissedVersions: [],
          lastCheckTime: Date.now(),
        },
      });

      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      // Should not schedule showing
      expect(setTimeoutSpy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not show modal if version was dismissed', async () => {
      // Mock storage to return current version as dismissed
      mockChromeStorageLocal.get.mockResolvedValue({
        whatsNew: {
          lastShownVersion: '1.3.3',
          dismissedVersions: ['1.3.4'],
          lastCheckTime: Date.now(),
        },
      });

      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      // Should not schedule showing
      expect(setTimeoutSpy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not show modal if no content exists for version', async () => {
      // Mock a version with no content
      mockChromeRuntime.getManifest.mockReturnValue({ version: '1.3.5' });
      mockChromeStorageLocal.get.mockResolvedValue({});

      // Recreate manager with new version
      whatsNewManager = new WhatsNewManager(mockComponentLifecycleManager, mockUIElementFactory);

      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      // Should not schedule showing
      expect(setTimeoutSpy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('showManually', () => {
    it('should show modal immediately when called manually', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});

      await whatsNewManager.showManually();

      // Should create container immediately
      expect(mockUIElementFactory.createRootContainer).toHaveBeenCalledWith('whats-new-container');

      // Verify container is in DOM
      const containerInDom = document.getElementById('whats-new-container');
      expect(containerInDom).toBeTruthy();
      expect(containerInDom?.id).toBe('whats-new-container');

      // Should create container
      expect(mockUIElementFactory.createRootContainer).toHaveBeenCalledWith('whats-new-container');

      // Should show all versions when manual
      const WhatsNewModal = require('$lib/components/WhatsNewModal.svelte').default;
      expect(WhatsNewModal).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            showAllVersions: true,
          }),
        })
      );
    });

    it('should not update state when showing manually', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});

      await whatsNewManager.showManually();

      // Should not save state for manual showing
      expect(mockChromeStorageLocal.set).not.toHaveBeenCalled();
    });
  });

  describe('handleDontShowAgain', () => {
    it('should add current version to dismissed versions', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({
        whatsNew: {
          lastShownVersion: '1.3.3',
          dismissedVersions: ['1.3.2'],
          lastCheckTime: Date.now(),
        },
      });

      // Show modal manually first
      await whatsNewManager.showManually();

      // Get the WhatsNewModal mock
      const WhatsNewModal = require('$lib/components/WhatsNewModal.svelte').default;
      expect(WhatsNewModal).toHaveBeenCalled();

      // Get the props passed to the component
      const componentInstance = WhatsNewModal.mock.calls[0];
      const props = WhatsNewModal.mock.calls[0][0].props;
      const onDontShowAgain = props.onDontShowAgain;

      // Call the handler
      await onDontShowAgain();

      // Should update storage with dismissed version
      expect(mockChromeStorageLocal.set).toHaveBeenCalledWith({
        whatsNew: expect.objectContaining({
          dismissedVersions: ['1.3.2', '1.3.4'],
        }),
      });
    });
  });

  describe('cleanup', () => {
    it('should clean up modal and container', async () => {
      // Show modal first
      await whatsNewManager.showManually();

      // Cleanup
      whatsNewManager.cleanup();

      // Should destroy component
      expect(mockComponentLifecycleManager.destroyComponent).toHaveBeenCalledWith('WhatsNewModal');

      // Should remove container from DOM
      const containerInDom = document.getElementById('whats-new-container');
      expect(containerInDom).toBeNull();
    });

    it('should clear timeout if pending', async () => {
      // Mock storage to return no previous data so timeout will be set
      mockChromeStorageLocal.get.mockResolvedValue({});

      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      // Start check which sets timeout
      await whatsNewManager.checkAndShow();

      // Verify timeout was set
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      // Cleanup before timeout fires
      whatsNewManager.cleanup();

      // Should clear the timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('version tracking', () => {
    it('should mark version as shown after displaying', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});
      mockChromeStorageLocal.set.mockResolvedValue(undefined);

      jest.useFakeTimers();

      await whatsNewManager.checkAndShow();

      // Fast-forward to show modal and run all async operations
      await jest.runAllTimersAsync();

      // Should save state with current version
      expect(mockChromeStorageLocal.set).toHaveBeenCalledWith({
        whatsNew: expect.objectContaining({
          lastShownVersion: '1.3.4',
          lastCheckTime: expect.any(Number),
        }),
      });

      jest.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      // Mock storage error
      mockChromeStorageLocal.get.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(whatsNewManager.checkAndShow()).resolves.not.toThrow();
    });

    it('should handle component creation errors', async () => {
      // Mock component creation error
      const WhatsNewModal = require('$lib/components/WhatsNewModal.svelte').default;
      WhatsNewModal.mockImplementationOnce(() => {
        throw new Error('Component error');
      });

      // Should not throw
      await expect(whatsNewManager.showManually()).resolves.not.toThrow();

      // Should cleanup on error
      expect(mockComponentLifecycleManager.destroyComponent).not.toHaveBeenCalled();
    });
  });
});
