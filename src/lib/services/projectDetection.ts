import { ChromeStorageService } from './chromeStorage';

// Project Detection Service
export class ProjectDetectionService {
  private static readonly BOLT_DOMAIN = 'bolt.new';
  private static readonly PROJECT_URL_PATTERN = /bolt\.new\/~\/([^/]+)/;

  /**
   * Check if a URL is a Bolt site
   */
  static isBoltUrl(url: string): boolean {
    return url.includes(this.BOLT_DOMAIN);
  }

  /**
   * Extract project ID from Bolt URL
   */
  static parseProjectIdFromUrl(url: string): string | null {
    const match = url.match(this.PROJECT_URL_PATTERN);
    return match?.[1] || null;
  }

  /**
   * Get the current active tab information
   */
  static async getCurrentTabInfo(): Promise<{
    url: string | null;
    isBoltSite: boolean;
    projectId: string | null;
  }> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tabs[0]?.url || null;

      if (!url) {
        return {
          url: null,
          isBoltSite: false,
          projectId: null,
        };
      }

      const isBoltSite = this.isBoltUrl(url);
      const projectId = isBoltSite ? this.parseProjectIdFromUrl(url) : null;

      return {
        url,
        isBoltSite,
        projectId,
      };
    } catch (error) {
      console.error('Error getting current tab info:', error);
      return {
        url: null,
        isBoltSite: false,
        projectId: null,
      };
    }
  }

  /**
   * Detect and validate current project against stored project ID
   */
  static async detectAndValidateCurrentProject(): Promise<{
    url: string | null;
    isBoltSite: boolean;
    projectId: string | null;
    isValidProject: boolean;
  }> {
    const tabInfo = await this.getCurrentTabInfo();

    if (!tabInfo.projectId) {
      return {
        ...tabInfo,
        isValidProject: false,
      };
    }

    try {
      // Check stored project ID to validate current project
      const storedProjectId = await ChromeStorageService.getCurrentProjectId();
      const isValidProject = !storedProjectId || storedProjectId === tabInfo.projectId;

      return {
        ...tabInfo,
        isValidProject,
      };
    } catch (error) {
      console.error('Error validating current project:', error);
      return {
        ...tabInfo,
        isValidProject: false,
      };
    }
  }

  /**
   * Set current project as active
   */
  static async setCurrentProject(projectId: string): Promise<void> {
    try {
      await ChromeStorageService.saveCurrentProjectId(projectId);
    } catch (error) {
      console.error('Error setting current project:', error);
      throw error;
    }
  }

  /**
   * Get project context information
   */
  static async getProjectContext(): Promise<{
    currentProjectId: string | null;
    tabProjectId: string | null;
    isOnValidProject: boolean;
    projectMismatch: boolean;
  }> {
    try {
      const [storedProjectId, tabInfo] = await Promise.all([
        ChromeStorageService.getCurrentProjectId(),
        this.getCurrentTabInfo(),
      ]);

      const projectMismatch = Boolean(
        storedProjectId && tabInfo.projectId && storedProjectId !== tabInfo.projectId
      );

      const isOnValidProject = Boolean(
        tabInfo.isBoltSite &&
          tabInfo.projectId &&
          (!storedProjectId || storedProjectId === tabInfo.projectId)
      );

      return {
        currentProjectId: storedProjectId,
        tabProjectId: tabInfo.projectId,
        isOnValidProject,
        projectMismatch,
      };
    } catch (error) {
      console.error('Error getting project context:', error);
      return {
        currentProjectId: null,
        tabProjectId: null,
        isOnValidProject: false,
        projectMismatch: false,
      };
    }
  }

  /**
   * Monitor tab changes and detect project switches
   */
  static async monitorTabChanges(
    callback: (projectInfo: {
      url: string | null;
      isBoltSite: boolean;
      projectId: string | null;
      isValidProject: boolean;
    }) => void
  ): Promise<void> {
    try {
      // Set up tab update listener
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.active && tab.url) {
          const projectInfo = await this.detectAndValidateCurrentProject();
          callback(projectInfo);
        }
      });

      // Set up tab activation listener
      chrome.tabs.onActivated.addListener(async (activeInfo) => {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
          const projectInfo = await this.detectAndValidateCurrentProject();
          callback(projectInfo);
        }
      });
    } catch (error) {
      console.error('Error setting up tab monitoring:', error);
    }
  }

  /**
   * Generate project-specific storage key
   */
  static generateProjectStorageKey(projectId: string, suffix: string): string {
    return `project_${projectId}_${suffix}`;
  }

  /**
   * Check if project is accessible (basic validation)
   */
  static async isProjectAccessible(projectId: string): Promise<boolean> {
    try {
      // Basic validation - check if project ID is valid format
      if (!projectId || projectId.trim().length === 0) {
        return false;
      }

      // Check for invalid characters that might cause issues
      const invalidChars = /[<>:"/\\|?*]/;
      if (invalidChars.test(projectId)) {
        return false;
      }

      // Additional validation could be added here
      // For now, assume project is accessible if it passes basic validation
      return true;
    } catch (error) {
      console.error('Error checking project accessibility:', error);
      return false;
    }
  }
}
