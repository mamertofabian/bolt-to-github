import {
  logger,
  createLogger,
  enableProductionDebug,
  disableProductionDebug,
  resetLogger,
} from '../logger';

// Mock console methods
const mockConsole = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

// Mock import.meta.env is not needed since we use fallback in logger

describe('Logger', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock console
    Object.assign(console, mockConsole);

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Mock process.env for testing (set to production by default)
    process.env.NODE_ENV = 'production';

    // Reset logger to pick up new environment
    resetLogger();
  });

  describe('default logger', () => {
    it('should log info, warn, and error messages', () => {
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      expect(mockConsole.info).toHaveBeenCalledWith('[INFO]', 'Info message');
      expect(mockConsole.warn).toHaveBeenCalledWith('[WARN]', 'Warning message');
      expect(mockConsole.error).toHaveBeenCalledWith('[ERROR]', 'Error message');
    });

    it('should not log debug messages in production by default', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      logger.debug('Debug message');

      expect(mockConsole.log).not.toHaveBeenCalled();
    });

    it('should log debug messages when enableDebugInProduction is true', () => {
      mockLocalStorage.getItem.mockReturnValue('true');

      // Create a new logger instance with debug enabled in production
      const testLogger = createLogger('Test', { enableDebugInProduction: true });
      testLogger.debug('Debug message');

      expect(mockConsole.log).toHaveBeenCalledWith('[Test] [DEBUG]', 'Debug message');
    });
  });

  describe('createLogger', () => {
    it('should create logger with module prefix', () => {
      const moduleLogger = createLogger('TestModule');

      moduleLogger.info('Test message');

      expect(mockConsole.info).toHaveBeenCalledWith('[TestModule] [INFO]', 'Test message');
    });

    it('should support custom configuration', () => {
      const customLogger = createLogger('Custom', {
        isDevelopment: true,
        enableTimestamps: true,
      });

      customLogger.debug('Debug message');

      // Should include timestamp, module prefix, and level
      const call = mockConsole.log.mock.calls[0];
      expect(call[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[Custom\] \[DEBUG\]$/);
      expect(call[1]).toBe('Debug message');
    });

    it('should log debug messages in development mode', () => {
      const devLogger = createLogger('Dev', { isDevelopment: true });

      devLogger.debug('Development debug');

      expect(mockConsole.log).toHaveBeenCalledWith('[Dev] [DEBUG]', 'Development debug');
    });
  });

  describe('production debug control', () => {
    it('should enable production debug and set localStorage', () => {
      enableProductionDebug();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('bolt-to-github-debug', 'true');
      expect(mockConsole.info).toHaveBeenCalledWith(
        '[INFO]',
        'Production debug logging enabled. Reload the page to take effect.'
      );
    });

    it('should disable production debug and remove from localStorage', () => {
      disableProductionDebug();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('bolt-to-github-debug');
      expect(mockConsole.info).toHaveBeenCalledWith(
        '[INFO]',
        'Production debug logging disabled. Reload the page to take effect.'
      );
    });

    it('should handle missing localStorage gracefully', () => {
      // Remove window to simulate environment without localStorage
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      expect(() => enableProductionDebug()).not.toThrow();
      expect(() => disableProductionDebug()).not.toThrow();

      // Restore window
      global.window = originalWindow;
    });

    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw an error
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('localStorage access denied');
      });
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      expect(() => enableProductionDebug()).not.toThrow();
      expect(() => disableProductionDebug()).not.toThrow();

      expect(mockConsole.warn).toHaveBeenCalledWith(
        '[WARN]',
        'Failed to enable production debug logging: localStorage unavailable'
      );
      expect(mockConsole.warn).toHaveBeenCalledWith(
        '[WARN]',
        'Failed to disable production debug logging: localStorage unavailable'
      );
    });
  });

  describe('message formatting', () => {
    it('should format messages without prefix when no module specified', () => {
      const simpleLogger = createLogger('', { enableTimestamps: false });

      simpleLogger.info('Simple message');

      expect(mockConsole.info).toHaveBeenCalledWith('[INFO]', 'Simple message');
    });

    it('should handle multiple arguments', () => {
      const testLogger = createLogger('Multi');

      testLogger.warn('Warning:', { error: 'details' }, 123);

      expect(mockConsole.warn).toHaveBeenCalledWith(
        '[Multi] [WARN]',
        'Warning:',
        { error: 'details' },
        123
      );
    });

    it('should format timestamps when enabled', () => {
      const timestampLogger = createLogger('Time', { enableTimestamps: true });

      timestampLogger.error('Error with timestamp');

      const call = mockConsole.error.mock.calls[0];
      expect(call[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[Time\] \[ERROR\]$/);
    });
  });

  describe('environment detection', () => {
    it('should detect development environment from process.env.NODE_ENV', () => {
      process.env.NODE_ENV = 'development';

      const devLogger = createLogger('EnvTest', { isDevelopment: true });
      devLogger.debug('Should log in development');

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should handle missing environment variables gracefully', () => {
      delete process.env.NODE_ENV;

      expect(() => createLogger('Fallback')).not.toThrow();
    });
  });
});
