<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';
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
  import type { FileChange } from '../services/FilePreviewService';
  import FileChangesModal from './components/FileChangesModal.svelte';
  import TempRepoModal from './components/TempRepoModal.svelte';

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
  let fileChanges: Map<string, FileChange> | null = null;
  const version = chrome.runtime.getManifest().version;
  let hasStatus = false;
  let isValidatingToken = false;
  let isTokenValid: boolean | null = null;
  let validationError: string | null = null;
  let hasInitialSettings = false;
  let showTempRepoModal = false;
  let showFileChangesModal = false;
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

    // Check for pending file changes
    const pendingChanges = await chrome.storage.local.get('pendingFileChanges');
    if (pendingChanges.pendingFileChanges) {
      console.log('Found pending file changes:', pendingChanges.pendingFileChanges);
      fileChanges = new Map(Object.entries(pendingChanges.pendingFileChanges));
      showFileChangesModal = true;

      // Clear the pending changes
      await chrome.storage.local.remove('pendingFileChanges');
      console.log('Cleared pending file changes from storage');
    }

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
      } else if (message.type === 'FILE_CHANGES') {
        console.log('Received file changes:', message.changes, 'for project:', message.projectId);
        // Store file changes in local storage for future access with project ID as identifier
        const changesObject = message.changes;
        const projectId = message.projectId;
        chrome.storage.local.set({ storedFileChanges: { projectId, changes: changesObject } });
        fileChanges = new Map(Object.entries(changesObject));
        showFileChangesModal = true; // Show the file changes modal
      } else if (message.type === 'OPEN_FILE_CHANGES') {
        showStoredFileChanges();
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

    // Add listener to clear file changes when popup closes
    window.addEventListener('unload', async () => {
      try {
        await chrome.storage.local.remove('storedFileChanges');
        console.log('Cleared stored file changes on popup close');
      } catch (error) {
        console.error('Error clearing stored file changes:', error);
      }
    });
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

  /**
   * Shows the file changes modal with stored changes or fetches them if they don't exist
   */
  async function showStoredFileChanges() {
    try {
      // First check if we already have file changes in memory
      if (fileChanges && fileChanges.size > 0) {
        showFileChangesModal = true;
        return;
      }

      // Try to get file changes from storage
      const result = await chrome.storage.local.get('storedFileChanges');
      if (result.storedFileChanges) {
        console.log('Found stored file changes:', result.storedFileChanges);

        // Check if the stored file changes have the new format with projectId
        if (result.storedFileChanges.projectId && result.storedFileChanges.changes) {
          // Check if stored projectId matches the current project (if we have a project ID)
          if (!parsedProjectId || parsedProjectId === result.storedFileChanges.projectId) {
            // Use the changes from storage
            fileChanges = new Map(Object.entries(result.storedFileChanges.changes));
            showFileChangesModal = true;
            return;
          } else {
            console.log('Stored file changes are for a different project, requesting new changes');
          }
        } else {
          // Legacy format without projectId - use it for backward compatibility
          fileChanges = new Map(Object.entries(result.storedFileChanges));
          showFileChangesModal = true;
          return;
        }
      }

      // If we don't have file changes in storage, request them from the content script
      console.log('No stored file changes, requesting from content script...');
      // Send message to the active tab to request file changes
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id && isBoltSite) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'REQUEST_FILE_CHANGES' }, (response) => {
          if (response && response.success) {
            console.log(
              'Received response from content script with projectId:',
              response.projectId
            );
            // Store the projectId for later use
            if (response.projectId) {
              // Make sure to update parsedProjectId if needed
              if (!parsedProjectId) {
                parsedProjectId = response.projectId;
              }
            }
          }
        });
        // Let the user know what's happening
        status = 'Calculating file changes...';
        hasStatus = true;
        setTimeout(() => {
          status = '';
          hasStatus = false;
        }, 5000);
      } else {
        console.error('No active Bolt tab found or not on Bolt site');
        status = 'Cannot show file changes: Not on a Bolt project page';
        hasStatus = true;
        setTimeout(() => {
          status = '';
          hasStatus = false;
        }, 3000);
      }
    } catch (error) {
      console.error('Error showing file changes:', error);
      status = `Error retrieving file changes: ${error instanceof Error ? error.message : 'Unknown error'}`;
      hasStatus = true;
      setTimeout(() => {
        status = '';
        hasStatus = false;
      }, 3000);
    }
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
                on:showFileChanges={showStoredFileChanges}
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
            <div class="space-y-4">
              <div>
                <h2 class="text-xl font-semibold text-slate-200">GitHub Settings</h2>
                <p class="text-sm text-slate-400">Configure your GitHub repository settings</p>
              </div>
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
            </div>
          </TabsContent>

          <TabsContent value="help">
            <div class="space-y-4">
              <Help />
              <div class="mt-3">
                <Footer />
              </div>
            </div>
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
  </Card>
  <FileChangesModal bind:show={showFileChangesModal} bind:fileChanges />

  <TempRepoModal
    bind:show={showTempRepoModal}
    bind:tempRepoData
    bind:hasDeletedTempRepo
    bind:hasUsedTempRepoName
    onDeleteTempRepo={handleDeleteTempRepo}
    onUseTempRepoName={handleUseTempRepoName}
    onDismiss={() => (showTempRepoModal = false)}
  />
</main>

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
