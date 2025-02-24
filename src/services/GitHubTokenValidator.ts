import { BaseGitHubService, type ProgressCallback } from './BaseGitHubService';

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

  isFineGrainedToken(): boolean {
    return this.token.startsWith('github_pat_');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async verifyTokenPermissions(
    username: string,
    onProgress?: ProgressCallback
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      // First determine if username refers to an organization
      let isOrg = false;
      let testOwner = username;
      let authUser;

      try {
        authUser = await this.request('GET', '/user');
        
        // Check if the owner is not the current user
        if (username.toLowerCase() !== authUser.login.toLowerCase()) {
          try {
            const targetUser = await this.request('GET', `/users/${username}`);
            isOrg = targetUser.type === 'Organization';
            
            // If it's an org, check if the user is a member
            if (isOrg) {
              const orgs = await this.request('GET', '/user/orgs');
              const hasOrgAccess = orgs.some(
                (org: any) => org.login.toLowerCase() === username.toLowerCase()
              );
              
              if (!hasOrgAccess) {
                return {
                  isValid: false,
                  error: 'Token does not have access to this organization',
                };
              }
            } else {
              // If not an org and not the current user, they can't create repos here
              return {
                isValid: false,
                error: 'Token can only be used with your GitHub username or organizations you have access to',
              };
            }
          } catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
              return { isValid: false, error: 'Invalid GitHub username or organization' };
            }
            throw error;
          }
        }
      } catch (error) {
        return { isValid: false, error: 'Invalid GitHub token' };
      }
      
      // Create a temporary test repo
      const timestamp = Date.now();
      const repoName = `test-repo-${timestamp}`;

      // Test repository creation (All repositories access)
      try {
        if (isOrg) {
          // Create in organization
          await this.request('POST', `/orgs/${username}/repos`, {
            name: repoName,
            private: true,
            auto_init: true,
          });
        } else {
          // Create in user account
          await this.request('POST', '/user/repos', {
            name: repoName,
            private: true,
            auto_init: true,
          });
        }
        await this.delay(2000);
        onProgress?.({ permission: 'repos', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'repos', isValid: false });
        console.error('Repository creation failed:', error);
        return {
          isValid: false,
          error: `Token lacks repository creation permission${isOrg ? ' for this organization' : ''}`,
        };
      }

      // Test visibility change (Admin Write)
      try {
        await this.request('PATCH', `/repos/${username}/${repoName}`, {
          private: false,
        });
        await this.delay(2000);
        onProgress?.({ permission: 'admin', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'admin', isValid: false });
        console.error('Repo visibility change failed:', error);
        // Cleanup repo before returning
        try {
          await this.request('DELETE', `/repos/${username}/${repoName}`);
        } catch (cleanupError) {
          console.error('Failed to cleanup repository after admin check:', cleanupError);
        }
        return {
          isValid: false,
          error: `Token lacks repository administration permission${isOrg ? ' for this organization' : ''}`,
        };
      }

      try {
        // Test contents read by listing contents
        await this.request('GET', `/repos/${username}/${repoName}/contents`);

        // Test contents write with a small .gitkeep file
        const content = btoa(''); // empty file in base64
        await this.request('PUT', `/repos/${username}/${repoName}/contents/.gitkeep`, {
          message: 'Test write permission',
          content: content,
        });
        onProgress?.({ permission: 'code', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'code', isValid: false });
        console.error('Content read/write check failed:', error);
        // Cleanup repo before returning
        try {
          await this.request('DELETE', `/repos/${username}/${repoName}`);
        } catch (cleanupError) {
          console.error('Failed to cleanup repository after contents check:', cleanupError);
        }
        return {
          isValid: false,
          error: `Token lacks repository contents read/write permission${isOrg ? ' for this organization' : ''}`,
        };
      }

      // Cleanup: Delete the test repository
      try {
        await this.request('DELETE', `/repos/${username}/${repoName}`, undefined, {
          // Add accept header to handle empty response
          headers: {
            accept: 'application/vnd.github+json',
          },
        });
      } catch (error) {
        console.error('Failed to cleanup test repository:', error);
        // Don't return error here as permissions were already verified
      }

      return { isValid: true };
    } catch (error) {
      console.error('Permission verification failed:', error);
      return {
        isValid: false,
        error: `Permission verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async validateClassicToken(
    username: string
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const authUser = await this.request('GET', '/user');

      if (!authUser.login) {
        return { isValid: false, error: 'Invalid GitHub token' };
      }

      if (authUser.login.toLowerCase() === username.toLowerCase()) {
        return { isValid: true };
      }

      // Check if username refers to an organization
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
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
          return { isValid: false, error: 'Invalid GitHub username or organization' };
        }
        throw error;
      }

      return {
        isValid: false,
        error:
          'Token can only be used with your GitHub username or organizations you have access to',
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return { isValid: false, error: 'Invalid GitHub username or organization' };
      }
      return { isValid: false, error: 'Invalid GitHub token' };
    }
  }

  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      return await this.validateClassicToken(username);
    } catch (error) {
      console.error('Validation failed:', error);
      return { isValid: false, error: 'Validation failed' };
    }
  }
}