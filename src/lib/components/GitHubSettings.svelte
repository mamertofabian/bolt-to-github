<script lang="ts">
  import { createLogger } from '$lib/utils/logger';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    Check,
    X,
    Search,
    Loader2,
    HelpCircle,
    ChevronDown,
    ChevronUp,
    Settings,
  } from 'lucide-svelte';
  import { onMount, tick } from 'svelte';
  import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
  import { GITHUB_APP_AUTH_URL } from '$lib/constants';

  const logger = createLogger('GitHubSettings');

  export let isOnboarding: boolean = false;
  export let githubToken: string;
  export let repoOwner: string;
  export let repoName: string;
  export let branch: string = 'main';
  export let status: string;
  export let onSave: () => void;
  export let onInput: () => void;
  export let onError: ((error: string) => void) | null = null;
  export let projectId: string | null = null;
  export let projectSettings: Record<string, { repoName: string; branch: string }> = {};
  export let buttonDisabled: boolean = false;

  // New authentication method props
  export let authenticationMethod: 'pat' | 'github_app' = 'pat';
  export let githubAppInstallationId: number | null = null;
  export let githubAppUsername: string | null = null;
  export let githubAppAvatarUrl: string | null = null;
  export let onAuthMethodChange: ((method: 'pat' | 'github_app') => void) | null = null;

  // Add state for handling storage quota errors
  let storageQuotaError: string | null = null;

  let isValidatingToken = false;
  let isTokenValid: boolean | null = null;
  let tokenValidationTimeout: number;
  let validationError: string | null = null;
  let tokenType: 'classic' | 'fine-grained' | null = null;
  let isRepoNameFromProjectId = false;
  let repositories: Array<{
    name: string;
    description: string | null;
    html_url: string;
    private: boolean;
    created_at: string;
    updated_at: string;
    language: string | null;
  }> = [];
  let isLoadingRepos = false;
  let showRepoDropdown = false;
  let repoSearchQuery = '';
  let repoInputFocused = false;
  let repoExists = false;
  let selectedIndex = -1;
  let isCheckingPermissions = false;
  let lastPermissionCheck: number | null = null;
  let currentCheck: 'repos' | 'admin' | 'code' | null = null;
  let permissionStatus = {
    allRepos: undefined as boolean | undefined,
    admin: undefined as boolean | undefined,
    contents: undefined as boolean | undefined,
  };

  // Individual permission status variables for better reactivity
  let reposPermission: boolean | undefined = undefined;
  let adminPermission: boolean | undefined = undefined;
  let contentsPermission: boolean | undefined = undefined;
  let permissionError: string | null = null;
  let previousToken: string | null = null;

  // GitHub App authentication state
  let isConnectingGitHubApp = false;
  let githubAppConnectionError: string | null = null;
  let githubAppValidationResult: { isValid: boolean; error?: string; userInfo?: any } | null = null;
  let showGitHubAppPermissions = false;

  // Collapsible state - add manual toggle state
  let manuallyToggled = false;
  let isExpanded = true; // Initially expanded

  // Collapsible state - collapsed by default if settings are populated
  $: hasRequiredSettings =
    ((authenticationMethod === 'pat' && githubToken && repoOwner) ||
      (authenticationMethod === 'github_app' && githubAppInstallationId && repoOwner)) &&
    (isOnboarding || (repoName && branch));

  $: {
    // Only auto-collapse if not manually toggled by user
    if (!manuallyToggled) {
      isExpanded = isOnboarding || !hasRequiredSettings;
    }
  }

  // Handle authentication method changes
  async function handleAuthMethodChange(method: 'pat' | 'github_app') {
    authenticationMethod = method;

    // Save the authentication method preference to storage
    try {
      await chrome.storage.local.set({ preferredAuthMethod: method });
      logger.info('💾 Saved authentication method preference:', method);
    } catch (error) {
      logger.error('Failed to save authentication method preference:', error);
    }

    // Clear all validation state when switching methods
    isTokenValid = null;
    validationError = null;
    githubAppValidationResult = null;
    githubAppConnectionError = null;
    tokenType = null;
    permissionError = null;
    permissionStatus = {
      allRepos: undefined,
      admin: undefined,
      contents: undefined,
    };
    reposPermission = undefined;
    adminPermission = undefined;
    contentsPermission = undefined;
    lastPermissionCheck = null;
    previousToken = null;
    repositories = [];

    // Clear any ongoing validations
    if (tokenValidationTimeout) {
      clearTimeout(tokenValidationTimeout);
    }

    if (onAuthMethodChange) {
      onAuthMethodChange(method);
    }

    onInput();

    // Re-validate if we have the necessary credentials for the selected method
    if (method === 'pat' && githubToken && repoOwner) {
      validateSettings();
    } else if (method === 'github_app' && githubAppInstallationId) {
      validateGitHubApp();
    }
  }

  function toggleExpanded() {
    isExpanded = !isExpanded;
    manuallyToggled = true; // Mark as manually toggled
  }

  $: filteredRepos = repositories
    .filter(
      (repo) =>
        repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
        (repo.description && repo.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
    )
    .slice(0, 10);

  $: if (repoName) {
    repoExists = repositories.some((repo) => repo.name.toLowerCase() === repoName.toLowerCase());
  }

  $: if (projectId && !repoName && !isRepoNameFromProjectId) {
    repoName = projectId;
    isRepoNameFromProjectId = true;
  }

  // Helper function to create GitHub service respecting user's authentication method choice
  async function createGitHubService(): Promise<UnifiedGitHubService> {
    try {
      // Respect the user's explicit authentication method choice
      if (authenticationMethod === 'pat') {
        // User explicitly chose PAT - use it directly
        if (!githubToken) {
          throw new Error('GitHub token is required for PAT authentication');
        }
        logger.info('✅ Using PAT authentication as explicitly chosen by user');
        return new UnifiedGitHubService(githubToken);
      } else if (authenticationMethod === 'github_app') {
        // User explicitly chose GitHub App - try it first
        try {
          const service = new UnifiedGitHubService({ type: 'github_app' });
          logger.info('✅ Using GitHub App authentication as explicitly chosen by user');
          return service;
        } catch (githubAppError) {
          logger.warn('⚠️ GitHub App initialization failed for user-selected method');
          throw githubAppError;
        }
      } else {
        // Fallback for legacy cases - try smart detection
        logger.info('🔍 Using smart authentication detection for legacy compatibility');
        try {
          const service = new UnifiedGitHubService({ type: 'github_app' });
          return service;
        } catch (githubAppError) {
          if (githubToken) {
            logger.info('🔄 Fallback to PAT authentication');
            return new UnifiedGitHubService(githubToken);
          }
          throw githubAppError;
        }
      }
    } catch (error) {
      logger.error('Failed to create GitHub service:', error);
      throw error;
    }
  }

  async function loadRepositories() {
    // Check if we have valid authentication for the selected method
    const hasValidAuth =
      (authenticationMethod === 'pat' && githubToken && repoOwner && isTokenValid) ||
      (authenticationMethod === 'github_app' &&
        githubAppInstallationId &&
        githubAppValidationResult?.isValid);

    if (!hasValidAuth) return;

    try {
      isLoadingRepos = true;
      const githubService = await createGitHubService();
      repositories = await githubService.listRepos();
    } catch (error) {
      logger.error('Error loading repositories:', error);
      repositories = [];
    } finally {
      isLoadingRepos = false;
    }
  }

  function handleRepoInput() {
    repoSearchQuery = repoName;
    onInput();
  }

  function selectRepo(repo: (typeof repositories)[0]) {
    repoName = repo.name;
    showRepoDropdown = false;
    repoSearchQuery = repo.name;
    onInput();
  }

  function handleRepoKeydown(event: KeyboardEvent) {
    if (!showRepoDropdown) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredRepos.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && filteredRepos[selectedIndex]) {
          selectRepo(filteredRepos[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        showRepoDropdown = false;
        break;
    }
  }

  function handleRepoFocus() {
    repoInputFocused = true;
    showRepoDropdown = true;
    repoSearchQuery = repoName;
  }

  function handleRepoBlur() {
    repoInputFocused = false;
    // Delay hiding dropdown to allow click events to register
    setTimeout(() => {
      showRepoDropdown = false;
    }, 200);
  }

  // Define the storage change listener outside of onMount
  const storageChangeListener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    // Filter out log-related changes to avoid logging massive amounts of data
    const relevantChanges = Object.keys(changes).filter(
      (key) => !key.startsWith('logs_') && key !== 'currentLogBatch' && key !== 'logMetadata'
    );

    if (relevantChanges.length > 0) {
      const filteredChanges = relevantChanges.reduce(
        (acc, key) => {
          acc[key] = changes[key];
          return acc;
        },
        {} as Record<string, chrome.storage.StorageChange>
      );

      logger.debug(
        'Storage changes detected in GitHubSettings:',
        relevantChanges,
        'in area:',
        areaName
      );
    }

    // Check if lastSettingsUpdate changed in local storage
    if (areaName === 'local' && changes.lastSettingsUpdate) {
      const updateInfo = changes.lastSettingsUpdate.newValue as {
        timestamp: number;
        projectId: string;
        repoName: string;
        branch: string;
      };
      logger.info('Settings update detected:', updateInfo);

      // If the update is for the current project, update the local state
      if (projectId && updateInfo && updateInfo.projectId === projectId) {
        repoName = updateInfo.repoName;
        branch = updateInfo.branch;
        logger.info('Updated local state with new project settings:', repoName, branch);
      }
    }

    // Check if projectSettings changed in sync storage
    if (areaName === 'sync' && changes.projectSettings && projectId) {
      const newSettings = (changes.projectSettings.newValue || {}) as Record<
        string,
        { repoName: string; branch: string }
      >;
      if (newSettings[projectId]) {
        repoName = newSettings[projectId].repoName;
        branch = newSettings[projectId].branch;
        logger.info('Updated from sync storage:', repoName, branch);
      }
    }
  };

  // Separate async initialization function
  async function initializeSettings() {
    // Load last permission check timestamp and authentication method preference from storage
    const storage = await chrome.storage.local.get(['lastPermissionCheck', 'preferredAuthMethod']);
    lastPermissionCheck = storage.lastPermissionCheck || null;

    // Load saved authentication method preference
    if (storage.preferredAuthMethod) {
      authenticationMethod = storage.preferredAuthMethod;
      logger.info('🔄 Loaded authentication method preference:', authenticationMethod);
    } else {
      // If no preference saved, smart detect based on available credentials
      if (githubAppInstallationId) {
        authenticationMethod = 'github_app';
        logger.info('🤖 Auto-selected GitHub App based on available installation');
      } else if (githubToken) {
        authenticationMethod = 'pat';
        logger.info('🔑 Auto-selected PAT based on available token');
      }
      // Save the initial choice
      if (authenticationMethod !== 'pat') {
        // Only save if different from default
        await chrome.storage.local.set({ preferredAuthMethod: authenticationMethod });
      }
    }

    previousToken = githubToken;

    // If we have initial valid settings, validate and load repos
    if (
      (authenticationMethod === 'pat' && githubToken && repoOwner) ||
      (authenticationMethod === 'github_app' && githubAppInstallationId)
    ) {
      await validateSettings();
    }
  }

  onMount(() => {
    // Start the async initialization without awaiting it
    initializeSettings();

    // Add the storage change listener
    chrome.storage.onChanged.addListener(storageChangeListener);

    // Return a cleanup function to remove the listener when the component is destroyed
    return () => {
      chrome.storage.onChanged.removeListener(storageChangeListener);
    };
  });

  async function validateSettings() {
    // Only validate PAT when PAT method is selected
    if (authenticationMethod === 'pat') {
      if (!githubToken) {
        isTokenValid = null;
        validationError = null;
        return;
      }

      try {
        isValidatingToken = true;
        validationError = null;
        const githubService = await createGitHubService();
        const result = await githubService.validateTokenAndUser(repoOwner);
        isTokenValid = result.isValid;
        validationError = result.error || null;

        if (result.isValid) {
          // Check token type
          const isClassic = await githubService.isClassicToken();
          tokenType = isClassic ? 'classic' : 'fine-grained';
        }

        // Load repositories after successful validation
        if (result.isValid) {
          await loadRepositories();
        }
      } catch (error) {
        logger.error('Error validating PAT settings:', error);
        isTokenValid = false;
        validationError = error instanceof Error ? error.message : 'Validation failed';
      } finally {
        isValidatingToken = false;
      }
    } else if (authenticationMethod === 'github_app') {
      // For GitHub App, we don't validate tokens the same way
      if (githubAppInstallationId) {
        await validateGitHubApp();
        // Load repositories if GitHub App is valid
        if (githubAppValidationResult?.isValid) {
          await loadRepositories();
        }
      }
    }
  }

  function handleTokenInput() {
    onInput();
    isTokenValid = null;
    validationError = null;
    tokenType = null;

    // Clear existing timeout
    if (tokenValidationTimeout) {
      clearTimeout(tokenValidationTimeout);
    }

    // Debounce validation to avoid too many API calls
    tokenValidationTimeout = setTimeout(() => {
      validateSettings();
    }, 500) as unknown as number;
  }

  function handleOwnerInput() {
    onInput();
    if (githubToken) {
      handleTokenInput(); // This will trigger validation of both token and username
    }
  }

  async function checkTokenPermissions() {
    // Only check permissions for PAT authentication
    if (authenticationMethod !== 'pat' || !githubToken || isCheckingPermissions) return;

    logger.info('🔍 Starting token permissions check...');
    isCheckingPermissions = true;
    permissionError = null;
    permissionStatus = {
      allRepos: undefined,
      admin: undefined,
      contents: undefined,
    };
    reposPermission = undefined;
    adminPermission = undefined;
    contentsPermission = undefined;

    try {
      const githubService = await createGitHubService();

      const result = await githubService.verifyTokenPermissions(
        repoOwner,
        async ({ permission, isValid }) => {
          logger.info(`✅ Permission check callback: ${permission} = ${isValid}`);
          currentCheck = permission;

          // Update the status as each permission is checked
          switch (permission) {
            case 'repos':
              permissionStatus.allRepos = isValid;
              reposPermission = isValid;
              break;
            case 'admin':
              permissionStatus.admin = isValid;
              adminPermission = isValid;
              break;
            case 'code':
              permissionStatus.contents = isValid;
              contentsPermission = isValid;
              break;
          }

          // Force Svelte to update the UI by creating a new object reference
          permissionStatus = { ...permissionStatus };
          logger.info('📊 Updated permission status:', permissionStatus);

          // Force Svelte to process the DOM update
          await tick();
        }
      );

      logger.info('🏁 Permission check completed:', result);

      if (result.isValid) {
        lastPermissionCheck = Date.now();
        await chrome.storage.local.set({ lastPermissionCheck });
        previousToken = githubToken;
      } else {
        // Parse the error message to determine which permission failed
        permissionStatus = {
          allRepos: !result.error?.includes('repository creation'),
          admin: !result.error?.includes('administration'),
          contents: !result.error?.includes('contents'),
        };
        permissionError = result.error || 'Permission verification failed';
      }
    } catch (error) {
      logger.error('Permission check failed:', error);
      permissionError = 'Failed to verify permissions';
    } finally {
      isCheckingPermissions = false;
      currentCheck = null;
      logger.info('🔚 Permission check finished');
    }
  }

  const handleSave = async (event: Event) => {
    event.preventDefault();

    // Clear any previous storage errors
    storageQuotaError = null;

    // Only check token permissions for PAT authentication
    if (authenticationMethod === 'pat') {
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      const needsCheck =
        previousToken !== githubToken ||
        !lastPermissionCheck ||
        Date.now() - lastPermissionCheck > THIRTY_DAYS;

      if (needsCheck) {
        await checkTokenPermissions();
        if (permissionError) {
          return; // Don't proceed if permissions check failed
        }
      }
    }

    // Set up a listener for chrome.runtime.lastError before calling onSave
    const originalError = chrome.runtime.lastError;

    try {
      await onSave();

      // Check for storage quota errors after save attempt
      setTimeout(() => {
        if (
          chrome.runtime.lastError &&
          chrome.runtime.lastError.message?.includes('MAX_WRITE_OPERATIONS_PER_H')
        ) {
          const errorMsg = chrome.runtime.lastError.message;
          storageQuotaError =
            'Storage quota exceeded. You can only save settings 1800 times per hour (once every 2 seconds). Please wait a moment before trying again.';
          if (onError) {
            onError(errorMsg);
          }
        }
      }, 100);
    } catch (error) {
      if (error instanceof Error && error.message.includes('MAX_WRITE_OPERATIONS_PER_H')) {
        storageQuotaError =
          'Storage quota exceeded. You can only save settings 1800 times per hour (once every 2 seconds). Please wait a moment before trying again.';
        if (onError) {
          onError(error.message);
        }
      }
    }
  };

  // GitHub App connection function
  async function connectGitHubApp() {
    isConnectingGitHubApp = true;
    githubAppConnectionError = null;

    try {
      // Redirect to bolt2github.com for OAuth flow
      window.open(GITHUB_APP_AUTH_URL, '_blank');

      // Show success message
      githubAppConnectionError = null;
    } catch (error) {
      logger.error('Error connecting GitHub App:', error);
      githubAppConnectionError =
        error instanceof Error ? error.message : 'Failed to connect GitHub App';
    } finally {
      isConnectingGitHubApp = false;
    }
  }

  // Validate GitHub App authentication
  async function validateGitHubApp() {
    if (!githubAppInstallationId) {
      githubAppValidationResult = {
        isValid: false,
        error: 'No GitHub App installation found',
      };
      return;
    }

    try {
      // This would normally call the GitHubAppService to validate
      // For now, we'll assume it's valid if we have an installation ID
      githubAppValidationResult = {
        isValid: true,
        userInfo: {
          login: githubAppUsername || 'GitHub User',
          avatar_url: githubAppAvatarUrl,
        },
      };
    } catch (error) {
      githubAppValidationResult = {
        isValid: false,
        error: error instanceof Error ? error.message : 'GitHub App validation failed',
      };
    }
  }

  // Update the status display text
  $: statusDisplayText = (() => {
    if (authenticationMethod === 'github_app') {
      if (githubAppInstallationId && githubAppUsername) {
        return `Connected via GitHub App as ${githubAppUsername}`;
      }
      return 'Connect with GitHub App to get started';
    } else {
      if (githubToken && repoOwner) {
        return `Configured for ${repoOwner}${repoName ? `/${repoName}` : ''}`;
      }
      return 'Configure your GitHub repository settings';
    }
  })();

  $: if (!isOnboarding && projectId && projectSettings[projectId]) {
    repoName = projectSettings[projectId].repoName;
    branch = projectSettings[projectId].branch;
  }
</script>

<div class="space-y-4">
  <!-- Collapsible GitHub Settings -->
  <div class="border border-slate-700 rounded-lg bg-slate-900/50 overflow-hidden">
    <!-- Header with toggle -->
    <div
      class="flex items-center justify-between p-4 bg-slate-800/50 border-b border-slate-700 cursor-pointer hover:bg-slate-800/70 transition-colors"
      on:click={toggleExpanded}
      on:keydown={(e) => e.key === 'Enter' && toggleExpanded()}
      role="button"
      tabindex="0"
    >
      <div class="flex items-center gap-3">
        <Settings class="w-5 h-5 text-slate-400" />
        <div>
          <h2 class="text-lg font-semibold text-slate-200">GitHub Settings</h2>
          <p class="text-sm text-slate-400">
            {statusDisplayText}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        {#if hasRequiredSettings && !isOnboarding}
          <div class="flex items-center gap-1">
            {#if authenticationMethod === 'github_app'}
              {#if githubAppValidationResult?.isValid === true}
                <Check class="w-4 h-4 text-green-500" />
              {:else if githubAppValidationResult?.isValid === false}
                <X class="w-4 h-4 text-red-500" />
              {:else if githubAppInstallationId}
                <Check class="w-4 h-4 text-green-500" />
              {:else}
                <div class="w-4 h-4 rounded-full bg-slate-600"></div>
              {/if}
            {:else if isTokenValid === true}
              <Check class="w-4 h-4 text-green-500" />
            {:else if isTokenValid === false}
              <X class="w-4 h-4 text-red-500" />
            {:else}
              <div class="w-4 h-4 rounded-full bg-slate-600"></div>
            {/if}
            <span class="text-xs text-slate-400">
              {authenticationMethod === 'github_app'
                ? githubAppInstallationId
                  ? 'Connected'
                  : 'Not Connected'
                : isTokenValid === true
                  ? 'Connected'
                  : isTokenValid === false
                    ? 'Error'
                    : 'Unknown'}
            </span>
          </div>
        {/if}
        {#if isExpanded}
          <ChevronUp class="w-5 h-5 text-slate-400" />
        {:else}
          <ChevronDown class="w-5 h-5 text-slate-400" />
        {/if}
      </div>
    </div>

    <!-- Collapsible Content -->
    {#if isExpanded}
      <div class="p-4 space-y-4" style="animation: slideDown 0.2s ease-out;">
        <!-- Settings Form -->
        <form on:submit|preventDefault={handleSave} class="space-y-4">
          <!-- Authentication Method Selection -->
          <div class="p-3 bg-slate-850 border border-slate-700 rounded-md">
            <h3 class="text-slate-200 font-medium mb-3">Authentication Method</h3>
            <div class="space-y-3 text-left">
              <label class="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="authMethod"
                  value="github_app"
                  checked={authenticationMethod === 'github_app'}
                  on:change={() => handleAuthMethodChange('github_app')}
                  class="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500 focus:ring-2"
                />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-slate-200 font-medium">GitHub App</span>
                    <span class="px-2 py-1 text-xs bg-green-900 text-green-200 rounded"
                      >Recommended</span
                    >
                  </div>
                  <p class="text-sm text-slate-400 mt-1">
                    Secure authentication with automatic token refresh and fine-grained permissions
                  </p>
                </div>
              </label>

              <label class="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="authMethod"
                  value="pat"
                  checked={authenticationMethod === 'pat'}
                  on:change={() => handleAuthMethodChange('pat')}
                  class="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500 focus:ring-2"
                />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-slate-200 font-medium">Personal Access Token</span>
                    <span class="px-2 py-1 text-xs bg-slate-700 text-slate-400 rounded"
                      >Advanced</span
                    >
                  </div>
                  <p class="text-sm text-slate-400 mt-1">
                    Manual token management for users who prefer direct GitHub API access
                  </p>
                </div>
              </label>
            </div>
          </div>

          <!-- General GitHub Settings Section -->
          <div class="p-3 bg-slate-850 border border-slate-700 rounded-md text-left">
            <h3 class="text-slate-200 font-medium mb-3 flex items-center">
              <span>General GitHub Settings</span>
              <span class="text-xs text-slate-400 ml-2">(Used across all projects)</span>
            </h3>

            <div class="space-y-4">
              <!-- GitHub App Authentication -->
              {#if authenticationMethod === 'github_app'}
                <div class="space-y-3">
                  {#if githubAppInstallationId}
                    <!-- Connected State -->
                    <div
                      class="flex items-center gap-3 p-3 bg-green-900/20 border border-green-700 rounded-md"
                    >
                      <Check class="w-5 h-5 text-green-500" />
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          {#if githubAppAvatarUrl}
                            <img
                              src={githubAppAvatarUrl}
                              alt="Profile"
                              class="w-6 h-6 rounded-full"
                            />
                          {/if}
                          <span class="text-green-200 font-medium">
                            Connected as {githubAppUsername || 'GitHub User'}
                          </span>
                        </div>
                        <p class="text-sm text-green-300 mt-1">
                          GitHub App authentication is active
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        class="text-xs"
                        on:click={validateGitHubApp}
                      >
                        Refresh
                      </Button>
                    </div>
                  {:else}
                    <!-- Not Connected State -->
                    <div class="space-y-3">
                      <div class="p-3 bg-blue-900/20 border border-blue-700 rounded-md">
                        <h4 class="text-blue-200 font-medium mb-2">Connect with GitHub App</h4>
                        <p class="text-sm text-blue-300 mb-3">
                          GitHub App provides secure authentication with automatic token refresh and
                          fine-grained permissions.
                        </p>
                        <Button
                          type="button"
                          class="bg-blue-600 hover:bg-blue-700 text-white"
                          on:click={connectGitHubApp}
                          disabled={isConnectingGitHubApp}
                        >
                          {#if isConnectingGitHubApp}
                            <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                            Connecting...
                          {:else}
                            Connect with GitHub
                          {/if}
                        </Button>
                      </div>

                      {#if githubAppConnectionError}
                        <div class="p-3 bg-red-900/20 border border-red-700 rounded-md">
                          <div class="flex items-start gap-2">
                            <X class="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                            <div class="text-sm text-red-200">
                              <p class="font-medium">Connection Failed</p>
                              <p class="mt-1">{githubAppConnectionError}</p>
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>

                <!-- Personal Access Token Authentication -->
              {:else}
                <div class="space-y-2">
                  <Label for="githubToken" class="text-slate-200">
                    GitHub Token
                    <span class="text-sm text-slate-400 ml-2">(Required for uploading)</span>
                  </Label>
                  <div class="relative">
                    <Input
                      type="password"
                      id="githubToken"
                      bind:value={githubToken}
                      on:input={handleTokenInput}
                      placeholder="ghp_***********************************"
                      class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500 pr-10"
                    />
                    {#if githubToken}
                      <div class="absolute right-3 top-1/2 -translate-y-1/2">
                        {#if isValidatingToken}
                          <div
                            class="animate-spin h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full"
                          />
                        {:else if isTokenValid === true}
                          <Check class="h-4 w-4 text-green-500" />
                        {:else if isTokenValid === false}
                          <X class="h-4 w-4 text-red-500" />
                        {/if}
                      </div>
                    {/if}
                  </div>
                  {#if validationError}
                    <p class="text-sm text-red-400 mt-1">{validationError}</p>
                  {:else if tokenType}
                    <div class="space-y-2">
                      <p class="text-sm text-emerald-400">
                        {tokenType === 'classic' ? '🔑 Classic' : '✨ Fine-grained'} token detected
                      </p>
                      {#if isTokenValid}
                        <div class="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            class="text-xs"
                            on:click={checkTokenPermissions}
                            disabled={isCheckingPermissions}
                          >
                            {#if isCheckingPermissions}
                              <Loader2 class="h-3 w-3 mr-1 animate-spin" />
                              Checking...
                            {:else}
                              Verify
                            {/if}
                          </Button>
                          <div class="flex items-center gap-2">
                            {#if previousToken === githubToken && lastPermissionCheck}
                              <div class="relative group">
                                <HelpCircle class="h-3 w-3 text-slate-400" />
                                <div
                                  class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block w-64 p-2 text-xs bg-slate-900 border border-slate-700 rounded-md shadow-lg"
                                >
                                  <p>
                                    Last verified: {new Date(lastPermissionCheck).toLocaleString()}
                                  </p>
                                  <p class="mt-1 text-slate-400">
                                    Permissions are automatically re-verified when the token changes
                                    or after 30 days.
                                  </p>
                                </div>
                              </div>
                            {/if}
                            <div class="flex items-center gap-1.5 text-xs">
                              <span class="flex items-center gap-0.5">
                                {#if currentCheck === 'repos'}
                                  <Loader2 class="h-3 w-3 animate-spin text-slate-400" />
                                {:else if reposPermission !== undefined}
                                  {#if reposPermission}
                                    <Check class="h-3 w-3 text-green-500" />
                                  {:else}
                                    <X class="h-3 w-3 text-red-500" />
                                  {/if}
                                {:else if previousToken === githubToken && lastPermissionCheck}
                                  <Check class="h-3 w-3 text-green-500 opacity-50" />
                                {/if}
                                Repos
                              </span>
                              <span class="flex items-center gap-0.5">
                                {#if currentCheck === 'admin'}
                                  <Loader2 class="h-3 w-3 animate-spin text-slate-400" />
                                {:else if adminPermission !== undefined}
                                  {#if adminPermission}
                                    <Check class="h-3 w-3 text-green-500" />
                                  {:else}
                                    <X class="h-3 w-3 text-red-500" />
                                  {/if}
                                {:else if previousToken === githubToken && lastPermissionCheck}
                                  <Check class="h-3 w-3 text-green-500 opacity-50" />
                                {/if}
                                Admin
                              </span>
                              <span class="flex items-center gap-0.5">
                                {#if currentCheck === 'code'}
                                  <Loader2 class="h-3 w-3 animate-spin text-slate-400" />
                                {:else if contentsPermission !== undefined}
                                  {#if contentsPermission}
                                    <Check class="h-3 w-3 text-green-500" />
                                  {:else}
                                    <X class="h-3 w-3 text-red-500" />
                                  {/if}
                                {:else if previousToken === githubToken && lastPermissionCheck}
                                  <Check class="h-3 w-3 text-green-500 opacity-50" />
                                {/if}
                                Code
                              </span>
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                    {#if permissionError}
                      <p class="text-sm text-red-400 mt-1">{permissionError}</p>
                    {/if}
                  {/if}
                </div>
              {/if}

              <div class="space-y-2">
                <Label for="repoOwner" class="text-slate-200">
                  Repository Owner
                  <span class="text-sm text-slate-400 ml-2">
                    {authenticationMethod === 'github_app'
                      ? '(Auto-detected from GitHub App)'
                      : '(Your GitHub username)'}
                  </span>
                </Label>
                <Input
                  type="text"
                  id="repoOwner"
                  bind:value={repoOwner}
                  on:input={handleOwnerInput}
                  placeholder="username or organization"
                  class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500 {authenticationMethod ===
                  'github_app'
                    ? 'opacity-75 cursor-not-allowed'
                    : ''}"
                  readonly={authenticationMethod === 'github_app'}
                  disabled={authenticationMethod === 'github_app'}
                />
                {#if authenticationMethod === 'github_app'}
                  <p class="text-sm text-slate-400">
                    ℹ️ The repository owner is automatically set from your GitHub App authentication
                  </p>
                {/if}
              </div>
            </div>
          </div>

          {#if !isOnboarding}
            <!-- Project-specific Settings Section -->
            <div class="p-3 bg-slate-850 border border-slate-700 rounded-md text-left">
              <h3 class="text-slate-200 font-medium mb-3 flex items-center">
                <span>Project Repository Settings</span>
                <span class="text-xs text-slate-400 ml-2">
                  {#if projectId}
                    (For current project only)
                  {:else}
                    (Default settings)
                  {/if}
                </span>
              </h3>

              <div class="space-y-4">
                <div class="space-y-2">
                  <Label for="repoName" class="text-slate-200">Repository Name</Label>
                  <div class="relative">
                    <div class="relative">
                      <Input
                        type="text"
                        id="repoName"
                        bind:value={repoName}
                        on:input={handleRepoInput}
                        on:focus={handleRepoFocus}
                        on:blur={handleRepoBlur}
                        on:keydown={handleRepoKeydown}
                        placeholder="Search or enter repository name"
                        class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500 pr-10"
                        autocomplete="off"
                      />
                      <div class="absolute right-3 top-1/2 -translate-y-1/2">
                        {#if isLoadingRepos}
                          <Loader2 class="h-4 w-4 text-slate-400 animate-spin" />
                        {:else}
                          <Search class="h-4 w-4 text-slate-400" />
                        {/if}
                      </div>
                    </div>
                    {#if showRepoDropdown && (filteredRepos.length > 0 || !repoExists)}
                      <div
                        class="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg"
                      >
                        <ul class="py-1 max-h-60 overflow-auto">
                          {#each filteredRepos as repo, i}
                            <li>
                              <button
                                class="w-full px-3 py-2 text-left hover:bg-slate-700 text-slate-200 {selectedIndex ===
                                i
                                  ? 'bg-slate-700'
                                  : ''}"
                                on:click={() => selectRepo(repo)}
                              >
                                <div class="flex items-center justify-between">
                                  <span class="font-medium">{repo.name}</span>
                                  {#if repo.private}
                                    <span class="text-xs text-slate-400">Private</span>
                                  {/if}
                                </div>
                                {#if repo.description}
                                  <p class="text-sm text-slate-400 truncate">{repo.description}</p>
                                {/if}
                              </button>
                            </li>
                          {/each}
                          {#if !repoExists}
                            <li class="px-3 py-2 text-sm text-slate-400">
                              {#if repoName.length > 0}
                                <p class="text-orange-400">
                                  💡If the repository "{repoName}" doesn't exist, it will be created
                                  automatically.
                                </p>
                              {:else}
                                <p>
                                  Enter a repository name (new) or select from your repositories
                                  carefully.
                                </p>
                              {/if}
                            </li>
                          {/if}
                        </ul>
                      </div>
                    {/if}
                  </div>
                  {#if repoExists}
                    <p class="text-sm text-blue-400">
                      ℹ️ Using existing repository. Make sure it is correct.
                    </p>
                  {:else if repoName}
                    <p class="text-sm text-emerald-400">
                      ✨ A new repository will be created if it doesn't exist yet.
                    </p>
                  {/if}
                </div>

                <div class="space-y-2">
                  <Label for="branch" class="text-slate-200">
                    Branch
                    <span class="text-sm text-slate-400 ml-2">(Usually "main")</span>
                  </Label>
                  <Input
                    type="text"
                    id="branch"
                    bind:value={branch}
                    on:input={onInput}
                    placeholder="main"
                    class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
                  />
                </div>
                <p class="text-sm text-slate-400">
                  💡 If the branch doesn't exist, it will be created automatically from the default
                  branch.
                </p>
              </div>
            </div>
          {/if}

          <!-- Storage Quota Error Display -->
          {#if storageQuotaError}
            <div class="p-3 bg-red-900/20 border border-red-700 rounded-md">
              <div class="flex items-start gap-2">
                <X class="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div class="text-sm text-red-200">
                  <p class="font-medium">Storage Limit Exceeded</p>
                  <p class="mt-1">{storageQuotaError}</p>
                </div>
              </div>
            </div>
          {/if}

          <Button
            type="submit"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white"
            disabled={buttonDisabled ||
              isValidatingToken ||
              isCheckingPermissions ||
              isConnectingGitHubApp ||
              (authenticationMethod === 'pat' && (!githubToken || isTokenValid === false)) ||
              (authenticationMethod === 'github_app' && !githubAppInstallationId) ||
              !repoOwner ||
              (!isOnboarding && (!repoName || !branch))}
          >
            {#if isValidatingToken}
              Validating...
            {:else if isCheckingPermissions}
              Checking permissions...
            {:else if isConnectingGitHubApp}
              Connecting to GitHub...
            {:else if buttonDisabled && !status.includes('MAX_WRITE_OPERATIONS')}
              {status}
            {:else}
              {isOnboarding ? 'Get Started' : 'Save Settings'}
            {/if}
          </Button>
        </form>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
