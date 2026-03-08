<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import CommitCard from './CommitCard.svelte';
  import { CommitsService } from '../services/CommitsService';
  import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
  import { createLogger } from '$lib/utils/logger';
  import type { CommitListItem, CommitsPagination, CommitsFilter } from '../types/commits';
  import {
    Search,
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertCircle,
    ExternalLink,
  } from 'lucide-svelte';

  const logger = createLogger('CommitsModal');
  const dispatch = createEventDispatcher();

  export let githubToken: string;
  export let repoOwner: string;
  export let repoName: string;
  export let branch: string;
  export let show: boolean;

  let commits: CommitListItem[] = [];
  let filteredCommits: CommitListItem[] = [];
  let isLoading = false;
  let error: string | null = null;
  let searchQuery = '';
  let pagination: CommitsPagination = {
    page: 1,
    perPage: 30,
    hasMore: false,
  };

  const commitsService = new CommitsService();
  let githubService: UnifiedGitHubService;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    if (show) {
      await initializeService();
      await loadCommits();
    }
  });

  async function initializeService() {
    try {
      // Get authentication method
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      if (authMethod === 'github_app') {
        githubService = new UnifiedGitHubService({ type: 'github_app' });
      } else {
        githubService = new UnifiedGitHubService(githubToken);
      }
    } catch (err) {
      logger.error('Error initializing GitHub service:', err);
      error = 'Failed to initialize GitHub service';
    }
  }

  async function loadCommits() {
    if (!githubService) {
      await initializeService();
    }

    if (!githubService) {
      error = 'GitHub service not available';
      return;
    }

    isLoading = true;
    error = null;

    try {
      logger.info('Loading commits', { page: pagination.page });

      const result = await commitsService.fetchCommits(
        {
          owner: repoOwner,
          repo: repoName,
          branch,
          token: githubToken,
        },
        pagination,
        githubService
      );

      commits = result.commits;
      pagination.hasMore = result.hasMore;

      // Apply search filter
      applyFilter();

      logger.info('Successfully loaded commits', { count: commits.length });
    } catch (err) {
      logger.error('Error loading commits:', err);
      error = err instanceof Error ? err.message : 'Failed to load commits';
    } finally {
      isLoading = false;
    }
  }

  function applyFilter() {
    const filter: CommitsFilter = {
      searchQuery,
    };

    filteredCommits = commitsService.filterCommits(commits, filter);
  }

  function handleSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    searchQuery = target.value;

    // Debounce search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(() => {
      applyFilter();
    }, 300);
  }

  async function handlePreviousPage() {
    if (pagination.page > 1) {
      pagination.page--;
      await loadCommits();
    }
  }

  async function handleNextPage() {
    if (pagination.hasMore) {
      pagination.page++;
      await loadCommits();
    }
  }

  function handleClose() {
    dispatch('close');
  }

  $: totalCommits = commits.length;
  $: displayCommits = filteredCommits.length > 0 || searchQuery ? filteredCommits : commits;
</script>

<Modal {show} title="Commits History" on:close={handleClose}>
  <div class="commits-modal">
    <!-- Header -->
    <div class="border-b border-slate-700 pb-4 mb-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-slate-400">
          {repoOwner}/{repoName} - {branch}
        </p>
        <div class="text-sm text-slate-400">
          {totalCommits} commit{totalCommits === 1 ? '' : 's'}
        </div>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="mb-4">
      <div class="relative">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={16} class="text-slate-400" />
        </div>
        <input
          type="search"
          placeholder="Search commits by message or author..."
          class="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={searchQuery}
          on:input={handleSearchInput}
        />
      </div>
    </div>

    <!-- Commits List -->
    <div class="commits-list min-h-[200px] max-h-[300px] overflow-y-auto mb-4">
      {#if isLoading}
        <div class="flex flex-col items-center justify-center py-12">
          <Loader2 size={32} class="text-blue-400 animate-spin mb-2" />
          <p class="text-slate-400">Loading commits...</p>
        </div>
      {:else if error}
        <div class="flex flex-col items-center justify-center py-12">
          <AlertCircle size={32} class="text-red-400 mb-2" />
          <p class="text-red-400 mb-2">{error}</p>
          <Button on:click={loadCommits} variant="outline" size="sm">Retry</Button>
        </div>
      {:else if displayCommits.length === 0}
        <div class="flex flex-col items-center justify-center py-12">
          <Search size={32} class="text-slate-400 mb-2" />
          <p class="text-slate-400">
            {searchQuery ? 'No commits found matching your search' : 'No commits found'}
          </p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each displayCommits as commit (commit.sha)}
            <CommitCard {commit} />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Pagination Controls -->
    <div class="border-t border-slate-700 pt-4">
      <div class="flex items-center justify-between">
        <Button
          on:click={handlePreviousPage}
          variant="outline"
          size="sm"
          disabled={pagination.page === 1 || isLoading}
        >
          <ChevronLeft size={16} class="mr-1" />
          Previous
        </Button>

        <div class="flex flex-col items-center gap-1">
          <div class="text-sm text-slate-400">
            Page {pagination.page}
            {#if pagination.hasMore}
              <span class="text-slate-500">• More available</span>
            {:else}
              <span class="text-green-400">• End of history</span>
            {/if}
          </div>

          <!-- View on GitHub link -->
          <a
            href="https://github.com/{repoOwner}/{repoName}/commits/{branch}"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            title="View full commit history on GitHub"
          >
            View full history
            <ExternalLink size={12} />
          </a>
        </div>

        <Button
          on:click={handleNextPage}
          variant="outline"
          size="sm"
          disabled={!pagination.hasMore || isLoading}
        >
          Next
          <ChevronRight size={16} class="ml-1" />
        </Button>
      </div>
    </div>
  </div>
</Modal>

<style>
  .commits-modal {
    min-width: 600px;
    max-width: 800px;
  }

  @media (max-width: 640px) {
    .commits-modal {
      min-width: 100%;
    }
  }

  .commits-list::-webkit-scrollbar {
    width: 8px;
  }

  .commits-list::-webkit-scrollbar-track {
    background: rgb(15 23 42);
    border-radius: 4px;
  }

  .commits-list::-webkit-scrollbar-thumb {
    background: rgb(51 65 85);
    border-radius: 4px;
  }

  .commits-list::-webkit-scrollbar-thumb:hover {
    background: rgb(71 85 105);
  }
</style>
