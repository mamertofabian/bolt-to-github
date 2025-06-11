/**
 * Comprehensive test fixtures for GitHubAppService
 * Provides realistic test data covering normal, edge, and error cases
 */

import type {
  GitHubAppConfig,
  GitHubAppInstallation,
  GitHubAppTokenResponse,
  GitHubAppErrorResponse,
  TokenValidationResult,
  PermissionCheckResult,
  AuthenticationStorage,
} from '../../types/authentication';

// ===========================
// Normal Case Test Data
// ===========================

export const validGitHubAppConfig: GitHubAppConfig = {
  installationId: 12345678,
  accessToken: 'ghs_1234567890abcdefghijklmnopqrstuvwxyz12',
  refreshToken: 'ghr_refresh1234567890abcdefghijklmnopqrstuvwxyz',
  expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
  refreshTokenExpiresAt: new Date(Date.now() + 15552000000).toISOString(), // 6 months from now
  githubUsername: 'testuser',
  githubUserId: 1234567,
  avatarUrl: 'https://avatars.githubusercontent.com/u/1234567?v=4',
  scopes: ['repo', 'user:email'],
};

export const validInstallation: GitHubAppInstallation = {
  id: 12345678,
  account: {
    login: 'testuser',
    id: 1234567,
    avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
    type: 'User',
  },
  permissions: {
    contents: 'write',
    metadata: 'read',
    pull_requests: 'write',
    issues: 'write',
    actions: 'write',
  },
  repositories: [
    {
      id: 987654321,
      name: 'test-repo',
      full_name: 'testuser/test-repo',
      private: false,
    },
    {
      id: 987654322,
      name: 'private-repo',
      full_name: 'testuser/private-repo',
      private: true,
    },
  ],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T12:00:00Z',
};

export const validTokenResponse: GitHubAppTokenResponse = {
  access_token: 'ghs_1234567890abcdefghijklmnopqrstuvwxyz12',
  github_username: 'testuser',
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  scopes: ['repo', 'user:email'],
  type: 'github_app',
  renewed: false,
};

export const renewedTokenResponse: GitHubAppTokenResponse = {
  ...validTokenResponse,
  access_token: 'ghs_renewed567890abcdefghijklmnopqrstuvwxyz',
  renewed: true,
};

export const validInstallationTokenResponse = {
  github_username: 'testuser',
  token: 'ghs_installation567890abcdefghijklmnopqrstuv',
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  type: 'installation' as const,
  installation_id: 12345678,
  permissions: {
    contents: 'write',
    metadata: 'read',
    pull_requests: 'write',
    issues: 'write',
  },
  repositories: 'all' as const,
};

export const validTokenValidationResult: TokenValidationResult = {
  isValid: true,
  userInfo: {
    login: 'testuser',
    id: 1234567,
    avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
  },
  scopes: ['repo', 'user:email'],
  type: 'github_app',
};

export const validPermissionCheckResult: PermissionCheckResult = {
  isValid: true,
  permissions: {
    allRepos: true,
    admin: false,
    contents: true,
  },
};

// ===========================
// Edge Case Test Data
// ===========================

export const expiredGitHubAppConfig: GitHubAppConfig = {
  ...validGitHubAppConfig,
  expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  refreshTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(), // Still valid
};

export const nearExpiryGitHubAppConfig: GitHubAppConfig = {
  ...validGitHubAppConfig,
  expiresAt: new Date(Date.now() + 240000).toISOString(), // 4 minutes from now
};

export const minimalGitHubAppConfig: GitHubAppConfig = {
  installationId: 12345678,
};

export const organizationInstallation: GitHubAppInstallation = {
  ...validInstallation,
  account: {
    login: 'test-org',
    id: 7654321,
    avatar_url: 'https://avatars.githubusercontent.com/u/7654321?v=4',
    type: 'Organization',
  },
};

export const restrictedInstallationTokenResponse = {
  ...validInstallationTokenResponse,
  permissions: {
    contents: 'read',
    metadata: 'read',
  },
  repositories: [
    {
      id: 987654321,
      name: 'allowed-repo',
      full_name: 'testuser/allowed-repo',
    },
  ],
};

export const noScopesTokenResponse: GitHubAppTokenResponse = {
  ...validTokenResponse,
  scopes: [],
};

export const partialPermissionsResult: PermissionCheckResult = {
  isValid: true,
  permissions: {
    allRepos: false,
    admin: false,
    contents: true,
  },
};

// ===========================
// Error Case Test Data
// ===========================

export const noGitHubAppError: GitHubAppErrorResponse = {
  error: 'No GitHub App configuration found',
  code: 'NO_GITHUB_APP',
  requires_auth: true,
  has_installation: false,
};

export const noAccessTokenError: GitHubAppErrorResponse = {
  error: 'No access token available',
  code: 'NO_ACCESS_TOKEN',
  requires_auth: true,
  has_installation: true,
};

