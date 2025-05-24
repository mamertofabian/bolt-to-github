<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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

  import ProjectsList from '$lib/components/ProjectsList.svelte';
  import { Button } from '$lib/components/ui/button';
  import Help from '$lib/components/Help.svelte';
  import ProjectStatus from '$lib/components/ProjectStatus.svelte';
  import FileChangesModal from './components/FileChangesModal.svelte';
  import TempRepoModal from './components/TempRepoModal.svelte';
  import PushReminderSettings from './components/PushReminderSettings.svelte';
  import UpgradeModal from './components/UpgradeModal.svelte';
  import { setUpgradeModalState } from '$lib/utils/upgradeModal';
  import type { PremiumFeature } from '$lib/constants/premiumFeatures';

  // Import stores and services
  import {
    githubSettingsStore,
    isSettingsValid,
    githubSettingsActions,
    projectSettingsStore,
    isOnBoltProject,
    currentProjectId,
    projectSettingsActions,
    uiStateStore,
    uiStateActions,
    fileChangesStore,
    fileChangesActions,
    uploadStateStore,
    uploadStateActions,
    premiumStatusStore,
    isPremium,
    premiumPlan,
    premiumFeatures as userPremiumFeatures,
    premiumStatusActions,
    type TempRepoMetadata,
  } from '$lib/stores';
  import { ChromeMessagingService } from '$lib/services/chromeMessaging';

  // Reactive store subscriptions
  $: githubSettings = $githubSettingsStore;
  $: projectSettings = $projectSettingsStore;
  $: uiState = $uiStateStore;
  $: fileChangesState = $fileChangesStore;
  $: uploadState = $uploadStateStore;
  $: settingsValid = $isSettingsValid;
  $: onBoltProject = $isOnBoltProject;
  $: projectId = $currentProjectId;
  $: premiumStatus = $premiumStatusStore;
  $: isUserPremium = $isPremium;
  $: userPlan = $premiumPlan;
  $: userFeatures = $userPremiumFeatures;

  let projectStatusRef: ProjectStatus;
  let showPushReminderSettings = false;
  let showUpgradeModal = false;
  let upgradeModalFeature = '';
  let upgradeModalReason = '';
  let premiumFeatures: Array<{ id: string; name: string; description: string; icon: string }> = [];

  // Message handlers
  function handleUploadStatusMessage(message: any) {
    uploadStateActions.handleUploadStatusMessage(message);
  }

  function handleFileChangesMessage(message: any) {
    if (message.type === 'FILE_CHANGES') {
      console.log('Received file changes:', message.changes, 'for project:', message.projectId);
      fileChangesActions.processFileChangesMessage(message.changes, message.projectId);
    }
  }

  function handleOpenFileChangesMessage() {
    showStoredFileChanges();
  }

  async function initializeApp() {
    // Add dark mode to the document
    document.documentElement.classList.add('dark');

    // Initialize stores
    projectSettingsActions.initialize();
    githubSettingsActions.initialize();
    uploadStateActions.initializePort();
    premiumStatusActions.initialize();

    // Setup Chrome messaging
    ChromeMessagingService.addPortMessageHandler(handleUploadStatusMessage);
    ChromeMessagingService.addPortMessageHandler(handleFileChangesMessage);

    // Check for pending file changes first
    const pendingChanges = await chrome.storage.local.get('pendingFileChanges');
    if (pendingChanges.pendingFileChanges) {
      console.log('Found pending file changes:', pendingChanges.pendingFileChanges);
      const fileChangesMap = new Map(Object.entries(pendingChanges.pendingFileChanges)) as Map<
        string,
        import('../services/FilePreviewService').FileChange
      >;
      fileChangesActions.setFileChanges(fileChangesMap);
      fileChangesActions.showModal();
      await chrome.storage.local.remove('pendingFileChanges');
      console.log('Cleared pending file changes from storage');
    }

    // Detect current project
    await projectSettingsActions.detectCurrentProject();

    // Load project-specific settings if we're on a bolt project
    if (projectId) {
      githubSettingsActions.loadProjectSettings(projectId);
    }

    // Setup runtime message listener
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'UPLOAD_STATUS') {
        handleUploadStatusMessage(message);
      } else if (message.type === 'FILE_CHANGES') {
        handleFileChangesMessage(message);
      } else if (message.type === 'OPEN_FILE_CHANGES') {
        handleOpenFileChangesMessage();
      }
    });

    // Check for temp repos
    await checkForTempRepos();

    // Add cleanup listener
    window.addEventListener('unload', cleanup);

    // Listen for upgrade modal triggers from other components
    window.addEventListener('showUpgrade', ((event: CustomEvent) => {
      upgradeModalFeature = event.detail.feature;
      upgradeModalReason = event.detail.reason;
      premiumFeatures = event.detail.features;
      showUpgradeModal = true;
    }) as EventListener);
  }

  async function checkForTempRepos() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const tempRepos: TempRepoMetadata[] = result[STORAGE_KEY] || [];

    if (tempRepos.length > 0 && projectId) {
      const tempRepoData = tempRepos[tempRepos.length - 1];
      uiStateActions.showTempRepoModal(tempRepoData);
    }
  }

  async function saveSettings() {
    // If we have a current project, update its settings in the store first
    if (projectId) {
      githubSettingsActions.setProjectSettings(
        projectId,
        githubSettings.repoName,
        githubSettings.branch
      );
    }

    const result = await githubSettingsActions.saveSettings();
    if (result.success) {
      uiStateActions.showStatus('Settings saved successfully!');
    } else {
      uiStateActions.showStatus(result.error || 'Error saving settings');
    }
  }

  function handleSwitchTab(event: CustomEvent<string>) {
    uiStateActions.setActiveTab(event.detail);
  }

  async function showStoredFileChanges() {
    const success = await fileChangesActions.loadStoredFileChanges(projectId);
    if (!success) {
      // Try to request from content script
      try {
        await fileChangesActions.requestFileChangesFromContentScript();
        uiStateActions.showStatus('Calculating file changes...', 5000);
      } catch (error) {
        uiStateActions.showStatus('Cannot show file changes: Not on a Bolt project page');
      }
    }
  }

  async function handleDeleteTempRepo() {
    ChromeMessagingService.sendDeleteTempRepoMessage(
      uiState.tempRepoData!.owner,
      uiState.tempRepoData!.tempRepo
    );
    uiStateActions.markTempRepoDeleted();

    // Check if we can close the modal
    const canClose = await uiStateActions.canCloseTempRepoModal();
    if (canClose) {
      uiStateActions.hideTempRepoModal();
    }
  }

  async function handleUseTempRepoName() {
    if (uiState.tempRepoData) {
      githubSettingsActions.setRepoName(uiState.tempRepoData.originalRepo);
      await saveSettings();
      await projectStatusRef.getProjectStatus();
      uiStateActions.markTempRepoNameUsed();

      // Check if we can close the modal
      const canClose = await uiStateActions.canCloseTempRepoModal();
      if (canClose) {
        uiStateActions.hideTempRepoModal();
      }
    }
  }

  async function cleanup() {
    try {
      await chrome.storage.local.remove('storedFileChanges');
      console.log('Cleared stored file changes on popup close');
      ChromeMessagingService.cleanup();
      uploadStateActions.disconnect();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  onMount(initializeApp);
  onDestroy(cleanup);
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
          Bolt to GitHub <span class="text-xs text-slate-400">v{projectSettings.version}</span>
        </a>
        {#if isUserPremium}
          <span
            class="text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm"
          >
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clip-rule="evenodd"
              ></path>
            </svg>
            PRO
          </span>
        {:else}
          <Button
            size="sm"
            class="text-xs bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-3 py-1 h-6"
            on:click={() => {
              setUpgradeModalState('general', (feature, reason, features) => {
                upgradeModalFeature = feature;
                upgradeModalReason = reason;
                premiumFeatures = features;
                showUpgradeModal = true;
              });
            }}
          >
            ✨ Upgrade
          </Button>
        {/if}
      </CardTitle>
      <CardDescription class="text-slate-400">
        Upload and sync your Bolt projects to GitHub
      </CardDescription>
    </CardHeader>
    <CardContent>
      {#if onBoltProject}
        <Tabs bind:value={uiState.activeTab} class="w-full">
          <Header />

          <TabsContent value="home">
            {#if !settingsValid || !projectId}
              <StatusAlert on:switchTab={handleSwitchTab} />
            {:else}
              <ProjectStatus
                bind:this={projectStatusRef}
                {projectId}
                gitHubUsername={githubSettings.repoOwner}
                repoName={githubSettings.repoName}
                branch={githubSettings.branch}
                token={githubSettings.githubToken}
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
              repoOwner={githubSettings.repoOwner}
              githubToken={githubSettings.githubToken}
              currentlyLoadedProjectId={projectId}
              isBoltSite={projectSettings.isBoltSite}
            />
          </TabsContent>

          <TabsContent value="settings">
            <div class="space-y-4">
              <div>
                <h2 class="text-xl font-semibold text-slate-200">GitHub Settings</h2>
                <p class="text-sm text-slate-400">Configure your GitHub repository settings</p>
              </div>
              <GitHubSettings
                bind:githubToken={githubSettings.githubToken}
                bind:repoOwner={githubSettings.repoOwner}
                bind:repoName={githubSettings.repoName}
                bind:branch={githubSettings.branch}
                {projectId}
                status={uiState.status}
                buttonDisabled={uiState.hasStatus}
                onSave={saveSettings}
                onInput={() => {}}
              />

              <!-- Push Reminder Settings -->
              <div class="border-t border-slate-800/50 pt-6">
                <div
                  class="bg-gradient-to-br from-slate-800/20 to-slate-800/5 rounded-xl p-4 border border-slate-700/30"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <h3 class="text-lg font-semibold text-slate-100">Push Reminders</h3>
                        <span
                          class="text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm"
                        >
                          <svg
                            class="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            ></path>
                          </svg>
                          PREMIUM
                        </span>
                      </div>
                      <p class="text-sm text-slate-400">
                        Smart reminders to save your work to GitHub
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      class="border-slate-600 hover:bg-slate-700 text-slate-300 hover:text-slate-200 font-medium px-4 py-2 transition-all duration-200"
                      on:click={() => (showPushReminderSettings = true)}
                    >
                      <svg
                        class="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        ></path>
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        ></path>
                      </svg>
                      Configure
                    </Button>
                  </div>
                </div>
              </div>

              <!-- Premium Status -->
              <div class="border-t border-slate-800/50 pt-6">
                <div
                  class="bg-gradient-to-br from-slate-800/30 to-slate-800/10 rounded-xl p-4 border border-slate-700/50"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <h3 class="text-lg font-semibold text-slate-100">Premium Status</h3>
                        {#if isUserPremium}
                          <span
                            class="text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg"
                          >
                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fill-rule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clip-rule="evenodd"
                              ></path>
                            </svg>
                            PRO
                          </span>
                        {/if}
                      </div>
                      <div class="space-y-1">
                        {#if isUserPremium}
                          <p class="text-slate-300 font-medium">Premium Plan</p>
                          <div class="flex items-center gap-2 text-sm text-slate-400">
                            <svg
                              class="w-4 h-4 text-emerald-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 13l4 4L19 7"
                              ></path>
                            </svg>
                            <span>Unlimited features</span>
                          </div>
                          {#if premiumStatus.expiresAt}
                            <div class="flex items-center gap-2 text-sm text-slate-400">
                              <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                ></path>
                              </svg>
                              <span
                                >Expires {new Date(
                                  premiumStatus.expiresAt
                                ).toLocaleDateString()}</span
                              >
                            </div>
                          {/if}
                        {:else}
                          <p class="text-slate-300 font-medium">Free Plan</p>
                          <div class="flex items-center gap-2 text-sm text-slate-400">
                            <svg
                              class="w-4 h-4 text-amber-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                              ></path>
                            </svg>
                            <span>3 file changes per day</span>
                          </div>
                        {/if}
                      </div>
                    </div>
                    <div class="ml-4">
                      {#if !isUserPremium}
                        <Button
                          class="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-2 shadow-lg hover:shadow-xl transition-all duration-200"
                          on:click={() => {
                            setUpgradeModalState('general', (feature, reason, features) => {
                              upgradeModalFeature = feature;
                              upgradeModalReason = reason;
                              premiumFeatures = features;
                              showUpgradeModal = true;
                            });
                          }}
                        >
                          <svg
                            class="w-4 h-4 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            ></path>
                          </svg>
                          Upgrade
                        </Button>
                      {:else}
                        <Button
                          variant="outline"
                          class="border-slate-600 hover:bg-slate-700 text-slate-200 hover:text-slate-100 font-medium px-4 py-2 transition-all duration-200"
                          on:click={() =>
                            window.open('https://bolt2github.com/dashboard', '_blank')}
                        >
                          <svg
                            class="w-4 h-4 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            ></path>
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            ></path>
                          </svg>
                          Manage
                        </Button>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
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
      {:else if githubSettings.hasInitialSettings && githubSettings.repoOwner && githubSettings.githubToken}
        <ProjectsList
          repoOwner={githubSettings.repoOwner}
          githubToken={githubSettings.githubToken}
          currentlyLoadedProjectId={projectId}
          isBoltSite={projectSettings.isBoltSite}
        />
      {:else}
        <div class="flex flex-col items-center justify-center p-4 text-center space-y-6">
          <div class="space-y-2">
            {#if !projectSettings.isBoltSite}
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
              bind:githubToken={githubSettings.githubToken}
              bind:repoName={githubSettings.repoName}
              bind:branch={githubSettings.branch}
              bind:repoOwner={githubSettings.repoOwner}
              status={uiState.status}
              buttonDisabled={uiState.hasStatus}
              onSave={saveSettings}
              onInput={() => {}}
            />
          </div>
        </div>
      {/if}
    </CardContent>
  </Card>

  <FileChangesModal
    bind:show={fileChangesState.showModal}
    bind:fileChanges={fileChangesState.fileChanges}
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

  <PushReminderSettings bind:show={showPushReminderSettings} />

  <UpgradeModal
    bind:show={showUpgradeModal}
    feature={upgradeModalFeature}
    reason={upgradeModalReason}
    features={premiumFeatures}
  />
</main>

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
