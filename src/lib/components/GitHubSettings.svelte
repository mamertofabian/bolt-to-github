<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Check, X, Search, Loader2, HelpCircle } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { CREATE_FINE_GRAINED_TOKEN_URL, GitHubService } from '../../services/GitHubService';
  import NewUserGuide from './github/NewUserGuide.svelte';

  export let isOnboarding: boolean = false;
  export let githubToken: string;
  export let repoOwner: string;
  export let repoName: string;
  export let branch: string = 'main';
  export let status: string;
  export let onSave: () => void;
  export let onInput: () => void;
  export let projectId: string | null = null;
  export let projectSettings: Record<string, { repoName: string; branch: string }> = {};
  export let buttonDisabled: boolean = false;

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
  let permissionError: string | null = null;
  let previousToken: string | null = null;

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

  async function loadRepositories() {
    if (!githubToken || !repoOwner || !isTokenValid) return;

    try {
      isLoadingRepos = true;
      const githubService = new GitHubService(githubToken);
      repositories = await githubService.listRepos();
    } catch (error) {
      console.error('Error loading repositories:', error);
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

  onMount(async () => {
    // Load last permission check timestamp from storage
    const storage = await chrome.storage.local.get('lastPermissionCheck');
    lastPermissionCheck = storage.lastPermissionCheck || null;
    previousToken = githubToken;

    // If we have initial valid settings, validate and load repos
    if (githubToken && repoOwner) {
      await validateSettings();
    }
  });

  async function validateSettings() {
    if (!githubToken) {
      isTokenValid = null;
      validationError = null;
      return;
    }

    try {
      isValidatingToken = true;
      validationError = null;
      const githubService = new GitHubService(githubToken);
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
      console.error('Error validating settings:', error);
      isTokenValid = false;
      validationError = 'Validation failed';
    } finally {
      isValidatingToken = false;
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
    if (!githubToken || isCheckingPermissions) return;

    isCheckingPermissions = true;
    permissionError = null;
    permissionStatus = {
      allRepos: undefined,
      admin: undefined,
      contents: undefined,
    };

    try {
      const githubService = new GitHubService(githubToken);

      const result = await githubService.verifyTokenPermissions(
        repoOwner,
        ({ permission, isValid }) => {
          currentCheck = permission;
          // Update the status as each permission is checked
          switch (permission) {
            case 'repos':
              permissionStatus.allRepos = isValid;
              break;
            case 'admin':
              permissionStatus.admin = isValid;
              break;
            case 'code':
              permissionStatus.contents = isValid;
              break;
          }
          // Force Svelte to update the UI
          permissionStatus = { ...permissionStatus };
        }
      );

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
      console.error('Permission check failed:', error);
      permissionError = 'Failed to verify permissions';
    } finally {
      isCheckingPermissions = false;
      currentCheck = null;
    }
  }

  const handleSave = async (event: Event) => {
    event.preventDefault();

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

    onSave();
  };

  $: if (!isOnboarding && projectId && projectSettings[projectId]) {
    repoName = projectSettings[projectId].repoName;
    branch = projectSettings[projectId].branch;
  }
</script>

<div class="space-y-6">
  <!-- Quick Links Section -->
  <NewUserGuide />

  <!-- Settings Form -->
  <form on:submit|preventDefault={handleSave} class="space-y-4">
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
                  Verify Permissions
                {/if}
              </Button>
              <div class="flex items-center gap-2">
                {#if previousToken === githubToken && lastPermissionCheck}
                  <div class="relative group">
                    <HelpCircle class="h-3 w-3 text-slate-400" />
                    <div
                      class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block w-64 p-2 text-xs bg-slate-900 border border-slate-700 rounded-md shadow-lg"
                    >
                      <p>Last verified: {new Date(lastPermissionCheck).toLocaleString()}</p>
                      <p class="mt-1 text-slate-400">
                        Permissions are automatically re-verified when the token changes or after 30
                        days.
                      </p>
                    </div>
                  </div>
                {/if}
                <div class="flex items-center gap-1.5 text-xs">
                  <span class="flex items-center gap-0.5">
                    {#if currentCheck === 'repos'}
                      <Loader2 class="h-3 w-3 animate-spin text-slate-400" />
                    {:else if permissionStatus.allRepos !== undefined}
                      {#if permissionStatus.allRepos}
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
                    {:else if permissionStatus.admin !== undefined}
                      {#if permissionStatus.admin}
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
                    {:else if permissionStatus.contents !== undefined}
                      {#if permissionStatus.contents}
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

    <div class="space-y-2">
      <Label for="repoOwner" class="text-slate-200">
        Repository Owner
        <span class="text-sm text-slate-400 ml-2">(Your GitHub username)</span>
      </Label>
      <Input
        type="text"
        id="repoOwner"
        bind:value={repoOwner}
        on:input={handleOwnerInput}
        placeholder="username or organization"
        class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
      />
    </div>

    {#if !isOnboarding}
      <div class="space-y-2">
        <Label for="repoName" class="text-slate-200">
          Repository Name
          <span class="text-sm text-slate-400 ml-2">
            {#if projectId}
              (Project-specific repository)
            {:else}
              (Default repository)
            {/if}
          </span>
        </Label>
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
        💡 If the branch doesn't exist, it will be created automatically from the default branch.
      </p>
    {/if}

    <Button
      type="submit"
      class="w-full bg-blue-600 hover:bg-blue-700 text-white"
      disabled={buttonDisabled ||
        isValidatingToken ||
        !githubToken ||
        !repoOwner ||
        (!isOnboarding && (!repoName || !branch)) ||
        isTokenValid === false}
    >
      {#if isValidatingToken}
        Validating...
      {:else if buttonDisabled}
        {status}
      {:else}
        {isOnboarding ? 'Get Started' : 'Save Settings'}
      {/if}
    </Button>
  </form>
</div>
