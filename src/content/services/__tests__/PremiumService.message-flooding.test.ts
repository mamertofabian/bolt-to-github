/**
 * Test for Premium Service message flooding prevention
 */

import { PremiumService } from '../PremiumService';

// Mock the logger
jest.mock('../../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock Chrome storage
const mockChromeStorage = {
  local: {
    get: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(undefined),
  },
  sync: {
    set: jest.fn().mockResolvedValue(undefined),
  },
};

Object.defineProperty(global, 'chrome', {
  value: {
    storage: mockChromeStorage,
  },
  writable: true,
});

describe('PremiumService Message Flooding Prevention', () => {
  let premiumService: PremiumService;

  beforeEach(() => {
    jest.clearAllMocks();
    premiumService = new PremiumService();
  });

  test('should debounce rapid save operations', async () => {
    // Rapidly trigger multiple updates
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        premiumService.updatePremiumStatus({
          isPremium: i % 2 === 0,
          isAuthenticated: true,
        })
      );
    }

    await Promise.all(promises);

    // Wait for debounce to complete
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Should have made far fewer storage calls than updates
    expect(mockChromeStorage.local.set).toHaveBeenCalledTimes(1);
    expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(1);
  });

  test('should throttle rapid status updates', async () => {
    const startTime = Date.now();

    // Rapidly trigger multiple status updates
    for (let i = 0; i < 5; i++) {
      await premiumService.updatePremiumStatus({
        isPremium: i % 2 === 0,
        isAuthenticated: true,
      });
    }

    const endTime = Date.now();

    // Should complete quickly due to throttling (not waiting for each operation)
    expect(endTime - startTime).toBeLessThan(100);

    // Wait for debounce to complete
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Storage should be called (via debounced save)
    expect(mockChromeStorage.local.set).toHaveBeenCalled();
  });

  test('should not save data when content is identical', async () => {
    const statusUpdate = {
      isPremium: true,
      isAuthenticated: true,
    };

    // First update
    await premiumService.updatePremiumStatus(statusUpdate);

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 600));

    const firstCallCount = mockChromeStorage.local.set.mock.calls.length;

    // Same update again
    await premiumService.updatePremiumStatus(statusUpdate);

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Should not have triggered additional storage calls for identical data
    expect(mockChromeStorage.local.set.mock.calls.length).toBe(firstCallCount);
  });
});
