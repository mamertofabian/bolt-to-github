/* eslint-env jest */

import { PremiumService } from '../PremiumService';

// Mock chrome API
global.chrome = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    create: jest.fn(),
  },
} as any;

// Mock the SupabaseAuthService import
jest.mock('../SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: jest.fn().mockReturnValue({
      validateSubscriptionStatus: jest.fn().mockResolvedValue(true),
    }),
  },
}));

describe('PremiumService', () => {
  let premiumService: PremiumService;

  beforeEach(() => {
    jest.clearAllMocks();
    premiumService = new PremiumService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('initializes with default free status', () => {
      const status = premiumService.getStatus();

      expect(status.isPremium).toBe(false);
      expect(status.isAuthenticated).toBe(false);
      expect(status.features.viewFileChanges).toBe(false);
      expect(status.features.pushReminders).toBe(false);
      expect(status.features.branchSelector).toBe(false);
      expect(status.features.githubIssues).toBe(false);
    });
  });

  describe('Status Management', () => {
    test('provides status information', () => {
      const status = premiumService.getStatus();

      expect(status).toHaveProperty('isPremium');
      expect(status).toHaveProperty('isAuthenticated');
      expect(status).toHaveProperty('features');
      expect(status.features).toHaveProperty('viewFileChanges');
      expect(status.features).toHaveProperty('pushReminders');
      expect(status.features).toHaveProperty('branchSelector');
      expect(status.features).toHaveProperty('githubIssues');
    });

    test('updates premium status', async () => {
      await premiumService.updatePremiumStatus({
        isPremium: true,
        isAuthenticated: true,
      });

      const status = premiumService.getStatus();
      expect(status.isPremium).toBe(true);
      expect(status.isAuthenticated).toBe(true);
      // Features should be enabled for premium users
      expect(status.features.viewFileChanges).toBe(true);
      expect(status.features.pushReminders).toBe(true);
    });

    test('synchronous premium check', () => {
      // Default should be false
      expect(premiumService.isPremiumSync()).toBe(false);
    });
  });

  describe('Feature Access', () => {
    test('provides synchronous feature checking', () => {
      // Default free user
      expect(premiumService.hasFeatureSync('viewFileChanges')).toBe(false);
      expect(premiumService.hasFeatureSync('pushReminders')).toBe(false);
    });

    test('file changes usage check for free users', async () => {
      const canUse = await premiumService.canUseFileChanges();

      expect(canUse.allowed).toBe(false);
      expect(canUse.reason).toBe('Premium feature required');
      expect(canUse.remaining).toBe(0);
    });
  });

  describe('Usage Information', () => {
    test('provides usage information', () => {
      const usage = premiumService.getUsageInfo();

      expect(usage).toHaveProperty('isPremium');
      expect(usage).toHaveProperty('features');
    });
  });

  describe('UI Manager Integration', () => {
    test('sets UI manager reference', () => {
      const mockUIManager = {
        updateDropdownPremiumStatus: jest.fn(),
      };

      expect(() => {
        premiumService.setUIManager(mockUIManager);
      }).not.toThrow();
    });
  });

  describe('Authentication Integration', () => {
    test('updates status from auth data', async () => {
      const authData = {
        isAuthenticated: true,
        isPremium: true,
        plan: 'monthly' as const,
      };

      await premiumService.updatePremiumStatusFromAuth(authData);

      const status = premiumService.getStatus();
      expect(status.isAuthenticated).toBe(true);
      expect(status.isPremium).toBe(true);
    });
  });

  describe('Server Integration', () => {
    test('triggers premium status check', async () => {
      // Mock chrome.runtime.sendMessage
      global.chrome.runtime = {
        sendMessage: jest.fn().mockResolvedValue({}),
      } as any;

      await premiumService.checkPremiumStatusFromServer();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'FORCE_AUTH_CHECK',
      });
    });

    test('handles server check errors gracefully', async () => {
      // Mock chrome.runtime.sendMessage to fail
      global.chrome.runtime = {
        sendMessage: jest.fn().mockRejectedValue(new Error('No connection')),
      } as any;

      // Should not throw error
      await expect(premiumService.checkPremiumStatusFromServer()).resolves.not.toThrow();
    });
  });

  describe('Upgrade Flow', () => {
    test('opens upgrade/signup page', async () => {
      premiumService.openUpgradePage();

      // The openUpgradePage method calls checkAuthenticationAndRedirect internally,
      // which is async and creates tabs, so we need to wait for the next tick
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chrome.tabs.create).toHaveBeenCalled();
    });
  });

  describe('Data Persistence', () => {
    test('saves data on status update', async () => {
      const mockSet = chrome.storage.local.set as jest.Mock;

      await premiumService.updatePremiumStatus({
        isPremium: true,
      });

      // Wait for throttled update (1000ms) and debounced save (100ms)
      // Wait for throttled update (1000ms) and debounced save (100ms)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(mockSet).toHaveBeenCalled();
    });

    test('handles storage errors gracefully', async () => {
      const mockSet = chrome.storage.local.set as jest.Mock;
      mockSet.mockRejectedValue(new Error('Storage quota exceeded'));

      // Should not throw error
      await expect(
        premiumService.updatePremiumStatus({
          isPremium: true,
        })
      ).resolves.not.toThrow();
    });
  });
});
