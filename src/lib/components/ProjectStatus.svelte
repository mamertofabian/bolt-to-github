<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Alert, AlertTitle, AlertDescription } from './ui/alert';
  import { GitHubService } from '../../services/GitHubService';

  export let projectId: string;
  export let gitHubUsername: string;
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
  let commitCount: number | null = null;
  let latestCommit: {
    date: string;
    message: string;
  } | null = null;

  onMount(async () => {
    try {
      const githubService = new GitHubService(token);

      // Check repo existence
      repoExists = await githubService.repoExists(gitHubUsername, repoName);
      isLoading.repoStatus = false;

      if (repoExists) {
        // Get visibility
        const repos = await githubService.listRepos();
        isPrivate = repos.find((r) => r.name === repoName)?.private ?? null;
        isLoading.visibility = false;

        // Get commit count
        commitCount = await githubService.getCommitCount(gitHubUsername, repoName, branch);
        isLoading.commits = false;

        // Get latest commit
        const commits = await githubService.request(
          'GET',
          `/repos/${gitHubUsername}/${repoName}/commits?per_page=1`
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
  });

  const dispatch = createEventDispatcher<{
    switchTab: string;
  }>();

  function openGitHub(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    chrome.tabs.create({ url: `https://github.com/${gitHubUsername}/${repoName}/tree/${branch}` });
  }
</script>

<Alert class="border-green-900 bg-green-950">
  <AlertTitle>Ready to Use</AlertTitle>
  <AlertDescription class="text-slate-300">
    Your GitHub configuration is set up and ready to go!
    <div
      class="mt-2 grid grid-cols-[auto_1fr] gap-x-2 bg-slate-900/50 p-2 rounded-sm cursor-pointer hover:bg-slate-900/70 transition-colors group"
      on:click={() => dispatch('switchTab', 'settings')}
      on:keydown={(e) => e.key === 'Enter' && dispatch('switchTab', 'settings')}
      role="button"
      tabindex={0}
    >
      <div class="col-span-2 text-sm text-slate-400 mb-1">Currently loaded project:</div>
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
      <span class="text-slate-400">Commits:</span>
      <span class="font-mono">
        {#if isLoading.commits}
          <span class="text-slate-500">Loading...</span>
        {:else}
          {repoExists ? commitCount : 'N/A'}
        {/if}
      </span>
      <span class="text-slate-400">Latest Commit:</span>
      <span class="font-mono">
        {#if isLoading.latestCommit}
          <span class="text-slate-500">Loading...</span>
        {:else if latestCommit}
          <div>{new Date(latestCommit.date).toLocaleString()}</div>
          <div class="text-xs text-slate-400 mt-1">{latestCommit.message}</div>
        {:else}
          N/A
        {/if}
      </span>
    </div>
    <button
      class="col-span-2 text-sm mt-2 border border-slate-700 rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors"
      on:click|stopPropagation={openGitHub}
      disabled={isLoading.repoStatus || !repoExists}
    >
      {isLoading.repoStatus
        ? 'Loading...'
        : repoExists
          ? 'Open GitHub repository'
          : 'Repo to be created'}
    </button>
  </AlertDescription>
</Alert>
