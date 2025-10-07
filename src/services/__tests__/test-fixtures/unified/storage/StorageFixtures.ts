/**
 * Storage Fixtures for Chrome Extension and Supabase
 *
 * Realistic storage data for testing persistence and state management
 */

import { TokenFixtures } from '../tokens';

export const StorageFixtures = {
  /**
   * Chrome Extension Storage fixtures
   */
  chromeStorage: {
    /**
     * GitHub settings with PAT token
     */
    githubSettings: {
      gitHubSettings: {
        githubToken: TokenFixtures.pat.classic,
        repoOwner: 'testuser',
        repoName: 'test-repo',
        branch: 'main',
        isPrivateRepo: false,
        commitMessage: 'Update from Bolt',
      },
    },

    /**
     * Authentication method - PAT
     */
    authenticationMethod: {
      authenticationMethod: 'pat' as const,
    },

    /**
     * Authentication method - GitHub App
     */
    githubAppAuth: {
      authenticationMethod: 'github_app' as const,
    },

    /**
     * Supabase authentication token
     */
    supabaseToken: {
      supabaseToken: 'TEST_supabase-jwt-token-here',
      'sb-test-project-auth-token': 'TEST_alternative-storage-key-token',
    },

    /**
     * Project settings
     */
    projectSettings: {
      currentProjectId: 'project-123',
      recentProjects: ['project-123', 'project-456', 'project-789'],
    },

    /**
     * Empty storage (for initialization tests)
     */
    empty: {},
  },

  /**
   * Supabase Storage fixtures
   */
  supabaseStorage: {
    /**
     * Valid Supabase session
     */
    session: {
      access_token: 'TEST_supabase-access-token',
      refresh_token: 'TEST_supabase-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-uuid-123',
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: {},
      },
    },

    /**
     * Expired Supabase session
     */
    expiredSession: {
      access_token: 'TEST_supabase-expired-token',
      refresh_token: 'TEST_supabase-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      token_type: 'bearer',
      user: {
        id: 'user-uuid-123',
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: {},
      },
    },

    /**
     * Null session (logged out)
     */
    nullSession: null,
  },
} as const;

/**
 * Factory function to create custom GitHub settings
 */
export function createGitHubSettings(
  overrides: Partial<typeof StorageFixtures.chromeStorage.githubSettings.gitHubSettings> = {}
) {
  return {
    gitHubSettings: {
      ...StorageFixtures.chromeStorage.githubSettings.gitHubSettings,
      ...overrides,
    },
  };
}

/**
 * Factory function to create custom Supabase session
 */
export function createSupabaseSession(expiresIn: number = 3600, expiresAtOffset: number = 3600) {
  return {
    access_token: 'TEST_supabase-access-token',
    refresh_token: 'TEST_supabase-refresh-token',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresAtOffset,
    token_type: 'bearer',
    user: {
      id: 'user-uuid-123',
      email: 'test@example.com',
      app_metadata: {},
      user_metadata: {},
    },
  };
}
