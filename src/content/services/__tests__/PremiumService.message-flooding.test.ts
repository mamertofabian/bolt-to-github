import { PremiumService } from '../PremiumService';
import type { PremiumStatus } from '../PremiumService';

vi.mock('../../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockChromeStorage = {
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  },
  sync: {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({}),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const mockChromeRuntime = {
  sendMessage: vi.fn().mockResolvedValue(undefined),
};

Object.defineProperty(global, 'chrome', {
  value: {
    storage: mockChromeStorage,
    runtime: mockChromeRuntime,
  },
  writable: true,
});

describe('PremiumService - Save Operation Optimization', () => {
  let premiumService: PremiumService;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00.000Z') });
    vi.clearAllMocks();
    premiumService = new PremiumService();
  });

  afterEach(() => {
    premiumService.cleanup();
    vi.useRealTimers();
  });

  describe('Rapid status updates', () => {
    test('should save data only once after multiple rapid updates', async () => {
      const updates: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        updates.push(
          premiumService.updatePremiumStatus({
            isPremium: i % 2 === 0,
            isAuthenticated: true,
          })
        );
      }

      await Promise.all(updates);
      await vi.advanceTimersByTimeAsync(200);

      expect(mockChromeStorage.local.set).toHaveBeenCalledTimes(1);
      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(1);

      const savedStatus = mockChromeStorage.local.set.mock.calls[0][0].premiumStatus;
      expect(savedStatus.isPremium).toBe(true);
      expect(savedStatus.isAuthenticated).toBe(true);
      expect(savedStatus.features.viewFileChanges).toBe(true);
    });

    test('should save final state after rapid alternating updates', async () => {
      await premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true });
      await premiumService.updatePremiumStatus({ isPremium: false, isAuthenticated: true });
      await premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true });

      await vi.advanceTimersByTimeAsync(200);

      const savedStatus = mockChromeStorage.local.set.mock.calls[0][0].premiumStatus;
      expect(savedStatus.isPremium).toBe(true);
      expect(savedStatus.features.viewFileChanges).toBe(true);
    });

    test('should update premium status state immediately even when save is debounced', async () => {
      await premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true });

      const status = premiumService.getStatus();
      expect(status.isPremium).toBe(true);
      expect(status.isAuthenticated).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
    });
  });

  describe('Duplicate save prevention', () => {
    test('should not save when status has not changed', async () => {
      const statusUpdate: Partial<PremiumStatus> = {
        isPremium: true,
        isAuthenticated: true,
      };

      await premiumService.updatePremiumStatus(statusUpdate);
      await vi.advanceTimersByTimeAsync(200);

      expect(mockChromeStorage.local.set).toHaveBeenCalledTimes(1);
      vi.clearAllMocks();

      await premiumService.updatePremiumStatus(statusUpdate);
      await vi.advanceTimersByTimeAsync(200);

      expect(mockChromeStorage.local.set).not.toHaveBeenCalled();
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    test('should save when status changes after identical update', async () => {
      await premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true });
      await vi.advanceTimersByTimeAsync(1200);

      vi.clearAllMocks();

      await premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true });
      await vi.advanceTimersByTimeAsync(1200);

      expect(mockChromeStorage.local.set).not.toHaveBeenCalled();

      await premiumService.updatePremiumStatus({ isPremium: false, isAuthenticated: true });
      await vi.advanceTimersByTimeAsync(1200);

      expect(mockChromeStorage.local.set).toHaveBeenCalledTimes(1);
      const savedStatus = mockChromeStorage.local.set.mock.calls[0][0].premiumStatus;
      expect(savedStatus.isPremium).toBe(false);
    });
  });

  describe('Storage sync behavior', () => {
    test('should save to both local and sync storage', async () => {
      await premiumService.updatePremiumStatus({
        isPremium: true,
        isAuthenticated: true,
      });

      await vi.advanceTimersByTimeAsync(200);

      expect(mockChromeStorage.local.set).toHaveBeenCalled();
      expect(mockChromeStorage.sync.set).toHaveBeenCalled();

      const localData = mockChromeStorage.local.set.mock.calls[0][0];
      const syncData = mockChromeStorage.sync.set.mock.calls[0][0];

      expect(localData.premiumStatus.isPremium).toBe(true);
      expect(syncData.popupPremiumStatus.isPremium).toBe(true);
      expect(syncData.popupPremiumStatus.isAuthenticated).toBe(true);
    });

    test('should include all required fields in sync storage', async () => {
      await premiumService.updatePremiumStatus({
        isPremium: true,
        isAuthenticated: true,
        expiresAt: new Date('2024-12-31T23:59:59.000Z').getTime(),
      });

      await vi.advanceTimersByTimeAsync(200);

      const syncData = mockChromeStorage.sync.set.mock.calls[0][0].popupPremiumStatus;

      expect(syncData.isAuthenticated).toBe(true);
      expect(syncData.isPremium).toBe(true);
      expect(syncData.expiresAt).toBe(new Date('2024-12-31T23:59:59.000Z').getTime());
      expect(typeof syncData.lastUpdated).toBe('number');
      expect(syncData.lastUpdated).toBeGreaterThan(0);
      expect(syncData.features).toBeDefined();
      expect(syncData.features).toEqual({
        viewFileChanges: true,
        pushReminders: true,
        branchSelector: true,
        githubIssues: true,
      });
      expect(syncData.plan).toBeDefined();
    });
  });

  describe('State consistency', () => {
    test('should maintain consistent feature flags when status changes', async () => {
      await premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true });
      await vi.advanceTimersByTimeAsync(1200);

      let status = premiumService.getStatus();
      expect(status.features).toEqual({
        viewFileChanges: true,
        pushReminders: true,
        branchSelector: true,
        githubIssues: true,
      });

      await premiumService.updatePremiumStatus({ isPremium: false, isAuthenticated: true });
      await vi.advanceTimersByTimeAsync(1200);

      status = premiumService.getStatus();
      expect(status.features).toEqual({
        viewFileChanges: false,
        pushReminders: false,
        branchSelector: false,
        githubIssues: false,
      });
    });

    test('should preserve authentication state across premium toggles', async () => {
      await premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true });
      await vi.advanceTimersByTimeAsync(1200);

      await premiumService.updatePremiumStatus({ isPremium: false });
      await vi.advanceTimersByTimeAsync(1200);

      const status = premiumService.getStatus();
      expect(status.isAuthenticated).toBe(true);
      expect(status.isPremium).toBe(false);
    });
  });

  describe('Concurrent operation handling', () => {
    test('should handle concurrent updates without data corruption', async () => {
      const updatePromises = [
        premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true }),
        premiumService.updatePremiumStatus({ isPremium: false, isAuthenticated: false }),
        premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true }),
      ];

      await Promise.all(updatePromises);
      await vi.advanceTimersByTimeAsync(200);

      const status = premiumService.getStatus();
      expect(status).toMatchObject({
        isPremium: true,
        isAuthenticated: true,
      });
    });

    test('should complete all pending saves before cleanup', async () => {
      await premiumService.updatePremiumStatus({ isPremium: true, isAuthenticated: true });

      vi.advanceTimersByTime(50);

      premiumService.cleanup();

      await vi.advanceTimersByTimeAsync(150);

      expect(mockChromeStorage.onChanged.removeListener).toHaveBeenCalled();
    });
  });
});
