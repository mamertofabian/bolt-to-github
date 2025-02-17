<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Alert, AlertTitle, AlertDescription } from './ui/alert';
  import { GitLabService } from '../../services/GitLabService';

  export let projectId: string;
  export let gitLabUsername: string;
  export let repoName: string;
  export let branch: string;
  export let token: string;

  let isLoading = {
    repoStatus: true,
    visibility: true,
    commits: true,
    latestCommit: true,
  };

  let repoExists: boolean | null = null;
  let isPrivate: boolean | null = null;
  let latestCommit: {
    date: string;
    message: string;
  } | null = null;

  export const getProjectStatus = async () => {
    try {
      const gitlabService = new GitLabService(token);

      // Get repo info
      const repoInfo = await gitlabService.getRepoInfo(gitLabUsername, repoName);
      repoExists = repoInfo.exists;
      isLoading.repoStatus = false;

      if (repoExists) {
        // Get visibility
        isPrivate = repoInfo.visibility === 'private';
        isLoading.visibility = false;

        // Get latest commit
        const commits = await gitlabService.request(
          'GET',
          `/projects/${encodeURIComponent(`${gitLabUsername}/${repoName}`)}/repository/commits?per_page=1`
        );
        if (commits[0]?.commit) {
          latestCommit = {
            date: commits[0].commit.committer.date,
            message:
              commits[0].commit.message.split('\n')[0].slice(0, 50) +
              (commits[0].commit.message.length > 50 ? '...' : ''),
          };
        }
        isLoading.latestCommit = false;
      } else {
        isLoading.visibility = false;
        isLoading.commits = false;
        isLoading.latestCommit = false;
      }
    } catch (error) {
      console.log('Error fetching repo details:', error);
      // Reset loading states on error
      Object.keys(isLoading).forEach((key) => (isLoading[key as keyof typeof isLoading] = false));
    }
  };

  onMount(async () => {
    await getProjectStatus();
  });

  const dispatch = createEventDispatcher();

  function openGitLab(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    chrome.tabs.create({ url: `https://gitlab.com/${gitLabUsername}/${repoName}/-/tree/${branch}` });
  }
</script>

<Alert class="border-green-900 bg-green-950">
  <AlertTitle>Currently loaded project:</AlertTitle>
  <AlertDescription class="text-slate-300">
    <div
      class="mt-2 grid grid-cols-[auto_1fr] gap-x-2 bg-slate-900/50 p-2 rounded-sm cursor-pointer hover:bg-slate-900/70 transition-colors group"
      on:click={() => dispatch('switchTab', 'settings')}
      on:keydown={(e) => e.key === 'Enter' && dispatch('switchTab', 'settings')}
      role="button"
      tabindex={0}
    >
      <span class="text-slate-400">Project ID:</span>
      <span class="font-mono">{projectId}</span>
      <span class="text-slate-400">Repository:</span>
      <span class="font-mono">{repoName}</span>
      <span class="text-slate-400">Branch:</span>
      <span class="font-mono">{branch}</span>
      <span class="text-slate-400">Status:</span>
      <span class="font-mono">
        {#if isLoading.repoStatus}
          <span class="text-slate-500">Loading...</span>
        {:else}
          <span class="text-green-400">{repoExists ? 'Exists' : 'Will be created'}</span>
        {/if}
      </span>
      <span class="text-slate-400">Visibility:</span>
      <span class="font-mono">
        {#if isLoading.visibility}
          <span class="text-slate-500">Loading...</span>
        {:else}
          {repoExists ? (isPrivate ? 'Private' : 'Public') : 'N/A'}
        {/if}
      </span>
      <span class="text-slate-400">Latest Commit:</span>
      <span class="font-mono">
        {#if isLoading.latestCommit}
          <span class="text-slate-500">Loading...</span>
        {:else if latestCommit}
          <div class="text-xs text-slate-400 mt-1">
            {new Date(latestCommit.date).toLocaleString()}
          </div>
          <div class="text-xs text-slate-400 mt-1">{latestCommit.message}</div>
        {:else}
          N/A
        {/if}
      </span>
    </div>
    <button
      class="col-span-2 text-sm mt-2 border border-slate-700 rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors"
      on:click|stopPropagation={openGitLab}
      disabled={isLoading.repoStatus || !repoExists}
    >
      {isLoading.repoStatus
        ? 'Loading...'
        : repoExists
          ? 'Open GitLab repository'
          : 'Repo to be created'}
    </button>
  </AlertDescription>
</Alert>
