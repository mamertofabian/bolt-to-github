import { UnifiedSettingsService } from '../services/UnifiedSettingsService';

export class StateManager {
  private static instance: StateManager;

  private constructor() {}

  static getInstance(): StateManager {
    if (!this.instance) {
      this.instance = new StateManager();
    }
    return this.instance;
  }

  async getGitHubSettings() {
    return UnifiedSettingsService.getGitHubSettings();
  }

  async getProjectId() {
    return UnifiedSettingsService.getProjectId();
  }

  async setProjectId(projectId: string) {
    return UnifiedSettingsService.setProjectId(projectId);
  }
}
