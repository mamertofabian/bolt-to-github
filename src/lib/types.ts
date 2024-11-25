export interface GitHubSettingsInterface {
    githubToken: string;
    repoOwner: string;
    projectSettings?: Record<string, { repoName: string; branch: string }>;
}
