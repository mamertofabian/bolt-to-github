import { BaseGitHubService } from './BaseGitHubService';

export class GitHubTokenValidator extends BaseGitHubService {
  async validateToken(): Promise<boolean> {
    try {
      await this.request('GET', '/user');
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  isClassicToken(): boolean {
    return this.token.startsWith('ghp_');
  }

  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      try {
        const authUser = await this.request('GET', '/user');
        if (!authUser.login) {
          return { isValid: false, error: 'Invalid GitHub token' };
        }

        if (authUser.login.toLowerCase() === username.toLowerCase()) {
          return { isValid: true };
        }

        try {
          const targetUser = await this.request('GET', `/users/${username}`);
          if (targetUser.type === 'Organization') {
            const orgs = await this.request('GET', '/user/orgs');
            const hasOrgAccess = orgs.some(
              (org: any) => org.login.toLowerCase() === username.toLowerCase()
            );
            if (hasOrgAccess) {
              return { isValid: true };
            }
            return { isValid: false, error: 'Token does not have access to this organization' };
          }

          return {
            isValid: false,
            error: 'Token can only be used with your GitHub username or organizations you have access to',
          };
        } catch (error) {
          return { isValid: false, error: 'Invalid GitHub username or organization' };
        }
      } catch (error) {
        return { isValid: false, error: 'Invalid GitHub token' };
      }
    } catch (error) {
      console.error('Validation failed:', error);
      return { isValid: false, error: 'Validation failed' };
    }
  }
}
