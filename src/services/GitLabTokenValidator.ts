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
      // First verify token scopes by checking user info
      try {
        const user = await this.request('GET', '/user');
        if (!user.username) {
          onProgress?.({ permission: 'read_repository', isValid: false });
          return {
            isValid: false,
            error: 'Invalid GitLab token. Token must have api scope for both read and write access.',
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
              
              // First check if we have access to the project
              try {
                await this.request('GET', `/projects/${project.id}`);
              } catch {
                continue; // Skip projects we can't access
              }
              
              // Try to create a temporary file in the default branch
              try {
                const defaultBranch = await this.request('GET', `/projects/${project.id}`).then(p => p.default_branch || 'main');
                await this.request('POST', `/projects/${project.id}/repository/files/${encodeURIComponent(testPath)}`, {
                  branch: defaultBranch,
                  content: btoa('test'),
                  commit_message: 'Testing write access'
                });
                
                // Clean up the test file
                try {
                  await this.request('DELETE', `/projects/${project.id}/repository/files/${encodeURIComponent(testPath)}`, {
                    branch: defaultBranch,
                    commit_message: 'Cleaning up write access test'
                  });
                } catch (cleanupError) {
                  console.error('Failed to cleanup test file:', cleanupError);
                  // Continue since we verified write access
                }
                
                onProgress?.({ permission: 'write_repository', isValid: true });
                return { isValid: true };
              } catch (error: any) {
                // Check for both 403 (permission denied) and branch-related errors
                if (error.status === 403 || 
                    (error.gitlabErrorResponse?.message || '').toLowerCase().includes('branch')) {
                  continue; // Skip if we don't have write access to this project/branch
                }
                throw error; // Re-throw other errors
              }
            } catch {
              continue; // Try next project
            }
          }
          
          // If we get here, no projects had write access
          onProgress?.({ permission: 'write_repository', isValid: false });
          return {
            isValid: false,
            error: 'Token lacks repository write permission. Please ensure your token has api scope and you have write access to at least one project.',
          };
        } else {
          onProgress?.({ permission: 'write_repository', isValid: false });
          return {
            isValid: false,
            error: 'No projects available to verify write access. Please create a project or get write access to an existing one. Your token must have api scope.',
          };
        }
      } catch (error: any) {
        onProgress?.({ permission: 'write_repository', isValid: false });
        // Use the original GitLab error message if available
        const errorMessage = error.gitlabErrorResponse?.message || error.message || 'Failed to verify write access';
        return {
          isValid: false,
          error: `Failed to verify write access: ${errorMessage}. Please check your token permissions and project access.`,
        };
      }

      return { isValid: true };
    } catch (error: any) {
      console.error('Permission verification failed:', error);
      const errorMessage = error.gitlabErrorResponse?.message || error.message || String(error);
      return {
        isValid: false,
        error: `Permission verification failed: ${errorMessage}`,
      };
    }
  }

  private async validateTokenInternal(
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
      const namespaces = await this.request('GET', `/namespaces?search=${encodeURIComponent(username)}`);
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
    } catch (error: any) {
      if (error.status === 404) {
        return { isValid: false, error: 'Invalid GitLab username or namespace' };
      }
      return { isValid: false, error: 'Invalid GitLab token' };
    }
  }

  async validateTokenAndUser(username: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      return await this.validateTokenInternal(username);
    } catch (error: any) {
      console.error('Validation failed:', error);
      const errorMessage = error.gitlabErrorResponse?.message || error.message || String(error);
      return { isValid: false, error: `Validation failed: ${errorMessage}` };
    }
  }
}
