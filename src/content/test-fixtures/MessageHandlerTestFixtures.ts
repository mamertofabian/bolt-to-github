/**
 * MessageHandlerTestFixtures
 *
 * Comprehensive test fixtures for MessageHandler.ts covering:
 * - Port connection states and behaviors
 * - Message queuing scenarios
 * - Connection validation edge cases
 * - Chrome runtime error conditions
 * - Memory leak scenarios
 * - Performance under stress
 */

import type { MessageType, Message } from '$lib/types';

// =============================================================================
// REALISTIC TEST DATA
// =============================================================================

export const TestData = {
  // Message types and their typical payloads
  messages: {
    zipData: {
      type: 'ZIP_DATA' as MessageType,
      data: {
        data: 'UEsDBAoAAAAAAK1OF1YAAAAAAAAAAAAAAAAADQAAAHNyYy9pbmRleC5qcw==', // Valid base64 ZIP
        projectId: 'bolt-project-abc123def456',
      },
    },
    zipDataLarge: {
      type: 'ZIP_DATA' as MessageType,
      data: {
        data: Buffer.from('a'.repeat(1024 * 1024)).toString('base64'), // 1MB ZIP
        projectId: 'bolt-project-large-abc123',
      },
    },
    zipDataNoProjectId: {
      type: 'ZIP_DATA' as MessageType,
      data: {
        data: 'UEsDBAoAAAAAAK1OF1YAAAAAAAAAAAAAAAAADQAAAHNyYy9pbmRleC5qcw==',
        // Missing projectId to test backwards compatibility
      },
    },
    uploadStatusProgress: {
      type: 'UPLOAD_STATUS' as MessageType,
      data: {
        status: 'uploading',
        progress: 45,
        message: 'Uploading files to GitHub...',
      },
    },
    uploadStatusSuccess: {
      type: 'UPLOAD_STATUS' as MessageType,
      data: {
        status: 'success',
        progress: 100,
        message: 'Successfully uploaded to GitHub!',
      },
    },
    uploadStatusError: {
      type: 'UPLOAD_STATUS' as MessageType,
      data: {
        status: 'error',
        message: 'Network error: Failed to connect to GitHub API',
      },
    },
    setCommitMessage: {
      type: 'SET_COMMIT_MESSAGE' as MessageType,
      data: {
        message: 'feat: add new authentication system with GitHub App support',
      },
    },
    setCommitMessageEmpty: {
      type: 'SET_COMMIT_MESSAGE' as MessageType,
      data: {
        message: '',
      },
    },
    setCommitMessageLong: {
      type: 'SET_COMMIT_MESSAGE' as MessageType,
      data: {
        message: 'a'.repeat(500), // Very long commit message
      },
    },
    setCommitMessageSpecialChars: {
      type: 'SET_COMMIT_MESSAGE' as MessageType,
      data: {
        message: 'fix: resolve issue with "quotes" and \'apostrophes\' & symbols <>&',
      },
    },
    debugMessage: {
      type: 'DEBUG' as MessageType,
      data: {
        message: 'Debug: Content script initialization complete',
      },
    },
    debugMessageError: {
      type: 'DEBUG' as MessageType,
      data: {
        message: 'Error: Failed to initialize GitHub button - DOM not ready',
      },
    },
    contentScriptReady: {
      type: 'CONTENT_SCRIPT_READY' as MessageType,
    },
    githubSettingsChanged: {
      type: 'GITHUB_SETTINGS_CHANGED' as MessageType,
      data: {
        isValid: true,
        authMethod: 'pat',
      },
    },
    githubSettingsInvalid: {
      type: 'GITHUB_SETTINGS_CHANGED' as MessageType,
      data: {
        isValid: false,
        error: 'Invalid GitHub token',
      },
    },
    openHome: {
      type: 'OPEN_HOME' as MessageType,
    },
    openSettings: {
      type: 'OPEN_SETTINGS' as MessageType,
    },
    openFileChanges: {
      type: 'OPEN_FILE_CHANGES' as MessageType,
    },
    openIssues: {
      type: 'OPEN_ISSUES' as MessageType,
    },
    openProjects: {
      type: 'OPEN_PROJECTS' as MessageType,
    },
    importPrivateRepo: {
      type: 'IMPORT_PRIVATE_REPO' as MessageType,
      data: {
        repoName: 'private-repo',
        branch: 'main',
      },
    },
    deleteTempRepo: {
      type: 'DELETE_TEMP_REPO' as MessageType,
      data: {
        repoId: 'temp-repo-123',
      },
    },
    pushToGithub: {
      type: 'PUSH_TO_GITHUB' as MessageType,
    },
    useCachedFiles: {
      type: 'USE_CACHED_FILES' as MessageType,
    },
    heartbeat: {
      type: 'HEARTBEAT' as MessageType,
    },
    heartbeatResponse: {
      type: 'HEARTBEAT_RESPONSE' as MessageType,
    },
    githubAppSynced: {
      type: 'GITHUB_APP_SYNCED' as MessageType,
      data: {
        installationId: 12345678,
        username: 'testuser',
      },
    },
    subscriptionUpgraded: {
      type: 'SUBSCRIPTION_UPGRADED' as MessageType,
      data: {
        plan: 'premium',
        expiresAt: Date.now() + 86400000, // 1 day from now
      },
    },
  },

  // Chrome runtime error conditions
  chromeRuntimeErrors: {
    contextInvalidated: 'Extension context invalidated',
    contextWasInvalidated: 'Extension context was invalidated',
    invalidExtension: 'chrome-extension://invalid/',
    networkError: 'net::ERR_FAILED',
    connectionFailed: 'Could not establish connection',
    receivingEndMissing: 'Receiving end does not exist',
    portClosed: 'The message port closed before a response was received',
    runtimeUnavailable: 'chrome.runtime is undefined',
    runtimeIdUnavailable: 'chrome.runtime.id is undefined',
  },

  // Port state scenarios
  portStates: {
    healthy: {
      name: 'bolt-content',
      connected: true,
      hasListeners: true,
    },
    disconnectedNormal: {
      name: 'bolt-content',
      connected: false,
      disconnectReason: null,
    },
    disconnectedError: {
      name: 'bolt-content',
      connected: false,
      disconnectReason: 'Extension context invalidated',
    },
    invalidName: {
      name: '', // Empty name should be invalid
      connected: true,
    },
    nullPort: null,
  },

  // Queue scenarios for testing memory usage and performance
  queueScenarios: {
    empty: [],
    smallQueue: [
      { type: 'DEBUG' as MessageType, data: { message: 'Test 1' } },
      { type: 'DEBUG' as MessageType, data: { message: 'Test 2' } },
    ],
    mediumQueue: Array.from({ length: 50 }, (_, i) => ({
      type: 'DEBUG' as MessageType,
      data: { message: `Queued message ${i + 1}` },
    })),
    largeQueue: Array.from({ length: 1000 }, (_, i) => ({
      type: 'DEBUG' as MessageType,
      data: { message: `Large queue message ${i + 1}` },
    })),
    mixedQueue: [
      { type: 'ZIP_DATA' as MessageType, data: { data: 'base64data1', projectId: 'project1' } },
      { type: 'UPLOAD_STATUS' as MessageType, data: { status: 'uploading', progress: 25 } },
      { type: 'SET_COMMIT_MESSAGE' as MessageType, data: { message: 'Commit 1' } },
      { type: 'DEBUG' as MessageType, data: { message: 'Debug message' } },
      { type: 'HEARTBEAT' as MessageType },
    ],
    duplicateMessages: Array.from({ length: 10 }, () => ({
      type: 'HEARTBEAT' as MessageType,
    })),
  },

  // Performance and stress test scenarios
  performanceScenarios: {
    rapidSendingBurst: {
      messageCount: 100,
      intervalMs: 1, // Send every 1ms
      messageType: 'DEBUG' as MessageType,
    },
    sustainedSending: {
      messageCount: 1000,
      intervalMs: 10, // Send every 10ms
      messageType: 'HEARTBEAT' as MessageType,
    },
    largePayloadBurst: {
      messageCount: 10,
      intervalMs: 50,
      messageType: 'ZIP_DATA' as MessageType,
      payloadSize: 1024 * 1024, // 1MB each
    },
  },

  // Memory leak detection scenarios
  memoryLeakScenarios: {
    rapidConnectDisconnect: {
      cycles: 50,
      intervalMs: 10,
    },
    queueGrowthWithoutProcessing: {
      messageCount: 1000,
      disconnectAfter: 10, // Messages sent before disconnecting
    },
    eventListenerAccumulation: {
      portUpdateCycles: 100,
    },
  },

  // Edge case payloads
  edgeCasePayloads: {
    nullData: null,
    undefinedData: undefined,
    emptyObject: {},
    emptyArray: [],
    nestedObject: {
      level1: {
        level2: {
          level3: 'deep value',
        },
      },
    },
    circularReference: (() => {
      const obj: any = { name: 'circular' };
      obj.self = obj;
      return obj;
    })(),
    veryLargeString: 'x'.repeat(1024 * 1024), // 1MB string
    unicodeString: '🚀 Bolt to GitHub 🎉 Unicode test with émojis and spëcial chars',
    htmlString: '<script>alert("xss")</script><div>HTML content</div>',
    jsonString: '{"embedded": "json", "number": 42, "boolean": true}',
  },

  // Connection timing scenarios
  connectionTimings: {
    immediate: 0,
    fastReconnect: 50,
    normalReconnect: 1000,
    slowReconnect: 5000,
    verySlowReconnect: 30000,
    timeoutScenario: 60000,
  },
};

