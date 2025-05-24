<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';

  import { Tabs, TabsContent } from '$lib/components/ui/tabs';
  import Header from '$lib/components/Header.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import StatusAlert from '$lib/components/StatusAlert.svelte';
  import GitHubSettings from '$lib/components/GitHubSettings.svelte';
  import { COFFEE_LINK, GITHUB_LINK, YOUTUBE_LINK } from '$lib/constants';
  import Footer from '$lib/components/Footer.svelte';
  import ProjectsList from '$lib/components/ProjectsList.svelte';
  import { Button } from '$lib/components/ui/button';
  import Help from '$lib/components/Help.svelte';
  import ProjectStatus from '$lib/components/ProjectStatus.svelte';
  import FileChangesModal from './components/FileChangesModal.svelte';
  import TempRepoModal from './components/TempRepoModal.svelte';

  // Import stores and services
  import {
    githubSettingsStore,
    githubSettingsActions,
    isSettingsValid,
    projectSettingsStore,
    projectSettingsActions,
    isOnBoltProject,
    currentProjectId,
    uiStateStore,
    uiStateActions,
    uploadStateStore,
    uploadStateActions,
  } from '$lib/stores';
  import {
    ChromeStorageService,
    ChromeMessagingService,
    ProjectDetectionService,
    FileChangeHandler,
    BackgroundTempRepoManager,
    TEMP_REPO_STORAGE_KEY,
  } from '$lib/services';

  // Component references
  let projectStatusRef: ProjectStatus;

  // Store subscriptions
  $: uiState = $uiStateStore;

  onMount(async () => {
    // Add dark mode to the document
    document.documentElement.classList.add('dark');

    // Initialize stores
    await initializeStores();

    // Set up Chrome messaging
    setupChromeMessaging();

    // Handle pending file changes
    await handlePendingFileChanges();

    // Handle temp repositories
    await handleTempRepositories();

    // Setup cleanup
    setupCleanup();
  });

  async function initializeStores(): Promise<void> {
    // Initialize all stores
    githubSettingsActions.initialize();
    projectSettingsActions.initialize();
    uploadStateActions.initializePort();

    // Detect current project
    await projectSettingsActions.detectCurrentProject();

    // Load project-specific settings if we have a project ID
    if ($currentProjectId) {
      githubSettingsActions.loadProjectSettings($currentProjectId);
    }
  }

  function setupChromeMessaging(): void {
    // Initialize Chrome messaging service
    ChromeMessagingService.initializePort('popup');

    // Set up message handlers
    ChromeMessagingService.addPortMessageHandler((message) => {
      if (message.type === 'UPLOAD_STATUS') {
        uploadStateActions.handleUploadStatusMessage(message);
      } else if (message.type === 'FILE_CHANGES') {
        console.log('Received file changes:', message.changes, 'for project:', message.projectId);
        uiStateActions.processFileChangesMessage(message.changes, message.projectId);
      } else if (message.type === 'OPEN_FILE_CHANGES') {
        showStoredFileChanges();
      }
    });
  }

  async function handlePendingFileChanges(): Promise<void> {
    const pendingData = await FileChangeHandler.retrievePendingFileChanges();
    if (pendingData) {
      console.log('Found pending file changes:', pendingData);
      uiStateActions.setFileChanges(pendingData.changes);
      uiStateActions.showFileChangesModal();
    }
  }

  async function handleTempRepositories(): Promise<void> {
    if ($currentProjectId) {
      const tempRepoData = await BackgroundTempRepoManager.getMostRecentTempRepo($currentProjectId);
      if (tempRepoData) {
        uiStateActions.showTempRepoModal(tempRepoData);
      }
    }
  }

  function setupCleanup(): void {
    // Add listener to clear file changes when popup closes
    window.addEventListener('unload', async () => {
      try {
        if ($currentProjectId) {
          await FileChangeHandler.clearFileChanges($currentProjectId);
          console.log('Cleared stored file changes on popup close');
        }
      } catch (error) {
        console.error('Error clearing stored file changes:', error);
      }
    });
  }

  async function handleDeleteTempRepo(): Promise<void> {
    if (uiState.tempRepoData) {
      const success = await BackgroundTempRepoManager.requestTempRepoDeletion(
        uiState.tempRepoData.owner,
        uiState.tempRepoData.tempRepo
      );

      if (success) {
        uiStateActions.markTempRepoDeleted();

        // Check if we can close the modal
        if (await uiStateActions.canCloseTempRepoModal()) {
          uiStateActions.hideTempRepoModal();
        }
      }
    }
  }

  async function handleUseTempRepoName(): Promise<void> {
    if (uiState.tempRepoData) {
      githubSettingsActions.setRepoName(uiState.tempRepoData.originalRepo);
      const result = await githubSettingsActions.saveSettings();

      if (result.success) {
        await projectStatusRef.getProjectStatus();
        uiStateActions.markTempRepoNameUsed();

        // Check if we can close the modal
        if (await uiStateActions.canCloseTempRepoModal()) {
          uiStateActions.hideTempRepoModal();
        }
      } else {
        uiStateActions.showStatus(result.error || 'Failed to save settings');
      }
    }
  }

  async function saveSettings(): Promise<void> {
    const result = await githubSettingsActions.saveSettings();

    if (result.success) {
      uiStateActions.showStatus('Settings saved successfully!');

      // Update project settings if we have a project ID
      if ($currentProjectId) {
        githubSettingsActions.setProjectSettings(
          $currentProjectId,
          $githubSettingsStore.repoName,
          $githubSettingsStore.branch
        );
      }
    } else {
      uiStateActions.showStatus(result.error || 'Failed to save settings');
    }
  }

  function handleSwitchTab(event: CustomEvent<string>): void {
    uiStateActions.setActiveTab(event.detail);
  }

  async function showStoredFileChanges(): Promise<void> {
    try {
      // First check if we already have file changes in memory
      if (uiState.fileChanges && uiState.fileChanges.size > 0) {
        uiStateActions.showFileChangesModal();
        return;
      }

      // Try to load from storage
      const loaded = await uiStateActions.loadStoredFileChanges($currentProjectId);

      if (!loaded) {
        // Request new file changes from content script
        if ($isOnBoltProject) {
          await uiStateActions.requestFileChangesFromContentScript();
        } else {
          uiStateActions.showStatus('Cannot show file changes: Not on a Bolt project page');
        }
      }
    } catch (error) {
      console.error('Error showing file changes:', error);
      uiStateActions.showStatus(
        `Error retrieving file changes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  function checkSettingsValidity(): void {
    // This is now handled by the derived store automatically
    // No need for manual validation
  }

  // Reactive statements for debugging
  $: console.log('repoOwner', $githubSettingsStore.repoOwner);
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
          Bolt to GitHub
          <span class="text-xs text-slate-400">v{$projectSettingsStore.version}</span>
        </a>
      </CardTitle>
      <CardDescription class="text-slate-400">
        Upload and sync your Bolt projects to GitHub
      </CardDescription>
    </CardHeader>
    <CardContent>
      {#if $isOnBoltProject && $currentProjectId}
        <Tabs bind:value={uiState.activeTab} class="w-full">
          <Header />

          <TabsContent value="home">
            {#if !$isSettingsValid || !$currentProjectId}
              <StatusAlert on:switchTab={handleSwitchTab} />
            {:else}
              <ProjectStatus
                bind:this={projectStatusRef}
                projectId={$currentProjectId}
                gitHubUsername={$githubSettingsStore.repoOwner}
                repoName={$githubSettingsStore.repoName}
                branch={$githubSettingsStore.branch}
                token={$githubSettingsStore.githubToken}
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
              projectSettings={$githubSettingsStore.projectSettings}
              repoOwner={$githubSettingsStore.repoOwner}
              githubToken={$githubSettingsStore.githubToken}
              currentlyLoadedProjectId={$currentProjectId}
              isBoltSite={$projectSettingsStore.isBoltSite}
            />
          </TabsContent>

          <TabsContent value="settings">
            <div class="space-y-4">
              <div>
                <h2 class="text-xl font-semibold text-slate-200">GitHub Settings</h2>
                <p class="text-sm text-slate-400">Configure your GitHub repository settings</p>
              </div>
              <GitHubSettings
                bind:githubToken={$githubSettingsStore.githubToken}
                bind:repoOwner={$githubSettingsStore.repoOwner}
                bind:repoName={$githubSettingsStore.repoName}
                bind:branch={$githubSettingsStore.branch}
                projectId={$currentProjectId}
                status={uiState.status}
                buttonDisabled={uiState.hasStatus}
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
      {:else if $githubSettingsStore.hasInitialSettings && $githubSettingsStore.repoOwner && $githubSettingsStore.githubToken}
        <ProjectsList
          projectSettings={$githubSettingsStore.projectSettings}
          repoOwner={$githubSettingsStore.repoOwner}
          githubToken={$githubSettingsStore.githubToken}
          currentlyLoadedProjectId={$currentProjectId}
          isBoltSite={$projectSettingsStore.isBoltSite}
        />
      {:else}
        <div class="flex flex-col items-center justify-center p-4 text-center space-y-6">
          <div class="space-y-2">
            {#if !$projectSettingsStore.isBoltSite}
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
              bind:githubToken={$githubSettingsStore.githubToken}
              bind:repoName={$githubSettingsStore.repoName}
              bind:branch={$githubSettingsStore.branch}
              bind:repoOwner={$githubSettingsStore.repoOwner}
              status={uiState.status}
              buttonDisabled={uiState.hasStatus}
              onSave={saveSettings}
              onInput={checkSettingsValidity}
            />
          </div>
        </div>
      {/if}
    </CardContent>
  </Card>

  <FileChangesModal
    bind:show={uiState.showFileChangesModal}
    bind:fileChanges={uiState.fileChanges}
  />

  <TempRepoModal
    bind:show={uiState.showTempRepoModal}
    bind:tempRepoData={uiState.tempRepoData}
    bind:hasDeletedTempRepo={uiState.hasDeletedTempRepo}
    bind:hasUsedTempRepoName={uiState.hasUsedTempRepoName}
    onDeleteTempRepo={handleDeleteTempRepo}
    onUseTempRepoName={handleUseTempRepoName}
    onDismiss={() => uiStateActions.hideTempRepoModal()}
  />
</main>

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
