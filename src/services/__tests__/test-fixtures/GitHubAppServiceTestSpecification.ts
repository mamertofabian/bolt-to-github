/**
 * Test specifications and scenarios for GitHubAppService
 * Defines comprehensive test scenarios covering all use cases
 */

import type { GitHubAppService } from '../../GitHubAppService';
import type { GitHubAppServiceTestEnvironment } from './GitHubAppServiceTestHelpers';

// ===========================
// Test Scenario Definitions
// ===========================

export interface TestScenario {
  name: string;
  description: string;
  category: 'auth' | 'token' | 'installation' | 'permission' | 'error' | 'edge';
  setup: (env: GitHubAppServiceTestEnvironment) => Promise<void> | void;
  execute: (service: GitHubAppService) => Promise<any>;
  assertions: (result: any, env: GitHubAppServiceTestEnvironment) => void;
  cleanup?: (env: GitHubAppServiceTestEnvironment) => void;
}

// ===========================
// Authentication Scenarios
// ===========================

export const authenticationScenarios: TestScenario[] = [
  {
    name: 'Complete OAuth flow with valid code',
    description: 'Should successfully complete OAuth flow and store configuration',
    category: 'auth',
    setup: (env) => {
      env.fetchMock.setResponse('/functions/v1/github-app-auth', {
        success: true,
        github_username: 'testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
        scopes: ['repo', 'user:email'],
        installation_id: 12345678,
        installation_found: true,
      });
    },
    execute: (service) => service.completeOAuthFlow('code_valid_1234567890abcdef', 'state_12345'),
    assertions: (result, env) => {
      expect(result.success).toBe(true);
      expect(result.github_username).toBe('testuser');
      expect(result.installation_found).toBe(true);
      expect(result.installation_id).toBe(12345678);
    },
  },
  {
    name: 'OAuth flow with invalid code',
    description: 'Should handle invalid authorization code gracefully',
    category: 'auth',
    setup: (env) => {
      env.fetchMock.setResponse('/functions/v1/github-app-auth', {
        error: 'Invalid authorization code',
      }, 400);
    },
    execute: (service) => service.completeOAuthFlow('code_invalid_xxxxxxxxxxxx'),
    assertions: (result) => {
      expect(result).toBeUndefined();
    },
  },
  {
    name: 'OAuth flow without installation',
    description: 'Should handle case where user has not installed the GitHub App',
    category: 'auth',
    setup: (env) => {
      env.fetchMock.setResponse('/functions/v1/github-app-auth', {
        success: true,
        github_username: 'testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
        scopes: ['user:email'],
        installation_id: null,
        installation_found: false,
      });
    },
    execute: (service) => service.completeOAuthFlow('code_valid_1234567890abcdef'),
    assertions: (result) => {
      expect(result.success).toBe(true);
      expect(result.installation_found).toBe(false);
      expect(result.installation_id).toBeNull();
    },
  },
];

// ===========================
// Token Management Scenarios
// ===========================

export const tokenManagementScenarios: TestScenario[] = [
  {
    name: 'Get valid access token',
    description: 'Should retrieve valid access token from Supabase',
    category: 'token',
    setup: (env) => {
      env.storage.set({
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/functions/v1/get-github-token', {
        access_token: 'ghs_1234567890abcdefghijklmnopqrstuvwxyz12',
        github_username: 'testuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: ['repo', 'user:email'],
        type: 'github_app',
        renewed: false,
      });
    },
    execute: (service) => service.getAccessToken(),
    assertions: (result) => {
      expect(result.access_token).toMatch(/^ghs_/);
      expect(result.type).toBe('github_app');
      expect(result.renewed).toBe(false);
    },
  },
  {
    name: 'Automatic token renewal',
    description: 'Should automatically renew expired token',
    category: 'token',
    setup: (env) => {
      env.storage.set({
        githubAppExpiresAt: new Date(Date.now() - 3600000).toISOString(),
        githubAppRefreshToken: 'ghr_refresh1234567890abcdefghijklmnopqrstuvwxyz',
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/functions/v1/get-github-token', {
        access_token: 'ghs_renewed567890abcdefghijklmnopqrstuvwxyz',
        github_username: 'testuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: ['repo', 'user:email'],
        type: 'github_app',
        renewed: true,
      });
    },
    execute: (service) => service.getAccessToken(),
    assertions: (result) => {
      expect(result.access_token).toMatch(/^ghs_renewed/);
      expect(result.renewed).toBe(true);
    },
  },
  {
    name: 'Token renewal failure',
    description: 'Should handle token renewal failure and require re-authentication',
    category: 'token',
    setup: (env) => {
      env.storage.set({
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/functions/v1/get-github-token', {
        error: 'Failed to renew access token',
        code: 'TOKEN_RENEWAL_FAILED',
        details: 'Refresh token is invalid or expired',
      }, 401);
    },
    execute: (service) => service.getAccessToken().catch(e => e),
    assertions: (result) => {
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('Re-authentication required');
    },
  },
  {
    name: 'Check token needs renewal',
    description: 'Should correctly identify when token needs renewal',
    category: 'token',
    setup: (env) => {
      env.storage.set({
        githubAppExpiresAt: new Date(Date.now() + 240000).toISOString(), // 4 minutes
      });
    },
    execute: (service) => service.needsRenewal(),
    assertions: (result) => {
      expect(result).toBe(true);
    },
  },
];

