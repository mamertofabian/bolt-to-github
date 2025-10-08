import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  syncGitHubAppFromWebApp,
  checkGitHubAppStatus,
  switchToGitHubApp,
  refreshGitHubAppToken,
  getGitHubAppInfo,
} from '../githubAppSync';
import { SupabaseAuthService } from '../../../content/services/SupabaseAuthService';
import { ChromeStorageService } from '../../services/chromeStorage';

vi.mock('../../../content/services/SupabaseAuthService');
vi.mock('../../services/chromeStorage');
vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('githubAppSync utilities', () => {
  let mockAuthService: {
    getAuthState: ReturnType<typeof vi.fn>;
    syncGitHubApp: ReturnType<typeof vi.fn>;
    hasGitHubApp: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthService = {
      getAuthState: vi.fn(),
      syncGitHubApp: vi.fn(),
      hasGitHubApp: vi.fn(),
    };

    vi.mocked(SupabaseAuthService.getInstance).mockReturnValue(
      mockAuthService as unknown as SupabaseAuthService
    );
  });

  describe('syncGitHubAppFromWebApp', () => {
    it('should return error when user is not authenticated', async () => {
      mockAuthService.getAuthState.mockReturnValue({
        isAuthenticated: false,
      });

      const result = await syncGitHubAppFromWebApp();

      expect(result).toEqual({
        success: false,
        hasGitHubApp: false,
        message: 'Please authenticate with bolt2github.com first',
      });
      expect(mockAuthService.syncGitHubApp).not.toHaveBeenCalled();
    });

    it('should return error when sync fails', async () => {
      mockAuthService.getAuthState.mockReturnValue({
        isAuthenticated: true,
      });
      mockAuthService.syncGitHubApp.mockResolvedValue(false);

      const result = await syncGitHubAppFromWebApp();

      expect(result).toEqual({
        success: false,
        hasGitHubApp: false,
        message: 'Failed to sync GitHub App. Please check your authentication.',
      });
      expect(mockAuthService.syncGitHubApp).toHaveBeenCalledTimes(1);
    });

    it('should return success when GitHub App is found and synced', async () => {
      mockAuthService.getAuthState.mockReturnValue({
        isAuthenticated: true,
      });
      mockAuthService.syncGitHubApp.mockResolvedValue(true);
      mockAuthService.hasGitHubApp.mockResolvedValue(true);

      const result = await syncGitHubAppFromWebApp();

      expect(result).toEqual({
        success: true,
        hasGitHubApp: true,
        message: 'GitHub App synced successfully!',
      });
      expect(mockAuthService.syncGitHubApp).toHaveBeenCalledTimes(1);
      expect(mockAuthService.hasGitHubApp).toHaveBeenCalledTimes(1);
    });

    it('should return success with no GitHub App when sync succeeds but no app found', async () => {
      mockAuthService.getAuthState.mockReturnValue({
        isAuthenticated: true,
      });
      mockAuthService.syncGitHubApp.mockResolvedValue(true);
      mockAuthService.hasGitHubApp.mockResolvedValue(false);

      const result = await syncGitHubAppFromWebApp();

      expect(result).toEqual({
        success: true,
        hasGitHubApp: false,
        message:
          'No GitHub App installation found. Please connect GitHub App on bolt2github.com first.',
      });
    });

    it('should handle errors during sync and return error message', async () => {
      const errorMessage = 'Network error';
      mockAuthService.getAuthState.mockReturnValue({
        isAuthenticated: true,
      });
      mockAuthService.syncGitHubApp.mockRejectedValue(new Error(errorMessage));

      const result = await syncGitHubAppFromWebApp();

      expect(result).toEqual({
        success: false,
        hasGitHubApp: false,
        message: errorMessage,
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockAuthService.getAuthState.mockReturnValue({
        isAuthenticated: true,
      });
      mockAuthService.syncGitHubApp.mockRejectedValue('string error');

      const result = await syncGitHubAppFromWebApp();

      expect(result).toEqual({
        success: false,
        hasGitHubApp: false,
        message: 'Unknown error occurred',
      });
    });
  });

  describe('checkGitHubAppStatus', () => {
    it('should return configured status when GitHub App is set up', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');

      const result = await checkGitHubAppStatus();

      expect(result).toEqual({
        isConfigured: true,
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
        installationId: 12345,
      });
    });

    it('should return not configured when using PAT authentication', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('pat');

      const result = await checkGitHubAppStatus();

      expect(result).toEqual({
        isConfigured: false,
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
        installationId: 12345,
      });
    });

    it('should return not configured when installation ID is missing', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');

      const result = await checkGitHubAppStatus();

      expect(result).toEqual({
        isConfigured: false,
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
        installationId: undefined,
      });
    });

    it('should handle errors and return not configured status', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockRejectedValue(
        new Error('Storage error')
      );

      const result = await checkGitHubAppStatus();

      expect(result).toEqual({
        isConfigured: false,
      });
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

      expect(result).toEqual({
        success: true,
        message: 'Switched to GitHub App authentication successfully!',
      });
      expect(ChromeStorageService.setAuthenticationMethod).toHaveBeenCalledWith('github_app');
    });

    it('should sync and switch when GitHub App is not configured but available', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({});
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('pat');
      vi.mocked(ChromeStorageService.setAuthenticationMethod).mockResolvedValue(undefined);

      mockAuthService.getAuthState.mockReturnValue({ isAuthenticated: true });
      mockAuthService.syncGitHubApp.mockResolvedValue(true);
      mockAuthService.hasGitHubApp.mockResolvedValue(true);

      const result = await switchToGitHubApp();

      expect(result).toEqual({
        success: true,
        message: 'Switched to GitHub App authentication successfully!',
      });
      expect(mockAuthService.syncGitHubApp).toHaveBeenCalledTimes(1);
    });

    it('should return error when GitHub App is not found after sync', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({});
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('pat');

      mockAuthService.getAuthState.mockReturnValue({ isAuthenticated: true });
      mockAuthService.syncGitHubApp.mockResolvedValue(true);
      mockAuthService.hasGitHubApp.mockResolvedValue(false);

      const result = await switchToGitHubApp();

      expect(result).toEqual({
        success: false,
        message: 'GitHub App not found. Please connect GitHub App on bolt2github.com first.',
      });
      expect(ChromeStorageService.setAuthenticationMethod).not.toHaveBeenCalled();
    });

    it('should handle errors during status check and attempt sync', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockRejectedValue(
        new Error('Storage error')
      );

      mockAuthService.getAuthState.mockReturnValue({ isAuthenticated: true });
      mockAuthService.syncGitHubApp.mockResolvedValue(false);

      const result = await switchToGitHubApp();

      expect(result).toEqual({
        success: false,
        message: 'GitHub App not found. Please connect GitHub App on bolt2github.com first.',
      });
    });

    it('should handle errors from setAuthenticationMethod', async () => {
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
      });
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.setAuthenticationMethod).mockRejectedValue('string error');

      const result = await switchToGitHubApp();

      expect(result).toEqual({
        success: false,
        message: 'Failed to switch authentication method',
      });
    });
  });

  describe('refreshGitHubAppToken', () => {
    it('should refresh token successfully', async () => {
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockResolvedValue(undefined);
      mockAuthService.syncGitHubApp.mockResolvedValue(true);

      const result = await refreshGitHubAppToken();

      expect(result).toEqual({
        success: true,
        message: 'GitHub App token refreshed successfully!',
      });
      expect(ChromeStorageService.saveGitHubAppConfig).toHaveBeenCalledWith({
        accessToken: undefined,
      });
      expect(mockAuthService.syncGitHubApp).toHaveBeenCalledTimes(1);
    });

    it('should return error when token refresh fails', async () => {
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockResolvedValue(undefined);
      mockAuthService.syncGitHubApp.mockResolvedValue(false);

      const result = await refreshGitHubAppToken();

      expect(result).toEqual({
        success: false,
        message: 'Failed to refresh GitHub App token. Please re-authenticate.',
      });
    });

    it('should handle errors during token refresh', async () => {
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockRejectedValue(
        new Error('Storage error')
      );

      const result = await refreshGitHubAppToken();

      expect(result).toEqual({
        success: false,
        message: 'Storage error',
      });
    });

    it('should handle non-Error exceptions during refresh', async () => {
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockRejectedValue('string error');

      const result = await refreshGitHubAppToken();

      expect(result).toEqual({
        success: false,
        message: 'Failed to refresh token',
      });
    });
  });

  describe('getGitHubAppInfo', () => {
    it('should return complete GitHub App info when configured', async () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
        expiresAt,
        scopes: ['repo', 'user'],
      });

      const result = await getGitHubAppInfo();

      expect(result).toEqual({
        isConfigured: true,
        authMethod: 'github_app',
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.png',
        expiresAt,
        scopes: ['repo', 'user'],
        needsRefresh: false,
      });
    });

    it('should detect when token needs refresh (within 5 minutes)', async () => {
      const expiresAt = new Date(Date.now() + 4 * 60 * 1000).toISOString();
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
        expiresAt,
      });

      const result = await getGitHubAppInfo();

      expect(result.needsRefresh).toBe(true);
    });

    it('should return not configured when using PAT', async () => {
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('pat');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        username: 'testuser',
      });

      const result = await getGitHubAppInfo();

      expect(result).toEqual({
        isConfigured: false,
        authMethod: 'pat',
        username: 'testuser',
        avatarUrl: undefined,
        expiresAt: undefined,
        scopes: undefined,
        needsRefresh: false,
      });
    });

    it('should return not configured when installation ID is missing', async () => {
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        username: 'testuser',
      });

      const result = await getGitHubAppInfo();

      expect(result.isConfigured).toBe(false);
    });

    it('should handle missing expiresAt without error', async () => {
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        username: 'testuser',
      });

      const result = await getGitHubAppInfo();

      expect(result.needsRefresh).toBe(false);
      expect(result.expiresAt).toBeUndefined();
    });

    it('should handle errors and return default info', async () => {
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockRejectedValue(
        new Error('Storage error')
      );

      const result = await getGitHubAppInfo();

      expect(result).toEqual({
        isConfigured: false,
        authMethod: 'pat',
      });
    });
  });

  describe('edge cases and integration scenarios', () => {
    it('should handle concurrent sync operations gracefully', async () => {
      mockAuthService.getAuthState.mockReturnValue({ isAuthenticated: true });
      mockAuthService.syncGitHubApp.mockResolvedValue(true);
      mockAuthService.hasGitHubApp.mockResolvedValue(true);

      const results = await Promise.all([
        syncGitHubAppFromWebApp(),
        syncGitHubAppFromWebApp(),
        syncGitHubAppFromWebApp(),
      ]);

      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.hasGitHubApp).toBe(true);
      });
    });

    it('should handle authentication state changes during operations', async () => {
      mockAuthService.getAuthState
        .mockReturnValueOnce({ isAuthenticated: true })
        .mockReturnValueOnce({ isAuthenticated: false });

      const result1 = await syncGitHubAppFromWebApp();
      const result2 = await syncGitHubAppFromWebApp();

      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
    });

    it('should handle expired tokens with appropriate refresh flag', async () => {
      const expiredTime = new Date(Date.now() - 1000).toISOString();
      vi.mocked(ChromeStorageService.getAuthenticationMethod).mockResolvedValue('github_app');
      vi.mocked(ChromeStorageService.getGitHubAppConfig).mockResolvedValue({
        installationId: 12345,
        expiresAt: expiredTime,
      });

      const result = await getGitHubAppInfo();

      expect(result.needsRefresh).toBe(true);
    });

    it('should verify token clearing during refresh', async () => {
      vi.mocked(ChromeStorageService.saveGitHubAppConfig).mockResolvedValue(undefined);
      mockAuthService.syncGitHubApp.mockResolvedValue(true);

      await refreshGitHubAppToken();

      expect(ChromeStorageService.saveGitHubAppConfig).toHaveBeenCalledWith({
        accessToken: undefined,
      });
    });
  });
});
