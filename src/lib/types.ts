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
  | 'OPEN_HOME'
  | 'OPEN_SETTINGS'
  | 'OPEN_FILE_CHANGES'
  | 'OPEN_ISSUES'
  | 'OPEN_PROJECTS'
  | 'IMPORT_PRIVATE_REPO'
  | 'DELETE_TEMP_REPO'
  | 'PUSH_TO_GITHUB'
  | 'USE_CACHED_FILES'
  | 'HEARTBEAT'
  | 'HEARTBEAT_RESPONSE'
  | 'GITHUB_APP_SYNCED'
  | 'SUBSCRIPTION_UPGRADED'
  | 'SYNC_BOLT_PROJECTS';

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
  // Enhanced GitHub metadata fields for migration readiness
  is_private?: boolean;
  language?: string;
  description?: string;
  commit_count?: number;
  latest_commit_date?: string;
  latest_commit_message?: string;
  latest_commit_sha?: string;
  latest_commit_author?: string;
  open_issues_count?: number;
  github_updated_at?: string;
  default_branch?: string;
  // Cache metadata
  metadata_last_updated?: string;
  github_repo_url?: string;
}

export type ProjectSettings = Record<string, ProjectSetting>;

export interface GitHubSettingsInterface {
  githubToken: string;
  repoOwner: string;
  projectSettings?: ProjectSettings;
  // New authentication method fields
  authenticationMethod?: 'pat' | 'github_app';
  githubAppInstallationId?: number;
  githubAppUsername?: string;
  githubAppAvatarUrl?: string;
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

/**
 * Interface for onboarding data storage
 */
export interface OnboardingData {
  installDate: string;
  onboardingCompleted: boolean;
  completedSteps: string[];
  installedVersion: string;
  welcomePageViewed: boolean;
}

/**
 * Interface for usage data tracking
 */
export interface UsageData {
  installDate: string;
  lastActiveDate: string;
  totalPushes: number;
  authMethod: 'github-app' | 'pat' | 'none';
  extensionVersion: string;
  errorCount: number;
  lastError?: string;
}

/**
 * Interface for error log entry
 */
export interface ErrorLogEntry {
  timestamp: string;
  message: string;
  context: string;
  stack?: string;
}

/**
 * Interface for telemetry settings
 */
export interface TelemetrySettings {
  enabled: boolean;
  anonymousId?: string;
}

/**
 * Extended interface for Bolt projects with sync metadata
 * Matches backend ExtensionProject schema
 */
export interface BoltProject extends ProjectSetting {
  // Local extension fields
  id: string;

  // Backend schema fields (from ExtensionProject interface)
  bolt_project_id: string;
  project_name: string; // Required by backend
  project_description?: string;
  github_repo_owner?: string;
  github_repo_name?: string;
  github_branch?: string; // Backend uses github_branch, not branch
  github_repo_url?: string;
  is_private?: boolean;
  last_modified?: string;

  // Local sync metadata (not sent to backend)
  version?: number;
  sync_status?: 'pending' | 'synced' | 'error';
}

/**
 * Interface for sync request to backend
 */
export interface SyncRequest {
  localProjects: BoltProject[];
  lastSyncTimestamp?: string;
  conflictResolution?: 'auto-resolve' | 'keep-local' | 'keep-remote';
}

/**
 * Interface for sync response from backend
 */
export interface SyncResponse {
  success: boolean;
  updatedProjects: BoltProject[];
  conflicts: Array<{
    project: BoltProject;
    error?: string;
    dbProject?: BoltProject;
    conflict?: string;
    message?: string;
  }>;
  deletedProjects: string[];
  error?: string;
}
