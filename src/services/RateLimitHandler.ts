export class RateLimitHandler {
  private requestCount = 0;
  private readonly BURST_LIMIT = 10; // Allow 10 requests before rate limiting
  private lastRequestTime = 0;
  private retryCount = 0;
  private readonly MAX_RETRIES = 5;
  private readonly MIN_REQUEST_INTERVAL = 1000; // 1 second between mutative requests

  async handleRateLimit(response: Response): Promise<void> {
    const retryAfter = response.headers.get('retry-after');
    const rateLimit = {
      remaining: parseInt(response.headers.get('x-ratelimit-remaining') || '1'),
      reset: parseInt(response.headers.get('x-ratelimit-reset') || '0'),
    };

    if (retryAfter) {
      await this.sleep(parseInt(retryAfter) * 1000);
    } else if (rateLimit.remaining === 0) {
      const now = Math.floor(Date.now() / 1000);
      const waitTime = (rateLimit.reset - now) * 1000;
      await this.sleep(waitTime);
    } else {
      const backoffTime = Math.min(1000 * Math.pow(2, this.retryCount), 60000);
      await this.sleep(backoffTime);
    }

    this.retryCount++;
    if (this.retryCount >= this.MAX_RETRIES) {
      throw new Error('Maximum retry attempts exceeded');
    }
  }

  async beforeRequest(): Promise<void> {
    this.requestCount++;

    // Only apply rate limiting after BURST_LIMIT requests
    if (this.requestCount > this.BURST_LIMIT) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
        await this.sleep(this.MIN_REQUEST_INTERVAL - timeSinceLastRequest);
      }
    }

    this.lastRequestTime = Date.now();
  }

  resetRetryCount(): void {
    this.retryCount = 0;
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
