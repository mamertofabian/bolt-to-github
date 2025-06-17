/**
 * Debounce utility for preventing rapid successive function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle utility for limiting function execution frequency
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => ReturnType<T> | void {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      const result = func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
      return result;
    }
  };
}