// =============================================================================
// MESSAGE FACTORY FUNCTIONS
// =============================================================================

export const MessageFactory = {
  // Create messages with various payloads
  createZipDataMessage(
    data: string = TestData.messages.zipData.data.data,
    projectId?: string
  ): Message {
    return {
      type: 'ZIP_DATA',
      data: projectId ? { data, projectId } : { data },
    };
  },

  createUploadStatusMessage(status: string, progress?: number, message?: string): Message {
    return {
      type: 'UPLOAD_STATUS',
      data: {
        status,
        ...(progress !== undefined && { progress }),
        ...(message && { message }),
      },
    };
  },

  createCommitMessage(message: string): Message {
    return {
      type: 'SET_COMMIT_MESSAGE',
      data: { message },
    };
  },

  createDebugMessage(message: string): Message {
    return {
      type: 'DEBUG',
      data: { message },
    };
  },

  // Create message sequences for testing patterns
  createMessageSequence(types: MessageType[], baseData?: any): Message[] {
    return types.map((type) => ({
      type,
      ...(baseData && { data: baseData }),
    }));
  },

  // Create messages with edge case data
  createMessageWithPayload(type: MessageType, payload: any): Message {
    return {
      type,
      data: payload,
    };
  },

  // Create messages for performance testing
  createPerformanceMessages(count: number, type: MessageType = 'DEBUG'): Message[] {
    return Array.from({ length: count }, (_, i) => ({
      type,
      data: { message: `Performance test message ${i + 1}`, timestamp: Date.now() },
    }));
  },
};

