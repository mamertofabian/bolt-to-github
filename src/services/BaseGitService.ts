export type PermissionCheckProgress = {
  permission: 'repos' | 'admin' | 'code';
  isValid: boolean;
};

export type ProgressCallback = (progress: PermissionCheckProgress) => void;

export abstract class BaseGitService {
  protected abstract get baseUrl(): string;
  protected abstract get apiVersion(): string;
  protected abstract get acceptHeader(): string;

  constructor(protected token: string) {}

  async request(method: string, endpoint: string, body?: any, options: RequestInit = {}) {
    const url = `${this.baseUrl}/${this.apiVersion}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: this.acceptHeader,
      ...options.headers,
    };

    // Only add Content-Type for requests with body
    if (body && method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
    }

    // Don't include body for GET/HEAD requests
    const requestBody = (method === 'GET' || method === 'HEAD') ? undefined : 
      body ? JSON.stringify(body) : undefined;

    const response = await fetch(url, {
      method,
      ...options,
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      let errorDetails;
      try {
        errorDetails = await response.json();
      } catch {
        errorDetails = { message: response.statusText };
      }

      const errorMessage = errorDetails.message || errorDetails.error || 'Unknown GitLab API error';
      const fullErrorMessage = `GitLab API Error (${response.status}): ${errorMessage}`;

      const apiError = new Error(fullErrorMessage) as any;
      apiError.status = response.status;
      apiError.originalMessage = errorMessage;
      apiError.gitlabErrorResponse = errorDetails;

      throw apiError;
    }

    // Return null for 204 No Content responses
    if (response.status === 204) {
      return null;
    }

    // Only try to parse JSON if there's actual content
    const contentLength = response.headers.get('content-length');
    const hasContent = contentLength === null || parseInt(contentLength) > 0;

    if (hasContent) {
      return await response.json();
    }

    return null;
  }
}
