import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  syncGitHubAppFromWebApp,
  checkGitHubAppStatus,
  switchToGitHubApp,
  refreshGitHubAppToken,
  getGitHubAppInfo,
} from '../githubAppSync';
import { SupabaseAuthService } from '../../../content/services/SupabaseAuthService';
import { ChromeStorageService } from '../../services/chromeStorage';

vi.mock('../../services/chromeStorage');
vi.mock('../../../content/services/SupabaseAuthService');

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z');

describe('githubAppSync utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: FIXED_TIME });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('syncGitHubAppFromWebApp', () => {
    it('should return error message when user is not authenticated', async () => {
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: false }),
      } as never);

      const result = await syncGitHubAppFromWebApp();

      expect(result.success).toBe(false);
      expect(result.hasGitHubApp).toBe(false);
      expect(result.message).toBe('Please authenticate with bolt2github.com first');
    });

    it('should return error message when sync fails', async () => {
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: true }),
        syncGitHubApp: async () => false,
      } as never);

      const result = await syncGitHubAppFromWebApp();

      expect(result.success).toBe(false);
      expect(result.hasGitHubApp).toBe(false);
      expect(result.message).toBe('Failed to sync GitHub App. Please check your authentication.');
    });

    it('should return success with GitHub App when sync succeeds and app is found', async () => {
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: true }),
        syncGitHubApp: async () => true,
        hasGitHubApp: async () => true,
      } as never);

      const result = await syncGitHubAppFromWebApp();

      expect(result.success).toBe(true);
      expect(result.hasGitHubApp).toBe(true);
      expect(result.message).toBe('GitHub App synced successfully!');
    });

    it('should return success without GitHub App when sync succeeds but no app found', async () => {
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: true }),
        syncGitHubApp: async () => true,
        hasGitHubApp: async () => false,
      } as never);

      const result = await syncGitHubAppFromWebApp();

      expect(result.success).toBe(true);
      expect(result.hasGitHubApp).toBe(false);
      expect(result.message).toBe(
        'No GitHub App installation found. Please connect GitHub App on bolt2github.com first.'
      );
    });

    it('should return error message when sync throws an error', async () => {
      const errorMessage = 'Network connection failed';
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: true }),
        syncGitHubApp: async () => {
          throw new Error(errorMessage);
        },
      } as never);

      const result = await syncGitHubAppFromWebApp();

      expect(result.success).toBe(false);
      expect(result.hasGitHubApp).toBe(false);
      expect(result.message).toBe(errorMessage);
    });

    it('should handle non-Error exceptions with default message', async () => {
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: true }),
        syncGitHubApp: async () => {
          throw 'string error';
        },
      } as never);

      const result = await syncGitHubAppFromWebApp();

      expect(result.success).toBe(false);
      expect(result.hasGitHubApp).toBe(false);
      expect(result.message).toBe('Unknown error occurred');
    });
  });

  describe('checkGitHubAppStatus', () => {
    it('should return configured status when using GitHub App with installation ID', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');

      const result = await checkGitHubAppStatus();

      expect(result.isConfigured).toBe(true);
      expect(result.username).toBe('testuser');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
      expect(result.installationId).toBe(12345);
    });

    it('should return not configured when using PAT authentication', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('pat');

      const result = await checkGitHubAppStatus();

      expect(result.isConfigured).toBe(false);
      expect(result.username).toBe('testuser');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
      expect(result.installationId).toBe(12345);
    });

    it('should return not configured when installation ID is missing', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');

      const result = await checkGitHubAppStatus();

      expect(result.isConfigured).toBe(false);
      expect(result.username).toBe('testuser');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
      expect(result.installationId).toBeUndefined();
    });

    it('should return minimal status when storage access fails', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockRejectedValue(
        new Error('Storage error')
      );

      const result = await checkGitHubAppStatus();

      expect(result.isConfigured).toBe(false);
      expect(result.username).toBeUndefined();
      expect(result.avatarUrl).toBeUndefined();
      expect(result.installationId).toBeUndefined();
    });
  });

  describe('switchToGitHubApp', () => {
    it('should switch successfully when GitHub App is already configured', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.setAuthenticationMethod).mockResolvedValue(undefined);

      const result = await switchToGitHubApp();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Switched to GitHub App authentication successfully!');
    });

    it('should sync and switch when GitHub App is not configured but available after sync', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({});
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('pat');
      vi.mocked(ChromeStorageService.setAuthenticationMethod).mockResolvedValue(undefined);

      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: true }),
        syncGitHubApp: async () => true,
        hasGitHubApp: async () => true,
      } as never);

      const result = await switchToGitHubApp();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Switched to GitHub App authentication successfully!');
    });

    it('should return error when GitHub App is not found after sync', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({});
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('pat');

      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: true }),
        syncGitHubApp: async () => true,
        hasGitHubApp: async () => false,
      } as never);

      const result = await switchToGitHubApp();

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'GitHub App not found. Please connect GitHub App on bolt2github.com first.'
      );
    });

    it('should return error when storage operation fails', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.setAuthenticationMethod).mockRejectedValue(
        new Error('Storage write failed')
      );

      const result = await switchToGitHubApp();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Storage write failed');
    });

    it('should handle non-Error exceptions from storage operations', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.setAuthenticationMethod).mockRejectedValue('string error');

      const result = await switchToGitHubApp();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to switch authentication method');
    });
  });

  describe('refreshGitHubAppToken', () => {
    it('should refresh token successfully by clearing old token and syncing', async () => {
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockResolvedValue(undefined);
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        syncGitHubApp: async () => true,
      } as never);

      const result = await refreshGitHubAppToken();

      expect(result.success).toBe(true);
      expect(result.message).toBe('GitHub App token refreshed successfully!');
    });

    it('should return error when token refresh sync fails', async () => {
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockResolvedValue(undefined);
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        syncGitHubApp: async () => false,
      } as never);

      const result = await refreshGitHubAppToken();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to refresh GitHub App token. Please re-authenticate.');
    });

    it('should return error message when storage operation fails', async () => {
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockRejectedValue(
        new Error('Storage write failed')
      );

      const result = await refreshGitHubAppToken();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Storage write failed');
    });

    it('should handle non-Error exceptions from storage operations', async () => {
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockRejectedValue('string error');

      const result = await refreshGitHubAppToken();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to refresh token');
    });
  });

  describe('getGitHubAppInfo', () => {
    it('should return complete GitHub App info when configured', async () => {
      const expiresAt = new Date(FIXED_TIME.getTime() + 3600000).toISOString();
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
        expiresAt,
        scopes: ['repo', 'user'],
      });

      const result = await getGitHubAppInfo();

      expect(result.isConfigured).toBe(true);
      expect(result.authMethod).toBe('github_app');
      expect(result.username).toBe('testuser');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
      expect(result.expiresAt).toBe(expiresAt);
      expect(result.scopes).toEqual(['repo', 'user']);
      expect(result.needsRefresh).toBe(false);
    });

    it('should detect when token expires within 5 minutes', async () => {
      const expiresAt = new Date(FIXED_TIME.getTime() + 4 * 60 * 1000).toISOString();
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
        expiresAt,
      });

      const result = await getGitHubAppInfo();

      expect(result.isConfigured).toBe(true);
      expect(result.needsRefresh).toBe(true);
    });

    it('should detect when token has already expired', async () => {
      const expiredTime = new Date(FIXED_TIME.getTime() - 1000).toISOString();
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        expiresAt: expiredTime,
      });

      const result = await getGitHubAppInfo();

      expect(result.isConfigured).toBe(true);
      expect(result.needsRefresh).toBe(true);
    });

    it('should return not configured when using PAT authentication', async () => {
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('pat');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        username: 'testuser',
      });

      const result = await getGitHubAppInfo();

      expect(result.isConfigured).toBe(false);
      expect(result.authMethod).toBe('pat');
      expect(result.username).toBe('testuser');
      expect(result.avatarUrl).toBeUndefined();
      expect(result.expiresAt).toBeUndefined();
      expect(result.scopes).toBeUndefined();
      expect(result.needsRefresh).toBe(false);
    });

    it('should return not configured when installation ID is missing', async () => {
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        username: 'testuser',
      });

      const result = await getGitHubAppInfo();

      expect(result.isConfigured).toBe(false);
      expect(result.authMethod).toBe('github_app');
      expect(result.username).toBe('testuser');
    });

    it('should handle missing expiresAt without error', async () => {
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
      });

      const result = await getGitHubAppInfo();

      expect(result.isConfigured).toBe(true);
      expect(result.needsRefresh).toBe(false);
      expect(result.expiresAt).toBeUndefined();
    });

    it('should return default info when storage access fails', async () => {
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockRejectedValue(
        new Error('Storage error')
      );

      const result = await getGitHubAppInfo();

      expect(result.isConfigured).toBe(false);
      expect(result.authMethod).toBe('pat');
      expect(result.username).toBeUndefined();
      expect(result.avatarUrl).toBeUndefined();
      expect(result.expiresAt).toBeUndefined();
      expect(result.scopes).toBeUndefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent sync operations independently', async () => {
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: true }),
        syncGitHubApp: async () => true,
        hasGitHubApp: async () => true,
      } as never);

      const [result1, result2, result3] = await Promise.all([
        syncGitHubAppFromWebApp(),
        syncGitHubAppFromWebApp(),
        syncGitHubAppFromWebApp(),
      ]);

      expect(result1.success).toBe(true);
      expect(result1.hasGitHubApp).toBe(true);
      expect(result2.success).toBe(true);
      expect(result2.hasGitHubApp).toBe(true);
      expect(result3.success).toBe(true);
      expect(result3.hasGitHubApp).toBe(true);
    });

    it('should handle authentication state changes between calls', async () => {
      let callCount = 0;
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({
          isAuthenticated: callCount++ === 0,
        }),
        syncGitHubApp: async () => false,
      } as never);

      const result1 = await syncGitHubAppFromWebApp();
      const result2 = await syncGitHubAppFromWebApp();

      expect(result1.success).toBe(false);
      expect(result1.message).toBe('Failed to sync GitHub App. Please check your authentication.');
      expect(result2.success).toBe(false);
      expect(result2.message).toBe('Please authenticate with bolt2github.com first');
    });

    it('should clear token when refreshing', async () => {
      const saveConfigMock = vi.mocked(ChromeStorageService.saveGitHubAppConfig);
      saveConfigMock.mockResolvedValue(undefined);
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        syncGitHubApp: async () => true,
      } as never);

      await refreshGitHubAppToken();

      expect(saveConfigMock).toHaveBeenCalledWith({
        accessToken: undefined,
      });
    });

    it('should handle switching when status check fails but sync succeeds', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockRejectedValue(
        new Error('Storage error')
      );
      vi.mocked(ChromeStorageService.setAuthenticationMethod).mockResolvedValue(undefined);

      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue({
        getAuthState: () => ({ isAuthenticated: true }),
        syncGitHubApp: async () => true,
        hasGitHubApp: async () => true,
      } as never);

      const result = await switchToGitHubApp();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Switched to GitHub App authentication successfully!');
    });
  });
});
