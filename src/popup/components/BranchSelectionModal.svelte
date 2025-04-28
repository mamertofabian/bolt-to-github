<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import { onMount } from 'svelte';
  import { GitHubService } from '../../services/GitHubService';

  export let show = false;
  export let owner = '';
  export let repo = '';
  export let token = '';
  export let onBranchSelected: (branch: string) => void;
  export let onCancel: () => void;

  let branches: Array<{ name: string; isDefault: boolean }> = [];
  let selectedBranch = '';
  let isLoading = true;
  let error: string | null = null;

  onMount(async () => {
    if (show && owner && repo && token) {
      await loadBranches();
    }
  });

  $: if (show && owner && repo && token && branches.length === 0) {
    loadBranches();
  }

  async function loadBranches() {
    isLoading = true;
    error = null;

    try {
      const githubService = new GitHubService(token);
      branches = await githubService.listBranches(owner, repo);

      // Set the default branch as selected
      const defaultBranch = branches.find(b => b.isDefault);
      if (defaultBranch) {
        selectedBranch = defaultBranch.name;
      } else if (branches.length > 0) {
        selectedBranch = branches[0].name;
      }
    } catch (err) {
      console.error('Failed to load branches:', err);
      error = err instanceof Error ? err.message : 'Failed to load branches';
    } finally {
      isLoading = false;
    }
  }

  function handleSelect() {
    if (selectedBranch) {
      onBranchSelected(selectedBranch);
    }
  }
</script>

<Modal {show} title="Select Branch to Import">
  <div class="space-y-3 pb-1">
    {#if isLoading}
      <div class="flex justify-center py-4">
        <div class="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    {:else if error}
      <div class="text-red-400 text-sm p-2 border border-red-900/50 bg-red-900/10 rounded">
        Error: {error}
      </div>
    {:else if branches.length === 0}
      <div class="text-amber-400 text-sm p-2 border border-amber-900/50 bg-amber-900/10 rounded">
        No branches found in this repository.
      </div>
    {:else}
      <p class="text-slate-300 text-xs mb-2">
        Select the branch you want to import from <span class="font-semibold">{owner}/{repo}</span>:
      </p>

      <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
        {#each branches as branch}
          <div
            class="flex items-center p-2 rounded border {selectedBranch === branch.name ? 'border-blue-500 bg-blue-900/20' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}"
            on:click={() => (selectedBranch = branch.name)}
            on:keydown={(e) => e.key === 'Enter' && (selectedBranch = branch.name)}
            role="button"
            tabindex="0"
          >
            <input
              type="radio"
              name="branch"
              value={branch.name}
              checked={selectedBranch === branch.name}
              class="mr-2"
            />
            <div class="flex-1">
              <div class="text-sm font-medium">{branch.name}</div>
              {#if branch.isDefault}
                <div class="text-xs text-green-400">Default branch</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <div class="flex justify-end space-x-2 mt-4">
        <Button
          variant="outline"
          class="text-xs py-1 h-7 border-slate-700 bg-slate-800 hover:bg-slate-700"
          on:click={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="default"
          class="text-xs py-1 h-7 bg-blue-600 hover:bg-blue-700"
          on:click={handleSelect}
          disabled={!selectedBranch}
        >
          Import Branch
        </Button>
      </div>
    {/if}
  </div>
</Modal>

<style>
  /* Custom scrollbar for branch list */
  .overflow-y-auto {
    scrollbar-width: thin;
    scrollbar-color: #475569 #1e293b;
  }

  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }

  .overflow-y-auto::-webkit-scrollbar-track {
    background: #1e293b;
    border-radius: 3px;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb {
    background-color: #475569;
    border-radius: 3px;
  }
</style>
