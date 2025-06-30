/**
 * MessageHandlerMocks
 *
 * Test doubles and mock implementations for MessageHandler testing.
 * These mocks accurately reflect real Chrome extension behavior and
 * provide controlled test environments for various scenarios.
 */

import type { MessageType } from '$lib/types';
import type { MockedFunction } from 'vitest';

// =============================================================================
// MOCK CHROME RUNTIME PORT
// =============================================================================

export class MockChromePort implements chrome.runtime.Port {
  public name: string;
  public sender?: chrome.runtime.MessageSender;
  public onDisconnect: chrome.events.Event<(port: chrome.runtime.Port) => void>;
  public onMessage: chrome.events.Event<(message: unknown, port: chrome.runtime.Port) => void>;

  private connected = true;
  private messageHandlers: Array<(message: unknown, port: chrome.runtime.Port) => void> = [];
  private disconnectHandlers: Array<(port: chrome.runtime.Port) => void> = [];
  private postMessageCalls: Array<{ message: unknown; timestamp: number }> = [];
  private disconnectError: chrome.runtime.LastError | null = null;

  constructor(
    name: string = 'bolt-content',
    options: {
      tabId?: number;
      connected?: boolean;
      willDisconnectAfter?: number;
      postMessageShouldThrow?: boolean | string;
    } = {}
  ) {
    this.name = name;
    this.connected = options.connected ?? true;

    // Mock sender if tabId provided
    if (options.tabId) {
      this.sender = {
        tab: {
          id: options.tabId,
          index: 0,
          pinned: false,
          highlighted: false,
          windowId: 1,
          active: true,
          incognito: false,
          selected: false,
          discarded: false,
          autoDiscardable: true,
          groupId: -1,
          url: `https://bolt.new/~/project-${options.tabId}`,
        } as chrome.tabs.Tab,
      };
    }

    // Set up event listeners
    this.onMessage = this.createMockEvent(this.messageHandlers);
    this.onDisconnect = this.createMockEvent(this.disconnectHandlers);

    // Auto-disconnect after specified time
    if (options.willDisconnectAfter) {
      setTimeout(() => this.simulateDisconnect(), options.willDisconnectAfter);
    }

    // Configure postMessage behavior
    if (options.postMessageShouldThrow) {
      const errorMessage =
        typeof options.postMessageShouldThrow === 'string'
          ? options.postMessageShouldThrow
          : 'Port disconnected';
      this.postMessage = vi.fn((_message: unknown): void => {
        throw new Error(errorMessage);
      }) as MockedFunction<(message: unknown) => void>;
    } else if (options.connected === false) {
      // For initially disconnected ports, postMessage should throw
      this.postMessage = vi.fn((_message: unknown): void => {
        throw new Error('Port is disconnected');
      }) as MockedFunction<(message: unknown) => void>;
    } else {
      this.postMessage = vi.fn((message: unknown): void => {
        if (!this.connected) {
          throw new Error('Port is disconnected');
        }
        this.postMessageCalls.push({ message, timestamp: Date.now() });
      }) as MockedFunction<(message: unknown) => void>;
    }
  }

  public postMessage: MockedFunction<(message: unknown) => void>;

  disconnect(): void {
    this.connected = false;
    this.simulateDisconnect();
  }

  // Test helpers
  simulateDisconnect(error?: chrome.runtime.LastError): void {
    this.connected = false;
    this.disconnectError = error || null;
    this.disconnectHandlers.forEach((handler) => handler(this));
  }

  simulateMessage(message: unknown): void {
    if (this.connected) {
      this.messageHandlers.forEach((handler) => handler(message, this));
    }
  }

  getPostMessageCalls(): Array<{ message: unknown; timestamp: number }> {
    return [...this.postMessageCalls];
  }

  getLastPostMessage(): unknown {
    return this.postMessageCalls[this.postMessageCalls.length - 1]?.message;
  }

