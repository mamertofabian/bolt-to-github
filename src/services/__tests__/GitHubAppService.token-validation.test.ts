/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setupGitHubAppServiceTest,
  FIXED_TIME,
  type GitHubAppServiceTestEnvironment,
} from './test-fixtures';

describe('GitHubAppService - Token Validation & Expiry', () => {
  let env: GitHubAppServiceTestEnvironment;

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });
    env = setupGitHubAppServiceTest({
      useRealService: true,
      withSupabaseToken: true,
    });
  });

  afterEach(() => {
    env.cleanup();
    vi.useRealTimers();
  });

  describe('getUserToken expiry validation', () => {
    it('should prefer managed supabaseToken when valid', async () => {
      const authKey = `sb-gapvjcqybzabnrjnxzhg-auth-token`;
      env.storage.set({
        [authKey]: {
          access_token: 'old_auth_key_token',
        },
        supabaseToken: 'fresh_managed_token',
        supabaseTokenExpiry: FIXED_TIME + 5 * 60 * 1000, // expires in 5 min
      });

      const token = await (env.service as any).getUserToken();
      expect(token).toBe('fresh_managed_token');
    });

    it('should fall back to auth-key token when supabaseToken is expired', async () => {
      const authKey = `sb-gapvjcqybzabnrjnxzhg-auth-token`;
      env.storage.set({
        [authKey]: {
          access_token: 'auth_key_token',
        },
        supabaseToken: 'expired_managed_token',
        supabaseTokenExpiry: FIXED_TIME - 1000, // already expired
        refreshTokenIssuedAt: FIXED_TIME - 5 * 24 * 60 * 60 * 1000, // 5 days ago (within 30d)
      });

      const token = await (env.service as any).getUserToken();
      expect(token).toBe('auth_key_token');
    });

    it('should throw when refresh token is older than 30 days', async () => {
      const authKey = `sb-gapvjcqybzabnrjnxzhg-auth-token`;
      env.storage.set({
        [authKey]: {
          access_token: 'some_token',
        },
        supabaseToken: 'expired_token',
        supabaseTokenExpiry: FIXED_TIME - 1000, // expired
        refreshTokenIssuedAt: FIXED_TIME - 31 * 24 * 60 * 60 * 1000, // 31 days ago
      });

      await expect((env.service as any).getUserToken()).rejects.toThrow(
        'Supabase authentication expired'
      );
    });

    it('should allow through when refreshTokenIssuedAt is missing (legacy)', async () => {
      const authKey = `sb-gapvjcqybzabnrjnxzhg-auth-token`;
      env.storage.set({
        [authKey]: {
          access_token: 'legacy_token',
        },
        supabaseToken: 'expired_token',
        supabaseTokenExpiry: FIXED_TIME - 1000, // expired
        // No refreshTokenIssuedAt — legacy installation
      });

      const token = await (env.service as any).getUserToken();
      expect(token).toBe('legacy_token');
    });

    it('should not cache userToken in instance (always read fresh)', async () => {
      const authKey = `sb-gapvjcqybzabnrjnxzhg-auth-token`;
      env.storage.set({
        [authKey]: {
          access_token: 'first_token',
        },
        supabaseToken: 'first_managed_token',
        supabaseTokenExpiry: FIXED_TIME + 5 * 60 * 1000,
      });

      const token1 = await (env.service as any).getUserToken();
      expect(token1).toBe('first_managed_token');

      // Update storage with a new token (simulating SupabaseAuthService refresh)
      env.storage.set({
        supabaseToken: 'refreshed_managed_token',
        supabaseTokenExpiry: FIXED_TIME + 60 * 60 * 1000,
      });

      const token2 = await (env.service as any).getUserToken();
      expect(token2).toBe('refreshed_managed_token');
    });

    it('should throw when no tokens are available', async () => {
      env.storage.clear();

      await expect((env.service as any).getUserToken()).rejects.toThrow('No user token available');
    });
  });
});
