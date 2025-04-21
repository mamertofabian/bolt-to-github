<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import { STORAGE_KEY } from '../background/TempRepoManager';
  import { Tabs, TabsContent } from '$lib/components/ui/tabs';
  import Header from '$lib/components/Header.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import StatusAlert from '$lib/components/StatusAlert.svelte';
  import GitHubSettings from '$lib/components/GitHubSettings.svelte';
  import { COFFEE_LINK, GITHUB_LINK, YOUTUBE_LINK } from '$lib/constants';
  import Footer from '$lib/components/Footer.svelte';
  import type { GitHubSettingsInterface } from '$lib/types';
  import ProjectsList from '$lib/components/ProjectsList.svelte';
  import { GitHubService } from '../services/GitHubService';
  import { Button } from '$lib/components/ui/button';
  import Help from '$lib/components/Help.svelte';
  import ProjectStatus from '$lib/components/ProjectStatus.svelte';

  let githubToken: string = '';
  let repoOwner = '';
  let repoName = '';
  let branch = 'main';
  let projectSettings: Record<string, { repoName: string; branch: string }> = {};
  let status = '';
  let uploadProgress = 0;
  let uploadStatus = 'idle';
  let uploadMessage = '';
  let isSettingsValid = false;
  let activeTab = 'home';
  let currentUrl: string = '';
  let isBoltSite: boolean = false;
  let githubSettings: GitHubSettingsInterface;
  let parsedProjectId: string | null = null;
  const version = chrome.runtime.getManifest().version;
  let hasStatus = false;
  let isValidatingToken = false;
  let isTokenValid: boolean | null = null;
  let validationError: string | null = null;
  let hasInitialSettings = false;
  let showTempRepoModal = false;
  let tempRepoData: TempRepoMetadata | null = null;
  let port: chrome.runtime.Port;
  let hasDeletedTempRepo = false;
  let hasUsedTempRepoName = false;
  let projectStatusRef: ProjectStatus;

  interface TempRepoMetadata {
    originalRepo: string;
    tempRepo: string;
    createdAt: number;
    owner: string;
  }

  async function validateGitHubToken(token: string, username: string): Promise<boolean> {
    if (!token) {
      isTokenValid = false;
      validationError = 'GitHub token is required';
      return false;
    }

    try {
      isValidatingToken = true;
      const githubService = new GitHubService(token);
      const result = await githubService.validateTokenAndUser(username);
      isTokenValid = result.isValid;
      validationError = result.error || null;
      return result.isValid;
    } catch (error) {
      console.error('Error validating settings:', error);
      isTokenValid = false;
      validationError = 'Validation failed';
      return false;
    } finally {
      isValidatingToken = false;
    }
  }

  $: console.log('repoOwner', repoOwner);

  onMount(async () => {
    // Add dark mode to the document
    document.documentElement.classList.add('dark');

    // Connect to background service
    port = chrome.runtime.connect({ name: 'popup' });

    githubSettings = (await chrome.storage.sync.get([
      'githubToken',
      'repoOwner',
      'projectSettings',
    ])) as GitHubSettingsInterface;

    githubToken = githubSettings.githubToken || '';
    repoOwner = githubSettings.repoOwner || '';
    projectSettings = githubSettings.projectSettings || {};
    hasInitialSettings = Boolean(githubSettings.githubToken && githubSettings.repoOwner);

    // Validate existing token and username if they exist
    if (githubToken && repoOwner) {
      await validateGitHubToken(githubToken, repoOwner);
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log(`📄 App: ${tabs[0]?.url}`);
    if (tabs[0]?.url) {
      currentUrl = tabs[0].url;
      isBoltSite = currentUrl.includes('bolt.new');

      if (isBoltSite) {
        const match = currentUrl.match(/bolt\.new\/~\/([^/]+)/);
        parsedProjectId = match?.[1] || null;
        console.log(`📄 App: ${parsedProjectId}`);
        // Get projectId from storage
        const projectId = await chrome.storage.sync.get('projectId');

        if (match && parsedProjectId && projectId.projectId === parsedProjectId) {
          if (projectSettings[parsedProjectId]) {
            console.log(
              '📄 App: projectSettings[parsedProjectId]',
              projectSettings[parsedProjectId]
            );
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
      if (message.type === 'UPLOAD_STATUS') {
        uploadStatus = message.status;
        uploadProgress = message.progress || 0;
        uploadMessage = message.message || '';
      }
    });

    // Check for temp repos
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const tempRepos: TempRepoMetadata[] = result[STORAGE_KEY] || [];

    if (tempRepos.length > 0 && parsedProjectId) {
      // Get the most recent temp repo
      tempRepoData = tempRepos[tempRepos.length - 1];
      showTempRepoModal = true;
    }
  });

  async function handleDeleteTempRepo() {
    if (tempRepoData) {
      port.postMessage({
        type: 'DELETE_TEMP_REPO',
        data: {
          owner: tempRepoData.owner,
          repo: tempRepoData.tempRepo,
        },
      });
      hasDeletedTempRepo = true;

      // Only close modal if both actions are completed
      if (hasDeletedTempRepo && hasUsedTempRepoName) {
        showTempRepoModal = false;
      }
    }
  }

  async function handleUseTempRepoName() {
    if (tempRepoData) {
      repoName = tempRepoData.originalRepo;
      await saveSettings();
      await projectStatusRef.getProjectStatus();
      hasUsedTempRepoName = true;

      // Only close modal if both actions are completed
      if (hasDeletedTempRepo && hasUsedTempRepoName) {
        showTempRepoModal = false;
      }
    }
  }

  function checkSettingsValidity() {
    // Only consider settings valid if we have all required fields AND the validation passed
    isSettingsValid =
      Boolean(githubToken && repoOwner && repoName && branch) &&
      !isValidatingToken &&
      isTokenValid === true;
  }

  async function saveSettings() {
    try {
      // Validate token and username before saving
      const isValid = await validateGitHubToken(githubToken, repoOwner);
      if (!isValid) {
        status = validationError || 'Validation failed';
        hasStatus = true;
        setTimeout(() => {
          status = '';
          hasStatus = false;
        }, 3000);
        return;
      }

      const settings = {
        githubToken: githubToken || '',
        repoOwner: repoOwner || '',
        projectSettings,
      };

      if (parsedProjectId) {
        projectSettings[parsedProjectId] = { repoName, branch };
        settings.projectSettings = projectSettings;
      }

      await chrome.storage.sync.set(settings);
      hasInitialSettings = true;
      status = 'Settings saved successfully!';
      hasStatus = true;
      checkSettingsValidity();
      setTimeout(() => {
        status = '';
        hasStatus = false;
      }, 3000);
    } catch (error) {
      status = 'Error saving settings';
      hasStatus = true;
      console.error(error);
    }
  }

  function handleSwitchTab(event: CustomEvent<string>) {
    activeTab = event.detail;
  }
</script>

<main class="w-[400px] p-3 bg-slate-950 text-slate-50">
  <Card class="border-slate-800 bg-slate-900">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <a
          href="https://bolt2github.com"
          target="_blank"
          class="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <img src="/assets/icons/icon48.png" alt="Bolt to GitHub" class="w-5 h-5" />
          Bolt to GitHub <span class="text-xs text-slate-400">v{version}</span>
        </a>
      </CardTitle>
      <CardDescription class="text-slate-400">
        Upload and sync your Bolt projects to GitHub
      </CardDescription>
    </CardHeader>
    <CardContent>
      {#if isBoltSite && parsedProjectId}
        <Tabs bind:value={activeTab} class="w-full">
          <Header />

          <TabsContent value="home">
            <button
              class="w-full mb-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
              on:click={() => (activeTab = 'projects')}
            >
              View All Projects
            </button>

            {#if !isSettingsValid || !parsedProjectId}
              <StatusAlert on:switchTab={handleSwitchTab} />
            {:else}
              <ProjectStatus
                bind:this={projectStatusRef}
                projectId={parsedProjectId}
                gitHubUsername={repoOwner}
                {repoName}
                {branch}
                token={githubToken}
                on:switchTab={handleSwitchTab}
              />
            {/if}

            <div class="mt-6 space-y-4">
              <SocialLinks {GITHUB_LINK} {YOUTUBE_LINK} {COFFEE_LINK} />
            </div>
          </TabsContent>

          <TabsContent value="projects">
            <ProjectsList
              {projectSettings}
              {repoOwner}
              {githubToken}
              currentlyLoadedProjectId={parsedProjectId}
              {isBoltSite}
            />
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
                  buttonDisabled={hasStatus}
                  onSave={saveSettings}
                  onInput={checkSettingsValidity}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="help">
            <Help />
          </TabsContent>
        </Tabs>
      {:else if hasInitialSettings && repoOwner && githubToken}
        <ProjectsList
          {projectSettings}
          {repoOwner}
          {githubToken}
          currentlyLoadedProjectId={parsedProjectId}
          {isBoltSite}
        />
      {:else}
        <div class="flex flex-col items-center justify-center p-4 text-center space-y-6">
          <div class="space-y-2">
            {#if !isBoltSite}
              <Button
                variant="outline"
                class="border-slate-800 hover:bg-slate-800 text-slate-200"
                on:click={() => window.open('https://bolt.new', '_blank')}
              >
                Go to bolt.new
              </Button>
            {/if}
            <p class="text-sm text-green-400">
              💡 No Bolt projects found. Create or load an existing Bolt project to get started.
            </p>
            <p class="text-sm text-green-400 pb-4">
              🌟 You can also load any of your GitHub repositories by providing your GitHub token
              and repository owner.
            </p>
            <GitHubSettings
              isOnboarding={true}
              bind:githubToken
              bind:repoName
              bind:branch
              bind:repoOwner
              {status}
              buttonDisabled={hasStatus}
              onSave={saveSettings}
              onInput={checkSettingsValidity}
            />
          </div>
        </div>
      {/if}
    </CardContent>
    <Footer />
  </Card>
  <Modal show={showTempRepoModal} title="Private Repository Import">
    <div class="space-y-4">
      <p class="text-amber-300 font-medium">
        It looks like you just imported a private GitHub repository. Would you like to:
      </p>

      <div class="space-y-2">
        {#if !hasDeletedTempRepo}
          <div class="space-y-2">
            <p class="text-sm text-slate-400">1. Clean up the temporary repository:</p>
            <Button
              variant="outline"
              class="w-full border-slate-700 hover:bg-slate-800"
              on:click={handleDeleteTempRepo}
            >
              Delete the temporary public repository now
            </Button>
          </div>
        {:else}
          <div
            class="text-sm text-green-400 p-2 border border-green-800 bg-green-900/20 rounded-md"
          >
            ✓ Temporary repository has been deleted
          </div>
        {/if}

        {#if !hasUsedTempRepoName}
          <div class="space-y-2">
            <p class="text-sm text-slate-400">2. Configure repository name:</p>
            <Button
              variant="outline"
              class="w-full border-slate-700 hover:bg-slate-800"
              on:click={handleUseTempRepoName}
            >
              Use original repository name ({tempRepoData?.originalRepo})
            </Button>
          </div>
        {:else}
          <div
            class="text-sm text-green-400 p-2 border border-green-800 bg-green-900/20 rounded-md"
          >
            ✓ Repository name has been configured
          </div>
        {/if}

        <Button
          variant="ghost"
          class="w-full text-slate-400 hover:text-slate-300"
          on:click={() => (showTempRepoModal = false)}
        >
          Dismiss
        </Button>
      </div>

      <p class="text-sm text-slate-400">
        Note: The temporary repository will be automatically deleted in 1 minute if not deleted
        manually.
      </p>
    </div>
  </Modal>
</main>

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
