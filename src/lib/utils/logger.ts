/**
 * Logger utility for development and production environments
 * Provides centralized logging with configurable levels based on environment
 */

export interface Logger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

export interface LoggerConfig {
  isDevelopment: boolean;
  enableDebugInProduction?: boolean;
  enableTimestamps?: boolean;
  modulePrefix?: string;
}

class LoggerImpl implements Logger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  private formatMessage(level: string, args: any[]): any[] {
    const prefix = this.config.modulePrefix ? `[${this.config.modulePrefix}]` : '';
    const timestamp = this.config.enableTimestamps ? new Date().toISOString() : '';
    const levelLabel = `[${level.toUpperCase()}]`;

    const prefixParts = [timestamp, prefix, levelLabel].filter(Boolean);

    if (prefixParts.length > 1 || this.config.modulePrefix || this.config.enableTimestamps) {
      return [prefixParts.join(' '), ...args];
    }

    // Always include level at minimum
    return [levelLabel, ...args];
  }

  debug(...args: any[]): void {
    // Only log debug in development unless explicitly enabled in production
    if (this.config.isDevelopment || this.config.enableDebugInProduction) {
      console.log(...this.formatMessage('debug', args));
    }
  }

  info(...args: any[]): void {
    console.info(...this.formatMessage('info', args));
  }

  warn(...args: any[]): void {
    console.warn(...this.formatMessage('warn', args));
  }

  error(...args: any[]): void {
    console.error(...this.formatMessage('error', args));
  }
}

// Detect environment - use simple approach to avoid import.meta issues in tests
function detectEnvironment(): boolean {
  // Try Vite environment first
  try {
    // @ts-ignore - ignore TypeScript error for import.meta in test environments
    if (typeof window !== 'undefined' && window.import?.meta?.env) {
      // @ts-ignore
      return window.import.meta.env.MODE === 'development' || window.import.meta.env.DEV === true;
    }
  } catch (e) {
    // Ignore and continue
  }

  // Try process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV === 'development';
  }

  // Default to false for production safety
  return false;
}

const isDevelopment = detectEnvironment();

// Check for debug override in localStorage (for production debugging)
const enableDebugInProduction =
  typeof window !== 'undefined' ? localStorage.getItem('bolt-to-github-debug') === 'true' : false;

// Default logger instance
export const logger = new LoggerImpl({
  isDevelopment,
  enableDebugInProduction,
  enableTimestamps: isDevelopment,
});

/**
 * Create a logger with module-specific prefix
 */
export function createLogger(modulePrefix: string, config?: Partial<LoggerConfig>): Logger {
  return new LoggerImpl({
    isDevelopment,
    enableDebugInProduction,
    enableTimestamps: isDevelopment,
    ...config,
    modulePrefix,
  });
}

/**
 * Enable debug logging in production (saved to localStorage)
 */
export function enableProductionDebug(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('bolt-to-github-debug', 'true');
    logger.info('Production debug logging enabled. Reload the page to take effect.');
  }
}

/**
 * Disable debug logging in production
 */
export function disableProductionDebug(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('bolt-to-github-debug');
    logger.info('Production debug logging disabled. Reload the page to take effect.');
  }
}
