/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleMonitorService } from '../IdleMonitorService';

type IdleStateType = 'active' | 'idle' | 'locked';

class MockChromeIdle {
  private detectionInterval: number = 60;
  private currentState: IdleStateType = 'active';
  private stateChangeListeners: Array<(state: IdleStateType) => void> = [];

  setDetectionInterval = vi.fn((intervalInSeconds: number) => {
    this.detectionInterval = intervalInSeconds;
  });

  onStateChanged = {
    addListener: vi.fn((callback: (state: IdleStateType) => void) => {
      this.stateChangeListeners.push(callback);
    }),
  };

  queryState = vi.fn(
    (detectionIntervalInSeconds: number, callback: (state: IdleStateType) => void) => {
      callback(this.currentState);
    }
  );

  simulateStateChange(newState: IdleStateType) {
    this.currentState = newState;

    const listeners = [...this.stateChangeListeners];
    listeners.forEach((listener) => listener(newState));
  }

  getDetectionInterval() {
    return this.detectionInterval;
  }
}

describe('IdleMonitorService', () => {
  let mockChromeIdle: MockChromeIdle;
  let idleMonitorService: IdleMonitorService;

  beforeEach(() => {
    mockChromeIdle = new MockChromeIdle();

    IdleMonitorService.resetInstance();

    idleMonitorService = IdleMonitorService.getInstance(
      mockChromeIdle as unknown as typeof chrome.idle
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      const service = IdleMonitorService.getInstance(
        mockChromeIdle as unknown as typeof chrome.idle
      );

      mockChromeIdle.setDetectionInterval.mockClear();
      mockChromeIdle.onStateChanged.addListener.mockClear();
      mockChromeIdle.queryState.mockClear();

      const wasInitialized = (service as any).initialized;

      const nullChromeIdle = null as unknown as typeof chrome.idle;
      const serviceWithNullIdle = IdleMonitorService.getInstance(nullChromeIdle);

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
      const queryStateCallback = mockChromeIdle.queryState.mock.calls[0][1];

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
      const listener = vi.fn();
      idleMonitorService.addListener(listener);

      mockChromeIdle.simulateStateChange('idle');
      expect(listener).toHaveBeenCalledWith('idle');
    });

    it('should not notify removed listeners', () => {
      const listener = vi.fn();
      idleMonitorService.addListener(listener);
      idleMonitorService.removeListener(listener);

      mockChromeIdle.simulateStateChange('idle');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should notify multiple listeners in order', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      idleMonitorService.addListener(listener1);
      idleMonitorService.addListener(listener2);
      idleMonitorService.addListener(listener3);

      mockChromeIdle.simulateStateChange('idle');

      expect(listener1).toHaveBeenCalledWith('idle');
      expect(listener2).toHaveBeenCalledWith('idle');
      expect(listener3).toHaveBeenCalledWith('idle');

      expect(listener1.mock.invocationCallOrder[0]).toBeLessThan(
        listener2.mock.invocationCallOrder[0]
      );
      expect(listener2.mock.invocationCallOrder[0]).toBeLessThan(
        listener3.mock.invocationCallOrder[0]
      );
    });

    it('should support removing listeners while iterating', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn().mockImplementation(() => {
        idleMonitorService.removeListener(listener3);
      });
      const listener3 = vi.fn();

      idleMonitorService.addListener(listener1);
      idleMonitorService.addListener(listener2);
      idleMonitorService.addListener(listener3);

      const notifyListenersSpy = vi.spyOn(idleMonitorService as any, 'notifyListeners');

      mockChromeIdle.simulateStateChange('idle');

      expect(listener1).toHaveBeenCalledWith('idle');
      expect(listener2).toHaveBeenCalledWith('idle');
      expect(listener3).toHaveBeenCalledWith('idle');

      listener1.mockClear();
      listener2.mockClear();
      listener3.mockClear();

      mockChromeIdle.simulateStateChange('locked');

      expect(listener1).toHaveBeenCalledWith('locked');
      expect(listener2).toHaveBeenCalledWith('locked');
      expect(listener3).not.toHaveBeenCalled();

      notifyListenersSpy.mockRestore();
    });

    it('should not break if removing a non-existent listener', () => {
      const nonExistentListener = vi.fn();

      expect(() => {
        idleMonitorService.removeListener(nonExistentListener);
      }).not.toThrow();
    });

    it('should call the same listener multiple times if added multiple times', () => {
      const listener = vi.fn();

      idleMonitorService.addListener(listener);
      idleMonitorService.addListener(listener);

      const listenersArray = (idleMonitorService as any).listeners;
      const count = listenersArray.filter((l: any) => l === listener).length;
      expect(count).toBe(2);

      mockChromeIdle.simulateStateChange('idle');
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, 'idle');
      expect(listener).toHaveBeenNthCalledWith(2, 'idle');
    });
  });
});
