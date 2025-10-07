/**
 * Test Token Fixtures with Security Safeguards
 *
 * ⚠️ SECURITY NOTICE:
 * - All tokens in this file use TEST_ prefix to prevent production usage
 * - These tokens follow GitHub token patterns for testing ONLY
 * - NEVER replace these with real GitHub tokens
 * - Production code should reject tokens starting with TEST_
 *
 * Token Pattern Reference:
 * - Classic PAT: ghp_[40 chars]
 * - Fine-grained PAT: github_pat_[82 chars]
 * - GitHub App: ghs_[40 chars]
 * - GitHub App Installation: ghu_[40 chars]
 * - OAuth Access: gho_[40 chars]
 * - OAuth Refresh: ghr_[40 chars]
 */

// Test token prefix - all test tokens MUST start with this
export const TEST_TOKEN_PREFIX = 'TEST_' as const;

/**
 * Validates that a token is a test token and not a real token
 * @param token Token to validate
 * @returns true if token is a valid test token
 */
export function isTestToken(token: string): boolean {
  return token.startsWith(TEST_TOKEN_PREFIX);
}

/**
 * Validates that a token is safe for testing (not a real GitHub token)
 * @param token Token to validate
 * @throws Error if token appears to be a real GitHub token
 */
export function ensureTestTokenSafety(token: string): void {
  // Check if it looks like a real GitHub token without TEST_ prefix
  const realTokenPatterns = [
    /^ghp_[a-zA-Z0-9]{36,}$/,
    /^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$/,
    /^ghs_[a-zA-Z0-9]{36,}$/,
    /^ghu_[a-zA-Z0-9]{36,}$/,
    /^gho_[a-zA-Z0-9]{36,}$/,
    /^ghr_[a-zA-Z0-9]{36,}$/,
  ];

  for (const pattern of realTokenPatterns) {
    if (pattern.test(token) && !isTestToken(token)) {
      throw new Error(
        'SECURITY ERROR: Real GitHub token pattern detected in test fixtures! ' +
          'All test tokens must start with TEST_ prefix. ' +
          'Never commit real tokens to the repository.'
      );
    }
  }
}

// =============================================================================
// PERSONAL ACCESS TOKEN (PAT) FIXTURES
// =============================================================================

/**
 * Personal Access Token test fixtures
 * These simulate various PAT token states for testing
 */
export const TokenFixtures = {
  /**
   * Personal Access Token (PAT) fixtures
   */
  pat: {
    /**
     * Classic PAT token - valid format for testing authentication
     * Format: TEST_ghp_[40 chars]
     */
    classic: `${TEST_TOKEN_PREFIX}ghp_1234567890abcdef1234567890abcdef`,

    /**
     * Fine-grained PAT token - valid format for testing granular permissions
     * Format: TEST_github_pat_[82 chars]
     */
    fineGrained: `${TEST_TOKEN_PREFIX}github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz1234567890AB`,

    /**
     * Invalid token format - for testing token validation failures
     */
    invalid: `${TEST_TOKEN_PREFIX}invalid-token-format`,

    /**
     * Expired token - for testing token expiration handling
     */
    expired: `${TEST_TOKEN_PREFIX}ghp_expired1234567890abcdef1234567890`,

    /**
     * Token with insufficient permissions - for testing permission checks
     */
    readOnly: `${TEST_TOKEN_PREFIX}ghp_readonly1234567890abcdef12345678`,
  },

  /**
   * GitHub App token fixtures
   */
  githubApp: {
    /**
     * Valid GitHub App token
     * Format: TEST_ghs_[40 chars]
     */
    valid: `${TEST_TOKEN_PREFIX}ghs_1234567890abcdef1234567890abcdef`,

    /**
     * GitHub App installation token
     * Format: TEST_ghu_[40 chars]
     */
    installation: `${TEST_TOKEN_PREFIX}ghu_1234567890abcdef1234567890abcdef`,

    /**
     * Invalid GitHub App token - for testing validation
     */
    invalid: `${TEST_TOKEN_PREFIX}invalid-github-app-token`,

    /**
     * Expired GitHub App token
     */
    expired: `${TEST_TOKEN_PREFIX}ghs_expired1234567890abcdef1234567890`,
  },

  /**
   * OAuth token fixtures
   */
  oauth: {
    /**
     * OAuth access token
     * Format: TEST_gho_[40 chars]
     */
    accessToken: `${TEST_TOKEN_PREFIX}gho_1234567890abcdef1234567890abcdef`,

    /**
     * OAuth refresh token
     * Format: TEST_ghr_[40 chars]
     */
    refreshToken: `${TEST_TOKEN_PREFIX}ghr_1234567890abcdef1234567890abcdef`,

    /**
     * Expired OAuth access token
     */
    expiredAccessToken: `${TEST_TOKEN_PREFIX}gho_expired1234567890abcdef12345678`,
  },

  /**
   * Token validation response fixtures
   */
  validation: {
    /**
     * Valid token validation response with full permissions
     */
    valid: {
      scopes: ['repo', 'user', 'admin:repo_hook'],
      note: 'bolt-to-github-extension',
      note_url: null,
      app: {
        name: 'bolt-to-github',
        url: 'https://github.com/mamertofabian/bolt-to-github',
        client_id: 'abcd1234',
      },
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-06-01T12:00:00Z',
      expires_at: null,
      fingerprint: 'abc123def456',
    },

    /**
     * Token validation response with limited scopes
     */
    limitedScopes: {
      scopes: ['public_repo'],
      note: 'limited-access-token',
      note_url: null,
      app: {
        name: 'test-app',
        url: 'https://example.com',
        client_id: 'xyz789',
      },
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-06-01T12:00:00Z',
      expires_at: '2023-12-31T23:59:59Z',
      fingerprint: 'def456ghi789',
    },

    /**
     * Invalid token validation response
     */
    invalid: {
      message: 'Bad credentials',
      documentation_url: 'https://docs.github.com/rest',
    },
  },
} as const;

