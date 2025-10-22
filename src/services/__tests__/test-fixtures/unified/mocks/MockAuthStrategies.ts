/**
 * Mock Authentication Strategies for Testing
 *
 * This module provides test doubles for authentication strategies used by
 * UnifiedGitHubService. These mocks simulate PAT and GitHub App authentication
 * behaviors with configurable failure modes for comprehensive testing.
 */

import { vi } from 'vitest';
import type { IAuthenticationStrategy } from '../../../../interfaces/IAuthenticationStrategy';
import type { AuthenticationType } from '../../../../types/authentication';
import { TokenFixtures, stripTestPrefix } from '../tokens';
import { GitHubAPIResponses } from '../api-responses';

/**
 * Mock implementation of PAT (Personal Access Token) authentication strategy
 *
 * Provides configurable test double for PAT authentication with support for:
 * - Token validation and permission checking
 * - Configurable failure modes (auth failure, permission failure, renewal failure)
 * - Validation delay simulation for testing async behavior
 * - TEST_ prefix token support for secure testing
 */
export class MockPATAuthenticationStrategy implements IAuthenticationStrategy {
  type: AuthenticationType = 'pat';
  private token: string;
  private shouldFail: boolean = false;
  private shouldFailPermissions: boolean = false;
  private shouldFailRenewal: boolean = false;
  private validationDelay: number = 0;

  constructor(token: string) {
    this.token = token;
  }

  async getToken(): Promise<string> {
    if (this.shouldFail) {
      throw new Error('Failed to get PAT token');
    }
    // Strip TEST_ prefix to simulate real token format
    return this.token.startsWith('TEST_') ? stripTestPrefix(this.token) : this.token;
  }

  async isConfigured(): Promise<boolean> {
    return !!this.token;
  }

  async validateAuth(_repoOwner?: string): Promise<{
    isValid: boolean;
    error?: string;
    userInfo?: { login: string; id: number; avatar_url: string };
    scopes?: string[];
  }> {
    await this.simulateDelay();

    if (this.shouldFail) {
      return {
        isValid: false,
        error: 'Invalid PAT token',
      };
    }

    // Strip TEST_ prefix for pattern validation
    const cleanToken = this.token.startsWith('TEST_') ? stripTestPrefix(this.token) : this.token;

    // Check if the token format is invalid (after removing TEST_ prefix)
    if (!cleanToken.startsWith('ghp_') && !cleanToken.startsWith('github_pat_')) {
      return {
        isValid: false,
        error: 'Invalid PAT token format',
      };
    }

    return {
      isValid: true,
      userInfo: GitHubAPIResponses.user.valid,
      scopes: [...TokenFixtures.validation.valid.scopes],
    };
  }

  async checkPermissions(_repoOwner?: string): Promise<{
    isValid: boolean;
    error?: string;
    permissions: {
      allRepos: boolean;
      admin: boolean;
      contents: boolean;
    };
  }> {
    await this.simulateDelay();

    if (this.shouldFailPermissions) {
      return {
        isValid: false,
        error: 'Insufficient permissions',
        permissions: {
          allRepos: false,
          admin: false,
          contents: false,
        },
      };
    }

    return {
      isValid: true,
      permissions: {
        allRepos: true,
        admin: true,
        contents: true,
      },
    };
  }

  async needsRenewal(): Promise<boolean> {
    return false; // PAT tokens don't typically need renewal
  }

  async refreshToken(): Promise<string> {
    if (this.shouldFailRenewal) {
      throw new Error('PAT tokens cannot be refreshed');
    }
    return this.token; // PAT tokens can't be refreshed
  }

  async clearAuth(): Promise<void> {
    this.token = '';
  }

  async getUserInfo(): Promise<{
    login: string;
    id: number;
    avatar_url: string;
  } | null> {
    if (this.shouldFail || !this.token) {
      return null;
    }
    return GitHubAPIResponses.user.valid;
  }

  async getMetadata(): Promise<{
    scopes?: string[];
    expiresAt?: string;
    lastUsed?: string;
    [key: string]: unknown;
  }> {
    return {
      tokenType: 'pat',
      scopes: [...TokenFixtures.validation.valid.scopes],
      created: TokenFixtures.validation.valid.created_at,
    };
  }

  // Test configuration methods
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setShouldFailPermissions(shouldFail: boolean): void {
    this.shouldFailPermissions = shouldFail;
  }

  setShouldFailRenewal(shouldFail: boolean): void {
    this.shouldFailRenewal = shouldFail;
  }

  setValidationDelay(delay: number): void {
    this.validationDelay = delay;
  }

  private async simulateDelay(): Promise<void> {
    if (this.validationDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.validationDelay));
    }
  }

  reset(): void {
    this.shouldFail = false;
    this.shouldFailPermissions = false;
    this.shouldFailRenewal = false;
    this.validationDelay = 0;
  }
}

/**
 * Mock implementation of GitHub App authentication strategy
 *
 * Provides configurable test double for GitHub App authentication with support for:
 * - User token-based authentication
 * - Token renewal simulation
 * - Configurable failure modes (auth, permissions, renewal)
 * - Validation delay simulation
 */
export class MockGitHubAppAuthenticationStrategy implements IAuthenticationStrategy {
  type: AuthenticationType = 'github_app';
  private userToken?: string;
  private shouldFail: boolean = false;
  private shouldFailPermissions: boolean = false;
  private shouldFailRenewal: boolean = false;
  private validationDelay: number = 0;
  private needsRenewalResult: boolean = false;

  constructor(userToken?: string) {
    this.userToken = userToken;
  }

