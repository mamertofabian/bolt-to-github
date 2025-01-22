export type PermissionCheckProgress = {
  permission: 'repos' | 'admin' | 'code';
  isValid: boolean;
};

export type ProgressCallback = (progress: PermissionCheckProgress) => void;

export abstract class BaseGitHubService {
  protected baseUrl = 'https://api.github.com';

  constructor(protected token: string) {}

  async request(method: string, endpoint: string, body?: any, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      ...options,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorDetails;
      try {
        errorDetails = await response.json();
      } catch {
        errorDetails = { message: response.statusText };
      }

      const errorMessage = errorDetails.message || errorDetails.error || 'Unknown GitHub API error';
      const fullErrorMessage = `GitHub API Error (${response.status}): ${errorMessage}`;

      const apiError = new Error(fullErrorMessage) as any;
      apiError.status = response.status;
      apiError.originalMessage = errorMessage;
      apiError.githubErrorResponse = errorDetails;

      throw apiError;
    }

    return await response.json();
  }
}
