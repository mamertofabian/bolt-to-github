<script context="module" lang="ts">
  import type { GitHubConnectionResult } from '$lib/utils/githubConnection';

  const POPUP_CONTEXT_UPGRADE_TYPES = [
    'general',
    'fileChanges',
    'pushReminders',
    'branchSelector',
    'issues',
    'commits',
  ] as const;

  type PopupContextPremiumFeature = import('$lib/constants/premiumFeatures').PremiumFeature;
  type PopupContextUpgradeModalType = import('$lib/utils/upgradeModal').UpgradeModalType;
  type PopupContextUpgradeFeature = (typeof POPUP_CONTEXT_UPGRADE_TYPES)[number];
  type PopupContextApplyUpgradeModalState = (
    feature: string,
    reason: string,
    features: PopupContextPremiumFeature[]
  ) => void;
  type PopupContextUpgradeModalStateSetter = (
    type: PopupContextUpgradeModalType,
    setState: PopupContextApplyUpgradeModalState
  ) => void;
  export async function reconcilePopupGitHubConnection(
    checkConnection: () => Promise<GitHubConnectionResult>,
    refreshSettings: () => Promise<void>,
    showStatus: (message: string, duration: number) => void
  ): Promise<GitHubConnectionResult> {
    const connection = await checkConnection();
    if (!connection.connected) {
      if (connection.reason === 'not_connected') {
        await refreshSettings();
      }
      showStatus(connection.message, 10000);
    }
    return connection;
  }

  export async function runPopupGitHubAction(
    checkConnection: () => Promise<GitHubConnectionResult>,
    refreshSettings: () => Promise<void>,
    showStatus: (message: string, duration: number) => void,
    action: () => Promise<void>
  ): Promise<boolean> {
    const connection = await reconcilePopupGitHubConnection(
      checkConnection,
      refreshSettings,
      showStatus
    );
    if (!connection.connected) {
      return false;
    }

    await action();
    return true;
  }

  export function canOpenPopupGitHubSurface(
    connectionReady: boolean,
    requirementsMet: boolean
  ): boolean {
    return connectionReady && requirementsMet;
  }

  function isPopupContextUpgradeFeature(value: string): value is PopupContextUpgradeFeature {
    return (POPUP_CONTEXT_UPGRADE_TYPES as readonly string[]).includes(value);
  }

  export function openTrackedUpgradeModalFromPopupContext(
    upgradeFeature: string,
    setUpgradeState: PopupContextUpgradeModalStateSetter,
    applyState: PopupContextApplyUpgradeModalState
  ): void {
    const validFeature = isPopupContextUpgradeFeature(upgradeFeature) ? upgradeFeature : 'general';

    setUpgradeState(validFeature, applyState);
  }
</script>