export const tokenExpiredNoRefreshError: GitHubAppErrorResponse = {
  error: 'Access token expired and no refresh token available',
  code: 'TOKEN_EXPIRED_NO_REFRESH',
  requires_auth: true,
  expired_at: new Date(Date.now() - 3600000).toISOString(),
};

export const tokenRenewalFailedError: GitHubAppErrorResponse = {
  error: 'Failed to renew access token',
  code: 'TOKEN_RENEWAL_FAILED',
  details: 'Refresh token is invalid or expired',
};

export const noInstallationError: GitHubAppErrorResponse = {
  error: 'No GitHub App installation found',
  code: 'NO_INSTALLATION',
  requires_auth: true,
};

export const installationTokenError: GitHubAppErrorResponse = {
  error: 'Failed to get installation token',
  code: 'INSTALLATION_TOKEN_ERROR',
  details: 'Installation suspended or removed',
};

export const invalidTokenValidationResult: TokenValidationResult = {
  isValid: false,
  error: 'Token validation failed',
};

export const authFailedTokenValidationResult: TokenValidationResult = {
  isValid: false,
  error: 'Re-authentication required: Access token expired and no refresh token available',
};

export const permissionDeniedResult: PermissionCheckResult = {
  isValid: false,
  error: 'Permission check failed',
  permissions: {
    allRepos: false,
    admin: false,
    contents: false,
  },
};

// ===========================
// Chrome Storage Test Data
// ===========================

export const validAuthStorageData: AuthenticationStorage = {
  githubAppInstallationId: 12345678,
  githubAppAccessToken: 'ghs_1234567890abcdefghijklmnopqrstuvwxyz12',
  githubAppRefreshToken: 'ghr_refresh1234567890abcdefghijklmnopqrstuvwxyz',
  githubAppExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  githubAppRefreshTokenExpiresAt: new Date(Date.now() + 15552000000).toISOString(),
  githubAppUsername: 'testuser',
  githubAppUserId: 1234567,
  githubAppAvatarUrl: 'https://avatars.githubusercontent.com/u/1234567?v=4',
  githubAppScopes: ['repo', 'user:email'],
  authenticationMethod: 'github_app',
};

export const expiredAuthStorageData: AuthenticationStorage = {
  ...validAuthStorageData,
  githubAppExpiresAt: new Date(Date.now() - 3600000).toISOString(),
};

export const minimalAuthStorageData: AuthenticationStorage = {
  githubAppInstallationId: 12345678,
  authenticationMethod: 'github_app',
};

export const emptyAuthStorageData: AuthenticationStorage = {};

// ===========================
// Supabase Response Test Data
// ===========================

export const validOAuthFlowResponse = {
  success: true,
  github_username: 'testuser',
  avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
  scopes: ['repo', 'user:email'],
  installation_id: 12345678,
  installation_found: true,
};

export const oAuthFlowNoInstallationResponse = {
  ...validOAuthFlowResponse,
  installation_id: null,
  installation_found: false,
};

export const validSupabaseAuthToken = {
  access_token: 'sb_access_token_1234567890',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'sb_refresh_token_1234567890',
  user: {
    id: 'user-uuid-1234',
    email: 'test@example.com',
  },
};

// ===========================
// GitHub API Response Test Data
// ===========================

export const validGitHubUserResponse = {
  login: 'testuser',
  id: 1234567,
  avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
  name: 'Test User',
  email: 'test@example.com',
  public_repos: 42,
  followers: 100,
  following: 50,
  created_at: '2020-01-01T00:00:00Z',
};

export const rateLimitErrorResponse = {
  message: 'API rate limit exceeded',
  documentation_url:
    'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
};

export const unauthorizedErrorResponse = {
  message: 'Bad credentials',
  documentation_url: 'https://docs.github.com/rest',
};

// ===========================
// Utility Functions for Test Data
// ===========================

/**
 * Generate a GitHub App config with custom expiry time
 */
export function createGitHubAppConfigWithExpiry(expiresInMs: number): GitHubAppConfig {
  return {
    ...validGitHubAppConfig,
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

/**
 * Generate test data for various OAuth states
 */
export function createOAuthTestStates() {
  return {
    pending: 'state_pending_12345',
    completed: 'state_completed_67890',
    invalid: 'state_invalid_xxxxx',
  };
}

/**
 * Generate test OAuth codes
 */
export function createOAuthTestCodes() {
  return {
    valid: 'code_valid_1234567890abcdef',
    expired: 'code_expired_fedcba0987654321',
    invalid: 'code_invalid_xxxxxxxxxxxx',
  };
}

/**
 * Create a batch of test repositories
 */
export function createTestRepositories(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: 987654320 + i,
    name: `test-repo-${i + 1}`,
    full_name: `testuser/test-repo-${i + 1}`,
    private: i % 2 === 0,
  }));
}
