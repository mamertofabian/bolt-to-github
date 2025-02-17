import { SettingsService, type SettingsCheckResult } from '../services/settings';

export class StateManager {
  private static instance: StateManager;

  private constructor() {}

  static getInstance(): StateManager {
    if (!this.instance) {
      this.instance = new StateManager();
    }
    return this.instance;
  }

  async getSettings() {
    return SettingsService.getSettings();
  }

  async getProjectId() {
    return SettingsService.getProjectId();
  }

  async setProjectId(projectId: string) {
    return SettingsService.setProjectId(projectId);
  }
}
