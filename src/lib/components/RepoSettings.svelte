<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Search, Loader2 } from 'lucide-svelte';
  import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
  import { createEventDispatcher } from 'svelte';
  import { githubSettingsActions } from '$lib/stores';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import { createLogger } from '$lib/utils/logger';
  import { ChromeMessagingService } from '$lib/services/chromeMessaging';
  import { ChromeStorageService } from '$lib/services/chromeStorage';
  import { debounce } from '$lib/utils/debounce';
  import {
    filterRepositories,
    checkRepositoryExists,
    getDefaultProjectTitle,
    handleKeyboardNavigation,
    shouldShowDropdown,
    canSaveForm,
    getAuthenticationMethod,
    createGitHubServiceConfig,
    filterBranches,
    checkBranchExists,
    shouldShowCreateBranch,
    shouldShowBranchDropdown,
    getBranchStatusMessage,
    handleBranchKeyboardNavigation,
    type Repository,
  } from '$lib/utils/repo-settings';

  const logger = createLogger('RepoSettings');

  const dispatch = createEventDispatcher();

  const DROPDOWN_CLOSE_DELAY_MS = 200;

  export let show = false;
  export let repoOwner: string = '';
  export let githubToken: string = '';
  export let projectId: string;
  export let repoName: string;
  export let branch: string = 'main';
  export let projectTitle: string = '';

  let isLoadingRepos = false;
  let repositories: Repository[] = [];
  let showRepoDropdown = false;
  let repoExists = false;
  let selectedIndex = -1;
  let isSaving = false;
  let showErrorModal = false;
  let errorMessage = '';

  // Branch-related state
  let isLoadingBranches = false;
  let branches: string[] = [];
  let showBranchDropdown = false;
  let branchExists = false;
  let branchSelectedIndex = -1;
  let lastLoadedRepo = ''; // Track last loaded repo to prevent redundant API calls

  $: filteredRepos = filterRepositories(repositories, repoName);

  $: repoExists = checkRepositoryExists(repositories, repoName);

  // Branch-related reactive statements
  $: filteredBranches = filterBranches(branches, branch);

  $: branchExists = checkBranchExists(branches, branch);

  $: showCreateBranchOption = shouldShowCreateBranch(branch, branchExists);

  $: branchStatusMessage = getBranchStatusMessage(branch, branchExists);

  // Debounced branch loading to prevent excessive API calls while typing
  const debouncedLoadBranches = debounce((owner: string, repo: string) => {
    // Only load if this is a different repo than the last one loaded
    const repoKey = `${owner}/${repo}`;
    if (repoKey !== lastLoadedRepo) {
      loadBranches(owner, repo);
      lastLoadedRepo = repoKey;
    }
  }, 300);

  // Trigger debounced load when repository changes
  $: if (repoName && repoExists && repoOwner) {
    debouncedLoadBranches(repoOwner, repoName);
  }

  async function loadRepositories() {
    try {
      isLoadingRepos = true;

      // Get authentication method to determine how to create the service
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = getAuthenticationMethod(authSettings);

      let githubService: UnifiedGitHubService;

      if (authMethod === 'github_app') {
        // Use GitHub App authentication
        githubService = new UnifiedGitHubService({ type: 'github_app' });
      } else {
        // Use PAT authentication (backward compatible)
        if (!githubToken || !repoOwner) return;
        const config = createGitHubServiceConfig(authMethod, githubToken);
        githubService = new UnifiedGitHubService(config);
      }

      repositories = await githubService.listRepos();
    } catch (error) {
      logger.error('Error loading repositories:', error);
      repositories = [];
    } finally {
      isLoadingRepos = false;
    }
  }

  function selectRepo(repo: (typeof repositories)[0]) {
    repoName = repo.name;
    showRepoDropdown = false;

    // Load branches immediately when selecting from dropdown (bypass debounce)
    if (repoName && repoOwner) {
      const repoKey = `${repoOwner}/${repoName}`;
      if (repoKey !== lastLoadedRepo) {
        loadBranches(repoOwner, repoName);
        lastLoadedRepo = repoKey;
      }
    }
  }

  function handleRepoKeydown(event: KeyboardEvent) {
    if (!showRepoDropdown) return;

    const result = handleKeyboardNavigation(event.key, selectedIndex, filteredRepos);

    event.preventDefault();
    selectedIndex = result.newIndex;

    if (result.selectedRepo) {
      selectRepo(result.selectedRepo);
    }

    if (result.shouldCloseDropdown) {
      showRepoDropdown = false;
    }
  }

  function handleRepoFocus() {
    showRepoDropdown = true;
  }

  function handleRepoBlur() {
    // Delay hiding dropdown to allow click events to register
    setTimeout(() => {
      showRepoDropdown = false;
    }, DROPDOWN_CLOSE_DELAY_MS);
  }

  // Branch dropdown functions
  async function loadBranches(owner: string, repo: string) {
    try {
      isLoadingBranches = true;

      // Get authentication method
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = getAuthenticationMethod(authSettings);

      let githubService: UnifiedGitHubService;

      if (authMethod === 'github_app') {
        githubService = new UnifiedGitHubService({ type: 'github_app' });
      } else {
        if (!githubToken || !owner) return;
        const config = createGitHubServiceConfig(authMethod, githubToken);
        githubService = new UnifiedGitHubService(config);
      }

      const branchData = await githubService.listBranches(owner, repo);
      branches = branchData.map((b) => b.name);
    } catch (error) {
      logger.error('Error loading branches:', error);
      branches = [];
    } finally {
      isLoadingBranches = false;
    }
  }

  function selectBranch(branchName: string) {
    branch = branchName;
    showBranchDropdown = false;
  }

  function handleBranchKeydown(event: KeyboardEvent) {
    if (!showBranchDropdown) return;

    const result = handleBranchKeyboardNavigation(
      event.key,
      branchSelectedIndex,
      filteredBranches,
      showCreateBranchOption
    );

    event.preventDefault();
    branchSelectedIndex = result.newIndex;

    if (result.selectedBranch) {
      selectBranch(result.selectedBranch);
    }

    if (result.shouldCloseDropdown) {
      showBranchDropdown = false;
    }
  }

  function handleBranchFocus() {
    showBranchDropdown = true;
  }

  function handleBranchBlur() {
    // Delay hiding dropdown to allow click events to register
    setTimeout(() => {
      showBranchDropdown = false;
    }, DROPDOWN_CLOSE_DELAY_MS);
  }

  async function saveSettings() {
    if (!canSaveForm(repoName, branch, isSaving)) return;

    try {
      isSaving = true;
      logger.info('Saving repository settings for project:', projectId);

      // Save project settings using ChromeStorageService (thread-safe)
      await ChromeStorageService.saveProjectSettings(projectId, repoName, branch, projectTitle);

      // Update the stores to trigger immediate reactivity
      githubSettingsActions.setProjectSettings(projectId, repoName, branch, projectTitle);

      logger.info('Settings saved successfully');

      // Trigger outward sync to push changes to backend immediately
      try {
        logger.info('Triggering manual sync to push changes to backend');
        const syncResponse = await ChromeMessagingService.sendMessageToBackground({
          type: 'SYNC_BOLT_PROJECTS',
        });

        // Type assertion for the response
        const typedResponse = syncResponse as { success?: boolean; result?: unknown } | null;
        if (typedResponse?.success) {
          logger.info('Manual sync completed successfully', typedResponse.result);
        } else {
          logger.warn('Manual sync completed with issues', typedResponse);
        }
      } catch (syncError) {
        // Don't fail the save operation if sync fails
        logger.error('Failed to trigger manual sync, changes saved locally', syncError);
      }

      // Notify parent that settings were saved
      dispatch('close');
    } catch (error) {
      logger.error('Failed to save settings:', error);
      errorMessage = 'Failed to save settings. Please try again.';
      showErrorModal = true;
    } finally {
      isSaving = false;
    }
  }

  // Ensure projectTitle is set correctly
  $: projectTitle = getDefaultProjectTitle(projectTitle, repoName);

  // Load repositories when component is mounted
  loadRepositories();
