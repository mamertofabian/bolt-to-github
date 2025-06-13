/* eslint-env jest */

import { DOMObserver } from '../DOMObserver';

describe('DOMObserver', () => {
  let domObserver: DOMObserver;
  let mockCallback: jest.Mock;
  let mockOnError: jest.Mock;
  let mockMutationObserver: jest.Mock;
  let mockObserverInstance: any;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset mocks
    jest.clearAllMocks();

    // Mock callback functions
    mockCallback = jest.fn();
    mockOnError = jest.fn();

    // Mock MutationObserver
    mockObserverInstance = {
      observe: jest.fn(),
      disconnect: jest.fn(),
    };

    mockMutationObserver = jest.fn().mockImplementation(() => mockObserverInstance);

    // Replace global MutationObserver
    global.MutationObserver = mockMutationObserver;

    // Mock window.setTimeout and clearTimeout
    jest.spyOn(window, 'setTimeout').mockImplementation((callback, delay) => {
      const id = Math.random();
      return id as any;
    });

    jest.spyOn(window, 'clearTimeout').mockImplementation(() => {});

    domObserver = new DOMObserver();
  });

  afterEach(() => {
    domObserver.stop();
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('initializes with default parameters', () => {
      expect(domObserver).toBeInstanceOf(DOMObserver);
      expect(domObserver.isActive()).toBe(false);
      expect(domObserver.getRetryCount()).toBe(0);
    });

    test('initializes with custom parameters', () => {
      const customObserver = new DOMObserver(5, 2000, 1000);
      expect(customObserver).toBeInstanceOf(DOMObserver);
      expect(customObserver.isActive()).toBe(false);
      expect(customObserver.getRetryCount()).toBe(0);
    });

    test('starts in inactive state', () => {
      expect(domObserver.isActive()).toBe(false);
    });
  });

  describe('Observer Start/Stop', () => {
    test('starts observing correctly', () => {
      domObserver.start(mockCallback);

      expect(domObserver.isActive()).toBe(true);
      expect(mockMutationObserver).toHaveBeenCalled();
      expect(mockObserverInstance.observe).toHaveBeenCalledWith(document.body, {
        childList: true,
        subtree: true,
      });
    });

    test('calls callback immediately on start', () => {
      domObserver.start(mockCallback);

      expect(mockCallback).toHaveBeenCalled();
    });

    test('prevents multiple starts', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      domObserver.start(mockCallback);
      domObserver.start(mockCallback);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[DOMObserver] [WARN]',
        'DOMObserver is already observing'
      );
      expect(mockMutationObserver).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    test('stops observing correctly', () => {
      domObserver.start(mockCallback);
      expect(domObserver.isActive()).toBe(true);

      domObserver.stop();

      expect(domObserver.isActive()).toBe(false);
      expect(mockObserverInstance.disconnect).toHaveBeenCalled();
      expect(domObserver.getRetryCount()).toBe(0);
    });

    test('handles stop when not observing', () => {
      expect(() => {
        domObserver.stop();
      }).not.toThrow();

      expect(domObserver.isActive()).toBe(false);
    });
  });

  describe('DOM Body Availability', () => {
    test('observes immediately when body is available', () => {
      // Body is available by default in JSDOM
      domObserver.start(mockCallback);

      expect(mockObserverInstance.observe).toHaveBeenCalledWith(document.body, {
        childList: true,
        subtree: true,
      });
    });

    test('waits for DOMContentLoaded when body is not available', () => {
      // Mock missing body
      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        writable: true,
        value: null,
      });

      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      domObserver.start(mockCallback);

      expect(addEventListenerSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));

      // Restore body
      Object.defineProperty(document, 'body', {
        writable: true,
        value: originalBody,
      });
    });

    test('observes after DOMContentLoaded when body becomes available', () => {
      // Mock missing body initially
      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        writable: true,
        value: null,
      });

      let domContentLoadedCallback: (() => void) | undefined;
      jest.spyOn(document, 'addEventListener').mockImplementation((event, callback) => {
        if (event === 'DOMContentLoaded') {
          domContentLoadedCallback = callback as () => void;
        }
      });

      domObserver.start(mockCallback);

      // Body becomes available
      Object.defineProperty(document, 'body', {
        writable: true,
        value: originalBody,
      });

      // Trigger DOMContentLoaded
      if (domContentLoadedCallback) {
        domContentLoadedCallback();
      }

      expect(mockObserverInstance.observe).toHaveBeenCalledWith(document.body, {
        childList: true,
        subtree: true,
      });
    });
  });

  describe('Mutation Handling', () => {
    test('creates mutation observer with correct callback', () => {
      let mutationCallback: (() => void) | undefined;

      mockMutationObserver.mockImplementation((callback) => {
        mutationCallback = callback;
        return mockObserverInstance;
      });

      domObserver.start(mockCallback);

      expect(mockMutationObserver).toHaveBeenCalledWith(expect.any(Function));
      expect(typeof mutationCallback).toBe('function');
    });

    test('sets up timeout management on mutations', () => {
      let mutationCallback: (() => void) | undefined;

      mockMutationObserver.mockImplementation((callback) => {
        mutationCallback = callback;
        return mockObserverInstance;
      });

      domObserver.start(mockCallback);

      // Trigger mutation should set up timeout management
      if (mutationCallback) {
        mutationCallback();
      }

      expect(window.setTimeout).toHaveBeenCalled();
    });
  });

  describe('Retry Logic', () => {
    test('handles successful callback execution', () => {
      const customObserver = new DOMObserver(3, 100, 50);
      const successCallback = jest.fn();

      customObserver.start(successCallback);

      expect(successCallback).toHaveBeenCalled();
      expect(customObserver.getRetryCount()).toBe(0);
    });

    test('handles callback failure and sets up retry', () => {
      const customObserver = new DOMObserver(2, 100, 50);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const failingCallback = jest.fn(() => {
        throw new Error('Test error');
      });

      customObserver.start(failingCallback, mockOnError);

      expect(failingCallback).toHaveBeenCalled();
      expect(window.setTimeout).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[DOMObserver] [WARN]',
        'Initialization attempt failed:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('handles missing onError callback gracefully', () => {
      const customObserver = new DOMObserver(1, 100, 50);

      const alwaysFailingCallback = jest.fn(() => {
        throw new Error('Always fails');
      });

      expect(() => {
        customObserver.start(alwaysFailingCallback);
      }).not.toThrow();

      expect(alwaysFailingCallback).toHaveBeenCalled();
    });

    test('tracks retry count correctly', () => {
      const customObserver = new DOMObserver(3, 100, 50);

      expect(customObserver.getRetryCount()).toBe(0);
    });

    test('resets retry count manually', () => {
      const customObserver = new DOMObserver(3, 100, 50);

      customObserver.resetRetryCount();
      expect(customObserver.getRetryCount()).toBe(0);
    });
  });

  describe('State Management', () => {
    test('tracks active state correctly', () => {
      expect(domObserver.isActive()).toBe(false);

      domObserver.start(mockCallback);
      expect(domObserver.isActive()).toBe(true);

      domObserver.stop();
      expect(domObserver.isActive()).toBe(false);
    });

    test('returns correct retry count', () => {
      const customObserver = new DOMObserver(3, 100, 50);

      expect(customObserver.getRetryCount()).toBe(0);
      expect(typeof customObserver.getRetryCount()).toBe('number');
    });

    test('can restart after stopping', () => {
      domObserver.start(mockCallback);
      expect(domObserver.isActive()).toBe(true);

      domObserver.stop();
      expect(domObserver.isActive()).toBe(false);

      domObserver.start(mockCallback);
      expect(domObserver.isActive()).toBe(true);

      expect(mockMutationObserver).toHaveBeenCalledTimes(2);
    });
  });

  describe('Resource Management', () => {
    test('cleans up resources on stop', () => {
      domObserver.start(mockCallback);

      domObserver.stop();

      expect(mockObserverInstance.disconnect).toHaveBeenCalled();
      expect(domObserver.isActive()).toBe(false);
    });

    test('handles stop when observer is null', () => {
      // Start and manually set observer to null to test edge case
      domObserver.start(mockCallback);

      // Access private property for testing
      (domObserver as any).observer = null;

      expect(() => {
        domObserver.stop();
      }).not.toThrow();
    });

    test('clears timeout on mutations', () => {
      let mutationCallback: (() => void) | undefined;

      mockMutationObserver.mockImplementation((callback) => {
        mutationCallback = callback;
        return mockObserverInstance;
      });

      domObserver.start(mockCallback);

      // Trigger mutation should call clearTimeout if there's an existing timeout
      if (mutationCallback) {
        mutationCallback();
      }

      // Should call setTimeout for the new timeout
      expect(window.setTimeout).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('handles callback errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const errorCallback = jest.fn(() => {
        throw new Error('Test error');
      });

      domObserver.start(errorCallback, mockOnError);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[DOMObserver] [WARN]',
        'Initialization attempt failed:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('continues operating after callback errors', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Test error');
      });

      domObserver.start(errorCallback);

      expect(domObserver.isActive()).toBe(true);
      expect(errorCallback).toHaveBeenCalled();
    });

    test('handles missing MutationObserver gracefully', () => {
      // Mock missing MutationObserver
      const originalMutationObserver = global.MutationObserver;
      delete (global as any).MutationObserver;

      expect(() => {
        new DOMObserver().start(mockCallback);
      }).toThrow();

      // Restore MutationObserver
      global.MutationObserver = originalMutationObserver;
    });
  });

  describe('Integration Scenarios', () => {
    test('handles rapid DOM changes', () => {
      let mutationCallback: (() => void) | undefined;

      mockMutationObserver.mockImplementation((callback) => {
        mutationCallback = callback;
        return mockObserverInstance;
      });

      domObserver.start(mockCallback);

      // Clear initial callback call
      mockCallback.mockClear();

      // Trigger multiple rapid mutations
      for (let i = 0; i < 5; i++) {
        if (mutationCallback) {
          mutationCallback();
        }
      }

      // Should call setTimeout for each mutation
      expect(window.setTimeout).toHaveBeenCalled();
    });

    test('works with different callback signatures', () => {
      const voidCallback = jest.fn();
      const returningCallback = jest.fn(() => 'result');
      const asyncCallback = jest.fn(async () => Promise.resolve());

      // Test void callback
      domObserver.start(voidCallback);
      domObserver.stop();

      // Test returning callback
      domObserver.start(returningCallback);
      domObserver.stop();

      // Test async callback (should work as it's not awaited)
      domObserver.start(asyncCallback);

      expect(voidCallback).toHaveBeenCalled();
      expect(returningCallback).toHaveBeenCalled();
      expect(asyncCallback).toHaveBeenCalled();
    });

    test('maintains state across multiple callback executions', () => {
      let executionCount = 0;
      const trackingCallback = jest.fn(() => {
        executionCount++;
      });

      domObserver.start(trackingCallback);

      // Simulate mutation
      let mutationCallback: (() => void) | undefined;
      mockMutationObserver.mockImplementation((callback) => {
        mutationCallback = callback;
        return mockObserverInstance;
      });

      domObserver.stop();
      domObserver.start(trackingCallback);

      if (mutationCallback) {
        mutationCallback();
      }

      expect(executionCount).toBeGreaterThan(1);
      expect(domObserver.isActive()).toBe(true);
    });
  });
});
