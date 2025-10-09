import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { PATAuthenticationStrategy } from '../PATAuthenticationStrategy';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z');

interface ChromeNamespace {
  storage: {
    sync: {
      get: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };
}

interface GlobalWithChrome {
  chrome: ChromeNamespace;
}

describe('PATAuthenticationStrategy', () => {
  let strategy: PATAuthenticationStrategy;
  let mockChrome: ChromeNamespace;

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });

    mockChrome = {
      storage: {
        sync: {
          get: vi.fn(),
          remove: vi.fn(),
        },
      },
    };

    (global as unknown as GlobalWithChrome).chrome = mockChrome;
    global.fetch = vi.fn();

    strategy = new PATAuthenticationStrategy();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('type property', () => {
    it('should return "pat" as the authentication type', () => {
      expect(strategy.type).toBe('pat');
    });
  });

  describe('constructor', () => {
    it('should initialize without a token', () => {
      const newStrategy = new PATAuthenticationStrategy();
      expect(newStrategy).toBeDefined();
      expect(newStrategy.type).toBe('pat');
    });

    it('should initialize with a provided token', () => {
      const token = 'ghp_testtoken123';
      const newStrategy = new PATAuthenticationStrategy(token);
      expect(newStrategy).toBeDefined();
    });
  });

  describe('isConfigured', () => {
    it('should return true when token is provided in constructor', async () => {
      const strategyWithToken = new PATAuthenticationStrategy('ghp_token123');
      const result = await strategyWithToken.isConfigured();
      expect(result).toBe(true);
    });

    it('should return true when token exists in storage', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({ githubToken: 'ghp_stored_token' });

      const result = await strategy.isConfigured();

      expect(result).toBe(true);
      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith('githubToken');
    });

    it('should return false when token does not exist in storage', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});

      const result = await strategy.isConfigured();

