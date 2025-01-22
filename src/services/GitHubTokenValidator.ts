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

  isFineGrainedToken(): boolean {
    return this.token.startsWith('github_pat_');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async verifyFineGrainedPermissions(username: string): Promise<{ isValid: boolean; error?: string }> {
    if (!this.isFineGrainedToken()) {
      return { isValid: false, error: 'Not a fine-grained token' };
    }

    try {
      // Create a temporary test repo
      const timestamp = Date.now();
      const repoName = `test-repo-${timestamp}`;
      
      // Test repository creation (All repositories access + Admin Write)
      try {
        await this.request('POST', '/user/repos', {
          name: repoName,
          private: true,
          auto_init: true
        });
        await this.delay(1000); // Wait for repo creation
      } catch (error) {
        return { 
          isValid: false, 
          error: 'Token lacks repository creation permission' 
        };
      }

      // Test visibility change (Admin Write)
      try {
        await this.request('PATCH', `/repos/${username}/${repoName}`, {
          private: false
        });
        await this.delay(1000);
      } catch (error) {
        // Cleanup repo before returning
        await this.request('DELETE', `/repos/${username}/${repoName}`);
        return { 
          isValid: false, 
          error: 'Token lacks repository administration permission' 
        };
      }

      // Test content write
      try {
        const content = btoa('test'); // Convert to base64
        const response = await this.request('PUT', `/repos/${username}/${repoName}/contents/test.txt`, {
          message: 'Add test file',
          content: content
        });
        await this.delay(1000);

        // Test content delete
        await this.request('DELETE', `/repos/${username}/${repoName}/contents/test.txt`, {
          message: 'Remove test file',
          sha: response.content.sha
        });
        await this.delay(1000);
      } catch (error) {
        // Cleanup repo before returning
        await this.request('DELETE', `/repos/${username}/${repoName}`);
        return { 
          isValid: false, 
          error: 'Token lacks repository contents read/write permission' 
        };
      }

      // Cleanup: Delete the test repository
      await this.request('DELETE', `/repos/${username}/${repoName}`);
      
      return { isValid: true };
    } catch (error) {
      console.error('Permission verification failed:', error);
      return { 
        isValid: false, 
        error: `Permission verification failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private async validateClassicToken(username: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      const authUser = await this.request('GET', '/user');
      
      if (!authUser.login) {
        return { isValid: false, error: 'Invalid GitHub token' };
      }

      if (authUser.login.toLowerCase() === username.toLowerCase()) {
        return { isValid: true };
      }

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
