<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import { RotateCcw, Upload } from 'lucide-svelte';
  import FileChanges from '../../components/FileChanges.svelte';
  import type { FileChange } from '../../services/FilePreviewService';
  import {
    countChanges,
    hasActualChanges,
    generateNoChangesConfirmationMessage,
    getTotalActualChanges,
    shouldShowPushConfirmation,
  } from './file-changes-modal';

  export let show = false;
  export let fileChanges: Map<string, FileChange> | null = null;

  let isRefreshing = false;
  let refreshError: string | null = null;
  let showConfirmationDialog = false;
  let confirmationMessage = '';
  let pendingPushAction: (() => void) | null = null;

  // Count changes for confirmation logic
  $: changeCounts = fileChanges
    ? countChanges(fileChanges)
    : { added: 0, modified: 0, deleted: 0, unchanged: 0, total: 0 };
  $: hasChanges = hasActualChanges(changeCounts);
  $: totalChanges = getTotalActualChanges(changeCounts);

  function handleClose() {
    show = false;
  }

  async function pushToGitHub(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();

    // Check if there are actual changes
    if (shouldShowPushConfirmation(hasChanges)) {
      // Show confirmation dialog for no changes
      confirmationMessage = generateNoChangesConfirmationMessage(changeCounts.unchanged);
      pendingPushAction = () => {
        // Send a message to trigger the GitHub push action
        chrome.runtime.sendMessage({ action: 'PUSH_TO_GITHUB' });
        show = false; // Close the modal after initiating the push
      };
      showConfirmationDialog = true;
      return;
    }

    // Direct push for changes
    chrome.runtime.sendMessage({ action: 'PUSH_TO_GITHUB' });
    show = false; // Close the modal after initiating the push
  }

  function handleConfirmPush() {
    if (pendingPushAction) {
      pendingPushAction();
      pendingPushAction = null;
    }
  }

  function handleCancelPush() {
    pendingPushAction = null;
  }

  async function refreshFileChanges(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();

    if (isRefreshing) return; // Prevent multiple concurrent refreshes

    isRefreshing = true;
    refreshError = null;

    try {
      // Send message to content script to trigger file changes refresh
      // This will use the existing rate-limited GitHubComparisonService
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        // Send message to content script to refresh file changes
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'REFRESH_FILE_CHANGES',
        });

        if (!response.success) {
          throw new Error(response.error || 'Refresh request failed');
        }

        // The refreshed file changes will be sent back via the normal
        // OPEN_FILE_CHANGES message, which will update the modal
        // So we don't need to manually update fileChanges here
      } else {
        throw new Error('No active tab found');
      }
    } catch (error) {
      console.error('Error refreshing file changes:', error);
      refreshError = error instanceof Error ? error.message : 'Failed to refresh file changes';
    } finally {
      isRefreshing = false;
    }
  }
</script>

<Modal {show} title="File Changes">
  <div class="space-y-3 h-[400px]">
    <!-- Header Section -->
    <div class="space-y-3">
      <!-- Title and Summary -->
      <div class="space-y-1">
        <h3 class="text-base font-medium text-slate-200">File Changes</h3>
        {#if fileChanges}
          <p class="text-sm text-slate-400 leading-relaxed">
            {#if hasChanges}
              {changeCounts.added > 0 ? `${changeCounts.added} added` : ''}
              {changeCounts.modified > 0
                ? `${changeCounts.added > 0 ? ', ' : ''}${changeCounts.modified} modified`
                : ''}
              {changeCounts.deleted > 0
                ? `${changeCounts.added > 0 || changeCounts.modified > 0 ? ', ' : ''}${changeCounts.deleted} deleted`
                : ''}
              {changeCounts.unchanged > 0 ? ` • ${changeCounts.unchanged} unchanged` : ''}
            {:else}
              All {changeCounts.unchanged} files are up to date
            {/if}
          </p>
        {:else}
          <p class="text-sm text-slate-400">Analyzing project files...</p>
        {/if}
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          class="border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs py-1.5 h-8 flex items-center gap-1.5"
          on:click={refreshFileChanges}
          on:keydown={(e) => e.key === 'Enter' && refreshFileChanges(e)}
          disabled={isRefreshing}
          title="Refresh file changes (compares with GitHub)"
        >
          <RotateCcw size={14} class={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
        <Button
          variant="default"
          size="sm"
          class="bg-blue-600 hover:bg-blue-700 text-xs py-1.5 h-8 flex items-center gap-1.5 {!hasChanges
            ? 'opacity-50'
            : ''}"
          on:click={pushToGitHub}
          on:keydown={(e) => e.key === 'Enter' && pushToGitHub(e)}
          disabled={isRefreshing}
          title={hasChanges
            ? `Push ${totalChanges} changes to GitHub`
            : 'No changes to push (will show confirmation)'}
        >
          <Upload size={14} />
          {#if hasChanges}
            Push ({totalChanges})
          {:else}
            Push (No changes)
          {/if}
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs py-1.5 h-8"
          on:click={handleClose}
        >
          Close
        </Button>
      </div>

      <!-- Separator -->
      <div class="border-t border-slate-700"></div>
    </div>
    {#if refreshError}
      <div class="bg-red-500/10 border border-red-500/30 rounded-md p-3 mb-2">
        <p class="text-red-400 text-xs">Refresh failed: {refreshError}</p>
        <p class="text-red-300/60 text-xs mt-1">
          This may be due to rate limiting. Please try again in a few moments.
        </p>
      </div>
    {/if}

    {#if fileChanges}
      <div class="h-[310px] overflow-y-auto rounded-md">
        <FileChanges changes={fileChanges} />
      </div>
    {:else}
      <div class="flex items-center justify-center h-[310px] bg-slate-800/50 rounded-md">
        <p class="text-slate-400 text-sm">No file changes to display</p>
      </div>
    {/if}
  </div>
</Modal>

<!-- Confirmation Dialog -->
<ConfirmationDialog
  bind:show={showConfirmationDialog}
  title="No Changes Detected"
  message={confirmationMessage}
  type="warning"
  confirmText="Push Anyway"
  cancelText="Cancel"
  onConfirm={handleConfirmPush}
  onCancel={handleCancelPush}
/>

<style>
  /* Customize Modal header */
  :global(.fixed > div > .bg-slate-900 > h2) {
    font-size: 1rem !important;
    margin-bottom: 0.5rem;
    color: #94a3b8;
    border-bottom: 1px solid #334155;
    padding-bottom: 0.5rem;
  }

  /* Customize Modal content */
  :global(.fixed > div > .bg-slate-900) {
    padding: 1rem !important;
    background-color: #1e293b;
    max-width: 450px;
    width: 90vw;
  }
</style>
