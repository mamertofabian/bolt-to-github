import { BaseGitService, type ProgressCallback } from './BaseGitService';

export class GitLabTokenValidator extends BaseGitService {
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
      // Verify read access by listing user's projects
      try {
        await this.request('GET', `/users/${encodeURIComponent(username)}/projects`);
        onProgress?.({ permission: 'read_repository', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'read_repository', isValid: false });
        return {
          isValid: false,
          error: 'Token lacks repository read permission',
        };
      }

      // Verify write access by checking token scopes
      try {
        const token = await this.request('GET', '/personal_access_tokens');
        const hasWriteAccess = token.scopes?.includes('write_repository');
        onProgress?.({ permission: 'write_repository', isValid: hasWriteAccess });
        
        if (!hasWriteAccess) {
          return {
            isValid: false,
            error: 'Token lacks repository write permission',
          };
        }
      } catch (error) {
        onProgress?.({ permission: 'write_repository', isValid: false });
        return {
          isValid: false,
          error: 'Token lacks repository write permission',
        };
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

  private async validateTokenInternal(
    username: string
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const authUser = await this.request('GET', '/user', undefined, {
        headers: {
          'PRIVATE-TOKEN': this.token
        }
      });

      if (!authUser.username) {
        return { isValid: false, error: 'Invalid GitLab token' };
      }

      if (authUser.username.toLowerCase() === username.toLowerCase()) {
        return { isValid: true };
      }

      // Check if user has access to the namespace
      const namespaces = await this.request('GET', `/namespaces?search=${encodeURIComponent(username)}`, undefined, {
        headers: {
          'PRIVATE-TOKEN': this.token
        }
      });
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
      return await this.validateTokenInternal(username);
    } catch (error) {
      console.error('Validation failed:', error);
      return { isValid: false, error: 'Validation failed' };
    }
  }
}
