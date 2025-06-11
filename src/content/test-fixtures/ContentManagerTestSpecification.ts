/**
 * ContentManagerTestSpecification
 *
 * Defines comprehensive test scenarios and specifications for ContentManager testing.
 * Based on critical analysis from CRITICAL_TESTING_ANALYSIS.md
 */

export interface TestScenario {
  name: string;
  description: string;
  category: 'normal' | 'edge' | 'error' | 'recovery';
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export const ContentManagerTestScenarios: TestScenario[] = [
  // Normal Operation Scenarios
  {
    name: 'successful_initialization',
    description: 'ContentManager initializes successfully on bolt.new pages',
    category: 'normal',
    priority: 'critical',
  },
  {
    name: 'message_routing',
    description: 'Messages are correctly routed between background and content scripts',
    category: 'normal',
    priority: 'critical',
  },
  {
    name: 'heartbeat_maintenance',
    description: 'Heartbeat messages maintain connection health',
    category: 'normal',
    priority: 'high',
  },
  {
    name: 'stale_data_cleanup',
    description: 'Stale stored file changes are cleared on initialization',
    category: 'normal',
    priority: 'medium',
  },

  // Edge Cases
  {
    name: 'rapid_reconnection',
    description: 'Handle rapid connection/disconnection cycles',
    category: 'edge',
    priority: 'high',
  },
  {
    name: 'concurrent_messages',
    description: 'Handle multiple concurrent messages during recovery',
    category: 'edge',
    priority: 'high',
  },
  {
    name: 'max_reconnection_attempts',
    description: 'Stop reconnecting after maximum attempts reached',
    category: 'edge',
    priority: 'medium',
  },
  {
    name: 'quick_successive_disconnects',
    description: 'Detect context invalidation from rapid disconnections',
    category: 'edge',
    priority: 'high',
  },

  // Error Scenarios
  {
    name: 'context_invalidation_detection',
    description: 'Accurately detect extension context invalidation',
    category: 'error',
    priority: 'critical',
  },
  {
    name: 'port_disconnection_handling',
    description: 'Handle port disconnections gracefully',
    category: 'error',
    priority: 'critical',
  },
  {
    name: 'chrome_runtime_unavailable',
    description: 'Handle cases where chrome.runtime is not available',
    category: 'error',
    priority: 'critical',
  },
  {
    name: 'message_sending_failure',
    description: 'Handle failures when sending messages through port',
    category: 'error',
    priority: 'high',
  },

  // Recovery Scenarios
  {
    name: 'successful_recovery',
    description: 'Successfully recover from service worker restart',
    category: 'recovery',
    priority: 'critical',
  },
  {
    name: 'recovery_with_queued_messages',
    description: 'Recover and process messages queued during disconnection',
    category: 'recovery',
    priority: 'critical',
  },
  {
    name: 'unrecoverable_context_invalidation',
    description: 'Handle truly unrecoverable context invalidation gracefully',
    category: 'recovery',
    priority: 'critical',
  },
  {
    name: 'recovery_timeout',
    description: 'Clear recovery flag after timeout to prevent stuck state',
    category: 'recovery',
    priority: 'high',
  },
];

// Performance metrics to track during tests
export interface PerformanceMetrics {
  initializationTime: number;
  reconnectionTime: number;
  messageProcessingTime: number;
  memoryUsage: number;
  timerCount: number;
}

// State validation points
export interface StateValidation {
  isDestroyed: boolean;
  isReconnecting: boolean;
  isInRecovery: boolean;
  reconnectAttempts: number;
  hasActiveTimers: boolean;
  portConnected: boolean;
  messageQueueLength: number;
}

// Event sequences for complex scenarios
export interface EventSequence {
  name: string;
  events: Array<{
    type: 'disconnect' | 'connect' | 'message' | 'error' | 'wait';
    payload?: any;
    delay?: number;
  }>;
  expectedOutcome: string;
}

export const ComplexEventSequences: EventSequence[] = [
  {
    name: 'rapid_reconnection_sequence',
    events: [
      { type: 'disconnect', payload: { error: null } },
      { type: 'wait', delay: 100 },
      { type: 'connect' },
      { type: 'disconnect', payload: { error: null } },
      { type: 'wait', delay: 100 },
      { type: 'connect' },
    ],
    expectedOutcome: 'ContentManager remains stable without memory leaks',
  },
  {
    name: 'context_invalidation_recovery',
    events: [
      { type: 'disconnect', payload: { error: { message: 'Extension context invalidated' } } },
      { type: 'wait', delay: 1000 },
      { type: 'connect' },
      { type: 'message', payload: { type: 'HEARTBEAT_RESPONSE' } },
    ],
    expectedOutcome: 'ContentManager recovers and re-establishes connection',
  },
  {
    name: 'message_queue_during_recovery',
    events: [
      { type: 'disconnect', payload: { error: { message: 'Extension context invalidated' } } },
      { type: 'message', payload: { type: 'UPLOAD_STATUS', status: { status: 'uploading' } } },
      { type: 'message', payload: { type: 'GITHUB_SETTINGS_CHANGED', data: { isValid: true } } },
      { type: 'wait', delay: 500 },
      { type: 'connect' },
    ],
    expectedOutcome: 'Queued messages are ignored during recovery to prevent errors',
  },
];