</script>

{#if show}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-slate-900 border border-slate-800 rounded-lg p-5 max-w-md w-full mx-4">
      <h2 class="text-lg font-medium mb-4">Repository Settings</h2>

      <div class="space-y-4">
        <div class="space-y-2">
          <Label for="projectTitle" class="text-slate-200">Project Title</Label>
          <Input
            type="text"
            id="projectTitle"
            bind:value={projectTitle}
            placeholder="Enter a descriptive title for this project"
            class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
          />
          <p class="text-sm text-slate-400">
            💡 A custom title to help you easily identify this project
          </p>
        </div>

        <div class="space-y-2">
          <Label for="repoName" class="text-slate-200">Repository Name</Label>
          <div class="relative">
            <div class="relative">
              <Input
                type="text"
                id="repoName"
                bind:value={repoName}
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
            {#if shouldShowDropdown(showRepoDropdown, filteredRepos, repoExists)}
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
                          Enter a repository name (new) or select from your repositories carefully.
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
          {:else if repoName && repoName.trim()}
            <p class="text-sm text-emerald-400">
              ✨ A new repository will be created if it doesn't exist yet.
            </p>
          {:else}
            <p class="text-sm text-orange-400">
              Enter a repository name (new) or select from your repositories carefully.
            </p>
          {/if}
        </div>

        <div class="space-y-2">
          <Label for="branch" class="text-slate-200">
            Branch
            <span class="text-sm text-slate-400 ml-2">(Usually "main")</span>
          </Label>
          <div class="relative">
            <div class="relative">
              <Input
                type="text"
                id="branch"
                bind:value={branch}
                on:focus={handleBranchFocus}
                on:blur={handleBranchBlur}
                on:keydown={handleBranchKeydown}
                placeholder="main"
                class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500 pr-10"
                autocomplete="off"
              />
              <div class="absolute right-3 top-1/2 -translate-y-1/2">
                {#if isLoadingBranches}
                  <Loader2 class="h-4 w-4 animate-spin text-slate-400" />
                {:else}
                  <Search class="h-4 w-4 text-slate-400" />
                {/if}
              </div>
            </div>

            {#if shouldShowBranchDropdown(showBranchDropdown, filteredBranches, branchExists)}
              <div
                class="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
              >
                <ul class="py-1">
                  {#if showCreateBranchOption}
                    <li>
                      <button
                        type="button"
                        class="w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors {branchSelectedIndex ===
                        0
                          ? 'bg-slate-700'
                          : ''}"
                        on:click={() => {
                          showBranchDropdown = false;
                        }}
                      >
                        <p class="text-sm font-medium text-emerald-400">
                          + Create new branch "{branch.trim()}"
                        </p>
                      </button>
                    </li>
                  {/if}
                  {#each filteredBranches as branchName, index}
                    {@const adjustedIndex = showCreateBranchOption ? index + 1 : index}
                    <li>
                      <button
                        type="button"
                        class="w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors {branchSelectedIndex ===
                        adjustedIndex
                          ? 'bg-slate-700'
                          : ''}"
                        on:click={() => selectBranch(branchName)}
                      >
                        <p class="text-sm font-medium text-slate-200">{branchName}</p>
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
          {#if branchStatusMessage.type === 'info'}
            <p class="text-sm text-blue-400">
              {branchStatusMessage.message}
            </p>
          {:else if branchStatusMessage.type === 'success'}
            <p class="text-sm text-emerald-400">
              {branchStatusMessage.message}
            </p>
          {:else}
            <p class="text-sm text-orange-400">
              {branchStatusMessage.message}
            </p>
          {/if}
        </div>

        <div class="flex justify-end space-x-2 mt-6">
          <Button
            variant="outline"
            class="text-xs py-1 h-8 border-slate-700 bg-slate-800 hover:bg-slate-700"
            on:click={() => dispatch('close')}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            class="text-xs py-1 h-8 bg-blue-600 hover:bg-blue-700"
            on:click={saveSettings}
            disabled={!canSaveForm(repoName, branch, isSaving)}
          >
            {#if isSaving}
              <Loader2 class="h-3 w-3 mr-1 animate-spin" />
            {/if}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Error Modal -->
<Modal show={showErrorModal} title="Error">
  <p class="text-slate-300 mb-4">{errorMessage}</p>
  <div class="flex justify-end">
    <Button
      variant="default"
      class="text-xs py-1 h-8 bg-blue-600 hover:bg-blue-700"
      on:click={() => (showErrorModal = false)}
    >
      OK
    </Button>
  </div>
</Modal>
