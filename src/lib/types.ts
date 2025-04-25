export interface Port extends chrome.runtime.Port {
  sender?: chrome.runtime.MessageSender;
}

export type MessageType =
  | 'ZIP_DATA'
  | 'UPLOAD_STATUS'
  | 'SET_COMMIT_MESSAGE'
  | 'DEBUG'
  | 'CONTENT_SCRIPT_READY'
  | 'GITHUB_SETTINGS_CHANGED'
  | 'OPEN_SETTINGS'
  | 'IMPORT_PRIVATE_REPO'
  | 'DELETE_TEMP_REPO'
  | 'PUSH_TO_GITHUB';

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

export interface GitHubSettingsInterface {
  githubToken: string;
  repoOwner: string;
  projectSettings?: ProjectSettings;
}

export type ProcessingStatus = 'idle' | 'uploading' | 'success' | 'error';

export interface UploadStatusState {
  status: ProcessingStatus;
  message?: string;
  progress?: number;
}

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}
