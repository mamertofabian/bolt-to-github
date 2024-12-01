import { SettingsService } from "../services/settings";
import type { GitHubSettingsInterface } from "../lib/types";

export class StateManager {
    private static instance: StateManager;

    private constructor() { }

    static getInstance(): StateManager {
        if (!this.instance) {
            this.instance = new StateManager();
        }
        return this.instance;
    }

    async getGitHubSettings() {
        return SettingsService.getGitHubSettings();
    }

    async getProjectId() {
        return SettingsService.getProjectId();
    }

    async setProjectId(projectId: string) {
        return SettingsService.setProjectId(projectId);
    }

    private isValidSettings(settings: Partial<GitHubSettingsInterface>): settings is GitHubSettingsInterface {
        return Boolean(
            settings.githubToken &&
            settings.repoOwner
        );
    }
}