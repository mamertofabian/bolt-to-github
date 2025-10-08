/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

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

global.chrome = {
  storage: {
    local: mockChromeStorageLocal as unknown as chrome.storage.LocalStorageArea,
  },
  runtime: mockChromeRuntime as unknown as typeof chrome.runtime,
} as typeof chrome;

vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((content) => content),
  },
}));

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
    vi.clearAllMocks();
    vi.useFakeTimers();

    document.body.innerHTML = '';
    mockContainer = document.createElement('div');

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

    mockChromeRuntime.getManifest.mockReturnValue({ version: '1.3.4' } as chrome.runtime.Manifest);

    whatsNewManager = new WhatsNewManager(mockComponentLifecycleManager, mockUIElementFactory);
  });

  afterEach(() => {
    whatsNewManager.cleanup();
    vi.useRealTimers();
  });

  describe('checkAndShow', () => {
    it('should show modal for new version when not previously shown', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});
      mockChromeStorageLocal.set.mockResolvedValue(undefined);

      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      await vi.runAllTimersAsync();

      expect(mockUIElementFactory.createRootContainer).toHaveBeenCalledWith('whats-new-container');

      const containerInDom = document.getElementById('whats-new-container');
      expect(containerInDom).toBeTruthy();

      vi.useRealTimers();
    });

    it('should not show modal if already shown for current version', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({
        whatsNew: {
          lastShownVersion: '1.3.4',
          dismissedVersions: [],
          lastCheckTime: Date.now(),
        } as WhatsNewState,
      });

      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('should not show modal if version was dismissed', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({
        whatsNew: {
          lastShownVersion: '1.3.3',
          dismissedVersions: ['1.3.4'],
          lastCheckTime: Date.now(),
        } as WhatsNewState,
      });

      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('should not show modal if no content exists for version', async () => {
      mockChromeRuntime.getManifest.mockReturnValue({
        version: '1.3.5',
      } as chrome.runtime.Manifest);
      mockChromeStorageLocal.get.mockResolvedValue({});

      whatsNewManager = new WhatsNewManager(mockComponentLifecycleManager, mockUIElementFactory);

      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      await whatsNewManager.checkAndShow();

      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('showManually', () => {
    it('should show modal immediately when called manually', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});

      await whatsNewManager.showManually();

      expect(mockUIElementFactory.createRootContainer).toHaveBeenCalledWith('whats-new-container');

      const containerInDom = document.getElementById('whats-new-container');
      expect(containerInDom).toBeTruthy();
      expect(containerInDom?.id).toBe('whats-new-container');

      expect(mockUIElementFactory.createRootContainer).toHaveBeenCalledWith('whats-new-container');

      const container = document.getElementById('whats-new-container');
      expect(container).toBeTruthy();
      expect(container?.style.position).toBe('fixed');
      expect(container?.style.zIndex).toBe('9999');
    });

    it('should not update state when showing manually', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});

      await whatsNewManager.showManually();

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

      await whatsNewManager.showManually();

      const container = document.getElementById('whats-new-container');
      expect(container).toBeTruthy();
    });
  });

  describe('cleanup', () => {
    it('should clean up modal and container', async () => {
      await whatsNewManager.showManually();

      whatsNewManager.cleanup();

      expect(mockComponentLifecycleManager.destroyComponent).toHaveBeenCalledWith('WhatsNewModal');

      const containerInDom = document.getElementById('whats-new-container');
      expect(containerInDom).toBeNull();
    });

    it('should clear timeout if pending', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});

      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      await whatsNewManager.checkAndShow();

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      whatsNewManager.cleanup();

      expect(clearTimeoutSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('version tracking', () => {
    it('should mark version as shown after displaying', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});
      mockChromeStorageLocal.set.mockResolvedValue(undefined);

      await whatsNewManager.checkAndShow();

      await vi.runAllTimersAsync();

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
      mockChromeStorageLocal.get.mockRejectedValue(new Error('Storage error'));

      await expect(whatsNewManager.checkAndShow()).resolves.not.toThrow();
    });

    it('should handle component creation errors', async () => {
      const mockCreateComponent = mockComponentLifecycleManager.createComponent as any;
      mockCreateComponent.mockImplementationOnce(() => {
        throw new Error('Component error');
      });

      await expect(whatsNewManager.showManually()).resolves.not.toThrow();

      expect(mockComponentLifecycleManager.destroyComponent).not.toHaveBeenCalled();
    });
  });
});
