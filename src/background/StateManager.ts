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

    async getProjectId(): Promise<string | null> {
        try {
            const { projectId } = await chrome.storage.sync.get('projectId');
            return projectId || null;
        } catch (error) {
            console.error('Failed to get project ID:', error);
            return null;
        }
    }

    async setProjectId(projectId: string): Promise<void> {
        try {
            await chrome.storage.sync.set({ projectId });
        } catch (error) {
            console.error('Failed to set project ID:', error);
        }
    }

    private isValidSettings(settings: Partial<GitHubSettingsInterface>): settings is GitHubSettingsInterface {
        return Boolean(
            settings.githubToken &&
            settings.repoOwner
        );
    }
}