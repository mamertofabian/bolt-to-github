// Interfaces for handler classes

import type { FileChange } from '../../services/FilePreviewService';

export interface IGitHubUploadHandler {
  handleGitHubPush(useStoredChanges?: boolean, skipChangeDetection?: boolean): Promise<void>;
  handleGitHubPushWithFreshComparison(): Promise<void>;
  validateSettings(): Promise<boolean>;
  getProjectInfo(): Promise<{ repoName?: string; branch?: string } | null>;
  isUploadInProgress(): boolean;
}

export interface IFileChangeHandler {
  showChangedFiles(): Promise<void>;
  loadProjectFiles(forceRefresh?: boolean): Promise<void>;
  getCurrentProjectId(): string;
  getChangedFiles(forceRefresh?: boolean): Promise<Map<string, FileChange>>;
}

// Base interface for all handlers
export interface IBaseHandler {
  initialize?(): void | Promise<void>;
}