// =============================================================================
// PORT STATE FACTORIES
// =============================================================================

export const PortStateFactory = {
  // Create different port connection states
  createHealthyPort(): Partial<chrome.runtime.Port> {
    return {
      name: 'bolt-content',
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(),
        hasListeners: jest.fn(() => true),
      } as any,
      postMessage: jest.fn(),
    };
  },

  createDisconnectedPort(): Partial<chrome.runtime.Port> {
    return {
      name: 'bolt-content',
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(),
        hasListeners: jest.fn(() => false),
      } as any,
      postMessage: jest.fn(() => {
        throw new Error('Port is disconnected');
      }),
    };
  },

  createPortWithError(errorMessage: string): Partial<chrome.runtime.Port> {
    return {
      name: 'bolt-content',
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(),
        hasListeners: jest.fn(() => true),
      } as any,
      postMessage: jest.fn(() => {
        throw new Error(errorMessage);
      }),
    };
  },

  createInvalidPort(): Partial<chrome.runtime.Port> {
    return {
      name: '', // Invalid empty name
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(),
        hasListeners: jest.fn(() => false),
      } as any,
      postMessage: jest.fn(),
    };
  },

  createPortThatWillDisconnect(delayMs: number): Partial<chrome.runtime.Port> {
    const port = this.createHealthyPort();

    // Simulate disconnection after delay
    setTimeout(() => {
      const disconnectHandlers = (port.onDisconnect!.addListener as jest.Mock).mock.calls.map(
        (call) => call[0]
      );
      disconnectHandlers.forEach((handler) => handler(port));
    }, delayMs);

    return port;
  },
};

