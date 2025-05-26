import { describe, jest, beforeEach, it, expect } from '@jest/globals';
import { SubscriptionService } from '../SubscriptionService';

// Mock chrome API
const mockChrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  runtime: {
    getManifest: jest.fn(() => ({ version: '1.0.0' })),
  },
};

global.chrome = mockChrome;

// Mock fetch
global.fetch = jest.fn();

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSubscriptionStatus', () => {
    it('should return default status when no subscription exists', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});

      const status = await SubscriptionService.getSubscriptionStatus();

      expect(status).toEqual({ subscribed: false });
      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith('newsletterSubscription');
    });

    it('should return existing subscription status', async () => {
      const mockSubscription = {
        subscribed: true,
        email: 'test@example.com',
        date: '2023-01-01T00:00:00.000Z',
      };
      mockChrome.storage.sync.get.mockResolvedValue({
        newsletterSubscription: mockSubscription,
      });

      const status = await SubscriptionService.getSubscriptionStatus();

      expect(status).toEqual(mockSubscription);
    });
  });

  describe('saveSubscriptionStatus', () => {
    it('should save subscription status with current date', async () => {
      const email = 'test@example.com';
      const mockDate = new Date('2023-01-01T00:00:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      await SubscriptionService.saveSubscriptionStatus(email);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        newsletterSubscription: {
          subscribed: true,
          email,
          date: '2023-01-01T00:00:00.000Z',
        },
      });
    });
  });

  describe('getUsageStats', () => {
    it('should return default stats when none exist', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});

      const stats = await SubscriptionService.getUsageStats();

      expect(stats).toEqual({ interactionCount: 0 });
      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith('usageStats');
    });

    it('should return existing usage stats', async () => {
      const mockStats = {
        interactionCount: 5,
        lastSubscriptionPrompt: '2023-01-01T00:00:00.000Z',
      };
      mockChrome.storage.sync.get.mockResolvedValue({ usageStats: mockStats });

      const stats = await SubscriptionService.getUsageStats();

      expect(stats).toEqual(mockStats);
    });
  });

  describe('incrementInteractionCount', () => {
    it('should increment interaction count from 0', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});

      const newCount = await SubscriptionService.incrementInteractionCount();

      expect(newCount).toBe(1);
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        usageStats: {
          interactionCount: 1,
        },
      });
    });

    it('should increment existing interaction count', async () => {
      const existingStats = { interactionCount: 3, lastSubscriptionPrompt: '2023-01-01' };
      mockChrome.storage.sync.get.mockResolvedValue({ usageStats: existingStats });

      const newCount = await SubscriptionService.incrementInteractionCount();

      expect(newCount).toBe(4);
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        usageStats: {
          ...existingStats,
          interactionCount: 4,
        },
      });
    });
  });

  describe('shouldShowSubscriptionPrompt', () => {
    beforeEach(() => {
      // Mock the static methods that are called
      jest
        .spyOn(SubscriptionService, 'getSubscriptionStatus')
        .mockResolvedValue({ subscribed: false });
      jest.spyOn(SubscriptionService, 'getUsageStats').mockResolvedValue({ interactionCount: 0 });
    });

    it('should not show prompt if user is already subscribed', async () => {
      jest
        .spyOn(SubscriptionService, 'getSubscriptionStatus')
        .mockResolvedValue({ subscribed: true });

      const shouldShow = await SubscriptionService.shouldShowSubscriptionPrompt();

      expect(shouldShow).toBe(false);
    });

    it('should not show prompt if interaction count is less than 3', async () => {
      jest.spyOn(SubscriptionService, 'getUsageStats').mockResolvedValue({ interactionCount: 2 });

      const shouldShow = await SubscriptionService.shouldShowSubscriptionPrompt();

      expect(shouldShow).toBe(false);
    });

    it('should show prompt on 3rd interaction', async () => {
      jest.spyOn(SubscriptionService, 'getUsageStats').mockResolvedValue({ interactionCount: 3 });

      const shouldShow = await SubscriptionService.shouldShowSubscriptionPrompt();

      expect(shouldShow).toBe(true);
    });

    it('should show prompt on 10th interaction', async () => {
      jest.spyOn(SubscriptionService, 'getUsageStats').mockResolvedValue({ interactionCount: 10 });

      const shouldShow = await SubscriptionService.shouldShowSubscriptionPrompt();

      expect(shouldShow).toBe(true);
    });

    it('should not show prompt if last prompt was less than 30 days ago', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 15); // 15 days ago

      jest.spyOn(SubscriptionService, 'getUsageStats').mockResolvedValue({
        interactionCount: 5,
        lastSubscriptionPrompt: recentDate.toISOString(),
      });

      const shouldShow = await SubscriptionService.shouldShowSubscriptionPrompt();

      expect(shouldShow).toBe(false);
    });

    it('should show prompt if last prompt was more than 30 days ago', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days ago

      jest.spyOn(SubscriptionService, 'getUsageStats').mockResolvedValue({
        interactionCount: 5,
        lastSubscriptionPrompt: oldDate.toISOString(),
      });

      const shouldShow = await SubscriptionService.shouldShowSubscriptionPrompt();

      expect(shouldShow).toBe(false); // Should be false because interactionCount is not 3 or 10
    });
  });

  describe('subscribe', () => {
    it('should successfully subscribe with Supabase function', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          success: true,
          message: 'Successfully subscribed to newsletter',
          subscriber: { id: 'subscriber-123' },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const service = new SubscriptionService();
      const result = await service.subscribe({
        email: 'test@example.com',
        name: 'Test User',
        preferences: { productUpdates: true },
        metadata: {
          subscriptionSource: 'extension',
          extensionVersion: '1.0.0',
          subscriptionDate: '',
        },
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully subscribed to newsletter');
      expect(result.subscriptionId).toBe('subscriber-123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://gapvjcqybzabnrjnxzhg.supabase.co/functions/v1/newsletter-subscription',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"email":"test@example.com"'),
        })
      );
    });

    it('should handle Supabase function errors gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 422,
        json: async () => ({
          message: 'Email is already subscribed',
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const service = new SubscriptionService();
      const result = await service.subscribe({
        email: 'test@example.com',
        metadata: {
          subscriptionSource: 'extension',
          extensionVersion: '1.0.0',
          subscriptionDate: '',
        },
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Email is already subscribed');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

      const service = new SubscriptionService();
      const result = await service.subscribe({
        email: 'test@example.com',
        metadata: {
          subscriptionSource: 'extension',
          extensionVersion: '1.0.0',
          subscriptionDate: '',
        },
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Network error. Please check your connection and try again.');
    });
  });
});
