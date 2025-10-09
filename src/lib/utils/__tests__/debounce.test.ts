import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle } from '../debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should delay function execution by the specified wait time', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(99);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should execute function with provided arguments', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('arg1', 42, { key: 'value' });

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 42, { key: 'value' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should execute function without arguments', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('rapid successive calls', () => {
    it('should cancel previous timer and restart when called multiple times', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('call1');
      vi.advanceTimersByTime(50);

      debouncedFn('call2');
      vi.advanceTimersByTime(50);

      expect(fn).not.toHaveBeenCalled();

      debouncedFn('call3');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('call3');
    });

    it('should only execute function once after multiple rapid calls', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();
      debouncedFn();
      debouncedFn();

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use arguments from the last call only', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn(1);
      debouncedFn(2);
      debouncedFn(3);

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(3);
    });
  });

  describe('wait time variations', () => {
    it('should handle zero wait time', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 0);

      debouncedFn();

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(0);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle very short wait times', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1);

      debouncedFn();

      vi.advanceTimersByTime(1);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle very long wait times', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 10000);

      debouncedFn();

      vi.advanceTimersByTime(9999);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple debounced functions', () => {
    it('should maintain independent timers for different debounced functions', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const debouncedFn1 = debounce(fn1, 100);
      const debouncedFn2 = debounce(fn2, 200);

      debouncedFn1('first');
      debouncedFn2('second');

      vi.advanceTimersByTime(100);

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn1).toHaveBeenCalledWith('first');
      expect(fn2).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(fn2).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledWith('second');
    });

    it('should allow same function to be debounced with different wait times', () => {
      const fn = vi.fn();
      const debouncedFn1 = debounce(fn, 100);
      const debouncedFn2 = debounce(fn, 200);

      debouncedFn1('fast');
      debouncedFn2('slow');

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('fast');

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('slow');
    });
  });

  describe('type safety', () => {
    it('should preserve function signature with typed arguments', () => {
      const fn = vi.fn((a: string, b: number) => `${a}-${b}`);
      const debouncedFn = debounce(fn, 100);

      debouncedFn('test', 42);

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('test', 42);
    });

    it('should work with readonly arrays as arguments', () => {
      const fn = vi.fn((arr: readonly number[]) => arr.length);
      const debouncedFn = debounce(fn, 100);

      const testArray: readonly number[] = [1, 2, 3];
      debouncedFn(testArray);

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith(testArray);
    });

    it('should work with complex object arguments', () => {
      interface ComplexType {
        id: string;
        data: { nested: number[] };
      }

      const fn = vi.fn((obj: ComplexType) => obj.id);
      const debouncedFn = debounce(fn, 100);

      const testObj: ComplexType = { id: 'test', data: { nested: [1, 2, 3] } };
      debouncedFn(testObj);

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith(testObj);
    });
  });

  describe('edge cases', () => {
    it('should handle function that throws errors', () => {
      const fn = vi.fn(() => {
        throw new Error('Test error');
      });
      const debouncedFn = debounce(fn, 100);

      debouncedFn();

      expect(() => vi.advanceTimersByTime(100)).toThrow('Test error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not execute if never advanced past wait time', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();

      vi.advanceTimersByTime(99);

      expect(fn).not.toHaveBeenCalled();
    });

    it('should handle calls with undefined and null arguments', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn(undefined, null);

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith(undefined, null);
    });
  });

  describe('practical use cases', () => {
    it('should debounce search input handler', () => {
      const searchFn = vi.fn((query: string) => `Searching for: ${query}`);
      const debouncedSearch = debounce(searchFn, 300);

      debouncedSearch('a');
      vi.advanceTimersByTime(100);

      debouncedSearch('ab');
      vi.advanceTimersByTime(100);

      debouncedSearch('abc');
      vi.advanceTimersByTime(100);

      expect(searchFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);

      expect(searchFn).toHaveBeenCalledTimes(1);
      expect(searchFn).toHaveBeenCalledWith('abc');
    });

    it('should debounce window resize handler', () => {
      const resizeHandler = vi.fn((width: number, height: number) => ({ width, height }));
      const debouncedResize = debounce(resizeHandler, 150);

      debouncedResize(800, 600);
      debouncedResize(900, 700);
      debouncedResize(1024, 768);

      vi.advanceTimersByTime(150);

      expect(resizeHandler).toHaveBeenCalledTimes(1);
      expect(resizeHandler).toHaveBeenCalledWith(1024, 768);
    });

    it('should debounce auto-save functionality', () => {
      const saveFn = vi.fn((content: string) => `Saved: ${content}`);
      const debouncedSave = debounce(saveFn, 1000);

      debouncedSave('H');
      vi.advanceTimersByTime(200);

      debouncedSave('He');
      vi.advanceTimersByTime(200);

      debouncedSave('Hel');
      vi.advanceTimersByTime(200);

      debouncedSave('Hello');
      vi.advanceTimersByTime(1000);

      expect(saveFn).toHaveBeenCalledTimes(1);
      expect(saveFn).toHaveBeenCalledWith('Hello');
    });
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should execute function immediately on first call', () => {
      const fn = vi.fn((val: number) => val * 2);
      const throttledFn = throttle(fn, 100);

      const result = throttledFn(5);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(5);
      expect(result).toBe(10);
    });

    it('should execute function with provided arguments', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn('arg1', 42, { key: 'value' });

      expect(fn).toHaveBeenCalledWith('arg1', 42, { key: 'value' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return function result on first call', () => {
      const fn = vi.fn(() => 'result');
      const throttledFn = throttle(fn, 100);

      const result = throttledFn();

      expect(result).toBe('result');
    });
  });

  describe('throttling behavior', () => {
    it('should prevent execution during throttle period', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should allow execution after throttle period expires', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should return undefined for throttled calls', () => {
      const fn = vi.fn(() => 'result');
      const throttledFn = throttle(fn, 100);

      const result1 = throttledFn();
      const result2 = throttledFn();

      expect(result1).toBe('result');
      expect(result2).toBeUndefined();
    });

    it('should maintain throttle limit across multiple calls', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();
      vi.advanceTimersByTime(100);

      throttledFn();
      vi.advanceTimersByTime(100);

      throttledFn();

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('limit time variations', () => {
    it('should handle zero limit time', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 0);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(0);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle very short limit times', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 1);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle very long limit times', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 10000);

      throttledFn();
      throttledFn();

      vi.advanceTimersByTime(9999);
      throttledFn();

      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      throttledFn();

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('multiple throttled functions', () => {
    it('should maintain independent throttle state for different functions', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const throttledFn1 = throttle(fn1, 100);
      const throttledFn2 = throttle(fn2, 200);

      throttledFn1();
      throttledFn2();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);

      throttledFn1();
      throttledFn2();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);

      throttledFn1();
      throttledFn2();

      expect(fn1).toHaveBeenCalledTimes(2);
      expect(fn2).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);

      throttledFn2();

      expect(fn2).toHaveBeenCalledTimes(2);
    });

    it('should allow same function to be throttled with different limits', () => {
      const fn = vi.fn();
      const throttledFn1 = throttle(fn, 100);
      const throttledFn2 = throttle(fn, 200);

      throttledFn1();
      throttledFn2();

      expect(fn).toHaveBeenCalledTimes(2);

      throttledFn1();
      throttledFn2();

      expect(fn).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(100);

      throttledFn1();

      expect(fn).toHaveBeenCalledTimes(3);

      throttledFn2();

      expect(fn).toHaveBeenCalledTimes(3);

      vi.advanceTimersByTime(100);

      throttledFn2();

      expect(fn).toHaveBeenCalledTimes(4);
    });
  });

  describe('type safety', () => {
    it('should preserve function signature with typed arguments', () => {
      const fn = vi.fn((a: string, b: number) => `${a}-${b}`);
      const throttledFn = throttle(fn, 100);

      const result = throttledFn('test', 42);

      expect(fn).toHaveBeenCalledWith('test', 42);
      expect(result).toBe('test-42');
    });

    it('should work with readonly arrays as arguments', () => {
      const fn = vi.fn((arr: readonly number[]) => arr.length);
      const throttledFn = throttle(fn, 100);

      const testArray: readonly number[] = [1, 2, 3];
      const result = throttledFn(testArray);

      expect(fn).toHaveBeenCalledWith(testArray);
      expect(result).toBe(3);
    });

    it('should work with complex object arguments', () => {
      interface ComplexType {
        id: string;
        data: { nested: number[] };
      }

      const fn = vi.fn((obj: ComplexType) => obj.id);
      const throttledFn = throttle(fn, 100);

      const testObj: ComplexType = { id: 'test', data: { nested: [1, 2, 3] } };
      const result = throttledFn(testObj);

      expect(fn).toHaveBeenCalledWith(testObj);
      expect(result).toBe('test');
    });
  });

  describe('edge cases', () => {
    it('should handle function that throws errors', () => {
      const fn = vi.fn(() => {
        throw new Error('Test error');
      });
      const throttledFn = throttle(fn, 100);

      expect(() => throttledFn()).toThrow('Test error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle calls with undefined and null arguments', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn(undefined, null);

      expect(fn).toHaveBeenCalledWith(undefined, null);
    });

    it('should handle rapid successive calls correctly', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      for (let i = 0; i < 10; i++) {
        throttledFn();
      }

      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);

      for (let i = 0; i < 10; i++) {
        throttledFn();
      }

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('practical use cases', () => {
    it('should throttle scroll event handler', () => {
      const scrollHandler = vi.fn((scrollY: number) => scrollY);
      const throttledScroll = throttle(scrollHandler, 100);

      const result1 = throttledScroll(0);
      throttledScroll(10);
      throttledScroll(20);

      expect(scrollHandler).toHaveBeenCalledTimes(1);
      expect(scrollHandler).toHaveBeenCalledWith(0);
      expect(result1).toBe(0);

      vi.advanceTimersByTime(100);

      const result2 = throttledScroll(30);

      expect(scrollHandler).toHaveBeenCalledTimes(2);
      expect(scrollHandler).toHaveBeenCalledWith(30);
      expect(result2).toBe(30);
    });

    it('should throttle API requests', () => {
      const apiCall = vi.fn((query: string) => `API result for: ${query}`);
      const throttledApi = throttle(apiCall, 500);

      const result1 = throttledApi('query1');
      expect(result1).toBe('API result for: query1');

      const result2 = throttledApi('query2');
      expect(result2).toBeUndefined();

      expect(apiCall).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(500);

      const result3 = throttledApi('query3');
      expect(result3).toBe('API result for: query3');

      expect(apiCall).toHaveBeenCalledTimes(2);
    });

    it('should throttle button clicks', () => {
      const clickHandler = vi.fn((buttonId: string) => `Clicked: ${buttonId}`);
      const throttledClick = throttle(clickHandler, 1000);

      const result1 = throttledClick('submit');
      expect(result1).toBe('Clicked: submit');

      const result2 = throttledClick('submit');
      const result3 = throttledClick('submit');

      expect(result2).toBeUndefined();
      expect(result3).toBeUndefined();
      expect(clickHandler).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);

      const result4 = throttledClick('submit');
      expect(result4).toBe('Clicked: submit');
      expect(clickHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('return value behavior', () => {
    it('should return actual result on first call and undefined on throttled calls', () => {
      const fn = vi.fn((x: number) => x * 2);
      const throttledFn = throttle(fn, 100);

      const result1 = throttledFn(5);
      const result2 = throttledFn(10);
      const result3 = throttledFn(15);

      expect(result1).toBe(10);
      expect(result2).toBeUndefined();
      expect(result3).toBeUndefined();
    });

    it('should return new result after throttle period', () => {
      const fn = vi.fn((x: number) => x * 2);
      const throttledFn = throttle(fn, 100);

      const result1 = throttledFn(5);
      expect(result1).toBe(10);

      vi.advanceTimersByTime(100);

      const result2 = throttledFn(10);
      expect(result2).toBe(20);
    });
  });
});
