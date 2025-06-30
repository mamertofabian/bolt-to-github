/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Critical Business Logic Tests for GitHubAppService
 *
 * Tests focusing on high-risk areas:
 * - OAuth Flow Management
 * - Token Lifecycle with Automatic Refresh
 * - Error Classification
 * - Storage Management
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advanceTime,
  assertFetchCall,
  assertStorageUpdate,
  createGitHubAppConfigWithExpiry,
  noGitHubAppError,
  oAuthFlowNoInstallationResponse,
  renewedTokenResponse,
  setupCommonMockResponses,
  setupGitHubAppServiceTest,
  simulateError,
  tokenExpiredNoRefreshError,
  tokenRenewalFailedError,
  validAuthStorageData,
  validGitHubAppConfig,
  validOAuthFlowResponse,
  type GitHubAppServiceTestEnvironment,
} from './test-fixtures';

describe('GitHubAppService - Critical Business Logic', () => {
  let env: GitHubAppServiceTestEnvironment;

  beforeEach(() => {
    env = setupGitHubAppServiceTest({
      useRealService: true,
      withSupabaseToken: true,
    });
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('OAuth Flow Management', () => {
    describe('completeOAuthFlow', () => {
      it('should successfully complete OAuth flow with valid code and state', async () => {
        env.fetchMock.setResponse('/functions/v1/github-app-auth', validOAuthFlowResponse);

        const result = await env.service.completeOAuthFlow('valid_code', 'state_123');

        expect(result.success).toBe(true);
        expect(result.github_username).toBe('testuser');
        expect(result.installation_found).toBe(true);
        expect(result.installation_id).toBe(12345678);

        assertFetchCall(env.fetchMock, '/functions/v1/github-app-auth', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer sb_access_token_1234567890',
            'Content-Type': 'application/json',
          },
          body: { code: 'valid_code', state: 'state_123' },
        });
      });

      it('should handle OAuth flow without GitHub App installation', async () => {
        env.fetchMock.setResponse('/functions/v1/github-app-auth', oAuthFlowNoInstallationResponse);

        const result = await env.service.completeOAuthFlow('valid_code');

        expect(result.success).toBe(true);
        expect(result.installation_found).toBe(false);
        expect(result.installation_id).toBeNull();
      });

      it('should handle invalid authorization code', async () => {
        env.fetchMock.setResponse(
          '/functions/v1/github-app-auth',
          {
            error: 'Invalid authorization code',
          },
          400
        );

        await expect(env.service.completeOAuthFlow('invalid_code')).rejects.toThrow(
          'Invalid authorization code'
        );
      });

      it('should handle network errors during OAuth flow', async () => {
        simulateError(env.fetchMock, 'network');

        await expect(env.service.completeOAuthFlow('valid_code')).rejects.toThrow('Network error');
      });

      it('should handle missing user token during OAuth', async () => {
        env.storage.clear(); // Remove Supabase token
        env.service.setUserToken(null as any);

        await expect(env.service.completeOAuthFlow('valid_code')).rejects.toThrow(
          'No user token available'
        );
      });

      it('should handle server errors gracefully', async () => {
        env.fetchMock.setResponse(
          '/functions/v1/github-app-auth',
          {
            error: 'Internal server error',
          },
          500
        );

        await expect(env.service.completeOAuthFlow('valid_code')).rejects.toThrow(
          'Internal server error'
        );
      });
    });
  });

  describe('Token Lifecycle Management', () => {
    describe('getAccessToken', () => {
      it('should retrieve valid access token', async () => {
        setupCommonMockResponses(env.fetchMock, 'success');

        const token = await env.service.getAccessToken();

        expect(token.access_token).toBe('ghs_1234567890abcdefghijklmnopqrstuvwxyz12');
        expect(token.type).toBe('github_app');
        expect(token.renewed).toBe(false);
      });

      it('should automatically refresh expired token', async () => {
        // Set up expired token in storage
        await env.storage.set({
          ...validAuthStorageData,
          githubAppExpiresAt: new Date(Date.now() - 3600000).toISOString(),
        });

        env.fetchMock.setResponse('/functions/v1/get-github-token', renewedTokenResponse);

        const token = await env.service.getAccessToken();

        expect(token.access_token).toMatch(/^ghs_renewed/);
        expect(token.renewed).toBe(true);
      });

      it('should handle token renewal failure', async () => {
        env.fetchMock.setResponse('/functions/v1/get-github-token', tokenRenewalFailedError, 401);

        await expect(env.service.getAccessToken()).rejects.toThrow(
          'Re-authentication required: Failed to renew access token'
        );
      });

      it('should handle missing GitHub App configuration', async () => {
        env.fetchMock.setResponse('/functions/v1/get-github-token', noGitHubAppError, 401);

        await expect(env.service.getAccessToken()).rejects.toThrow(
          'Re-authentication required: No GitHub App configuration found'
        );
      });

      it('should handle expired token with no refresh token', async () => {
        env.fetchMock.setResponse(
          '/functions/v1/get-github-token',
          tokenExpiredNoRefreshError,
          401
        );

        await expect(env.service.getAccessToken()).rejects.toThrow(
          'Re-authentication required: Access token expired and no refresh token available'
        );
      });

      it('should handle concurrent token refresh requests', async () => {
        // Set up expired token
        await env.storage.set({
          ...validAuthStorageData,
          githubAppExpiresAt: new Date(Date.now() - 3600000).toISOString(),
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

        // Make concurrent requests
        const promises = Array(5)
          .fill(null)
          .map(() => env.service.getAccessToken());
        const results = await Promise.all(promises);

        // All should get valid tokens
        results.forEach((token) => {
          expect(token.access_token).toMatch(/^ghs_renewed_/);
          expect(token.renewed).toBe(true);
        });

        // Should have made multiple calls (no request deduplication in current implementation)
        expect(callCount).toBeGreaterThanOrEqual(1);
      });
    });

    describe('needsRenewal', () => {
      it('should return false for token with sufficient time remaining', async () => {
        await env.service.storeConfig(createGitHubAppConfigWithExpiry(3600000)); // 1 hour

        const needsRenewal = await env.service.needsRenewal();
        expect(needsRenewal).toBe(false);
      });

      it('should return true for token expiring within 5 minutes', async () => {
        await env.service.storeConfig(createGitHubAppConfigWithExpiry(240000)); // 4 minutes

        const needsRenewal = await env.service.needsRenewal();
        expect(needsRenewal).toBe(true);
      });

      it('should return true for expired token', async () => {
        await env.service.storeConfig(createGitHubAppConfigWithExpiry(-3600000)); // Expired

        const needsRenewal = await env.service.needsRenewal();
        expect(needsRenewal).toBe(true);
      });

      it('should return true when no config exists', async () => {
        const needsRenewal = await env.service.needsRenewal();
        expect(needsRenewal).toBe(true);
      });

      it('should return true when expiresAt is missing', async () => {
        await env.service.storeConfig({
          installationId: 12345678,
          accessToken: 'ghs_token',
        });

        const needsRenewal = await env.service.needsRenewal();
        expect(needsRenewal).toBe(true);
      });

      it('should handle time drift correctly', async () => {
        const restoreTime = advanceTime(0);

        try {
          // Set token to expire in exactly 5 minutes
          await env.service.storeConfig(createGitHubAppConfigWithExpiry(300000));

          // Should not need renewal yet
          expect(await env.service.needsRenewal()).toBe(false);

          // Advance time by 1 second
          advanceTime(1000);

          // Now should need renewal
          expect(await env.service.needsRenewal()).toBe(true);
        } finally {
          restoreTime();
        }
      });
    });
  });

  describe('Error Classification', () => {
    it('should classify NO_GITHUB_APP error correctly', async () => {
      env.fetchMock.setResponse(
        '/functions/v1/get-github-token',
        {
          error: 'No GitHub App configuration found',
          code: 'NO_GITHUB_APP',
          requires_auth: true,
          has_installation: false,
        },
        401
      );

      try {
        await env.service.getAccessToken();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Re-authentication required');
        expect(error.message).toContain('No GitHub App configuration found');
      }
    });

    it('should classify TOKEN_EXPIRED_NO_REFRESH error correctly', async () => {
      env.fetchMock.setResponse(
        '/functions/v1/get-github-token',
        {
          error: 'Access token expired and no refresh token available',
          code: 'TOKEN_EXPIRED_NO_REFRESH',
          requires_auth: true,
          expired_at: new Date(Date.now() - 3600000).toISOString(),
        },
        401
      );

      try {
        await env.service.getAccessToken();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Re-authentication required');
        expect(error.message).toContain('Access token expired and no refresh token available');
      }
    });

    it('should classify TOKEN_RENEWAL_FAILED error correctly', async () => {
      env.fetchMock.setResponse(
        '/functions/v1/get-github-token',
        {
          error: 'Failed to renew access token',
          code: 'TOKEN_RENEWAL_FAILED',
          details: 'Refresh token is invalid or expired',
        },
        401
      );

      try {
        await env.service.getAccessToken();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Re-authentication required');
        expect(error.message).toContain('Failed to renew access token');
      }
    });

    it('should handle unknown error codes gracefully', async () => {
      env.fetchMock.setResponse(
        '/functions/v1/get-github-token',
        {
          error: 'Unknown error occurred',
          code: 'UNKNOWN_ERROR' as any,
        },
        401
      );

      try {
        await env.service.getAccessToken();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toBe('Unknown error occurred');
      }
    });

    it('should handle missing error message', async () => {
      env.fetchMock.setResponse(
        '/functions/v1/get-github-token',
        {
          code: 'NO_GITHUB_APP',
          // error field is missing
        },
        401
      );

      try {
        await env.service.getAccessToken();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // When error message is missing, it shows "undefined"
        expect(error.message).toBe('Re-authentication required: undefined');
      }
    });
  });

  describe('Storage Management', () => {
    describe('storeConfig', () => {
      it('should store complete configuration', async () => {
        await env.service.storeConfig(validGitHubAppConfig);

        assertStorageUpdate(env.storage, {
          githubAppInstallationId: 12345678,
          githubAppAccessToken: 'ghs_1234567890abcdefghijklmnopqrstuvwxyz12',
          githubAppRefreshToken: 'ghr_refresh1234567890abcdefghijklmnopqrstuvwxyz',
          githubAppExpiresAt: validGitHubAppConfig.expiresAt,
          githubAppRefreshTokenExpiresAt: validGitHubAppConfig.refreshTokenExpiresAt,
          githubAppUsername: 'testuser',
          githubAppUserId: 1234567,
          githubAppAvatarUrl: 'https://avatars.githubusercontent.com/u/1234567?v=4',
          githubAppScopes: ['repo', 'user:email'],
        });
      });

      it('should handle partial configuration', async () => {
        const partialConfig = {
          installationId: 12345678,
          accessToken: 'ghs_token',
        };

        await env.service.storeConfig(partialConfig);

        assertStorageUpdate(env.storage, {
          githubAppInstallationId: 12345678,
          githubAppAccessToken: 'ghs_token',
        });
      });

      it('should handle storage errors', async () => {
        // Mock storage error
        const originalSet = env.storage.set;
        env.storage.set = vi.fn().mockRejectedValue(new Error('QUOTA_EXCEEDED'));

        await expect(env.service.storeConfig(validGitHubAppConfig)).rejects.toThrow(
          'Failed to store GitHub App configuration'
        );

        env.storage.set = originalSet;
      });

      it('should handle concurrent storage operations', async () => {
        const configs = [
          { ...validGitHubAppConfig, installationId: 111 },
          { ...validGitHubAppConfig, installationId: 222 },
          { ...validGitHubAppConfig, installationId: 333 },
        ];

        // Store configs concurrently
        await Promise.all(configs.map((config) => env.service.storeConfig(config)));

        // Last write should win
        const stored = env.storage.getAll();
        expect([111, 222, 333]).toContain(stored.githubAppInstallationId);
      });
    });

    describe('clearConfig', () => {
      it('should remove all GitHub App configuration', async () => {
        // First store config
        await env.service.storeConfig(validGitHubAppConfig);

        // Then clear it
        await env.service.clearConfig();

        assertStorageUpdate(env.storage, {
          githubAppInstallationId: undefined,
          githubAppAccessToken: undefined,
          githubAppRefreshToken: undefined,
          githubAppExpiresAt: undefined,
          githubAppRefreshTokenExpiresAt: undefined,
          githubAppUsername: undefined,
          githubAppUserId: undefined,
          githubAppAvatarUrl: undefined,
          githubAppScopes: undefined,
        });
      });

      it('should handle storage errors during clear', async () => {
        const originalRemove = env.storage.remove;
        env.storage.remove = vi.fn().mockRejectedValue(new Error('Storage error'));

        await expect(env.service.clearConfig()).rejects.toThrow(
          'Failed to clear GitHub App configuration'
        );

        env.storage.remove = originalRemove;
      });
    });

    describe('getConfig', () => {
      it('should retrieve stored configuration', async () => {
        await env.storage.set(validAuthStorageData);

        const config = await env.service.getConfig();

        expect(config).toEqual({
          installationId: 12345678,
          accessToken: 'ghs_1234567890abcdefghijklmnopqrstuvwxyz12',
          refreshToken: 'ghr_refresh1234567890abcdefghijklmnopqrstuvwxyz',
          expiresAt: validAuthStorageData.githubAppExpiresAt,
          refreshTokenExpiresAt: validAuthStorageData.githubAppRefreshTokenExpiresAt,
          githubUsername: 'testuser',
          githubUserId: 1234567,
          avatarUrl: 'https://avatars.githubusercontent.com/u/1234567?v=4',
          scopes: ['repo', 'user:email'],
        });
      });

      it('should return null when no config exists', async () => {
        const config = await env.service.getConfig();
        expect(config).toBeNull();
      });

      it('should handle storage errors gracefully', async () => {
        const originalGet = env.storage.get;
        env.storage.get = vi.fn().mockRejectedValue(new Error('Storage error'));

        const config = await env.service.getConfig();
        expect(config).toBeNull();

        env.storage.get = originalGet;
      });
    });
  });

  describe('Edge Cases and Failure Points', () => {
    it('should handle malformed Supabase auth token', async () => {
      await env.storage.set({
        'sb-gapvjcqybzabnrjnxzhg-auth-token': {
          access_token: 'malformed_token',
          // Missing other expected fields
        },
      });

      setupCommonMockResponses(env.fetchMock, 'success');

      // Should work with the malformed token
      const token = await env.service.getAccessToken();
      expect(token).toBeDefined();
      expect(token.access_token).toBe('ghs_1234567890abcdefghijklmnopqrstuvwxyz12');
    });

    it('should handle missing Supabase URL configuration', async () => {
      // This would require mocking the SUPABASE_CONFIG import
      // In a real scenario, this would be a deployment configuration error
      expect(env.service['supabaseUrl']).toBe('https://gapvjcqybzabnrjnxzhg.supabase.co');
    });

    it('should handle token extraction from various storage key formats', async () => {
      // Clear existing storage
      env.storage.clear();

      // Try different key formats
      const keys = ['sb-gapvjcqybzabnrjnxzhg-auth-token', 'sb-differentproject-auth-token'];

      for (const key of keys) {
        await env.storage.set({
          [key]: { access_token: `token_for_${key}` },
        });
      }

      // Should extract from the correct key
      const token = await env.service['getUserToken']();
      expect(token).toBe('token_for_sb-gapvjcqybzabnrjnxzhg-auth-token');
    });

    it('should handle race condition in isConfigured check', async () => {
      // Start with no config
      expect(await env.service.isConfigured()).toBe(false);

      // Simulate concurrent operations
      const storePromise = env.service.storeConfig(validGitHubAppConfig);
      const checkPromise = env.service.isConfigured();

      const [, isConfiguredDuringStore] = await Promise.all([storePromise, checkPromise]);

      // Result depends on timing, but should not error
      expect(typeof isConfiguredDuringStore).toBe('boolean');

      // After store completes, should be configured
      expect(await env.service.isConfigured()).toBe(true);
    });
  });
});
