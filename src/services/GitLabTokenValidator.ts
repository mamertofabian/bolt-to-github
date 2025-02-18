import { BaseGitService, type ProgressCallback } from './BaseGitService';

export class GitLabTokenValidator extends BaseGitService {
  protected get baseUrl(): string {
    return 'https://gitlab.com/api/v4';
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
      // First verify token scopes
      try {
        const user = await this.request('GET', '/user');
        if (!user.username) {
          onProgress?.({ permission: 'read_repository', isValid: false });
          return {
            isValid: false,
            error: 'Invalid GitLab token. Please check your token.',
          };
        }
        onProgress?.({ permission: 'read_repository', isValid: true });
      } catch (error) {
        onProgress?.({ permission: 'read_repository', isValid: false });
        return {
          isValid: false,
          error: 'Token lacks read_api scope. Please ensure your token has read_api or api scope.',
        };
      }

      // Verify write access by attempting to create a temporary file
      try {
        // Get user's projects to find one to test write access
        const projects = await this.request('GET', `/users/${encodeURIComponent(username)}/projects`);
        if (projects.length > 0) {
          // Try each project until we find one with write access
          for (const project of projects) {
            try {
              const testPath = `.gitlab-write-test-${Date.now()}`;
              
              // Check if main branch exists
              try {
                await this.request('GET', `/projects/${project.id}/repository/branches/main`);
              } catch {
                continue; // Skip projects without main branch
              }
              
              // Try to create a temporary file
              await this.request('POST', `/projects/${project.id}/repository/files/${encodeURIComponent(testPath)}`, {
                branch: 'main',
                content: btoa('test'),
                commit_message: 'Testing write access'
              });
              
              // Clean up the test file
              try {
                await this.request('DELETE', `/projects/${project.id}/repository/files/${encodeURIComponent(testPath)}`, {
                  branch: 'main',
                  commit_message: 'Cleaning up write access test'
                });
              } catch (cleanupError) {
                console.error('Failed to cleanup test file:', cleanupError);
                // Continue since we verified write access
              }
              
              onProgress?.({ permission: 'write_repository', isValid: true });
              return { isValid: true };
            } catch {
              continue; // Try next project
            }
          }
          
          // If we get here, no projects had write access
          onProgress?.({ permission: 'write_repository', isValid: false });
          return {
            isValid: false,
            error: 'Token lacks repository write permission. Please ensure your token has write_repository scope.',
          };
        } else {
          onProgress?.({ permission: 'write_repository', isValid: false });
          return {
            isValid: false,
            error: 'No projects available to verify write access. Please create a project or get write access to an existing one.',
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