  getPostMessageCallCount(): number {
    return this.postMessageCalls.length;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getDisconnectError(): chrome.runtime.LastError | null {
    return this.disconnectError;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createMockEvent<T extends (...args: any[]) => void>(
    handlers: T[]
  ): chrome.events.Event<T> {
    return {
      addListener: vi.fn((callback: T) => {
        handlers.push(callback);
      }),
      removeListener: vi.fn((callback: T) => {
        const index = handlers.indexOf(callback);
        if (index > -1) handlers.splice(index, 1);
      }),
      hasListener: vi.fn((callback: T) => handlers.includes(callback)),
      hasListeners: vi.fn(() => handlers.length > 0),
      getRules: vi.fn(() => Promise.resolve([])),
      removeRules: vi.fn(() => Promise.resolve()),
      addRules: vi.fn(() => Promise.resolve()),
    } as unknown as chrome.events.Event<T>;
  }
}

// =============================================================================
// MOCK CHROME RUNTIME
// =============================================================================

export class MockChromeRuntime {
  public id: string | undefined;
  private invalidated = false;
  private shouldThrowOnAccess = false;

  constructor(
    options: {
      id?: string;
      invalidated?: boolean;
      shouldThrowOnAccess?: boolean;
    } = {}
  ) {
    this.id = options.id ?? 'bolt-to-github-extension-id';
    this.invalidated = options.invalidated ?? false;
    this.shouldThrowOnAccess = options.shouldThrowOnAccess ?? false;

    // If invalidated, set id to undefined
    if (this.invalidated) {
      this.id = undefined;
    }
  }

  // Simulate extension context invalidation
  invalidate(): void {
    this.invalidated = true;
    this.id = undefined;
  }

  // Make runtime throw on any property access
  makeThrowOnAccess(): void {
    this.shouldThrowOnAccess = true;
  }

  // Test helper to check if accessing runtime would throw
  wouldThrowOnAccess(): boolean {
    return this.shouldThrowOnAccess || this.invalidated;
  }

  // Factory methods for different states
  static createHealthy(): MockChromeRuntime {
    return new MockChromeRuntime({ id: 'bolt-to-github-extension-id' });
  }

  static createInvalidated(): MockChromeRuntime {
    return new MockChromeRuntime({ invalidated: true });
  }

  static createWithoutId(): MockChromeRuntime {
    return new MockChromeRuntime({ id: undefined });
  }

  static createThrowing(): MockChromeRuntime {
    return new MockChromeRuntime({ shouldThrowOnAccess: true });
  }
}

// =============================================================================
// MOCK WINDOW WITH EVENT DISPATCHING
// =============================================================================

export class MockWindow {
  private eventListeners: Map<string, EventListenerOrEventListenerObject[]> = new Map();
  private dispatchedEvents: Array<{ type: string; detail: unknown; timestamp: number }> = [];

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions
  ): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type)!.push(listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions
  ): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  dispatchEvent(event: Event): boolean {
    const customEvent = event as CustomEvent;
    this.dispatchedEvents.push({
      type: event.type,
      detail: customEvent.detail,
      timestamp: Date.now(),
    });

    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      });
    }

    return true;
  }

  // Test helpers
  getDispatchedEvents(): Array<{ type: string; detail: unknown; timestamp: number }> {
    return [...this.dispatchedEvents];
  }

  getLastDispatchedEvent(): { type: string; detail: unknown; timestamp: number } | undefined {
    return this.dispatchedEvents[this.dispatchedEvents.length - 1];
  }

  getEventListenerCount(type: string): number {
    return this.eventListeners.get(type)?.length ?? 0;
  }

  hasEventListener(type: string): boolean {
    return this.getEventListenerCount(type) > 0;
  }

  clearEventHistory(): void {
    this.dispatchedEvents = [];
  }

  clearAllListeners(): void {
    this.eventListeners.clear();
  }
}

// =============================================================================
// MOCK CONSOLE
// =============================================================================

export class MockConsole {
  public log = vi.fn();
  public warn = vi.fn();
  public error = vi.fn();
  public debug = vi.fn();
  public info = vi.fn();

  // Test helpers
  getLogCalls(): unknown[][] {
    return this.log.mock.calls;
  }

  getWarnCalls(): unknown[][] {
    return this.warn.mock.calls;
  }

  getErrorCalls(): unknown[][] {
    return this.error.mock.calls;
  }

  getDebugCalls(): unknown[][] {
    return this.debug.mock.calls;
  }

