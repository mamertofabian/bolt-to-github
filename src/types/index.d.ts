export interface GithubConfig {
    token: string;
    owner: string;
    repo: string;
    branch: string;
  }
  
  export interface ProcessingStatus {
    status: 'idle' | 'processing' | 'success' | 'error';
    message?: string;
  }