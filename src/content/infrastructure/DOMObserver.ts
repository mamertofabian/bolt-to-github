/**
 * DOMObserver handles DOM mutation observation and initialization retry logic
 * Previously part of UIManager
 */
export class DOMObserver {
  private observer: MutationObserver | null = null;
  private timeoutId: number | null = null;
  private retryCount = 0;
  private maxRetries: number;
  private retryDelay: number;
  private observationDelay: number;
  private isObserving = false;

  constructor(maxRetries: number = 3, retryDelay: number = 1000, observationDelay: number = 500) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.observationDelay = observationDelay;
  }

  /**
   * Start observing DOM changes and call the callback when changes occur
   * @param callback Function to call when attempting initialization
   * @param onError Function to call when max retries are reached
   */
  public start(callback: () => void, onError?: () => void): void {
    if (this.isObserving) {
      console.warn('DOMObserver is already observing');
      return;
    }

    const attemptInitialization = () => {
      try {
        callback();
        this.retryCount = 0; // Reset count on success
      } catch (error) {
        console.warn('Initialization attempt failed:', error);
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          this.timeoutId = window.setTimeout(attemptInitialization, this.retryDelay);
        } else if (onError) {
          onError();
          this.retryCount = 0; // Reset for future attempts
        }
      }
    };

    this.observer = new MutationObserver(() => {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }
      this.timeoutId = window.setTimeout(attemptInitialization, this.observationDelay);
    });

    this.startObservation();
    this.isObserving = true;

    // Also call the callback immediately
    attemptInitialization();
  }

  /**
   * Start observing the document body
   */
  private startObservation(): void {
    if (!this.observer) return;

    // Wait for document.body to be available
    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      // If body isn't available, wait for it
      document.addEventListener('DOMContentLoaded', () => {
        if (this.observer && document.body) {
          this.observer.observe(document.body, {
            childList: true,
            subtree: true,
          });
        }
      });
    }
  }

  /**
   * Stop observing DOM changes
   */
  public stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.isObserving = false;
    this.retryCount = 0;
  }

  /**
   * Check if currently observing
   */
  public isActive(): boolean {
    return this.isObserving;
  }

  /**
   * Get current retry count
   */
  public getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Reset retry count manually
   */
  public resetRetryCount(): void {
    this.retryCount = 0;
  }
}
