import { SettingsService } from '../services/settings';
import type { SettingsCheckResult } from '../services/settings';

export class StateManager {
  private static instance: StateManager;

  private constructor() {}

  static getInstance(): StateManager {
    if (!this.instance) {
      this.instance = new StateManager();
    }
    return this.instance;
  }

  async getSettings(): Promise<SettingsCheckResult> {
    return SettingsService.getSettings();
  }

  async getProjectId(): Promise<string | null> {
    return SettingsService.getProjectId();
  }

  async setProjectId(projectId: string): Promise<void> {
    return SettingsService.setProjectId(projectId);
  }
}
