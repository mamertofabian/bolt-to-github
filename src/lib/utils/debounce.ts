/**
 * Debounce utility for preventing rapid successive function calls
 */
export type DebouncedFunction<TArgs extends readonly unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void;
};

export function debounce<TArgs extends readonly unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  wait: number
): DebouncedFunction<TArgs> {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = (...args: TArgs) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * Throttle utility for limiting function execution frequency
 */
export function throttle<TArgs extends readonly unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  limit: number
): (...args: TArgs) => TReturn | void {
  let inThrottle: boolean = false;

  return (...args: TArgs) => {
    if (!inThrottle) {
      const result = func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
      return result;
    }
  };
}