<script lang="ts">
  import IssueManager from '$lib/components/IssueManager.svelte';
  import NewsletterModal from '$lib/components/NewsletterModal.svelte';
  import SuccessToast from '$lib/components/SuccessToast.svelte';
  import { Button } from '$lib/components/ui/button';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';
  import { ChromeStorageService } from '$lib/services/chromeStorage';
  import {
    completeGitHubAppMigration,
    migrateLegacyGitHubAuthentication,
  } from '$lib/services/githubAuthMigration';
  import { createLogger } from '$lib/utils/logger';
  import { setUpgradeModalState, type UpgradeModalType } from '$lib/utils/upgradeModal';
  import { closePopupWindow, isWindowMode, openPopupWindow } from '$lib/utils/windowMode';
  import { checkGitHubConnection, checkPopupGitHubConnection } from '$lib/utils/githubConnection';
  import { ExternalLink, LoaderCircle, Minimize2 } from 'lucide-svelte';
  import { onDestroy, onMount } from 'svelte';
  import { STORAGE_KEY } from '../background/TempRepoManager';
  import { SubscriptionService } from '../services/SubscriptionService';
  import FeedbackModal from './components/FeedbackModal.svelte';
  import FileChangesModal from './components/FileChangesModal.svelte';
  import OnboardingView from './components/OnboardingView.svelte';
  import PushReminderSettings from './components/PushReminderSettings.svelte';
  import TabsView from './components/TabsView.svelte';
  import TempRepoModal from './components/TempRepoModal.svelte';
  import UpgradeModal from './components/UpgradeModal.svelte';
  // Import stores and services
  import { ChromeMessagingService } from '$lib/services/chromeMessaging';
  import {
    currentProjectId,
    fileChangesActions,
    fileChangesStore,
    githubSettingsActions,
    githubSettingsStore,
    isAuthenticated,
    isAuthenticationValid,
    isOnBoltProject,
    isPremium,
    isSettingsValid,
    premiumStatusActions,
    projectSettingsActions,
    projectSettingsStore,
    uiStateActions,
    uiStateStore,
    uploadStateActions,
    type TempRepoMetadata,
  } from '$lib/stores';
  import type { PremiumFeature, ProjectStatusRef } from './types';

  const logger = createLogger('App');

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
  $: settingsValid = $isSettingsValid;
  $: authenticationValid = $isAuthenticationValid;
  $: onBoltProject = $isOnBoltProject;
  $: projectId = $currentProjectId;
  $: isUserAuthenticated = $isAuthenticated;
  $: isUserPremium = $isPremium;

  // Component references and modal states
  let projectStatusRef: ProjectStatusRef = null;

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
    features: [] as PremiumFeature[],
  };

  // Newsletter subscription state
  let hasSubscribed = false;
  let successToastMessage = '';
  let showSubscribePrompt = false;

  // GitHub-backed components still accept a token-shaped capability. The
  // background service resolves this sentinel to a short-lived App credential.
  let effectiveGithubToken = '';
  let githubConnectionChecking = true;
  let githubConnectionReady = false;
  let githubAppMigrationRequired = false;
  let popupSettingsInitialized = false;

  async function initializePopupGitHubSettings() {
    await githubSettingsActions.initialize();
    popupSettingsInitialized = true;
  }

  const githubConnectionInitialization = migrateLegacyGitHubAuthentication()
    .then((decision) => {
      githubAppMigrationRequired = decision.status === 'migration_required';
      return reconcilePopupGitHubConnection(
        () => checkPopupGitHubConnection(),
        initializePopupGitHubSettings,
        (message, duration) => uiStateActions.showStatus(message, duration)
      );
    })
    .then(async (connection) => {
      if (!popupSettingsInitialized) {
        await initializePopupGitHubSettings();
      }

      if (githubSettings.githubAppInstallationId) {
        // The migration intentionally removes the legacy selector key. Normalize
        // the still-transitional store in memory until its PAT fields are deleted
        // by the storage-and-types retirement child.
        githubSettingsActions.setAuthenticationMethod('github_app');
        if (!githubSettings.repoOwner && githubSettings.githubAppUsername) {
          githubSettingsActions.setRepoOwner(githubSettings.githubAppUsername);
        }
      }

      if (
        await completeGitHubAppMigration(
          connection.connected,
          Boolean(githubSettings.githubAppInstallationId)
        )
      ) {
        githubAppMigrationRequired = false;
      }

      githubConnectionReady = connection.connected;
      githubConnectionChecking = false;
      return connection;
    })
    .catch((error: unknown) => {
      logger.error('Unable to initialize GitHub App migration:', error);
      githubConnectionReady = false;
      githubConnectionChecking = false;
      uiStateActions.showStatus(
        'Unable to prepare the GitHub App migration. Reload the extension and try again.',
        10000
      );
      return {
        connected: false,
        reason: 'unavailable' as const,
        message: 'Unable to prepare the GitHub App migration.',
      };
    });

  // Add pending popup context state
  let pendingPopupContext = '';
  let pendingUpgradeFeature = '';
  let hasHandledPendingContext = false;

  // Window mode detection
  let isInWindowMode = false;

  // Computed display mode
  $: displayMode = (() => {
    if (hasValidAuthenticationForProjectsList) return DISPLAY_MODES.TABS;
    return DISPLAY_MODES.ONBOARDING;
  })();

  // Reactive check for valid authentication for ProjectsList display
  $: hasValidAuthenticationForProjectsList = !!(
    githubConnectionReady &&
    githubSettings.repoOwner &&
    githubSettings.githubAppInstallationId
  );

  // Handle pending popup context when stores are ready
  $: if (
    pendingPopupContext &&
    !hasHandledPendingContext &&
    githubSettings &&
    typeof settingsValid !== 'undefined' &&
    typeof onBoltProject !== 'undefined'
  ) {
    logger.info('🎯 Triggering handlePendingPopupContext with:', {
      pendingPopupContext,
      onBoltProject,
      settingsValid,
      projectId,
      hasGitHubSettings: !!(githubSettings?.repoOwner && githubSettings?.githubAppInstallationId),
    });
    handlePendingPopupContext();
  }

  // Message handlers
  function handleUploadStatusMessage(message: unknown): void {
    const msg = message as {
      type?: string;
      status?: import('$lib/types').ProcessingStatus;
      progress?: number;
      message?: string;
    };
    if (msg?.type === 'UPLOAD_STATUS') {
      uploadStateActions.handleUploadStatusMessage({
        type: 'UPLOAD_STATUS',
        status: msg.status,
        progress: msg.progress,
        message: msg.message,
      });
    }
  }

  function handleFileChangesMessage(message: unknown): void {
    const msg = message as {
      type?: string;
      changes?: Record<string, unknown>;
      projectId?: string;
    };
    if (msg?.type === 'FILE_CHANGES' && msg.changes && msg.projectId) {
      logger.info('Received file changes:', msg.changes, 'for project:', msg.projectId);
      fileChangesActions.processFileChangesMessage(
        msg.changes as Record<string, import('../services/FilePreviewService').FileChange>,
        msg.projectId
      );
    }
  }

  function handleOpenFileChangesMessage() {
    showStoredFileChanges();
  }

  $: effectiveGithubToken =
    githubConnectionReady && githubSettings.githubAppInstallationId ? 'github_app_token' : '';

  async function initializeApp() {
    // Add dark mode to the document
    document.documentElement.classList.add('dark');

    // Detect window mode
    isInWindowMode = isWindowMode();

    const connection = await githubConnectionInitialization;

    // Initialize stores
    projectSettingsActions.initialize();
    uploadStateActions.initializePort();
    premiumStatusActions.initialize();

    // Force sync authentication status from background service
    try {
      await chrome.runtime.sendMessage({ type: 'FORCE_POPUP_SYNC' });
      logger.info('✅ Forced authentication sync from background service');
    } catch (error) {
      logger.warn('Failed to force sync authentication status:', error);
    }

    // Setup Chrome messaging
    ChromeMessagingService.addPortMessageHandler(handleUploadStatusMessage);
    ChromeMessagingService.addPortMessageHandler(handleFileChangesMessage);

    // Check for pending file changes first
    if (connection.connected) {
      const pendingChanges = await chrome.storage.local.get('pendingFileChanges');
      if (pendingChanges.pendingFileChanges) {
        logger.info('Found pending file changes:', pendingChanges.pendingFileChanges);
        const fileChangesMap = new Map(Object.entries(pendingChanges.pendingFileChanges)) as Map<
          string,
          import('../services/FilePreviewService').FileChange
        >;
        fileChangesActions.setFileChanges(fileChangesMap);
        fileChangesActions.showModal();
        await chrome.storage.local.remove('pendingFileChanges');
        logger.info('Cleared pending file changes from storage');
      }
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
      logger.error('Error loading subscription status:', error);
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

      logger.info(
        '🔧 Checking if auto-creation of project settings is needed for project:',
        projectId
      );

      // Check if project settings already exist
      const existingSettings = await chrome.storage.sync.get(['projectSettings']);
      const projectSettings = existingSettings.projectSettings || {};

      if (projectSettings[projectId]) {
        logger.info('✅ Project settings already exist for project:', projectId);
        return;
      }

      // Check if we have valid authentication
      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(['repoOwner']),
        chrome.storage.local.get(['githubAppInstallationId']),
      ]);

      const hasValidAuth = Boolean(localSettings.githubAppInstallationId);

      if (!syncSettings.repoOwner || !hasValidAuth) {
        logger.warn('⚠️ No valid authentication or repoOwner found, skipping auto-creation');
        return;
      }

      logger.info('🚀 Auto-creating project settings for Bolt project:', projectId);

      // Create default project settings with private repository
      const newProjectSettings = {
        repoName: projectId,
        branch: 'main',
        projectTitle: projectId, // Use project ID as initial title
      };

      // Save project settings using ChromeStorageService (thread-safe)
      await ChromeStorageService.saveProjectSettings(
        projectId,
        newProjectSettings.repoName,
        newProjectSettings.branch,
        newProjectSettings.projectTitle
      );

      // Update the stores to reflect the new settings
      githubSettingsActions.setProjectSettings(
        projectId,
        newProjectSettings.repoName,
        newProjectSettings.branch,
        newProjectSettings.projectTitle
      );

      // Load the newly created settings
      githubSettingsActions.loadProjectSettings(projectId);

      logger.info('✅ Auto-created project settings:', newProjectSettings);

      logger.info(
        '🎯 Project settings auto-created successfully. Repository will be private by default.'
      );
    } catch (error) {
      logger.error('❌ Error auto-creating project settings:', error);
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
        logger.info('Popup opened with context:', context);
        pendingPopupContext = context;
        pendingUpgradeFeature = upgradeFeature || '';

        // Clear the context after storing it
        await chrome.storage.local.remove(['popupContext', 'upgradeModalFeature']);
      }
    } catch (error) {
      logger.error('Error checking popup context:', error);
    }
  }

  async function handlePendingPopupContext() {
    if (!pendingPopupContext || hasHandledPendingContext) return;

    hasHandledPendingContext = true;
    const context = pendingPopupContext;
    const upgradeFeature = pendingUpgradeFeature;

    logger.info('🎯 Handling pending popup context:', context, {
      onBoltProject,
      settingsValid,
      projectId,
      hasGitHubSettings: !!(githubSettings?.repoOwner && githubSettings?.githubAppInstallationId),
      activeTab: uiState.activeTab,
    });

    switch (context) {
      case 'issues':
        // Only show issues if we have valid settings and are on a Bolt project
        if (
          canOpenPopupGitHubSurface(
            githubConnectionReady,
            Boolean(settingsValid && projectId && githubSettings.githubAppInstallationId)
          )
        ) {
          logger.info('🎯 Opening issues modal');
          modalStates.issues = true;
        } else {
          logger.info('🎯 Issues access denied, going to home tab');
          uiStateActions.setActiveTab('home');
        }
        break;

      case 'projects':
        logger.info('🎯 Processing projects context...');
        // Switch to projects tab if on bolt project
        if (onBoltProject) {
          logger.info('🎯 On bolt project, setting active tab to projects');
          // Small delay to ensure UI is rendered
          setTimeout(() => {
            uiStateActions.setActiveTab('projects');
            logger.info('🎯 Projects tab activated');
          }, 10);
        } else if (githubSettings?.repoOwner && githubSettings?.githubAppInstallationId) {
          logger.info(
            '🎯 Not on bolt project but has settings - projects list should already be visible'
          );
          // Projects list is already shown as main content when not on bolt project but has settings
          // No tab switching needed as we're not in tabbed interface
        } else {
          logger.info('🎯 No valid settings, redirecting to settings');
          // If no valid settings, the onboarding UI should be shown
          // No explicit action needed as the template handles this
        }
        break;

      case 'settings':
        // Switch to settings tab
        if (onBoltProject) {
          logger.info('🎯 Setting active tab to settings');
          // Small delay to ensure UI is rendered
          setTimeout(() => {
            uiStateActions.setActiveTab('settings');
            logger.info('🎯 Settings tab activated');
          }, 10);
        } else {
          logger.info('🎯 Not on bolt project, settings handled by onboarding UI');
        }
        break;

      case 'upgrade':
        // Show upgrade modal with the specified feature
        if (upgradeFeature) {
          try {
            openTrackedUpgradeModalFromPopupContext(
              upgradeFeature,
              setUpgradeModalState,
              (feature, reason, features) => {
                upgradeModalConfig.feature = feature;
                upgradeModalConfig.reason = reason;
                upgradeModalConfig.features = features;
                modalStates.upgrade = true;
              }
            );
          } catch (error) {
            logger.error('Error loading upgrade modal config:', error);
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
      logger.info('🚀 Saving project settings for project:', projectId);
      githubSettingsActions.setProjectSettings(
        projectId,
        githubSettings.repoName,
        githubSettings.branch
      );
    }

    logger.info('🚀 Saving settings');
    const result = await githubSettingsActions.saveSettings();
    if (result.success) {
      // Show success toast with potential subscription prompt
      await handleSuccessfulAction('Settings saved successfully!');
    } else {
      // Check if it's a storage quota error
      if (result.error && result.error.includes('MAX_WRITE_OPERATIONS_PER_H')) {
        // Don't show on button, this will be handled in GitHubSettings component
        logger.error('Storage quota exceeded:', result.error);
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
    githubConnectionReady = await runPopupGitHubAction(
      () => checkGitHubConnection(),
      () => githubSettingsActions.initialize(),
      (message, duration) => uiStateActions.showStatus(message, duration),
      async () => {
        const success = await fileChangesActions.loadStoredFileChanges(projectId);
        if (!success) {
          // Try to request from content script
          try {
            await fileChangesActions.requestFileChangesFromContentScript();
            uiStateActions.showStatus('Calculating file changes...', 5000);
          } catch {
            uiStateActions.showStatus('Cannot show file changes: Not on a Bolt project page');
          }
        }
      }
    );
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
      await projectStatusRef?.getProjectStatus();
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
      logger.info('Cleared stored file changes on popup close');
      ChromeMessagingService.cleanup();
      uploadStateActions.disconnect();
    } catch (error) {
      logger.error('Error during cleanup:', error);
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
    } catch (_error) {
      logger.error('Error refreshing subscription status:', _error);
    }
  }

  async function handleSuccessfulAction(message: string) {
    // Increment interaction count
    try {
      await SubscriptionService.incrementInteractionCount();

      // Check if we should show subscription prompt
      const shouldPrompt = await SubscriptionService.shouldShowSubscriptionPrompt();

      successToastMessage = message;
      showSubscribePrompt = shouldPrompt && !hasSubscribed;
      modalStates.successToast = true;
    } catch (error) {
      logger.error('Error handling successful action:', error);
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

  // Handle pop-out button click
  async function handlePopOutClick() {
    try {
      // Schedule close after opening window to be able to close the current popup
      setTimeout(() => window.close(), 100);
      await openPopupWindow();
    } catch (error) {
      logger.error('Failed to open popup window:', error);
      uiStateActions.showStatus('Failed to open popup window');
    }
  }

  // Handle pop back in button click
  async function handlePopBackIn() {
    try {
      const result = await closePopupWindow();
      if (!result.success) {
        uiStateActions.showStatus(`Failed to switch back to popup: ${result.error}`);
      }
      // Note: If successful, this window will close and the regular popup will open
    } catch (error) {
      logger.error('Failed to switch back to popup:', error);
      uiStateActions.showStatus('Failed to switch back to popup');
    }
  }

  onMount(initializeApp);
  onDestroy(cleanup);
</script>

<main class="w-[400px] h-[600px] p-3 bg-slate-950 text-slate-50">
  <Card class="border-slate-800 bg-slate-900">
    <CardHeader>
      <CardTitle class="flex items-center justify-between">
        <a
          href="https://bolt2github.com"
          target="_blank"
          class="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <img src="/assets/icons/icon48.png" alt="Bolt to GitHub" class="w-5 h-5" />
          Bolt to GitHub <span class="text-xs text-slate-400">v{projectSettings.version}</span>
        </a>
        <div class="flex items-center gap-2">
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
          {:else if onBoltProject || (githubSettings.githubAppInstallationId && isUserAuthenticated)}
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

          <!-- Window mode toggle buttons -->
          {#if !isInWindowMode}
            <!-- Pop-out button (only show in popup mode) -->
            <Button
              size="sm"
              variant="ghost"
              class="h-8 w-8 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              on:click={handlePopOutClick}
              title="Open in window"
            >
              <ExternalLink size={16} />
            </Button>
          {:else}
            <!-- Pop back in button (only show in window mode) -->
            <Button
              size="sm"
              variant="ghost"
              class="h-8 w-8 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              on:click={handlePopBackIn}
              title="Pop back in"
            >
              <Minimize2 size={16} />
            </Button>
          {/if}
        </div>
      </CardTitle>
      <CardDescription class="text-slate-400">
        Upload and sync your Bolt projects to GitHub
      </CardDescription>
    </CardHeader>
    <CardContent>
      {#if githubConnectionChecking}
        <div
          role="status"
          aria-live="polite"
          class="flex flex-col items-center justify-center gap-3 py-8 text-center"
        >
          <LoaderCircle class="h-7 w-7 animate-spin text-blue-400" aria-hidden="true" />
          <div class="space-y-1">
            <p class="text-sm font-medium text-slate-200">Checking GitHub connection</p>
            <p class="text-xs text-slate-500">This should only take a moment</p>
          </div>
        </div>
      {:else if displayMode === DISPLAY_MODES.TABS}
        <TabsView
          {uiState}
          {githubSettings}
          {projectSettings}
          {projectId}
          isAuthenticationValid={authenticationValid}
          {isUserPremium}
          bind:projectStatusRef
          on:switchTab={handleSwitchTab}
          on:showFileChanges={showStoredFileChanges}
          on:feedback={() => (modalStates.feedback = true)}
          on:upgradeClick={(e) => handleUpgradeClick(e.detail)}
          on:newsletter={handleNewsletterClick}
          on:save={saveSettings}
          on:error={(e) => handleSettingsError(e.detail)}
          on:configurePushReminder={handleConfigurePushReminder}
        />
      {:else}
        <OnboardingView
          {githubSettings}
          {projectSettings}
          {uiState}
          {isUserAuthenticated}
          migrationRequired={githubAppMigrationRequired}
          on:save={saveSettings}
          on:error={(e) => handleSettingsError(e.detail)}
        />
      {/if}
    </CardContent>
  </Card>

  {#if githubConnectionReady}
    <FileChangesModal
      bind:show={fileChangesState.showModal}
      bind:fileChanges={fileChangesState.fileChanges}
    />
  {/if}

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
  {#if canOpenPopupGitHubSurface(githubConnectionReady, Boolean(settingsValid && effectiveGithubToken && githubSettings.repoOwner && githubSettings.repoName))}
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
