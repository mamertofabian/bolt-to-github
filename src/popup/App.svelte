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
  import { Button } from '$lib/components/ui/button';
  import ProjectsList from '$lib/components/ProjectsList.svelte';
  import FileChangesModal from './components/FileChangesModal.svelte';
  import TempRepoModal from './components/TempRepoModal.svelte';
  import PushReminderSettings from './components/PushReminderSettings.svelte';
  import UpgradeModal from './components/UpgradeModal.svelte';
  import FeedbackModal from './components/FeedbackModal.svelte';
  import NewsletterModal from '$lib/components/NewsletterModal.svelte';
  import SuccessToast from '$lib/components/SuccessToast.svelte';
  import IssueManager from '$lib/components/IssueManager.svelte';
  import TabsView from './components/TabsView.svelte';
  import OnboardingView from './components/OnboardingView.svelte';
  import { setUpgradeModalState, type UpgradeModalType } from '$lib/utils/upgradeModal';
  import { SubscriptionService } from '../services/SubscriptionService';

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

  // Constants for display modes
  const DISPLAY_MODES = {
    TABS: 'tabs',
    PROJECTS_LIST: 'projectsList',
    ONBOARDING: 'onboarding',
  } as const;

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

  // Component references and modal states
  let projectStatusRef: any;

  // Modal states grouped together
  let modalStates = {
    pushReminderSettings: false,
    upgrade: false,
    feedback: false,
    newsletter: false,
    issues: false,
    successToast: false,
  };

  // Upgrade modal configuration
  let upgradeModalConfig = {
    feature: '',
    reason: '',
    features: [] as Array<{ id: string; name: string; description: string; icon: string }>,
  };

  // Newsletter subscription state
  let hasSubscribed = false;
  let successToastMessage = '';
  let showSubscribePrompt = false;

  // Effective GitHub token for different auth methods
  let effectiveGithubToken = '';

  // Add pending popup context state
  let pendingPopupContext = '';
  let pendingUpgradeFeature = '';
  let hasHandledPendingContext = false;

  // Computed display mode
  $: displayMode = (() => {
    if (onBoltProject) return DISPLAY_MODES.TABS;
    if (hasValidAuthenticationForProjectsList) return DISPLAY_MODES.PROJECTS_LIST;
    return DISPLAY_MODES.ONBOARDING;
  })();

  // Reactive check for valid authentication for ProjectsList display
  $: hasValidAuthenticationForProjectsList = !!(
    githubSettings.hasInitialSettings &&
    githubSettings.repoOwner &&
    ((githubSettings.authenticationMethod === 'github_app' &&
      githubSettings.githubAppInstallationId) ||
      (githubSettings.authenticationMethod === 'pat' && githubSettings.githubToken))
  );

  // Common props for components
  $: projectsListProps = {
    repoOwner: githubSettings.repoOwner,
    currentlyLoadedProjectId: projectId,
    isBoltSite: projectSettings.isBoltSite,
  };

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

  async function updateEffectiveToken() {
    // Get authentication method to determine correct token to use
    const authSettings = await chrome.storage.local.get(['authenticationMethod']);
    const authMethod = authSettings.authenticationMethod || 'pat';

    if (authMethod === 'github_app') {
      // For GitHub App, use a placeholder token that the store will recognize
      effectiveGithubToken = 'github_app_token';
    } else {
      // For PAT, use the actual token
      effectiveGithubToken = githubSettings.githubToken || '';
    }
  }

  // Update effective token when settings change
  $: if (githubSettings) {
    updateEffectiveToken();
  }

  async function initializeApp() {
    // Add dark mode to the document
    document.documentElement.classList.add('dark');

    // Initialize stores
    projectSettingsActions.initialize();
    githubSettingsActions.initialize();
    uploadStateActions.initializePort();
    premiumStatusActions.initialize();

    // Force sync authentication status from background service
    try {
      await chrome.runtime.sendMessage({ type: 'FORCE_POPUP_SYNC' });
      console.log('✅ Forced authentication sync from background service');
    } catch (error) {
      console.warn('Failed to force sync authentication status:', error);
    }

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

    // Auto-create project settings if on Bolt project and have valid auth
    await autoCreateProjectSettingsIfNeeded();

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
      upgradeModalConfig.feature = event.detail.feature;
      upgradeModalConfig.reason = event.detail.reason;
      upgradeModalConfig.features = event.detail.features;
      modalStates.upgrade = true;
    }) as (event: Event) => void);

    // Initialize newsletter subscription status
    try {
      const subscription = await SubscriptionService.getSubscriptionStatus();
      hasSubscribed = subscription.subscribed;
    } catch (error) {
      console.error('Error loading subscription status:', error);
    }
  }

  /**
   * Automatically create project settings for Bolt projects when popup is opened
   * This ensures repositories are set to private by default without user intervention
   */
  async function autoCreateProjectSettingsIfNeeded() {
    try {
      // Only proceed if we're on a Bolt project
      if (!onBoltProject || !projectId) {
        return;
      }

      console.log(
        '🔧 Checking if auto-creation of project settings is needed for project:',
        projectId
      );

      // Check if project settings already exist
      const existingSettings = await chrome.storage.sync.get(['projectSettings']);
      const projectSettings = existingSettings.projectSettings || {};

      if (projectSettings[projectId]) {
        console.log('✅ Project settings already exist for project:', projectId);
        return;
      }

      // Check if we have valid authentication
      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['authenticationMethod', 'githubAppInstallationId']),
      ]);

      const authMethod = localSettings.authenticationMethod || 'pat';
      const hasValidAuth =
        authMethod === 'github_app'
          ? Boolean(localSettings.githubAppInstallationId)
          : Boolean(githubSettings.githubToken);

      if (!syncSettings.repoOwner || !hasValidAuth) {
        console.log('⚠️ No valid authentication or repoOwner found, skipping auto-creation');
        return;
      }

      console.log('🚀 Auto-creating project settings for Bolt project:', projectId);

      // Create default project settings with private repository
      const newProjectSettings = {
        repoName: projectId,
        branch: 'main',
        projectTitle: projectId, // Use project ID as initial title
      };

      // Update the project settings in storage
      const updatedProjectSettings = {
        ...projectSettings,
        [projectId]: newProjectSettings,
      };

      await chrome.storage.sync.set({
        projectSettings: updatedProjectSettings,
      });

      // Update the stores to reflect the new settings
      githubSettingsActions.setProjectSettings(
        projectId,
        newProjectSettings.repoName,
        newProjectSettings.branch,
        newProjectSettings.projectTitle
      );

      // Load the newly created settings
      githubSettingsActions.loadProjectSettings(projectId);

      console.log('✅ Auto-created project settings:', newProjectSettings);

      // Store a timestamp to trigger UI updates
      await chrome.storage.local.set({
        lastSettingsUpdate: {
          timestamp: Date.now(),
          projectId,
          repoName: newProjectSettings.repoName,
          branch: newProjectSettings.branch,
          projectTitle: newProjectSettings.projectTitle,
          autoCreated: true,
        },
      });

      console.log(
        '🎯 Project settings auto-created successfully. Repository will be private by default.'
      );
    } catch (error) {
      console.error('❌ Error auto-creating project settings:', error);
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
          modalStates.issues = true;
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
            upgradeModalConfig.feature = config.feature;
            upgradeModalConfig.reason = config.reason;
            upgradeModalConfig.features = config.features;
            modalStates.upgrade = true;
          } catch (error) {
            console.error('Error loading upgrade modal config:', error);
            // Fallback to general upgrade modal
            upgradeModalConfig.feature = 'premium';
            upgradeModalConfig.reason = 'Unlock professional features';
            upgradeModalConfig.features = [];
            modalStates.upgrade = true;
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
      console.log('🚀 Saving project settings for project:', projectId);
      githubSettingsActions.setProjectSettings(
        projectId,
        githubSettings.repoName,
        githubSettings.branch
      );
    }

    console.log('🚀 Saving settings');
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

  // Event handlers for child components
  function handleSwitchTab(event: CustomEvent<string>) {
    uiStateActions.setActiveTab(event.detail);
  }

  function handleConfigurePushReminder() {
    modalStates.pushReminderSettings = true;
  }

  function openSignInPage() {
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
    modalStates.newsletter = true;
  }

  async function handleNewsletterModalClose() {
    modalStates.newsletter = false;
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
      modalStates.successToast = true;
    } catch (error) {
      console.error('Error handling successful action:', error);
      // Still show success toast without subscription prompt
      successToastMessage = message;
      modalStates.successToast = true;
    }
  }

  async function handleToastSubscribe() {
    await SubscriptionService.updateLastPromptDate();
    modalStates.newsletter = true;
  }

  const handleUpgradeClick = (upgradeModalType: UpgradeModalType) => {
    setUpgradeModalState(upgradeModalType, (feature, reason, features) => {
      upgradeModalConfig.feature = feature;
      upgradeModalConfig.reason = reason;
      upgradeModalConfig.features = features;
      modalStates.upgrade = true;
    });
  };

  // Handle authentication method change
  function authMethodChangeHandler(event: CustomEvent<string>) {
    const newAuthMethod = event.detail;
    githubSettingsActions.setAuthenticationMethod(newAuthMethod as 'github_app' | 'pat');
    updateEffectiveToken();
  }

  onMount(initializeApp);
  onDestroy(cleanup);
