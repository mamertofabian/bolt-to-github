import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IComponentLifecycleManager,
  IUIElementFactory,
  WhatsNewState,
} from '../WhatsNewManager';
import { WhatsNewManager } from '../WhatsNewManager';

const mockChromeStorageLocal = {
  get: vi.fn(),
  set: vi.fn(),
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
  let componentLifecycleManager: IComponentLifecycleManager;
  let uiElementFactory: IUIElementFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date('2025-01-15T12:00:00Z') });

    document.body.innerHTML = '';

    componentLifecycleManager = {
      createComponent: vi.fn().mockImplementation(async () => ({
        $destroy: vi.fn(),
        $set: vi.fn(),
        $on: vi.fn(),
      })) as IComponentLifecycleManager['createComponent'],
      destroyComponent: vi.fn(),
      hasComponent: vi.fn().mockReturnValue(false),
    };

    uiElementFactory = {
      createRootContainer: (id: string) => {
        const container = document.createElement('div');
        container.id = id;
        document.body.appendChild(container);
        return container;
      },
      createContainer: (config: { id: string }) => {
        const container = document.createElement('div');
        container.id = config.id;
        return container;
      },
    };

    mockChromeRuntime.getManifest.mockReturnValue({ version: '1.3.4' } as chrome.runtime.Manifest);

    whatsNewManager = new WhatsNewManager(componentLifecycleManager, uiElementFactory);
  });

  afterEach(() => {
    whatsNewManager.cleanup();
    vi.useRealTimers();
  });

  describe('Automatic version update flow', () => {
    it('should schedule modal display for new version with content', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});
      mockChromeStorageLocal.set.mockResolvedValue(undefined);

      await whatsNewManager.checkAndShow();
      await vi.runAllTimersAsync();

      const container = document.getElementById('whats-new-container');
      expect(container).toBeTruthy();
      expect(container?.style.position).toBe('fixed');
      expect(container?.style.zIndex).toBe('9999');
      expect(mockChromeStorageLocal.set).toHaveBeenCalledWith({
        whatsNew: expect.objectContaining({
          lastShownVersion: '1.3.4',
          lastCheckTime: expect.any(Number),
        }),
      });
    });

    it('should not display modal for already-shown version', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({
        whatsNew: {
          lastShownVersion: '1.3.4',
          dismissedVersions: [],
          lastCheckTime: Date.now(),
        } as WhatsNewState,
      });

      await whatsNewManager.checkAndShow();
      await vi.runAllTimersAsync();

      expect(document.getElementById('whats-new-container')).toBeNull();
      expect(mockChromeStorageLocal.set).not.toHaveBeenCalled();
    });

    it('should respect user dismissal of version', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({
        whatsNew: {
          lastShownVersion: '1.3.3',
          dismissedVersions: ['1.3.4'],
          lastCheckTime: Date.now(),
        } as WhatsNewState,
      });

      await whatsNewManager.checkAndShow();
      await vi.runAllTimersAsync();

      expect(document.getElementById('whats-new-container')).toBeNull();
    });

    it('should not display modal when no content exists for version', async () => {
      mockChromeRuntime.getManifest.mockReturnValue({
        version: '1.3.5',
      } as chrome.runtime.Manifest);
      mockChromeStorageLocal.get.mockResolvedValue({});

      whatsNewManager = new WhatsNewManager(componentLifecycleManager, uiElementFactory);

      await whatsNewManager.checkAndShow();
      await vi.runAllTimersAsync();

      expect(document.getElementById('whats-new-container')).toBeNull();
    });
  });

  describe('Manual display', () => {
    it('should display modal immediately without state update', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});

      await whatsNewManager.showManually();

      const container = document.getElementById('whats-new-container');
      expect(container).toBeTruthy();
      expect(container?.style.position).toBe('fixed');
      expect(container?.style.zIndex).toBe('9999');
      expect(mockChromeStorageLocal.set).not.toHaveBeenCalled();
    });
  });

  describe('Dismissal handling', () => {
    it('should persist dismissed version when user opts out', async () => {
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

  describe('Cleanup', () => {
    it('should remove modal and container elements', async () => {
      await whatsNewManager.showManually();

      const containerBefore = document.getElementById('whats-new-container');
      expect(containerBefore).toBeTruthy();

      whatsNewManager.cleanup();

      const containerAfter = document.getElementById('whats-new-container');
      expect(containerAfter).toBeNull();
    });

    it('should cancel pending display timeout', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});

      await whatsNewManager.checkAndShow();

      whatsNewManager.cleanup();

      await vi.runAllTimersAsync();

      expect(document.getElementById('whats-new-container')).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should handle storage read errors gracefully', async () => {
      mockChromeStorageLocal.get.mockRejectedValue(new Error('Storage error'));

      await expect(whatsNewManager.checkAndShow()).resolves.not.toThrow();

      expect(document.getElementById('whats-new-container')).toBeNull();
    });

    it('should handle storage write errors without failing', async () => {
      mockChromeStorageLocal.get.mockResolvedValue({});
      mockChromeStorageLocal.set.mockRejectedValue(new Error('Write error'));

      await whatsNewManager.checkAndShow();
      await vi.runAllTimersAsync();

      const container = document.getElementById('whats-new-container');
      expect(container).toBeTruthy();
    });
  });
});