      expect(result).toBe(false);
    });

    it('should return false when storage access fails', async () => {
      mockChrome.storage.sync.get.mockRejectedValue(new Error('Storage error'));

      const result = await strategy.isConfigured();

      expect(result).toBe(false);
    });
  });

  describe('getToken', () => {
    it('should return token when provided in constructor', async () => {
      const token = 'ghp_constructor_token';
      const strategyWithToken = new PATAuthenticationStrategy(token);

      const result = await strategyWithToken.getToken();

      expect(result).toBe(token);
      expect(mockChrome.storage.sync.get).not.toHaveBeenCalled();
    });

    it('should load token from storage when not in constructor', async () => {
      const token = 'ghp_storage_token';
      mockChrome.storage.sync.get.mockResolvedValue({ githubToken: token });

      const result = await strategy.getToken();

      expect(result).toBe(token);
      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith('githubToken');
    });

    it('should cache token from storage for subsequent calls', async () => {
      const token = 'ghp_cached_token';
      mockChrome.storage.sync.get.mockResolvedValue({ githubToken: token });

      const result1 = await strategy.getToken();
      const result2 = await strategy.getToken();

      expect(result1).toBe(token);
      expect(result2).toBe(token);
      expect(mockChrome.storage.sync.get).toHaveBeenCalledTimes(1);
    });

    it('should throw error when no token is found in storage', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});

      await expect(strategy.getToken()).rejects.toThrow('Failed to get GitHub token from storage');
    });

    it('should throw error when storage access fails', async () => {
      mockChrome.storage.sync.get.mockRejectedValue(new Error('Network error'));

      await expect(strategy.getToken()).rejects.toThrow('Failed to get GitHub token from storage');
    });
  });

  describe('validateAuth', () => {
    const mockToken = 'ghp_test_token';
    const mockUsername = 'testuser';

    it('should validate token and username successfully', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo, user' }),
          json: async () => ({
            login: mockUsername,
            id: 12345,
            avatar_url: 'https://avatar.url',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo, user' }),
          json: async () => ({
            login: mockUsername,
            id: 12345,
            avatar_url: 'https://avatar.url',
          }),
        } as Response);

      const result = await strategyWithToken.validateAuth(mockUsername);

      expect(result.isValid).toBe(true);
      expect(result.userInfo?.login).toBe(mockUsername);
      expect(result.type).toBe('classic');
      expect(result.scopes).toEqual(['repo', 'user']);
    });

    it('should use username from storage when not provided', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);
      mockChrome.storage.sync.get.mockResolvedValue({ repoOwner: mockUsername });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          login: mockUsername,
          id: 12345,
          avatar_url: 'https://avatar.url',
        }),
      } as Response);

      await strategyWithToken.validateAuth();

      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith('repoOwner');
    });

    it('should return error when username is not provided or in storage', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);
      mockChrome.storage.sync.get.mockResolvedValue({});

      const result = await strategyWithToken.validateAuth();

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Repository owner (username) is required for validation');
    });

    it('should return error when token is invalid (401)', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      const result = await strategyWithToken.validateAuth(mockUsername);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should return error when user is not found (404)', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const result = await strategyWithToken.validateAuth(mockUsername);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should return error on API error', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const result = await strategyWithToken.validateAuth(mockUsername);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('GitHub API error: 500');
    });

    it('should detect classic token (ghp_ prefix)', async () => {
      const classicToken = 'ghp_classic_token';
      const strategyWithToken = new PATAuthenticationStrategy(classicToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          login: mockUsername,
          id: 12345,
          avatar_url: 'https://avatar.url',
        }),
      } as Response);

      const result = await strategyWithToken.validateAuth(mockUsername);

      expect(result.isValid).toBe(true);
      expect(result.type).toBe('classic');
    });

    it('should detect fine-grained token (no ghp_ prefix)', async () => {
      const fineGrainedToken = 'github_pat_fine_grained';
      const strategyWithToken = new PATAuthenticationStrategy(fineGrainedToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          login: mockUsername,
          id: 12345,
          avatar_url: 'https://avatar.url',
        }),
      } as Response);

      const result = await strategyWithToken.validateAuth(mockUsername);

      expect(result.isValid).toBe(true);
      expect(result.type).toBe('fine-grained');
    });

    it('should handle network errors during validation', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network failure'));

      const result = await strategyWithToken.validateAuth(mockUsername);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Network failure');
    });

    it('should handle getUserInfo failure gracefully', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as Response);

      const result = await strategyWithToken.validateAuth(mockUsername);

      expect(result.isValid).toBe(true);
      expect(result.userInfo).toBeUndefined();
    });
  });

  describe('checkPermissions', () => {
    const mockToken = 'ghp_test_token';
    const mockRepoOwner = 'testowner';

    it('should return valid permissions when token has repo access', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

      const result = await strategyWithToken.checkPermissions(mockRepoOwner);

      expect(result.isValid).toBe(true);
      expect(result.permissions.allRepos).toBe(true);
      expect(result.permissions.admin).toBe(true);
      expect(result.permissions.contents).toBe(true);
    });

    it('should return error when token lacks permissions', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 403,
      } as Response);

      const result = await strategyWithToken.checkPermissions(mockRepoOwner);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Insufficient permissions. Token needs repo scope.');
      expect(result.permissions.allRepos).toBe(false);
      expect(result.permissions.admin).toBe(false);
      expect(result.permissions.contents).toBe(false);
    });

    it('should handle network errors during permission check', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const result = await strategyWithToken.checkPermissions(mockRepoOwner);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.permissions).toEqual({
        allRepos: false,
        admin: false,
        contents: false,
      });
    });

    it('should handle unknown error types', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockRejectedValue('Unknown error');

      const result = await strategyWithToken.checkPermissions(mockRepoOwner);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Permission check failed');
    });
  });

  describe('refreshToken', () => {
    it('should throw error as PAT tokens cannot be refreshed', async () => {
      await expect(strategy.refreshToken()).rejects.toThrow(
        'Personal Access Tokens cannot be automatically refreshed. Please generate a new token.'
      );
    });
  });

  describe('clearAuth', () => {
    it('should clear token from storage', async () => {
      mockChrome.storage.sync.remove.mockResolvedValue(undefined);

      await strategy.clearAuth();

      expect(mockChrome.storage.sync.remove).toHaveBeenCalledWith(['githubToken']);
    });

    it('should clear cached token', async () => {
      const token = 'ghp_cached_token';
      mockChrome.storage.sync.get.mockResolvedValue({ githubToken: token });
      mockChrome.storage.sync.remove.mockResolvedValue(undefined);

      await strategy.getToken();
      await strategy.clearAuth();

      mockChrome.storage.sync.get.mockResolvedValue({ githubToken: 'ghp_new_token' });
      await strategy.getToken();

      expect(mockChrome.storage.sync.get).toHaveBeenCalledTimes(2);
    });

    it('should throw error when storage removal fails', async () => {
      mockChrome.storage.sync.remove.mockRejectedValue(new Error('Storage error'));

      await expect(strategy.clearAuth()).rejects.toThrow('Failed to clear PAT authentication');
    });
  });

  describe('getUserInfo', () => {
    const mockToken = 'ghp_test_token';
    const mockUserData = {
      login: 'testuser',
      id: 12345,
      avatar_url: 'https://avatar.url',
    };

    it('should fetch and return user info from GitHub API', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockUserData,
      } as Response);

      const result = await strategyWithToken.getUserInfo();

      expect(result).toEqual(mockUserData);
      expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${mockToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
    });

    it('should return null when API request fails', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      const result = await strategyWithToken.getUserInfo();

      expect(result).toBeNull();
    });

    it('should return null when network error occurs', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const result = await strategyWithToken.getUserInfo();

      expect(result).toBeNull();
    });

    it('should return null when token is not configured', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});

      const result = await strategy.getUserInfo();

      expect(result).toBeNull();
    });
  });

  describe('needsRenewal', () => {
    it('should always return false as PAT tokens do not auto-expire', async () => {
      const result = await strategy.needsRenewal();

      expect(result).toBe(false);
    });
  });

  describe('getMetadata', () => {
    const mockToken = 'ghp_test_token';

    it('should return metadata with scopes from API', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'x-oauth-scopes': 'repo, user, admin:org' }),
        json: async () => ({}),
      } as Response);

      const result = await strategyWithToken.getMetadata();

      expect(result.scopes).toEqual(['repo', 'user', 'admin:org']);
      expect(result.tokenType).toBe('classic');
      expect(result.lastUsed).toBe(FIXED_TIME.toISOString());
    });

    it('should return metadata with empty scopes when header is missing', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: async () => ({}),
      } as Response);

      const result = await strategyWithToken.getMetadata();

      expect(result.scopes).toEqual([]);
      expect(result.tokenType).toBe('classic');
      expect(result.lastUsed).toBe(FIXED_TIME.toISOString());
    });

    it('should identify classic token type', async () => {
      const classicToken = 'ghp_classic_token';
      const strategyWithToken = new PATAuthenticationStrategy(classicToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: async () => ({}),
      } as Response);

      const result = await strategyWithToken.getMetadata();

      expect(result.tokenType).toBe('classic');
    });

    it('should identify fine-grained token type', async () => {
      const fineGrainedToken = 'github_pat_fine_grained';
      const strategyWithToken = new PATAuthenticationStrategy(fineGrainedToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: async () => ({}),
      } as Response);

      const result = await strategyWithToken.getMetadata();

      expect(result.tokenType).toBe('fine-grained');
    });

    it('should return metadata with empty scopes when API request fails', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      const result = await strategyWithToken.getMetadata();

      expect(result.scopes).toEqual([]);
      expect(result.tokenType).toBe('classic');
      expect(result.lastUsed).toBe(FIXED_TIME.toISOString());
    });

    it('should return empty object on network error', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const result = await strategyWithToken.getMetadata();

      expect(result).toEqual({});
    });

    it('should include lastUsed timestamp', async () => {
      const strategyWithToken = new PATAuthenticationStrategy(mockToken);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: async () => ({}),
      } as Response);

      const result = await strategyWithToken.getMetadata();

      expect(result.lastUsed).toBe(FIXED_TIME.toISOString());
    });
  });

  describe('setToken', () => {
    it('should set token in strategy', () => {
      const token = 'ghp_new_token';

      strategy.setToken(token);

      expect(strategy).toBeDefined();
    });

    it('should allow getToken to use manually set token', async () => {
      const token = 'ghp_manual_token';

      strategy.setToken(token);
      const result = await strategy.getToken();

      expect(result).toBe(token);
      expect(mockChrome.storage.sync.get).not.toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete authentication flow', async () => {
      const token = 'ghp_integration_token';
      const username = 'integrationuser';
      const strategyWithToken = new PATAuthenticationStrategy(token);

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo, user' }),
          json: async () => ({
            login: username,
            id: 12345,
            avatar_url: 'https://avatar.url',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo, user' }),
          json: async () => ({
            login: username,
            id: 12345,
            avatar_url: 'https://avatar.url',
          }),
        } as Response);

      const validation = await strategyWithToken.validateAuth(username);

      expect(validation.isValid).toBe(true);
      expect(validation.userInfo?.login).toBe(username);
      expect(validation.type).toBe('classic');
      expect(validation.scopes).toEqual(['repo', 'user']);
    });

    it('should handle permission check after validation', async () => {
      const token = 'ghp_integration_token';
      const username = 'integrationuser';
      const strategyWithToken = new PATAuthenticationStrategy(token);

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            login: username,
            id: 12345,
            avatar_url: 'https://avatar.url',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            login: username,
            id: 12345,
            avatar_url: 'https://avatar.url',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [],
        } as Response);

      await strategyWithToken.validateAuth(username);
      const permissions = await strategyWithToken.checkPermissions(username);

      expect(permissions.isValid).toBe(true);
      expect(permissions.permissions.allRepos).toBe(true);
    });

    it('should handle token lifecycle from setup to cleanup', async () => {
      const token = 'ghp_lifecycle_token';
      const strategyWithToken = new PATAuthenticationStrategy(token);

      mockChrome.storage.sync.remove.mockResolvedValue(undefined);

      const retrievedToken = await strategyWithToken.getToken();
      expect(retrievedToken).toBe(token);

      await strategyWithToken.clearAuth();
      expect(mockChrome.storage.sync.remove).toHaveBeenCalledWith(['githubToken']);
    });

    it('should handle error recovery during validation', async () => {
      const token = 'ghp_error_recovery_token';
      const username = 'erroruser';
      const strategyWithToken = new PATAuthenticationStrategy(token);

      vi.mocked(global.fetch)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            login: username,
            id: 12345,
            avatar_url: 'https://avatar.url',
          }),
        } as Response);

      const failedResult = await strategyWithToken.validateAuth(username);
      expect(failedResult.isValid).toBe(false);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          login: username,
          id: 12345,
          avatar_url: 'https://avatar.url',
        }),
      } as Response);

      const successResult = await strategyWithToken.validateAuth(username);
      expect(successResult.isValid).toBe(true);
    });

    it('should maintain token consistency across multiple operations', async () => {
      const token = 'ghp_consistency_token';
      const username = 'consistentuser';
      const strategyWithToken = new PATAuthenticationStrategy(token);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-oauth-scopes': 'repo' }),
        json: async () => ({
          login: username,
          id: 12345,
          avatar_url: 'https://avatar.url',
        }),
      } as Response);

      const token1 = await strategyWithToken.getToken();
      const userInfo = await strategyWithToken.getUserInfo();
      const metadata = await strategyWithToken.getMetadata();
      const token2 = await strategyWithToken.getToken();

      expect(token1).toBe(token);
      expect(token2).toBe(token);
      expect(userInfo?.login).toBe(username);
      expect(metadata.tokenType).toBe('classic');
    });
  });

  describe('edge cases', () => {
    it('should handle empty token string', async () => {
      const strategyWithEmptyToken = new PATAuthenticationStrategy('');
      mockChrome.storage.sync.get.mockResolvedValue({});

      await expect(strategyWithEmptyToken.getToken()).rejects.toThrow(
        'Failed to get GitHub token from storage'
      );
    });

    it('should handle malformed API responses', async () => {
      const token = 'ghp_malformed_token';
      const strategyWithToken = new PATAuthenticationStrategy(token);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: 'data' }),
      } as Response);

      const result = await strategyWithToken.getUserInfo();

      expect(result?.login).toBeUndefined();
      expect(result?.id).toBeUndefined();
    });

    it('should handle concurrent getToken calls', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({ githubToken: 'ghp_concurrent_token' });

      const [token1, token2, token3] = await Promise.all([
        strategy.getToken(),
        strategy.getToken(),
        strategy.getToken(),
      ]);

      expect(token1).toBe('ghp_concurrent_token');
      expect(token2).toBe('ghp_concurrent_token');
      expect(token3).toBe('ghp_concurrent_token');
    });

    it('should handle scope header with whitespace variations', async () => {
      const token = 'ghp_whitespace_token';
      const strategyWithToken = new PATAuthenticationStrategy(token);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'x-oauth-scopes': 'repo,  user,   admin:org' }),
        json: async () => ({}),
      } as Response);

      const result = await strategyWithToken.getMetadata();

      expect(result.scopes).toEqual(['repo', 'user', 'admin:org']);
    });

    it('should handle case where repoOwner is empty string', async () => {
      const token = 'ghp_test_token';
      const strategyWithToken = new PATAuthenticationStrategy(token);
      mockChrome.storage.sync.get.mockResolvedValue({ repoOwner: '' });

      const result = await strategyWithToken.validateAuth();

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Repository owner (username) is required for validation');
    });
  });
});
