<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import IssueCard from './IssueCard.svelte';
  import NewIssueForm from './NewIssueForm.svelte';
  import { issuesStore } from '$lib/stores/issuesStore';
  export let githubToken: string;
  export let repoOwner: string;
  export let repoName: string;
  export let show: boolean;

  const dispatch = createEventDispatcher();

  let showNewIssueForm = false;
  let selectedState: 'open' | 'closed' | 'all' = 'open';
  let modalElement: HTMLDivElement;
  let showCloseConfirmation = false;
  let issueToClose: number | null = null;
  let isCreatingIssue = false;
  let isClosingIssue = false;

  // Use issues store for reactive data
  $: issuesData = issuesStore.getIssuesForRepo(repoOwner, repoName, selectedState);
  $: ({ issues, isLoading, error } = $issuesData);
  $: isRefreshingStore = issuesStore.getLoadingState(repoOwner, repoName, selectedState);
  $: isRefreshing = $isRefreshingStore;

  onMount(async () => {
    if (show && repoOwner && repoName && githubToken) {
      await loadIssues();
    }
  });

  $: if (show && repoOwner && repoName && githubToken) {
    loadIssues();
  }

  // Focus management for accessibility
  $: if (show && modalElement) {
    // Focus the modal when it opens
    setTimeout(() => {
      modalElement.focus();
    }, 100);
  }

  async function loadIssues(forceRefresh: boolean = false) {
    if (!githubToken || !repoOwner || !repoName) return;

    try {
      await issuesStore.loadIssues(repoOwner, repoName, githubToken, selectedState, forceRefresh);
    } catch (err) {
      console.error('Error loading issues:', err);
    }
  }

  async function handleCreateIssue(event: CustomEvent) {
    const { title, body } = event.detail;
    if (!githubToken || !repoOwner || !repoName) return;

    try {
      await issuesStore.createIssue(repoOwner, repoName, githubToken, { title, body });
      
      // Reset form state
      isCreatingIssue = false;
      showNewIssueForm = false;
      
      // Force refresh the issue list to ensure the new issue appears
      await loadIssues(true);
    } catch (err) {
      console.error('Error creating issue:', err);
      isCreatingIssue = false;
    }
  }

  function requestCloseIssue(issueNumber: number) {
    issueToClose = issueNumber;
    showCloseConfirmation = true;
  }

  async function confirmCloseIssue() {
    if (!githubToken || !repoOwner || !repoName || issueToClose === null) return;

    try {
      console.log('Closing issue:', issueToClose);
      isClosingIssue = true;
      await issuesStore.updateIssue(repoOwner, repoName, githubToken, issueToClose, {
        state: 'closed',
      });
      showCloseConfirmation = false;
      issueToClose = null;
      isClosingIssue = false;
    } catch (err) {
      console.error('Error closing issue:', err);
      showCloseConfirmation = false;
      issueToClose = null;
      isClosingIssue = false;
    }
  }

  function cancelCloseIssue() {
    showCloseConfirmation = false;
    issueToClose = null;
  }

  function openIssueInBrowser(url: string) {
    chrome.tabs.create({ url });
  }

  function handleStateChange() {
    // The reactive statement will automatically update when selectedState changes
    // No need to manually load issues
  }

  function handleClose() {
    dispatch('close');
  }

  async function handleRefresh() {
    await loadIssues(true);
  }
</script>

