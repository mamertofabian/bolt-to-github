/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test doubles and mocks for GitHubAppService dependencies
 * Provides controlled test doubles that accurately reflect real behavior
 */

import type { GitHubAppService } from '../../GitHubAppService';
import {
  validGitHubAppConfig,
  validTokenResponse,
  validInstallationTokenResponse,
  validTokenValidationResult,
  validPermissionCheckResult,
  validOAuthFlowResponse,
  noGitHubAppError,
  tokenExpiredNoRefreshError,
  validGitHubUserResponse,
  validAuthStorageData,
  validSupabaseAuthToken,
} from './GitHubAppServiceTestFixtures';

// ===========================
// Chrome Storage Mock
// ===========================

export class MockChromeStorage {
  private storage: Record<string, any> = {};

  constructor(initialData: Record<string, any> = {}) {
    this.storage = { ...initialData };
  }

  get(keys: string | string[]): Promise<Record<string, any>> {
    return Promise.resolve(
      Array.isArray(keys)
        ? keys.reduce((acc, key) => ({ ...acc, [key]: this.storage[key] }), {})
        : { [keys]: this.storage[keys] }
    );
  }

  set(items: Record<string, any>): Promise<void> {
    Object.assign(this.storage, items);
    return Promise.resolve();
  }

  remove(keys: string | string[]): Promise<void> {
    const keysToRemove = Array.isArray(keys) ? keys : [keys];
    keysToRemove.forEach((key) => delete this.storage[key]);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.storage = {};
    return Promise.resolve();
  }

  getAll(): Record<string, any> {
    return { ...this.storage };
  }
}

// ===========================
// Fetch Mock for API Responses
// ===========================

export class MockFetchHandler {
  private responses: Map<string, { response: any; status: number }> = new Map();
  private callHistory: Array<{ url: string; options?: RequestInit }> = [];

  setResponse(urlPattern: string | RegExp, response: any, status: number = 200) {
    this.responses.set(urlPattern.toString(), { response, status });
  }

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    this.callHistory.push({ url, options });

    // Find matching response
    for (const [pattern, { response, status }] of this.responses) {
      if (
        (pattern.startsWith('/') && new RegExp(pattern.slice(1, -1)).test(url)) ||
        url.includes(pattern)
      ) {
        // Handle function responses
        const responseData = typeof response === 'function' ? response() : response;

        // Create proper Response object
        return {
          ok: status >= 200 && status < 300,
          status,
          statusText: status === 200 ? 'OK' : 'Error',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => responseData,
          text: async () => JSON.stringify(responseData),
          blob: async () => new Blob([JSON.stringify(responseData)]),
          arrayBuffer: async () => new ArrayBuffer(0),
          formData: async () => new FormData(),
          clone: () => ({ json: async () => responseData }) as any,
        } as Response;
      }
    }

    // Default 404 response
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ error: 'Not found' }),
      text: async () => JSON.stringify({ error: 'Not found' }),
      blob: async () => new Blob([JSON.stringify({ error: 'Not found' })]),
      arrayBuffer: async () => new ArrayBuffer(0),
      formData: async () => new FormData(),
      clone: () => ({ json: async () => ({ error: 'Not found' }) }) as any,
    } as Response;
  }

  getCallHistory() {
    return [...this.callHistory];
  }

  getLastCall() {
    return this.callHistory[this.callHistory.length - 1];
  }

  clearHistory() {
    this.callHistory = [];
  }

  reset() {
    this.responses.clear();
    this.callHistory = [];
  }
}

// ===========================
// GitHubAppService Mock
// ===========================

export class MockGitHubAppService implements Partial<GitHubAppService> {
  private userToken: string | null = null;
  private config: any = null;
  private shouldFailAuth = false;
  private shouldFailTokenRenewal = false;
  private tokenRenewalCount = 0;

  setUserToken(token: string): void {
    this.userToken = token;
  }

  async completeOAuthFlow(code: string, _state?: string) {
    if (code === 'code_invalid_xxxxxxxxxxxx') {
      throw new Error('Invalid authorization code');
    }
    return validOAuthFlowResponse;
  }

  async getAccessToken() {
    this.tokenRenewalCount++;

    if (this.shouldFailAuth) {
      throw new Error('Re-authentication required: No GitHub App configuration found');
    }

    if (this.shouldFailTokenRenewal && this.tokenRenewalCount > 1) {
      throw new Error('Re-authentication required: Failed to renew access token');
    }

    return this.tokenRenewalCount > 1
      ? { ...validTokenResponse, renewed: true }
      : validTokenResponse;
  }

  async getInstallationToken() {
    if (!this.config?.installationId) {
      throw new Error('No GitHub App installation found');
    }
    return validInstallationTokenResponse;
  }

  async validateAuth() {
    return this.shouldFailAuth
      ? { isValid: false, error: 'Authentication validation failed' }
      : validTokenValidationResult;
  }

  async checkPermissions(_repoOwner: string) {
    return validPermissionCheckResult;
  }

  async getConfig() {
    return this.config;
  }

  async storeConfig(config: any) {
    this.config = config;
  }

  async clearConfig() {
    this.config = null;
  }

  async isConfigured() {
    return this.config !== null && this.config.installationId !== undefined;
  }

  async needsRenewal() {
    if (!this.config?.expiresAt) return true;
    const expirationTime = new Date(this.config.expiresAt).getTime();
    return expirationTime - Date.now() < 5 * 60 * 1000;
  }

