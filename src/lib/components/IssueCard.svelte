<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';

  export let issue: {
    number: number;
    title: string;
    html_url: string;
    user: { login: string; avatar_url: string };
    created_at: string;
    updated_at: string;
    comments: number;
    state: 'open' | 'closed';
    labels: Array<{ name: string; color: string }>;
  };

  const dispatch = createEventDispatcher();

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }

  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }
</script>

<div
  class="border border-slate-700 rounded-md p-3 bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
>
  <div class="flex justify-between items-start">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-2">
        <div class="flex-shrink-0">
          {#if issue.state === 'open'}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="text-green-400"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
          {:else}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="text-purple-400"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22,4 12,14.01 9,11.01"></polyline>
            </svg>
          {/if}
        </div>
        <h3 class="font-medium text-sm text-white truncate">
          #{issue.number}: {issue.title}
        </h3>
      </div>

      <div class="text-xs text-slate-400 mb-2">
        Opened by
        <span class="text-slate-300">{issue.user.login}</span>
        <span class="mx-1">•</span>
        <span title={formatDate(issue.created_at)}>{formatRelativeTime(issue.created_at)}</span>
        {#if issue.comments > 0}
          <span class="mx-1">•</span>
          <span class="flex items-center gap-1 inline-flex">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            {issue.comments}
          </span>
        {/if}
      </div>

      {#if issue.labels && issue.labels.length > 0}
        <div class="flex flex-wrap gap-1 mb-2">
          {#each issue.labels.slice(0, 3) as label}
            <span
              class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
              style="background-color: #{label.color};"
            >
              {label.name}
            </span>
          {/each}
          {#if issue.labels.length > 3}
            <span class="text-xs text-slate-400">+{issue.labels.length - 3} more</span>
          {/if}
        </div>
      {/if}
    </div>

    <div class="flex space-x-1 ml-2">
      <Button
        size="sm"
        variant="ghost"
        class="h-7 w-7 p-0 text-slate-400 hover:text-slate-300"
        title="Open in browser"
        on:click={() => dispatch('open')}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15,3 21,3 21,9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </Button>

      {#if issue.state === 'open'}
        <Button
          size="sm"
          variant="ghost"
          class="h-7 w-7 p-0 text-red-400 hover:text-red-300"
          title="Close issue"
          on:click={() => dispatch('close')}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </Button>
      {/if}
    </div>
  </div>
</div>