// ===========================
// Installation Scenarios
// ===========================

export const installationScenarios: TestScenario[] = [
  {
    name: 'Get installation token',
    description: 'Should retrieve installation-specific token',
    category: 'installation',
    setup: (env) => {
      env.storage.set({
        githubAppInstallationId: 12345678,
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/functions/v1/get-installation-token', {
        github_username: 'testuser',
        token: 'ghs_installation567890abcdefghijklmnopqrstuv',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        type: 'installation',
        installation_id: 12345678,
        permissions: {
          contents: 'write',
          metadata: 'read',
        },
        repositories: 'all',
      });
    },
    execute: (service) => service.getInstallationToken(),
    assertions: (result) => {
      expect(result.type).toBe('installation');
      expect(result.token).toMatch(/^ghs_installation/);
      expect(result.installation_id).toBe(12345678);
      expect(result.permissions.contents).toBe('write');
    },
  },
  {
    name: 'Installation token with repository restrictions',
    description: 'Should handle installation with limited repository access',
    category: 'installation',
    setup: (env) => {
      env.storage.set({
        githubAppInstallationId: 12345678,
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/functions/v1/get-installation-token', {
        github_username: 'testuser',
        token: 'ghs_installation567890abcdefghijklmnopqrstuv',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        type: 'installation',
        installation_id: 12345678,
        permissions: {
          contents: 'write',
          metadata: 'read',
        },
        repositories: [
          { id: 987654321, name: 'allowed-repo', full_name: 'testuser/allowed-repo' },
        ],
      });
    },
    execute: (service) => service.getInstallationToken(),
    assertions: (result) => {
      expect(result.repositories).toBeInstanceOf(Array);
      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0].name).toBe('allowed-repo');
    },
  },
];

// ===========================
// Permission Scenarios
// ===========================

export const permissionScenarios: TestScenario[] = [
  {
    name: 'Check full permissions',
    description: 'Should verify installation has full required permissions',
    category: 'permission',
    setup: (env) => {
      env.storage.set({
        githubAppInstallationId: 12345678,
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/functions/v1/get-installation-token', {
        github_username: 'testuser',
        token: 'ghs_installation567890abcdefghijklmnopqrstuv',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        type: 'installation',
        installation_id: 12345678,
        permissions: {
          contents: 'write',
          metadata: 'read',
          administration: 'write',
        },
        repositories: 'all',
      });
    },
    execute: (service) => service.checkPermissions('testuser'),
    assertions: (result) => {
      expect(result.isValid).toBe(true);
      expect(result.permissions.contents).toBe(true);
      expect(result.permissions.allRepos).toBe(true);
      expect(result.permissions.admin).toBe(true);
    },
  },
  {
    name: 'Check read-only permissions',
    description: 'Should handle installation with read-only permissions',
    category: 'permission',
    setup: (env) => {
      env.storage.set({
        githubAppInstallationId: 12345678,
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/functions/v1/get-installation-token', {
        github_username: 'testuser',
        token: 'ghs_installation567890abcdefghijklmnopqrstuv',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        type: 'installation',
        installation_id: 12345678,
        permissions: {
          contents: 'read',
          metadata: 'read',
        },
        repositories: 'all',
      });
    },
    execute: (service) => service.checkPermissions('testuser'),
    assertions: (result) => {
      expect(result.isValid).toBe(true);
      expect(result.permissions.contents).toBe(false);
      expect(result.permissions.admin).toBe(false);
    },
  },
];

// ===========================
// Error Handling Scenarios
// ===========================

