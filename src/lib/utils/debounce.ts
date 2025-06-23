/**
 * Debounce utility for preventing rapid successive function calls
 */
export function debounce<TArgs extends readonly unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  wait: number
): (...args: TArgs) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: TArgs) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
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
