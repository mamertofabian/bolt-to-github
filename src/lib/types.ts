export interface Port extends chrome.runtime.Port {
  sender?: chrome.runtime.MessageSender;
}

export type MessageType =
  | 'ZIP_DATA'
  | 'UPLOAD_STATUS'
  | 'SET_COMMIT_MESSAGE'
  | 'DEBUG'
  | 'CONTENT_SCRIPT_READY'
  | 'GITLAB_SETTINGS_CHANGED'
  | 'OPEN_SETTINGS'
  | 'IMPORT_PRIVATE_REPO'
  | 'DELETE_TEMP_REPO';

export interface Message {
  type: MessageType;
  data?: any;
  status?: UploadStatusState;
  message?: string;
}

export interface ProjectSetting {
  repoName: string;
  branch: string;
}

export type ProjectSettings = Record<string, ProjectSetting>;

export interface GitLabSettingsInterface {
  gitlabToken: string;
  repoOwner: string;
  projectSettings?: ProjectSettings;
}

export type ProcessingStatus = 'idle' | 'uploading' | 'success' | 'error';

export type UploadProgress = {
  status: 'uploading' | 'success' | 'error';
  progress: number;
  message: string;
};

export type ProgressCallback = (progress: UploadProgress) => void;

export interface UploadStatusState {
  status: ProcessingStatus;
  message?: string;
  progress?: number;
}

export interface GitConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

// Use this interface for GitLab integration
export interface GitlabConfig extends GitConfig {
  /** GitLab-specific configuration */
  namespace_id?: number;
}