export const errorScenarios: TestScenario[] = [
  {
    name: 'Handle network error',
    description: 'Should handle network failures gracefully',
    category: 'error',
    setup: (env) => {
      env.storage.set({
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/.*/g', () => {
        throw new Error('Network error: Failed to fetch');
      });
    },
    execute: (service) => service.getAccessToken().catch(e => e),
    assertions: (result) => {
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('Network error');
    },
  },
  {
    name: 'Handle missing Supabase token',
    description: 'Should provide clear error when Supabase auth is missing',
    category: 'error',
    setup: (env) => {
      env.storage.clear();
    },
    execute: (service) => service.getAccessToken().catch(e => e),
    assertions: (result) => {
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('No user token available');
      expect(result.message).toContain('authenticate with bolt2github.com');
    },
  },
  {
    name: 'Handle rate limit error',
    description: 'Should handle GitHub API rate limiting',
    category: 'error',
    setup: (env) => {
      env.storage.set({
        githubAppAccessToken: 'ghs_1234567890abcdefghijklmnopqrstuvwxyz12',
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/functions/v1/get-github-token', {
        access_token: 'ghs_1234567890abcdefghijklmnopqrstuvwxyz12',
        github_username: 'testuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: ['repo', 'user:email'],
        type: 'github_app',
        renewed: false,
      });
      env.fetchMock.setResponse('https://api.github.com/user', {
        message: 'API rate limit exceeded',
        documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
      }, 403);
    },
    execute: (service) => service.validateAuth(),
    assertions: (result) => {
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Token validation failed');
    },
  },
];

// ===========================
// Edge Case Scenarios
// ===========================

export const edgeCaseScenarios: TestScenario[] = [
  {
    name: 'Concurrent token renewals',
    description: 'Should handle multiple simultaneous token renewal requests',
    category: 'edge',
    setup: (env) => {
      env.storage.set({
        githubAppExpiresAt: new Date(Date.now() - 3600000).toISOString(),
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      let callCount = 0;
      env.fetchMock.setResponse('/functions/v1/get-github-token', () => {
        callCount++;
        return {
          access_token: `ghs_renewed_${callCount}_${Date.now()}`,
          github_username: 'testuser',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          scopes: ['repo', 'user:email'],
          type: 'github_app',
          renewed: true,
        };
      });
    },
    execute: async (service) => {
      const promises = Array(5).fill(null).map(() => service.getAccessToken());
      return Promise.all(promises);
    },
    assertions: (results) => {
      expect(results).toHaveLength(5);
      // All calls should return a valid token
      results.forEach(result => {
        expect(result.access_token).toMatch(/^ghs_renewed_/);
        expect(result.renewed).toBe(true);
      });
    },
  },
  {
    name: 'Storage quota exceeded',
    description: 'Should handle chrome storage quota errors',
    category: 'edge',
    setup: (env) => {
      const originalSet = env.storage.set;
      env.storage.set = () => Promise.reject(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'));
    },
    execute: (service) => service.storeConfig({
      installationId: 12345678,
      accessToken: 'ghs_'.padEnd(10000, 'x'), // Very large token
    }).catch(e => e),
    assertions: (result) => {
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('Failed to store GitHub App configuration');
    },
  },
  {
    name: 'Malformed API responses',
    description: 'Should handle unexpected API response formats',
    category: 'edge',
    setup: (env) => {
      env.storage.set({
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'sb_access_token_1234567890',
        },
      });
      env.fetchMock.setResponse('/functions/v1/get-github-token', {
        // Missing required fields
        username: 'testuser',
        token: 'ghs_1234567890',
      });
    },
    execute: (service) => service.getAccessToken().catch(e => e),
    assertions: (result) => {
      // Should either handle gracefully or throw appropriate error
      expect(result.access_token || result.message).toBeTruthy();
    },
  },
];

// ===========================
// Test Suite Builder
// ===========================

export function buildTestSuite(scenarios: TestScenario[]) {
  return scenarios.map(scenario => ({
    ...scenario,
    test: async (env: GitHubAppServiceTestEnvironment) => {
      try {
        // Setup
        if (scenario.setup) {
          await scenario.setup(env);
        }

        // Execute
        const result = await scenario.execute(env.service);

        // Assert
        scenario.assertions(result, env);
      } finally {
        // Cleanup
        if (scenario.cleanup) {
          scenario.cleanup(env);
        }
      }
    },
  }));
}

// ===========================
// All Scenarios Export
// ===========================

export const allScenarios = [
  ...authenticationScenarios,
  ...tokenManagementScenarios,
  ...installationScenarios,
  ...permissionScenarios,
  ...errorScenarios,
  ...edgeCaseScenarios,
];

export const scenariosByCategory = {
  auth: authenticationScenarios,
  token: tokenManagementScenarios,
  installation: installationScenarios,
  permission: permissionScenarios,
  error: errorScenarios,
  edge: edgeCaseScenarios,
};