/**
 * Logger utility for development and production environments
 * Provides centralized logging with configurable levels based on environment
 * Enhanced with persistent storage and log management capabilities
 */

import { LogStorageManager } from './logStorage';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface LoggerConfig {
  isDevelopment: boolean;
  enableDebugInProduction?: boolean;
  enableTimestamps?: boolean;
  modulePrefix?: string;
  enablePersistence?: boolean;
}

class LoggerImpl implements Logger {
  private config: LoggerConfig;
  private storageManager: LogStorageManager | null = null;

  constructor(config: LoggerConfig) {
    this.config = config;
    if (config.enablePersistence && typeof chrome !== 'undefined' && chrome.storage) {
      this.storageManager = LogStorageManager.getInstance();
    }
  }

  private formatMessage(level: string, args: unknown[]): unknown[] {
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

  private async persistLog(level: string, args: unknown[]): Promise<void> {
    if (!this.storageManager) return;

    try {
      const message = args
        .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
        .join(' ');

      await this.storageManager.addLog(
        level as 'debug' | 'info' | 'warn' | 'error',
        this.config.modulePrefix || 'default',
        message,
        args.length > 1 ? args.slice(1) : undefined
      );
    } catch (_error) {
      // Silently fail to avoid infinite loops
    }
  }

  debug(...args: unknown[]): void {
    // Only log debug in development unless explicitly enabled in production
    if (this.config.isDevelopment || this.config.enableDebugInProduction) {
      console.log(...this.formatMessage('debug', args));
      this.persistLog('debug', args);
    }
  }

  info(...args: unknown[]): void {
    console.info(...this.formatMessage('info', args));
    this.persistLog('info', args);
  }

  warn(...args: unknown[]): void {
    console.warn(...this.formatMessage('warn', args));
    this.persistLog('warn', args);
  }

  error(...args: unknown[]): void {
    console.error(...this.formatMessage('error', args));
    this.persistLog('error', args);
  }
}

// Detect environment - use simple approach to avoid import.meta issues in tests
function detectEnvironment(): boolean {
  // For Vite environments, check for development indicators
  // Note: Skipping localhost check as it can be unreliable in test environments

  // Try process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    // Don't consider 'test' as development
    return process.env.NODE_ENV === 'development';
  }

  // Default to false for production safety
  return false;
}

// Lazy initialization for better testability
let _logger: Logger | null = null;

// Reset function for testing
export function resetLogger(): void {
  _logger = null;
}

function getDefaultConfig() {
  const isDevelopment = detectEnvironment();
  const enableDebugInProduction = true;

  return {
    isDevelopment,
    enableDebugInProduction,
    enableTimestamps: isDevelopment,
    enablePersistence: true, // Enable by default for all environments
  };
}

// Default logger instance with lazy initialization
export const logger: Logger = new Proxy({} as Logger, {
  get(_target, prop) {
    if (!_logger) {
      _logger = new LoggerImpl(getDefaultConfig());
    }
    return (_logger as any)[prop];
  },
});

/**
 * Create a logger with module-specific prefix
 */
export function createLogger(modulePrefix: string, config?: Partial<LoggerConfig>): Logger {
  const defaultConfig = getDefaultConfig();
  return new LoggerImpl({
    ...defaultConfig,
    ...config,
    modulePrefix,
  });
}

/**
 * Enable debug logging in production (saved to localStorage)
 */
export function enableProductionDebug(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('bolt-to-github-debug', 'true');
      logger.info('Production debug logging enabled. Reload the page to take effect.');
    } catch (e) {
      logger.warn('Failed to enable production debug logging: localStorage unavailable');
    }
  }
}

/**
 * Disable debug logging in production
 */
export function disableProductionDebug(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('bolt-to-github-debug');
      logger.info('Production debug logging disabled. Reload the page to take effect.');
    } catch (e) {
      logger.warn('Failed to disable production debug logging: localStorage unavailable');
    }
  }
}

/**
 * Get the log storage manager instance
 */
export function getLogStorage(): LogStorageManager {
  return LogStorageManager.getInstance();
}

/**
 * Export logs for bug reports
 */
export async function exportLogsForBugReport(): Promise<{
  logs: string;
  metadata: {
    extensionVersion: string;
    browser: string;
    timestamp: string;
    logsCount: number;
  };
}> {
  const storage = getLogStorage();
  const logs = await storage.exportLogs('text');
  const allLogs = await storage.getAllLogs();

  // Get extension version from manifest
  const manifest = chrome.runtime.getManifest();

  return {
    logs,
    metadata: {
      extensionVersion: manifest.version,
      browser: navigator.userAgent,
      timestamp: new Date().toISOString(),
      logsCount: allLogs.length,
    },
  };
}

/**
 * Clear all stored logs
 */
export async function clearLogs(): Promise<void> {
  const storage = getLogStorage();
  await storage.clearAllLogs();
  logger.info('All logs have been cleared');
}

/**
 * Get recent logs from memory buffer
 */
export function getRecentLogs(count: number = 100): ReturnType<LogStorageManager['getRecentLogs']> {
  const storage = getLogStorage();
  return storage.getRecentLogs(count);
}
