<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Alert, AlertTitle, AlertDescription } from './ui/alert';
  import { GitHubService } from '../../services/GitHubService';

  export let projectId: string;
  export let gitHubUsername: string;
  export let repoName: string;
  export let branch: string;
  export let token: string;

  let repoExists: boolean = false;
  let isPrivate: boolean = false;
  let commitCount: number = 0;
  let latestCommit: string = '';

  onMount(async () => {
    try {
      const githubService = new GitHubService(token);
      repoExists = await githubService.repoExists(gitHubUsername, repoName);
      if (repoExists) {
        isPrivate =
          (await githubService.listRepos()).find((r) => r.name === repoName)?.private ?? false;
        commitCount = await githubService.getCommitCount(gitHubUsername, repoName, branch);
        const commits = await githubService.request(
          'GET',
          `/repos/${gitHubUsername}/${repoName}/commits?per_page=1`
        );
        latestCommit = commits[0]?.commit?.committer?.date || '';
      }
    } catch (error) {
      console.log('Error fetching repo details:', error);
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
      <span class="font-mono text-green-400">{repoExists ? 'Exists' : 'Will be created'}</span>
      <span class="text-slate-400">Visibility:</span>
      <span class="font-mono">{repoExists ? (isPrivate ? 'Private' : 'Public') : 'N/A'}</span>
      <span class="text-slate-400">Commits:</span>
      <span class="font-mono">{repoExists ? commitCount : '0'}</span>
      <span class="text-slate-400">Latest Commit:</span>
      <span class="font-mono">
        {latestCommit ? new Date(latestCommit).toLocaleDateString() : 'N/A'}
      </span>
    </div>
    <button
      class="col-span-2 text-sm mt-2 border border-slate-700 rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors"
      on:click|stopPropagation={openGitHub}
    >
      Open GitHub repository
    </button>
  </AlertDescription>
</Alert>
