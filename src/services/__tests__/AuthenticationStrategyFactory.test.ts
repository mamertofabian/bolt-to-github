import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { AuthenticationStrategyFactory } from '../AuthenticationStrategyFactory';
import { PATAuthenticationStrategy } from '../PATAuthenticationStrategy';
import { GitHubAppAuthenticationStrategy } from '../GitHubAppAuthenticationStrategy';
import type { AuthenticationType } from '../types/authentication';

interface ChromeNamespace {
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (data: Record<string, unknown>) => Promise<void>;
    };
  };
}

interface GlobalWithChrome {
  chrome: ChromeNamespace;
}

describe('AuthenticationStrategyFactory', () => {
  let factory: AuthenticationStrategyFactory;

  const setChromeStorage = (data: Record<string, unknown>) => {
    (global as unknown as GlobalWithChrome).chrome = {
      storage: {
        local: {
          get: vi.fn(async (key: string) => {
            if (typeof key === 'string' && key in data) {
              return { [key]: data[key] };
            }
            return {};
          }),
          set: vi.fn(async (newData: Record<string, unknown>) => {
            Object.assign(data, newData);
          }),
        },
      },
    };
  };

  beforeEach(() => {
    factory = AuthenticationStrategyFactory.getInstance();
    factory.clearCache();
    setChromeStorage({});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    factory.clearCache();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance across multiple calls', () => {
      const instance1 = AuthenticationStrategyFactory.getInstance();
      const instance2 = AuthenticationStrategyFactory.getInstance();
      const instance3 = AuthenticationStrategyFactory.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBeInstanceOf(AuthenticationStrategyFactory);
    });
  });

  describe('Strategy Creation', () => {
    it('should create PAT strategy with correct type', () => {
      const strategy = factory.createStrategy('pat');

      expect(strategy).toBeInstanceOf(PATAuthenticationStrategy);
      expect(strategy.type).toBe('pat');
    });

    it('should create GitHub App strategy with correct type', () => {
      const strategy = factory.createStrategy('github_app');

      expect(strategy).toBeInstanceOf(GitHubAppAuthenticationStrategy);
      expect(strategy.type).toBe('github_app');
    });

    it('should throw error for unsupported authentication type', () => {
      expect(() => {
        factory.createStrategy('invalid_type' as AuthenticationType);
      }).toThrow('Unsupported authentication type: invalid_type');
    });

    it('should cache created strategies', () => {
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

    it('should clear cache when requested', () => {
      const strategy1 = factory.createStrategy('pat');
      factory.clearCache();
      const strategy2 = factory.createStrategy('pat');

      expect(strategy1).not.toBe(strategy2);
      expect(strategy2).toBeInstanceOf(PATAuthenticationStrategy);
    });
  });

  describe('Default Strategy', () => {
    it('should return GitHub App strategy as default', () => {
      const strategy = factory.getDefaultStrategy();

      expect(strategy.type).toBe('github_app');
      expect(strategy).toBeInstanceOf(GitHubAppAuthenticationStrategy);
    });

    it('should cache default strategy', () => {
      const strategy1 = factory.getDefaultStrategy();
      const strategy2 = factory.getDefaultStrategy();

      expect(strategy1).toBe(strategy2);
    });
  });

  describe('Authentication Method Preference', () => {
    it('should save PAT as authentication method', async () => {
      const storageData: Record<string, unknown> = {};
      setChromeStorage(storageData);

      await factory.setAuthenticationMethod('pat');

      expect(storageData.authenticationMethod).toBe('pat');
    });

    it('should save GitHub App as authentication method', async () => {
      const storageData: Record<string, unknown> = {};
      setChromeStorage(storageData);

      await factory.setAuthenticationMethod('github_app');

      expect(storageData.authenticationMethod).toBe('github_app');
    });

    it('should throw error when storage fails', async () => {
      (global as unknown as GlobalWithChrome).chrome = {
        storage: {
          local: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => {
              throw new Error('Storage error');
            }),
          },
        },
      };

      await expect(factory.setAuthenticationMethod('pat')).rejects.toThrow(
        'Failed to save authentication method preference'
      );
    });

    it('should allow switching authentication methods', async () => {
      const storageData: Record<string, unknown> = {};
      setChromeStorage(storageData);

      await factory.setAuthenticationMethod('pat');
      expect(storageData.authenticationMethod).toBe('pat');

      await factory.setAuthenticationMethod('github_app');
      expect(storageData.authenticationMethod).toBe('github_app');
    });
  });

  describe('Token-Specific Strategy Creation', () => {
    it('should create PAT strategy with provided token', () => {
      const token = 'ghp_test_token_123';
      const strategy = factory.createPATStrategy(token);

      expect(strategy).toBeInstanceOf(PATAuthenticationStrategy);
      expect(strategy.type).toBe('pat');
    });

    it('should create new instances for token-specific strategies', () => {
      const token1 = 'ghp_token_1';
      const token2 = 'ghp_token_2';

      const strategy1 = factory.createPATStrategy(token1);
      const strategy2 = factory.createPATStrategy(token2);

      expect(strategy1).not.toBe(strategy2);
    });

    it('should create GitHub App strategy from cache', () => {
      const strategy1 = factory.createGitHubAppStrategy();
      const strategy2 = factory.createGitHubAppStrategy();

      expect(strategy1).toBe(strategy2);
      expect(strategy1.type).toBe('github_app');
    });

    it('should create GitHub App strategy and set user token when provided', () => {
      const userToken = 'ghu_test_token';
      const strategy = factory.createGitHubAppStrategy(userToken);

      expect(strategy).toBeInstanceOf(GitHubAppAuthenticationStrategy);
      expect(strategy.type).toBe('github_app');
    });
  });

  describe('Strategy Caching Behavior', () => {
    it('should return same instance for multiple calls without clearing cache', () => {
      const strategies = Array.from({ length: 5 }, () => factory.createStrategy('pat'));
      const allSame = strategies.every((s) => s === strategies[0]);

      expect(allSame).toBe(true);
    });

    it('should create new instances after cache clear', () => {
      const strategy1 = factory.createStrategy('pat');
      factory.clearCache();
      const strategy2 = factory.createStrategy('pat');
      factory.clearCache();
      const strategy3 = factory.createStrategy('pat');

      expect(strategy1).not.toBe(strategy2);
      expect(strategy2).not.toBe(strategy3);
      expect(strategy1).not.toBe(strategy3);
    });

    it('should cache strategies independently per type', () => {
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
