/**
 * Example: How to Update Existing Code to Use UnifiedGitHubService
 *
 * This file demonstrates how to migrate existing code from GitHubService
 * to UnifiedGitHubService while maintaining backward compatibility.
 */

import { UnifiedGitHubService } from '../services/UnifiedGitHubService';
import { AuthenticationStrategyFactory } from '../services/AuthenticationStrategyFactory';
import type { AuthenticationConfig } from '../services/types/authentication';

/**
 * Example 1: Drop-in replacement for existing GitHubService usage
 *
 * This shows how UnifiedGitHubService can be used as a direct replacement
 */

class ExampleService {
  private githubService: UnifiedGitHubService | null = null;

  // Simple PAT authentication (backward compatible)
  async initializeWithPAT(githubToken: string) {
    this.githubService = new UnifiedGitHubService(githubToken);

    // All existing methods work exactly the same!
    const isValid = await this.githubService.validateTokenAndUser('username');
    const repos = await this.githubService.listRepos();

    // NEW: Additional methods available
    const authType = await this.githubService.getAuthenticationType();
    const needsRenewal = await this.githubService.needsRenewal();

    return { isValid, repos, authType, needsRenewal };
  }

  // GitHub App authentication
  async initializeWithGitHubApp() {
    this.githubService = new UnifiedGitHubService({ type: 'github_app' });

    // Same API, different authentication method
    const isValid = await this.githubService.validateTokenAndUser('username');
    const repos = await this.githubService.listRepos();

    return { isValid, repos };
  }
}

/**
 * Example 2: Advanced usage with authentication method detection
 */
class SmartGitHubServiceWrapper {
  private unifiedService: UnifiedGitHubService | null = null;
  private factory: AuthenticationStrategyFactory;

  constructor() {
    this.factory = AuthenticationStrategyFactory.getInstance();
  }

  /**
   * Automatically detects and uses the appropriate authentication method
   */
  async initialize(): Promise<{
    service: UnifiedGitHubService;
    authType: 'pat' | 'github_app';
    isValid: boolean;
  }> {
    // Get current authentication strategy
    const strategy = await this.factory.getCurrentStrategy();

    // Create configuration based on detected method
    const config: AuthenticationConfig = {
      type: strategy.type,
    };

    // For PAT, we need to get the token
    if (strategy.type === 'pat') {
      try {
        const token = await strategy.getToken();
        config.token = token;
      } catch (error) {
        throw new Error('PAT token not found. Please configure your GitHub token.');
      }
    }
    // For GitHub App, the strategy handles token management internally

    // Create unified service
    this.unifiedService = new UnifiedGitHubService(config);

    // Validate authentication
    const validation = await strategy.validateAuth();

    return {
      service: this.unifiedService,
      authType: strategy.type,
      isValid: validation.isValid,
    };
  }

  /**
   * Example of handling both authentication methods seamlessly
   */
  async performGitHubOperation(repoOwner: string, repoName: string) {
    if (!this.unifiedService) {
      const { service, authType } = await this.initialize();
      this.unifiedService = service;
      console.log(`Initialized with ${authType} authentication`);
    }

    try {
      // These operations work the same regardless of authentication method
      const repoExists = await this.unifiedService.repoExists(repoOwner, repoName);

      if (!repoExists) {
        const newRepo = await this.unifiedService.createRepo(repoName);
        console.log('Created new repository:', newRepo.html_url);
      }

      const repoInfo = await this.unifiedService.getRepoInfo(repoOwner, repoName);
      return repoInfo;
    } catch (error) {
      // Handle authentication renewal if needed
      if (error instanceof Error && error.message.includes('authentication')) {
        console.log('Authentication needs renewal, trying to refresh...');

        try {
          await this.unifiedService.refreshAuth();
          console.log('Authentication refreshed successfully');

          // Retry the operation
          return await this.performGitHubOperation(repoOwner, repoName);
        } catch (refreshError) {
          throw new Error('Authentication renewal failed. Please re-authenticate.');
        }
      }

      throw error;
    }
  }
}

/**
 * Example 3: Migration helper for existing codebases
 */
export class GitHubServiceMigrationHelper {
  /**
   * Utility to help migrate existing GitHubService instantiations
   */
  static async createUnifiedService(legacyToken?: string): Promise<UnifiedGitHubService> {
    if (legacyToken) {
      // Direct migration - use provided token
      return new UnifiedGitHubService(legacyToken);
    }

    // Smart migration - detect current configuration
    try {
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      if (authMethod === 'github_app') {
        // User has GitHub App configured
        return new UnifiedGitHubService({ type: 'github_app' });
      } else {
        // Try to get PAT from storage
        const syncSettings = await chrome.storage.sync.get(['githubToken']);
        if (syncSettings.githubToken) {
          return new UnifiedGitHubService(syncSettings.githubToken);
        }
      }
    } catch (error) {
      console.warn('Failed to detect authentication method:', error);
    }

    // Fallback to auto-detection
    const factory = AuthenticationStrategyFactory.getInstance();
    const currentStrategy = await factory.getCurrentStrategy();

    return new UnifiedGitHubService({
      type: currentStrategy.type,
    });
  }

  /**
   * One-liner replacement for existing GitHubService instantiations
   */
  static async replace(githubToken: string): Promise<UnifiedGitHubService> {
    return new UnifiedGitHubService(githubToken);
  }
}

/**
 * Example 4: Testing both authentication methods
 */
export class DualAuthTester {
  async testBothMethods(repoOwner: string) {
    const factory = AuthenticationStrategyFactory.getInstance();
    const allStrategies = await factory.getAllConfiguredStrategies();

    console.log('Testing configured authentication methods...');

    for (const [type, strategy] of Object.entries(allStrategies)) {
      console.log(`\nTesting ${type} authentication:`);

      try {
        const service = new UnifiedGitHubService({
          type: type as 'pat' | 'github_app',
        });

        const validation = await service.validateTokenAndUser(repoOwner);
        const repos = await service.listRepos();

        console.log(`✅ ${type}: Valid (${repos.length} repositories)`);

        if (validation.userInfo) {
          console.log(`   User: ${validation.userInfo.login}`);
        }
      } catch (error) {
        console.log(`❌ ${type}: ${error instanceof Error ? error.message : 'Failed'}`);
      }
    }
  }
}

// Export examples for easy testing
export { ExampleService, SmartGitHubServiceWrapper };

/**
 * Usage Examples:
 *
 * // Simple migration (drop-in replacement)
 * const service = new UnifiedGitHubService(githubToken);
 *
 * // Smart initialization
 * const wrapper = new SmartGitHubServiceWrapper();
 * const { service, authType } = await wrapper.initialize();
 *
 * // Migration helper
 * const service = await GitHubServiceMigrationHelper.createUnifiedService();
 *
 * // Testing
 * const tester = new DualAuthTester();
 * await tester.testBothMethods('username');
 */
