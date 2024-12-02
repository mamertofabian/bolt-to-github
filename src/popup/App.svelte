<script lang="ts">
  import { onMount } from "svelte";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Tabs, TabsContent } from "$lib/components/ui/tabs";
  import Header from "$lib/components/Header.svelte";
  import SocialLinks from "$lib/components/SocialLinks.svelte";
  import StatusAlert from "$lib/components/StatusAlert.svelte";
  import GitHubSettings from "$lib/components/GitHubSettings.svelte";
  import { COFFEE_LINK, GITHUB_LINK, YOUTUBE_LINK } from "$lib/constants";
  import Footer from "$lib/components/Footer.svelte";
  import type { GitHubSettingsInterface } from "$lib/types";
  import ProjectsList from "$lib/components/ProjectsList.svelte";

  let githubToken: string = "";
  let repoOwner = "";
  let repoName = "";
  let branch = "main";
  let projectSettings: Record<string, { repoName: string; branch: string }> = {};
  let status = "";
  let uploadProgress = 0;
  let uploadStatus = "idle";
  let uploadMessage = "";
  let isSettingsValid = false;
  let activeTab = "home";
  let currentUrl: string = '';
  let isBoltSite: boolean = false;
  let githubSettings: GitHubSettingsInterface;
  let parsedProjectId: string | null = null;
  const version = chrome.runtime.getManifest().version;
  let hasStatus = false;

  onMount(async () => {
    // Add dark mode to the document
    document.documentElement.classList.add('dark');

    githubSettings = await chrome.storage.sync.get([
      "githubToken",
      "repoOwner",
      "projectSettings"
    ]) as GitHubSettingsInterface;

    githubToken = githubSettings.githubToken || "";
    repoOwner = githubSettings.repoOwner || "";
    projectSettings = githubSettings.projectSettings || {};

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log(`📄 App: ${tabs[0]?.url}`);
    if (tabs[0]?.url) {
      currentUrl = tabs[0].url;
      isBoltSite = currentUrl.includes('bolt.new');
      
      if (isBoltSite) {
        const match = currentUrl.match(/bolt\.new\/~\/([^\/]+)/);
        parsedProjectId = match?.[1] || null;
        console.log(`📄 App: ${parsedProjectId}`);
        // Get projectId from storage
        const projectId = await chrome.storage.sync.get('projectId');

        if (match && parsedProjectId && projectId.projectId === parsedProjectId) {
          if (projectSettings[parsedProjectId]) {
            console.log('📄 App: projectSettings[parsedProjectId]', projectSettings[parsedProjectId]);
            repoName = projectSettings[parsedProjectId].repoName;
            branch = projectSettings[parsedProjectId].branch;
          } else {
            // Use project ID as default repo name for new projects
            repoName = parsedProjectId;
            console.log('📄 App: saving new project settings');
            saveSettings();
          }
        }
      }
    }

    checkSettingsValidity();

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "UPLOAD_STATUS") {
        uploadStatus = message.status;
        uploadProgress = message.progress || 0;
        uploadMessage = message.message || "";
      }
    });
  });

  function checkSettingsValidity() {
    isSettingsValid = Boolean(githubToken && repoOwner && repoName && branch);
  }

  async function saveSettings() {
    try {
      const settings = {
        githubToken: githubToken || "",
        repoOwner: repoOwner || "",
        projectSettings
      };

      if (parsedProjectId) {
        projectSettings[parsedProjectId] = { repoName, branch };
        settings.projectSettings = projectSettings;
      }

      await chrome.storage.sync.set(settings);
      status = "Settings saved successfully!";
      hasStatus = true;
      checkSettingsValidity();
      setTimeout(() => {
        status = "";
        hasStatus = false;
      }, 3000);
    } catch (error) {
      status = "Error saving settings";
      hasStatus = true;
      console.error(error);
    }
  }

  function handleSwitchTab(event: CustomEvent<string>) {
    activeTab = event.detail;
  }
</script>

<main class="w-[400px] min-h-[400px] p-4 bg-slate-950 text-slate-50">
  {#if isBoltSite && parsedProjectId}
  <Tabs bind:value={activeTab} class="w-full">
    <Header />

    <TabsContent value="home">
      <Card class="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <img src="/assets/icons/icon48.png" alt="Bolt to GitHub" class="w-5 h-5" />
            Bolt to GitHub <span class="text-xs text-slate-400">v{version}</span>
          </CardTitle>
          <CardDescription class="text-slate-400">
            Upload and sync your Bolt projects directly to GitHub
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusAlert 
            {isSettingsValid} 
            projectId={parsedProjectId}
            gitHubUsername={repoOwner}
            {repoName}
            {branch}
            on:switchTab={handleSwitchTab}
          />

          <div class="mt-6 space-y-4">
            <SocialLinks {GITHUB_LINK} {YOUTUBE_LINK} {COFFEE_LINK} />
          </div>
        </CardContent>
        <Footer />
      </Card>
    </TabsContent>

    <TabsContent value="projects">
      <Card class="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription class="text-slate-400">
            Manage your Bolt projects and their GitHub repositories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectsList {projectSettings} {repoOwner} />
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="settings">
      <Card class="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle>GitHub Settings</CardTitle>
          <CardDescription class="text-slate-400">
            Configure your GitHub repository settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GitHubSettings
            bind:githubToken
            bind:repoOwner
            bind:repoName
            bind:branch
            projectId={parsedProjectId}
            {status}
            {isSettingsValid}
            buttonDisabled={hasStatus}
            onSave={saveSettings}
            onInput={checkSettingsValidity}
          />
        </CardContent>
      </Card>
    </TabsContent>
    </Tabs>
  {:else}
  <Card class="border-slate-800 bg-slate-900">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <img src="/assets/icons/icon48.png" alt="Bolt to GitHub" class="w-5 h-5" />
        Bolt to GitHub <span class="text-xs text-slate-400">v{version}</span>
      </CardTitle>
      <CardDescription class="text-slate-400">
        Upload and sync your Bolt projects directly to GitHub
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ProjectsList {projectSettings} {repoOwner} />
    </CardContent>
    <Footer />
  </Card>
  {/if}
</main>

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
