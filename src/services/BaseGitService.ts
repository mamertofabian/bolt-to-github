export type UploadProgress = {
  status: 'uploading' | 'success' | 'error';
  progress: number;
  message: string;
};

export type ProgressCallback = (progress: UploadProgress) => void;

export abstract class BaseGitService {
  protected constructor(protected token: string) {}

  protected abstract get baseUrl(): string;
  protected abstract get apiVersion(): string;
  protected abstract get acceptHeader(): string;

  async request(method: string, endpoint: string, body?: any, options: RequestInit = {}) {
    const url = `${this.baseUrl}/${this.apiVersion}${endpoint}`;

    const response = await fetch(url, {
      method,
      ...options,
      headers: {
        Accept: this.acceptHeader,
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw await this.handleError(response);
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

  protected abstract handleError(response: Response): Promise<Error>;

  protected async uploadFile(
    path: string,
    content: string,
    options: { message?: string; branch?: string } = {}
  ): Promise<any> {
    const body = {
      content: typeof content === 'string' ? content : JSON.stringify(content),
      message: options.message || 'Update file',
      branch: options.branch || 'main'
    };

    return this.request('PUT', path, body);
  }

  protected async downloadFile(path: string): Promise<any> {
    return this.request('GET', path);
  }

  protected async deleteFile(
    path: string,
    options: { message?: string; branch?: string } = {}
  ): Promise<any> {
    const body = {
      message: options.message || 'Delete file',
      branch: options.branch || 'main'
    };

    return this.request('DELETE', path, body);
  }

  protected async updateProgress(
    callback: ProgressCallback | undefined,
    progress: number,
    message: string,
    status: 'uploading' | 'success' | 'error' = 'uploading'
  ): Promise<void> {
    if (callback) {
      callback({
        status,
        progress,
        message
      });
    }
  }
}
