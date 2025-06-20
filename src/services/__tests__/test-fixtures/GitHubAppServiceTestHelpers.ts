/**
 * Test helper functions for GitHubAppService
 * Provides setup, teardown, and utility functions for tests
 */

import { GitHubAppService } from '../../GitHubAppService';
import {
  MockChromeStorage,
  MockFetchHandler,
  MockGitHubAppService,
  GitHubAppServiceTestScenario,
  createMockChromeStorageAPI,
  createControlledFetch,
} from './GitHubAppServiceMocks';
import { validGitHubAppConfig } from './GitHubAppServiceTestFixtures';
import type { GitHubAppConfig } from '../../types/authentication';

// ===========================
// Test Environment Setup
// ===========================

export interface GitHubAppServiceTestEnvironment {
  service: GitHubAppService;
  mockService: MockGitHubAppService;
  storage: MockChromeStorage;
  fetchMock: MockFetchHandler;
  cleanup: () => void;
}

/**
 * Set up a complete test environment for GitHubAppService
 */
export function setupGitHubAppServiceTest(
  options: {
    useRealService?: boolean;
    initialStorage?: Record<string, unknown>;
    initialConfig?: GitHubAppConfig;
    withSupabaseToken?: boolean;
  } = {}
): GitHubAppServiceTestEnvironment {
  const storage = new MockChromeStorage(options.initialStorage);
  const fetchMock = new MockFetchHandler();

  // Mock global chrome.storage
  const originalChrome = global.chrome;
  global.chrome = {
    ...global.chrome,
    storage: createMockChromeStorageAPI(storage),
  } as unknown as typeof global.chrome;

  // Mock global fetch
  const originalFetch = global.fetch;
  global.fetch = createControlledFetch(fetchMock) as typeof global.fetch;

  let service: GitHubAppService;
  let mockService: MockGitHubAppService;

  if (options.useRealService) {
    service = new GitHubAppService();
    mockService = new MockGitHubAppService();

    if (options.withSupabaseToken) {
      const authKey = `sb-gapvjcqybzabnrjnxzhg-auth-token`;
      storage.set({
        [authKey]: {
          access_token: 'sb_access_token_1234567890',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'sb_refresh_token_1234567890',
        },
      });
    }
  } else {
    mockService = new MockGitHubAppService();
    service = mockService as unknown as GitHubAppService;
  }

  if (options.initialConfig) {
    mockService.storeConfig(options.initialConfig);
    storage.set({
      githubAppInstallationId: options.initialConfig.installationId,
      githubAppAccessToken: options.initialConfig.accessToken,
      githubAppRefreshToken: options.initialConfig.refreshToken,
      githubAppExpiresAt: options.initialConfig.expiresAt,
      githubAppRefreshTokenExpiresAt: options.initialConfig.refreshTokenExpiresAt,
      githubAppUsername: options.initialConfig.githubUsername,
      githubAppUserId: options.initialConfig.githubUserId,
      githubAppAvatarUrl: options.initialConfig.avatarUrl,
      githubAppScopes: options.initialConfig.scopes,
    });
  }

  const cleanup = () => {
    global.chrome = originalChrome;
    global.fetch = originalFetch;
    storage.clear();
    fetchMock.reset();
  };

  return {
    service,
    mockService,
    storage,
    fetchMock,
    cleanup,
  };
}

// ===========================
// Test Data Helpers
// ===========================

/**
 * Create a test scenario with pre-configured state
 */
export function createTestScenario(
  scenario: 'authenticated' | 'expired' | 'unauthenticated' | 'partial'
) {
  const builder = new GitHubAppServiceTestScenario();

  switch (scenario) {
    case 'authenticated':
      return builder.withValidAuth().withSupabaseUserToken();
    case 'expired':
      return builder.withExpiredToken().withSupabaseUserToken();
    case 'unauthenticated':
      return builder.withNoAuth();
    case 'partial':
      return builder.withSupabaseUserToken();
    default:
      return builder;
  }
}

/**
 * Set up mock responses for common API patterns
 */
export function setupCommonMockResponses(
  fetchMock: MockFetchHandler,
  scenario: 'success' | 'error' | 'mixed'
) {
  switch (scenario) {
    case 'success':
      // Supabase endpoints
      fetchMock.setResponse('/functions/v1/github-app-auth', {
        success: true,
        github_username: 'testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
        scopes: ['repo', 'user:email'],
        installation_id: 12345678,
        installation_found: true,
      });

      fetchMock.setResponse('/functions/v1/get-github-token', {
        access_token: 'ghs_1234567890abcdefghijklmnopqrstuvwxyz12',
        github_username: 'testuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: ['repo', 'user:email'],
        type: 'github_app',
        renewed: false,
      });

      fetchMock.setResponse('/functions/v1/get-installation-token', {
        github_username: 'testuser',
        token: 'ghs_installation567890abcdefghijklmnopqrstuv',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        type: 'installation',
        installation_id: 12345678,
        permissions: { contents: 'write', metadata: 'read' },
        repositories: 'all',
      });

      // GitHub API endpoints
      fetchMock.setResponse('https://api.github.com/user', {
        login: 'testuser',
        id: 1234567,
        avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
      });
      break;

    case 'error':
      fetchMock.setResponse(
        '/functions/v1/get-github-token',
        {
          error: 'No GitHub App configuration found',
          code: 'NO_GITHUB_APP',
          requires_auth: true,
        },
        401
      );

      fetchMock.setResponse(
        'https://api.github.com/user',
        {
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest',
        },
        401
      );
      break;

    case 'mixed': {
      // First call fails, second succeeds (for retry scenarios)
      let callCount = 0;
      fetchMock.setResponse('/functions/v1/get-github-token', {
        get response() {
          callCount++;
          if (callCount === 1) {
            return {
              error: 'Token expired',
              code: 'TOKEN_EXPIRED_NO_REFRESH',
            };
          }
          return {
            access_token: 'ghs_renewed567890abcdefghijklmnopqrstuvwxyz',
            github_username: 'testuser',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            scopes: ['repo', 'user:email'],
            type: 'github_app',
            renewed: true,
          };
        },
        get status() {
          return callCount === 1 ? 401 : 200;
        },
      } as Record<string, unknown>);
      break;
    }
  }
}