// =============================================================================
// CHROME RUNTIME STATE FACTORIES
// =============================================================================

export const ChromeRuntimeStateFactory = {
  createHealthyChromeRuntime() {
    return {
      id: 'bolt-to-github-extension-id',
    };
  },

  createInvalidatedChromeRuntime() {
    return undefined; // Simulates chrome.runtime being undefined
  },

  createRuntimeWithoutId() {
    return {}; // chrome.runtime exists but id is undefined
  },

  createRuntimeThatThrows() {
    return new Proxy(
      {},
      {
        get(target, prop) {
          throw new Error('Extension context invalidated');
        },
      }
    );
  },
};

// =============================================================================
// TEST SCENARIO BUILDERS
// =============================================================================

export const ScenarioBuilder = {
  // Normal operation scenarios
  normalOperation: {
    healthyConnection: {
      port: PortStateFactory.createHealthyPort(),
      chromeRuntime: ChromeRuntimeStateFactory.createHealthyChromeRuntime(),
      messages: [
        TestData.messages.contentScriptReady,
        TestData.messages.githubSettingsChanged,
        TestData.messages.zipData,
      ],
    },
    messageQueueProcessing: {
      port: PortStateFactory.createHealthyPort(),
      chromeRuntime: ChromeRuntimeStateFactory.createHealthyChromeRuntime(),
      queuedMessages: TestData.queueScenarios.mixedQueue,
    },
  },

  // Error scenarios
  errorScenarios: {
    contextInvalidation: {
      port: PortStateFactory.createHealthyPort(),
      chromeRuntime: ChromeRuntimeStateFactory.createInvalidatedChromeRuntime(),
      expectedBehavior: 'queue_messages_and_dispatch_event',
    },
    portDisconnection: {
      port: PortStateFactory.createDisconnectedPort(),
      chromeRuntime: ChromeRuntimeStateFactory.createHealthyChromeRuntime(),
      expectedBehavior: 'queue_messages',
    },
    postMessageFailure: {
      port: PortStateFactory.createPortWithError('Port connection failed'),
      chromeRuntime: ChromeRuntimeStateFactory.createHealthyChromeRuntime(),
      expectedBehavior: 'queue_message_and_mark_disconnected',
    },
    runtimeAccessFailure: {
      port: PortStateFactory.createHealthyPort(),
      chromeRuntime: ChromeRuntimeStateFactory.createRuntimeThatThrows(),
      expectedBehavior: 'mark_disconnected',
    },
  },

  // Edge case scenarios
  edgeCases: {
    rapidReconnection: {
      initialPort: PortStateFactory.createHealthyPort(),
      newPort: PortStateFactory.createHealthyPort(),
      reconnectDelayMs: 50,
      messagesToSend: TestData.queueScenarios.smallQueue,
    },
    queueOverflow: {
      port: PortStateFactory.createDisconnectedPort(),
      messages: TestData.queueScenarios.largeQueue,
      expectedBehavior: 'handle_gracefully',
    },
    invalidPortUpdate: {
      initialPort: PortStateFactory.createHealthyPort(),
      newPort: PortStateFactory.createInvalidPort(),
      expectedBehavior: 'maintain_queue',
    },
  },

  // Performance scenarios
  performanceScenarios: {
    highFrequencyMessages: {
      port: PortStateFactory.createHealthyPort(),
      chromeRuntime: ChromeRuntimeStateFactory.createHealthyChromeRuntime(),
      messageCount: TestData.performanceScenarios.rapidSendingBurst.messageCount,
      intervalMs: TestData.performanceScenarios.rapidSendingBurst.intervalMs,
    },
    largePayloads: {
      port: PortStateFactory.createHealthyPort(),
      chromeRuntime: ChromeRuntimeStateFactory.createHealthyChromeRuntime(),
      messages: [
        MessageFactory.createZipDataMessage(TestData.edgeCasePayloads.veryLargeString),
        MessageFactory.createCommitMessage(TestData.edgeCasePayloads.veryLargeString),
      ],
    },
  },

  // Memory leak scenarios
  memoryLeakScenarios: {
    repeatedPortUpdates: {
      updateCycles: TestData.memoryLeakScenarios.eventListenerAccumulation.portUpdateCycles,
      portsPerCycle: 1,
      timingMs: 10,
    },
    unboundedQueueGrowth: {
      disconnectedPort: PortStateFactory.createDisconnectedPort(),
      messageCount: TestData.memoryLeakScenarios.queueGrowthWithoutProcessing.messageCount,
      queueLimitExpected: false, // Should handle unbounded growth
    },
  },
};

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