  async getToken(): Promise<string> {
    if (this.shouldFail) {
      throw new Error('Failed to get GitHub App token');
    }
    if (!this.userToken) {
      throw new Error('No user token available for GitHub App authentication');
    }
    // Strip TEST_ prefix to simulate real token format
    const token = TokenFixtures.githubApp.valid;
    return token.startsWith('TEST_') ? stripTestPrefix(token) : token;
  }

  async isConfigured(): Promise<boolean> {
    return !!this.userToken;
  }

  async validateAuth(_repoOwner?: string): Promise<{
    isValid: boolean;
    error?: string;
    userInfo?: { login: string; id: number; avatar_url: string };
    scopes?: string[];
  }> {
    await this.simulateDelay();

    if (this.shouldFail) {
      return {
        isValid: false,
        error: 'GitHub App authentication failed',
      };
    }

    if (!this.userToken) {
      return {
        isValid: false,
        error: 'No user token available',
      };
    }

    return {
      isValid: true,
      userInfo: GitHubAPIResponses.user.valid,
      scopes: ['repo', 'user'], // GitHub App scopes
    };
  }

  async checkPermissions(_repoOwner?: string): Promise<{
    isValid: boolean;
    error?: string;
    permissions: {
      allRepos: boolean;
      admin: boolean;
      contents: boolean;
    };
  }> {
    await this.simulateDelay();

    if (this.shouldFailPermissions) {
      return {
        isValid: false,
        error: 'GitHub App has insufficient permissions',
        permissions: {
          allRepos: false,
          admin: false,
          contents: false,
        },
      };
    }

    return {
      isValid: true,
      permissions: {
        allRepos: true,
        admin: true,
        contents: true,
      },
    };
  }

  async needsRenewal(): Promise<boolean> {
    return this.needsRenewalResult;
  }

  async refreshToken(): Promise<string> {
    if (this.shouldFailRenewal) {
      throw new Error('Failed to refresh GitHub App token');
    }
    // Simulate token refresh
    return TokenFixtures.githubApp.valid;
  }

  async clearAuth(): Promise<void> {
    this.userToken = undefined;
  }

  async getUserInfo(): Promise<{
    login: string;
    id: number;
    avatar_url: string;
  } | null> {
    if (this.shouldFail || !this.userToken) {
      return null;
    }
    return GitHubAPIResponses.user.valid;
  }

  async getMetadata(): Promise<{
    scopes?: string[];
    expiresAt?: string;
    lastUsed?: string;
    [key: string]: unknown;
  }> {
    return {
      tokenType: 'github_app',
      installationId: 12345,
      appId: 67890,
      permissions: {
        contents: 'write',
        issues: 'write',
        metadata: 'read',
      },
    };
  }

  // Test configuration methods
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setShouldFailPermissions(shouldFail: boolean): void {
    this.shouldFailPermissions = shouldFail;
  }

  setShouldFailRenewal(shouldFail: boolean): void {
    this.shouldFailRenewal = shouldFail;
  }

  setNeedsRenewal(needsRenewal: boolean): void {
    this.needsRenewalResult = needsRenewal;
  }

  setValidationDelay(delay: number): void {
    this.validationDelay = delay;
  }

  setUserToken(token?: string): void {
    this.userToken = token;
  }

  private async simulateDelay(): Promise<void> {
    if (this.validationDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.validationDelay));
    }
  }

  reset(): void {
    this.shouldFail = false;
    this.shouldFailPermissions = false;
    this.shouldFailRenewal = false;
    this.needsRenewalResult = false;
    this.validationDelay = 0;
  }
}

/**
 * Mock factory for creating authentication strategy instances
 *
 * Provides centralized factory for managing mock authentication strategies
 * with support for both PAT and GitHub App authentication types.
 * Includes test configuration methods for controlling strategy behavior.
 */
export class MockAuthenticationStrategyFactory {
  public patStrategy: MockPATAuthenticationStrategy;
  public githubAppStrategy: MockGitHubAppAuthenticationStrategy;
  public currentStrategyType: AuthenticationType = 'pat';

  constructor() {
    this.patStrategy = new MockPATAuthenticationStrategy(TokenFixtures.pat.classic);
    this.githubAppStrategy = new MockGitHubAppAuthenticationStrategy(
      TokenFixtures.oauth.accessToken
    );
  }

  static getInstance = vi.fn(() => new MockAuthenticationStrategyFactory());

  createPATStrategy = vi.fn((token: string): IAuthenticationStrategy => {
    this.patStrategy = new MockPATAuthenticationStrategy(token);
    return this.patStrategy;
  });

  createGitHubAppStrategy = vi.fn((userToken?: string): IAuthenticationStrategy => {
    this.githubAppStrategy = new MockGitHubAppAuthenticationStrategy(userToken);
    return this.githubAppStrategy;
  });

  getCurrentStrategy = vi.fn(async (): Promise<IAuthenticationStrategy> => {
    return this.currentStrategyType === 'pat' ? this.patStrategy : this.githubAppStrategy;
  });

  // Test configuration methods
  setPATStrategy(strategy: MockPATAuthenticationStrategy): void {
    this.patStrategy = strategy;
  }

  setGitHubAppStrategy(strategy: MockGitHubAppAuthenticationStrategy): void {
    this.githubAppStrategy = strategy;
  }

  setCurrentStrategyType(type: AuthenticationType): void {
    this.currentStrategyType = type;
  }

  getPATStrategy(): MockPATAuthenticationStrategy {
    return this.patStrategy;
  }

  getGitHubAppStrategy(): MockGitHubAppAuthenticationStrategy {
    return this.githubAppStrategy;
  }

  reset(): void {
    this.patStrategy.reset();
    this.githubAppStrategy.reset();
    this.currentStrategyType = 'pat';
    vi.clearAllMocks();
  }
}
