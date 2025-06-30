/**
 * Fetch API Mocks for Vitest Tests
 *
 * This file provides mock implementations of Fetch API objects
 * that are needed for non-DOM tests that use these browser APIs.
 */

// Mock Response class for tests
class MockResponse {
  constructor(body, options = {}) {
    this.body = body;
    this.status = options.status || 200;
    this.statusText = options.statusText || '';
    this.headers = new Map(Object.entries(options.headers || {}));
    this.ok = this.status >= 200 && this.status < 300;
  }
}

// Assign the mock to global.Response if it doesn't exist
if (typeof global.Response === 'undefined') {
  global.Response = MockResponse;
}

// Mock Headers class
class MockHeaders {
  constructor(init) {
    this.map = new Map();
    if (init) {
      if (typeof init === 'object') {
        Object.entries(init).forEach(([key, value]) => {
          this.map.set(key.toLowerCase(), value);
        });
      }
    }
  }
  append(name, value) {
    this.map.set(name.toLowerCase(), value);
  }
  get(name) {
    return this.map.get(name.toLowerCase()) || null;
  }
}

// Assign the mock to global.Headers if it doesn't exist
if (typeof global.Headers === 'undefined') {
  global.Headers = MockHeaders;
}

// Mock Request class
class MockRequest {
  constructor(input, init = {}) {
    this.url = typeof input === 'string' ? input : input.url;
    this.method = init.method || 'GET';
    this.headers = new MockHeaders(init.headers || {});
    this.body = init.body || null;
  }
}

// Assign the mock to global.Request if it doesn't exist
if (typeof global.Request === 'undefined') {
  global.Request = MockRequest;
}
