// Interfaces for handler classes

export interface IGitHubUploadHandler {
  handleGitHubPush(): Promise<void>;
  validateSettings(): Promise<boolean>;
}

export interface IFileChangeHandler {
  showChangedFiles(): Promise<void>;
  loadProjectFiles(forceRefresh?: boolean): Promise<void>;
}

// Base interface for all handlers
export interface IBaseHandler {
  initialize?(): void | Promise<void>;
}
