import {
  createLogger,
  disableProductionDebug,
  enableProductionDebug,
  logger,
  resetLogger,
} from '../logger';

describe('Logger', () => {
  let consoleSpy: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    info: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warn: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: any;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };

    localStorage.clear();

    process.env.NODE_ENV = 'production';

    resetLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('default logger', () => {
    it('should format and output info messages correctly', () => {
      logger.info('Info message');

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const args = consoleSpy.info.mock.calls[0];
      expect(args[0]).toBe('[INFO]');
      expect(args[1]).toBe('Info message');
    });

    it('should format and output warn messages correctly', () => {
      logger.warn('Warning message');

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const args = consoleSpy.warn.mock.calls[0];
      expect(args[0]).toBe('[WARN]');
      expect(args[1]).toBe('Warning message');
    });

    it('should format and output error messages correctly', () => {
      logger.error('Error message');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const args = consoleSpy.error.mock.calls[0];
      expect(args[0]).toBe('[ERROR]');
      expect(args[1]).toBe('Error message');
    });

    it('should output debug messages in production by default', () => {
      logger.debug('Debug message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const args = consoleSpy.log.mock.calls[0];
      expect(args[0]).toBe('[DEBUG]');
      expect(args[1]).toBe('Debug message');
    });

    it('should handle multiple arguments in log messages', () => {
      const obj = { error: 'details' };
      logger.warn('Warning:', obj, 123);

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const args = consoleSpy.warn.mock.calls[0];
      expect(args).toEqual(['[WARN]', 'Warning:', obj, 123]);
    });
  });

  describe('createLogger', () => {
    it('should create logger with module prefix in formatted output', () => {
      const moduleLogger = createLogger('TestModule');

      moduleLogger.info('Test message');

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const args = consoleSpy.info.mock.calls[0];
      expect(args[0]).toBe('[TestModule] [INFO]');
      expect(args[1]).toBe('Test message');
    });

    it('should include timestamps in formatted output when enabled', () => {
      const timestampLogger = createLogger('Time', { enableTimestamps: true });

      timestampLogger.error('Error with timestamp');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const args = consoleSpy.error.mock.calls[0];

      expect(args[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[Time\] \[ERROR\]$/);
      expect(args[1]).toBe('Error with timestamp');
    });

    it('should output debug messages when isDevelopment is true', () => {
      const devLogger = createLogger('Dev', { isDevelopment: true });

      devLogger.debug('Development debug');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const args = consoleSpy.log.mock.calls[0];
      expect(args[0]).toBe('[Dev] [DEBUG]');
      expect(args[1]).toBe('Development debug');
    });

    it('should output debug messages when enableDebugInProduction is true', () => {
      const prodDebugLogger = createLogger('ProdDebug', { enableDebugInProduction: true });

      prodDebugLogger.debug('Production debug message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const args = consoleSpy.log.mock.calls[0];
      expect(args[0]).toBe('[ProdDebug] [DEBUG]');
      expect(args[1]).toBe('Production debug message');
    });

    it('should not output debug messages when both isDevelopment and enableDebugInProduction are false', () => {
      const restrictedLogger = createLogger('Restricted', {
        isDevelopment: false,
        enableDebugInProduction: false,
      });

      restrictedLogger.debug('Should not appear');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should format messages without module prefix when empty string is provided', () => {
      const simpleLogger = createLogger('', { enableTimestamps: false });

      simpleLogger.info('Simple message');

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const args = consoleSpy.info.mock.calls[0];
      expect(args[0]).toBe('[INFO]');
      expect(args[1]).toBe('Simple message');
    });
  });

  describe('production debug control', () => {
    it('should save enableDebugInProduction flag to localStorage and log confirmation', () => {
      enableProductionDebug();

      const storedValue = localStorage.getItem('bolt-to-github-debug');
      expect(storedValue).toBe('true');

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const args = consoleSpy.info.mock.calls[0];
      expect(args).toEqual([
        '[INFO]',
        'Production debug logging enabled. Reload the page to take effect.',
      ]);
    });

    it('should remove enableDebugInProduction flag from localStorage and log confirmation', () => {
      localStorage.setItem('bolt-to-github-debug', 'true');

      disableProductionDebug();

      const storedValue = localStorage.getItem('bolt-to-github-debug');
      expect(storedValue).toBeNull();

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const args = consoleSpy.info.mock.calls[0];
      expect(args).toEqual([
        '[INFO]',
        'Production debug logging disabled. Reload the page to take effect.',
      ]);
    });

    it('should handle missing window gracefully when enabling debug', () => {
      const originalWindow = global.window;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).window;

      expect(() => enableProductionDebug()).not.toThrow();

      global.window = originalWindow;
    });

    it('should handle missing window gracefully when disabling debug', () => {
      const originalWindow = global.window;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).window;

      expect(() => disableProductionDebug()).not.toThrow();

      global.window = originalWindow;
    });

    it('should log warning when localStorage.setItem throws error', () => {
      const throwingStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('localStorage access denied');
        },
        removeItem: () => null,
        clear: () => null,
        key: () => null,
        length: 0,
      };

      Object.defineProperty(window, 'localStorage', {
        value: throwingStorage,
        writable: true,
        configurable: true,
      });

      enableProductionDebug();

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const args = consoleSpy.warn.mock.calls[0];
      expect(args).toEqual([
        '[WARN]',
        'Failed to enable production debug logging: localStorage unavailable',
      ]);
    });

    it('should log warning when localStorage.removeItem throws error', () => {
      const throwingStorage = {
        getItem: () => null,
        setItem: () => null,
        removeItem: () => {
          throw new Error('localStorage access denied');
        },
        clear: () => null,
        key: () => null,
        length: 0,
      };

      Object.defineProperty(window, 'localStorage', {
        value: throwingStorage,
        writable: true,
        configurable: true,
      });

      disableProductionDebug();

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const args = consoleSpy.warn.mock.calls[0];
      expect(args).toEqual([
        '[WARN]',
        'Failed to disable production debug logging: localStorage unavailable',
      ]);
    });
  });

  describe('environment detection', () => {
    it('should detect development environment from process.env.NODE_ENV', () => {
      process.env.NODE_ENV = 'development';

      const devLogger = createLogger('EnvTest', {
        isDevelopment: true,
        enableTimestamps: false,
      });
      devLogger.debug('Should log in development');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const args = consoleSpy.log.mock.calls[0];
      expect(args[0]).toBe('[EnvTest] [DEBUG]');
      expect(args[1]).toBe('Should log in development');
    });

    it('should handle missing NODE_ENV gracefully', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      expect(() => createLogger('Fallback')).not.toThrow();

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should treat test environment as non-development', () => {
      process.env.NODE_ENV = 'test';

      const testLogger = createLogger('TestEnv', {
        isDevelopment: false,
        enableDebugInProduction: false,
      });

      testLogger.debug('Should not log in test mode');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('message formatting edge cases', () => {
    it('should handle objects in log messages', () => {
      const testLogger = createLogger('ObjectTest');
      const testObj = { key: 'value', nested: { deep: 'data' } };

      testLogger.info('Object:', testObj);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const args = consoleSpy.info.mock.calls[0];
      expect(args[0]).toBe('[ObjectTest] [INFO]');
      expect(args[1]).toBe('Object:');
      expect(args[2]).toEqual(testObj);
    });

    it('should handle arrays in log messages', () => {
      const testLogger = createLogger('ArrayTest');
      const testArray = [1, 2, 3, 'four'];

      testLogger.warn('Array:', testArray);

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const args = consoleSpy.warn.mock.calls[0];
      expect(args[0]).toBe('[ArrayTest] [WARN]');
      expect(args[1]).toBe('Array:');
      expect(args[2]).toEqual(testArray);
    });

    it('should handle null and undefined values', () => {
      const testLogger = createLogger('NullTest');

      testLogger.error('Null:', null, 'Undefined:', undefined);

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const args = consoleSpy.error.mock.calls[0];
      expect(args).toEqual(['[NullTest] [ERROR]', 'Null:', null, 'Undefined:', undefined]);
    });

    it('should handle empty log messages', () => {
      const testLogger = createLogger('EmptyTest');

      testLogger.info();

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const args = consoleSpy.info.mock.calls[0];
      expect(args[0]).toBe('[EmptyTest] [INFO]');
      expect(args.length).toBe(1);
    });
  });
});