{#if show}
  <!-- Modal Backdrop -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    bind:this={modalElement}
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-1"
    on:click={handleClose}
    on:keydown={(e) => e.key === 'Escape' && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="issues-modal-title"
    aria-describedby="issues-modal-description"
    tabindex="-1"
  >
    <!-- Modal Content -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col"
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="document"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-slate-700">
        <div class="flex items-center gap-3">
          <h2 id="issues-modal-title" class="text-lg font-semibold text-white">Issues</h2>
          <span id="issues-modal-description" class="text-sm text-slate-400 font-mono"
            >{repoOwner}/{repoName}</span
          >
        </div>
        <Button
          variant="ghost"
          size="sm"
          on:click={handleClose}
          class="h-8 w-8 p-0"
          aria-label="Close issues modal"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </Button>
      </div>

      <!-- Controls -->
      <div class="flex items-center justify-between p-4 border-b border-slate-700">
        <div class="flex items-center gap-2">
          <Label for="state-select" class="text-sm text-slate-400">Filter:</Label>
          <select
            id="state-select"
            bind:value={selectedState}
            on:change={handleStateChange}
            class="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Filter issues by state"
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <!-- Refresh Button -->
          <Button
            variant="outline"
            size="sm"
            on:click={handleRefresh}
            disabled={isLoading}
            class="border-slate-600 text-slate-300 hover:bg-slate-700 w-24"
            aria-label="Refresh issues list"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="mr-1 {isRefreshing ? 'animate-spin' : ''}"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
            <span class="truncate">
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </span>
          </Button>

          <!-- New Issue Button -->
          <Button
            size="sm"
            on:click={() => (showNewIssueForm = true)}
            disabled={showNewIssueForm || isCreatingIssue}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="mr-1"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Issue
          </Button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4 relative">
        {#if showNewIssueForm}
          <NewIssueForm
            on:submit={handleCreateIssue}
            on:cancel={() => (showNewIssueForm = false)}
            bind:isCreatingIssue
          />
        {:else if isLoading && issues.length === 0}
          <div class="flex items-center justify-center h-32" role="status" aria-live="polite">
            <div class="text-slate-400">Loading issues...</div>
          </div>
        {:else if error}
          <div
            class="text-red-400 p-3 mb-4 border border-red-700 rounded bg-red-900/20"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </div>
        {:else if issues.length === 0}
          <div class="text-center py-8 text-slate-400" role="status">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
              class="mx-auto mb-4 text-slate-600"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
            <p class="mb-4">No {selectedState} issues found.</p>
            {#if selectedState === 'open'}
              <Button variant="outline" size="sm" on:click={() => (showNewIssueForm = true)}>
                Create your first issue
              </Button>
            {/if}
          </div>
        {:else}
          <div class="space-y-3" role="list" aria-label="Issues list">
            {#each issues as issue (issue.number)}
              <div role="listitem">
                <IssueCard
                  {issue}
                  on:close={() => requestCloseIssue(issue.number)}
                  on:open={() => openIssueInBrowser(issue.html_url)}
                />
              </div>
            {/each}
          </div>
        {/if}

        <!-- Refresh Loading Overlay -->
        {#if isRefreshing}
          <div
            class="absolute inset-0 bg-black/30 flex items-center justify-center backdrop-blur-sm"
            role="status"
            aria-live="polite"
            aria-label="Refreshing issues"
          >
            <div
              class="bg-slate-800 border border-slate-600 rounded-lg p-4 flex items-center gap-3 shadow-lg"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="animate-spin text-blue-400"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                <path d="M3 21v-5h5"></path>
              </svg>
              <span class="text-white font-medium">Refreshing issues...</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Close Issue Confirmation Modal -->
{#if showCloseConfirmation}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4"
    on:click={cancelCloseIssue}
    on:keydown={(e) => e.key === 'Escape' && cancelCloseIssue()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="close-confirmation-title"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-sm w-full"
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="document"
    >
      <h3 id="close-confirmation-title" class="text-lg font-semibold text-white mb-2">
        Close Issue?
      </h3>
      <p class="text-slate-300 mb-6">
        Are you sure you want to close this issue? This action can be undone later.
      </p>
      <div class="flex gap-3 justify-end">
        <Button variant="outline" size="sm" on:click={cancelCloseIssue}>Cancel</Button>
        <Button
          variant="destructive"
          size="sm"
          on:click={confirmCloseIssue}
          disabled={isClosingIssue}
        >
          {isClosingIssue ? 'Closing...' : 'Close Issue'}
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Ensure modal appears above other content */
  :global(body:has(.fixed.inset-0)) {
    overflow: hidden;
  }
</style>
