import {
  createLogger,
  disableProductionDebug,
  enableProductionDebug,
  logger,
  resetLogger,
} from '../logger';

const mockConsole = {
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.assign(console, mockConsole);

    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    process.env.NODE_ENV = 'production';

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

    it('should log debug messages in production by default', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      logger.debug('Debug message');

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should log debug messages when enableDebugInProduction is true', () => {
      mockLocalStorage.getItem.mockReturnValue('true');

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
      const originalWindow = global.window;
      // @ts-expect-error - this is a test
      delete global.window;

      expect(() => enableProductionDebug()).not.toThrow();
      expect(() => disableProductionDebug()).not.toThrow();

      global.window = originalWindow;
    });

    it('should handle localStorage errors gracefully', () => {
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
