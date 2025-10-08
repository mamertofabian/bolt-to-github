import { PremiumService } from '../PremiumService';

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
    vi.clearAllMocks();
    premiumService = new PremiumService();
  });

  test('should debounce rapid save operations', async () => {
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

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(mockChromeStorage.local.set).toHaveBeenCalledTimes(1);
    expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(1);
  });

  test('should throttle rapid status updates', async () => {
    const startTime = Date.now();

    for (let i = 0; i < 5; i++) {
      await premiumService.updatePremiumStatus({
        isPremium: i % 2 === 0,
        isAuthenticated: true,
      });
    }

    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(100);

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(mockChromeStorage.local.set).toHaveBeenCalled();
  });

  test('should not save data when content is identical', async () => {
    const statusUpdate = {
      isPremium: true,
      isAuthenticated: true,
    };

    await premiumService.updatePremiumStatus(statusUpdate);

    await new Promise((resolve) => setTimeout(resolve, 600));

    const firstCallCount = mockChromeStorage.local.set.mock.calls.length;

    await premiumService.updatePremiumStatus(statusUpdate);

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(mockChromeStorage.local.set.mock.calls.length).toBe(firstCallCount);
  });
});