  getAllCalls(): Array<{ level: string; args: unknown[] }> {
    return [
      ...this.log.mock.calls.map((args: unknown[]) => ({ level: 'log', args })),
      ...this.warn.mock.calls.map((args: unknown[]) => ({ level: 'warn', args })),
      ...this.error.mock.calls.map((args: unknown[]) => ({ level: 'error', args })),
      ...this.debug.mock.calls.map((args: unknown[]) => ({ level: 'debug', args })),
      ...this.info.mock.calls.map((args: unknown[]) => ({ level: 'info', args })),
    ].sort((_a, _b) => {
      // Sort by call order (simplified, assumes sequential calls)
      return 0;
    });
  }

  findCallsContaining(text: string): Array<{ level: string; args: unknown[] }> {
    return this.getAllCalls().filter((call) =>
      call.args.some((arg) => typeof arg === 'string' && arg.includes(text))
    );
  }

  reset(): void {
    this.log.mockReset();
    this.warn.mockReset();
    this.error.mockReset();
    this.debug.mockReset();
    this.info.mockReset();
  }
}

// =============================================================================
// MESSAGE HANDLER MOCK
// =============================================================================

export class MockMessageHandler {
  private port: MockChromePort | null;
  private messageQueue: Array<{ type: MessageType; data?: unknown }> = [];
  private isConnected = false;
  private connectionCheckResults: boolean[] = [];

  constructor(port?: MockChromePort) {
    this.port = port || null;
    this.isConnected = !!port?.isConnected();
  }

  updatePort(newPort: MockChromePort): void {
    this.port = newPort;
    this.isConnected = newPort.isConnected();
    this.processQueuedMessages();
  }

  sendMessage(type: MessageType, data?: unknown): void {
    const message = { type, data };

    if (!this.isPortConnected()) {
      this.messageQueue.push(message);
      return;
    }

    try {
      this.port!.postMessage(message);
    } catch {
      this.isConnected = false;
      this.messageQueue.push(message);
    }
  }

  sendZipData(data: string, currentProjectId?: string): void {
    this.sendMessage('ZIP_DATA', { data, projectId: currentProjectId });
  }

  sendDebugMessage(message: string): void {
    this.sendMessage('DEBUG', { message });
  }

  sendCommitMessage(message: string): void {
    this.sendMessage('SET_COMMIT_MESSAGE', { message });
  }

  getConnectionStatus(): { connected: boolean; queuedMessages: number } {
    return {
      connected: this.isPortConnected(),
      queuedMessages: this.messageQueue.length,
    };
  }

  clearQueue(): void {
    this.messageQueue = [];
  }

  private isPortConnected(): boolean {
    const result = this.port?.isConnected() ?? false;
    this.connectionCheckResults.push(result);
    return result && this.isConnected;
  }

  private processQueuedMessages(): void {
    const queuedMessages = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queuedMessages) {
      this.sendMessage(message.type, message.data);
    }
  }

  // Test helpers
  getPort(): MockChromePort | null {
    return this.port;
  }

  getQueuedMessages(): Array<{ type: MessageType; data?: unknown }> {
    return [...this.messageQueue];
  }

  getConnectionCheckHistory(): boolean[] {
    return [...this.connectionCheckResults];
  }

  simulatePortError(): void {
    this.isConnected = false;
  }

  reset(): void {
    this.messageQueue = [];
    this.connectionCheckResults = [];
    this.isConnected = this.port?.isConnected() ?? false;
  }
}

// =============================================================================
// CHROME ENVIRONMENT MOCK
// =============================================================================

export class MockChromeEnvironment {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public chrome: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public window: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public console: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private originalChrome: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private originalWindow: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private originalConsole: any;

  constructor(
    options: {
      runtimeOptions?: ConstructorParameters<typeof MockChromeRuntime>[0];
    } = {}
  ) {
    this.chrome = {
      runtime: new MockChromeRuntime(options.runtimeOptions),
    };
    this.window = new MockWindow();
    this.console = new MockConsole();
  }