  generateOAuthUrl(clientId: string, redirectUri: string, state?: string) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'user:email',
    });
    if (state) params.append('state', state);
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  // Test helpers
  setShouldFailAuth(shouldFail: boolean) {
    this.shouldFailAuth = shouldFail;
  }

  setShouldFailTokenRenewal(shouldFail: boolean) {
    this.shouldFailTokenRenewal = shouldFail;
  }

  getTokenRenewalCount() {
    return this.tokenRenewalCount;
  }

  resetTokenRenewalCount() {
    this.tokenRenewalCount = 0;
  }
}

// ===========================
// Supabase Mock Responses
// ===========================

export function createSupabaseMockResponses(fetchMock: MockFetchHandler) {
  // OAuth completion endpoint
  fetchMock.setResponse('/functions/v1/github-app-auth', validOAuthFlowResponse, 200);

  // Get GitHub token endpoint
  fetchMock.setResponse('/functions/v1/get-github-token', validTokenResponse, 200);

  // Get installation token endpoint
  fetchMock.setResponse(
    '/functions/v1/get-installation-token',
    validInstallationTokenResponse,
    200
  );
}

export function createSupabaseErrorResponses(fetchMock: MockFetchHandler) {
  // No GitHub App error
  fetchMock.setResponse('/functions/v1/get-github-token', noGitHubAppError, 401);

  // Token expired error
  fetchMock.setResponse('/functions/v1/get-github-token', tokenExpiredNoRefreshError, 401);
}

// ===========================
// GitHub API Mock Responses
// ===========================

export function createGitHubMockResponses(fetchMock: MockFetchHandler) {
  // User endpoint
  fetchMock.setResponse('https://api.github.com/user', validGitHubUserResponse, 200);

  // Installations endpoint
  fetchMock.setResponse(
    'https://api.github.com/user/installations',
    {
      total_count: 1,
      installations: [
        {
          id: 12345678,
          account: {
            login: 'testuser',
            id: 1234567,
            avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
            type: 'User',
          },
        },
      ],
    },
    200
  );
}

// ===========================
// Test Scenario Builders
// ===========================

export class GitHubAppServiceTestScenario {
  private storage: MockChromeStorage;
  private fetchMock: MockFetchHandler;
  private service: MockGitHubAppService;

  constructor() {
    this.storage = new MockChromeStorage();
    this.fetchMock = new MockFetchHandler();
    this.service = new MockGitHubAppService();
  }

  withValidAuth() {
    this.storage.set(validAuthStorageData);
    this.service.storeConfig(validGitHubAppConfig);
    createSupabaseMockResponses(this.fetchMock);
    createGitHubMockResponses(this.fetchMock);
    return this;
  }

  withExpiredToken() {
    const expiredConfig = {
      ...validGitHubAppConfig,
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
    };
    this.storage.set({ ...validAuthStorageData, githubAppExpiresAt: expiredConfig.expiresAt });
    this.service.storeConfig(expiredConfig);
    return this;
  }

  withNoAuth() {
    this.storage.clear();
    this.service.clearConfig();
    createSupabaseErrorResponses(this.fetchMock);
    return this;
  }

  withTokenRenewalFailure() {
    this.service.setShouldFailTokenRenewal(true);
    return this;
  }

  withSupabaseUserToken(token: string = 'sb_access_token_1234567890') {
    const authKey = `sb-gapvjcqybzabnrjnxzhg-auth-token`;
    this.storage.set({
      [authKey]: validSupabaseAuthToken,
    });
    this.service.setUserToken(token);
    return this;
  }

  getStorage() {
    return this.storage;
  }

  getFetchMock() {
    return this.fetchMock;
  }

  getService() {
    return this.service;
  }

  build() {
    return {
      storage: this.storage,
      fetchMock: this.fetchMock,
      service: this.service,
    };
  }
}

// ===========================
// Utility Mock Functions
// ===========================

/**
 * Create a mock chrome.storage API
 */
export function createMockChromeStorageAPI(storage: MockChromeStorage) {
  return {
    local: {
      get: jest.fn((keys: string | string[] | null, callback?: (result: any) => void) => {
        const promise = storage.get(keys || []);
        if (callback) {
          promise.then((result) => callback(result));
        }
        return promise;
      }),
      set: jest.fn((items: Record<string, any>, callback?: () => void) => {
        const promise = storage.set(items);
        if (callback) {
          promise.then(() => callback());
        }
        return promise;
      }),
      remove: jest.fn((keys: string | string[], callback?: () => void) => {
        const promise = storage.remove(keys);
        if (callback) {
          promise.then(() => callback());
        }
        return promise;
      }),
      clear: jest.fn((callback?: () => void) => {
        const promise = storage.clear();
        if (callback) {
          promise.then(() => callback());
        }
        return promise;
      }),
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    },
  };
}

/**
 * Create a controlled fetch mock for testing
 */
export function createControlledFetch(handler: MockFetchHandler) {
  return (url: string, options?: RequestInit) => handler.fetch(url, options);
}

/**
 * Create a spy for tracking method calls
 */
export function createMethodSpy<T extends (...args: any[]) => any>(
  originalMethod: T,
  _name: string = 'method'
): T & { calls: Array<Parameters<T>>; resetCalls: () => void } {
  const calls: Array<Parameters<T>> = [];

  const spy = ((...args: Parameters<T>) => {
    calls.push(args);
    return originalMethod(...args);
  }) as T & { calls: Array<Parameters<T>>; resetCalls: () => void };

  spy.calls = calls;
  spy.resetCalls = () => (calls.length = 0);

  return spy;
}