// ===========================
// Assertion Helpers
// ===========================

/**
 * Assert that a fetch call was made with expected parameters
 */
export function assertFetchCall(
  fetchMock: MockFetchHandler,
  expectedUrl: string | RegExp,
  expectedOptions?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
) {
  const calls = fetchMock.getCallHistory();
  const matchingCall = calls.find((call) => {
    const urlMatches =
      expectedUrl instanceof RegExp ? expectedUrl.test(call.url) : call.url.includes(expectedUrl);

    if (!urlMatches) return false;

    if (expectedOptions) {
      if (expectedOptions.method && call.options?.method !== expectedOptions.method) {
        return false;
      }

      if (expectedOptions.headers) {
        const headers = call.options?.headers as Record<string, string>;
        for (const [key, value] of Object.entries(expectedOptions.headers)) {
          if (headers?.[key] !== value) return false;
        }
      }

      if (expectedOptions.body) {
        const body = call.options?.body ? JSON.parse(call.options.body as string) : null;
        if (JSON.stringify(body) !== JSON.stringify(expectedOptions.body)) {
          return false;
        }
      }
    }

    return true;
  });

  if (!matchingCall) {
    throw new Error(`No fetch call found matching: ${expectedUrl}`);
  }

  return matchingCall;
}

/**
 * Assert that storage was updated with expected values
 */
export function assertStorageUpdate(
  storage: MockChromeStorage,
  expectedKeys: Record<string, unknown>
) {
  const currentStorage = storage.getAll();

  for (const [key, expectedValue] of Object.entries(expectedKeys)) {
    const actualValue = currentStorage[key];

    if (expectedValue === undefined) {
      if (key in currentStorage) {
        throw new Error(`Expected storage key "${key}" to be removed, but it exists`);
      }
    } else if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      throw new Error(
        `Storage key "${key}" mismatch:\nExpected: ${JSON.stringify(expectedValue)}\nActual: ${JSON.stringify(actualValue)}`
      );
    }
  }
}

// ===========================
// Time and Token Helpers
// ===========================

/**
 * Advance time for testing token expiry
 */
export function advanceTime(ms: number) {
  const originalDateNow = Date.now;
  const currentTime = Date.now();

  Date.now = () => currentTime + ms;

  return () => {
    Date.now = originalDateNow;
  };
}

/**
 * Create a token that expires at a specific time
 */
export function createExpiringToken(expiresInMs: number) {
  return {
    ...validGitHubAppConfig,
    accessToken: `ghs_expiring_${Date.now()}_${expiresInMs}`,
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

/**
 * Simulate token renewal process
 */
export async function simulateTokenRenewal(
  service: GitHubAppService | MockGitHubAppService,
  fetchMock: MockFetchHandler
) {
  // Set up renewal response
  fetchMock.setResponse('/functions/v1/get-github-token', {
    access_token: 'ghs_renewed567890abcdefghijklmnopqrstuvwxyz',
    github_username: 'testuser',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    scopes: ['repo', 'user:email'],
    type: 'github_app',
    renewed: true,
  });

  return await service.getAccessToken();
}

// ===========================
// Error Simulation Helpers
// ===========================

/**
 * Simulate various error conditions
 */
export function simulateError(
  fetchMock: MockFetchHandler,
  errorType: 'network' | 'auth' | 'rate-limit' | 'server'
) {
  switch (errorType) {
    case 'network': {
      // Override fetch to throw network error
      fetchMock.fetch.bind(fetchMock);
      fetchMock.fetch = async () => {
        throw new Error('Network error');
      };
      break;
    }

    case 'auth':
      fetchMock.setResponse(
        '/.*/g',
        {
          error: 'Authentication failed',
          code: 'NO_GITHUB_APP',
        },
        401
      );
      break;

    case 'rate-limit':
      fetchMock.setResponse(
        'https://api.github.com/.*',
        {
          message: 'API rate limit exceeded',
          documentation_url:
            'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
        },
        403
      );
      break;

    case 'server':
      fetchMock.setResponse(
        '/.*/g',
        {
          error: 'Internal server error',
        },
        500
      );
      break;
  }
}

// ===========================
// Cleanup Utilities
// ===========================

/**
 * Clean up all test artifacts
 */
export function cleanupTest(env: GitHubAppServiceTestEnvironment) {
  env.cleanup();
}

/**
 * Reset all mocks to initial state
 */
export function resetMocks(env: GitHubAppServiceTestEnvironment) {
  env.storage.clear();
  env.fetchMock.reset();
  if (env.mockService) {
    env.mockService.setShouldFailAuth(false);
    env.mockService.setShouldFailTokenRenewal(false);
    env.mockService.resetTokenRenewalCount();
  }
}
