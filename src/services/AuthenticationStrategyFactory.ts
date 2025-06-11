/**
 * Authentication Strategy Factory
 * Creates and manages authentication strategies for PAT and GitHub App
 */

import type {
  IAuthenticationStrategy,
  IAuthenticationStrategyFactory,
} from './interfaces/IAuthenticationStrategy';
import type { AuthenticationType } from './types/authentication';
import { PATAuthenticationStrategy } from './PATAuthenticationStrategy';
import { GitHubAppAuthenticationStrategy } from './GitHubAppAuthenticationStrategy';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('AuthenticationStrategyFactory');

export class AuthenticationStrategyFactory implements IAuthenticationStrategyFactory {
  private static instance: AuthenticationStrategyFactory | null = null;
  private strategies: Map<AuthenticationType, IAuthenticationStrategy> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): AuthenticationStrategyFactory {
    if (!AuthenticationStrategyFactory.instance) {
      AuthenticationStrategyFactory.instance = new AuthenticationStrategyFactory();
    }
    return AuthenticationStrategyFactory.instance;
  }

  /**
   * Create an authentication strategy for the given type
   */
  createStrategy(type: AuthenticationType): IAuthenticationStrategy {
    // Return cached strategy if available
    if (this.strategies.has(type)) {
      return this.strategies.get(type)!;
    }

    let strategy: IAuthenticationStrategy;

    switch (type) {
      case 'pat':
        strategy = new PATAuthenticationStrategy();
        break;
      case 'github_app':
        strategy = new GitHubAppAuthenticationStrategy();
        break;
      default:
        throw new Error(`Unsupported authentication type: ${type}`);
    }

    // Cache the strategy
    this.strategies.set(type, strategy);
    return strategy;
  }

  /**
   * Get the default authentication strategy for new users
   * Defaults to GitHub App for new users, but can be configured
   */
  getDefaultStrategy(): IAuthenticationStrategy {
    // For new users, prefer GitHub App
    return this.createStrategy('github_app');
  }

  /**
   * Get the currently configured authentication strategy
   * Falls back to PAT if no configuration is found
   */
  async getCurrentStrategy(): Promise<IAuthenticationStrategy> {
    try {
      // Check what authentication method is configured
      const authMethod = await this.getConfiguredAuthMethod();

      switch (authMethod) {
        case 'github_app': {
          const githubAppStrategy = this.createStrategy('github_app');
          if (await githubAppStrategy.isConfigured()) {
            return githubAppStrategy;
          }
          // Fall through to PAT if GitHub App is not properly configured
          break;
        }
        case 'pat':
        default: {
          const patStrategy = this.createStrategy('pat');
          if (await patStrategy.isConfigured()) {
            return patStrategy;
          }
          break;
        }
      }

      // If no strategy is configured, return the default
      return this.getDefaultStrategy();
    } catch (error) {
      logger.error('Failed to get current strategy:', error);
      // Return PAT as fallback
      return this.createStrategy('pat');
    }
  }

  /**
   * Get the preferred authentication method from storage
   */
  private async getConfiguredAuthMethod(): Promise<AuthenticationType> {
    try {
      const storage = await chrome.storage.local.get('authenticationMethod');
      return storage.authenticationMethod || 'pat'; // Default to PAT for existing users
    } catch (error) {
      logger.error('Failed to get authentication method:', error);
      return 'pat';
    }
  }

  /**
   * Set the authentication method preference
   */
  async setAuthenticationMethod(type: AuthenticationType): Promise<void> {
    try {
      await chrome.storage.local.set({ authenticationMethod: type });
    } catch (error) {
      logger.error('Failed to set authentication method:', error);
      throw new Error('Failed to save authentication method preference');
    }
  }

  /**
   * Get both configured strategies for comparison/migration purposes
   */
  async getAllConfiguredStrategies(): Promise<{
    pat?: IAuthenticationStrategy;
    github_app?: IAuthenticationStrategy;
  }> {
    const result: {
      pat?: IAuthenticationStrategy;
      github_app?: IAuthenticationStrategy;
    } = {};

    try {
      const patStrategy = this.createStrategy('pat');
      if (await patStrategy.isConfigured()) {
        result.pat = patStrategy;
      }

      const githubAppStrategy = this.createStrategy('github_app');
      if (await githubAppStrategy.isConfigured()) {
        result.github_app = githubAppStrategy;
      }
    } catch (error) {
      logger.error('Failed to get all configured strategies:', error);
    }

    return result;
  }

  /**
   * Check if user has multiple authentication methods configured
   */
  async hasMultipleAuthMethods(): Promise<boolean> {
    const strategies = await this.getAllConfiguredStrategies();
    return Object.keys(strategies).length > 1;
  }

  /**
   * Clear all cached strategies (useful for testing or when switching accounts)
   */
  clearCache(): void {
    this.strategies.clear();
  }

  /**
   * Get strategy with token initialization for PAT
   */
  createPATStrategy(token: string): PATAuthenticationStrategy {
    const strategy = new PATAuthenticationStrategy(token);
    // Don't cache token-specific strategies
    return strategy;
  }

  /**
   * Get GitHub App strategy with user token
   */
  createGitHubAppStrategy(userToken?: string): GitHubAppAuthenticationStrategy {
    const strategy = this.createStrategy('github_app') as GitHubAppAuthenticationStrategy;
    if (userToken) {
      strategy.setUserToken(userToken);
    }
    return strategy;
  }
}
