/* eslint-disable @typescript-eslint/no-explicit-any */
import { IdleMonitorService } from '../IdleMonitorService';
import { expect, jest, describe, it, beforeEach, afterEach } from '@jest/globals';

// Define test types without colliding with chrome namespace
type IdleStateType = 'active' | 'idle' | 'locked';

/**
 * Mock implementation of chrome.idle API
 */
class MockChromeIdle {
  private detectionInterval: number = 60;
  private currentState: IdleStateType = 'active';
  private stateChangeListeners: Array<(state: IdleStateType) => void> = [];

  setDetectionInterval = jest.fn((intervalInSeconds: number) => {
    this.detectionInterval = intervalInSeconds;
  });

  onStateChanged = {
    addListener: jest.fn((callback: (state: IdleStateType) => void) => {
      this.stateChangeListeners.push(callback);
    }),
  };

  queryState = jest.fn(
    (detectionIntervalInSeconds: number, callback: (state: IdleStateType) => void) => {
      callback(this.currentState);
    }
  );

  // Helper method to simulate state changes
  simulateStateChange(newState: IdleStateType) {
    this.currentState = newState;
    // Create a copy of listeners array to avoid modification during iteration
    const listeners = [...this.stateChangeListeners];
    listeners.forEach((listener) => listener(newState));
  }

  // Helper method to get current detection interval
  getDetectionInterval() {
    return this.detectionInterval;
  }
}

