/** Safe fake GitHub App and OAuth values used by service tests. */

export const TEST_TOKEN_PREFIX = 'TEST_' as const;

export function isTestToken(token: string): boolean {
  return token.startsWith(TEST_TOKEN_PREFIX);
}

export function ensureTestTokenSafety(token: string): void {
  const realTokenPatterns = [
    /^ghs_[a-zA-Z0-9]{36}$/,
    /^ghu_[a-zA-Z0-9]{36}$/,
    /^gho_[a-zA-Z0-9]{36}$/,
    /^ghr_[a-zA-Z0-9]{36}$/,
  ];

  if (realTokenPatterns.some((pattern) => pattern.test(token)) && !isTestToken(token)) {
    throw new Error(
      'SECURITY ERROR: Real GitHub token pattern detected in test fixtures. ' +
        'All test tokens must start with TEST_.'
    );
  }
}

export const TokenFixtures = {
  githubApp: {
    valid: `${TEST_TOKEN_PREFIX}ghs_FAKEAPP123`,
    installation: `${TEST_TOKEN_PREFIX}ghu_FAKEINSTALL456`,
    invalid: `${TEST_TOKEN_PREFIX}invalid-github-app-token`,
    expired: `${TEST_TOKEN_PREFIX}ghs_EXPIRED789`,
  },
  oauth: {
    accessToken: `${TEST_TOKEN_PREFIX}gho_FAKEACCESS123`,
    refreshToken: `${TEST_TOKEN_PREFIX}ghr_FAKEREFRESH456`,
    expiredAccessToken: `${TEST_TOKEN_PREFIX}gho_EXPIRED789`,
  },
  validation: {
    valid: {
      scopes: ['contents:write', 'issues:write'],
      app: {
        name: 'bolt-to-github',
        url: 'https://github.com/mamertofabian/bolt-to-github',
        client_id: 'abcd1234',
      },
      expires_at: null,
    },
    invalid: {
      message: 'Bad credentials',
      documentation_url: 'https://docs.github.com/rest',
    },
  },
} as const;

export function generateTestToken(type: 'github_app' | 'oauth' | 'invalid' = 'github_app'): string {
  switch (type) {
    case 'oauth':
      return TokenFixtures.oauth.accessToken;
    case 'invalid':
      return TokenFixtures.githubApp.invalid;
    case 'github_app':
    default:
      return TokenFixtures.githubApp.valid;
  }
}

export function stripTestPrefix(token: string): string {
  if (!isTestToken(token)) {
    throw new Error('Can only strip TEST_ prefix from test tokens');
  }
  return token.replace(TEST_TOKEN_PREFIX, '');
}

export function matchesTokenPattern(token: string, expectedType: 'github-app' | 'oauth'): boolean {
  const cleanToken = isTestToken(token) ? stripTestPrefix(token) : token;
  return expectedType === 'github-app'
    ? cleanToken.startsWith('ghs_') || cleanToken.startsWith('ghu_')
    : cleanToken.startsWith('gho_') || cleanToken.startsWith('ghr_');
}

Object.values(TokenFixtures).forEach((category) => {
  Object.values(category).forEach((value) => {
    if (typeof value === 'string') {
      ensureTestTokenSafety(value);
    }
  });
});
