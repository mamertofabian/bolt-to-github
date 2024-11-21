<script lang="ts">
  import { onMount } from "svelte";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Tabs, TabsContent } from "$lib/components/ui/tabs";
  import Header from "$lib/components/Header.svelte";
  import SocialLinks from "$lib/components/SocialLinks.svelte";
  import StatusAlert from "$lib/components/StatusAlert.svelte";
  import UploadProgress from "$lib/components/UploadProgress.svelte";
  import GitHubSettings from "$lib/components/GitHubSettings.svelte";

  let githubToken = "";
  let repoOwner = "";
  let repoName = "";
  let branch = "main";
  let status = "";
  let uploadProgress = 0;
  let uploadStatus = "idle";
  let uploadMessage = "";
  let isSettingsValid = false;
  let activeTab: string = "home";

  const AUTHOR = "AI-Driven Coder";
  const COMPANY = "Codefrost";
  const AUTHOR_SITE = "https://aidrivencoder.com";
  const COMPANY_SITE = "https://codefrost.dev";
  const GITHUB_LINK = "https://github.com/aidrivencoder";
  const YOUTUBE_LINK = "https://youtube.com/@aidrivencoder";
  const COFFEE_LINK = "https://www.buymeacoffee.com/aidrivencoder";

  onMount(async () => {
    const result = await chrome.storage.sync.get([
      "githubToken",
      "repoOwner",
      "repoName",
      "branch",
    ]);

    githubToken = result.githubToken || "";
    repoOwner = result.repoOwner || "";
    repoName = result.repoName || "";
    branch = result.branch || "main";

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
      await chrome.storage.sync.set({
        githubToken,
        repoOwner,
        repoName,
        branch,
      });
      status = "Settings saved successfully!";
      checkSettingsValidity();
      setTimeout(() => {
        status = "";
      }, 3000);
    } catch (error) {
      status = "Error saving settings";
      console.error(error);
    }
  }
</script>
<main class="w-[400px] p-4">
  <Tabs value={activeTab} onValueChange={(value) => activeTab = value} class="w-full">
    <Header />

    <TabsContent value="home">
      <Card>
        <CardHeader>
          <CardTitle>Bolt ZIP to GitHub</CardTitle>
          <CardDescription>
            Upload and sync your Bolt projects directly to GitHub
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusAlert {isSettingsValid} />

          <div class="mt-6 space-y-4">
            <SocialLinks {GITHUB_LINK} {YOUTUBE_LINK} {COFFEE_LINK} />
          </div>
        </CardContent>
        <CardFooter class="text-sm text-gray-500 text-center">
          Created by <a href={AUTHOR_SITE} target="_blank">{AUTHOR}</a> Powered by <a href={COMPANY_SITE} target="_blank">{COMPANY}</a>
        </CardFooter>
      </Card>

      <UploadProgress {uploadStatus} {uploadProgress} {uploadMessage} />
    </TabsContent>

    <TabsContent value="settings">
      <Card>
        <CardHeader>
          <CardTitle>GitHub Settings</CardTitle>
          <CardDescription>
            Configure your GitHub repository settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GitHubSettings
            bind:githubToken
            bind:repoOwner
            bind:repoName
            bind:branch
            {status}
            {isSettingsValid}
            onSave={saveSettings}
            onInput={checkSettingsValidity}
          />
        </CardContent>
      </Card>
    </TabsContent>
  </Tabs>
</main>

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
