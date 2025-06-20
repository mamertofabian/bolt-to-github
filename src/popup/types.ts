import type { GitHubSettingsState, ProjectSettingsState, UIState } from '../lib/stores';
import type { Message } from '../lib/types';

// Component reference types
export type ProjectStatusRef = {
  refreshProjectStatus: () => Promise<void>;
  [key: string]: unknown;
} | null;

// Message handler types
export type UploadStatusMessage = Message & {
  status?: string;
  progress?: number;
  message?: string;
};

export type FileChangesMessage = Message & {
  type: 'FILE_CHANGES';
  changes: Record<string, unknown>;
  projectId: string;
};

// Upgrade handler types
export type UpgradeType = 'fileChanges' | 'issues' | 'branchSelector' | 'pushReminders' | string;

export interface UpgradeClickHandler {
  (type: UpgradeType): void;
}

// Component prop types
export interface HomeTabProps {
  projectStatusRef: ProjectStatusRef;
  githubSettings: GitHubSettingsState;
  upgradeClick: UpgradeClickHandler;
}

export interface SettingsTabProps {
  githubSettings: GitHubSettingsState;
  uiState: UIState;
  upgradeClick: UpgradeClickHandler;
}

export interface OnboardingViewProps {
  githubSettings: GitHubSettingsState;
  projectSettings: ProjectSettingsState;
  uiState: UIState;
}

export interface HelpTabProps {
  projectSettings: ProjectSettingsState;
}

// Premium features type for upgrade modal
export interface PremiumFeature {
  id: string;
  name: string;
  description: string;
  icon: string;
}

// Chrome API type
export interface ChromeAPI {
  runtime: {
    getManifest(): chrome.runtime.Manifest;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: chrome.runtime.ExtensionMessageEvent;
  };
  storage: {
    local: chrome.storage.StorageArea;
  };
  tabs?: {
    create(properties: chrome.tabs.CreateProperties): void;
  };
}
