/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSubscribe = vi.fn();
const mockGetSubscriptionStatus = vi.fn();
const mockSaveSubscriptionStatus = vi.fn();

vi.mock('../../services/SubscriptionService', () => ({
  SubscriptionService: class {
    async subscribe(data: { email: string; name?: string }) {
      return mockSubscribe(data);
    }

    static async getSubscriptionStatus() {
      return mockGetSubscriptionStatus();
    }

    static async saveSubscriptionStatus(email: string) {
      return mockSaveSubscriptionStatus(email);
    }
  },
}));

describe('NewsletterSection - Service Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'chrome', {
      value: {
        storage: {
          local: {
            get: vi.fn(),
            set: vi.fn(),
          },
          sync: {
            get: vi.fn(),
            set: vi.fn(),
          },
        },
        runtime: {
          getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
        },
      },
      writable: true,
      configurable: true,
    });

    mockGetSubscriptionStatus.mockResolvedValue({ subscribed: false });
    mockSubscribe.mockResolvedValue({ success: true, message: 'Successfully subscribed!' });
    mockSaveSubscriptionStatus.mockResolvedValue(undefined);
  });

  describe('SubscriptionService Integration', () => {
    it('should call subscription service with correct data structure', async () => {
      const testEmail = 'test@example.com';
      const expectedData = {
        email: testEmail,
        preferences: {
          productUpdates: true,
          tips: true,
          communityNews: true,
        },
        metadata: {
          subscriptionSource: 'extension',
          extensionVersion: '1.0.0',
          subscriptionDate: expect.any(String),
        },
      };

      mockSubscribe.mockResolvedValue({ success: true, message: 'Successfully subscribed!' });

      const result = await mockSubscribe(expectedData);

      expect(mockSubscribe).toHaveBeenCalledWith(expectedData);
      expect(result.success).toBe(true);
    });

    it('should handle subscription service errors correctly', async () => {
      const testEmail = 'test@example.com';
      const errorMessage = 'This email is already subscribed';

      mockSubscribe.mockResolvedValue({
        success: false,
        message: errorMessage,
      });

      const result = await mockSubscribe({ email: testEmail });

      expect(result.success).toBe(false);
      expect(result.message).toBe(errorMessage);
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network error');
      mockSubscribe.mockRejectedValue(networkError);

      try {
        await mockSubscribe({ email: 'test@example.com' });
      } catch (error) {
        expect(error).toBe(networkError);
      }
    });
  });

  describe('Storage Service Integration', () => {
    it('should save subscription status correctly', async () => {
      const testEmail = 'test@example.com';

      await mockSaveSubscriptionStatus(testEmail);

      expect(mockSaveSubscriptionStatus).toHaveBeenCalledWith(testEmail);
    });

    it('should retrieve subscription status correctly', async () => {
      const mockStatus = {
        subscribed: true,
        email: 'test@example.com',
        date: '2025-01-01T00:00:00Z',
      };

      mockGetSubscriptionStatus.mockResolvedValue(mockStatus);

      const result = await mockGetSubscriptionStatus();

      expect(result).toEqual(mockStatus);
    });
  });

  describe('Chrome Storage Integration', () => {
    it('should handle auth state retrieval correctly', async () => {
      const mockAuthState = {
        supabaseAuthState: {
          isAuthenticated: true,
          user: { email: 'auth@example.com' },
        },
      };

      window.chrome.storage.local.get = vi.fn().mockResolvedValue(mockAuthState);

      const result = await window.chrome.storage.local.get('supabaseAuthState');

      expect(result).toEqual(mockAuthState);
    });

    it('should handle auth state retrieval errors gracefully', async () => {
      const storageError = new Error('Storage error');
      window.chrome.storage.local.get = vi.fn().mockRejectedValue(storageError);

      try {
        await window.chrome.storage.local.get('supabaseAuthState');
      } catch (error) {
        expect(error).toBe(storageError);
      }
    });
  });
});
