<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import UpgradeModal from './UpgradeModal.svelte';
  import { onMount } from 'svelte';
  import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
  import { PREMIUM_FEATURES } from '$lib/constants/premiumFeatures';

  export let show = false;
  export let owner = '';
  export let repo = '';
  export let token = ''; // Optional - not required for GitHub App authentication
  export let onBranchSelected: (branch: string) => void;
  export let onCancel: () => void;

  let branches: Array<{ name: string; isDefault: boolean }> = [];
  let selectedBranch = '';
  let isLoading = true;
  let error: string | null = null;
  let hasProAccess = false;
  let showUpgrade = false;

  onMount(async () => {
    if (show && owner && repo) {
      await Promise.all([loadBranches(), checkProAccess()]);
    }
  });

  $: if (show && owner && repo && branches.length === 0) {
    Promise.all([loadBranches(), checkProAccess()]);
  }

  async function checkProAccess() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_PREMIUM_FEATURE',
        feature: 'branchSelector',
      });
      hasProAccess = response.hasAccess;
    } catch (error) {
      console.warn('Failed to check premium status, allowing access:', error);
      hasProAccess = true; // Default to allowing access if check fails
    }
  }

  async function loadBranches() {
    isLoading = true;
    error = null;

    try {
      // Create GitHub service with authentication method detection
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      let githubService: UnifiedGitHubService;
      if (authMethod === 'github_app') {
        githubService = new UnifiedGitHubService({ type: 'github_app' });
      } else {
        githubService = new UnifiedGitHubService(token);
      }
      const rawBranches = await githubService.listBranches(owner, repo);

      // Add isDefault property to branches
      // Set main or master as default, otherwise use the first branch
      const defaultBranchName =
        rawBranches.find((b) => b.name === 'main')?.name ||
        rawBranches.find((b) => b.name === 'master')?.name ||
        rawBranches[0]?.name;

      branches = rawBranches.map((branch) => ({
        name: branch.name,
        isDefault: branch.name === defaultBranchName,
      }));

      // Set the default branch as selected
      const defaultBranch = branches.find((b) => b.isDefault);
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

  function handleBranchClick(branch: { name: string; isDefault: boolean }) {
    if (branch.isDefault || hasProAccess) {
      selectedBranch = branch.name;
    } else {
      // Show upgrade prompt for non-default branches
      showUpgradeModal();
    }
  }

  function showUpgradeModal() {
    showUpgrade = true;
  }

  function isValidSelection(branch: { name: string; isDefault: boolean }): boolean {
    return branch.isDefault || hasProAccess;
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
          {@const isDisabled = !isValidSelection(branch)}
          {@const isSelected = selectedBranch === branch.name}
          <div
            class="flex items-center p-2 rounded border relative {isSelected
              ? 'border-blue-500 bg-blue-900/20'
              : isDisabled
                ? 'border-slate-600 bg-slate-800/30 opacity-60 cursor-not-allowed'
                : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer'}"
            on:click={() => handleBranchClick(branch)}
            on:keydown={(e) => e.key === 'Enter' && handleBranchClick(branch)}
            role="button"
            tabindex="0"
          >
            <input
              type="radio"
              name="branch"
              value={branch.name}
              checked={isSelected}
              disabled={isDisabled}
              class="mr-2"
            />
            <div class="flex-1">
              <div class="text-sm font-medium flex items-center gap-2">
                {branch.name}
                {#if isDisabled}
                  <div class="flex items-center gap-1">
                    <svg class="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </div>
                {/if}
              </div>
              {#if branch.isDefault}
                <div class="text-xs text-green-400">Default branch</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if !hasProAccess && branches.some((b) => !b.isDefault)}
        <div
          class="text-amber-400 text-xs p-2 mt-3 border border-amber-900/50 bg-amber-900/10 rounded flex items-center gap-2 cursor-pointer hover:bg-amber-900/20 transition-colors"
          on:click={showUpgradeModal}
          on:keydown={(e) => e.key === 'Enter' && showUpgradeModal()}
          role="button"
          tabindex="0"
        >
          <svg class="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clip-rule="evenodd"
            />
          </svg>
          <span>Upgrade to Pro to access non-default branches</span>
        </div>
      {/if}

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
          disabled={!selectedBranch ||
            (() => {
              const selectedBranchObj = branches.find((b) => b.name === selectedBranch);
              return !selectedBranchObj || !isValidSelection(selectedBranchObj);
            })()}
        >
          Import Branch
        </Button>
      </div>
    {/if}
  </div>
</Modal>

<UpgradeModal
  bind:show={showUpgrade}
  feature="branchSelector"
  reason="Choose specific branches when importing private repositories for better organization."
  features={PREMIUM_FEATURES}
/>

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