// =============================================================================
// TOKEN HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a test token for a specific token type
 * @param type Token type to generate
 * @returns Test token string
 */
export function generateTestToken(
  type: 'pat' | 'github_app' | 'oauth' | 'invalid' = 'pat'
): string {
  switch (type) {
    case 'pat':
      return TokenFixtures.pat.classic;
    case 'github_app':
      return TokenFixtures.githubApp.valid;
    case 'oauth':
      return TokenFixtures.oauth.accessToken;
    case 'invalid':
      return TokenFixtures.pat.invalid;
    default:
      return TokenFixtures.pat.classic;
  }
}

/**
 * Strip TEST_ prefix from token for pattern matching tests
 * ONLY use this when you need to test token pattern validation
 * @param token Test token with TEST_ prefix
 * @returns Token without TEST_ prefix
 */
export function stripTestPrefix(token: string): string {
  if (!isTestToken(token)) {
    throw new Error('Can only strip TEST_ prefix from test tokens');
  }
  return token.replace(TEST_TOKEN_PREFIX, '');
}

/**
 * Check if a token pattern matches expected GitHub format
 * This is for testing token validation logic, not for production use
 * @param token Token to check (with or without TEST_ prefix)
 * @param expectedType Expected token type
 * @returns true if token matches pattern
 */
export function matchesTokenPattern(
  token: string,
  expectedType: 'pat' | 'pat-fine-grained' | 'github-app' | 'oauth'
): boolean {
  // Remove TEST_ prefix for pattern matching
  const cleanToken = isTestToken(token) ? stripTestPrefix(token) : token;

  switch (expectedType) {
    case 'pat':
      return cleanToken.startsWith('ghp_');
    case 'pat-fine-grained':
      return cleanToken.startsWith('github_pat_');
    case 'github-app':
      return cleanToken.startsWith('ghs_') || cleanToken.startsWith('ghu_');
    case 'oauth':
      return cleanToken.startsWith('gho_') || cleanToken.startsWith('ghr_');
    default:
      return false;
  }
}

// =============================================================================
// RUNTIME SAFETY CHECKS
// =============================================================================

// Validate all test tokens on module load to ensure safety
if (process.env.NODE_ENV !== 'production') {
  const allTokens = [
    ...Object.values(TokenFixtures.pat),
    ...Object.values(TokenFixtures.githubApp),
    ...Object.values(TokenFixtures.oauth),
  ];

  for (const token of allTokens) {
    if (!isTestToken(token)) {
      console.error(`❌ SECURITY ERROR: Test token does not have TEST_ prefix: ${token}`);
      throw new Error('Test token safety check failed! All tokens must start with TEST_ prefix.');
    }
  }
}

// Export security utilities
export const TestTokenSecurity = {
  isTestToken,
  ensureTestTokenSafety,
  stripTestPrefix,
  matchesTokenPattern,
  TEST_TOKEN_PREFIX,
} as const;
