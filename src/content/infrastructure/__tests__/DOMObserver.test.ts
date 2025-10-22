import { DOMObserver } from '../DOMObserver';

describe('DOMObserver', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Observing behavior', () => {
    it('should call callback immediately on start', () => {
      const callback = vi.fn();
      const observer = new DOMObserver();

      observer.start(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      observer.stop();
    });

    it('should track active state correctly', () => {
      const observer = new DOMObserver();

      expect(observer.isActive()).toBe(false);

      observer.start(vi.fn());
      expect(observer.isActive()).toBe(true);

      observer.stop();
      expect(observer.isActive()).toBe(false);
    });

    it('should allow restart after stop', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const observer = new DOMObserver();

      observer.start(callback1);
      observer.stop();
      observer.start(callback2);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(observer.isActive()).toBe(true);
      observer.stop();
    });

    it('should not start multiple times', () => {
      const callback = vi.fn();
      const observer = new DOMObserver();
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      observer.start(callback);
      callback.mockClear();
      observer.start(callback);

      expect(spy).toHaveBeenCalledWith('[DOMObserver] [WARN]', 'DOMObserver is already observing');
      expect(callback).not.toHaveBeenCalled();

      spy.mockRestore();
      observer.stop();
    });
  });

  describe('Error handling and retries', () => {
    it('should retry on callback failure', () => {
      let attempts = 0;
      const callback = vi.fn(() => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Test error');
        }
      });
      const observer = new DOMObserver(3, 100, 50);

      observer.start(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(observer.getRetryCount()).toBe(1);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(observer.getRetryCount()).toBe(0);

      observer.stop();
    });

    it('should call onError after max retries', () => {
      const callback = vi.fn(() => {
        throw new Error('Always fails');
      });
      const onError = vi.fn();
      const observer = new DOMObserver(2, 100, 50);

      observer.start(callback, onError);

      expect(callback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(3);

      vi.advanceTimersByTime(100);
      expect(onError).toHaveBeenCalledTimes(1);

      observer.stop();
    });

    it('should not crash without onError callback', () => {
      const callback = vi.fn(() => {
        throw new Error('Test error');
      });
      const observer = new DOMObserver(1, 100, 50);

      expect(() => {
        observer.start(callback);
        vi.advanceTimersByTime(100);
        vi.advanceTimersByTime(100);
      }).not.toThrow();

      observer.stop();
    });

    it('should reset retry count manually', () => {
      const callback = vi.fn(() => {
        throw new Error('Test');
      });
      const observer = new DOMObserver(3, 100, 50);

      observer.start(callback);
      expect(observer.getRetryCount()).toBe(1);

      observer.resetRetryCount();
      expect(observer.getRetryCount()).toBe(0);

      observer.stop();
    });

    it('should reset retry count on successful callback', () => {
      let attempts = 0;
      const callback = vi.fn(() => {
        attempts++;
        if (attempts === 1) {
          throw new Error('First fails');
        }
      });
      const observer = new DOMObserver(3, 100, 50);

      observer.start(callback);
      expect(observer.getRetryCount()).toBe(1);

      vi.advanceTimersByTime(100);
      expect(observer.getRetryCount()).toBe(0);

      observer.stop();
    });
  });

  describe('Stop behavior', () => {
    it('should stop observing', () => {
      const observer = new DOMObserver();

      observer.start(vi.fn());
      observer.stop();

      expect(observer.isActive()).toBe(false);
    });

    it('should handle stop when not observing', () => {
      const observer = new DOMObserver();

      expect(() => observer.stop()).not.toThrow();
      expect(observer.isActive()).toBe(false);
    });

    it('should reset retry count on stop', () => {
      const callback = vi.fn(() => {
        throw new Error('Test');
      });
      const observer = new DOMObserver(3, 100, 50);

      observer.start(callback);
      expect(observer.getRetryCount()).toBe(1);

      observer.stop();
      expect(observer.getRetryCount()).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const observer = new DOMObserver();

      expect(observer.getRetryCount()).toBe(0);
      expect(observer.isActive()).toBe(false);
    });

    it('should use custom configuration', () => {
      const observer = new DOMObserver(5, 2000, 1000);

      expect(observer.getRetryCount()).toBe(0);
      expect(observer.isActive()).toBe(false);
    });

    it('should respect custom max retries', () => {
      const callback = vi.fn(() => {
        throw new Error('Fail');
      });
      const onError = vi.fn();
      const maxRetries = 5;
      const observer = new DOMObserver(maxRetries, 100, 50);

      observer.start(callback, onError);

      for (let i = 0; i < maxRetries; i++) {
        vi.advanceTimersByTime(100);
      }

      vi.advanceTimersByTime(100);
      expect(onError).toHaveBeenCalledTimes(1);

      observer.stop();
    });
  });
});
