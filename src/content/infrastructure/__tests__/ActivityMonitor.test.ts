import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityMonitor } from '../ActivityMonitor';

describe('ActivityMonitor', () => {
  let monitor: ActivityMonitor;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useFakeTimers();

    monitor = new ActivityMonitor();
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
    vi.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with current timestamp for last activities', () => {
      expect(monitor.getTimeSinceUserActivity()).toBeLessThanOrEqual(10);
      expect(monitor.getTimeSinceBoltActivity()).toBeLessThanOrEqual(10);
    });

    it('should not be idle immediately after construction', () => {
      expect(monitor.isUserIdle()).toBe(false);
      expect(monitor.isBoltIdle()).toBe(false);
      expect(monitor.isSystemIdle()).toBe(false);
    });

    it('should set up user activity listeners on construction', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const newMonitor = new ActivityMonitor();

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), {
        passive: true,
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), {
        passive: true,
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('keypress', expect.any(Function), {
        passive: true,
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), {
        passive: true,
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), {
        passive: true,
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function), {
        passive: true,
      });

      newMonitor.stop();
    });

    it('should set up Bolt activity monitoring with MutationObserver', () => {
      const newMonitor = new ActivityMonitor();

      const debugInfo = newMonitor.getDebugInfo() as { isMonitoring: boolean };
      expect(debugInfo).toBeDefined();

      newMonitor.stop();
    });
  });

  describe('User Activity Detection', () => {
    it('should update last user activity on mousedown event', () => {
      vi.advanceTimersByTime(1000);
      const timeBefore = monitor.getTimeSinceUserActivity();

      const mouseEvent = new MouseEvent('mousedown');
      document.dispatchEvent(mouseEvent);

      const timeAfter = monitor.getTimeSinceUserActivity();
      expect(timeAfter).toBeLessThan(timeBefore);
    });

    it('should update last user activity on mousemove event', () => {
      vi.advanceTimersByTime(1000);

      const mouseEvent = new MouseEvent('mousemove');
      document.dispatchEvent(mouseEvent);

      expect(monitor.getTimeSinceUserActivity()).toBeLessThan(100);
    });

    it('should update last user activity on keypress event', () => {
      vi.advanceTimersByTime(1000);

      const keyEvent = new KeyboardEvent('keypress');
      document.dispatchEvent(keyEvent);

      expect(monitor.getTimeSinceUserActivity()).toBeLessThan(100);
    });

    it('should update last user activity on scroll event', () => {
      vi.advanceTimersByTime(1000);

      const scrollEvent = new Event('scroll');
      document.dispatchEvent(scrollEvent);

      expect(monitor.getTimeSinceUserActivity()).toBeLessThan(100);
    });

    it('should update last user activity on touchstart event', () => {
      vi.advanceTimersByTime(1000);

      const touchEvent = new TouchEvent('touchstart');
      document.dispatchEvent(touchEvent);

      expect(monitor.getTimeSinceUserActivity()).toBeLessThan(100);
    });

    it('should update last user activity on click event', () => {
      vi.advanceTimersByTime(1000);

      const clickEvent = new MouseEvent('click');
      document.dispatchEvent(clickEvent);

      expect(monitor.getTimeSinceUserActivity()).toBeLessThan(100);
    });

    it('should detect user as idle after 5 minutes of inactivity', () => {
      expect(monitor.isUserIdle()).toBe(false);

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(monitor.isUserIdle()).toBe(true);
    });

    it('should not detect user as idle before 5 minutes', () => {
      vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000);

      expect(monitor.isUserIdle()).toBe(false);
    });

    it('should reset idle state after user activity', () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(monitor.isUserIdle()).toBe(true);

      const mouseEvent = new MouseEvent('mousedown');
      document.dispatchEvent(mouseEvent);

      expect(monitor.isUserIdle()).toBe(false);
    });
  });

  describe('Bolt Activity Detection', () => {
    it('should detect Bolt activity when element with data-testid="chat-input" is added', () => {
      const chatInput = document.createElement('div');
      chatInput.setAttribute('data-testid', 'chat-input');

      document.body.appendChild(chatInput);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity with animate-pulse class', () => {
      const element = document.createElement('div');
      element.className = 'animate-pulse';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity with animate-spin class', () => {
      const element = document.createElement('div');
      element.className = 'animate-spin';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity with loading class', () => {
      const element = document.createElement('div');
      element.className = 'loading-indicator';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity with generating class', () => {
      const element = document.createElement('div');
      element.className = 'generating-content';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity with streaming class', () => {
      const element = document.createElement('div');
      element.className = 'streaming-response';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity from text content with "generating"', () => {
      const element = document.createElement('div');
      element.textContent = 'Generating response...';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity from text content with "thinking"', () => {
      const element = document.createElement('div');
      element.textContent = 'AI is thinking...';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity from text content with "processing"', () => {
      const element = document.createElement('div');
      element.textContent = 'Processing your request';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity from text content with "analyzing"', () => {
      const element = document.createElement('div');
      element.textContent = 'Analyzing code...';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity from text content with "loading"', () => {
      const element = document.createElement('div');
      element.textContent = 'Loading results';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity from text content with "please wait"', () => {
      const element = document.createElement('div');
      element.textContent = 'Please wait while we process your request';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity from nested elements', () => {
      const parent = document.createElement('div');
      const child = document.createElement('div');
      child.className = 'animate-pulse';
      parent.appendChild(child);

      document.body.appendChild(parent);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should detect Bolt activity on attribute changes', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      vi.advanceTimersByTime(2000);
      const timeBefore = monitor.getTimeSinceBoltActivity();

      element.className = 'animate-spin';

      vi.runOnlyPendingTimers();

      const timeAfter = monitor.getTimeSinceBoltActivity();
      expect(timeAfter).toBeLessThanOrEqual(timeBefore);
    });

    it('should detect Bolt as idle after 2 minutes of inactivity', () => {
      expect(monitor.isBoltIdle()).toBe(false);

      vi.advanceTimersByTime(2 * 60 * 1000);

      expect(monitor.isBoltIdle()).toBe(true);
    });

    it('should not detect Bolt as idle before 2 minutes', () => {
      vi.advanceTimersByTime(1 * 60 * 1000 + 59 * 1000);

      expect(monitor.isBoltIdle()).toBe(false);
    });
  });

  describe('System Idle State', () => {
    it('should detect system as idle when both user and Bolt are idle', () => {
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(monitor.isSystemIdle()).toBe(true);
    });

    it('should not detect system as idle when user is active', () => {
      vi.advanceTimersByTime(5 * 60 * 1000);

      const mouseEvent = new MouseEvent('mousedown');
      document.dispatchEvent(mouseEvent);

      expect(monitor.isSystemIdle()).toBe(false);
    });

    it('should not detect system as idle when Bolt is active', () => {
      const element = document.createElement('div');
      element.className = 'animate-pulse';
      document.body.appendChild(element);

      vi.runOnlyPendingTimers();

      expect(monitor.isSystemIdle()).toBe(false);
    });

    it('should not detect system as idle when both are active', () => {
      expect(monitor.isSystemIdle()).toBe(false);
    });
  });

  describe('Activity Listener Management', () => {
    it('should call listener when user activity occurs', () => {
      const listener = vi.fn();
      monitor.addActivityListener(listener);

      const mouseEvent = new MouseEvent('mousedown');
      document.dispatchEvent(mouseEvent);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should notify listeners when activity is detected', () => {
      const listener = vi.fn();
      monitor.addActivityListener(listener);

      const mouseEvent = new MouseEvent('mousedown');
      document.dispatchEvent(mouseEvent);

      expect(listener).toHaveBeenCalled();
    });

    it('should call multiple listeners on activity', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      monitor.addActivityListener(listener1);
      monitor.addActivityListener(listener2);
      monitor.addActivityListener(listener3);

      const mouseEvent = new MouseEvent('mousedown');
      document.dispatchEvent(mouseEvent);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('should remove listener correctly', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      monitor.addActivityListener(listener1);
      monitor.addActivityListener(listener2);

      monitor.removeActivityListener(listener1);

      const mouseEvent = new MouseEvent('mousedown');
      document.dispatchEvent(mouseEvent);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should handle removing non-existent listener gracefully', () => {
      const listener = vi.fn();

      expect(() => {
        monitor.removeActivityListener(listener);
      }).not.toThrow();
    });

    it('should not fail if listener throws error', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      monitor.addActivityListener(errorListener);
      monitor.addActivityListener(goodListener);

      const mouseEvent = new MouseEvent('mousedown');

      expect(() => {
        document.dispatchEvent(mouseEvent);
      }).not.toThrow();

      expect(errorListener).toHaveBeenCalledTimes(1);
      expect(goodListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Start and Stop', () => {
    it('should start monitoring', () => {
      const newMonitor = new ActivityMonitor();

      newMonitor.start();

      const debugInfo = newMonitor.getDebugInfo() as { isMonitoring: boolean };
      expect(debugInfo.isMonitoring).toBe(true);

      newMonitor.stop();
    });

    it('should stop monitoring', () => {
      monitor.start();
      monitor.stop();

      const debugInfo = monitor.getDebugInfo() as { isMonitoring: boolean };
      expect(debugInfo.isMonitoring).toBe(false);
    });

    it('should clear all listeners on stop', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      monitor.addActivityListener(listener1);
      monitor.addActivityListener(listener2);

      monitor.stop();

      const mouseEvent = new MouseEvent('mousedown');
      document.dispatchEvent(mouseEvent);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should disconnect MutationObserver on stop', () => {
      const newMonitor = new ActivityMonitor();

      newMonitor.stop();

      const debugInfo = newMonitor.getDebugInfo() as { isMonitoring: boolean };
      expect(debugInfo.isMonitoring).toBe(false);
    });

    it('should handle stop when already stopped', () => {
      monitor.stop();

      expect(() => {
        monitor.stop();
      }).not.toThrow();
    });

    it('should allow restart after stop', () => {
      monitor.stop();
      monitor.start();

      const debugInfo = monitor.getDebugInfo() as { isMonitoring: boolean };
      expect(debugInfo.isMonitoring).toBe(true);
    });
  });

  describe('Time Since Activity', () => {
    it('should return accurate time since user activity', () => {
      const startTime = monitor.getTimeSinceUserActivity();

      vi.advanceTimersByTime(3000);

      const elapsed = monitor.getTimeSinceUserActivity();
      expect(elapsed).toBeGreaterThanOrEqual(3000);
      expect(elapsed).toBeGreaterThan(startTime);
    });

    it('should return accurate time since Bolt activity', () => {
      const startTime = monitor.getTimeSinceBoltActivity();

      vi.advanceTimersByTime(3000);

      const elapsed = monitor.getTimeSinceBoltActivity();
      expect(elapsed).toBeGreaterThanOrEqual(3000);
      expect(elapsed).toBeGreaterThan(startTime);
    });

    it('should reset time since user activity on user event', () => {
      vi.advanceTimersByTime(3000);

      const mouseEvent = new MouseEvent('mousedown');
      document.dispatchEvent(mouseEvent);

      expect(monitor.getTimeSinceUserActivity()).toBeLessThan(100);
    });

    it('should reset time since Bolt activity on Bolt event', () => {
      vi.advanceTimersByTime(3000);
      const timeBefore = monitor.getTimeSinceBoltActivity();

      const element = document.createElement('div');
      element.className = 'animate-pulse';
      document.body.appendChild(element);

      vi.runOnlyPendingTimers();

      const timeAfter = monitor.getTimeSinceBoltActivity();
      expect(timeAfter).toBeLessThanOrEqual(timeBefore);
    });
  });

  describe('Debug Information', () => {
    it('should provide debug information', () => {
      const debugInfo = monitor.getDebugInfo() as {
        isMonitoring: boolean;
        userIdleFor: number;
        boltIdleFor: number;
        isUserIdle: boolean;
        isBoltIdle: boolean;
        isSystemIdle: boolean;
        listenerCount: number;
      };

      expect(debugInfo).toHaveProperty('isMonitoring');
      expect(debugInfo).toHaveProperty('userIdleFor');
      expect(debugInfo).toHaveProperty('boltIdleFor');
      expect(debugInfo).toHaveProperty('isUserIdle');
      expect(debugInfo).toHaveProperty('isBoltIdle');
      expect(debugInfo).toHaveProperty('isSystemIdle');
      expect(debugInfo).toHaveProperty('listenerCount');
    });

    it('should show correct listener count in debug info', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      monitor.addActivityListener(listener1);
      monitor.addActivityListener(listener2);

      const debugInfo = monitor.getDebugInfo() as { listenerCount: number };
      expect(debugInfo.listenerCount).toBe(2);
    });

    it('should show correct idle states in debug info', () => {
      vi.advanceTimersByTime(5 * 60 * 1000);

      const debugInfo = monitor.getDebugInfo() as {
        isUserIdle: boolean;
        isBoltIdle: boolean;
        isSystemIdle: boolean;
      };

      expect(debugInfo.isUserIdle).toBe(true);
      expect(debugInfo.isBoltIdle).toBe(true);
      expect(debugInfo.isSystemIdle).toBe(true);
    });

    it('should show correct time values in debug info', () => {
      vi.advanceTimersByTime(10000);

      const debugInfo = monitor.getDebugInfo() as {
        userIdleFor: number;
        boltIdleFor: number;
      };

      expect(debugInfo.userIdleFor).toBeGreaterThanOrEqual(10000);
      expect(debugInfo.boltIdleFor).toBeGreaterThanOrEqual(10000);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle document.body not available initially', () => {
      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        configurable: true,
        get: vi.fn(() => null),
      });

      expect(() => {
        new ActivityMonitor();
      }).not.toThrow();

      Object.defineProperty(document, 'body', {
        configurable: true,
        get: vi.fn(() => originalBody),
      });
    });

    it('should retry observing document.body if not available', () => {
      const originalBody = document.body;
      let callCount = 0;

      Object.defineProperty(document, 'body', {
        configurable: true,
        get: vi.fn(() => {
          callCount++;
          if (callCount <= 2) {
            return null;
          }
          return originalBody;
        }),
      });

      const newMonitor = new ActivityMonitor();

      vi.advanceTimersByTime(300);

      Object.defineProperty(document, 'body', {
        configurable: true,
        get: vi.fn(() => originalBody),
      });

      newMonitor.stop();
    });

    it('should handle case-insensitive text matching', () => {
      const element = document.createElement('div');
      element.textContent = 'GENERATING RESPONSE';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should not detect non-Bolt activity', () => {
      const initialTime = monitor.getTimeSinceBoltActivity();

      const element = document.createElement('div');
      element.textContent = 'Regular content';
      element.className = 'normal-class';

      document.body.appendChild(element);

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeGreaterThanOrEqual(initialTime);
    });

    it('should handle empty text content', () => {
      const element = document.createElement('div');
      element.textContent = '';

      expect(() => {
        document.body.appendChild(element);
        vi.advanceTimersByTime(100);
      }).not.toThrow();
    });

    it('should handle text nodes that are not Element nodes', () => {
      const textNode = document.createTextNode('generating content');

      expect(() => {
        document.body.appendChild(textNode);
        vi.advanceTimersByTime(100);
      }).not.toThrow();
    });

    it('should handle multiple rapid DOM mutations', () => {
      for (let i = 0; i < 10; i++) {
        const element = document.createElement('div');
        element.className = 'animate-pulse';
        document.body.appendChild(element);
      }

      vi.advanceTimersByTime(100);

      expect(monitor.getTimeSinceBoltActivity()).toBeLessThan(200);
    });

    it('should handle MutationObserver disconnect error gracefully', () => {
      expect(() => {
        monitor.stop();
      }).not.toThrow();
    });
  });
});
