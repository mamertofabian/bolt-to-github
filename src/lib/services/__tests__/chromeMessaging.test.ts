import type { Message, MessageType } from '$lib/types';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ChromeMessagingService } from '../chromeMessaging';

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

interface MockPort {
  postMessage: Mock;
  disconnect: Mock;
  onMessage: {
    addListener: Mock;
  };
  onDisconnect: {
    addListener: Mock;
  };
  name: string;
}

interface MockChromeRuntime {
  connect: Mock;
  sendMessage: Mock;
  onMessage: {
    addListener: Mock;
    removeListener: Mock;
  };
  lastError?: { message: string };
}

interface MockChromeTabs {
  query: Mock;
  sendMessage: Mock;
}

describe('ChromeMessagingService', () => {
  let mockPort: MockPort;
  let mockRuntime: MockChromeRuntime;
  let mockTabs: MockChromeTabs;

  beforeEach(() => {
    ChromeMessagingService.cleanup();

    mockPort = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn(),
      },
      name: 'popup',
    };

    mockRuntime = {
      connect: vi.fn(() => mockPort),
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      lastError: undefined,
    };

    mockTabs = {
      query: vi.fn(),
      sendMessage: vi.fn(),
    };

    global.chrome = {
      runtime: mockRuntime,
      tabs: mockTabs,
    } as unknown as typeof chrome;
  });

  describe('initializePort', () => {
    it('should create a port connection with default name', () => {
      const port = ChromeMessagingService.initializePort();

      expect(mockRuntime.connect).toHaveBeenCalledWith({ name: 'popup' });
      expect(port).toBe(mockPort);
      expect(mockPort.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(mockPort.onDisconnect.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should create a port connection with custom name', () => {
      const port = ChromeMessagingService.initializePort('custom-port');

      expect(mockRuntime.connect).toHaveBeenCalledWith({ name: 'custom-port' });
      expect(port).toBe(mockPort);
    });

    it('should set up port message listener', () => {
      ChromeMessagingService.initializePort();

      expect(mockPort.onMessage.addListener).toHaveBeenCalled();
      const messageListener = mockPort.onMessage.addListener.mock.calls[0][0];
      expect(typeof messageListener).toBe('function');
    });

    it('should set up port disconnect listener', () => {
      ChromeMessagingService.initializePort();

      expect(mockPort.onDisconnect.addListener).toHaveBeenCalled();
      const disconnectListener = mockPort.onDisconnect.addListener.mock.calls[0][0];
      expect(typeof disconnectListener).toBe('function');
    });

    it('should handle disconnect event and set port to null', () => {
      ChromeMessagingService.initializePort();

      const disconnectListener = mockPort.onDisconnect.addListener.mock.calls[0][0];
      disconnectListener();

      expect(ChromeMessagingService.isPortConnected()).toBe(false);
      expect(ChromeMessagingService.getPort()).toBeNull();
    });

    it('should throw error when connection fails', () => {
      const error = new Error('Connection failed');
      mockRuntime.connect.mockImplementation(() => {
        throw error;
      });

      expect(() => ChromeMessagingService.initializePort()).toThrow('Connection failed');
    });

    it('should return the same port instance', () => {
      const port1 = ChromeMessagingService.initializePort();
      const port2 = ChromeMessagingService.getPort();

      expect(port1).toBe(port2);
    });
  });

  describe('sendPortMessage', () => {
    it('should send message through existing port', () => {
      ChromeMessagingService.initializePort();
      const message = { type: 'TEST_MESSAGE', data: { test: 'value' } };

      ChromeMessagingService.sendPortMessage(message);

      expect(mockPort.postMessage).toHaveBeenCalledWith(message);
    });

    it('should initialize port if not connected', () => {
      const message = { type: 'TEST_MESSAGE', data: { test: 'value' } };

      ChromeMessagingService.sendPortMessage(message);

      expect(mockRuntime.connect).toHaveBeenCalledWith({ name: 'popup' });
      expect(mockPort.postMessage).toHaveBeenCalledWith(message);
    });

    it('should reinitialize port on postMessage error', () => {
      ChromeMessagingService.initializePort();

      mockPort.postMessage.mockImplementationOnce(() => {
        throw new Error('Port disconnected');
      });

      const message = { type: 'TEST_MESSAGE' };

      ChromeMessagingService.sendPortMessage(message);

      expect(mockRuntime.connect).toHaveBeenCalledTimes(2);
      expect(mockPort.postMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle different message types', () => {
      ChromeMessagingService.initializePort();

      const message1 = { type: 'OPEN_ISSUES' };
      const message2 = { type: 'DELETE_TEMP_REPO', data: { owner: 'test', repo: 'repo' } };

      ChromeMessagingService.sendPortMessage(message1);
      ChromeMessagingService.sendPortMessage(message2);

      expect(mockPort.postMessage).toHaveBeenCalledWith(message1);
      expect(mockPort.postMessage).toHaveBeenCalledWith(message2);
    });
  });

  describe('port message handlers', () => {
    it('should add port message handler', () => {
      const handler = vi.fn();

      ChromeMessagingService.addPortMessageHandler(handler);

      ChromeMessagingService.initializePort();
      const messageListener = mockPort.onMessage.addListener.mock.calls[0][0];

      const message = { type: 'TEST' };
      messageListener(message);

      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should support multiple port message handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      ChromeMessagingService.addPortMessageHandler(handler1);
      ChromeMessagingService.addPortMessageHandler(handler2);

      ChromeMessagingService.initializePort();
      const messageListener = mockPort.onMessage.addListener.mock.calls[0][0];

      const message = { type: 'TEST' };
      messageListener(message);

      expect(handler1).toHaveBeenCalledWith(message);
      expect(handler2).toHaveBeenCalledWith(message);
    });

    it('should remove port message handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      ChromeMessagingService.addPortMessageHandler(handler1);
      ChromeMessagingService.addPortMessageHandler(handler2);
      ChromeMessagingService.removePortMessageHandler(handler1);

      ChromeMessagingService.initializePort();
      const messageListener = mockPort.onMessage.addListener.mock.calls[0][0];

      const message = { type: 'TEST' };
      messageListener(message);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(message);
    });

    it('should handle removal of non-existent handler gracefully', () => {
      const handler = vi.fn();

      expect(() => {
        ChromeMessagingService.removePortMessageHandler(handler);
      }).not.toThrow();
    });

    it('should catch errors in port message handlers', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      ChromeMessagingService.addPortMessageHandler(errorHandler);
      ChromeMessagingService.addPortMessageHandler(normalHandler);

      ChromeMessagingService.initializePort();
      const messageListener = mockPort.onMessage.addListener.mock.calls[0][0];

      const message = { type: 'TEST' };

      expect(() => messageListener(message)).not.toThrow();
      expect(errorHandler).toHaveBeenCalledWith(message);
      expect(normalHandler).toHaveBeenCalledWith(message);
    });
  });

  describe('disconnectPort', () => {
    it('should disconnect active port', () => {
      ChromeMessagingService.initializePort();

      ChromeMessagingService.disconnectPort();

      expect(mockPort.disconnect).toHaveBeenCalled();
      expect(ChromeMessagingService.getPort()).toBeNull();
    });

    it('should handle disconnect when no port exists', () => {
      expect(() => {
        ChromeMessagingService.disconnectPort();
      }).not.toThrow();
    });

    it('should handle disconnect errors gracefully', () => {
      ChromeMessagingService.initializePort();
      mockPort.disconnect.mockImplementation(() => {
        throw new Error('Disconnect error');
      });

      expect(() => {
        ChromeMessagingService.disconnectPort();
      }).not.toThrow();
      expect(ChromeMessagingService.getPort()).toBeNull();
    });
  });

  describe('sendMessageToActiveTab', () => {
    it('should send message to active tab', async () => {
      const activeTab = { id: 123, active: true, currentWindow: true };
      mockTabs.query.mockResolvedValue([activeTab]);
      mockTabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        callback({ success: true });
      });

      const message = { action: 'TEST_ACTION' };
      const response = await ChromeMessagingService.sendMessageToActiveTab(message);

      expect(mockTabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(123, message, expect.any(Function));
      expect(response).toEqual({ success: true });
    });

    it('should throw error when no active tab found', async () => {
      mockTabs.query.mockResolvedValue([]);

      const message = { action: 'TEST_ACTION' };

      await expect(ChromeMessagingService.sendMessageToActiveTab(message)).rejects.toThrow(
        'No active tab found'
      );
    });

    it('should throw error when active tab has no id', async () => {
      mockTabs.query.mockResolvedValue([{ active: true, currentWindow: true }]);

      const message = { action: 'TEST_ACTION' };

      await expect(ChromeMessagingService.sendMessageToActiveTab(message)).rejects.toThrow(
        'No active tab found'
      );
    });

    it('should handle chrome.runtime.lastError', async () => {
      const activeTab = { id: 123 };
      mockTabs.query.mockResolvedValue([activeTab]);
      mockTabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        mockRuntime.lastError = { message: 'Tab not found' };
        callback(undefined);
      });

      const message = { action: 'TEST_ACTION' };

      await expect(ChromeMessagingService.sendMessageToActiveTab(message)).rejects.toThrow(
        'Tab not found'
      );

      mockRuntime.lastError = undefined;
    });

    it('should handle tab query errors', async () => {
      mockTabs.query.mockRejectedValue(new Error('Query failed'));

      const message = { action: 'TEST_ACTION' };

      await expect(ChromeMessagingService.sendMessageToActiveTab(message)).rejects.toThrow(
        'Query failed'
      );
    });
  });

  describe('sendMessageToTab', () => {
    it('should send message to specific tab', async () => {
      mockTabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        callback({ success: true });
      });

      const message = { action: 'TEST_ACTION' };
      const response = await ChromeMessagingService.sendMessageToTab(123, message);

      expect(mockTabs.sendMessage).toHaveBeenCalledWith(123, message, expect.any(Function));
      expect(response).toEqual({ success: true });
    });

    it('should handle chrome.runtime.lastError', async () => {
      mockTabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        mockRuntime.lastError = { message: 'Tab not found' };
        callback(undefined);
      });

      const message = { action: 'TEST_ACTION' };

      await expect(ChromeMessagingService.sendMessageToTab(123, message)).rejects.toThrow(
        'Tab not found'
      );

      mockRuntime.lastError = undefined;
    });

    it('should handle sendMessage errors', async () => {
      mockTabs.sendMessage.mockImplementation(() => {
        throw new Error('Send failed');
      });

      const message = { action: 'TEST_ACTION' };

      await expect(ChromeMessagingService.sendMessageToTab(123, message)).rejects.toThrow(
        'Send failed'
      );
    });

    it('should send different message types', async () => {
      mockTabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        callback({ received: true });
      });

      await ChromeMessagingService.sendMessageToTab(123, { action: 'ACTION_1' });
      await ChromeMessagingService.sendMessageToTab(456, { action: 'ACTION_2', data: 'test' });

      expect(mockTabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(
        123,
        { action: 'ACTION_1' },
        expect.any(Function)
      );
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(
        456,
        { action: 'ACTION_2', data: 'test' },
        expect.any(Function)
      );
    });
  });

  describe('sendMessageToBackground', () => {
    it('should send message to background script', async () => {
      mockRuntime.sendMessage.mockImplementation((_message, callback) => {
        callback({ success: true });
      });

      const message: Message = { type: 'DEBUG', data: { test: 'value' } };
      const response = await ChromeMessagingService.sendMessageToBackground(message);

      expect(mockRuntime.sendMessage).toHaveBeenCalledWith(message, expect.any(Function));
      expect(response).toEqual({ success: true });
    });

    it('should handle chrome.runtime.lastError', async () => {
      mockRuntime.sendMessage.mockImplementation((_message, callback) => {
        mockRuntime.lastError = { message: 'Background script error' };
        callback(undefined);
      });

      const message: Message = { type: 'DEBUG' };

      await expect(ChromeMessagingService.sendMessageToBackground(message)).rejects.toThrow(
        'Background script error'
      );

      mockRuntime.lastError = undefined;
    });

    it('should handle sendMessage errors', async () => {
      mockRuntime.sendMessage.mockImplementation(() => {
        throw new Error('Send failed');
      });

      const message: Message = { type: 'DEBUG' };

      await expect(ChromeMessagingService.sendMessageToBackground(message)).rejects.toThrow(
        'Send failed'
      );
    });

    it('should send different message types to background', async () => {
      mockRuntime.sendMessage.mockImplementation((_message, callback) => {
        callback({ received: true });
      });

      const message1: Message = { type: 'HEARTBEAT' };
      const message2: Message = { type: 'DEBUG', data: { info: 'test' } };

      await ChromeMessagingService.sendMessageToBackground(message1);
      await ChromeMessagingService.sendMessageToBackground(message2);

      expect(mockRuntime.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockRuntime.sendMessage).toHaveBeenCalledWith(message1, expect.any(Function));
      expect(mockRuntime.sendMessage).toHaveBeenCalledWith(message2, expect.any(Function));
    });
  });

  describe('message handlers', () => {
    it('should add message handler for specific type', () => {
      const handler = vi.fn();
      const messageType: MessageType = 'DEBUG';

      ChromeMessagingService.addMessageHandler(messageType, handler);

      ChromeMessagingService.initializeMessageListener();

      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG', data: { test: 'value' } };

      listener(message, {}, vi.fn());

      expect(handler).toHaveBeenCalledWith(message, {});
    });

    it('should support multiple handlers for the same message type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const messageType: MessageType = 'DEBUG';

      ChromeMessagingService.addMessageHandler(messageType, handler1);
      ChromeMessagingService.addMessageHandler(messageType, handler2);

      ChromeMessagingService.initializeMessageListener();

      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG' };

      listener(message, {}, vi.fn());

      expect(handler1).toHaveBeenCalledWith(message, {});
      expect(handler2).toHaveBeenCalledWith(message, {});
    });

    it('should not call handlers for different message types', () => {
      const debugHandler = vi.fn();
      const heartbeatHandler = vi.fn();

      ChromeMessagingService.addMessageHandler('DEBUG', debugHandler);
      ChromeMessagingService.addMessageHandler('HEARTBEAT', heartbeatHandler);

      ChromeMessagingService.initializeMessageListener();

      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG' };

      listener(message, {}, vi.fn());

      expect(debugHandler).toHaveBeenCalledWith(message, {});
      expect(heartbeatHandler).not.toHaveBeenCalled();
    });

    it('should remove specific message handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const messageType: MessageType = 'DEBUG';

      ChromeMessagingService.addMessageHandler(messageType, handler1);
      ChromeMessagingService.addMessageHandler(messageType, handler2);
      ChromeMessagingService.removeMessageHandler(messageType, handler1);

      ChromeMessagingService.initializeMessageListener();

      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG' };

      listener(message, {}, vi.fn());

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(message, {});
    });

    it('should handle removal of non-existent handler gracefully', () => {
      const handler = vi.fn();

      expect(() => {
        ChromeMessagingService.removeMessageHandler('DEBUG', handler);
      }).not.toThrow();
    });

    it('should handle removal from non-existent message type', () => {
      const handler = vi.fn();

      ChromeMessagingService.addMessageHandler('DEBUG', handler);

      expect(() => {
        ChromeMessagingService.removeMessageHandler('HEARTBEAT', handler);
      }).not.toThrow();
    });

    it('should catch errors in message handlers', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      ChromeMessagingService.addMessageHandler('DEBUG', errorHandler);
      ChromeMessagingService.addMessageHandler('DEBUG', normalHandler);

      ChromeMessagingService.initializeMessageListener();

      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG' };

      expect(() => listener(message, {}, vi.fn())).not.toThrow();
      expect(errorHandler).toHaveBeenCalledWith(message, {});
      expect(normalHandler).toHaveBeenCalledWith(message, {});
    });

    it('should return false from message listener to not keep channel open', () => {
      ChromeMessagingService.initializeMessageListener();

      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG' };

      const result = listener(message, {}, vi.fn());

      expect(result).toBe(false);
    });
  });

  describe('initializeMessageListener', () => {
    it('should add runtime onMessage listener', () => {
      ChromeMessagingService.initializeMessageListener();

      expect(mockRuntime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle messages when listener is initialized', () => {
      const handler = vi.fn();
      ChromeMessagingService.addMessageHandler('DEBUG', handler);

      ChromeMessagingService.initializeMessageListener();

      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG' };

      listener(message, {}, vi.fn());

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getPort and isPortConnected', () => {
    it('should return null when port is not connected', () => {
      expect(ChromeMessagingService.getPort()).toBeNull();
      expect(ChromeMessagingService.isPortConnected()).toBe(false);
    });

    it('should return port when connected', () => {
      const port = ChromeMessagingService.initializePort();

      expect(ChromeMessagingService.getPort()).toBe(port);
      expect(ChromeMessagingService.isPortConnected()).toBe(true);
    });

    it('should return null after disconnect', () => {
      ChromeMessagingService.initializePort();
      ChromeMessagingService.disconnectPort();

      expect(ChromeMessagingService.getPort()).toBeNull();
      expect(ChromeMessagingService.isPortConnected()).toBe(false);
    });
  });

  describe('requestFileChanges', () => {
    it('should request file changes from active tab and return success response', async () => {
      const activeTab = { id: 123 };
      mockTabs.query.mockResolvedValue([activeTab]);
      mockTabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        callback({ success: true, projectId: 'project-123' });
      });

      const result = await ChromeMessagingService.requestFileChanges();

      expect(mockTabs.sendMessage).toHaveBeenCalledWith(
        123,
        { action: 'REQUEST_FILE_CHANGES' },
        expect.any(Function)
      );
      expect(result).toEqual({
        success: true,
        projectId: 'project-123',
      });
    });

    it('should throw error when file changes request fails', async () => {
      const activeTab = { id: 123 };
      mockTabs.query.mockResolvedValue([activeTab]);
      mockTabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        callback({ success: false, error: 'No files found' });
      });

      await expect(ChromeMessagingService.requestFileChanges()).rejects.toThrow(
        'Failed to request file changes'
      );
    });

    it('should throw error when response is null', async () => {
      const activeTab = { id: 123 };
      mockTabs.query.mockResolvedValue([activeTab]);
      mockTabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        callback(null);
      });

      await expect(ChromeMessagingService.requestFileChanges()).rejects.toThrow(
        'Failed to request file changes'
      );
    });

    it('should handle tab communication errors', async () => {
      mockTabs.query.mockRejectedValue(new Error('Tab not found'));

      await expect(ChromeMessagingService.requestFileChanges()).rejects.toThrow('Tab not found');
    });
  });

  describe('sendDeleteTempRepoMessage', () => {
    it('should send delete temp repo message via port', () => {
      ChromeMessagingService.initializePort();

      ChromeMessagingService.sendDeleteTempRepoMessage('test-owner', 'test-repo');

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'DELETE_TEMP_REPO',
        data: { owner: 'test-owner', repo: 'test-repo' },
      });
    });

    it('should initialize port if not connected before sending', () => {
      ChromeMessagingService.sendDeleteTempRepoMessage('test-owner', 'test-repo');

      expect(mockRuntime.connect).toHaveBeenCalled();
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'DELETE_TEMP_REPO',
        data: { owner: 'test-owner', repo: 'test-repo' },
      });
    });
  });

  describe('sendOpenIssuesMessage', () => {
    it('should send open issues message via port', () => {
      ChromeMessagingService.initializePort();

      ChromeMessagingService.sendOpenIssuesMessage();

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'OPEN_ISSUES',
      });
    });

    it('should initialize port if not connected', () => {
      ChromeMessagingService.sendOpenIssuesMessage();

      expect(mockRuntime.connect).toHaveBeenCalled();
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'OPEN_ISSUES',
      });
    });
  });

  describe('sendOpenProjectsMessage', () => {
    it('should send open projects message via port', () => {
      ChromeMessagingService.initializePort();

      ChromeMessagingService.sendOpenProjectsMessage();

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'OPEN_PROJECTS',
      });
    });

    it('should initialize port if not connected', () => {
      ChromeMessagingService.sendOpenProjectsMessage();

      expect(mockRuntime.connect).toHaveBeenCalled();
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'OPEN_PROJECTS',
      });
    });
  });

  describe('cleanup', () => {
    it('should clear all message handlers', () => {
      const handler = vi.fn();
      ChromeMessagingService.addMessageHandler('DEBUG', handler);

      ChromeMessagingService.cleanup();
      ChromeMessagingService.initializeMessageListener();

      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG' };

      listener(message, {}, vi.fn());

      expect(handler).not.toHaveBeenCalled();
    });

    it('should clear all port handlers', () => {
      const handler = vi.fn();
      ChromeMessagingService.addPortMessageHandler(handler);

      ChromeMessagingService.cleanup();
      ChromeMessagingService.initializePort();

      const messageListener = mockPort.onMessage.addListener.mock.calls[0][0];
      messageListener({ type: 'TEST' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should disconnect port if connected', () => {
      ChromeMessagingService.initializePort();

      ChromeMessagingService.cleanup();

      expect(mockPort.disconnect).toHaveBeenCalled();
      expect(ChromeMessagingService.getPort()).toBeNull();
    });

    it('should handle cleanup when nothing is initialized', () => {
      expect(() => {
        ChromeMessagingService.cleanup();
      }).not.toThrow();
    });

    it('should fully reset service state', () => {
      const messageHandler = vi.fn();
      const portHandler = vi.fn();

      ChromeMessagingService.addMessageHandler('DEBUG', messageHandler);
      ChromeMessagingService.addPortMessageHandler(portHandler);
      ChromeMessagingService.initializePort();

      expect(ChromeMessagingService.isPortConnected()).toBe(true);

      ChromeMessagingService.cleanup();

      expect(ChromeMessagingService.isPortConnected()).toBe(false);
      expect(ChromeMessagingService.getPort()).toBeNull();

      ChromeMessagingService.initializeMessageListener();
      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      listener({ type: 'DEBUG' }, {}, vi.fn());
      expect(messageHandler).not.toHaveBeenCalled();

      ChromeMessagingService.initializePort();
      const portListener = mockPort.onMessage.addListener.mock.calls[0][0];
      portListener({ type: 'TEST' });
      expect(portHandler).not.toHaveBeenCalled();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle multiple port initializations correctly', () => {
      ChromeMessagingService.initializePort();
      const port2 = ChromeMessagingService.initializePort();

      expect(mockRuntime.connect).toHaveBeenCalledTimes(2);
      expect(port2).toBe(mockPort);
      expect(ChromeMessagingService.getPort()).toBe(port2);
    });

    it('should handle port message after cleanup', () => {
      ChromeMessagingService.initializePort();
      ChromeMessagingService.cleanup();

      const message = { type: 'TEST' };

      ChromeMessagingService.sendPortMessage(message);

      expect(mockRuntime.connect).toHaveBeenCalled();
      expect(mockPort.postMessage).toHaveBeenCalledWith(message);
    });

    it('should handle adding the same handler multiple times', () => {
      const handler = vi.fn();

      ChromeMessagingService.addMessageHandler('DEBUG', handler);
      ChromeMessagingService.addMessageHandler('DEBUG', handler);

      ChromeMessagingService.initializeMessageListener();
      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG' };

      listener(message, {}, vi.fn());

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent message sending', async () => {
      mockRuntime.sendMessage.mockImplementation((_message, callback) => {
        setTimeout(() => callback({ success: true }), 10);
      });

      const message1: Message = { type: 'DEBUG', data: { id: 1 } };
      const message2: Message = { type: 'HEARTBEAT' };
      const message3: Message = { type: 'DEBUG', data: { id: 2 } };

      const promises = [
        ChromeMessagingService.sendMessageToBackground(message1),
        ChromeMessagingService.sendMessageToBackground(message2),
        ChromeMessagingService.sendMessageToBackground(message3),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results.every((r) => (r as { success: boolean }).success)).toBe(true);
      expect(mockRuntime.sendMessage).toHaveBeenCalledTimes(3);
    });

    it('should preserve handler order during message processing', () => {
      const calls: number[] = [];
      const handler1 = vi.fn(() => calls.push(1));
      const handler2 = vi.fn(() => calls.push(2));
      const handler3 = vi.fn(() => calls.push(3));

      ChromeMessagingService.addMessageHandler('DEBUG', handler1);
      ChromeMessagingService.addMessageHandler('DEBUG', handler2);
      ChromeMessagingService.addMessageHandler('DEBUG', handler3);

      ChromeMessagingService.initializeMessageListener();
      const listener = mockRuntime.onMessage.addListener.mock.calls[0][0];
      const message: Message = { type: 'DEBUG' };

      listener(message, {}, vi.fn());

      expect(calls).toEqual([1, 2, 3]);
    });
  });
});