export const AssertionHelpers = {
  // Queue state assertions
  expectQueueState(messageHandler: any, expectedLength: number, expectedMessages?: Message[]) {
    const status = messageHandler.getConnectionStatus();
    expect(status.queuedMessages).toBe(expectedLength);

    if (expectedMessages) {
      // This would require exposing queue for testing or using reflection
      // expect(messageHandler.messageQueue).toEqual(expectedMessages);
    }
  },

  // Connection state assertions
  expectConnectionState(messageHandler: any, expectedConnected: boolean) {
    const status = messageHandler.getConnectionStatus();
    expect(status.connected).toBe(expectedConnected);
  },

  // Custom event assertions
  expectCustomEventDispatched(eventType: string, expectedDetail?: any) {
    // This would need to be implemented with event listeners in tests
    // or by mocking window.dispatchEvent
  },

  // Port method call assertions
  expectPortMethodCalled(port: any, method: string, times: number = 1) {
    expect(port[method]).toHaveBeenCalledTimes(times);
  },

  // Message content assertions
  expectMessageContent(port: any, messageType: MessageType, data?: any) {
    expect(port.postMessage).toHaveBeenCalledWith({
      type: messageType,
      ...(data && { data }),
    });
  },

  // Memory leak detection helpers
  expectNoMemoryLeaks(initialCounts: any, finalCounts: any) {
    // Compare timer counts, event listener counts, etc.
    Object.keys(initialCounts).forEach((key) => {
      expect(finalCounts[key]).toBeLessThanOrEqual(
        initialCounts[key] + 1 // Allow small variance
      );
    });
  },
};

// =============================================================================
// TIMING HELPERS
// =============================================================================

export const TimingHelpers = {
  delays: TestData.connectionTimings,

  async waitForMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  async waitForCondition(
    condition: () => boolean,
    timeoutMs: number = 5000,
    intervalMs: number = 10
  ): Promise<void> {
    const startTime = Date.now();

    while (!condition() && Date.now() - startTime < timeoutMs) {
      await this.waitForMs(intervalMs);
    }

    if (!condition()) {
      throw new Error(`Condition not met within ${timeoutMs}ms`);
    }
  },

  createDelayedPromise<T>(value: T, delayMs: number): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
  },
};
