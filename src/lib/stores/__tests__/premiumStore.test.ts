import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import premiumStatusStore, {
  isAuthenticated,
  isPremium,
  premiumFeatures,
  premiumPlan,
  premiumStatusActions,
  type PopupPremiumStatus,
} from '../premiumStore';

interface StorageChange {
  newValue?: unknown;
  oldValue?: unknown;
}

type StorageChanges = Record<string, StorageChange>;
type StorageChangeListener = (changes: StorageChanges, namespace: string) => void;

const mockChromeStorage = {
  sync: {
    get: vi.fn(),
    remove: vi.fn(),
  },
  onChanged: {
    addListener: vi.fn(),
  },
};

const mockChromeRuntime = {
  sendMessage: vi.fn(),
};

global.chrome = {
  storage: mockChromeStorage,
  runtime: mockChromeRuntime,
} as unknown as typeof chrome;

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('premiumStore', () => {
  const defaultPremiumStatus: PopupPremiumStatus = {
    isAuthenticated: false,
    isPremium: false,
    plan: 'free',
    features: {
      viewFileChanges: false,
      pushReminders: false,
      branchSelector: false,
      githubIssues: false,
    },
    lastUpdated: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    premiumStatusStore.set(defaultPremiumStatus);

    mockChromeStorage.sync.get.mockResolvedValue({});
    mockChromeStorage.sync.remove.mockResolvedValue(undefined);
    mockChromeRuntime.sendMessage.mockResolvedValue(undefined);
  });

  describe('store initialization', () => {
    it('should initialize with default free status', () => {
      const state = get(premiumStatusStore);
      expect(state.isAuthenticated).toBe(false);
      expect(state.isPremium).toBe(false);
      expect(state.plan).toBe('free');
      expect(state.features).toEqual({
        viewFileChanges: false,
        pushReminders: false,
        branchSelector: false,
        githubIssues: false,
      });
      expect(state.lastUpdated).toBe(0);
    });
  });

  describe('derived stores', () => {
    it('should derive isAuthenticated correctly', () => {
      premiumStatusStore.set({ ...defaultPremiumStatus, isAuthenticated: true });
      expect(get(isAuthenticated)).toBe(true);

      premiumStatusStore.set({ ...defaultPremiumStatus, isAuthenticated: false });
      expect(get(isAuthenticated)).toBe(false);
    });

    it('should derive isPremium correctly', () => {
      premiumStatusStore.set({ ...defaultPremiumStatus, isPremium: true });
      expect(get(isPremium)).toBe(true);

      premiumStatusStore.set({ ...defaultPremiumStatus, isPremium: false });
      expect(get(isPremium)).toBe(false);
    });

    it('should derive premiumPlan correctly', () => {
      premiumStatusStore.set({ ...defaultPremiumStatus, plan: 'pro' });
      expect(get(premiumPlan)).toBe('pro');

      premiumStatusStore.set({ ...defaultPremiumStatus, plan: 'free' });
      expect(get(premiumPlan)).toBe('free');
    });

    it('should derive premiumFeatures correctly', () => {
      const features = {
        viewFileChanges: true,
        pushReminders: true,
        branchSelector: false,
        githubIssues: false,
      };
      premiumStatusStore.set({ ...defaultPremiumStatus, features });
      expect(get(premiumFeatures)).toEqual(features);
    });
  });

  describe('premiumStatusActions.loadPremiumStatus', () => {
    it('should load premium status from Chrome storage', async () => {
      const storedStatus: PopupPremiumStatus = {
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        expiresAt: Date.now() + 86400000,
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        popupPremiumStatus: storedStatus,
      });

      await premiumStatusActions.loadPremiumStatus();

      expect(mockChromeStorage.sync.get).toHaveBeenCalledWith(['popupPremiumStatus']);
      expect(get(premiumStatusStore)).toEqual(storedStatus);
    });

    it('should handle missing premium status in storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({});

      await premiumStatusActions.loadPremiumStatus();

      expect(get(premiumStatusStore)).toEqual(defaultPremiumStatus);
    });

    it('should default isAuthenticated to false for backward compatibility', async () => {
      const legacyStatus = {
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        popupPremiumStatus: legacyStatus,
      });

      await premiumStatusActions.loadPremiumStatus();

      const state = get(premiumStatusStore);
      expect(state.isAuthenticated).toBe(false);
    });

    it('should handle storage errors gracefully', async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error('Storage error'));

      await expect(premiumStatusActions.loadPremiumStatus()).resolves.not.toThrow();

      expect(get(premiumStatusStore)).toEqual(defaultPremiumStatus);
    });
  });

  describe('premiumStatusActions.initialize', () => {
    it('should load initial status and set up storage listener', async () => {
      const storedStatus: PopupPremiumStatus = {
        isAuthenticated: true,
        isPremium: false,
        plan: 'free',
        features: {
          viewFileChanges: false,
          pushReminders: false,
          branchSelector: false,
          githubIssues: false,
        },
        lastUpdated: Date.now(),
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        popupPremiumStatus: storedStatus,
      });

      await premiumStatusActions.initialize();

      expect(mockChromeStorage.sync.get).toHaveBeenCalledWith(['popupPremiumStatus']);
      expect(mockChromeStorage.onChanged.addListener).toHaveBeenCalled();
      expect(get(premiumStatusStore)).toEqual(storedStatus);
    });

    it('should update store when storage changes', async () => {
      let storageListener: StorageChangeListener | null = null;

      mockChromeStorage.onChanged.addListener.mockImplementation((callback) => {
        storageListener = callback;
      });

      await premiumStatusActions.initialize();

      expect(storageListener).not.toBeNull();

      const updatedStatus: PopupPremiumStatus = {
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      };

      storageListener!(
        {
          popupPremiumStatus: {
            newValue: updatedStatus,
            oldValue: defaultPremiumStatus,
          },
        },
        'sync'
      );

      expect(get(premiumStatusStore)).toEqual(updatedStatus);
    });

    it('should ignore storage changes from other namespaces', async () => {
      let storageListener: StorageChangeListener | null = null;

      mockChromeStorage.onChanged.addListener.mockImplementation((callback) => {
        storageListener = callback;
      });

      await premiumStatusActions.initialize();

      const initialState = get(premiumStatusStore);

      storageListener!(
        {
          popupPremiumStatus: {
            newValue: { ...defaultPremiumStatus, isPremium: true },
          },
        },
        'local'
      );

      expect(get(premiumStatusStore)).toEqual(initialState);
    });

    it('should ignore storage changes for other keys', async () => {
      let storageListener: StorageChangeListener | null = null;

      mockChromeStorage.onChanged.addListener.mockImplementation((callback) => {
        storageListener = callback;
      });

      await premiumStatusActions.initialize();

      const initialState = get(premiumStatusStore);

      storageListener!(
        {
          someOtherKey: {
            newValue: 'some value',
          },
        },
        'sync'
      );

      expect(get(premiumStatusStore)).toEqual(initialState);
    });
  });

  describe('premiumStatusActions.getCurrentStatus', () => {
    it('should return current premium status', async () => {
      const testStatus: PopupPremiumStatus = {
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      };

      premiumStatusStore.set(testStatus);

      const status = await premiumStatusActions.getCurrentStatus();

      expect(status).toEqual(testStatus);
    });

    it('should return status immediately without waiting', async () => {
      const testStatus: PopupPremiumStatus = {
        isAuthenticated: false,
        isPremium: false,
        plan: 'free',
        features: {
          viewFileChanges: false,
          pushReminders: false,
          branchSelector: false,
          githubIssues: false,
        },
        lastUpdated: Date.now(),
      };

      premiumStatusStore.set(testStatus);

      const startTime = Date.now();
      const status = await premiumStatusActions.getCurrentStatus();
      const elapsed = Date.now() - startTime;

      expect(status).toEqual(testStatus);
      expect(elapsed).toBeLessThan(10);
    });
  });

  describe('premiumStatusActions.refresh', () => {
    it('should reload premium status from storage', async () => {
      const updatedStatus: PopupPremiumStatus = {
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        popupPremiumStatus: updatedStatus,
      });

      await premiumStatusActions.refresh();

      expect(mockChromeStorage.sync.get).toHaveBeenCalledWith(['popupPremiumStatus']);
      expect(get(premiumStatusStore)).toEqual(updatedStatus);
    });
  });

  describe('premiumStatusActions.logout', () => {
    it('should send logout message to background script', async () => {
      await premiumStatusActions.logout();

      expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith({
        type: 'USER_LOGOUT',
      });
    });

    it('should clear popup premium status from sync storage', async () => {
      await premiumStatusActions.logout();

      expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith(['popupPremiumStatus']);
    });

    it('should reset store to default free status', async () => {
      premiumStatusStore.set({
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now() - 1000,
      });

      await premiumStatusActions.logout();

      const state = get(premiumStatusStore);
      expect(state.isAuthenticated).toBe(false);
      expect(state.isPremium).toBe(false);
      expect(state.plan).toBe('free');
      expect(state.features).toEqual({
        viewFileChanges: false,
        pushReminders: false,
        branchSelector: false,
        githubIssues: false,
      });
      expect(state.lastUpdated).toBeGreaterThan(0);
    });

    it('should update lastUpdated timestamp on logout', async () => {
      const beforeLogout = Date.now();

      await premiumStatusActions.logout();

      const state = get(premiumStatusStore);
      expect(state.lastUpdated).toBeGreaterThanOrEqual(beforeLogout);
    });

    it('should handle errors during logout', async () => {
      mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Network error'));

      await expect(premiumStatusActions.logout()).rejects.toThrow('Network error');
    });

    it('should still clear local state even if sendMessage fails', async () => {
      mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Network error'));
      mockChromeStorage.sync.remove.mockResolvedValue(undefined);

      try {
        await premiumStatusActions.logout();
      } catch {
        console.error('Expected error during logout');
      }

      expect(mockChromeStorage.sync.remove).not.toHaveBeenCalled();
    });

    it('should handle storage removal errors', async () => {
      mockChromeRuntime.sendMessage.mockResolvedValue(undefined);
      mockChromeStorage.sync.remove.mockRejectedValue(new Error('Storage error'));

      await expect(premiumStatusActions.logout()).rejects.toThrow('Storage error');
    });
  });

  describe('UI state combinations', () => {
    it('should represent signed out user state correctly', () => {
      premiumStatusStore.set({
        isAuthenticated: false,
        isPremium: false,
        plan: 'free',
        features: {
          viewFileChanges: false,
          pushReminders: false,
          branchSelector: false,
          githubIssues: false,
        },
        lastUpdated: Date.now(),
      });

      const state = get(premiumStatusStore);
      expect(state.isAuthenticated).toBe(false);
      expect(state.isPremium).toBe(false);
    });

    it('should represent signed in free user state correctly', () => {
      premiumStatusStore.set({
        isAuthenticated: true,
        isPremium: false,
        plan: 'free',
        features: {
          viewFileChanges: false,
          pushReminders: false,
          branchSelector: false,
          githubIssues: false,
        },
        lastUpdated: Date.now(),
      });

      const state = get(premiumStatusStore);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isPremium).toBe(false);
    });

    it('should represent premium user state correctly', () => {
      premiumStatusStore.set({
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      });

      const state = get(premiumStatusStore);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isPremium).toBe(true);
    });

    it('should include expiration time for premium users', () => {
      const expiresAt = Date.now() + 2592000000;

      premiumStatusStore.set({
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        expiresAt,
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      });

      const state = get(premiumStatusStore);
      expect(state.expiresAt).toBe(expiresAt);
    });
  });

  describe('feature flags', () => {
    it('should handle partial feature access', () => {
      premiumStatusStore.set({
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: false,
          branchSelector: true,
          githubIssues: false,
        },
        lastUpdated: Date.now(),
      });

      const features = get(premiumFeatures);
      expect(features.viewFileChanges).toBe(true);
      expect(features.pushReminders).toBe(false);
      expect(features.branchSelector).toBe(true);
      expect(features.githubIssues).toBe(false);
    });

    it('should handle all features enabled', () => {
      premiumStatusStore.set({
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      });

      const features = get(premiumFeatures);
      expect(Object.values(features).every((value) => value === true)).toBe(true);
    });

    it('should handle all features disabled', () => {
      premiumStatusStore.set({
        isAuthenticated: false,
        isPremium: false,
        plan: 'free',
        features: {
          viewFileChanges: false,
          pushReminders: false,
          branchSelector: false,
          githubIssues: false,
        },
        lastUpdated: Date.now(),
      });

      const features = get(premiumFeatures);
      expect(Object.values(features).every((value) => value === false)).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should handle full authentication flow', async () => {
      expect(get(isAuthenticated)).toBe(false);
      expect(get(isPremium)).toBe(false);

      const authenticatedStatus: PopupPremiumStatus = {
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        popupPremiumStatus: authenticatedStatus,
      });

      await premiumStatusActions.loadPremiumStatus();

      expect(get(isAuthenticated)).toBe(true);
      expect(get(isPremium)).toBe(true);
      expect(get(premiumPlan)).toBe('pro');
    });

    it('should handle upgrade flow', async () => {
      premiumStatusStore.set({
        isAuthenticated: true,
        isPremium: false,
        plan: 'free',
        features: {
          viewFileChanges: false,
          pushReminders: false,
          branchSelector: false,
          githubIssues: false,
        },
        lastUpdated: Date.now(),
      });

      expect(get(isPremium)).toBe(false);

      const upgradedStatus: PopupPremiumStatus = {
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        popupPremiumStatus: upgradedStatus,
      });

      await premiumStatusActions.refresh();

      expect(get(isPremium)).toBe(true);
      expect(get(premiumPlan)).toBe('pro');
    });

    it('should handle logout flow', async () => {
      premiumStatusStore.set({
        isAuthenticated: true,
        isPremium: true,
        plan: 'pro',
        features: {
          viewFileChanges: true,
          pushReminders: true,
          branchSelector: true,
          githubIssues: true,
        },
        lastUpdated: Date.now(),
      });

      expect(get(isAuthenticated)).toBe(true);

      await premiumStatusActions.logout();

      expect(get(isAuthenticated)).toBe(false);
      expect(get(isPremium)).toBe(false);
      expect(get(premiumPlan)).toBe('free');
      expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith({ type: 'USER_LOGOUT' });
    });

    it('should handle multiple rapid status updates', async () => {
      const statuses: PopupPremiumStatus[] = [
        {
          isAuthenticated: false,
          isPremium: false,
          plan: 'free',
          features: {
            viewFileChanges: false,
            pushReminders: false,
            branchSelector: false,
            githubIssues: false,
          },
          lastUpdated: Date.now(),
        },
        {
          isAuthenticated: true,
          isPremium: false,
          plan: 'free',
          features: {
            viewFileChanges: false,
            pushReminders: false,
            branchSelector: false,
            githubIssues: false,
          },
          lastUpdated: Date.now(),
        },
        {
          isAuthenticated: true,
          isPremium: true,
          plan: 'pro',
          features: {
            viewFileChanges: true,
            pushReminders: true,
            branchSelector: true,
            githubIssues: true,
          },
          lastUpdated: Date.now(),
        },
      ];

      for (const status of statuses) {
        premiumStatusStore.set(status);
      }

      const finalState = get(premiumStatusStore);
      expect(finalState).toEqual(statuses[2]);
    });
  });
});
