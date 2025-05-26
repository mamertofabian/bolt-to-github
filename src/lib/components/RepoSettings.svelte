<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Search, Loader2 } from 'lucide-svelte';
  import { GitHubService } from '../../services/GitHubService';
  import { createEventDispatcher } from 'svelte';
  import { githubSettingsActions } from '$lib/stores';
  import { projectSettingsActions } from '$lib/stores/projectSettings';
  import Modal from '$lib/components/ui/modal/Modal.svelte';

  const dispatch = createEventDispatcher();

  export let show = false;
  export let repoOwner: string = '';
  export let githubToken: string = '';
  export let projectId: string;
  export let repoName: string;
  export let branch: string = 'main';
  export let projectTitle: string = '';

  let isLoadingRepos = false;
  let repositories: Array<{
    name: string;
    description: string | null;
    html_url: string;
    private: boolean;
    created_at: string;
    updated_at: string;
    language: string | null;
  }> = [];
  let showRepoDropdown = false;
  let repoSearchQuery = '';
  let repoInputFocused = false;
  let repoExists = false;
  let selectedIndex = -1;
  let isSaving = false;
  let showErrorModal = false;
  let errorMessage = '';

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

  async function loadRepositories() {
    if (!githubToken || !repoOwner) return;

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
  }

  function selectRepo(repo: (typeof repositories)[0]) {
    repoName = repo.name;
    showRepoDropdown = false;
    repoSearchQuery = repo.name;
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

  async function saveSettings() {
    if (!repoName || !branch) return;

    try {
      isSaving = true;
      console.log('Saving repository settings for project:', projectId);

      // Get current settings
      const settings = await chrome.storage.sync.get([
        'projectSettings',
        'githubToken',
        'repoOwner',
      ]);
      let updatedProjectSettings = { ...(settings.projectSettings || {}) };

      // Update project settings
      updatedProjectSettings[projectId] = {
        repoName,
        branch,
        projectTitle,
      };

      // Save updated settings
      await chrome.storage.sync.set({
        projectSettings: updatedProjectSettings,
        githubToken: settings.githubToken,
        repoOwner: settings.repoOwner,
      });

      // Update the stores to trigger immediate reactivity
      githubSettingsActions.setProjectSettings(projectId, repoName, branch, projectTitle);

      // Store a timestamp in local storage to trigger refresh in other components
      await chrome.storage.local.set({
        lastSettingsUpdate: {
          timestamp: Date.now(),
          projectId,
          repoName,
          branch,
          projectTitle,
        },
      });

      console.log('Settings saved successfully with timestamp');

      // Notify parent that settings were saved
      dispatch('close');
    } catch (error) {
      console.error('Failed to save settings:', error);
      errorMessage = 'Failed to save settings. Please try again.';
      showErrorModal = true;
    } finally {
      isSaving = false;
    }
  }

  // Ensure projectTitle is set correctly
  $: if (!projectTitle && repoName) {
    projectTitle = repoName;
  }

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
            placeholder="main"
            class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
          />
          <p class="text-sm text-slate-400">
            💡 If the branch doesn't exist, it will be created automatically from the default
            branch.
          </p>
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
            disabled={!repoName || !branch || isSaving}
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
