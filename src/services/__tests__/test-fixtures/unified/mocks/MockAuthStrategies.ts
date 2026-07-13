import type { IAuthenticationStrategy } from '../../../../interfaces/IAuthenticationStrategy';
import type { AuthenticationType } from '../../../../types/authentication';
import { GitHubAPIResponses } from '../api-responses';
import { TokenFixtures, stripTestPrefix } from '../tokens';

/** Configurable GitHub App strategy fake for UnifiedGitHubService tests. */
export class MockGitHubAppAuthenticationStrategy implements IAuthenticationStrategy {
  readonly type: AuthenticationType = 'github_app';
  private userToken?: string;
  private shouldFail = false;
  private shouldFailPermissions = false;
  private shouldFailRenewal = false;
  private validationDelay = 0;
  private needsRenewalResult = false;

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
    return stripTestPrefix(TokenFixtures.githubApp.valid);
  }

  async isConfigured(): Promise<boolean> {
    return Boolean(this.userToken);
  }

  async validateAuth(): Promise<{
    isValid: boolean;
    error?: string;
    userInfo?: { login: string; id: number; avatar_url: string };
    scopes?: string[];
    type?: 'github_app';
  }> {
    await this.simulateDelay();
    if (this.shouldFail || !this.userToken) {
      return {
        isValid: false,
        error: this.shouldFail ? 'GitHub App authentication failed' : 'No user token available',
      };
    }

    return {
      isValid: true,
      userInfo: GitHubAPIResponses.user.valid,
      scopes: ['contents:write', 'issues:write'],
      type: 'github_app',
    };
  }

  async checkPermissions(): Promise<{
    isValid: boolean;
    error?: string;
    permissions: { allRepos: boolean; admin: boolean; contents: boolean };
  }> {
    await this.simulateDelay();
    if (this.shouldFailPermissions) {
      return {
        isValid: false,
        error: 'GitHub App has insufficient permissions',
        permissions: { allRepos: false, admin: false, contents: false },
      };
    }

    return {
      isValid: true,
      permissions: { allRepos: true, admin: false, contents: true },
    };
  }

  async needsRenewal(): Promise<boolean> {
    return this.needsRenewalResult;
  }

  async refreshToken(): Promise<string> {
    if (this.shouldFailRenewal) {
      throw new Error('Failed to refresh GitHub App token');
    }
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
    return this.shouldFail || !this.userToken ? null : GitHubAPIResponses.user.valid;
  }

  async getMetadata(): Promise<Record<string, unknown>> {
    return {
      tokenType: 'github_app',
      installationId: 12345,
      permissions: { contents: 'write', issues: 'write', metadata: 'read' },
    };
  }

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

  reset(): void {
    this.shouldFail = false;
    this.shouldFailPermissions = false;
    this.shouldFailRenewal = false;
    this.needsRenewalResult = false;
    this.validationDelay = 0;
  }

  private async simulateDelay(): Promise<void> {
    if (this.validationDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.validationDelay));
    }
  }
}