describe('IdleMonitorService', () => {
  let mockChromeIdle: MockChromeIdle;
  let idleMonitorService: IdleMonitorService;

  beforeEach(() => {
    mockChromeIdle = new MockChromeIdle();

    // Reset singleton instance
    IdleMonitorService.resetInstance();

    // Create a new instance with mock
    idleMonitorService = IdleMonitorService.getInstance(
      mockChromeIdle as unknown as typeof chrome.idle
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should set up idle detection with default threshold', () => {
      expect(mockChromeIdle.setDetectionInterval).toHaveBeenCalledWith(60);
      expect(mockChromeIdle.onStateChanged.addListener).toHaveBeenCalled();
      expect(mockChromeIdle.queryState).toHaveBeenCalledWith(60, expect.any(Function));
    });

    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = IdleMonitorService.getInstance(
        mockChromeIdle as unknown as typeof chrome.idle
      );
      const instance2 = IdleMonitorService.getInstance(
        mockChromeIdle as unknown as typeof chrome.idle
      );
      expect(instance1).toBe(instance2);
    });

    it('should initialize only once even if getInstance is called multiple times', () => {
      IdleMonitorService.getInstance(mockChromeIdle as unknown as typeof chrome.idle);
      IdleMonitorService.getInstance(mockChromeIdle as unknown as typeof chrome.idle);

      expect(mockChromeIdle.setDetectionInterval).toHaveBeenCalledTimes(1);
      expect(mockChromeIdle.onStateChanged.addListener).toHaveBeenCalledTimes(1);
      expect(mockChromeIdle.queryState).toHaveBeenCalledTimes(1);
    });

    it('should handle missing chrome.idle API gracefully', () => {
      // Create a service instance first
      const service = IdleMonitorService.getInstance(
        mockChromeIdle as unknown as typeof chrome.idle
      );

      // Reset call counts
      mockChromeIdle.setDetectionInterval.mockClear();
      mockChromeIdle.onStateChanged.addListener.mockClear();
      mockChromeIdle.queryState.mockClear();

      // Store the initialized state
      const wasInitialized = (service as any).initialized;

      // Create a new instance with null chrome idle
      const nullChromeIdle = null as unknown as typeof chrome.idle;
      const serviceWithNullIdle = IdleMonitorService.getInstance(nullChromeIdle);

      // Should return the existing instance
      expect(serviceWithNullIdle).toBe(service);
      expect(mockChromeIdle.setDetectionInterval).not.toHaveBeenCalled();
      expect((serviceWithNullIdle as any).initialized).toBe(wasInitialized);
    });
  });

  describe('state management', () => {
    it('should return active by default', () => {
      expect(idleMonitorService.getCurrentState()).toBe('active');
      expect(idleMonitorService.isIdle()).toBe(false);
    });

    it('should update state when chrome reports idle', () => {
      mockChromeIdle.simulateStateChange('idle');
      expect(idleMonitorService.getCurrentState()).toBe('idle');
      expect(idleMonitorService.isIdle()).toBe(true);
    });

    it('should update state when chrome reports locked', () => {
      mockChromeIdle.simulateStateChange('locked');
      expect(idleMonitorService.getCurrentState()).toBe('locked');
      expect(idleMonitorService.isIdle()).toBe(true);
    });

    it('should handle state transitions correctly', () => {
      // Test transition sequence: active -> idle -> locked -> active
      expect(idleMonitorService.getCurrentState()).toBe('active');
      expect(idleMonitorService.isIdle()).toBe(false);

      mockChromeIdle.simulateStateChange('idle');
      expect(idleMonitorService.getCurrentState()).toBe('idle');
      expect(idleMonitorService.isIdle()).toBe(true);

      mockChromeIdle.simulateStateChange('locked');
      expect(idleMonitorService.getCurrentState()).toBe('locked');
      expect(idleMonitorService.isIdle()).toBe(true);

      mockChromeIdle.simulateStateChange('active');
      expect(idleMonitorService.getCurrentState()).toBe('active');
      expect(idleMonitorService.isIdle()).toBe(false);
    });

    it('should update state from chrome.idle.queryState callback', () => {
      // Capture the callback from queryState
      const queryStateCallback = mockChromeIdle.queryState.mock.calls[0][1];

      // Simulate callback with different states
      queryStateCallback('idle');
      expect(idleMonitorService.getCurrentState()).toBe('idle');
      expect(idleMonitorService.isIdle()).toBe(true);

      queryStateCallback('locked');
      expect(idleMonitorService.getCurrentState()).toBe('locked');
      expect(idleMonitorService.isIdle()).toBe(true);

      queryStateCallback('active');
      expect(idleMonitorService.getCurrentState()).toBe('active');
      expect(idleMonitorService.isIdle()).toBe(false);
    });
  });

  describe('listener management', () => {
    it('should notify listeners when state changes', () => {
      const listener = jest.fn();
      idleMonitorService.addListener(listener);

      mockChromeIdle.simulateStateChange('idle');
      expect(listener).toHaveBeenCalledWith('idle');
    });

    it('should not notify removed listeners', () => {
      const listener = jest.fn();
      idleMonitorService.addListener(listener);
      idleMonitorService.removeListener(listener);

      mockChromeIdle.simulateStateChange('idle');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should notify multiple listeners in order', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      idleMonitorService.addListener(listener1);
      idleMonitorService.addListener(listener2);
      idleMonitorService.addListener(listener3);

      mockChromeIdle.simulateStateChange('idle');

      expect(listener1).toHaveBeenCalledWith('idle');
      expect(listener2).toHaveBeenCalledWith('idle');
      expect(listener3).toHaveBeenCalledWith('idle');

      // Verify call order
      expect(listener1.mock.invocationCallOrder[0]).toBeLessThan(
        listener2.mock.invocationCallOrder[0]
      );
      expect(listener2.mock.invocationCallOrder[0]).toBeLessThan(
        listener3.mock.invocationCallOrder[0]
      );
    });

    it('should support removing listeners while iterating', () => {
      // Looking at the IdleMonitorService implementation, we can see it uses
      // filter to create a new array when removing listeners, which is safe
      const listener1 = jest.fn();
      const listener2 = jest.fn().mockImplementation(() => {
        // This will remove listener3 from the array during iteration
        idleMonitorService.removeListener(listener3);
      });
      const listener3 = jest.fn();

      // Add all listeners
      idleMonitorService.addListener(listener1);
      idleMonitorService.addListener(listener2);
      idleMonitorService.addListener(listener3);

      // Setup a spy on the notifyListeners method
      const notifyListenersSpy = jest.spyOn(idleMonitorService as any, 'notifyListeners');

      // The implementation of notifyListeners in IdleMonitorService uses forEach
      // on the listeners array, which internally makes a snapshot of the array
      // So removing a listener during iteration doesn't affect the current loop
      mockChromeIdle.simulateStateChange('idle');

      // Both should be called because the loop iterates over a snapshot
      expect(listener1).toHaveBeenCalledWith('idle');
      expect(listener2).toHaveBeenCalledWith('idle');
      expect(listener3).toHaveBeenCalledWith('idle');

      // Verify listener3 was actually removed for future notifications
      listener1.mockClear();
      listener2.mockClear();
      listener3.mockClear();

      // Trigger another notification
      mockChromeIdle.simulateStateChange('locked');

      // Now listener3 should not be called
      expect(listener1).toHaveBeenCalledWith('locked');
      expect(listener2).toHaveBeenCalledWith('locked');
      expect(listener3).not.toHaveBeenCalled();

      // Clean up
      notifyListenersSpy.mockRestore();
    });

    it('should not break if removing a non-existent listener', () => {
      const nonExistentListener = jest.fn();

      // Should not throw an error
      expect(() => {
        idleMonitorService.removeListener(nonExistentListener);
      }).not.toThrow();
    });

    it('should call the same listener multiple times if added multiple times', () => {
      // Based on the implementation, IdleMonitorService does not filter out duplicate listeners
      const listener = jest.fn();

      // Add the listener twice
      idleMonitorService.addListener(listener);
      idleMonitorService.addListener(listener);

      // Verify it was added twice by checking the listeners array
      const listenersArray = (idleMonitorService as any).listeners;
      const count = listenersArray.filter((l: any) => l === listener).length;
      expect(count).toBe(2);

      // It should be called twice when state changes
      mockChromeIdle.simulateStateChange('idle');
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, 'idle');
      expect(listener).toHaveBeenNthCalledWith(2, 'idle');
    });
  });
});
