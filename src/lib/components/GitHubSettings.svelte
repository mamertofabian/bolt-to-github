<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Check, ExternalLink, Loader2, Search, Shield } from 'lucide-svelte';
  import { GITHUB_APP_AUTH_URL } from '$lib/constants';
  import {
    checkRepositoryExists,
    filterRepositories,
    handleKeyboardNavigation,
    validateRepositoryName,
    type Repository,
  } from '$lib/utils/repo-settings';
  import { GitHubApiClient } from '../../services/GitHubApiClient';
  import { GitHubAppAuthenticationStrategy } from '../../services/GitHubAppAuthenticationStrategy';

  export let repoOwner: string;
  export let repoName: string;
  export let branch = 'main';
  export let status: string;
  export let onSave: () => void;
  export let onInput: () => void;
  export let onError: ((error: string) => void) | null = null;
  export let projectId: string | null = null;
  export let buttonDisabled = false;
  export let githubAppInstallationId: number | null = null;
  export let githubAppUsername: string | null = null;
  export let githubAppAvatarUrl: string | null = null;
  export let migrationRequired = false;

  let storedMigrationRequired = false;
  let loadedProjectId: string | null | undefined;
  let repoNameDraft = repoName;
  let branchDraft = branch;
  let repositories: Repository[] = [];
  let repoSearchQuery = '';
  let showRepoDropdown = false;
  let selectedRepoIndex = -1;
  let isLoadingRepositories = false;
  let repositoryLoadError: string | null = null;

  $: if (projectId !== loadedProjectId) {
    loadedProjectId = projectId;
    repoNameDraft = repoName;
    branchDraft = branch;
  }

  $: showMigrationRequired = migrationRequired || storedMigrationRequired;
  $: repoNameValidation = validateRepositoryName(repoNameDraft);
  $: filteredRepositories = filterRepositories(repositories, repoSearchQuery);
  $: selectedRepositoryExists = checkRepositoryExists(repositories, repoNameDraft);
  $: canSave = Boolean(
    githubAppInstallationId &&
    repoOwner &&
    repoNameValidation.isValid &&
    branchDraft.trim() &&
    !buttonDisabled
  );

  function connectGitHubApp() {
    window.open(GITHUB_APP_AUTH_URL, '_blank');
  }

  async function loadRepositories() {
    if (!githubAppInstallationId) return;

    isLoadingRepositories = true;
    repositoryLoadError = null;
    try {
      const strategy = new GitHubAppAuthenticationStrategy();
      const token = await strategy.getToken();
      const client = new GitHubApiClient(token);
      repositories = await client.request<Repository[]>(
        'GET',
        '/user/repos?sort=updated&per_page=100'
      );
    } catch {
      repositories = [];
      repositoryLoadError =
        'Unable to load repositories from GitHub. You can still enter a repository name manually.';
    } finally {
      isLoadingRepositories = false;
    }
  }

  function handleRepoInput() {
    repoSearchQuery = repoNameDraft;
    selectedRepoIndex = -1;
    showRepoDropdown = true;
    onInput();
  }

  function handleRepoFocus() {
    // Show every App-accessible repository on focus. Filtering starts once the
    // user types; the currently saved repository name should not hide the list.
    repoSearchQuery = '';
    showRepoDropdown = true;
  }

  function handleRepoBlur() {
    setTimeout(() => {
      showRepoDropdown = false;
    }, 150);
  }

  function selectRepository(repository: Repository) {
    repoNameDraft = repository.name;
    repoSearchQuery = repository.name;
    selectedRepoIndex = -1;
    showRepoDropdown = false;
    onInput();
  }

  function handleRepoKeydown(event: KeyboardEvent) {
    if (!showRepoDropdown) return;

    const navigation = handleKeyboardNavigation(event.key, selectedRepoIndex, filteredRepositories);
    if (navigation.shouldPreventDefault) event.preventDefault();
    selectedRepoIndex = navigation.newIndex;
    if (navigation.selectedRepo) selectRepository(navigation.selectedRepo);
    if (navigation.shouldCloseDropdown) showRepoDropdown = false;
  }

  function handleBranchInput() {
    onInput();
  }

  function handleSubmit() {
    if (!canSave) return;

    try {
      repoName = repoNameDraft;
      branch = branchDraft;
      onSave();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Unable to save GitHub settings');
    }
  }

  // This extension component is client-only. Start these independent reads when
  // the component is constructed, matching RepoSettings' repository discovery.
  // A storage failure must never prevent the repository list from loading.
  void loadRepositories();
  void chrome.storage.local
    .get('githubAppMigrationRequired')
    .then((storage) => {
      storedMigrationRequired = storage.githubAppMigrationRequired === true;
    })
    .catch(() => {
      storedMigrationRequired = false;
    });
</script>

