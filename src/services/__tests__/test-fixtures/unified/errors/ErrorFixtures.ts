/**
 * GitHub Error Response Fixtures
 *
 * Realistic error scenarios for testing GitHub API error handling
 */

export const ErrorFixtures = {
  /**
   * Authentication errors - 401 Unauthorized
   */
  unauthorized: {
    status: 401,
    statusText: 'Unauthorized',
    error: {
      message: 'Bad credentials',
      documentation_url: 'https://docs.github.com/rest',
    },
  },

  /**
   * Permission errors - 403 Forbidden
   */
  forbidden: {
    status: 403,
    statusText: 'Forbidden',
    error: {
      message: 'Resource not accessible by personal access token',
      documentation_url:
        'https://docs.github.com/rest/overview/permissions-required-for-github-apps',
    },
  },

  /**
   * Resource not found - 404 Not Found
   */
  notFound: {
    status: 404,
    statusText: 'Not Found',
    error: {
      message: 'Not Found',
      documentation_url: 'https://docs.github.com/rest',
    },
  },

  /**
   * Rate limiting - 429 Too Many Requests
   */
  rateLimited: {
    status: 429,
    statusText: 'Too Many Requests',
    headers: {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
      'x-ratelimit-used': '5000',
      'retry-after': '3600',
    },
    error: {
      message: 'API rate limit exceeded for user ID 12345678.',
      documentation_url:
        'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
    },
  },

  /**
   * Validation errors - 422 Unprocessable Entity
   */
  validationFailed: {
    status: 422,
    statusText: 'Unprocessable Entity',
    error: {
      message: 'Validation Failed',
      errors: [
        {
          resource: 'Issue',
          field: 'title',
          code: 'missing_field',
        },
      ],
      documentation_url: 'https://docs.github.com/rest/issues/issues#create-an-issue',
    },
  },

  /**
   * Server errors - 500 Internal Server Error
   */
  serverError: {
    status: 500,
    statusText: 'Internal Server Error',
    error: {
      message: 'Server Error',
    },
  },

  /**
   * Bad gateway - 502 Bad Gateway
   */
  badGateway: {
    status: 502,
    statusText: 'Bad Gateway',
    error: {
      message: 'Server Error',
    },
  },

  /**
   * Repository specific errors - disabled repository
   */
  repositoryDisabled: {
    status: 403,
    statusText: 'Forbidden',
    error: {
      message: 'Repository access blocked',
      documentation_url:
        'https://docs.github.com/rest/overview/resources-in-the-rest-api#forbidden',
    },
  },

  /**
   * Repository specific errors - empty repository
   */
  repositoryEmpty: {
    status: 404,
    statusText: 'Not Found',
    error: {
      message: 'This repository is empty.',
      documentation_url: 'https://docs.github.com/rest',
    },
  },

  /**
   * Network errors - for simulating network failures
   */
  networkError: new Error('Network request failed'),

  /**
   * Timeout errors - for simulating request timeouts
   */
  timeoutError: new Error('Request timeout'),

  /**
   * Abort errors - for simulating aborted requests
   */
  abortError: new Error('Request aborted'),
} as const;

/**
 * Factory function to create custom HTTP error response
 */
export function createHttpErrorResponse(
  status: number,
  message: string,
  statusText: string = 'Error'
) {
  return {
    status,
    statusText,
    error: {
      message,
      documentation_url: 'https://docs.github.com/rest',
    },
  };
}

/**
 * Factory function to create custom network error
 */
export function createNetworkError(message: string = 'Network request failed'): Error {
  return new Error(message);
}
