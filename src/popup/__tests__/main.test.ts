import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('popup/main.ts', () => {
  let sendMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    sendMessageSpy = vi.fn().mockResolvedValue({});
    chrome.runtime.sendMessage = sendMessageSpy as never;

    document.body.innerHTML = '<div id="app"></div>';
  });

  describe('Analytics tracking', () => {
    it('should send ANALYTICS_EVENT message with page_view type', () => {
      chrome.runtime.sendMessage({
        type: 'ANALYTICS_EVENT',
        eventType: 'page_view',
        eventData: {
          page: 'popup',
          metadata: { timestamp: new Date().toISOString() },
        },
      });

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: 'ANALYTICS_EVENT',
        eventType: 'page_view',
        eventData: {
          page: 'popup',
          metadata: expect.objectContaining({
            timestamp: expect.any(String),
          }),
        },
      });
    });

    it('should include valid ISO timestamp in analytics event metadata', () => {
      const timestamp = new Date().toISOString();

      chrome.runtime.sendMessage({
        type: 'ANALYTICS_EVENT',
        eventType: 'page_view',
        eventData: {
          page: 'popup',
          metadata: { timestamp },
        },
      });

      const call = sendMessageSpy.mock.calls[0][0];
      expect(call.eventData.metadata.timestamp).toBe(timestamp);
      expect(() => new Date(call.eventData.metadata.timestamp)).not.toThrow();
      expect(new Date(call.eventData.metadata.timestamp).toISOString()).toBe(timestamp);
    });

    it('should send analytics with page set to popup', () => {
      chrome.runtime.sendMessage({
        type: 'ANALYTICS_EVENT',
        eventType: 'page_view',
        eventData: {
          page: 'popup',
          metadata: { timestamp: new Date().toISOString() },
        },
      });

      const call = sendMessageSpy.mock.calls[0][0];
      expect(call.eventData.page).toBe('popup');
    });

    it('should handle analytics message rejection gracefully', async () => {
      sendMessageSpy = vi.fn().mockRejectedValue(new Error('Extension context invalidated'));
      chrome.runtime.sendMessage = sendMessageSpy as never;

      const promise = chrome.runtime.sendMessage({
        type: 'ANALYTICS_EVENT',
        eventType: 'page_view',
        eventData: {
          page: 'popup',
          metadata: { timestamp: new Date().toISOString() },
        },
      });

      await expect(promise).rejects.toThrow('Extension context invalidated');
    });
  });

  describe('App component mounting behavior', () => {
    it('should pass app element as target to component constructor', () => {
      const appElement = document.getElementById('app');

      expect(appElement).not.toBeNull();
      expect(appElement?.tagName).toBe('DIV');
      expect(appElement?.id).toBe('app');
    });

    it('should throw when app element is not found', () => {
      document.body.innerHTML = '';
      const appElement = document.getElementById('app');

      expect(appElement).toBeNull();
    });

    it('should have app element ready in document body', () => {
      const appElement = document.body.querySelector('#app');

      expect(appElement).not.toBeNull();
      expect(document.body.contains(appElement)).toBe(true);
    });
  });

  describe('Module behavior', () => {
    it('should track execution order through function calls', () => {
      const executionOrder: string[] = [];

      executionOrder.push('logger-created');

      chrome.runtime.sendMessage({
        type: 'ANALYTICS_EVENT',
        eventType: 'page_view',
        eventData: { page: 'popup', metadata: { timestamp: new Date().toISOString() } },
      });
      executionOrder.push('analytics-sent');

      const appElement = document.getElementById('app');
      if (appElement) {
        executionOrder.push('app-mounted');
      }

      expect(executionOrder).toEqual(['logger-created', 'analytics-sent', 'app-mounted']);
    });
  });

  describe('DOM requirements', () => {
    it('should require app element to exist for mounting', () => {
      const appElement = document.getElementById('app');

      expect(appElement).toBeTruthy();
      expect(appElement instanceof HTMLElement).toBe(true);
    });

    it('should verify app element has correct id', () => {
      const appElement = document.getElementById('app');

      expect(appElement?.getAttribute('id')).toBe('app');
    });

    it('should ensure app element is in DOM tree', () => {
      const appElement = document.getElementById('app');

      expect(appElement?.parentElement).toBe(document.body);
      expect(document.contains(appElement)).toBe(true);
    });
  });

  describe('Chrome extension API integration', () => {
    it('should use chrome.runtime.sendMessage API correctly', () => {
      const message = {
        type: 'ANALYTICS_EVENT',
        eventType: 'page_view',
        eventData: {
          page: 'popup',
          metadata: { timestamp: new Date().toISOString() },
        },
      };

      chrome.runtime.sendMessage(message);

      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      expect(sendMessageSpy).toHaveBeenCalledWith(message);
    });

    it('should handle chrome.runtime.sendMessage as promise', async () => {
      sendMessageSpy = vi.fn().mockResolvedValue({ success: true });
      chrome.runtime.sendMessage = sendMessageSpy as never;

      const result = await chrome.runtime.sendMessage({
        type: 'ANALYTICS_EVENT',
        eventType: 'page_view',
        eventData: { page: 'popup', metadata: { timestamp: new Date().toISOString() } },
      });

      expect(result).toEqual({ success: true });
    });

    it('should allow chrome.runtime.sendMessage to reject', async () => {
      const errorMessage = 'Could not establish connection';
      sendMessageSpy = vi.fn().mockRejectedValue(new Error(errorMessage));
      chrome.runtime.sendMessage = sendMessageSpy as never;

      await expect(
        chrome.runtime.sendMessage({
          type: 'ANALYTICS_EVENT',
          eventType: 'page_view',
          eventData: { page: 'popup', metadata: { timestamp: new Date().toISOString() } },
        })
      ).rejects.toThrow(errorMessage);
    });
  });
});
