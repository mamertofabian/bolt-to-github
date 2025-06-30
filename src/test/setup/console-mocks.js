/**
 * Console mocks for Vitest tests
 *
 * This file silences console output during tests to keep test output clean
 * while preserving the ability to test console behavior when needed.
 */

import { afterEach, beforeEach, expect, vi } from 'vitest';

// Store original console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  group: console.group || (() => {}),
  info: console.info || (() => {}),
  debug: console.debug || (() => {}),
};

// Mock console methods to silence output during tests
beforeEach(() => {
  // Mock all console methods to do nothing by default
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  if (console.group) {
    vi.spyOn(console, 'group').mockImplementation(() => {});
  }
  if (console.info) {
    vi.spyOn(console, 'info').mockImplementation(() => {});
  }
  if (console.debug) {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  }
});

afterEach(() => {
  // Restore console methods after each test
  vi.restoreAllMocks();
});

// Export utilities for tests that need to verify console output
global.testConsole = {
  /**
   * Temporarily enable console output for debugging
   */
  enableOutput: () => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    if (console.group) {
      console.group = originalConsole.group;
    }
    if (console.info) {
      console.info = originalConsole.info;
    }
    if (console.debug) {
      console.debug = originalConsole.debug;
    }
  },

  /**
   * Get the mock for a specific console method to verify calls
   */
  getMock: (method) => {
    return vi.mocked(console[method]);
  },

  /**
   * Verify that a console method was called with specific arguments
   */
  expectCall: (method, ...args) => {
    expect(console[method]).toHaveBeenCalledWith(...args);
  },

  /**
   * Verify that a console method was not called
   */
  expectNotCalled: (method) => {
    expect(console[method]).not.toHaveBeenCalled();
  },
};
