import { describe, expect, it, vi } from 'vitest';
import { RateLimitHandler } from '../RateLimitHandler';

describe('RateLimitHandler', () => {
  it('should wait for the time specified in retry-after header', async () => {
    const rateLimitHandler = new RateLimitHandler();
    const mockResponse = {
      headers: {
        get: vi.fn((header: string) => {
          if (header === 'retry-after') return '2';
          return null;
        }),
      },
    } as unknown as Response;

    const sleepSpy = vi.spyOn(rateLimitHandler, 'sleep').mockResolvedValue();

    await rateLimitHandler.handleRateLimit(mockResponse);

    expect(sleepSpy).toHaveBeenCalledWith(2000);
    expect(mockResponse.headers.get).toHaveBeenCalledWith('retry-after');
  });

  it('should wait until rate limit reset when remaining is 0', async () => {
    const rateLimitHandler = new RateLimitHandler();
    const now = Math.floor(Date.now() / 1000);
    const resetTime = now + 30;

    const mockResponse = {
      headers: {
        get: vi.fn((header: string) => {
          if (header === 'retry-after') return null;
          if (header === 'x-ratelimit-remaining') return '0';
          if (header === 'x-ratelimit-reset') return resetTime.toString();
          return null;
        }),
      },
    } as unknown as Response;

    const sleepSpy = vi.spyOn(rateLimitHandler, 'sleep').mockResolvedValue();

    await rateLimitHandler.handleRateLimit(mockResponse);

    expect(sleepSpy).toHaveBeenCalledWith(expect.any(Number));
    expect(sleepSpy.mock.calls[0][0]).toBeGreaterThanOrEqual(29000);
    expect(sleepSpy.mock.calls[0][0]).toBeLessThanOrEqual(31000);
    expect(mockResponse.headers.get).toHaveBeenCalledWith('x-ratelimit-remaining');
    expect(mockResponse.headers.get).toHaveBeenCalledWith('x-ratelimit-reset');
  });

  it('should throw error when maximum retry attempts are exceeded', async () => {
    const rateLimitHandler = new RateLimitHandler();
    const mockResponse = {
      headers: {
        get: vi.fn(() => null),
      },
    } as unknown as Response;

    vi.spyOn(rateLimitHandler, 'sleep').mockResolvedValue();

    for (let i = 0; i < 3; i++) {
      rateLimitHandler['retryCount']++;
    }

    await rateLimitHandler.handleRateLimit(mockResponse);

    await expect(rateLimitHandler.handleRateLimit(mockResponse)).rejects.toThrow(
      'Maximum retry attempts exceeded'
    );

    expect(rateLimitHandler['retryCount']).toBe(5);
  });

  it('should use exponential backoff when no retry headers are provided', async () => {
    const rateLimitHandler = new RateLimitHandler();
    const mockResponse = {
      headers: {
        get: vi.fn((header: string) => {
          if (header === 'x-ratelimit-remaining') return '1';
          return null;
        }),
      },
    } as unknown as Response;

    const sleepSpy = vi.spyOn(rateLimitHandler, 'sleep').mockResolvedValue();

    await rateLimitHandler.handleRateLimit(mockResponse);

    await rateLimitHandler.handleRateLimit(mockResponse);

    await rateLimitHandler.handleRateLimit(mockResponse);

    expect(sleepSpy).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);
    expect(sleepSpy).toHaveBeenNthCalledWith(3, 4000);
  });
});
