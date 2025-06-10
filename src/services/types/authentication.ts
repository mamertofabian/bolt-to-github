/**
 * Authentication types and interfaces for unified GitHub authentication
 * Supports both Personal Access Tokens (PAT) and GitHub Apps
 */

export type AuthenticationType = 'pat' | 'github_app';

export interface AuthenticationConfig {
  type: AuthenticationType;
  token?: string; // For PAT authentication
  githubAppConfig?: GitHubAppConfig; // For GitHub App authentication
}

export interface GitHubAppConfig {
  installationId?: number;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  refreshTokenExpiresAt?: string;
  githubUsername?: string;
  githubUserId?: number;
  avatarUrl?: string;
  scopes?: string[];
}

export interface GitHubAppInstallation {
  id: number;
  account: {
    login: string;
    id: number;
    avatar_url: string;
    type: 'User' | 'Organization';
  };
  permissions: Record<string, string>;
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  created_at: string;
  updated_at: string;
}

export interface GitHubAppTokenResponse {
  access_token: string;
  github_username: string;
  expires_at: string;
  scopes: string[];
  type: 'github_app';
  renewed: boolean;
}

export interface GitHubAppErrorResponse {
  error: string;
  code:
    | 'NO_GITHUB_APP'
    | 'NO_ACCESS_TOKEN'
    | 'TOKEN_EXPIRED_NO_REFRESH'
    | 'TOKEN_RENEWAL_FAILED'
    | 'NO_INSTALLATION'
    | 'INSTALLATION_TOKEN_ERROR';
  requires_auth?: boolean;
  has_installation?: boolean;
  expired_at?: string;
  details?: string;
}

export interface AuthenticationResult {
  success: boolean;
  token?: string;
  type: AuthenticationType;
  error?: string;
  requiresReauth?: boolean;
  userInfo?: {
    username: string;
    avatarUrl?: string;
    scopes?: string[];
  };
}

export interface TokenValidationResult {
  isValid: boolean;
  error?: string;
  userInfo?: {
    login: string;
    id: number;
    avatar_url: string;
  };
  scopes?: string[];
  type?: 'classic' | 'fine-grained' | 'github_app';
}

export interface PermissionCheckResult {
  isValid: boolean;
  error?: string;
  permissions: {
    allRepos: boolean;
    admin: boolean;
    contents: boolean;
  };
}

/**
 * Storage interface for authentication data
 */
export interface AuthenticationStorage {
  // PAT Storage (existing)
  githubToken?: string;
  repoOwner?: string;

  // GitHub App Storage (new)
  githubAppInstallationId?: number;
  githubAppAccessToken?: string;
  githubAppRefreshToken?: string;
  githubAppExpiresAt?: string;
  githubAppRefreshTokenExpiresAt?: string;
  githubAppUsername?: string;
  githubAppUserId?: number;
  githubAppAvatarUrl?: string;
  githubAppScopes?: string[];

  // Authentication Method Selection
  authenticationMethod?: AuthenticationType;

  // Migration Status
  migrationPromptShown?: boolean;
  lastMigrationPrompt?: string;
}
