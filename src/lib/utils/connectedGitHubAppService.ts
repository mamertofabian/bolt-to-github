import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
import { checkGitHubConnection } from '$lib/utils/githubConnection';

export async function createConnectedGitHubAppService(): Promise<UnifiedGitHubService> {
  const connection = await checkGitHubConnection();
  if (!connection.connected) {
    throw new Error(connection.message);
  }

  return new UnifiedGitHubService({ type: 'github_app' });
}
