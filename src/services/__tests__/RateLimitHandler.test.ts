import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { RateLimitHandler } from '../RateLimitHandler';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();
const FIXED_TIME_SECONDS = Math.floor(FIXED_TIME / 1000);

describe('RateLimitHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  describe('handleRateLimit - retry-after header', () => {
    it('should wait for the time specified in retry-after header', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const mockResponse = {
        headers: {
          get: (header: string) => {
            if (header === 'retry-after') return '2';
            return null;
          },
        },
      } as unknown as Response;

      const promise = rateLimitHandler.handleRateLimit(mockResponse);

      await vi.advanceTimersByTimeAsync(2000);

      await promise;

      const promise2 = rateLimitHandler.handleRateLimit(mockResponse);
      await vi.advanceTimersByTimeAsync(2000);
      await promise2;
    });

    it('should handle retry-after with larger values', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const mockResponse = {
        headers: {
          get: (header: string) => {
            if (header === 'retry-after') return '60';
            return null;
          },
        },
      } as unknown as Response;

      const promise = rateLimitHandler.handleRateLimit(mockResponse);

      await vi.advanceTimersByTimeAsync(59000);

      await vi.advanceTimersByTimeAsync(1000);
      await promise;
    });
  });

  describe('handleRateLimit - rate limit reset', () => {
    it('should wait until rate limit reset when remaining is 0', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const resetTime = FIXED_TIME_SECONDS + 30;

      const mockResponse = {
        headers: {
          get: (header: string) => {
            if (header === 'retry-after') return null;
            if (header === 'x-ratelimit-remaining') return '0';
            if (header === 'x-ratelimit-reset') return resetTime.toString();
            return null;
          },
        },
      } as unknown as Response;

      const promise = rateLimitHandler.handleRateLimit(mockResponse);

      await vi.advanceTimersByTimeAsync(30000);
      await promise;

      const promise2 = rateLimitHandler.handleRateLimit(mockResponse);
      await vi.advanceTimersByTimeAsync(30000);
      await promise2;
    });

    it('should handle rate limit reset in the past', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const resetTime = FIXED_TIME_SECONDS - 10;

      const mockResponse = {
        headers: {
          get: (header: string) => {
            if (header === 'retry-after') return null;
            if (header === 'x-ratelimit-remaining') return '0';
            if (header === 'x-ratelimit-reset') return resetTime.toString();
            return null;
          },
        },
      } as unknown as Response;

      const promise = rateLimitHandler.handleRateLimit(mockResponse);

      await vi.advanceTimersByTimeAsync(1000);
      await promise;
    });
  });

  describe('handleRateLimit - exponential backoff', () => {
    it('should use exponential backoff when no retry headers are provided', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const mockResponse = {
        headers: {
          get: (header: string) => {
            if (header === 'x-ratelimit-remaining') return '1';
            return null;
          },
        },
      } as unknown as Response;

      const promise1 = rateLimitHandler.handleRateLimit(mockResponse);
      await vi.advanceTimersByTimeAsync(1000);
      await promise1;

      const promise2 = rateLimitHandler.handleRateLimit(mockResponse);
      await vi.advanceTimersByTimeAsync(2000);
      await promise2;

      const promise3 = rateLimitHandler.handleRateLimit(mockResponse);
      await vi.advanceTimersByTimeAsync(4000);
      await promise3;

      const promise4 = rateLimitHandler.handleRateLimit(mockResponse);
      await vi.advanceTimersByTimeAsync(8000);
      await promise4;
    });

    it('should cap exponential backoff at 60 seconds', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const mockResponse = {
        headers: {
          get: (header: string) => {
            if (header === 'x-ratelimit-remaining') return '1';
            return null;
          },
        },
      } as unknown as Response;

      for (let i = 0; i < 4; i++) {
        const promise = rateLimitHandler.handleRateLimit(mockResponse);
        const expectedTime = Math.min(1000 * Math.pow(2, i), 60000);
        await vi.advanceTimersByTimeAsync(expectedTime);
        await promise;
      }
    });
  });

  describe('handleRateLimit - maximum retry attempts', () => {
    it('should throw error when maximum retry attempts are exceeded', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const mockResponse = {
        headers: {
          get: () => null,
        },
      } as unknown as Response;

      for (let i = 0; i < 5; i++) {
        const promise = rateLimitHandler.handleRateLimit(mockResponse);
        await vi.advanceTimersByTimeAsync(60000);
        await promise;
      }

      await expect(rateLimitHandler.handleRateLimit(mockResponse)).rejects.toThrow(
        'Maximum retry attempts exceeded'
      );
    });

    it('should not throw error before reaching maximum attempts', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const mockResponse = {
        headers: {
          get: () => null,
        },
      } as unknown as Response;

      for (let i = 0; i < 5; i++) {
        const promise = rateLimitHandler.handleRateLimit(mockResponse);
        await vi.advanceTimersByTimeAsync(60000);
        await expect(promise).resolves.toBeUndefined();
      }
    });
  });

  describe('resetRetryCount', () => {
    it('should reset retry count allowing more attempts', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const mockResponse = {
        headers: {
          get: () => null,
        },
      } as unknown as Response;

      for (let i = 0; i < 5; i++) {
        const promise = rateLimitHandler.handleRateLimit(mockResponse);
        await vi.advanceTimersByTimeAsync(60000);
        await promise;
      }

      rateLimitHandler.resetRetryCount();

      const promise = rateLimitHandler.handleRateLimit(mockResponse);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('beforeRequest - rate limiting', () => {
    it('should allow burst of requests without delay', async () => {
      const rateLimitHandler = new RateLimitHandler();

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await rateLimitHandler.beforeRequest();
        const endTime = Date.now();

        expect(endTime).toBe(startTime);
      }
    });

    it('should enforce minimum interval after burst limit', async () => {
      const rateLimitHandler = new RateLimitHandler();

      for (let i = 0; i < 10; i++) {
        await rateLimitHandler.beforeRequest();
      }

      const timeAfterBurst = Date.now();

      const promise = rateLimitHandler.beforeRequest();

      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(Date.now()).toBe(timeAfterBurst + 1000);
    });

    it('should track time between requests accurately', async () => {
      const rateLimitHandler = new RateLimitHandler();

      for (let i = 0; i < 10; i++) {
        await rateLimitHandler.beforeRequest();
      }

      const startTime = Date.now();

      const promise1 = rateLimitHandler.beforeRequest();
      await vi.advanceTimersByTimeAsync(1000);
      await promise1;
      expect(Date.now()).toBe(startTime + 1000);

      const promise2 = rateLimitHandler.beforeRequest();
      await vi.advanceTimersByTimeAsync(1000);
      await promise2;
      expect(Date.now()).toBe(startTime + 2000);
    });
  });

  describe('resetRequestCount', () => {
    it('should reset request count allowing burst again', async () => {
      const rateLimitHandler = new RateLimitHandler();

      for (let i = 0; i < 10; i++) {
        await rateLimitHandler.beforeRequest();
      }

      rateLimitHandler.resetRequestCount();

      for (let i = 0; i < 10; i++) {
        const promise = rateLimitHandler.beforeRequest();
        await promise;
      }
    });
  });

  describe('integration scenarios', () => {
    it('should handle retry-after taking precedence over rate limit reset', async () => {
      const rateLimitHandler = new RateLimitHandler();
      const resetTime = FIXED_TIME_SECONDS + 60;

      const mockResponse = {
        headers: {
          get: (header: string) => {
            if (header === 'retry-after') return '10';
            if (header === 'x-ratelimit-remaining') return '0';
            if (header === 'x-ratelimit-reset') return resetTime.toString();
            return null;
          },
        },
      } as unknown as Response;

      const promise = rateLimitHandler.handleRateLimit(mockResponse);
      await vi.advanceTimersByTimeAsync(10000);
      await promise;
    });

    it('should handle multiple rate limit scenarios in sequence', async () => {
      const rateLimitHandler = new RateLimitHandler();

      const response1 = {
        headers: {
          get: (header: string) => (header === 'retry-after' ? '5' : null),
        },
      } as unknown as Response;

      const promise1 = rateLimitHandler.handleRateLimit(response1);
      await vi.advanceTimersByTimeAsync(5000);
      await promise1;

      const resetTime = FIXED_TIME_SECONDS + 5 + 15;
      const response2 = {
        headers: {
          get: (header: string) => {
            if (header === 'retry-after') return null;
            if (header === 'x-ratelimit-remaining') return '0';
            if (header === 'x-ratelimit-reset') return resetTime.toString();
            return null;
          },
        },
      } as unknown as Response;

      const promise2 = rateLimitHandler.handleRateLimit(response2);
      await vi.advanceTimersByTimeAsync(15000);
      await promise2;

      rateLimitHandler.resetRetryCount();
    });
  });
});
