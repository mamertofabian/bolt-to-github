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
  import PushReminderSection from './components/PushReminderSection.svelte';
  import PremiumStatus from './components/PremiumStatus.svelte';
  import UpgradeModal from './components/UpgradeModal.svelte';
  import FeedbackModal from './components/FeedbackModal.svelte';
  import AnalyticsToggle from '$lib/components/ui/AnalyticsToggle.svelte';
  import { setUpgradeModalState } from '$lib/utils/upgradeModal';
  import type { PremiumFeature } from '$lib/constants/premiumFeatures';
  import NewsletterModal from '$lib/components/NewsletterModal.svelte';
  import NewsletterSection from '$lib/components/NewsletterSection.svelte';
  import GitHubSettingsApp from './components/GitHubSettingsApp.svelte';
  import SuccessToast from '$lib/components/SuccessToast.svelte';
  import { SubscriptionService } from '../services/SubscriptionService';
  import IssueManager from '$lib/components/IssueManager.svelte';

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
    isAuthenticated,
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
  $: isUserAuthenticated = $isAuthenticated;
  $: isUserPremium = $isPremium;
  $: userPlan = $premiumPlan;
  $: userFeatures = $userPremiumFeatures;

  // Handle pending popup context when stores are ready
  $: if (
    pendingPopupContext &&
    !hasHandledPendingContext &&
    githubSettings &&
    typeof settingsValid !== 'undefined' &&
    typeof onBoltProject !== 'undefined'
  ) {
    console.log('🎯 Triggering handlePendingPopupContext with:', {
      pendingPopupContext,
      onBoltProject,
      settingsValid,
      projectId,
      hasGitHubSettings: !!(githubSettings?.repoOwner && githubSettings?.githubToken),
    });
    handlePendingPopupContext();
  }

  let projectStatusRef: ProjectStatus;
  let showPushReminderSettings = false;
  let showUpgradeModal = false;
  let showFeedbackModal = false;
  let upgradeModalFeature = '';
  let upgradeModalReason = '';
  let premiumFeatures: Array<{ id: string; name: string; description: string; icon: string }> = [];

  // Newsletter subscription state
  let showNewsletterModal = false;
  let hasSubscribed = false;
  let showSuccessToast = false;
  let successToastMessage = '';
  let showSubscribePrompt = false;

  // Issues modal state
  let showIssuesModal = false;

  // Add pending popup context state
  let pendingPopupContext = '';
  let pendingUpgradeFeature = '';
  let hasHandledPendingContext = false;

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

    // Check for popup context (opened from content script)
    await checkPopupContext();

    // Add cleanup listener
    window.addEventListener('unload', cleanup);

    // Listen for upgrade modal triggers from other components
    window.addEventListener('showUpgrade', ((event: CustomEvent) => {
      upgradeModalFeature = event.detail.feature;
      upgradeModalReason = event.detail.reason;
      premiumFeatures = event.detail.features;
      showUpgradeModal = true;
    }) as EventListener);

    // Initialize newsletter subscription status
    try {
      const subscription = await SubscriptionService.getSubscriptionStatus();
      hasSubscribed = subscription.subscribed;
    } catch (error) {
      console.error('Error loading subscription status:', error);
    }
  }

  async function checkForTempRepos() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const tempRepos: TempRepoMetadata[] = result[STORAGE_KEY] || [];

    if (tempRepos.length > 0 && projectId) {
      const tempRepoData = tempRepos[tempRepos.length - 1];
      uiStateActions.showTempRepoModal(tempRepoData);
    }
  }

  async function checkPopupContext() {
    try {
      const result = await chrome.storage.local.get(['popupContext', 'upgradeModalFeature']);
      const context = result.popupContext;
      const upgradeFeature = result.upgradeModalFeature;

      if (context) {
        console.log('Popup opened with context:', context);
        pendingPopupContext = context;
        pendingUpgradeFeature = upgradeFeature || '';

        // Clear the context after storing it
        await chrome.storage.local.remove(['popupContext', 'upgradeModalFeature']);
      }
    } catch (error) {
      console.error('Error checking popup context:', error);
    }
  }

  async function handlePendingPopupContext() {
    if (!pendingPopupContext || hasHandledPendingContext) return;

    hasHandledPendingContext = true;
    const context = pendingPopupContext;
    const upgradeFeature = pendingUpgradeFeature;

    console.log('🎯 Handling pending popup context:', context, {
      onBoltProject,
      settingsValid,
      projectId,
      hasGitHubSettings: !!(githubSettings?.repoOwner && githubSettings?.githubToken),
      activeTab: uiState.activeTab,
    });

    switch (context) {
      case 'issues':
        // Only show issues if we have valid settings and are on a Bolt project
        if (settingsValid && projectId && githubSettings.githubToken) {
          console.log('🎯 Opening issues modal');
          showIssuesModal = true;
        } else {
          console.log('🎯 Issues access denied, going to home tab');
          uiStateActions.setActiveTab('home');
        }
        break;

      case 'projects':
        console.log('🎯 Processing projects context...');
        // Switch to projects tab if on bolt project
        if (onBoltProject) {
          console.log('🎯 On bolt project, setting active tab to projects');
          // Small delay to ensure UI is rendered
          setTimeout(() => {
            uiStateActions.setActiveTab('projects');
            console.log('🎯 Projects tab activated');
          }, 10);
        } else if (
          githubSettings?.hasInitialSettings &&
          githubSettings?.repoOwner &&
          githubSettings?.githubToken
        ) {
          console.log(
            '🎯 Not on bolt project but has settings - projects list should already be visible'
          );
          // Projects list is already shown as main content when not on bolt project but has settings
          // No tab switching needed as we're not in tabbed interface
        } else {
          console.log('🎯 No valid settings, redirecting to settings');
          // If no valid settings, the onboarding UI should be shown
          // No explicit action needed as the template handles this
        }
        break;

      case 'settings':
        // Switch to settings tab
        if (onBoltProject) {
          console.log('🎯 Setting active tab to settings');
          // Small delay to ensure UI is rendered
          setTimeout(() => {
            uiStateActions.setActiveTab('settings');
            console.log('🎯 Settings tab activated');
          }, 10);
        } else {
          console.log('🎯 Not on bolt project, settings handled by onboarding UI');
        }
        break;

      case 'upgrade':
        // Show upgrade modal with the specified feature
        if (upgradeFeature) {
          // Import upgrade modal utility to get the configuration
          const { getUpgradeModalConfig } = await import('$lib/utils/upgradeModal');
          try {
            // Ensure the upgradeFeature is a valid key
            const validFeature = [
              'general',
              'fileChanges',
              'pushReminders',
              'branchSelector',
              'issues',
            ].includes(upgradeFeature)
              ? (upgradeFeature as
                  | 'issues'
                  | 'general'
                  | 'fileChanges'
                  | 'pushReminders'
                  | 'branchSelector')
              : ('general' as const);
            const config = getUpgradeModalConfig(validFeature);
            upgradeModalFeature = config.feature;
            upgradeModalReason = config.reason;
            premiumFeatures = config.features;
            showUpgradeModal = true;
          } catch (error) {
            console.error('Error loading upgrade modal config:', error);
            // Fallback to general upgrade modal
            upgradeModalFeature = 'premium';
            upgradeModalReason = 'Unlock professional features';
            premiumFeatures = [];
            showUpgradeModal = true;
          }
        }
        break;

      case 'home':
      default:
        break;
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
      // Show success toast with potential subscription prompt
      await handleSuccessfulAction('Settings saved successfully!');
    } else {
      // Check if it's a storage quota error
      if (result.error && result.error.includes('MAX_WRITE_OPERATIONS_PER_H')) {
        // Don't show on button, this will be handled in GitHubSettings component
        console.error('Storage quota exceeded:', result.error);
      } else {
        uiStateActions.showStatus(result.error || 'Error saving settings');
      }
    }
  }

  function handleSettingsError(error: string) {
    // This will be called from GitHubSettings when storage quota errors occur
    if (error.includes('MAX_WRITE_OPERATIONS_PER_H')) {
      // Clear any existing status to prevent it showing on button
      uiStateActions.clearStatus();
    }
  }

  function handleSwitchTab(event: CustomEvent<string>) {
    uiStateActions.setActiveTab(event.detail);
  }

  function openSignInPage() {
    // Use browser extension API to open new tab
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'https://bolt2github.com/login' });
    }
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

  // Newsletter subscription functions
  async function handleNewsletterClick() {
    showNewsletterModal = true;
  }

  async function handleNewsletterModalClose() {
    showNewsletterModal = false;
    // Refresh subscription status
    try {
      const subscription = await SubscriptionService.getSubscriptionStatus();
      hasSubscribed = subscription.subscribed;
    } catch (error) {
      console.error('Error refreshing subscription status:', error);
    }
  }

  async function handleSuccessfulAction(message: string) {
    // Increment interaction count
    try {
      const count = await SubscriptionService.incrementInteractionCount();

      // Check if we should show subscription prompt
      const shouldPrompt = await SubscriptionService.shouldShowSubscriptionPrompt();

      successToastMessage = message;
      showSubscribePrompt = shouldPrompt && !hasSubscribed;
      showSuccessToast = true;
    } catch (error) {
      console.error('Error handling successful action:', error);
      // Still show success toast without subscription prompt
      successToastMessage = message;
      showSuccessToast = true;
    }
  }

  async function handleToastSubscribe() {
    await SubscriptionService.updateLastPromptDate();
    showNewsletterModal = true;
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
        {:else if onBoltProject || (githubSettings.hasInitialSettings && isUserAuthenticated)}
          <div class="flex items-center gap-2">
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
            {#if !isUserAuthenticated}
              <button
                class="text-xs text-slate-400 hover:text-slate-300 transition-colors underline"
                on:click={openSignInPage}
                title="Sign in if you already have a premium account"
              >
                Sign in
              </button>
            {/if}
          </div>
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
              <SocialLinks
                {GITHUB_LINK}
                {YOUTUBE_LINK}
                {COFFEE_LINK}
                on:feedback={() => (showFeedbackModal = true)}
              />
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
                onError={handleSettingsError}
                onInput={() => {}}
              />

              <!-- Push Reminder Settings -->
              <PushReminderSection on:configure={() => (showPushReminderSettings = true)} />

              <!-- GitHub Apps Integration Test -->
              <!-- TODO: Remove this before release -->
              <GitHubSettingsApp />

              <!-- Premium Status -->
              <PremiumStatus
                on:upgrade={() => {
                  setUpgradeModalState('general', (feature, reason, features) => {
                    upgradeModalFeature = feature;
                    upgradeModalReason = reason;
                    premiumFeatures = features;
                    showUpgradeModal = true;
                  });
                }}
              />

              <!-- Analytics Toggle -->
              <AnalyticsToggle />
            </div>
          </TabsContent>

          <TabsContent value="help">
            <div class="space-y-4">
              <Help />

              <!-- Newsletter Subscription -->
              <NewsletterSection />

              <div class="mt-3">
                <Footer
                  {hasSubscribed}
                  version={projectSettings.version}
                  on:newsletter={handleNewsletterClick}
                />
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
              onError={handleSettingsError}
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

  <FeedbackModal bind:show={showFeedbackModal} githubToken={githubSettings.githubToken} />

  <!-- Newsletter subscription modal -->
  <NewsletterModal bind:show={showNewsletterModal} on:close={handleNewsletterModalClose} />

  <!-- Success toast with optional subscription prompt -->
  <SuccessToast
    bind:show={showSuccessToast}
    message={successToastMessage}
    {showSubscribePrompt}
    {hasSubscribed}
    on:subscribe={handleToastSubscribe}
    on:hide={() => {
      showSuccessToast = false;
      showSubscribePrompt = false;
    }}
  />

  <!-- Issues modal -->
  {#if settingsValid && githubSettings.githubToken && githubSettings.repoOwner && githubSettings.repoName}
    <IssueManager
      bind:show={showIssuesModal}
      githubToken={githubSettings.githubToken}
      repoOwner={githubSettings.repoOwner}
      repoName={githubSettings.repoName}
      on:close={() => (showIssuesModal = false)}
    />
  {/if}
</main>

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
