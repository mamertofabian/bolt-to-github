import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

const MockBackgroundServiceConstructor = vi.fn();

vi.mock('../BackgroundService', () => ({
  BackgroundService: MockBackgroundServiceConstructor,
}));

vi.mock('../../lib/utils/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

describe('background/index.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful initialization', () => {
    it('should initialize BackgroundService without errors', async () => {
      await import('../index');

      expect(MockBackgroundServiceConstructor).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should log error when BackgroundService initialization fails', async () => {
      const testError = new Error('Service initialization failed');

      MockBackgroundServiceConstructor.mockImplementation(() => {
        throw testError;
      });

      await import('../index');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize BackgroundService:',
        testError
      );
    });

    it('should handle non-Error objects thrown during initialization', async () => {
      const testError = 'String error message';

      MockBackgroundServiceConstructor.mockImplementation(() => {
        throw testError;
      });

      await import('../index');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize BackgroundService:',
        testError
      );
    });

    it('should continue execution after initialization failure', async () => {
      const testError = new Error('Initialization failure');

      MockBackgroundServiceConstructor.mockImplementation(() => {
        throw testError;
      });

      await import('../index');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize BackgroundService:',
        testError
      );
    });

    it('should recover from failed initialization on subsequent import', async () => {
      const testError = new Error('First initialization failed');

      MockBackgroundServiceConstructor.mockImplementationOnce(() => {
        throw testError;
      });

      await import('../index');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize BackgroundService:',
        testError
      );

      vi.clearAllMocks();
      vi.resetModules();

      MockBackgroundServiceConstructor.mockImplementationOnce(() => ({}));

      await import('../index');
      expect(mockLogger.info).toHaveBeenCalledWith('🎯 Background script entry point loaded');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });
});
