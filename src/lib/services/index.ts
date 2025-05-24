// Chrome Services
export { ChromeStorageService } from './chromeStorage';
export { ChromeMessagingService } from './chromeMessaging';

// Business Logic Services
export { ProjectDetectionService } from './projectDetection';

// Existing Enhanced Services (from other modules)
export { FileChangeHandler } from '../../content/handlers/FileChangeHandler';
export {
  BackgroundTempRepoManager,
  STORAGE_KEY as TEMP_REPO_STORAGE_KEY,
} from '../../background/TempRepoManager';

// Service Types
export type {
  GitHubSettingsInterface,
  ProjectSettings,
  Message,
  MessageType,
  UploadStatusState,
  ProcessingStatus,
} from '../types';
