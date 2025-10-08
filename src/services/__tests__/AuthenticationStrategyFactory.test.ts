import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { AuthenticationStrategyFactory } from '../AuthenticationStrategyFactory';
import { PATAuthenticationStrategy } from '../PATAuthenticationStrategy';
import { GitHubAppAuthenticationStrategy } from '../GitHubAppAuthenticationStrategy';
import type { AuthenticationType } from '../types/authentication';
import type { IAuthenticationStrategy } from '../interfaces/IAuthenticationStrategy';

describe('AuthenticationStrategyFactory', () => {
  let factory: AuthenticationStrategyFactory;
  let mockChromeStorage: {
    local: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    factory = AuthenticationStrategyFactory.getInstance();
    factory.clearCache();

    mockChromeStorage = {
      local: {
        get: vi.fn(),
        set: vi.fn(),
      },
    };

    global.chrome = {
      storage: mockChromeStorage,
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    factory.clearCache();
  });

  describe('getInstance', () => {
    it('should return the same singleton instance on multiple calls', () => {
      const instance1 = AuthenticationStrategyFactory.getInstance();
      const instance2 = AuthenticationStrategyFactory.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should return a valid factory instance', () => {
      const instance = AuthenticationStrategyFactory.getInstance();

      expect(instance).toBeInstanceOf(AuthenticationStrategyFactory);
      expect(instance.createStrategy).toBeDefined();
      expect(instance.getDefaultStrategy).toBeDefined();
      expect(instance.getCurrentStrategy).toBeDefined();
    });
  });

  describe('createStrategy', () => {
    it('should create a PAT strategy when type is "pat"', () => {
      const strategy = factory.createStrategy('pat');

      expect(strategy).toBeInstanceOf(PATAuthenticationStrategy);
      expect(strategy.type).toBe('pat');
    });

    it('should create a GitHub App strategy when type is "github_app"', () => {
      const strategy = factory.createStrategy('github_app');

      expect(strategy).toBeInstanceOf(GitHubAppAuthenticationStrategy);
      expect(strategy.type).toBe('github_app');
    });

    it('should throw an error for unsupported authentication type', () => {
      expect(() => {
        factory.createStrategy('invalid_type' as AuthenticationType);
      }).toThrow('Unsupported authentication type: invalid_type');
    });

    it('should cache created strategies and return the same instance on subsequent calls', () => {
      const strategy1 = factory.createStrategy('pat');
      const strategy2 = factory.createStrategy('pat');

      expect(strategy1).toBe(strategy2);
    });

    it('should cache different strategy types separately', () => {
      const patStrategy = factory.createStrategy('pat');
      const githubAppStrategy = factory.createStrategy('github_app');

      expect(patStrategy).not.toBe(githubAppStrategy);
      expect(patStrategy.type).toBe('pat');
      expect(githubAppStrategy.type).toBe('github_app');
    });
  });

  describe('getDefaultStrategy', () => {
    it('should return a GitHub App strategy as the default for new users', () => {
      const strategy = factory.getDefaultStrategy();

      expect(strategy).toBeInstanceOf(GitHubAppAuthenticationStrategy);
      expect(strategy.type).toBe('github_app');
    });

    it('should cache the default strategy', () => {
      const strategy1 = factory.getDefaultStrategy();
      const strategy2 = factory.getDefaultStrategy();

      expect(strategy1).toBe(strategy2);
    });
  });

  describe('getCurrentStrategy', () => {
    it('should return configured PAT strategy when PAT is configured and selected', async () => {
      mockChromeStorage.local.get.mockImplementation(async (key: string) => {
        if (key === 'authenticationMethod') {
          return { authenticationMethod: 'pat' };
        }
        return {};
      });

      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        isConfigured: vi.fn().mockResolvedValue(true),
        type: 'pat',
      };

      vi.spyOn(factory, 'createStrategy').mockReturnValue(
        mockPatStrategy as IAuthenticationStrategy
      );

      const strategy = await factory.getCurrentStrategy();

      expect(strategy.type).toBe('pat');
      expect(mockPatStrategy.isConfigured).toHaveBeenCalled();
    });

    it('should return configured GitHub App strategy when GitHub App is configured and selected', async () => {
      mockChromeStorage.local.get.mockImplementation(async (key: string) => {
        if (key === 'authenticationMethod') {
          return { authenticationMethod: 'github_app' };
        }
        return {};
      });

      const mockGitHubAppStrategy: Partial<IAuthenticationStrategy> & {
        type: AuthenticationType;
      } = {
        isConfigured: vi.fn().mockResolvedValue(true),
        type: 'github_app',
      };

      vi.spyOn(factory, 'createStrategy').mockReturnValue(
        mockGitHubAppStrategy as IAuthenticationStrategy
      );

      const strategy = await factory.getCurrentStrategy();

      expect(strategy.type).toBe('github_app');
      expect(mockGitHubAppStrategy.isConfigured).toHaveBeenCalled();
    });

    it('should fallback to PAT when GitHub App is selected but not configured', async () => {
      factory.clearCache();

      mockChromeStorage.local.get.mockImplementation(async (key: string) => {
        if (key === 'authenticationMethod') {
          return { authenticationMethod: 'github_app' };
        }
        return {};
      });

      const mockGitHubAppStrategy: Partial<IAuthenticationStrategy> & {
        type: AuthenticationType;
      } = {
        isConfigured: vi.fn().mockResolvedValue(false),
        type: 'github_app',
      };

      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        isConfigured: vi.fn().mockResolvedValue(true),
        type: 'pat',
      };

      vi.spyOn(factory, 'createStrategy')
        .mockReturnValueOnce(mockGitHubAppStrategy as IAuthenticationStrategy)
        .mockReturnValueOnce(mockPatStrategy as IAuthenticationStrategy);

      const strategy = await factory.getCurrentStrategy();

      expect(strategy.type).toBe('pat');
      expect(mockGitHubAppStrategy.isConfigured).toHaveBeenCalled();
    });

    it('should return default strategy when no strategy is configured', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});

      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        isConfigured: vi.fn().mockResolvedValue(false),
        type: 'pat',
      };

      const mockDefaultStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        type: 'github_app',
      };

      vi.spyOn(factory, 'createStrategy').mockReturnValue(
        mockPatStrategy as IAuthenticationStrategy
      );
      vi.spyOn(factory, 'getDefaultStrategy').mockReturnValue(
        mockDefaultStrategy as IAuthenticationStrategy
      );

      const strategy = await factory.getCurrentStrategy();

      expect(strategy.type).toBe('github_app');
      expect(factory.getDefaultStrategy).toHaveBeenCalled();
    });

    it('should fallback to PAT on error', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        type: 'pat',
      };

      vi.spyOn(factory, 'createStrategy').mockReturnValue(
        mockPatStrategy as IAuthenticationStrategy
      );

      const strategy = await factory.getCurrentStrategy();

      expect(strategy.type).toBe('pat');
    });

    it('should default to PAT for existing users when no authenticationMethod is stored', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});

      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        isConfigured: vi.fn().mockResolvedValue(false),
        type: 'pat',
      };

      vi.spyOn(factory, 'createStrategy').mockReturnValue(
        mockPatStrategy as IAuthenticationStrategy
      );

      await factory.getCurrentStrategy();

      expect(factory.createStrategy).toHaveBeenCalledWith('pat');
    });
  });

  describe('setAuthenticationMethod', () => {
    it('should store the selected authentication method in chrome storage', async () => {
      mockChromeStorage.local.set.mockResolvedValue(undefined);

      await factory.setAuthenticationMethod('github_app');

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        authenticationMethod: 'github_app',
      });
    });

    it('should handle PAT authentication method', async () => {
      mockChromeStorage.local.set.mockResolvedValue(undefined);

      await factory.setAuthenticationMethod('pat');

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        authenticationMethod: 'pat',
      });
    });

    it('should throw an error when storage fails', async () => {
      mockChromeStorage.local.set.mockRejectedValue(new Error('Storage error'));

      await expect(factory.setAuthenticationMethod('pat')).rejects.toThrow(
        'Failed to save authentication method preference'
      );
    });
  });

  describe('getAllConfiguredStrategies', () => {
    it('should return both strategies when both are configured', async () => {
      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        isConfigured: vi.fn().mockResolvedValue(true),
        type: 'pat',
      };

      const mockGitHubAppStrategy: Partial<IAuthenticationStrategy> & {
        type: AuthenticationType;
      } = {
        isConfigured: vi.fn().mockResolvedValue(true),
        type: 'github_app',
      };

      vi.spyOn(factory, 'createStrategy')
        .mockReturnValueOnce(mockPatStrategy as IAuthenticationStrategy)
        .mockReturnValueOnce(mockGitHubAppStrategy as IAuthenticationStrategy);

      const strategies = await factory.getAllConfiguredStrategies();

      expect(strategies.pat).toBe(mockPatStrategy);
      expect(strategies.github_app).toBe(mockGitHubAppStrategy);
    });

    it('should return only PAT when only PAT is configured', async () => {
      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        isConfigured: vi.fn().mockResolvedValue(true),
        type: 'pat',
      };

      const mockGitHubAppStrategy: Partial<IAuthenticationStrategy> & {
        type: AuthenticationType;
      } = {
        isConfigured: vi.fn().mockResolvedValue(false),
        type: 'github_app',
      };

      vi.spyOn(factory, 'createStrategy')
        .mockReturnValueOnce(mockPatStrategy as IAuthenticationStrategy)
        .mockReturnValueOnce(mockGitHubAppStrategy as IAuthenticationStrategy);

      const strategies = await factory.getAllConfiguredStrategies();

      expect(strategies.pat).toBe(mockPatStrategy);
      expect(strategies.github_app).toBeUndefined();
    });

    it('should return only GitHub App when only GitHub App is configured', async () => {
      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        isConfigured: vi.fn().mockResolvedValue(false),
        type: 'pat',
      };

      const mockGitHubAppStrategy: Partial<IAuthenticationStrategy> & {
        type: AuthenticationType;
      } = {
        isConfigured: vi.fn().mockResolvedValue(true),
        type: 'github_app',
      };

      vi.spyOn(factory, 'createStrategy')
        .mockReturnValueOnce(mockPatStrategy as IAuthenticationStrategy)
        .mockReturnValueOnce(mockGitHubAppStrategy as IAuthenticationStrategy);

      const strategies = await factory.getAllConfiguredStrategies();

      expect(strategies.pat).toBeUndefined();
      expect(strategies.github_app).toBe(mockGitHubAppStrategy);
    });

    it('should return empty object when neither strategy is configured', async () => {
      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        isConfigured: vi.fn().mockResolvedValue(false),
        type: 'pat',
      };

      const mockGitHubAppStrategy: Partial<IAuthenticationStrategy> & {
        type: AuthenticationType;
      } = {
        isConfigured: vi.fn().mockResolvedValue(false),
        type: 'github_app',
      };

      vi.spyOn(factory, 'createStrategy')
        .mockReturnValueOnce(mockPatStrategy as IAuthenticationStrategy)
        .mockReturnValueOnce(mockGitHubAppStrategy as IAuthenticationStrategy);

      const strategies = await factory.getAllConfiguredStrategies();

      expect(strategies.pat).toBeUndefined();
      expect(strategies.github_app).toBeUndefined();
      expect(Object.keys(strategies)).toHaveLength(0);
    });

    it('should handle errors gracefully and return empty object', async () => {
      vi.spyOn(factory, 'createStrategy').mockImplementation(() => {
        throw new Error('Strategy creation failed');
      });

      const strategies = await factory.getAllConfiguredStrategies();

      expect(strategies).toEqual({});
    });
  });

  describe('hasMultipleAuthMethods', () => {
    it('should return true when both PAT and GitHub App are configured', async () => {
      const mockStrategies: {
        pat: IAuthenticationStrategy;
        github_app: IAuthenticationStrategy;
      } = {
        pat: { type: 'pat' } as IAuthenticationStrategy,
        github_app: { type: 'github_app' } as IAuthenticationStrategy,
      };

      vi.spyOn(factory, 'getAllConfiguredStrategies').mockResolvedValue(mockStrategies);

      const result = await factory.hasMultipleAuthMethods();

      expect(result).toBe(true);
    });

    it('should return false when only one strategy is configured', async () => {
      const mockStrategies: {
        pat: IAuthenticationStrategy;
      } = {
        pat: { type: 'pat' } as IAuthenticationStrategy,
      };

      vi.spyOn(factory, 'getAllConfiguredStrategies').mockResolvedValue(mockStrategies);

      const result = await factory.hasMultipleAuthMethods();

      expect(result).toBe(false);
    });

    it('should return false when no strategies are configured', async () => {
      vi.spyOn(factory, 'getAllConfiguredStrategies').mockResolvedValue({});

      const result = await factory.hasMultipleAuthMethods();

      expect(result).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached strategies', () => {
      factory.clearCache();
      vi.restoreAllMocks();

      const strategy1 = factory.createStrategy('pat');
      const strategy2 = factory.createStrategy('github_app');

      factory.clearCache();

      const strategy3 = factory.createStrategy('pat');
      const strategy4 = factory.createStrategy('github_app');

      expect(strategy3).not.toBe(strategy1);
      expect(strategy4).not.toBe(strategy2);
    });

    it('should allow creating new strategies after cache is cleared', () => {
      factory.clearCache();
      vi.restoreAllMocks();

      factory.createStrategy('pat');
      factory.clearCache();

      const newStrategy = factory.createStrategy('pat');

      expect(newStrategy).toBeInstanceOf(PATAuthenticationStrategy);
      expect(newStrategy.type).toBe('pat');
    });
  });

  describe('createPATStrategy', () => {
    it('should create a new PAT strategy with the provided token', () => {
      const token = 'ghp_test_token_123';
      const strategy = factory.createPATStrategy(token);

      expect(strategy).toBeInstanceOf(PATAuthenticationStrategy);
      expect(strategy.type).toBe('pat');
    });

    it('should not cache token-specific strategies', () => {
      const token1 = 'ghp_token_1';
      const token2 = 'ghp_token_2';

      const strategy1 = factory.createPATStrategy(token1);
      const strategy2 = factory.createPATStrategy(token2);

      expect(strategy1).not.toBe(strategy2);
    });

    it('should create different instances for each call even with the same token', () => {
      const token = 'ghp_same_token';

      const strategy1 = factory.createPATStrategy(token);
      const strategy2 = factory.createPATStrategy(token);

      expect(strategy1).not.toBe(strategy2);
    });
  });

  describe('createGitHubAppStrategy', () => {
    it('should create a GitHub App strategy from cached instance', () => {
      factory.clearCache();
      vi.restoreAllMocks();

      const strategy = factory.createGitHubAppStrategy();

      expect(strategy).toBeInstanceOf(GitHubAppAuthenticationStrategy);
      expect(strategy.type).toBe('github_app');
    });

    it('should set user token when provided', () => {
      const userToken = 'user_token_123';
      const mockSetUserToken = vi.fn();

      const mockStrategy = {
        type: 'github_app' as const,
        setUserToken: mockSetUserToken,
      };

      vi.spyOn(factory, 'createStrategy').mockReturnValue(
        mockStrategy as unknown as GitHubAppAuthenticationStrategy
      );

      factory.createGitHubAppStrategy(userToken);

      expect(mockSetUserToken).toHaveBeenCalledWith(userToken);
    });

    it('should not call setUserToken when no user token is provided', () => {
      const mockSetUserToken = vi.fn();

      const mockStrategy = {
        type: 'github_app' as const,
        setUserToken: mockSetUserToken,
      };

      vi.spyOn(factory, 'createStrategy').mockReturnValue(
        mockStrategy as unknown as GitHubAppAuthenticationStrategy
      );

      factory.createGitHubAppStrategy();

      expect(mockSetUserToken).not.toHaveBeenCalled();
    });

    it('should return cached GitHub App strategy', () => {
      const strategy1 = factory.createGitHubAppStrategy();
      const strategy2 = factory.createGitHubAppStrategy();

      expect(strategy1).toBe(strategy2);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle concurrent strategy creation calls correctly', () => {
      factory.clearCache();
      vi.restoreAllMocks();

      const strategies = Array.from({ length: 5 }, () => factory.createStrategy('pat'));

      expect(strategies.every((s) => s === strategies[0])).toBe(true);
    });

    it('should handle rapid cache clearing and recreation', () => {
      factory.clearCache();
      vi.restoreAllMocks();

      const strategy1 = factory.createStrategy('pat');
      factory.clearCache();
      const strategy2 = factory.createStrategy('pat');
      factory.clearCache();
      const strategy3 = factory.createStrategy('pat');

      expect(strategy1).not.toBe(strategy2);
      expect(strategy2).not.toBe(strategy3);
      expect(strategy1).not.toBe(strategy3);
    });

    it('should maintain singleton pattern across multiple getInstance calls', () => {
      const instances = Array.from({ length: 10 }, () =>
        AuthenticationStrategyFactory.getInstance()
      );

      expect(instances.every((instance) => instance === instances[0])).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should support switching authentication methods', async () => {
      mockChromeStorage.local.set.mockResolvedValue(undefined);

      await factory.setAuthenticationMethod('pat');
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        authenticationMethod: 'pat',
      });

      await factory.setAuthenticationMethod('github_app');
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        authenticationMethod: 'github_app',
      });

      expect(mockChromeStorage.local.set).toHaveBeenCalledTimes(2);
    });

    it('should handle migration from PAT to GitHub App', async () => {
      factory.clearCache();
      vi.restoreAllMocks();

      const mockPatStrategy: Partial<IAuthenticationStrategy> & { type: AuthenticationType } = {
        isConfigured: vi.fn().mockResolvedValue(true),
        type: 'pat',
      };

      const mockGitHubAppStrategy: Partial<IAuthenticationStrategy> & {
        type: AuthenticationType;
      } = {
        isConfigured: vi.fn().mockResolvedValue(true),
        type: 'github_app',
      };

      const strategies = {
        pat: mockPatStrategy as IAuthenticationStrategy,
        github_app: mockGitHubAppStrategy as IAuthenticationStrategy,
      };

      vi.spyOn(factory, 'getAllConfiguredStrategies').mockResolvedValue(strategies);

      const result = await factory.getAllConfiguredStrategies();

      expect(result.pat).toBeDefined();
      expect(result.github_app).toBeDefined();

      const hasMultiple = await factory.hasMultipleAuthMethods();
      expect(hasMultiple).toBe(true);
    });

    it('should create and cache strategies independently per type', () => {
      factory.clearCache();
      vi.restoreAllMocks();

      const pat1 = factory.createStrategy('pat');
      const app1 = factory.createStrategy('github_app');
      const pat2 = factory.createStrategy('pat');
      const app2 = factory.createStrategy('github_app');

      expect(pat1).toBe(pat2);
      expect(app1).toBe(app2);
      expect(pat1).not.toBe(app1);
    });
  });
});
