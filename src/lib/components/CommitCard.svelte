<script lang="ts">
  import { User, Copy, Check } from 'lucide-svelte';
  import type { CommitListItem } from '../types/commits';

  export let commit: CommitListItem;

  let copied = false;
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30)
      return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`;
    if (diffDays < 365)
      return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) === 1 ? '' : 's'} ago`;
    return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) === 1 ? '' : 's'} ago`;
  }

  function truncateMessage(message: string, maxLength: number = 72): string {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  }

  function openCommit(event: MouseEvent | KeyboardEvent) {
    if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
    chrome.tabs.create({ url: commit.htmlUrl });
  }

  async function copySHA(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(commit.sha);
      copied = true;

      // Clear existing timeout if any
      if (copyTimeout) {
        clearTimeout(copyTimeout);
      }

      // Reset after 2 seconds
      copyTimeout = setTimeout(() => {
        copied = false;
        copyTimeout = null;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy SHA:', error);
    }
  }
</script>

<div
  role="button"
  aria-label="Commit {commit.shortSha} by {commit.author.name}"
  tabindex="0"
  class="border border-slate-700 rounded-md p-3 bg-slate-800/50 hover:bg-slate-800/70 transition-colors cursor-pointer"
  on:click={openCommit}
  on:keydown={openCommit}
>
  <div class="flex items-start gap-3">
    <!-- Author Avatar -->
    <div class="flex-shrink-0 w-8 h-8">
      {#if commit.author.avatar_url}
        <img
          src={commit.author.avatar_url}
          alt="{commit.author.name} avatar"
          class="w-8 h-8 rounded-full"
        />
      {:else}
        <div
          class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400"
        >
          <User size={16} />
        </div>
      {/if}
    </div>

    <!-- Commit Info -->
    <div class="flex-1 min-w-0">
      <!-- Commit Message -->
      <p class="text-sm text-white font-medium mb-1 break-words">
        {truncateMessage(commit.message)}
      </p>

      <!-- Author and Date -->
      <div class="text-xs text-slate-400 mb-2">
        <span class="text-slate-300">{commit.author.name}</span>
        committed {formatRelativeTime(commit.date)}
      </div>

      <!-- SHA and Files Changed -->
      <div class="flex items-center gap-3 flex-wrap">
        <!-- SHA with Copy Button -->
        <div class="flex items-center gap-1">
          <code class="text-xs text-blue-400 font-mono">{commit.shortSha}</code>
          <button
            type="button"
            aria-label="Copy SHA to clipboard"
            class="text-slate-400 hover:text-slate-200 transition-colors p-1"
            on:click={copySHA}
            on:keydown={copySHA}
          >
            {#if copied}
              <Check size={14} class="text-green-400" />
            {:else}
              <Copy size={14} />
            {/if}
          </button>
          {#if copied}
            <span class="text-xs text-green-400">Copied!</span>
          {/if}
        </div>

        <!-- Files Changed (if > 0) -->
        {#if commit.filesChangedCount > 0}
          <span class="text-xs text-slate-400">
            {commit.filesChangedCount} file{commit.filesChangedCount === 1 ? '' : 's'} changed
          </span>
        {/if}
      </div>
    </div>
  </div>
</div>
