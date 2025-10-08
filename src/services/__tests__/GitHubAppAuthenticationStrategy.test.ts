import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { GitHubAppAuthenticationStrategy } from '../GitHubAppAuthenticationStrategy';
import { GitHubAppService } from '../GitHubAppService';
import type {
  GitHubAppConfig,
  GitHubAppTokenResponse,
  TokenValidationResult,
  PermissionCheckResult,
} from '../types/authentication';

vi.mock('../GitHubAppService');

describe('GitHubAppAuthenticationStrategy', () => {
  let strategy: GitHubAppAuthenticationStrategy;
  let mockGitHubAppService: {
    isConfigured: ReturnType<typeof vi.fn>;
    getAccessToken: ReturnType<typeof vi.fn>;
    validateAuth: ReturnType<typeof vi.fn>;
    checkPermissions: ReturnType<typeof vi.fn>;
    clearConfig: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
    storeConfig: ReturnType<typeof vi.fn>;
    needsRenewal: ReturnType<typeof vi.fn>;
    setUserToken: ReturnType<typeof vi.fn>;
    completeOAuthFlow: ReturnType<typeof vi.fn>;
    generateOAuthUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGitHubAppService = {
      isConfigured: vi.fn(),
      getAccessToken: vi.fn(),
      validateAuth: vi.fn(),
      checkPermissions: vi.fn(),
      clearConfig: vi.fn(),
      getConfig: vi.fn(),
      storeConfig: vi.fn(),
      needsRenewal: vi.fn(),
      setUserToken: vi.fn(),
      completeOAuthFlow: vi.fn(),
      generateOAuthUrl: vi.fn(),
    };

    vi.mocked(GitHubAppService).mockImplementation(
      () => mockGitHubAppService as unknown as GitHubAppService
    );

    strategy = new GitHubAppAuthenticationStrategy();

    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('type property', () => {
    it('should return "github_app" as the authentication type', () => {
      expect(strategy.type).toBe('github_app');
    });
  });

  describe('isConfigured', () => {
    it('should delegate to GitHubAppService.isConfigured', async () => {
      mockGitHubAppService.isConfigured.mockResolvedValue(true);

      const result = await strategy.isConfigured();

      expect(result).toBe(true);
      expect(mockGitHubAppService.isConfigured).toHaveBeenCalledTimes(1);
    });

    it('should return false when not configured', async () => {
      mockGitHubAppService.isConfigured.mockResolvedValue(false);

      const result = await strategy.isConfigured();

      expect(result).toBe(false);
    });
  });

  describe('getToken', () => {
    const mockTokenResponse: GitHubAppTokenResponse = {
      access_token: 'ghu_token123',
      github_username: 'testuser',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      scopes: ['repo', 'user'],
      type: 'github_app',
      renewed: false,
    };

    it('should fetch and cache a valid token', async () => {
      mockGitHubAppService.getAccessToken.mockResolvedValue(mockTokenResponse);

      const token = await strategy.getToken();

      expect(token).toBe('ghu_token123');
      expect(mockGitHubAppService.getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should return cached token when still valid', async () => {
      mockGitHubAppService.getAccessToken.mockResolvedValue(mockTokenResponse);

      const token1 = await strategy.getToken();
      const token2 = await strategy.getToken();

      expect(token1).toBe(token2);
      expect(mockGitHubAppService.getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should fetch new token when cached token is expired', async () => {
      const expiredTokenResponse: GitHubAppTokenResponse = {
        ...mockTokenResponse,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      };

      mockGitHubAppService.getAccessToken
        .mockResolvedValueOnce(expiredTokenResponse)
        .mockResolvedValueOnce(mockTokenResponse);

      const token1 = await strategy.getToken();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const token2 = await strategy.getToken();

      expect(token1).toBe('ghu_token123');
      expect(token2).toBe('ghu_token123');
      expect(mockGitHubAppService.getAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should throw error with re-authentication message when token renewal required', async () => {
      mockGitHubAppService.getAccessToken.mockRejectedValue(
        new Error('Re-authentication required')
      );

      await expect(strategy.getToken()).rejects.toThrow(
        'GitHub App authentication expired. Please re-authenticate via bolt2github.com'
      );
    });

    it('should clear cache and throw error on failure', async () => {
      mockGitHubAppService.getAccessToken.mockRejectedValue(new Error('Network error'));

      await expect(strategy.getToken()).rejects.toThrow(
        'Failed to get GitHub App token: Network error'
      );

      mockGitHubAppService.getAccessToken.mockResolvedValue(mockTokenResponse);
      await strategy.getToken();

      expect(mockGitHubAppService.getAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should handle unknown error types', async () => {
      mockGitHubAppService.getAccessToken.mockRejectedValue('Unknown error');

      await expect(strategy.getToken()).rejects.toThrow(
        'Failed to get GitHub App token: Unknown error'
      );
    });
  });

  describe('validateAuth', () => {
    const mockValidationResult: TokenValidationResult = {
      isValid: true,
      userInfo: {
        login: 'testuser',
        id: 12345,
        avatar_url: 'https://avatar.url',
      },
      type: 'github_app',
      scopes: ['repo', 'user'],
    };

    it('should delegate to GitHubAppService.validateAuth', async () => {
      mockGitHubAppService.validateAuth.mockResolvedValue(mockValidationResult);

      const result = await strategy.validateAuth();

      expect(result).toEqual(mockValidationResult);
      expect(mockGitHubAppService.validateAuth).toHaveBeenCalledTimes(1);
    });

    it('should ignore username parameter', async () => {
      mockGitHubAppService.validateAuth.mockResolvedValue(mockValidationResult);

      await strategy.validateAuth('someusername');

      expect(mockGitHubAppService.validateAuth).toHaveBeenCalledWith();
    });

    it('should return error result when validation fails', async () => {
      mockGitHubAppService.validateAuth.mockRejectedValue(new Error('Validation failed'));

      const result = await strategy.validateAuth();

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Validation failed');
    });

    it('should handle unknown error types in validation', async () => {
      mockGitHubAppService.validateAuth.mockRejectedValue('Unknown error');

      const result = await strategy.validateAuth();

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('GitHub App validation failed');
    });
  });

  describe('checkPermissions', () => {
    const mockPermissionResult: PermissionCheckResult = {
      isValid: true,
      permissions: {
        allRepos: true,
        admin: true,
        contents: true,
      },
    };

    it('should delegate to GitHubAppService.checkPermissions', async () => {
      mockGitHubAppService.checkPermissions.mockResolvedValue(mockPermissionResult);

      const result = await strategy.checkPermissions('testowner');

      expect(result).toEqual(mockPermissionResult);
      expect(mockGitHubAppService.checkPermissions).toHaveBeenCalledWith('testowner');
    });

    it('should return error result with false permissions on failure', async () => {
      mockGitHubAppService.checkPermissions.mockRejectedValue(new Error('Permission check failed'));

      const result = await strategy.checkPermissions('testowner');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Permission check failed');
      expect(result.permissions).toEqual({
        allRepos: false,
        admin: false,
        contents: false,
      });
    });

    it('should handle unknown error types in permission check', async () => {
      mockGitHubAppService.checkPermissions.mockRejectedValue('Unknown error');

      const result = await strategy.checkPermissions('testowner');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Permission check failed');
    });
  });

  describe('refreshToken', () => {
    const mockTokenResponse: GitHubAppTokenResponse = {
      access_token: 'ghu_new_token456',
      github_username: 'testuser',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      scopes: ['repo', 'user'],
      type: 'github_app',
      renewed: true,
    };

    it('should clear cached token and fetch new one', async () => {
      mockGitHubAppService.getAccessToken
        .mockResolvedValueOnce({
          ...mockTokenResponse,
          access_token: 'ghu_old_token',
        })
        .mockResolvedValueOnce(mockTokenResponse);

      const oldToken = await strategy.getToken();
      const newToken = await strategy.refreshToken();

      expect(oldToken).toBe('ghu_old_token');
      expect(newToken).toBe('ghu_new_token456');
      expect(mockGitHubAppService.getAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should throw error when refresh fails', async () => {
      mockGitHubAppService.getAccessToken.mockRejectedValue(new Error('Refresh failed'));

      await expect(strategy.refreshToken()).rejects.toThrow(
        'Failed to refresh GitHub App token: Refresh failed'
      );
    });

    it('should handle unknown error types during refresh', async () => {
      mockGitHubAppService.getAccessToken.mockRejectedValue('Unknown error');

      await expect(strategy.refreshToken()).rejects.toThrow(
        'Failed to refresh GitHub App token: Unknown error'
      );
    });
  });

  describe('clearAuth', () => {
    it('should clear GitHub App config and cached token', async () => {
      mockGitHubAppService.clearConfig.mockResolvedValue(undefined);

      await strategy.clearAuth();

      expect(mockGitHubAppService.clearConfig).toHaveBeenCalledTimes(1);
    });

    it('should clear cache even if clearConfig succeeds', async () => {
      const mockTokenResponse: GitHubAppTokenResponse = {
        access_token: 'ghu_token123',
        github_username: 'testuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: ['repo', 'user'],
        type: 'github_app',
        renewed: false,
      };

      mockGitHubAppService.getAccessToken.mockResolvedValue(mockTokenResponse);
      mockGitHubAppService.clearConfig.mockResolvedValue(undefined);

      await strategy.getToken();
      await strategy.clearAuth();
      await strategy.getToken();

      expect(mockGitHubAppService.getAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should throw error when clearConfig fails', async () => {
      mockGitHubAppService.clearConfig.mockRejectedValue(new Error('Clear failed'));

      await expect(strategy.clearAuth()).rejects.toThrow(
        'Failed to clear GitHub App authentication'
      );
    });
  });

  describe('getUserInfo', () => {
    const mockConfig: GitHubAppConfig = {
      installationId: 12345,
      accessToken: 'token123',
      githubUsername: 'configuser',
      githubUserId: 67890,
      avatarUrl: 'https://avatar.from.config',
    };

    it('should return user info from config when available', async () => {
      mockGitHubAppService.getConfig.mockResolvedValue(mockConfig);

      const userInfo = await strategy.getUserInfo();

      expect(userInfo).toEqual({
        login: 'configuser',
        id: 67890,
        avatar_url: 'https://avatar.from.config',
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch from API when config is incomplete', async () => {
      mockGitHubAppService.getConfig.mockResolvedValue({
        installationId: 12345,
      });
      mockGitHubAppService.getAccessToken.mockResolvedValue({
        access_token: 'token123',
        github_username: 'apiuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: [],
        type: 'github_app',
        renewed: false,
      });

      const mockApiResponse = {
        login: 'apiuser',
        id: 11111,
        avatar_url: 'https://avatar.from.api',
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      const userInfo = await strategy.getUserInfo();

      expect(userInfo).toEqual({
        login: 'apiuser',
        id: 11111,
        avatar_url: 'https://avatar.from.api',
      });
      expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/user', {
        headers: {
          Authorization: 'Bearer token123',
          Accept: 'application/vnd.github.v3+json',
        },
      });
    });

    it('should update config with API data', async () => {
      const existingConfig = { installationId: 12345 };
      mockGitHubAppService.getConfig
        .mockResolvedValueOnce(existingConfig)
        .mockResolvedValueOnce(existingConfig);
      mockGitHubAppService.getAccessToken.mockResolvedValue({
        access_token: 'token123',
        github_username: 'apiuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: [],
        type: 'github_app',
        renewed: false,
      });

      const mockApiResponse = {
        login: 'apiuser',
        id: 11111,
        avatar_url: 'https://avatar.from.api',
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      await strategy.getUserInfo();

      expect(mockGitHubAppService.storeConfig).toHaveBeenCalledWith({
        installationId: 12345,
        githubUsername: 'apiuser',
        githubUserId: 11111,
        avatarUrl: 'https://avatar.from.api',
      });
    });

    it('should return null when API request fails', async () => {
      mockGitHubAppService.getConfig.mockResolvedValue({});
      mockGitHubAppService.getAccessToken.mockResolvedValue({
        access_token: 'token123',
        github_username: 'apiuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: [],
        type: 'github_app',
        renewed: false,
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      const userInfo = await strategy.getUserInfo();

      expect(userInfo).toBeNull();
    });

    it('should return null and not update config when current config is null', async () => {
      mockGitHubAppService.getConfig.mockResolvedValue(null);

      const userInfo = await strategy.getUserInfo();

      expect(userInfo).toBeNull();
      expect(mockGitHubAppService.storeConfig).not.toHaveBeenCalled();
    });

    it('should return null when an error occurs', async () => {
      mockGitHubAppService.getConfig.mockRejectedValue(new Error('Config error'));

      const userInfo = await strategy.getUserInfo();

      expect(userInfo).toBeNull();
    });
  });

  describe('needsRenewal', () => {
    it('should delegate to GitHubAppService.needsRenewal', async () => {
      mockGitHubAppService.needsRenewal.mockResolvedValue(true);

      const result = await strategy.needsRenewal();

      expect(result).toBe(true);
      expect(mockGitHubAppService.needsRenewal).toHaveBeenCalledTimes(1);
    });

    it('should return false when token does not need renewal', async () => {
      mockGitHubAppService.needsRenewal.mockResolvedValue(false);

      const result = await strategy.needsRenewal();

      expect(result).toBe(false);
    });
  });

  describe('getMetadata', () => {
    const mockConfig: GitHubAppConfig = {
      installationId: 12345,
      scopes: ['repo', 'user'],
      expiresAt: '2025-12-31T23:59:59Z',
      refreshTokenExpiresAt: '2026-12-31T23:59:59Z',
    };

    it('should return metadata from config', async () => {
      mockGitHubAppService.getConfig.mockResolvedValue(mockConfig);

      const metadata = await strategy.getMetadata();

      expect(metadata.scopes).toEqual(['repo', 'user']);
      expect(metadata.expiresAt).toBe('2025-12-31T23:59:59Z');
      expect(metadata.refreshTokenExpiresAt).toBe('2026-12-31T23:59:59Z');
      expect(metadata.installationId).toBe(12345);
      expect(metadata.tokenType).toBe('github_app');
      expect(metadata.lastUsed).toBeDefined();
    });

    it('should return empty object when config is null', async () => {
      mockGitHubAppService.getConfig.mockResolvedValue(null);

      const metadata = await strategy.getMetadata();

      expect(metadata).toEqual({});
    });

    it('should return empty object when an error occurs', async () => {
      mockGitHubAppService.getConfig.mockRejectedValue(new Error('Config error'));

      const metadata = await strategy.getMetadata();

      expect(metadata).toEqual({});
    });

    it('should include lastUsed timestamp', async () => {
      mockGitHubAppService.getConfig.mockResolvedValue(mockConfig);

      const beforeTime = Date.now();
      const metadata = await strategy.getMetadata();
      const afterTime = Date.now();

      expect(metadata.lastUsed).toBeDefined();
      const lastUsedTime = new Date(metadata.lastUsed as string).getTime();
      expect(lastUsedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(lastUsedTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('setUserToken', () => {
    it('should delegate to GitHubAppService.setUserToken', () => {
      strategy.setUserToken('user_token_123');

      expect(mockGitHubAppService.setUserToken).toHaveBeenCalledWith('user_token_123');
    });

    it('should accept different token formats', () => {
      strategy.setUserToken('sb_access_token_xyz');

      expect(mockGitHubAppService.setUserToken).toHaveBeenCalledWith('sb_access_token_xyz');
    });
  });

  describe('completeOAuth', () => {
    const mockOAuthResult = {
      success: true,
      github_username: 'oauthuser',
      avatar_url: 'https://avatar.oauth',
      scopes: ['repo', 'user'],
      installation_id: 99999,
      installation_found: true,
    };

    it('should complete OAuth flow and store config', async () => {
      mockGitHubAppService.completeOAuthFlow.mockResolvedValue(mockOAuthResult);
      mockGitHubAppService.storeConfig.mockResolvedValue(undefined);

      await strategy.completeOAuth('auth_code_123', 'state_456');

      expect(mockGitHubAppService.completeOAuthFlow).toHaveBeenCalledWith(
        'auth_code_123',
        'state_456'
      );
      expect(mockGitHubAppService.storeConfig).toHaveBeenCalledWith({
        installationId: 99999,
        githubUsername: 'oauthuser',
        avatarUrl: 'https://avatar.oauth',
        scopes: ['repo', 'user'],
      });
    });

    it('should clear cached token after OAuth completion', async () => {
      const mockTokenResponse: GitHubAppTokenResponse = {
        access_token: 'old_token',
        github_username: 'testuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: [],
        type: 'github_app',
        renewed: false,
      };

      mockGitHubAppService.getAccessToken.mockResolvedValue(mockTokenResponse);
      mockGitHubAppService.completeOAuthFlow.mockResolvedValue(mockOAuthResult);
      mockGitHubAppService.storeConfig.mockResolvedValue(undefined);

      await strategy.getToken();
      await strategy.completeOAuth('auth_code_123');
      await strategy.getToken();

      expect(mockGitHubAppService.getAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should work without state parameter', async () => {
      mockGitHubAppService.completeOAuthFlow.mockResolvedValue(mockOAuthResult);
      mockGitHubAppService.storeConfig.mockResolvedValue(undefined);

      await strategy.completeOAuth('auth_code_123');

      expect(mockGitHubAppService.completeOAuthFlow).toHaveBeenCalledWith(
        'auth_code_123',
        undefined
      );
    });

    it('should handle installation_id as undefined', async () => {
      const resultWithoutInstallation = {
        ...mockOAuthResult,
        installation_id: null,
      };

      mockGitHubAppService.completeOAuthFlow.mockResolvedValue(resultWithoutInstallation);
      mockGitHubAppService.storeConfig.mockResolvedValue(undefined);

      await strategy.completeOAuth('auth_code_123');

      expect(mockGitHubAppService.storeConfig).toHaveBeenCalledWith({
        installationId: undefined,
        githubUsername: 'oauthuser',
        avatarUrl: 'https://avatar.oauth',
        scopes: ['repo', 'user'],
      });
    });

    it('should throw error when OAuth flow fails', async () => {
      mockGitHubAppService.completeOAuthFlow.mockResolvedValue({
        ...mockOAuthResult,
        success: false,
      });

      await expect(strategy.completeOAuth('auth_code_123')).rejects.toThrow(
        'OAuth flow was not successful'
      );
    });

    it('should throw error when completeOAuthFlow throws', async () => {
      mockGitHubAppService.completeOAuthFlow.mockRejectedValue(new Error('OAuth error'));

      await expect(strategy.completeOAuth('auth_code_123')).rejects.toThrow(
        'Failed to complete OAuth flow: OAuth error'
      );
    });

    it('should handle unknown error types during OAuth', async () => {
      mockGitHubAppService.completeOAuthFlow.mockRejectedValue('Unknown error');

      await expect(strategy.completeOAuth('auth_code_123')).rejects.toThrow(
        'Failed to complete OAuth flow: Unknown error'
      );
    });
  });

  describe('generateOAuthUrl', () => {
    it('should delegate to GitHubAppService.generateOAuthUrl', () => {
      mockGitHubAppService.generateOAuthUrl.mockReturnValue(
        'https://github.com/login/oauth/authorize?client_id=123&redirect_uri=http://callback'
      );

      strategy.generateOAuthUrl('client_123', 'http://callback.url');

      expect(mockGitHubAppService.generateOAuthUrl).toHaveBeenCalledWith(
        'client_123',
        'http://callback.url',
        undefined
      );
    });

    it('should include state parameter when provided', () => {
      mockGitHubAppService.generateOAuthUrl.mockReturnValue(
        'https://github.com/login/oauth/authorize?client_id=123&redirect_uri=http://callback&state=xyz'
      );

      strategy.generateOAuthUrl('client_123', 'http://callback.url', 'state_xyz');

      expect(mockGitHubAppService.generateOAuthUrl).toHaveBeenCalledWith(
        'client_123',
        'http://callback.url',
        'state_xyz'
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete authentication flow', async () => {
      const mockTokenResponse: GitHubAppTokenResponse = {
        access_token: 'ghu_token123',
        github_username: 'testuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: ['repo', 'user'],
        type: 'github_app',
        renewed: false,
      };

      mockGitHubAppService.isConfigured.mockResolvedValue(true);
      mockGitHubAppService.getAccessToken.mockResolvedValue(mockTokenResponse);
      mockGitHubAppService.validateAuth.mockResolvedValue({
        isValid: true,
        userInfo: { login: 'testuser', id: 123, avatar_url: 'https://avatar' },
      });

      const isConfigured = await strategy.isConfigured();
      const token = await strategy.getToken();
      const validation = await strategy.validateAuth();

      expect(isConfigured).toBe(true);
      expect(token).toBe('ghu_token123');
      expect(validation.isValid).toBe(true);
    });

    it('should handle token expiration and renewal', async () => {
      const expiredResponse: GitHubAppTokenResponse = {
        access_token: 'old_token',
        github_username: 'testuser',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scopes: ['repo'],
        type: 'github_app',
        renewed: false,
      };

      const newResponse: GitHubAppTokenResponse = {
        access_token: 'new_token',
        github_username: 'testuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: ['repo'],
        type: 'github_app',
        renewed: true,
      };

      mockGitHubAppService.getAccessToken
        .mockResolvedValueOnce(expiredResponse)
        .mockResolvedValueOnce(newResponse);

      const oldToken = await strategy.getToken();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const newToken = await strategy.getToken();

      expect(oldToken).toBe('old_token');
      expect(newToken).toBe('new_token');
      expect(mockGitHubAppService.getAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should handle authentication lifecycle', async () => {
      const mockOAuthResult = {
        success: true,
        github_username: 'testuser',
        avatar_url: 'https://avatar',
        scopes: ['repo'],
        installation_id: 123,
        installation_found: true,
      };

      const mockTokenResponse: GitHubAppTokenResponse = {
        access_token: 'token123',
        github_username: 'testuser',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scopes: ['repo'],
        type: 'github_app',
        renewed: false,
      };

      mockGitHubAppService.completeOAuthFlow.mockResolvedValue(mockOAuthResult);
      mockGitHubAppService.storeConfig.mockResolvedValue(undefined);
      mockGitHubAppService.getAccessToken.mockResolvedValue(mockTokenResponse);
      mockGitHubAppService.clearConfig.mockResolvedValue(undefined);

      await strategy.completeOAuth('code123', 'state456');
      const token = await strategy.getToken();
      await strategy.clearAuth();

      expect(token).toBe('token123');
      expect(mockGitHubAppService.clearConfig).toHaveBeenCalled();
    });
  });
});
