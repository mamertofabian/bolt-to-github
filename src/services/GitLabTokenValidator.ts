import { BaseGitService, type ProgressCallback } from './BaseGitService';

export class GitLabTokenValidator extends BaseGitService {
  async validateToken(): Promise<boolean> {
    try {
      await this.request('GET', '/user');
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  protected get baseUrl(): string {
    return 'https://gitlab.com/api';
  }

  protected get apiVersion(): string {
    return 'v4';
  }

  protected get acceptHeader(): string {
    return 'application/json';
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async verifyTokenPermissions(
    username: string,
    onProgress?: ProgressCallback
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      // Create a temporary test project
      const timestamp = Date.now();
      const projectName = `test-project-${timestamp}`;

      // Test project creation (API access)
      try {
        await this.request('POST', '/projects', {
          name: projectName,
          visibility: 'private',
          initialize_with_readme: true,
        });
        await this.delay(2000);
        onProgress?.({ permission: 'repos', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'repos', isValid: false });
        return {
          isValid: false,
          error: 'Token lacks project creation permission',
        };
      }

      const projectPath = encodeURIComponent(`${username}/${projectName}`);

      // Test visibility change (Admin Write)
      try {
        await this.request('PUT', `/projects/${projectPath}`, {
          visibility: 'public',
        });
        await this.delay(2000);
        onProgress?.({ permission: 'admin', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'admin', isValid: false });
        // Cleanup project before returning
        try {
          await this.request('DELETE', `/projects/${projectPath}`);
        } catch (cleanupError) {
          console.error('Failed to cleanup project after admin check:', cleanupError);
        }
        return {
          isValid: false,
          error: 'Token lacks project administration permission',
        };
      }

      try {
        // Test repository read by listing repository tree
        await this.request('GET', `/projects/${projectPath}/repository/tree`);

        // Test repository write with a small .gitkeep file
        const content = btoa(''); // empty file in base64
        await this.request('POST', `/projects/${projectPath}/repository/files/.gitkeep`, {
          branch: 'main',
          content: content,
          commit_message: 'Test write permission',
        });
        onProgress?.({ permission: 'code', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'code', isValid: false });
        // Cleanup project before returning
        try {
          await this.request('DELETE', `/projects/${projectPath}`);
        } catch (cleanupError) {
          console.error('Failed to cleanup project after repository check:', cleanupError);
        }
        return {
          isValid: false,
          error: 'Token lacks repository read/write permission',
        };
      }

      // Cleanup: Delete the test project
      try {
        await this.request('DELETE', `/projects/${projectPath}`);
      } catch (error) {
        console.error('Failed to cleanup test project:', error);
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

  private async validateToken(
    username: string
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const authUser = await this.request('GET', '/user');

      if (!authUser.username) {
        return { isValid: false, error: 'Invalid GitLab token' };
      }

      if (authUser.username.toLowerCase() === username.toLowerCase()) {
        return { isValid: true };
      }

      // Check if user has access to the namespace
      const namespaces = await this.request('GET', '/namespaces', { search: username });
      const hasAccess = namespaces.some(
        (ns: any) => ns.path.toLowerCase() === username.toLowerCase()
      );

      if (hasAccess) {
        return { isValid: true };
      }

      return {
        isValid: false,
        error:
          'Token can only be used with your GitLab username or namespaces you have access to',
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return { isValid: false, error: 'Invalid GitLab username or namespace' };
      }
      return { isValid: false, error: 'Invalid GitLab token' };
    }
  }

  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      return await this.validateToken(username);
    } catch (error) {
      console.error('Validation failed:', error);
      return { isValid: false, error: 'Validation failed' };
    }
  }
}
