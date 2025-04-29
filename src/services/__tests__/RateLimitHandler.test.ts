import { expect, jest, describe, it } from '@jest/globals';
import { RateLimitHandler } from '../RateLimitHandler';

describe('RateLimitHandler', () => {
  // handleRateLimit correctly processes retry-after header and waits specified time
  it('should wait for the time specified in retry-after header', async () => {
    // Arrange
    const rateLimitHandler = new RateLimitHandler();
    const mockResponse = {
      headers: {
        get: jest.fn((header: string) => {
          if (header === 'retry-after') return '2';
          return null;
        }),
      },
    } as unknown as Response;

    const sleepSpy = jest.spyOn(rateLimitHandler, 'sleep').mockResolvedValue();

    // Act
    await rateLimitHandler.handleRateLimit(mockResponse);

    // Assert
    expect(sleepSpy).toHaveBeenCalledWith(2000);
    expect(mockResponse.headers.get).toHaveBeenCalledWith('retry-after');
  });

  // handleRateLimit correctly handles x-ratelimit headers when remaining is 0
  it('should wait until rate limit reset when remaining is 0', async () => {
    // Arrange
    const rateLimitHandler = new RateLimitHandler();
    const now = Math.floor(Date.now() / 1000);
    const resetTime = now + 30; // Reset in 30 seconds

    const mockResponse = {
      headers: {
        get: jest.fn((header: string) => {
          if (header === 'retry-after') return null;
          if (header === 'x-ratelimit-remaining') return '0';
          if (header === 'x-ratelimit-reset') return resetTime.toString();
          return null;
        }),
      },
    } as unknown as Response;

    const sleepSpy = jest.spyOn(rateLimitHandler, 'sleep').mockResolvedValue();

    // Act
    await rateLimitHandler.handleRateLimit(mockResponse);

    // Assert
    expect(sleepSpy).toHaveBeenCalledWith(expect.any(Number));
    expect(sleepSpy.mock.calls[0][0]).toBeGreaterThanOrEqual(29000); // At least 29 seconds (allowing for test execution time)
    expect(sleepSpy.mock.calls[0][0]).toBeLessThanOrEqual(31000); // At most 31 seconds
    expect(mockResponse.headers.get).toHaveBeenCalledWith('x-ratelimit-remaining');
    expect(mockResponse.headers.get).toHaveBeenCalledWith('x-ratelimit-reset');
  });
  // handleRateLimit throws error after MAX_RETRIES attempts
  it('should throw error when maximum retry attempts are exceeded', async () => {
    // Arrange
    const rateLimitHandler = new RateLimitHandler();
    const mockResponse = {
      headers: {
        get: jest.fn(() => null),
      },
    } as unknown as Response;

    jest.spyOn(rateLimitHandler, 'sleep').mockResolvedValue();

    // Set retry count to MAX_RETRIES - 2 (two before the limit)
    for (let i = 0; i < 3; i++) {
      rateLimitHandler['retryCount']++;
    }

    // Act & Assert
    await rateLimitHandler.handleRateLimit(mockResponse); // This should be the last successful attempt (brings count to 4)

    // The next attempt should throw an error (when count becomes 5)
    await expect(rateLimitHandler.handleRateLimit(mockResponse)).rejects.toThrow(
      'Maximum retry attempts exceeded'
    );

    expect(rateLimitHandler['retryCount']).toBe(5);
  });

  // handleRateLimit uses exponential backoff when no specific retry time is provided
  it('should use exponential backoff when no retry headers are provided', async () => {
    // Arrange
    const rateLimitHandler = new RateLimitHandler();
    const mockResponse = {
      headers: {
        get: jest.fn((header: string) => {
          if (header === 'x-ratelimit-remaining') return '1'; // Not zero
          return null;
        }),
      },
    } as unknown as Response;

    const sleepSpy = jest.spyOn(rateLimitHandler, 'sleep').mockResolvedValue();

    // Act
    // First retry (retryCount = 0)
    await rateLimitHandler.handleRateLimit(mockResponse);

    // Second retry (retryCount = 1)
    await rateLimitHandler.handleRateLimit(mockResponse);

    // Third retry (retryCount = 2)
    await rateLimitHandler.handleRateLimit(mockResponse);

    // Assert
    expect(sleepSpy).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000); // 2^0 * 1000 = 1000
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000); // 2^1 * 1000 = 2000
    expect(sleepSpy).toHaveBeenNthCalledWith(3, 4000); // 2^2 * 1000 = 4000
  });
});