<div class="space-y-4 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
  <div>
    <h2 class="text-lg font-semibold text-slate-200">GitHub Settings</h2>
    <p class="text-sm text-slate-400">GitHub App connection and repository settings</p>
  </div>

  {#if showMigrationRequired}
    <div role="alert" class="rounded-md border border-amber-700 bg-amber-900/20 p-3">
      <p class="font-medium text-amber-200">GitHub App is now required</p>
      <p class="mt-1 text-sm text-amber-300">
        Connect the GitHub App to continue. Existing repository settings remain available below.
      </p>
    </div>
  {/if}

  {#if githubAppInstallationId}
    <div class="flex items-center gap-3 rounded-md border border-green-700 bg-green-900/20 p-3">
      <Check class="h-5 w-5 text-green-500" />
      {#if githubAppAvatarUrl}
        <img src={githubAppAvatarUrl} alt="GitHub profile" class="h-6 w-6 rounded-full" />
      {/if}
      <div>
        <p class="font-medium text-green-200">
          Connected as {githubAppUsername || repoOwner || 'GitHub User'}
        </p>
        <p class="text-xs text-green-300">Repository access is managed by the GitHub App.</p>
      </div>
    </div>
  {:else}
    <div class="space-y-3 rounded-md border border-blue-700 bg-blue-900/20 p-3">
      <div class="flex items-start gap-2">
        <Shield class="mt-0.5 h-4 w-4 text-blue-300" />
        <p class="text-sm text-blue-200">
          Install the GitHub App and choose the repositories this extension may access.
        </p>
      </div>
      <Button
        type="button"
        class="bg-blue-600 text-white hover:bg-blue-700"
        on:click={connectGitHubApp}
      >
        Connect GitHub App
        <ExternalLink class="ml-2 h-4 w-4" />
      </Button>
    </div>
  {/if}

  <form class="space-y-4" on:submit|preventDefault={handleSubmit}>
    <div class="space-y-2">
      <Label for="repoOwner" class="text-slate-200">Repository Owner</Label>
      <Input
        id="repoOwner"
        type="text"
        value={repoOwner}
        readonly
        class="cursor-not-allowed border-slate-700 bg-slate-800 text-slate-300 opacity-75"
      />
      <p class="text-xs text-slate-400">Detected from the connected GitHub account.</p>
    </div>

    <div class="space-y-2">
      <Label for="repoName" class="text-slate-200">Repository Name</Label>
      <div class="relative">
        <Input
          id="repoName"
          type="text"
          bind:value={repoNameDraft}
          on:input={handleRepoInput}
          on:focus={handleRepoFocus}
          on:blur={handleRepoBlur}
          on:keydown={handleRepoKeydown}
          placeholder="Search or enter repository name"
          autocomplete="off"
          class="border-slate-700 bg-slate-800 pr-10 text-slate-200 placeholder:text-slate-500"
        />
        <div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {#if isLoadingRepositories}
            <Loader2
              class="h-4 w-4 animate-spin text-slate-400"
              aria-label="Loading repositories"
            />
          {:else}
            <Search class="h-4 w-4 text-slate-400" aria-hidden="true" />
          {/if}
        </div>

        {#if showRepoDropdown && filteredRepositories.length > 0}
          <ul
            class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-700 bg-slate-800 py-1 shadow-lg"
          >
            {#each filteredRepositories as repository, index}
              <li>
                <button
                  type="button"
                  class={`w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-700 ${selectedRepoIndex === index ? 'bg-slate-700' : ''}`}
                  on:mousedown|preventDefault
                  on:click={() => selectRepository(repository)}
                >
                  <span class="flex items-center justify-between gap-2">
                    <span class="font-medium">{repository.name}</span>
                    {#if repository.private}
                      <span class="text-xs text-slate-400">Private</span>
                    {/if}
                  </span>
                  {#if repository.description}
                    <span class="block truncate text-sm text-slate-400">
                      {repository.description}
                    </span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      {#if !repoNameValidation.isValid}
        <p role="alert" class="text-sm text-red-400">{repoNameValidation.error}</p>
      {:else if selectedRepositoryExists}
        <p class="text-sm text-blue-400">Using an existing GitHub repository.</p>
      {/if}
      {#if repositoryLoadError}
        <div role="alert" class="rounded-md border border-amber-700 bg-amber-900/20 p-2">
          <p class="text-sm text-amber-200">{repositoryLoadError}</p>
          <Button type="button" variant="outline" class="mt-2" on:click={loadRepositories}>
            Retry repository list
          </Button>
        </div>
      {/if}
    </div>

    <div class="space-y-2">
      <Label for="branch" class="text-slate-200">Branch</Label>
      <Input
        id="branch"
        type="text"
        bind:value={branchDraft}
        on:input={handleBranchInput}
        placeholder="main"
        class="border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500"
      />
    </div>

    {#if status}
      <div class="rounded-md border border-blue-700 bg-blue-900/20 p-3 text-sm text-blue-200">
        {status}
      </div>
    {/if}

    <Button
      type="submit"
      class="w-full bg-blue-600 text-white hover:bg-blue-700"
      disabled={!canSave}
    >
      Save Settings
    </Button>
  </form>
</div>