  setup(): void {
    // Store originals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.originalChrome = (global as any).chrome;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.originalWindow = (global as any).window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.originalConsole = (global as any).console;

    // Install mocks
    if (this.chrome.runtime.wouldThrowOnAccess && this.chrome.runtime.wouldThrowOnAccess()) {
      // Create a proxy that throws on access
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).chrome = new Proxy(
        {},
        {
          get(target, prop) {
            if (prop === 'runtime') {
              return new Proxy(
                {},
                {
                  get() {
                    throw new Error('Extension context invalidated');
                  },
                }
              );
            }
            return target[prop as keyof typeof target];
          },
        }
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).chrome = this.chrome;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).window = this.window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).console = this.console;
  }

  teardown(): void {
    // Restore originals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).chrome = this.originalChrome;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).window = this.originalWindow;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).console = this.originalConsole;
  }

  // Convenience methods for common scenarios
  simulateExtensionContextInvalidation(): void {
    this.chrome.runtime.invalidate();
  }

  simulateRuntimeAccessErrors(): void {
    this.chrome.runtime.makeThrowOnAccess();
  }

  createConnectedPort(name: string = 'bolt-content', tabId?: number): MockChromePort {
    return new MockChromePort(name, { tabId, connected: true });
  }

  createDisconnectedPort(name: string = 'bolt-content'): MockChromePort {
    return new MockChromePort(name, { connected: false });
  }

  createPortThatWillDisconnect(
    delayMs: number,
    name: string = 'bolt-content',
    tabId?: number
  ): MockChromePort {
    return new MockChromePort(name, { tabId, willDisconnectAfter: delayMs });
  }

  createPortWithPostMessageError(
    errorMessage: string = 'Port disconnected',
    name: string = 'bolt-content'
  ): MockChromePort {
    return new MockChromePort(name, { postMessageShouldThrow: errorMessage });
  }

  // Factory methods for different scenarios
  static createHealthyEnvironment(): MockChromeEnvironment {
    return new MockChromeEnvironment({
      runtimeOptions: { id: 'bolt-to-github-extension-id' },
    });
  }

  static createInvalidatedEnvironment(): MockChromeEnvironment {
    return new MockChromeEnvironment({
      runtimeOptions: { invalidated: true },
    });
  }

  static createThrowingEnvironment(): MockChromeEnvironment {
    return new MockChromeEnvironment({
      runtimeOptions: { shouldThrowOnAccess: true },
    });
  }
}

// =============================================================================
// BEHAVIOR VERIFICATION HELPERS
// =============================================================================

export class BehaviorVerifier {
  static verifyPortMessageSent(
    port: MockChromePort,
    expectedType: MessageType,
    expectedData?: unknown
  ): void {
    const lastMessage = port.getLastPostMessage() as { type: MessageType; data?: unknown };
    expect(lastMessage).toBeDefined();
    expect(lastMessage.type).toBe(expectedType);

    if (expectedData !== undefined) {
      expect(lastMessage.data).toEqual(expectedData);
    }
  }

  static verifyMessageQueued(messageHandler: MockMessageHandler, expectedLength: number): void {
    const queuedMessages = messageHandler.getQueuedMessages();
    expect(queuedMessages).toHaveLength(expectedLength);
  }

  static verifyCustomEventDispatched(
    window: MockWindow,
    expectedType: string,
    expectedDetail?: unknown
  ): void {
    const lastEvent = window.getLastDispatchedEvent();
    expect(lastEvent).toBeDefined();
    expect(lastEvent!.type).toBe(expectedType);

    if (expectedDetail !== undefined) {
      expect(lastEvent!.detail).toEqual(expectedDetail);
    }
  }

  static verifyConsoleOutput(
    console: MockConsole,
    level: 'log' | 'warn' | 'error' | 'debug',
    expectedMessage: string
  ): void {
    const calls = console[level].mock.calls;
    const found = calls.some((call: unknown[]) =>
      call.some((arg) => typeof arg === 'string' && arg.includes(expectedMessage))
    );
    expect(found).toBe(true);
  }

  static verifyNoMemoryLeaks(
    initialCounts: { listeners: number; timers: number },
    finalCounts: { listeners: number; timers: number }
  ): void {
    expect(finalCounts.listeners).toBeLessThanOrEqual(initialCounts.listeners + 1);
    expect(finalCounts.timers).toBeLessThanOrEqual(initialCounts.timers + 1);
  }
}