</script>

<main class="w-[400px] h-[600px] p-3 bg-slate-950 text-slate-50">
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
              on:click={() => handleUpgradeClick('general')}
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
      {#if displayMode === DISPLAY_MODES.TABS}
        <TabsView
          {uiState}
          {githubSettings}
          {projectSettings}
          {projectId}
          {settingsValid}
          {isUserPremium}
          bind:projectStatusRef
          on:switchTab={handleSwitchTab}
          on:showFileChanges={showStoredFileChanges}
          on:feedback={() => (modalStates.feedback = true)}
          on:upgradeClick={(e) => handleUpgradeClick(e.detail)}
          on:newsletter={handleNewsletterClick}
          on:save={saveSettings}
          on:error={(e) => handleSettingsError(e.detail)}
          on:authMethodChange={authMethodChangeHandler}
          on:configurePushReminder={handleConfigurePushReminder}
        />
      {:else if displayMode === DISPLAY_MODES.PROJECTS_LIST}
        <ProjectsList {...projectsListProps} githubToken={effectiveGithubToken} />
      {:else}
        <OnboardingView
          {githubSettings}
          {projectSettings}
          {uiState}
          on:save={saveSettings}
          on:error={(e) => handleSettingsError(e.detail)}
          on:authMethodChange={authMethodChangeHandler}
        />
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

  <PushReminderSettings bind:show={modalStates.pushReminderSettings} />

  <UpgradeModal
    bind:show={modalStates.upgrade}
    feature={upgradeModalConfig.feature}
    reason={upgradeModalConfig.reason}
    features={upgradeModalConfig.features}
  />

  <FeedbackModal bind:show={modalStates.feedback} githubToken={githubSettings.githubToken} />

  <!-- Newsletter subscription modal -->
  <NewsletterModal bind:show={modalStates.newsletter} on:close={handleNewsletterModalClose} />

  <!-- Success toast with optional subscription prompt -->
  <SuccessToast
    bind:show={modalStates.successToast}
    message={successToastMessage}
    {showSubscribePrompt}
    {hasSubscribed}
    on:subscribe={handleToastSubscribe}
    on:hide={() => {
      modalStates.successToast = false;
      showSubscribePrompt = false;
    }}
  />

  <!-- Issues modal -->
  {#if settingsValid && effectiveGithubToken && githubSettings.repoOwner && githubSettings.repoName}
    <IssueManager
      bind:show={modalStates.issues}
      githubToken={effectiveGithubToken}
      repoOwner={githubSettings.repoOwner}
      repoName={githubSettings.repoName}
      on:close={() => (modalStates.issues = false)}
    />
  {/if}
</main>

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
