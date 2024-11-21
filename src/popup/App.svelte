<script lang="ts">
  import {
    Coffee,
    GithubIcon,
    YoutubeIcon,
    Settings,
    AlertTriangle,
    Home,
  } from "lucide-svelte";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "$lib/components/ui/alert";
  import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
  } from "$lib/components/ui/tabs";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { onMount } from "svelte";

  let githubToken = "";
  let repoOwner = "";
  let repoName = "";
  let branch = "main";
  let status = "";
  let uploadProgress = 0;
  let uploadStatus = "idle";
  let uploadMessage = "";
  let isSettingsValid = false;
  let activeTab = "home";

  const AUTHOR = "Your Name";
  const GITHUB_LINK = "https://github.com/yourusername";
  const YOUTUBE_LINK = "https://youtube.com/@yourchannel";
  const COFFEE_LINK = "https://www.buymeacoffee.com/yourusername";

  onMount(async () => {
    // Load settings
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

    // Check settings validity
    checkSettingsValidity();

    // Listen for upload status updates
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

  function openLink(url: string) {
    chrome.tabs.create({ url });
  }
</script>

<main class="w-[400px] p-4">
  <Tabs
    value={activeTab}
    onValueChange={(value) => (activeTab = value)}
    class="w-full"
  >
    <TabsList class="grid w-full grid-cols-2">
      <TabsTrigger value="home" class="flex items-center gap-2">
        <Home class="w-4 h-4" />
        Home
      </TabsTrigger>
      <TabsTrigger value="settings" class="flex items-center gap-2">
        <Settings class="w-4 h-4" />
        Settings
      </TabsTrigger>
    </TabsList>

    <TabsContent value="home">
      <Card>
        <CardHeader>
          <CardTitle>Bolt ZIP to GitHub</CardTitle>
          <CardDescription>
            Upload and sync your Bolt projects directly to GitHub
          </CardDescription>
        </CardHeader>
        <CardContent>
          {#if !isSettingsValid}
            <Alert variant="destructive" class="mb-4">
              <AlertTriangle class="h-4 w-4" />
              <AlertTitle>Missing Configuration</AlertTitle>
              <AlertDescription>
                Please configure your GitHub settings before using the
                extension.
              </AlertDescription>
            </Alert>
          {:else}
            <Alert>
              <AlertTitle>Ready to Use</AlertTitle>
              <AlertDescription>
                Your GitHub configuration is set up and ready to go!
              </AlertDescription>
            </Alert>
          {/if}

          <div class="mt-6 space-y-4">
            <div class="flex justify-center space-x-4">
              <Button
                variant="outline"
                class="flex items-center gap-2"
                on:click={() => openLink(GITHUB_LINK)}
              >
                <GithubIcon class="w-4 h-4" />
                GitHub
              </Button>
              <Button
                variant="outline"
                class="flex items-center gap-2"
                on:click={() => openLink(YOUTUBE_LINK)}
              >
                <YoutubeIcon class="w-4 h-4" />
                YouTube
              </Button>
              <Button
                variant="outline"
                class="flex items-center gap-2"
                on:click={() => openLink(COFFEE_LINK)}
              >
                <Coffee class="w-4 h-4" />
                Buy me a coffee
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter class="text-sm text-gray-500 justify-center">
          Created by {AUTHOR}
        </CardFooter>
      </Card>

      {#if uploadStatus !== "idle"}
        <Card class="mt-4">
          <CardContent class="pt-6">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium">
                {#if uploadStatus === "uploading"}
                  Uploading to GitHub...
                {:else if uploadStatus === "success"}
                  Upload Complete!
                {:else if uploadStatus === "error"}
                  Upload Failed
                {/if}
              </span>
              {#if uploadStatus === "uploading"}
                <span class="text-sm text-gray-600">{uploadProgress}%</span>
              {/if}
            </div>

            <!-- Progress Bar -->
            {#if uploadStatus === "uploading"}
              <div class="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  class="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                  style="width: {uploadProgress}%"
                ></div>
              </div>
            {/if}

            <!-- Status Message -->
            {#if uploadMessage}
              <p
                class="mt-2 text-sm"
                class:text-red-500={uploadStatus === "error"}
                class:text-green-500={uploadStatus === "success"}
              >
                {uploadMessage}
              </p>
            {/if}
          </CardContent>
        </Card>
      {/if}
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
          <form on:submit|preventDefault={saveSettings} class="space-y-4">
            <div class="space-y-2">
              <Label for="githubToken">GitHub Token</Label>
              <Input
                type="password"
                id="githubToken"
                bind:value={githubToken}
                on:input={checkSettingsValidity}
                placeholder="ghp_***********************************"
              />
            </div>

            <div class="space-y-2">
              <Label for="repoOwner">Repository Owner</Label>
              <Input
                type="text"
                id="repoOwner"
                bind:value={repoOwner}
                on:input={checkSettingsValidity}
                placeholder="username or organization"
              />
            </div>

            <div class="space-y-2">
              <Label for="repoName">Repository Name</Label>
              <Input
                type="text"
                id="repoName"
                bind:value={repoName}
                on:input={checkSettingsValidity}
                placeholder="repository-name"
              />
            </div>

            <div class="space-y-2">
              <Label for="branch">Branch</Label>
              <Input
                type="text"
                id="branch"
                bind:value={branch}
                on:input={checkSettingsValidity}
                placeholder="main"
              />
            </div>

            <Button type="submit" class="w-full" disabled={!isSettingsValid}>
              Save Settings
            </Button>
          </form>

          {#if status}
            <p
              class="mt-4 text-center"
              class:text-green-500={status.includes("success")}
              class:text-red-500={status.includes("Error")}
            >
              {status}
            </p>
          {/if}
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
