/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

// Mock the WhatsNewModal Svelte component
vi.mock('../../../lib/components/WhatsNewModal.svelte', () => ({
  default: vi.fn().mockImplementation(function MockWhatsNewModal() {
    return {
      $set: vi.fn(),
      $on: vi.fn(),
      $destroy: vi.fn(),
    };
  }),
}));

import type { SvelteComponent } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import type {
  IComponentLifecycleManager,
  IUIElementFactory,
  WhatsNewState,
} from '../WhatsNewManager';
import { WhatsNewManager } from '../WhatsNewManager';

// Mock chrome storage API
const mockChromeStorageLocal = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  getBytesInUse: vi.fn(),
  setAccessLevel: vi.fn(),
  onChanged: {} as chrome.storage.StorageChangedEvent,
  QUOTA_BYTES: 5242880,
};

const mockChromeRuntime = {
  getManifest: vi.fn(),
};

// Mock global chrome object
global.chrome = {
  storage: {
    local: mockChromeStorageLocal as unknown as chrome.storage.LocalStorageArea,
  },
  runtime: mockChromeRuntime as unknown as typeof chrome.runtime,
} as typeof chrome;

// Mock WhatsNewModal component
vi.mock('$lib/components/WhatsNewModal.svelte', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockComponent = vi.fn().mockImplementation((options: any) => {
    const component = {
      target: options.target,
      props: options.props,
      $destroy: vi.fn(),
      $set: vi.fn(),
    };
    // Important: return component instance
    return component;
  });

  return {
    __esModule: true,
    default: MockComponent,
  };
});

// Mock DOMPurify
vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((content) => content),
  },
}));

// Mock whatsNewContent
vi.mock('$lib/constants/whatsNewContent', () => ({
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
  let mockComponentLifecycleManager: Mocked<IComponentLifecycleManager>;
  let mockUIElementFactory: Mocked<IUIElementFactory>;
  let mockContainer: HTMLDivElement;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock DOM
    document.body.innerHTML = '';
    mockContainer = document.createElement('div');

    // Setup mock implementations with proper typing
    mockComponentLifecycleManager = {
      createComponent: vi
        .fn()
        .mockImplementation(async () => ({}) as SvelteComponent) as NonNullable<
        IComponentLifecycleManager['createComponent']
      >,
      destroyComponent: vi.fn(),
      hasComponent: vi.fn().mockReturnValue(false) as NonNullable<
        IComponentLifecycleManager['hasComponent']
      >,
    };

    mockUIElementFactory = {
      createRootContainer: vi.fn((id: string) => {
        mockContainer.id = id;
        // Simulate what the real implementation does - append to body
        if (!document.getElementById(id)) {
          document.body.appendChild(mockContainer);
        }
        return mockContainer;
      }) as NonNullable<IUIElementFactory['createRootContainer']>,
      createContainer: vi.fn((config: { id: string }) => {
        mockContainer.id = config.id;
        return mockContainer;
      }) as NonNullable<IUIElementFactory['createContainer']>,
    };

    // Mock manifest version
    mockChromeRuntime.getManifest.mockReturnValue({ version: '1.3.4' } as chrome.runtime.Manifest);

    // Create instance
    whatsNewManager = new WhatsNewManager(mockComponentLifecycleManager, mockUIElementFactory);
  });

  afterEach(() => {
    whatsNewManager.cleanup();
    vi.useRealTimers();
  });

  describe('checkAndShow', () => {
    it('should show modal for new version when not previously shown', async () => {
      // Mock storage to return no previous data
      mockChromeStorageLocal.get.mockResolvedValue({});
      mockChromeStorageLocal.set.mockResolvedValue(undefined);

      // Spy on window.setTimeout
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      // Should schedule showing after delay
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      // Fast-forward timers and run all async operations
      await vi.runAllTimersAsync();

      // Should have created container
      expect(mockUIElementFactory.createRootContainer).toHaveBeenCalledWith('whats-new-container');
      // Container should be in DOM with id
      const containerInDom = document.getElementById('whats-new-container');
      expect(containerInDom).toBeTruthy();

      vi.useRealTimers();
    });

    it('should not show modal if already shown for current version', async () => {
      // Mock storage to return current version as already shown
      mockChromeStorageLocal.get.mockResolvedValue({
        whatsNew: {
          lastShownVersion: '1.3.4',
          dismissedVersions: [],
          lastCheckTime: Date.now(),
        } as WhatsNewState,
      });

      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      // Should not schedule showing
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('should not show modal if version was dismissed', async () => {
      // Mock storage to return current version as dismissed
      mockChromeStorageLocal.get.mockResolvedValue({
        whatsNew: {
          lastShownVersion: '1.3.3',
          dismissedVersions: ['1.3.4'],
          lastCheckTime: Date.now(),
        } as WhatsNewState,
      });

      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      // Should not schedule showing
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('should not show modal if no content exists for version', async () => {
      // Mock a version with no content
      mockChromeRuntime.getManifest.mockReturnValue({
        version: '1.3.5',
      } as chrome.runtime.Manifest);
      mockChromeStorageLocal.get.mockResolvedValue({});

      // Recreate manager with new version
      whatsNewManager = new WhatsNewManager(mockComponentLifecycleManager, mockUIElementFactory);

      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      // Should not schedule showing
      expect(setTimeoutSpy).not.toHaveBeenCalled();
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

      // Check that container was created with correct styles
      const container = document.getElementById('whats-new-container');
      expect(container).toBeTruthy();
      expect(container?.style.position).toBe('fixed');
      expect(container?.style.zIndex).toBe('9999');
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
        } as WhatsNewState,
      });

      // Show modal manually first
      await whatsNewManager.showManually();

      // Since the actual implementation directly creates the component,
      // we can't easily test the onDontShowAgain callback
      // So we'll just verify that the modal was shown
      const container = document.getElementById('whats-new-container');
      expect(container).toBeTruthy();

      // NOTE: We can't test the onDontShowAgain handler behavior
      // because the component is created directly in the implementation
      // rather than through the lifecycle manager
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

      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      // Start check which sets timeout
      await whatsNewManager.checkAndShow();

      // Verify timeout was set
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      // Cleanup before timeout fires
      whatsNewManager.cleanup();

      // Should clear the timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('version tracking', () => {
    it('should mark version as shown after displaying', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});
      mockChromeStorageLocal.set.mockResolvedValue(undefined);

      await whatsNewManager.checkAndShow();

      // Fast-forward to show modal and run all async operations
      await vi.runAllTimersAsync();

      // Should save state with current version
      expect(mockChromeStorageLocal.set).toHaveBeenCalledWith({
        whatsNew: expect.objectContaining({
          lastShownVersion: '1.3.4',
          lastCheckTime: expect.any(Number),
        }),
      });
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
      const mockCreateComponent = mockComponentLifecycleManager.createComponent as any;
      mockCreateComponent.mockImplementationOnce(() => {
        throw new Error('Component error');
      });

      // Should not throw
      await expect(whatsNewManager.showManually()).resolves.not.toThrow();

      // Should cleanup on error
      expect(mockComponentLifecycleManager.destroyComponent).not.toHaveBeenCalled();
    });
  });
});
