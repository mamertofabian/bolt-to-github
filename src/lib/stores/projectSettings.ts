import { writable, derived, type Writable } from 'svelte/store';
import { createLogger } from '../utils/logger';
import { ChromeStorageService } from '../services/chromeStorage';
import { extractProjectIdFromUrl } from '../utils/projectId';

const logger = createLogger('ProjectSettingsStore');

// Project Settings State Interface
export interface ProjectSettingsState {
  currentUrl: string;
  isBoltSite: boolean;
  parsedProjectId: string | null;
  version: string;
  projectTitle: string;
}

// Initial state
const initialState: ProjectSettingsState = {
  currentUrl: '',
  isBoltSite: false,
  parsedProjectId: null,
  version: '',
  projectTitle: 'My Project',
};

// Create the writable store
export const projectSettingsStore: Writable<ProjectSettingsState> = writable(initialState);

// Derived stores
export const isOnBoltProject = derived(
  projectSettingsStore,
  ($project) => $project.isBoltSite && $project.parsedProjectId !== null
);

export const currentProjectId = derived(
  projectSettingsStore,
  ($project) => $project.parsedProjectId
);

export const currentProjectTitle = derived(
  projectSettingsStore,
  ($project) => $project.projectTitle
);

// Store actions
export const projectSettingsActions = {
  /**
   * Initialize project settings with extension version
   */
  initialize(): void {
    const version = chrome.runtime.getManifest().version;
    projectSettingsStore.update((state) => ({
      ...state,
      version,
    }));
  },

  /**
   * Update current URL and detect if it's a Bolt site
   */
  setCurrentUrl(url: string): void {
    const isBoltSite = url.includes('bolt.new');
    let parsedProjectId: string | null = null;

    if (isBoltSite) {
      parsedProjectId = extractProjectIdFromUrl(url);

      // Load project title if we have a project ID
      if (parsedProjectId) {
        this.loadProjectTitle(parsedProjectId);
      }
    }

    projectSettingsStore.update((state) => ({
      ...state,
      currentUrl: url,
      isBoltSite,
      parsedProjectId,
    }));
  },

  /**
   * Set project ID directly (useful for storage-based project loading)
   */
  setProjectId(projectId: string | null): void {
    projectSettingsStore.update((state) => ({
      ...state,
      parsedProjectId: projectId,
    }));
  },

  /**
   * Set project title for easier identification
   */
  setProjectTitle(title: string): void {
    projectSettingsStore.update((state) => ({
      ...state,
      projectTitle: title,
    }));
  },

  /**
   * Load project title from storage
   */
  async loadProjectTitle(projectId: string): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['projectSettings']);
      const projectSettings = result.projectSettings || {};
      const projectData = projectSettings[projectId];

      if (projectData && projectData.projectTitle) {
        this.setProjectTitle(projectData.projectTitle);
      } else {
        this.setProjectTitle('');
      }
    } catch (error) {
      logger.error('Error loading project title:', error);
      this.setProjectTitle('');
    }
  },

  /**
   * Parse project ID from URL
   */
  parseProjectIdFromUrl(url: string): string | null {
    return extractProjectIdFromUrl(url);
  },

  /**
   * Check if current URL is a Bolt site
   */
  isBoltUrl(url: string): boolean {
    return url.includes('bolt.new');
  },

  /**
   * Detect current tab and update project state
   */
  async detectCurrentProject(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.url) {
        this.setCurrentUrl(tabs[0].url);

        // Always set the project ID from the current tab's URL
        const currentProjectId = this.parseProjectIdFromUrl(tabs[0].url);

        if (currentProjectId) {
          this.setProjectId(currentProjectId);
          logger.info(`🎯 Detected project ID from active tab: ${currentProjectId}`);

          // Update the stored project ID to match the current tab
          await ChromeStorageService.set({ projectId: currentProjectId });
        } else {
          // Clear project ID if not on a project page
          projectSettingsStore.update((state) => ({
            ...state,
            parsedProjectId: null,
          }));
        }
      }
    } catch (error) {
      logger.error('Error detecting current project:', error);
    }
  },

  /**
   * Get current project state
   */
  async getCurrentState(): Promise<ProjectSettingsState> {
    return new Promise((resolve) => {
      const unsubscribe = projectSettingsStore.subscribe((state) => {
        unsubscribe();
        resolve(state);
      });
    });
  },

  /**
   * Reset project state
   */
  reset(): void {
    projectSettingsStore.update((state) => ({
      ...state,
      currentUrl: '',
      isBoltSite: false,
      parsedProjectId: null,
      projectTitle: '',
    }));
  },
};
