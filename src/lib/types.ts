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
  | 'OPEN_FILE_CHANGES'
  | 'OPEN_ISSUES'
  | 'OPEN_PROJECTS'
  | 'IMPORT_PRIVATE_REPO'
  | 'DELETE_TEMP_REPO'
  | 'PUSH_TO_GITHUB'
  | 'USE_CACHED_FILES'
  | 'HEARTBEAT'
  | 'HEARTBEAT_RESPONSE';

export interface Message {
  type: MessageType;
  data?: any;
  status?: UploadStatusState;
  message?: string;
}

export interface ProjectSetting {
  repoName: string;
  branch: string;
  projectTitle?: string;
}

export type ProjectSettings = Record<string, ProjectSetting>;

export interface GitHubSettingsInterface {
  githubToken: string;
  repoOwner: string;
  projectSettings?: ProjectSettings;
}

export type ProcessingStatus =
  | 'idle'
  | 'uploading'
  | 'success'
  | 'error'
  | 'loading'
  | 'analyzing'
  | 'complete';

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

/**
 * Type representing a collection of project files
 * Map of file paths to file contents
 */
export type ProjectFiles = Map<string, string>;

/**
 * Interface for a single push record
 */
export interface PushRecord {
  timestamp: number;
  success: boolean;
  projectId: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  filesCount: number;
  commitMessage: string;
  error?: string;
}

/**
 * Interface for push statistics
 */
export interface PushStatistics {
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  lastPushTimestamp?: number;
  lastSuccessTimestamp?: number;
  records: PushRecord[];
}

/**
 * Interface for push statistics state in the store
 */
export interface PushStatisticsState {
  statistics: PushStatistics;
  isLoading: boolean;
}
